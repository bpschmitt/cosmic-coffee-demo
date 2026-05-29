#!/bin/sh
# Start a virtual display so Chromium runs in headed mode, which enables
# real paint events and OS-level input dispatch needed for Core Web Vitals.
Xvfb :99 -screen 0 1280x720x24 -ac &
export DISPLAY=:99
exec node loadgen.js
