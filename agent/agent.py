#!/usr/bin/env python3
"""Audiobookshelf agent — polls server for tasks, executes them, reports results."""
import argparse, json, os, socket, subprocess, shutil, threading, time, urllib.request, urllib.error

AGENT_VERSION = "1.0.04141500"
BUFFER_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_buffer.json")
POLL_INTERVAL = 15
AUDIO_EXTS = {".mp3", ".m4a", ".m4b", ".flac", ".ogg", ".opus", ".wma", ".aac", ".wav"}

pending_result = None
bg_lock = threading.Lock()
bg_thread = None


def load_buffer():
    if os.path.exists(BUFFER_FILE):
        with open(BUFFER_FILE) as f:
            return json.load(f)
    return []


def save_buffer(buf):
    with open(BUFFER_FILE, "w") as f:
        json.dump(buf, f)


def flush_buffer():
    buf = load_buffer()
    if buf:
        save_buffer([])
        return buf
    return []


# --- Task handlers ---

def task_scan_incoming(params):
    folder = params.get("path", "/incoming")
    files = []
    for root, _, names in os.walk(folder):
        for n in names:
            if os.path.splitext(n)[1].lower() in AUDIO_EXTS:
                files.append(os.path.join(root, n))
    return {"files": files, "count": len(files)}


def task_identify_book(params):
    name = os.path.splitext(os.path.basename(params["file"]))[0]
    parts = name.replace(" - ", "|").replace("_", " ").split("|", 1)
    author = parts[0].strip() if len(parts) > 1 else "Unknown"
    title = parts[1].strip() if len(parts) > 1 else parts[0].strip()
    return {"author": author, "title": title}


def task_check_quality(params):
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", params["file"]]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"error": r.stderr.strip()}
    info = json.loads(r.stdout)
    stream = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), {})
    fmt = info.get("format", {})
    return {
        "codec": stream.get("codec_name"),
        "bitrate": int(fmt.get("bit_rate", 0)),
        "channels": int(stream.get("channels", 0)),
        "duration": float(fmt.get("duration", 0)),
    }


def task_move_file(params):
    src, dst = params["src"], params["dst"]
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(src, dst)
    return {"moved": dst}


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
    "scan_incoming": task_scan_incoming,
    "identify_book": task_identify_book,
    "check_quality": task_check_quality,
    "move_file": task_move_file,
    "download_metadata": task_download_metadata,
}


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
        pending_result = {"taskId": task.get("id"), "type": task["type"], "result": result}


def heartbeat(server, agent_id, result_payload):
    body = json.dumps({
        "agentId": agent_id,
        "version": AGENT_VERSION,
        "hostname": socket.gethostname(),
        "result": result_payload,
    }).encode()
    req = urllib.request.Request(f"{server}/api/agent/heartbeat", data=body,
                                headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main():
    global pending_result, bg_thread
    p = argparse.ArgumentParser()
    p.add_argument("--server", default=os.environ.get("ABS_SERVER", "http://localhost:80"))
    p.add_argument("--agent-id", default=os.environ.get("AGENT_ID", "agent-1"))
    p.add_argument("--incoming-path", default=os.environ.get("INCOMING_PATH", "/incoming"))
    args = p.parse_args()

    print(f"[agent] v{AGENT_VERSION} id={args.agent_id} server={args.server}")

    while True:
        result_payload = None
        with bg_lock:
            if pending_result:
                result_payload = pending_result
                pending_result = None

        # Prepend any buffered results
        buffered = flush_buffer()
        if buffered:
            result_payload = buffered if not result_payload else buffered + [result_payload]

        try:
            resp = heartbeat(args.server, args.agent_id, result_payload)
            task = resp.get("task")
            if task:
                print(f"[agent] Got task: {task['type']}")
                if task["type"] == "scan_incoming":
                    task.setdefault("params", {}).setdefault("path", args.incoming_path)
                    bg_thread = threading.Thread(target=run_task, args=(task,), daemon=True)
                    bg_thread.start()
                else:
                    run_task(task)
        except Exception as e:
            print(f"[agent] Server unreachable: {e}")
            if result_payload:
                buf = load_buffer()
                buf.append(result_payload) if not isinstance(result_payload, list) else buf.extend(result_payload)
                save_buffer(buf)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
