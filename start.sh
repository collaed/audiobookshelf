#!/bin/sh
# Entrypoint: starts ABS (main) and optionally calibre-server (background)

# Start calibre-server if a library exists
if [ -d "${CALIBRE_LIBRARY:-/calibre}" ] && [ -f "${CALIBRE_LIBRARY:-/calibre}/metadata.db" ]; then
  echo "[startup] Starting calibre-server on port 8180..."
  calibre-server "${CALIBRE_LIBRARY:-/calibre}" \
    --port 8180 \
    --enable-local-write \
    --disable-auth \
    --url-prefix /calibre \
    --log /config/calibre-server.log &
fi

# Start ABS
exec node index.js
