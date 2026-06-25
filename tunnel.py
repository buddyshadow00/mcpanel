#!/usr/bin/env python3
"""
Cloudflare Tunnel Runner - by IamGunpoint
Single-file, no-install, no-root
File: tunnel.py
Run: python3 tunnel.py

Features:
- Auto-downloads cloudflared binary (no apt)
- First run asks for token -> saves to tunnel_data.json
- Accepts full command OR raw token
- Ctrl+C = auto background, not exit
- Background daemon with auto-restart
- start / stop / status / logs commands
- Zero dependencies (stdlib only)
"""
import os
import sys
import json
import re
import signal
import shutil
import time
import subprocess
import platform
import urllib.request
import argparse
from pathlib import Path

AUTHOR = "IamGunpoint"
VERSION = "1.3.0"

# --- PATHS ---
SCRIPT_DIR = Path(__file__).resolve().parent
HOME_DIR = Path.home() / ".iamgunpoint_tunnel"

# Prefer local tunnel_data.json for true portable one-file experience,
# fallback to HOME_DIR
def find_data_file():
    candidates = [
        Path.cwd() / "tunnel_data.json",
        SCRIPT_DIR / "tunnel_data.json",
        HOME_DIR / "tunnel_data.json",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            try:
                if p.stat().st_size > 0:
                    return p
            except:
                pass
    # default save location: HOME_DIR (always writable)
    return HOME_DIR / "tunnel_data.json"

def get_all_data_paths():
    return [
        Path.cwd() / "tunnel_data.json",
        SCRIPT_DIR / "tunnel_data.json",
        HOME_DIR / "tunnel_data.json",
    ]

DATA_PATH = find_data_file()
# binary locations - try local first, then home
BIN_CANDIDATES = [
    SCRIPT_DIR / "cloudflared",
    Path.cwd() / "cloudflared",
    HOME_DIR / "cloudflared",
]
def find_bin():
    for b in BIN_CANDIDATES:
        if b.exists() and b.stat().st_size > 1000000:
            return b
    return HOME_DIR / "cloudflared"

BIN_PATH = find_bin()
PID_PATH = HOME_DIR / "tunnel.pid"
LOG_PATH = HOME_DIR / "tunnel.log"

BANNER = f"""
\033[1;36m
  ___              ____             _       _   
 |_ _|__ _ _ __   / ___|_   _ _ __ | |_ __ (_)_ __ | |_ 
  | |/ _` | '_ \\ | |  _| | | | '_ \\| | '_ \\| | '_ \\| __|
  | | (_| | | | || |_| | |_| | | | | | |_) | | | | | |_ 
 |___\\__,_|_| |_| \\____|\\__,_|_| |_|_| .__/|_|_| |_|\\__|
                                     |_|                
                \033[1;33mCloudflare Tunnel Runner\033[1;36m
                     \033[0;37mby {AUTHOR}  v{VERSION}\033[0m
"""

def c(color, msg):
    cols = {
        "red":"\033[91m","green":"\033[92m","yellow":"\033[93m",
        "cyan":"\033[96m","mag":"\033[95m","bold":"\033[1m","dim":"\033[2m","reset":"\033[0m"
    }
    print(f"{cols.get(color,'')}{msg}{cols['reset']}")

def ensure_dirs():
    HOME_DIR.mkdir(parents=True, exist_ok=True)

def get_cloudflared_url():
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "linux":
        if machine in ("x86_64","amd64"):
            return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        elif machine in ("aarch64","arm64","armv8"):
            return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
        elif "arm" in machine:
            return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
        else:
            return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    elif system == "darwin":
        # macos binary is inside tgz
        return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
    else:
        return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"

def download_cloudflared(force=False):
    global BIN_PATH
    # if already have a working bin, skip
    existing = find_bin()
    if existing.exists() and existing.stat().st_size > 1000000 and not force:
        BIN_PATH = existing
        return True

    ensure_dirs()
    url = get_cloudflared_url()
    target = HOME_DIR / "cloudflared"
    c("cyan", f"[+] {AUTHOR}: Downloading cloudflared...")
    c("dim", f"    {url}")
    c("dim", f"    -> {target}")
    try:
        tmp = target.with_suffix(".dl.tmp")
        with urllib.request.urlopen(url, timeout=90) as resp, open(tmp, "wb") as out:
            shutil.copyfileobj(resp, out)
        if url.endswith(".tgz"):
            import tarfile
            with tarfile.open(tmp, "r:gz") as tar:
                member = next((m for m in tar.getmembers() if "cloudflared" in os.path.basename(m.name)), tar.getmembers()[0])
                f = tar.extractfile(member)
                with open(target, "wb") as outb:
                    shutil.copyfileobj(f, outb)
            tmp.unlink(missing_ok=True)
        else:
            tmp.rename(target)
        target.chmod(0o755)
        BIN_PATH = target
        c("green", "[✓] cloudflared ready!")
        return True
    except Exception as e:
        c("red", f"[✗] Download failed: {e}")
        c("yellow", "Manual fix:")
        c("yellow", "  wget -O ~/.iamgunpoint_tunnel/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64")
        c("yellow", "  chmod +x ~/.iamgunpoint_tunnel/cloudflared")
        return False

def load_config():
    # try all known data paths, first hit wins
    for p in get_all_data_paths():
        if p.exists():
            try:
                data = json.loads(p.read_text())
                if "token" in data and data["token"]:
                    # update global DATA_PATH to the one we found
                    global DATA_PATH
                    DATA_PATH = p
                    return data
            except Exception:
                continue
    return {}

def save_config(cfg):
    ensure_dirs()
    # save to primary HOME location
    primary = HOME_DIR / "tunnel_data.json"
    primary.write_text(json.dumps(cfg, indent=2))
    try:
        os.chmod(primary, 0o600)
    except:
        pass
    # also mirror to local ./tunnel_data.json for portability if writable
    try:
        local = Path.cwd() / "tunnel_data.json"
        if local != primary:
            local.write_text(json.dumps(cfg, indent=2))
            try:
                os.chmod(local, 0o600)
            except:
                pass
    except Exception:
        pass
    global DATA_PATH
    DATA_PATH = primary
    return primary

def parse_token_input(raw: str):
    if not raw:
        return None
    raw = raw.strip()
    # --token XXXXX
    m = re.search(r'--token\s+([^\s"\']+)', raw)
    if m:
        return m.group(1).strip('"\'')
    # JWT token pattern (3 parts)
    m2 = re.search(r'eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+', raw)
    if m2:
        return m2.group(0)
    # plain long string no spaces
    if " " not in raw and len(raw) > 30:
        return raw
    # take longest chunk
    parts = re.split(r'\s+', raw)
    candidate = max(parts, key=len, default="")
    candidate = candidate.strip('"\'')
    if len(candidate) > 30:
        return candidate
    return None

def ask_token_interactive():
    print(BANNER)
    c("cyan", "─" * 60)
    c("bold", f"  First run - {AUTHOR} Tunnel Setup")
    c("cyan", "─" * 60)
    print()
    c("yellow", "Paste your Cloudflare Tunnel token.")
    c("mag", "  Accepts:")
    c("mag", "    • eyJhQ2XXXXXXXXXXXX...")
    c("mag", "    • cloudflared tunnel run --token eyJhQ2...")
    print()
    while True:
        try:
            raw = input(f"\033[1;92m{AUTHOR} > Token: \033[0m").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            c("red", "Cancelled.")
            sys.exit(1)
        token = parse_token_input(raw)
        if token:
            c("green", f"[✓] Token OK: {token[:22]}...{token[-6:]}")
            return token
        c("red", "[✗] Couldn't parse token. Try again (paste full command or raw token).")

def get_token(reset=False):
    cfg = load_config()
    if reset or "token" not in cfg or not cfg.get("token"):
        token = ask_token_interactive()
        cfg["token"] = token
        cfg["saved_by"] = AUTHOR
        cfg["saved_at"] = time.time()
        saved_path = save_config(cfg)
        c("green", f"[✓] Saved to {saved_path}")
        time.sleep(0.5)
        return token
    return cfg["token"]

def is_running():
    if not PID_PATH.exists():
        return False, None
    try:
        pid = int(PID_PATH.read_text().strip())
        os.kill(pid, 0)
        return True, pid
    except Exception:
        try:
            PID_PATH.unlink(missing_ok=True)
        except:
            pass
        return False, None

def stop_tunnel():
    running, pid = is_running()
    if not running:
        c("yellow", "[i] Tunnel not running.")
        return True
    c("cyan", f"[+] Stopping PID {pid}...")
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(30):
            time.sleep(0.1)
            try:
                os.kill(pid, 0)
            except OSError:
                break
        else:
            os.kill(pid, signal.SIGKILL)
        c("green", "[✓] Stopped.")
    except Exception as e:
        c("red", f"[!] {e}")
    PID_PATH.unlink(missing_ok=True)
    return True

def launch_background():
    ensure_dirs()
    with open(LOG_PATH, "a") as lf:
        lf.write(f"\n\n=== {AUTHOR} background launch {time.ctime()} ===\n")
    cmd = [sys.executable, os.path.abspath(__file__), "start", "--daemon-internal"]
    c("cyan", "[+] Launching background daemon...")
    try:
        # open log in append mode and pass fd
        log_f = open(LOG_PATH, "a", buffering=1)
        p = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=log_f,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True
        )
        time.sleep(1.0)
        # verify it stayed up
        running, pid = is_running()
        if running:
            c("green", f"[✓] Background running PID {pid}")
        else:
            c("yellow", f"[~] Spawned PID {p.pid}, check logs...")
        c("dim", f"    logs: python3 {os.path.basename(__file__)} logs -f")
        c("dim", f"    stop: python3 {os.path.basename(__file__)} stop")
        return True
    except Exception as e:
        c("red", f"[✗] Background failed: {e}")
        return False

