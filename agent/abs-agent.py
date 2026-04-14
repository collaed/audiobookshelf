#!/usr/bin/env python3
"""
Audiobookshelf LAN Agent — runs on your local network, scans & organizes audiobooks.

Usage:
    python3 abs-agent.py --server http://192.168.1.x:13378 --agent-id home-pc

Configure path mappings in abs-agent.json (created on first run).
"""
import argparse, json, os, sys, time, threading, subprocess, shutil, socket
import urllib.request, urllib.error, urllib.parse

AGENT_VERSION = "1.0.04141543"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "abs-agent.json")
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "abs-agent.log")
BUFFER_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "abs-agent-buffer.json")
POLL_INTERVAL = 15
AUDIO_EXTS = {".mp3", ".m4a", ".m4b", ".flac", ".ogg", ".opus", ".wma", ".aac", ".wav"}

DEFAULT_CONFIG = {
    "_path_mappings": {
        "/audiobooks": "\\\\zeus\\Audiobooks",
        "/incoming": "\\\\zeus\\Downloads\\Audiobooks"
    },
    "_agent_token": ""
}

_start_time = time.time()
_bg_task = {"running": False, "id": None, "cancel": False}
_pending_result = None
_result_lock = threading.Lock()


# ── Logging ──────────────────────────────────────────────────────────────────

def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S") + " " + msg
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
        if os.path.getsize(LOG_FILE) > 50000:
            lines = open(LOG_FILE).readlines()
            open(LOG_FILE, "w").writelines(lines[-200:])
    except: pass


def get_recent_logs(n=10):
    try:
        if os.path.exists(LOG_FILE):
            return [l.rstrip() for l in open(LOG_FILE).readlines()[-n:]]
    except: pass
    return []


# ── Config & path mapping ────────────────────────────────────────────────────

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    json.dump(DEFAULT_CONFIG, open(CONFIG_FILE, "w"), indent=2)
    log(f"[config] Created {CONFIG_FILE} — edit path mappings for your network")
    return dict(DEFAULT_CONFIG)


def map_path(path, config):
    """Server path → local path (e.g. /audiobooks/... → \\\\zeus\\Audiobooks\\...)"""
    for remote, local in config.get("_path_mappings", {}).items():
        if path.startswith(remote):
            mapped = local + path[len(remote):]
            if os.name == "nt":
                mapped = mapped.replace("/", "\\")
            else:
                mapped = mapped.replace("\\", "/")
            return mapped
    return path


def unmap_path(local_path, config):
    """Local path → server path (reverse of map_path)"""
    for remote, local in config.get("_path_mappings", {}).items():
        norm_local = local.replace("\\", "/")
        norm_path = local_path.replace("\\", "/")
        if norm_path.startswith(norm_local):
            return remote + norm_path[len(norm_local):]
    return local_path


# ── Offline buffer ───────────────────────────────────────────────────────────

def buffer_result(task_id, result):
    buf = []
    if os.path.exists(BUFFER_FILE):
        try: buf = json.load(open(BUFFER_FILE))
        except: pass
    buf.append({"task_id": task_id, "result": result, "time": time.strftime("%Y-%m-%d %H:%M:%S")})
    json.dump(buf, open(BUFFER_FILE, "w"))


def flush_buffer(base_url, headers):
    if not os.path.exists(BUFFER_FILE): return 0
    try: buf = json.load(open(BUFFER_FILE))
    except: return 0
    if not buf: return 0
    flushed, remaining = 0, []
    for item in buf:
        try:
            payload = json.dumps(item["result"]).encode()
            req = urllib.request.Request(
                f"{base_url}/api/agent/heartbeat",
                data=json.dumps({"agentId": "buffer", "result": item["result"]}).encode(),
                headers=headers)
            urllib.request.urlopen(req, timeout=5)
            flushed += 1
        except:
            remaining.append(item)
    json.dump(remaining, open(BUFFER_FILE, "w"))
    if flushed: log(f"[buffer] Flushed {flushed} results")
    return flushed


# ── Task handlers ────────────────────────────────────────────────────────────

