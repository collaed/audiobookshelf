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

### STAGE 1: Build server ###
FROM node:20-alpine AS build-server

ARG NUSQLITE3_DIR
ARG TARGETPLATFORM

ENV NODE_ENV=production

RUN apk add --no-cache --update \
  curl \
  make \
  python3 \
  g++ \
  unzip

WORKDIR /server
COPY index.js package* /server
COPY /server /server/server

RUN case "$TARGETPLATFORM" in \
  "linux/amd64") \
  curl -L -o /tmp/library.zip "https://github.com/mikiher/nunicode-sqlite/releases/download/v1.2/libnusqlite3-linux-x64.zip" ;; \
  "linux/arm64") \
  curl -L -o /tmp/library.zip "https://github.com/mikiher/nunicode-sqlite/releases/download/v1.2/libnusqlite3-linux-arm64.zip" ;; \
  *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
  esac && \
  unzip /tmp/library.zip -d $NUSQLITE3_DIR && \
  rm /tmp/library.zip

RUN npm ci --only=production

### STAGE 2: Runtime — Debian slim (supports Calibre, Piper, Whisper) ###
FROM node:20-slim

ARG NUSQLITE3_DIR
ARG NUSQLITE3_PATH

# System deps: ffmpeg, tini, python3, calibre deps, piper/whisper deps
RUN apt-get update && apt-get install -y --no-install-recommends \
  tini \
  ffmpeg \
  python3 \
  python3-pip \
  python3-venv \
  wget \
  xz-utils \
  xdg-utils \
  libegl1 \
  libopengl0 \
  libxcb-cursor0 \
  libxkbcommon0 \
  libglx0 \
  libgl1 \
  tzdata \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install Calibre binary (ebook-convert, calibredb, calibre-server)
RUN wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh | sh /dev/stdin install_dir=/opt version=7.24.0 \
  && ln -sf /opt/calibre/ebook-convert /usr/local/bin/ebook-convert \
  && ln -sf /opt/calibre/calibredb /usr/local/bin/calibredb \
  && ln -sf /opt/calibre/calibre-server /usr/local/bin/calibre-server

# Install Piper TTS and Whisper STT
RUN python3 -m venv /opt/ai-tools && \
  /opt/ai-tools/bin/pip install --no-cache-dir \
    piper-tts \
    openai-whisper && \
  ln -sf /opt/ai-tools/bin/piper /usr/local/bin/piper && \
  ln -sf /opt/ai-tools/bin/whisper /usr/local/bin/whisper

# Download a default Piper voice model (en_US, medium quality)
RUN mkdir -p /opt/piper-voices && \
  wget -nv -O /opt/piper-voices/en_US-lessac-medium.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx" && \
  wget -nv -O /opt/piper-voices/en_US-lessac-medium.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

# Copy agent
COPY /agent /app/agent

WORKDIR /app

# Copy compiled frontend and server from build stages
COPY --from=build-client /client/dist /app/client/dist
COPY --from=build-client-v3 /client-v3/.output/public /app/client-v3/dist
COPY /client-v3-new /app/client-v3-new
COPY --from=build-server /server /app
COPY --from=build-server ${NUSQLITE3_PATH} ${NUSQLITE3_PATH}

EXPOSE 80

ENV PORT=80
ENV NODE_ENV=production
ENV CONFIG_PATH="/config"
ENV METADATA_PATH="/metadata"
ENV SOURCE="docker"
ENV NUSQLITE3_DIR=${NUSQLITE3_DIR}
ENV NUSQLITE3_PATH=${NUSQLITE3_PATH}
ENV CALIBRE_BIN=/usr/local/bin/ebook-convert
ENV CALIBRE_SERVER_BIN=/usr/local/bin/calibre-server
ENV CALIBREDB_BIN=/usr/local/bin/calibredb
ENV TTS_ENGINE=piper
ENV TTS_BIN=/usr/local/bin/piper
ENV PIPER_VOICE=/opt/piper-voices/en_US-lessac-medium.onnx
ENV WHISPER_BIN=/usr/local/bin/whisper

COPY /start.sh /app/start.sh

ENTRYPOINT ["tini", "--"]
CMD ["/bin/sh", "/app/start.sh"]
