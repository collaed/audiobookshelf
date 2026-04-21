ARG NUSQLITE3_DIR="/usr/local/lib/nusqlite3"
ARG NUSQLITE3_PATH="${NUSQLITE3_DIR}/libnusqlite3.so"

### STAGE 0: Build client ###
FROM node:20-alpine AS build-client

WORKDIR /client
COPY /client /client
RUN npm ci && npm cache clean --force
RUN npm run generate

### STAGE 0b: Build Vue 3 client ###
FROM node:20-alpine AS build-client-v3

WORKDIR /client-v3
COPY /client-v3/package.json /client-v3/package-lock.json /client-v3/
RUN npm ci && npm cache clean --force
COPY /client-v3 /client-v3
RUN npm run generate

### STAGE 1: Build server (Debian for glibc native modules) ###
FROM node:20-slim AS build-server

ARG NUSQLITE3_DIR

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
  make python3 g++ unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /server
COPY index.js package* /server
COPY /server /server/server
COPY /vendor/libnusqlite3.zip /tmp/library.zip
RUN unzip /tmp/library.zip -d $NUSQLITE3_DIR && rm /tmp/library.zip
RUN npm ci --only=production

### STAGE 2: Runtime — Debian slim ###
FROM node:20-slim

ARG NUSQLITE3_DIR
ARG NUSQLITE3_PATH

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
  tini ffmpeg python3 python3-pip python3-venv \
  wget xz-utils libegl1 libopengl0 libxcb-cursor0 \
  libxkbcommon0 libglx0 libgl1 tzdata ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Calibre binary
RUN wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh | sh /dev/stdin install_dir=/opt version=7.24.0 \
  && ln -sf /opt/calibre/ebook-convert /usr/local/bin/ebook-convert \
  && ln -sf /opt/calibre/calibredb /usr/local/bin/calibredb \
  && ln -sf /opt/calibre/calibre-server /usr/local/bin/calibre-server

# Piper TTS only (whisper is too large — install via volume or at runtime)
RUN python3 -m venv /opt/ai-tools && \
  /opt/ai-tools/bin/pip install --no-cache-dir piper-tts && \
  ln -sf /opt/ai-tools/bin/piper /usr/local/bin/piper

# Agent
COPY /agent /app/agent

WORKDIR /app

COPY --from=build-client /client/dist /app/client/dist
COPY --from=build-client-v3 /client-v3/.output/public /app/client-v3/dist
COPY /client-v3-new /app/client-v3-new
COPY --from=build-server /server /app
COPY --from=build-server ${NUSQLITE3_PATH} ${NUSQLITE3_PATH}
COPY /start.sh /app/start.sh

EXPOSE 80

ENV PORT=80 NODE_ENV=production \
  CONFIG_PATH="/config" METADATA_PATH="/metadata" SOURCE="docker" \
  NUSQLITE3_DIR=${NUSQLITE3_DIR} NUSQLITE3_PATH=${NUSQLITE3_PATH} \
  CALIBRE_BIN=/usr/local/bin/ebook-convert \
  CALIBRE_SERVER_BIN=/usr/local/bin/calibre-server \
  CALIBREDB_BIN=/usr/local/bin/calibredb \
  TTS_ENGINE=piper TTS_BIN=/usr/local/bin/piper \
  PIPER_VOICE=/opt/piper-voices/en_US-lessac-medium.onnx

ENTRYPOINT ["tini", "--"]
CMD ["/bin/sh", "/app/start.sh"]