def run_foreground(token):
    global BIN_PATH
    if not BIN_PATH.exists():
        if not download_cloudflared():
            sys.exit(1)
    cmd = [str(BIN_PATH), "tunnel", "--no-autoupdate", "run", "--token", token]
    print(BANNER)
    c("green", f"  {AUTHOR} Tunnel starting (foreground)")
    c("cyan", f"  Token: {token[:24]}...")
    c("yellow", "  [i] Press Ctrl+C to background (not kill)")
    print()
    proc = None
    try:
        proc = subprocess.Popen(cmd)
        PID_PATH.write_text(str(proc.pid))
        proc.wait()
    except KeyboardInterrupt:
        print()
        c("cyan", f"\n[!] Ctrl+C caught - {AUTHOR} auto-backgrounding...")
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                time.sleep(0.4)
                if proc.poll() is None:
                    proc.kill()
            except:
                pass
        PID_PATH.unlink(missing_ok=True)
        if launch_background():
            c("green", "[✓] Tunnel is running in background. Bye!")
            sys.exit(0)
        else:
            c("red", "[✗] Could not background.")
            sys.exit(1)
    finally:
        PID_PATH.unlink(missing_ok=True)

def run_daemon(token):
    # daemon internal entry
    ensure_dirs()
    # try double-fork on unix
    try:
        if os.fork() > 0:
            sys.exit(0)
        os.setsid()
    except AttributeError:
        pass
    except OSError:
        pass

    PID_PATH.write_text(str(os.getpid()))

    def _term(signum, frame):
        try:
            PID_PATH.unlink(missing_ok=True)
        except:
            pass
        sys.exit(0)
    signal.signal(signal.SIGTERM, _term)
    signal.signal(signal.SIGINT, _term)

    global BIN_PATH
    if not BIN_PATH.exists():
        download_cloudflared()

    cmd = [str(BIN_PATH), "tunnel", "--no-autoupdate", "run", "--token", token]

    # restart loop
    while True:
        try:
            with open(LOG_PATH, "a") as lf:
                lf.write(f"\n--- {AUTHOR} tunnel start {time.ctime()} pid {os.getpid()} ---\n")
                lf.flush()
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
                for line in proc.stdout:
                    lf.write(line)
                    lf.flush()
            code = proc.wait()
            with open(LOG_PATH, "a") as lf:
                lf.write(f"--- exited {code} {time.ctime()} ---\n")
            if code == 0:
                break
            time.sleep(3)
        except Exception as e:
            with open(LOG_PATH, "a") as lf:
                lf.write(f"daemon error {e} {time.ctime()}\n")
            time.sleep(5)