def task_scan_incoming(params, config):
    """Walk incoming folder for audiobook files, parse metadata from path structure."""
    incoming = params.get("path", "/incoming")
    min_size = params.get("min_size", 1000000)
    mp = map_path(incoming, config)
    if os.name == "nt" and mp.startswith("//"):
        mp = mp.replace("/", os.sep)

    log(f"[scan] Path: {incoming} -> {repr(mp)}")
    log(f"[scan] Exists: {os.path.exists(mp)}")

    found = []
    walk_dirs = 0
    for root, dirs, files in os.walk(mp):
        try:
            walk_dirs += 1
            if walk_dirs <= 5:
                log(f"[scan] {root[-60:]} ({len(files)} files)")
            for f in files:
                if os.path.splitext(f)[1].lower() in AUDIO_EXTS:
                    fp = os.path.join(root, f)
                    try: sz = os.path.getsize(fp)
                    except: sz = 0
                    if sz > min_size:
                        nfs = unmap_path(fp, config)
                        parsed = _parse_path(fp, mp)
                        found.append({"path": nfs, "filename": f, "size": sz, "parsed": parsed})
                        log(f"[scan] {f} ({sz / 1048576:.1f} MB)")
        except Exception as e:
            log(f"[scan] Error in {root[-30:]}: {e}")

    log(f"[scan] Done: {len(found)} audio files in {walk_dirs} dirs")
    return {"files": found, "data": {"files": found}}


def _parse_path(filepath, base):
    """Extract author/title/series/sequence from directory structure."""
    rel = os.path.relpath(filepath, base).replace("\\", "/")
    parts = rel.split("/")
    p = {"author": "", "title": "", "series": "", "sequence": ""}

    if len(parts) >= 3:
        # Author/Series/Book N - Title.ext  or  Author/Series/Title.ext
        p["author"] = parts[0]
        p["series"] = parts[1]
        name = os.path.splitext(parts[-1])[0]
        import re
        seq = re.match(r"(?:Book\s*)?#?(\d+[\.\d]*)\s*[-–—:]\s*(.*)", name)
        if seq:
            p["sequence"] = seq.group(1)
            p["title"] = seq.group(2).strip() or name
        else:
            p["title"] = name
    elif len(parts) == 2:
        # Author/Title.ext  or  Author - Title.ext
        p["author"] = parts[0]
        p["title"] = os.path.splitext(parts[1])[0]
    else:
        # Title.ext  or  Author - Title.ext
        name = os.path.splitext(parts[0])[0]
        if " - " in name:
            p["author"], p["title"] = name.split(" - ", 1)
        else:
            p["title"] = name

    return {k: v.strip() for k, v in p.items()}


def task_audio_quality(params, config):
    """Check audiobook quality via ffprobe."""
    paths = params.get("paths", [])
    if params.get("path"):
        paths = [params["path"]]
    data = {}
    for p in paths:
        mp = map_path(p, config)
        if not os.path.isfile(mp):
            data[p] = {"error": "not found"}
            continue
        try:
            out = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json",
                 "-show_format", "-show_streams", "-show_chapters", mp],
                capture_output=True, text=True, timeout=30)
            info = json.loads(out.stdout) if out.stdout.strip() else {}
            fmt = info.get("format", {})
            streams = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
            a = streams[0] if streams else {}
            chapters = info.get("chapters", [])
            data[p] = {
                "duration": float(fmt.get("duration", 0)),
                "bitrate": int(fmt.get("bit_rate", 0)) // 1000,
                "format": fmt.get("format_name", ""),
                "codec": a.get("codec_name", ""),
                "channels": a.get("channels", 0),
                "sample_rate": a.get("sample_rate", ""),
                "size": int(fmt.get("size", 0)),
                "has_chapters": len(chapters) > 0,
                "chapter_count": len(chapters),
            }
            log(f"[quality] {os.path.basename(mp)}: {data[p]['bitrate']}kbps {data[p]['codec']} {data[p]['chapter_count']}ch")
        except Exception as e:
            data[p] = {"error": str(e)}
    return {"checked": len(data), "data": data}


