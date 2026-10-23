#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
task_python="${PYTHON:-python3}"
command -v "$task_python" >/dev/null || { echo 'Python 3.11+ is required.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 22+ is required.' >&2; exit 1; }
command -v pnpm >/dev/null || { echo 'Install pnpm before starting HodHod.' >&2; exit 1; }
if [[ ! -x .local/brain-venv/bin/python ]]; then "$task_python" -m venv .local/brain-venv; fi
task_python="$PWD/.local/brain-venv/bin/python"
if ! "$task_python" -c 'import django, openai, anthropic, psycopg, dotenv, waitress, tzdata' 2>/dev/null; then
  "$task_python" -m pip install -r backend/requirements-workspace.txt
fi
export DJANGO_SETTINGS_MODULE=config.workspace_settings PYTHONIOENCODING=utf-8
export TOROB_API_PORT="${TOROB_API_PORT:-8787}" HODHOD_BRAIN_PORT="${HODHOD_BRAIN_PORT:-8790}"
"$task_python" -c 'import os,socket
for port in (int(os.environ["TOROB_API_PORT"]),int(os.environ["HODHOD_BRAIN_PORT"]),5173):
    with socket.socket() as sock:
        try: sock.bind(("127.0.0.1",port))
        except OSError: raise SystemExit(f"Port {port} is unavailable; stop the previous application first.")'
if [[ ! -d node_modules/vite ]]; then pnpm install --frozen-lockfile; fi
"$task_python" scripts/data_service.py --import-only
"$task_python" backend/manage.py migrate --noinput
"$task_python" backend/manage.py import_workspace
task_production=false
case "${1:-}" in
  --production) task_production=true; pnpm build ;;
  '') ;;
  *) echo 'Usage: bash start.sh [--production]' >&2; exit 1 ;;
esac
task_api_pid='' task_brain_pid=''
cleanup() {
  [[ -z "$task_api_pid" ]] || kill "$task_api_pid" 2>/dev/null || true
  [[ -z "$task_brain_pid" ]] || kill "$task_brain_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM
"$task_python" scripts/data_service.py >.local/api.log 2>.local/api-error.log & task_api_pid=$!
"$task_python" scripts/serve_brain.py >.local/brain.log 2>.local/brain-error.log & task_brain_pid=$!
"$task_python" -c 'import os,time,urllib.request
for attempt in range(30):
    try:
        urllib.request.urlopen("http://127.0.0.1:"+os.environ["HODHOD_BRAIN_PORT"]+"/api/workspace/bootstrap/",timeout=2);break
    except Exception: time.sleep(.5)
else: raise SystemExit("Agent startup failed; inspect .local/brain-error.log")'
echo 'HodHod: http://127.0.0.1:5173'
if "$task_production"; then pnpm preview --host 127.0.0.1 --port 5173 --strictPort
else pnpm dev --host 127.0.0.1 --port 5173 --strictPort
fi
