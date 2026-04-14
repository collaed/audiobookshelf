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


def task_audio_diagnose(params, config):
    """Sample an audiobook file and suggest cleaning profile.

    Takes 3 short samples (start, middle, end), analyzes noise floor,
    dynamic range, and frequency content to recommend light/moderate/heavy.

    Params:
      path: source file (server path)
      sample_duration: seconds per sample (default: 10)
    """
    p = params.get("path", "")
    mp = map_path(p, config)
    if not os.path.isfile(mp):
        return {"error": "file not found", "path": p}

    sample_dur = params.get("sample_duration", 10)

    # Get total duration
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", mp],
            capture_output=True, text=True, timeout=15)
        total_dur = float(json.loads(probe.stdout).get("format", {}).get("duration", 0))
    except:
        return {"error": "cannot read file duration", "path": p}

    if total_dur < 5:
        return {"error": "file too short", "path": p}

    # Sample 3 points: 10% in, 50%, 90%
    offsets = [max(0, total_dur * f) for f in (0.1, 0.5, 0.9)]
    tmp = os.path.join(os.environ.get("TEMP", "/tmp"), "abs_diag")
    os.makedirs(tmp, exist_ok=True)

    noise_floors = []
    dynamic_ranges = []
    high_freq_energies = []

    for i, offset in enumerate(offsets):
        wav = os.path.join(tmp, f"sample_{i}.wav")
        stats_file = os.path.join(tmp, f"stats_{i}.txt")
        try:
            # Extract sample as wav
            subprocess.run(
                ["ffmpeg", "-y", "-ss", str(offset), "-i", mp,
                 "-t", str(sample_dur), "-ac", "1", "-ar", "16000", wav],
                capture_output=True, timeout=30)

            if not os.path.isfile(wav):
                continue

            # Measure noise floor & dynamic range via astats
            r = subprocess.run(
                ["ffmpeg", "-i", wav, "-af", "astats=metadata=1:reset=1,ametadata=print:file=" + stats_file,
                 "-f", "null", "-"],
                capture_output=True, text=True, timeout=30)

            # Parse stats
            rms_vals = []
            peak_vals = []
            if os.path.exists(stats_file):
                for line in open(stats_file):
                    if "RMS_level" in line:
                        try: rms_vals.append(float(line.split("=")[-1]))
                        except: pass
                    elif "Peak_level" in line:
                        try: peak_vals.append(float(line.split("=")[-1]))
                        except: pass

            if rms_vals:
                # Noise floor: quietest RMS frames (bottom 20%)
                sorted_rms = sorted(rms_vals)
                quiet_count = max(1, len(sorted_rms) // 5)
                noise_floor = sum(sorted_rms[:quiet_count]) / quiet_count
                noise_floors.append(noise_floor)

                # Dynamic range: difference between loud and quiet
                loud_count = max(1, len(sorted_rms) // 5)
                loud_avg = sum(sorted_rms[-loud_count:]) / loud_count
                dynamic_ranges.append(loud_avg - noise_floor)

            # Measure high-frequency energy (hiss indicator)
            # Extract energy above 6kHz vs total
            r2 = subprocess.run(
                ["ffmpeg", "-i", wav, "-af",
                 "highpass=f=6000,astats=metadata=1:reset=0,ametadata=print",
                 "-f", "null", "-"],
                capture_output=True, text=True, timeout=30)
            hf_rms = []
            for line in r2.stderr.split("\n") + r2.stdout.split("\n"):
                if "RMS_level" in line:
                    try: hf_rms.append(float(line.split("=")[-1].strip()))
                    except: pass
            if hf_rms:
                high_freq_energies.append(sum(hf_rms) / len(hf_rms))

        except Exception as e:
            log(f"[diagnose] Sample {i} error: {e}")
        finally:
            for f in [wav, stats_file]:
                try: os.remove(f)
                except: pass

    try: shutil.rmtree(tmp, ignore_errors=True)
    except: pass

    if not noise_floors:
        return {"error": "could not analyze audio", "path": p}

    avg_noise = sum(noise_floors) / len(noise_floors)
    avg_dynamic = sum(dynamic_ranges) / len(dynamic_ranges) if dynamic_ranges else 0
    avg_hf = sum(high_freq_energies) / len(high_freq_energies) if high_freq_energies else -80

    # Score: higher = dirtier
    # Noise floor: -60dB is clean, -30dB is very noisy
    noise_score = max(0, min(100, (avg_noise + 60) * 3.3))  # -60→0, -30→100
    # High freq energy: -70dB is clean, -40dB is hissy
    hiss_score = max(0, min(100, (avg_hf + 70) * 3.3))  # -70→0, -40→100
    # Dynamic range: 30dB is good, 10dB is compressed/noisy
    dynamic_score = max(0, min(100, (30 - avg_dynamic) * 5))  # 30→0, 10→100

    overall = noise_score * 0.4 + hiss_score * 0.35 + dynamic_score * 0.25

    if overall < 25:
        recommendation = "none"
        reason = "Audio is clean, no processing needed"
    elif overall < 50:
        recommendation = "light"
        reason = "Mild background noise or slight hiss detected"
    elif overall < 75:
        recommendation = "moderate"
        reason = "Noticeable noise/hiss and uneven dynamics"
    else:
        recommendation = "heavy"
        reason = "Significant noise, hiss, and poor dynamic range — old recording"

    log(f"[diagnose] {os.path.basename(mp)}: noise={avg_noise:.1f}dB hf={avg_hf:.1f}dB dyn={avg_dynamic:.1f}dB → {recommendation} ({overall:.0f}/100)")

    return {
        "path": p,
        "recommendation": recommendation,
        "reason": reason,
        "score": round(overall, 1),
        "details": {
            "noise_floor_dB": round(avg_noise, 1),
            "high_freq_energy_dB": round(avg_hf, 1),
            "dynamic_range_dB": round(avg_dynamic, 1),
            "noise_score": round(noise_score, 1),
            "hiss_score": round(hiss_score, 1),
            "dynamic_score": round(dynamic_score, 1),
        },
        "samples_analyzed": len(noise_floors),
        "total_duration": round(total_dur, 1),
    }


def task_audio_clean(params, config):
    """Clean/restore old audiobook audio using ffmpeg filters.

    Profiles:
      light    — gentle denoise, good for mild hiss
      moderate — denoise + dynamic compression, for scratchy recordings
      heavy    — aggressive denoise + EQ + compression, for very old tapes
      custom   — pass your own ffmpeg af filter chain

    Params:
      path: source file (server path)
      profile: light|moderate|heavy|custom (default: moderate)
      custom_filter: ffmpeg -af string (only for custom profile)
      output_format: mp3|m4b|flac|same (default: same)
      keep_original: true|false (default: true, renames to .original.ext)
    """
    p = params.get("path", "")
    mp = map_path(p, config)
    if not os.path.isfile(mp):
        return {"error": "file not found", "path": p}

    profile = params.get("profile", "moderate")
    keep_original = params.get("keep_original", True)
    output_format = params.get("output_format", "same")

    # Build filter chain based on profile
    filters = {
        "light": (
            # High-pass to remove rumble, gentle noise reduction
            "highpass=f=80,"
            "afftdn=nf=-20,"
            "acompressor=threshold=-20dB:ratio=2:attack=200:release=1000"
        ),
        "moderate": (
            # Remove rumble + hiss, normalize levels, compress dynamics
            "highpass=f=80,"
            "lowpass=f=12000,"
            "afftdn=nf=-25:nt=w,"
            "acompressor=threshold=-18dB:ratio=3:attack=100:release=800,"
            "loudnorm=I=-16:TP=-1.5:LRA=11"
        ),
        "heavy": (
            # Aggressive: cut more spectrum, strong denoise, EQ for voice clarity, hard compression
            "highpass=f=120,"
            "lowpass=f=8000,"
            "afftdn=nf=-30:nt=w:om=o,"
            "equalizer=f=300:t=q:w=1:g=-3,"
            "equalizer=f=2500:t=q:w=1.5:g=4,"
            "equalizer=f=5000:t=q:w=1:g=2,"
            "acompressor=threshold=-15dB:ratio=4:attack=50:release=500:makeup=2,"
            "loudnorm=I=-16:TP=-1.5:LRA=7"
        ),
    }

    if profile == "custom":
        af = params.get("custom_filter", "")
        if not af:
            return {"error": "custom profile requires custom_filter param"}
    else:
        af = filters.get(profile)
        if not af:
            return {"error": f"unknown profile: {profile}. Use: light, moderate, heavy, custom"}

    # Determine output path
    base, ext = os.path.splitext(mp)
    if output_format != "same":
        out_ext = f".{output_format}"
    else:
        out_ext = ext
    tmp_out = base + ".cleaned" + out_ext

    # Build ffmpeg command
    cmd = ["ffmpeg", "-y", "-i", mp, "-af", af]
    # Preserve chapters and metadata
    cmd += ["-map_metadata", "0", "-map_chapters", "0"]
    # Codec selection
    if out_ext in (".mp3",):
        cmd += ["-codec:a", "libmp3lame", "-q:a", "2"]
    elif out_ext in (".m4b", ".m4a"):
        cmd += ["-codec:a", "aac", "-b:a", "128k"]
    elif out_ext in (".flac",):
        cmd += ["-codec:a", "flac"]
    elif out_ext in (".ogg", ".opus"):
        cmd += ["-codec:a", "libopus", "-b:a", "96k"]
    else:
        cmd += ["-codec:a", "aac", "-b:a", "128k"]
    cmd.append(tmp_out)

    log(f"[clean] {os.path.basename(mp)} profile={profile}")
    log(f"[clean] Filter: {af[:80]}...")

    try:
        t0 = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        elapsed = time.time() - t0

        if result.returncode != 0:
            # Clean up failed output
            if os.path.exists(tmp_out):
                os.remove(tmp_out)
            return {"error": result.stderr[-500:], "path": p}

        new_size = os.path.getsize(tmp_out)
        old_size = os.path.getsize(mp)

        if keep_original:
            orig_path = base + ".original" + ext
            os.rename(mp, orig_path)
            os.rename(tmp_out, base + out_ext)
            log(f"[clean] Original saved as {os.path.basename(orig_path)}")
        else:
            if mp != base + out_ext:
                os.rename(tmp_out, base + out_ext)
            else:
                os.remove(mp)
                os.rename(tmp_out, mp)

        log(f"[clean] Done in {elapsed:.0f}s: {old_size // 1048576}MB -> {new_size // 1048576}MB")

        return {
            "path": p,
            "profile": profile,
            "elapsed": round(elapsed, 1),
            "old_size": old_size,
            "new_size": new_size,
            "kept_original": keep_original,
        }
    except subprocess.TimeoutExpired:
        if os.path.exists(tmp_out):
            os.remove(tmp_out)
        return {"error": "timeout (>1h)", "path": p}
    except Exception as e:
        if os.path.exists(tmp_out):
            os.remove(tmp_out)
        return {"error": str(e), "path": p}


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
    "audio_diagnose": task_audio_diagnose,
    "audio_clean": task_audio_clean,
    "move_file": task_move_file,
    "download_metadata": task_download_metadata,
    "diag": task_diag,
    "update_agent": task_update_agent,
}

BG_TASK_TYPES = {"scan_incoming", "scan_incoming_audio", "download_metadata", "audio_clean", "audio_diagnose"}


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