def do_status():
    print(BANNER)
    running, pid = is_running()
    cfg = load_config()
    token = cfg.get("token", "")
    bin_exists = BIN_PATH.exists()
    print(f"  Author     : {AUTHOR}")
    print(f"  Script     : {os.path.abspath(__file__)}")
    print(f"  Data file  : {DATA_PATH}")
    print(f"             : {', '.join([str(p) for p in get_all_data_paths() if p.exists()]) or 'none found yet'}")
    print(f"  Binary     : {BIN_PATH} {'✓' if bin_exists else '✗ missing'}")
    print(f"  PID file   : {PID_PATH}")
    print(f"  Log file   : {LOG_PATH}")
    print(f"  Token      : {token[:26]+'...' if token else 'NOT SET'}")
    print()
    if running:
        c("green", f"  ● RUNNING  PID {pid}")
    else:
        c("red", f"  ● STOPPED")
    print()

def do_logs(follow=False):
    if not LOG_PATH.exists():
        c("yellow", "No logs yet.")
        return
    if follow:
        c("cyan", f"tail -f {LOG_PATH}  (Ctrl+C exit)")
        try:
            subprocess.run(["tail", "-f", "-n", "120", str(LOG_PATH)])
        except KeyboardInterrupt:
            pass
    else:
        data = LOG_PATH.read_text(errors="ignore")
        print(data[-12000:])

