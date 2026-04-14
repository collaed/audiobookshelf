#!/usr/bin/env python3
"""Audiobookshelf agent — polls server for tasks, executes them, reports results.
Compatible with CineCross agent protocol. Can run standalone or alongside CineCross."""
import argparse, json, os, socket, subprocess, shutil, threading, time, urllib.request, urllib.error

AGENT_VERSION = "1.1.04141536"
BUFFER_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_buffer.json")
POLL_INTERVAL = 15
AUDIO_EXTS = {".mp3", ".m4a", ".m4b", ".flac", ".ogg", ".opus", ".wma", ".aac", ".wav"}

pending_result = None
bg_lock = threading.Lock()


def log(msg):
    print(f"{time.strftime('%H:%M:%S')} {msg}")


def load_buffer():
    try:
        if os.path.exists(BUFFER_FILE):
            return json.load(open(BUFFER_FILE))
    except: pass
    return []


def save_buffer(buf):
    json.dump(buf, open(BUFFER_FILE, "w"))


# --- Task handlers ---

def task_scan_incoming_audio(params):
    folder = params.get("path", "/incoming")
    min_size = params.get("min_size", 1000000)
    found = []
    for root, _, names in os.walk(folder):
        for n in names:
            if os.path.splitext(n)[1].lower() in AUDIO_EXTS:
                fp = os.path.join(root, n)
                try: sz = os.path.getsize(fp)
                except: sz = 0
                if sz > min_size:
                    # Parse path structure for metadata hints
                    rel = os.path.relpath(fp, folder).replace("\\", "/")
                    parts = rel.split("/")
                    parsed = {"author": "", "title": "", "series": "", "sequence": ""}
                    if len(parts) >= 3:
                        parsed["author"], parsed["series"] = parts[0], parts[1]
                        parsed["title"] = os.path.splitext(parts[-1])[0]
                    elif len(parts) == 2:
                        parsed["author"] = parts[0]
                        parsed["title"] = os.path.splitext(parts[1])[0]
                    else:
                        name = os.path.splitext(parts[0])[0]
                        if " - " in name:
                            parsed["author"], parsed["title"] = name.split(" - ", 1)
                        else:
                            parsed["title"] = name
                    found.append({"path": fp, "filename": n, "size": sz, "parsed": parsed})
    log(f"[scan] Found {len(found)} audio files in {folder}")
    return {"files": found, "data": {"files": found}}


def task_audio_quality(params):
    paths = params.get("paths", [params.get("file", "")])
    data = {}
    for p in [x for x in paths if x]:
        if not os.path.isfile(p):
            data[p] = {"error": "not found"}
            continue
        try:
            out = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", p],
                capture_output=True, text=True, timeout=30)
            info = json.loads(out.stdout) if out.stdout.strip() else {}
            fmt = info.get("format", {})
            streams = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
            a = streams[0] if streams else {}
            data[p] = {
                "duration": float(fmt.get("duration", 0)),
                "bitrate": int(fmt.get("bit_rate", 0)) // 1000,
                "format": fmt.get("format_name", ""),
                "codec": a.get("codec_name", ""),
                "channels": a.get("channels", 0),
                "has_chapters": len(info.get("chapters", [])) > 0,
                "chapter_count": len(info.get("chapters", [])),
                "size": int(fmt.get("size", 0)),
            }
        except Exception as e:
            data[p] = {"error": str(e)}
    return {"checked": len(data), "data": data}


def task_audio_identify(params):
    p = params.get("path", params.get("file", ""))
    if not os.path.isfile(p):
        return {"error": "not found"}
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", p],
            capture_output=True, text=True, timeout=15)
        info = json.loads(out.stdout) if out.stdout.strip() else {}
        tags = {k.lower(): v for k, v in info.get("format", {}).get("tags", {}).items()}
        return {
            "path": p, "title": tags.get("title", ""), "album": tags.get("album", ""),
            "artist": tags.get("artist", tags.get("album_artist", "")),
            "genre": tags.get("genre", ""), "date": tags.get("date", ""),
            "duration": float(info.get("format", {}).get("duration", 0)),
        }
    except Exception as e:
        return {"error": str(e)}


def task_move_file(params):
    src, dst = params.get("source", params.get("src", "")), params.get("destination", params.get("dst", ""))
    if not src or not dst:
        return {"error": "missing source or destination"}
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(src, dst)
    log(f"[move] {os.path.basename(src)} -> {dst}")
    return {"moved": True, "source": src, "destination": dst}


def task_download_metadata(params):
    title = params.get("title", "")
    url = f"https://openlibrary.org/search.json?title={urllib.request.quote(title)}&limit=1"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        doc = data.get("docs", [{}])[0]
        return {"title": doc.get("title"), "author": doc.get("author_name", [None])[0], "year": doc.get("first_publish_year")}
    except Exception as e:
        return {"error": str(e)}


HANDLERS = {
    "scan_incoming": task_scan_incoming_audio,
    "scan_incoming_audio": task_scan_incoming_audio,
    "check_quality": task_audio_quality,
    "audio_quality": task_audio_quality,
    "identify_book": task_audio_identify,
    "audio_identify": task_audio_identify,
    "move_file": task_move_file,
    "download_metadata": task_download_metadata,
}

BG_TASKS = {"scan_incoming", "scan_incoming_audio"}


def run_task(task):
    global pending_result
    handler = HANDLERS.get(task["type"])
    if not handler:
        result = {"error": f"unknown task type: {task['type']}"}
    else:
        try:
            result = handler(task.get("params", {}))
        except Exception as e:
            result = {"error": str(e)}
    with bg_lock:
        pending_result = {"taskId": task.get("id"), "type": task["type"], "data": result}


def heartbeat(server, agent_id, result_payload):
    body = json.dumps({
        "agentId": agent_id, "version": AGENT_VERSION,
        "hostname": socket.gethostname(), "result": result_payload,
    }).encode()
    req = urllib.request.Request(
        f"{server}/api/agent/heartbeat", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main():
    global pending_result
    p = argparse.ArgumentParser()
    p.add_argument("--server", default=os.environ.get("ABS_SERVER", "http://localhost:80"))
    p.add_argument("--agent-id", default=os.environ.get("AGENT_ID", "abs-agent-1"))
    p.add_argument("--incoming-path", default=os.environ.get("INCOMING_PATH", "/incoming"))
    args = p.parse_args()

    log(f"[agent] v{AGENT_VERSION} id={args.agent_id} server={args.server}")

    while True:
        result_payload = None
        with bg_lock:
            if pending_result:
                result_payload = pending_result
                pending_result = None

        # Flush buffered results
        buffered = load_buffer()
        if buffered:
            save_buffer([])
            if result_payload:
                buffered.append(result_payload)
            result_payload = buffered[0] if len(buffered) == 1 else buffered

        try:
            resp = heartbeat(args.server, args.agent_id, result_payload)
            task = resp.get("task")
            if task:
                log(f"[task] {task['type']} ({task.get('id', '?')})")
                task.setdefault("params", {}).setdefault("path", args.incoming_path)
                if task["type"] in BG_TASKS:
                    threading.Thread(target=run_task, args=(task,), daemon=True).start()
                else:
                    run_task(task)
        except Exception as e:
            log(f"[offline] {e}")
            if result_payload:
                buf = load_buffer()
                (buf.extend(result_payload) if isinstance(result_payload, list) else buf.append(result_payload))
                save_buffer(buf)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
