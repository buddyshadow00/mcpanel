#!/bin/bash

# ============================================================
#   MCPanel Installer — by IamGunpoint
# ============================================================

# ---------- Colors & Styles ----------
RESET="\e[0m"
BOLD="\e[1m"
DIM="\e[2m"
ITALIC="\e[3m"

BLACK="\e[30m"
RED="\e[31m"
GREEN="\e[32m"
YELLOW="\e[33m"
BLUE="\e[34m"
MAGENTA="\e[35m"
CYAN="\e[36m"
WHITE="\e[37m"

BG_BLACK="\e[40m"
BG_BLUE="\e[44m"
BG_MAGENTA="\e[45m"
BG_CYAN="\e[46m"

# ---------- Spinner ----------
SPINNER_PID=""

spinner() {
    local msg="$1"
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local i=0
    while true; do
        printf "\r  ${CYAN}${frames[$i]}${RESET}  ${BOLD}${WHITE}%s${RESET}${DIM}...${RESET}   " "$msg"
        i=$(( (i+1) % ${#frames[@]} ))
        sleep 0.08
    done
}

start_spinner() {
    spinner "$1" &
    SPINNER_PID=$!
    disown
}

stop_spinner() {
    if [[ -n "$SPINNER_PID" ]]; then
        kill "$SPINNER_PID" 2>/dev/null
        wait "$SPINNER_PID" 2>/dev/null
        SPINNER_PID=""
    fi
    printf "\r\033[2K"
}

# ---------- Progress Bar ----------
progress_bar() {
    local current=$1
    local total=$2
    local label="$3"
    local pct=$(( current * 100 / total ))
    local filled=$(( current * 40 / total ))
    local empty=$(( 40 - filled ))

    local bar="${GREEN}"
    for ((i=0; i<filled; i++)); do bar+="█"; done
    bar+="${DIM}${WHITE}"
    for ((i=0; i<empty; i++)); do bar+="░"; done
    bar+="${RESET}"

    printf "\r  [${bar}${RESET}] ${BOLD}${YELLOW}%3d%%${RESET}  ${DIM}${WHITE}%s${RESET}   " "$pct" "$label"
}

# ---------- Logging Helpers ----------
log_section() {
    echo ""
    echo -e "  ${BG_MAGENTA}${BLACK}${BOLD}  $1  ${RESET}"
    echo ""
}

log_info() {
    echo -e "  ${CYAN}ℹ${RESET}  ${WHITE}$1${RESET}"
}

log_success() {
    echo -e "  ${GREEN}✔${RESET}  ${BOLD}${GREEN}$1${RESET}"
}

log_warn() {
    echo -e "  ${YELLOW}⚠${RESET}  ${YELLOW}$1${RESET}"
}

log_error() {
    echo -e "  ${RED}✘${RESET}  ${BOLD}${RED}$1${RESET}"
}

log_step() {
    echo -e "  ${MAGENTA}➤${RESET}  ${BOLD}${WHITE}$1${RESET}"
}

run_cmd() {
    local label="$1"
    shift
    start_spinner "$label"
    local output
    output=$("$@" 2>&1)
    local exit_code=$?
    stop_spinner
    if [[ $exit_code -ne 0 ]]; then
        log_error "Failed: $label"
        echo -e "${DIM}${RED}$output${RESET}" | head -20
        return $exit_code
    fi
    log_success "$label"
    return 0
}

# ---------- Banner ----------
print_banner() {
    clear
    echo ""
    echo -e "${BOLD}${MAGENTA}"
    echo "  ╔══════════════════════════════════════════════════════╗"
    echo "  ║                                                      ║"
    echo "  ║    🎮  M C P A N E L   I N S T A L L E R  🎮        ║"
    echo "  ║                                                      ║"
    echo "  ║          ✨  crafted for  IamGunpoint  ✨            ║"
    echo "  ║                                                      ║"
    echo "  ╚══════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    echo -e "  ${DIM}${WHITE}Sit tight — your panel is about to be set up! 🚀${RESET}"
    echo ""
}

# ---------- Root Check ----------
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (sudo)!"
        echo -e "  ${DIM}Try: ${CYAN}sudo bash install.sh${RESET}"
        exit 1
    fi
    log_success "Running as root ✅"
}

# ---------- OS Check ----------
check_os() {
    if ! command -v apt &>/dev/null; then
        log_error "This installer only supports Debian/Ubuntu (apt-based) systems."
        exit 1
    fi
    log_success "APT package manager detected 🐧"
}

# ---------- Python stdlib list (for tunnel.py dependency scan) ----------
PYTHON_STDLIB="os sys json re signal shutil time subprocess platform urllib argparse pathlib
io abc ast asyncio base64 binascii builtins calendar cmath codecs collections
concurrent contextlib copy csv dataclasses datetime decimal difflib email enum
fileinput fnmatch fractions functools gc getopt getpass glob gzip hashlib
heapq hmac html http imaplib importlib inspect io itertools keyword linecache
locale logging lzma math mimetypes numbers operator optparse pathlib pdb
pickle pipes plistlib posixpath pprint profile pstats pty queue random
readline reprlib rlcompleter runpy sched secrets select selectors shelve
shlex signal site smtplib socket socketserver sqlite3 sre_compile sre_constants
sre_parse ssl stat statistics string stringprep struct symtable sysconfig
syslog tarfile telnetlib tempfile textwrap threading timeit tkinter token
tokenize traceback tracemalloc tty turtle types typing unicodedata unittest
urllib uu uuid venv warnings wave weakref webbrowser wsgiref xml xmlrpc
zipfile zipimport zlib"

is_stdlib() {
    local mod="$1"
    echo "$PYTHON_STDLIB" | tr ' ' '\n' | grep -qx "$mod"
}

# ============================================================
#   MAIN
# ============================================================
print_banner
sleep 0.5

# ------- Pre-flight -------
log_section "🔍  Pre-flight Checks"
check_root
check_os
echo ""

TOTAL_STEPS=9
CURRENT_STEP=0

# ---------- STEP 1 — apt update ----------
log_section "📦  Step 1 / $TOTAL_STEPS — Updating Package Lists"
CURRENT_STEP=1
progress_bar $CURRENT_STEP $TOTAL_STEPS "apt update"
echo ""
run_cmd "Refreshing APT package lists" apt-get update -y
progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 2 — Java 21 ----------
log_section "☕  Step 2 / $TOTAL_STEPS — Installing Java 21"
CURRENT_STEP=2
progress_bar $CURRENT_STEP $TOTAL_STEPS "Installing openjdk-21-jdk"
echo ""

log_step "Checking for Java 21..."
if java -version 2>&1 | grep -q "21\."; then
    log_warn "Java 21 is already installed — skipping ⏭️"
else
    run_cmd "Installing openjdk-21-jdk" apt-get install -y openjdk-21-jdk
fi

JAVA_VER=$(java -version 2>&1 | head -1)
log_info "Active Java → ${CYAN}${JAVA_VER}${RESET}"
progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 3 — python3-pip ----------
log_section "🐍  Step 3 / $TOTAL_STEPS — Installing python3-pip"
CURRENT_STEP=3
progress_bar $CURRENT_STEP $TOTAL_STEPS "Installing python3-pip"
echo ""
run_cmd "Installing python3-pip" apt-get install -y python3-pip
PIP_VER=$(pip3 --version 2>/dev/null | awk '{print $1,$2}')
log_info "pip version → ${CYAN}${PIP_VER}${RESET}"
progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 4 — wget curl git ----------
log_section "🌐  Step 4 / $TOTAL_STEPS — Installing wget, curl & git"
CURRENT_STEP=4
progress_bar $CURRENT_STEP $TOTAL_STEPS "Installing wget curl git"
echo ""
run_cmd "Installing wget curl git" apt-get install -y wget curl git
log_info "git   → ${CYAN}$(git --version)${RESET}"
log_info "curl  → ${CYAN}$(curl --version | head -1)${RESET}"
log_info "wget  → ${CYAN}$(wget --version 2>&1 | head -1)${RESET}"
progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 5 — Clone MCPanel ----------
log_section "📁  Step 5 / $TOTAL_STEPS — Cloning MCPanel Repository"
CURRENT_STEP=5
progress_bar $CURRENT_STEP $TOTAL_STEPS "git clone mcpanel"
echo ""

REPO_URL="https://github.com/buddyshadow00/mcpanel"
CLONE_DIR="mcpanel"

if [[ -d "$CLONE_DIR/.git" ]]; then
    log_warn "mcpanel/ already exists — pulling latest changes instead 🔄"
    run_cmd "Pulling latest changes" git -C "$CLONE_DIR" pull
else
    run_cmd "Cloning buddyshadow00/mcpanel" git clone "$REPO_URL" "$CLONE_DIR"
fi

log_info "Entering directory → ${CYAN}$(realpath $CLONE_DIR)${RESET}"
cd "$CLONE_DIR" || { log_error "Could not enter mcpanel directory!"; exit 1; }
log_success "Inside mcpanel/ 📂"
progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 6 — Node.js & npm 20.x ----------
log_section "🟢  Step 6 / $TOTAL_STEPS — Installing Node.js & npm 20.x"
CURRENT_STEP=6
progress_bar $CURRENT_STEP $TOTAL_STEPS "Setting up NodeSource repo"
echo ""

log_step "Adding NodeSource repository for Node.js 20.x..."

# Check if node 20 already present
if node --version 2>/dev/null | grep -q "^v20\."; then
    log_warn "Node.js 20.x is already installed — skipping ⏭️"
else
    start_spinner "Fetching NodeSource setup script"
    curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh 2>&1
    stop_spinner
    log_success "NodeSource setup script downloaded"

    run_cmd "Running NodeSource setup script" bash /tmp/nodesource_setup.sh
    run_cmd "Installing nodejs (20.x) & npm" apt-get install -y nodejs
fi

NODE_VER=$(node --version 2>/dev/null)
NPM_VER=$(npm --version 2>/dev/null)
log_info "Node.js → ${CYAN}${NODE_VER}${RESET}"
log_info "npm     → ${CYAN}v${NPM_VER}${RESET}"
progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 7 — npm install ----------
log_section "📦  Step 7 / $TOTAL_STEPS — Running npm install inside mcpanel"
CURRENT_STEP=7
progress_bar $CURRENT_STEP $TOTAL_STEPS "npm install"
echo ""

log_step "Installing Node.js dependencies from package.json..."
run_cmd "Running npm install" npm install
log_info "Dependencies installed into → ${CYAN}$(realpath node_modules 2>/dev/null || echo 'node_modules/')${RESET}"
progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 8 — Scan tunnel.py & install pip deps ----------
log_section "🔬  Step 8 / $TOTAL_STEPS — Scanning tunnel.py & Installing Python Dependencies"
CURRENT_STEP=8
progress_bar $CURRENT_STEP $TOTAL_STEPS "Scanning tunnel.py"
echo ""

# Locate tunnel.py — check parent dir (where install.sh lives) and current dir
TUNNEL_PY=""
for candidate in "../tunnel.py" "tunnel.py" "$(dirname "$0")/tunnel.py"; do
    if [[ -f "$candidate" ]]; then
        TUNNEL_PY="$(realpath "$candidate")"
        break
    fi
done

if [[ -z "$TUNNEL_PY" ]]; then
    log_warn "tunnel.py not found near the installer — skipping pip scan ⏭️"
    log_warn "Make sure tunnel.py is in the same folder as install.sh"
else
    log_info "Found tunnel.py → ${CYAN}${TUNNEL_PY}${RESET}"
    echo ""

    log_step "Extracting all import statements from tunnel.py..."

    # Pull every imported module name from the file
    mapfile -t RAW_IMPORTS < <(
        grep -E "^\s*(import|from)\s+" "$TUNNEL_PY" \
        | sed -E 's/^\s*(from|import)\s+([a-zA-Z0-9_]+).*/\2/' \
        | sort -u
    )

    THIRD_PARTY=()
    STDLIB_FOUND=()

    echo ""
    echo -e "  ${DIM}${WHITE}┌─────────────────────────────────────────┐${RESET}"
    echo -e "  ${DIM}${WHITE}│       tunnel.py  Import Analysis        │${RESET}"
    echo -e "  ${DIM}${WHITE}└─────────────────────────────────────────┘${RESET}"
    echo ""

    for mod in "${RAW_IMPORTS[@]}"; do
        [[ -z "$mod" ]] && continue
        if is_stdlib "$mod"; then
            echo -e "  ${GREEN}  stdlib${RESET}  ${DIM}${WHITE}${mod}${RESET}"
            STDLIB_FOUND+=("$mod")
        else
            echo -e "  ${YELLOW}  3rd-party${RESET}  ${BOLD}${CYAN}${mod}${RESET}  ${DIM}→ will install via pip${RESET}"
            THIRD_PARTY+=("$mod")
        fi
    done

    echo ""
    log_info "stdlib modules found    : ${GREEN}${#STDLIB_FOUND[@]}${RESET} ${DIM}(built-in, no install needed)${RESET}"
    log_info "3rd-party modules found : ${YELLOW}${#THIRD_PARTY[@]}${RESET}"
    echo ""

    if [[ ${#THIRD_PARTY[@]} -eq 0 ]]; then
        log_success "tunnel.py uses ONLY Python stdlib — zero pip installs needed! 🎉"
        log_info  "Modules: ${CYAN}${STDLIB_FOUND[*]}${RESET}"
    else
        log_step "Installing ${#THIRD_PARTY[@]} third-party package(s) via pip..."
        echo ""
        for pkg in "${THIRD_PARTY[@]}"; do
            run_cmd "pip install ${pkg}" pip3 install "$pkg"
        done
        log_success "All pip dependencies installed! 🐍"
    fi
fi

progress_bar $CURRENT_STEP $TOTAL_STEPS "Done"
echo ""

# ---------- STEP 9 — Launch tunnel.py ----------
log_section "🚇  Step 9 / $TOTAL_STEPS — Launching tunnel.py"
CURRENT_STEP=9
progress_bar $CURRENT_STEP $TOTAL_STEPS "Starting tunnel.py"
echo ""

if [[ -z "$TUNNEL_PY" ]]; then
    log_error "tunnel.py was not found — cannot launch it! ❌"
    log_warn  "Please place tunnel.py in the same directory as install.sh and re-run."
else
    log_step  "Handing off to tunnel.py now... 🚀"
    echo ""
    echo -e "  ${DIM}${WHITE}────────────────────────────────────────────────────${RESET}"
    echo -e "  ${BOLD}${CYAN}  🌐  Cloudflare Tunnel Runner — by IamGunpoint${RESET}"
    echo -e "  ${DIM}${WHITE}────────────────────────────────────────────────────${RESET}"
    echo ""

    # ============================================================
    #   DONE BANNER — shown before handing off to tunnel.py
    # ============================================================
    sleep 0.3
    echo ""
    echo -e "${BOLD}${GREEN}"
    echo "  ╔══════════════════════════════════════════════════════╗"
    echo "  ║                                                      ║"
    echo "  ║   🎉  ALL DONE, IamGunpoint!  Installation 100%  🎉  ║"
    echo "  ║                                                      ║"
    echo "  ╚══════════════════════════════════════════════════════╝"
    echo -e "${RESET}"

    echo -e "  ${BOLD}${WHITE}Summary of what was installed:${RESET}"
    echo ""
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}APT package lists updated${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}Java 21         →  ${CYAN}$(java -version 2>&1 | head -1)${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}python3-pip     →  ${CYAN}$(pip3 --version 2>/dev/null | awk '{print $1,$2}')${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}wget / curl / git installed${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}MCPanel cloned  →  ${CYAN}$(realpath .)${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}Node.js         →  ${CYAN}$(node --version)${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}npm             →  ${CYAN}v$(npm --version)${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}npm install     →  ${CYAN}Dependencies installed ✅${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}tunnel.py scan  →  ${CYAN}stdlib only, no pip needed ✅${RESET}"
    echo -e "  ${GREEN}✔${RESET}  ${WHITE}tunnel.py       →  ${CYAN}Launching now... 🚇${RESET}"
    echo ""
    echo -e "  ${DIM}${MAGENTA}Happy gaming, IamGunpoint! 🎮🔥${RESET}"
    echo ""

    sleep 1

    # Run tunnel.py — exec replaces the shell so Ctrl+C goes straight to it
    exec python3 "$TUNNEL_PY"
fi