def main():
    parser = argparse.ArgumentParser(
        description=f"Cloudflare Tunnel Runner by {AUTHOR}",
        prog="tunnel.py",
        add_help=True
    )
    parser.add_argument("command", nargs="?", default="start",
                        choices=["start","stop","restart","status","logs","update","reset"],
                        help="default: start")
    parser.add_argument("-b", "--background", action="store_true", help="start in background immediately")
    parser.add_argument("-f", "--follow", action="store_true", help="follow logs (with logs command)")
    parser.add_argument("--reset-token", action="store_true", help="reset saved token")
    parser.add_argument("--token", type=str, help="provide token via CLI (raw or full command)")
    parser.add_argument("--daemon-internal", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    ensure_dirs()

    # commands that don't need token
    if args.command == "stop":
        stop_tunnel()
        return
    if args.command == "status":
        do_status()
        return
    if args.command == "logs":
        do_logs(follow=args.follow)
        return
    if args.command == "update":
        download_cloudflared(force=True)
        return
    if args.command == "reset":
        args.reset_token = True
        args.command = "start"

    if args.command == "restart":
        stop_tunnel()
        time.sleep(0.8)
        args.command = "start"

    # internal daemon
    if args.daemon_internal:
        cfg = load_config()
        token = cfg.get("token")
        if not token:
            with open(LOG_PATH, "a") as lf:
                lf.write("daemon started with no token!\n")
            sys.exit(1)
        run_daemon(token)
        return

    # normal start flow
    # CLI token override
    if args.token:
        t = parse_token_input(args.token)
        if t:
            save_config({"token": t, "saved_by": AUTHOR, "saved_at": time.time()})
            c("green", "[✓] Token set via --token")
        else:
            c("red", "[✗] Invalid --token")
            sys.exit(1)

    # get token (asks if missing)
    token = get_token(reset=args.reset_token)

    # ensure binary
    global BIN_PATH
    BIN_PATH = find_bin()
    if not BIN_PATH.exists():
        if not download_cloudflared():
            sys.exit(1)

    # check if already running
    running, pid = is_running()
    if running and args.command == "start":
        c("yellow", f"[!] Already running PID {pid}")
        c("cyan", f"    python3 {os.path.basename(__file__)} status")
        c("cyan", f"    python3 {os.path.basename(__file__)} logs -f")
        c("cyan", f"    python3 {os.path.basename(__file__)} stop")
        return

    if args.background:
        launch_background()
        return

    # foreground with Ctrl+C -> background
    run_foreground(token)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        # safety net, should be caught earlier
        print()
        c("cyan", "Interrupted")
        sys.exit(130)
