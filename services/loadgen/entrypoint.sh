#!/bin/sh

# Entrypoint script for Locust to run in headless mode
# Reads environment variables and passes them to locust

USERS=${LOCUST_USERS:-10}
SPAWN_RATE=${LOCUST_SPAWN_RATE:-2}
HOST=${LOCUST_HOST:-http://frontend:3000}

# Suppress Locust's stats table output (redirect stdout to /dev/null)
# Keep stderr for Python logging from locustfile.py
# Use loglevel ERROR to minimize Locust's internal logging
exec locust \
  -f /mnt/locust/locustfile.py \
  --host="${HOST}" \
  --headless \
  --users="${USERS}" \
  --spawn-rate="${SPAWN_RATE}" \
  --web-host=0.0.0.0 \
  --web-port=8089 \
  --loglevel=ERROR \
  1>/dev/null

