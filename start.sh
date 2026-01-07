#!/bin/sh
# Production startup script
# Runs both the Nitro server and WebSocket sidecar

# Exit on error
set -e

echo "Starting production servers..."
echo "PID: $$"

# Start WebSocket server in background
echo "Starting WebSocket server on port ${WS_PORT:-3001}..."
node ws-server.mjs &
WS_PID=$!
echo "WebSocket server PID: $WS_PID"

# Start Nitro server
echo "Starting main server on port ${PORT:-5000}..."
node .output/server/index.mjs &
NITRO_PID=$!
echo "Nitro server PID: $NITRO_PID"

# Handle shutdown
cleanup() {
  echo "========== CLEANUP TRIGGERED =========="
  echo "Cleanup PID: $$"
  echo "Shutting down..."
  echo "WS_PID: $WS_PID"
  echo "NITRO_PID: $NITRO_PID"

  # Check which process is still running
  if kill -0 $WS_PID 2>/dev/null; then
    echo "WebSocket server (PID $WS_PID) is still running, sending SIGTERM..."
    kill -TERM $WS_PID 2>/dev/null || true
  else
    echo "WebSocket server (PID $WS_PID) already exited"
  fi

  if kill -0 $NITRO_PID 2>/dev/null; then
    echo "Nitro server (PID $NITRO_PID) is still running, sending SIGTERM..."
    kill -TERM $NITRO_PID 2>/dev/null || true
  else
    echo "Nitro server (PID $NITRO_PID) already exited"
  fi

  # Wait for graceful shutdown
  sleep 2

  # Force kill if still running
  if kill -0 $WS_PID 2>/dev/null; then
    echo "Force killing WebSocket server (PID $WS_PID)..."
    kill -KILL $WS_PID 2>/dev/null || true
  fi

  if kill -0 $NITRO_PID 2>/dev/null; then
    echo "Force killing Nitro server (PID $NITRO_PID)..."
    kill -KILL $NITRO_PID 2>/dev/null || true
  fi

  wait $WS_PID $NITRO_PID 2>/dev/null || true
  echo "Shutdown complete"
  echo "======================================="
}

trap cleanup TERM INT

# Wait for either process to exit
echo "Waiting for processes (WS: $WS_PID, Nitro: $NITRO_PID)..."
wait -n
EXIT_CODE=$?

# If we get here, one process exited
echo "========== PROCESS EXITED DETECTED =========="
echo "wait -n exit code: $EXIT_CODE"
echo "Timestamp: $(date -Iseconds)"

# Check which process exited
if ! kill -0 $WS_PID 2>/dev/null; then
  echo "!!! WebSocket server (PID $WS_PID) has EXITED !!!"
else
  echo "WebSocket server (PID $WS_PID) still running"
fi

if ! kill -0 $NITRO_PID 2>/dev/null; then
  echo "!!! Nitro server (PID $NITRO_PID) has EXITED !!!"
else
  echo "Nitro server (PID $NITRO_PID) still running"
fi
echo "============================================="

cleanup