def task_audio_identify(params, config):
    """Read embedded metadata tags from audiobook file."""
    p = params.get("path", "")
    mp = map_path(p, config)
    if not os.path.isfile(mp):
        return {"error": "not found", "path": p}
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", mp],
            capture_output=True, text=True, timeout=15)
        info = json.loads(out.stdout) if out.stdout.strip() else {}
        tags = {k.lower(): v for k, v in info.get("format", {}).get("tags", {}).items()}
        return {
            "path": p,
            "title": tags.get("title", ""),
            "artist": tags.get("artist", tags.get("album_artist", "")),
            "album": tags.get("album", ""),
            "genre": tags.get("genre", ""),
            "date": tags.get("date", ""),
            "comment": tags.get("comment", "")[:200],
            "duration": float(info.get("format", {}).get("duration", 0)),
        }
    except Exception as e:
        return {"error": str(e), "path": p}


def task_move_file(params, config):
    """Move file from source to destination, creating dirs as needed."""
    src = map_path(params.get("source", ""), config)
    dst = map_path(params.get("destination", ""), config)
    if not src or not dst:
        return {"error": "missing source or destination"}
    if not os.path.exists(src):
        return {"error": f"source not found: {src}"}
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(src, dst)
    # Clean up empty parent dirs
    parent = os.path.dirname(src)
    try:
        while parent and os.path.isdir(parent) and not os.listdir(parent):
            os.rmdir(parent)
            parent = os.path.dirname(parent)
    except: pass
    log(f"[move] {os.path.basename(src)} -> {dst}")
    return {"moved": True, "source": params["source"], "destination": params["destination"]}


def task_download_metadata(params, config):
    """Fetch metadata from OpenLibrary by title."""
    title = params.get("title", "")
    if not title:
        return {"error": "no title"}
    url = f"https://openlibrary.org/search.json?title={urllib.parse.quote(title)}&limit=3"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AbsAgent/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        docs = data.get("docs", [])
        results = []
        for doc in docs[:3]:
            results.append({
                "title": doc.get("title"),
                "author": (doc.get("author_name") or [None])[0],
                "year": doc.get("first_publish_year"),
                "isbn": (doc.get("isbn") or [None])[0],
                "cover_id": doc.get("cover_i"),
            })
        return {"query": title, "results": results}
    except Exception as e:
        return {"error": str(e)}


def task_diag(params, config):
    """Diagnostic: system info, path checks, disk space."""
    import platform
    paths_to_check = params.get("paths", list(config.get("_path_mappings", {}).keys()))
    path_info = {}
    for p in paths_to_check:
        mp = map_path(p, config)
        path_info[p] = {
            "mapped": mp,
            "exists": os.path.exists(mp),
            "is_dir": os.path.isdir(mp),
        }
        if os.path.isdir(mp):
            try: path_info[p]["items"] = len(os.listdir(mp))
            except: pass
    return {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "hostname": socket.gethostname(),
        "agent_version": AGENT_VERSION,
        "path_mappings": config.get("_path_mappings", {}),
        "paths": path_info,
        "disk_free": shutil.disk_usage("/").free if hasattr(shutil, "disk_usage") else "?",
        "ffprobe": shutil.which("ffprobe") is not None,
    }


def task_update_agent(params, config):
    """Self-update: server pushes new agent code."""
    code = params.get("code", "")
    path = params.get("path", os.path.abspath(__file__))
    if not code:
        return {"error": "no code"}
    if os.path.exists(path):
        shutil.copy(path, path + ".bak")
    with open(path, "w") as f:
        f.write(code)
    log(f"[update] Agent updated ({len(code)} bytes), restarting...")
    return {"updated": path, "size": len(code), "_restart": True}


# ── Task dispatch ────────────────────────────────────────────────────────────

TASK_HANDLERS = {
    "scan_incoming": task_scan_incoming,
    "scan_incoming_audio": task_scan_incoming,
    "audio_quality": task_audio_quality,
    "check_quality": task_audio_quality,
    "audio_identify": task_audio_identify,
    "identify_book": task_audio_identify,
    "move_file": task_move_file,
    "download_metadata": task_download_metadata,
    "diag": task_diag,
    "update_agent": task_update_agent,
}

BG_TASK_TYPES = {"scan_incoming", "scan_incoming_audio", "download_metadata"}


def run_task(ttype, params, config):
    handler = TASK_HANDLERS.get(ttype)
    if not handler:
        return {"error": f"unknown task: {ttype}"}
    return handler(params, config)


# ── Main loop ────────────────────────────────────────────────────────────────

