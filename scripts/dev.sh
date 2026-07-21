#!/usr/bin/env bash
# Start FastAPI (:8000) + Vite (:5173) together. Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
cd "$ROOT"

if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif [[ -f venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
elif [[ -f "$BACKEND/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$BACKEND/.venv/bin/activate"
fi

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "API  → http://127.0.0.1:8000  (backend/)"
echo "Web  → http://localhost:5173  (Frontend/)"
echo "Ctrl+C to stop both."
echo

(
  cd "$BACKEND"
  uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
) &
API_PID=$!

(
  cd "$ROOT/Frontend"
  npm run dev -- --host 127.0.0.1 --port 5173
) &
WEB_PID=$!

wait
