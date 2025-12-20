#!/bin/sh
# Production startup script
# Runs both the Nitro server and WebSocket sidecar

# Exit on error
set -e

echo "Starting production servers..."

# Start WebSocket server in background
echo "Starting WebSocket server on port ${WS_PORT:-3001}..."
node ws-server.mjs &
WS_PID=$!

# Start Nitro server
echo "Starting main server on port ${PORT:-5000}..."
node .output/server/index.mjs &
NITRO_PID=$!

# Handle shutdown
cleanup() {
  echo "Shutting down..."
  kill $WS_PID $NITRO_PID 2>/dev/null || true
  wait $WS_PID $NITRO_PID 2>/dev/null || true
  echo "Shutdown complete"
}

trap cleanup TERM INT

# Wait for either process to exit
wait -n

# If we get here, one process exited - cleanup both
cleanup