def main():
    global _pending_result

    parser = argparse.ArgumentParser(description="Audiobookshelf LAN Agent")
    parser.add_argument("--server", default=os.environ.get("ABS_SERVER", "http://localhost:13378"))
    parser.add_argument("--agent-id", default=os.environ.get("AGENT_ID", f"abs-{socket.gethostname().lower()}"))
    parser.add_argument("--incoming-path", default=os.environ.get("INCOMING_PATH", "/incoming"))
    args = parser.parse_args()

    config = load_config()
    base_url = args.server.rstrip("/")
    headers = {"Content-Type": "application/json", "User-Agent": f"AbsAgent/{AGENT_VERSION}"}
    token = config.get("_agent_token", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    log(f"[agent] Audiobookshelf Agent v{AGENT_VERSION}")
    log(f"[agent] id={args.agent_id} server={base_url}")
    log(f"[agent] Path mappings: {json.dumps(config.get('_path_mappings', {}))}")

    consecutive_errors = 0

    def report_result(tid, result):
        try:
            body = json.dumps({
                "agentId": args.agent_id,
                "version": AGENT_VERSION,
                "hostname": socket.gethostname(),
                "result": {"taskId": tid, "type": result.get("_type", ""), "data": result}
            }).encode()
            req = urllib.request.Request(f"{base_url}/api/agent/heartbeat", data=body, headers=headers)
            urllib.request.urlopen(req, timeout=30)
            log(f"[task] Reported: {tid}")
        except Exception as e:
            log(f"[task] Report failed ({tid}): {e}")
            buffer_result(tid, result)

    def run_bg_task(tid, ttype, params):
        _bg_task["running"] = True
        _bg_task["id"] = tid
        _bg_task["cancel"] = False
        log(f"[bg] Starting {ttype} ({tid})")
        t0 = time.time()
        try:
            result = run_task(ttype, params, config)
            result["_type"] = ttype
            log(f"[bg] Done in {time.time() - t0:.0f}s ({tid})")
            report_result(tid, result)
        except Exception as e:
            log(f"[bg] Error: {e}")
            report_result(tid, {"error": str(e), "_type": ttype})
        _bg_task["running"] = False
        _bg_task["id"] = None

    while True:
        try:
            # Status heartbeat
            try:
                import base64
                status = json.dumps({
                    "agent_version": AGENT_VERSION,
                    "uptime": int(time.time() - _start_time),
                    "recent_logs": get_recent_logs(10),
                    "bg_task": _bg_task.get("id"),
                    "consecutive_errors": consecutive_errors,
                })
                encoded = base64.b64encode(status.encode()).decode()
                # Send as heartbeat with no result
                body = json.dumps({
                    "agentId": args.agent_id,
                    "version": AGENT_VERSION,
                    "hostname": socket.gethostname(),
                }).encode()
                req = urllib.request.Request(f"{base_url}/api/agent/heartbeat", data=body, headers=headers)
                resp = urllib.request.urlopen(req, timeout=10)
                resp_data = json.loads(resp.read())
            except Exception as e:
                consecutive_errors += 1
                if consecutive_errors <= 3 or consecutive_errors % 20 == 0:
                    log(f"[offline] {e}")
                time.sleep(min(POLL_INTERVAL * (2 ** min(consecutive_errors, 4)), 300))
                continue

            consecutive_errors = 0
            flush_buffer(base_url, headers)

            task = resp_data.get("task")
            if task:
                tid = task.get("id", f"t_{int(time.time())}")
                ttype = task["type"]
                params = task.get("params", {})

                # Default incoming path
                if ttype in ("scan_incoming", "scan_incoming_audio") and "path" not in params:
                    params["path"] = args.incoming_path

                log(f"[task] Got: {ttype} ({tid})")

                if tid == _bg_task.get("id"):
                    pass  # already running
                elif ttype in BG_TASK_TYPES:
                    if _bg_task["running"]:
                        log(f"[task] Skipping {ttype}, bg task already running")
                    else:
                        threading.Thread(target=run_bg_task, args=(tid, ttype, params), daemon=True).start()
                else:
                    result = run_task(ttype, params, config)
                    result["_type"] = ttype
                    if result.get("_restart"):
                        report_result(tid, result)
                        sys.exit(42)
                    report_result(tid, result)

        except KeyboardInterrupt:
            log("[agent] Interrupted, exiting")
            break
        except Exception as e:
            log(f"[agent] Unexpected error: {e}")
            consecutive_errors += 1

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
