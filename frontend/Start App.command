#!/bin/bash
# Double-click this file in Finder to launch IT Operations Hub.
# It starts a local server for this folder and opens it in your browser.
# Close this window (or press Ctrl+C) to stop the server.

cd "$(dirname "$0")"

PORT=8080

# If a previous run left the server bound to this port, free it first.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs -r kill >/dev/null 2>&1
  sleep 0.5
fi

echo "Starting IT Operations Hub on http://127.0.0.1:$PORT ..."
python3 serve.py "$PORT" &
SERVER_PID=$!

sleep 1
open "http://127.0.0.1:$PORT/index.html"

echo ""
echo "IT Operations Hub is running. Leave this window open while you use it."
echo "Close this window (or press Ctrl+C) to stop the server."
wait $SERVER_PID
