#!/usr/bin/env python3
import os
import subprocess
import sys
import time

AGENT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "abs-agent.py")
ARGS = sys.argv[1:]

while True:
    print(f"[wrapper] Starting agent: {AGENT}")
    proc = subprocess.run([sys.executable, AGENT, *ARGS])
    code = proc.returncode
    if code == 42:
        print("[wrapper] Agent requested restart (code 42)")
        time.sleep(1)
        continue
    elif code != 0:
        print(f"[wrapper] Agent crashed (code {code}), restarting in 10s...")
        time.sleep(10)
        continue
    else:
        print("[wrapper] Agent exited cleanly")
        break
