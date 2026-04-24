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

### STAGE 2: Runtime — Debian slim (no Calibre, no Piper — delegated to intello/BC) ###
FROM node:20-slim

ARG NUSQLITE3_DIR
ARG NUSQLITE3_PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
  tini ffmpeg tzdata ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY /agent /app/agent

WORKDIR /app

COPY --from=build-client /client/dist /app/client/dist
COPY --from=build-client-v3 /client-v3/.output/public /app/client-v3/dist
COPY /client-v3-new /app/client-v3-new
COPY --from=build-server /server /app
COPY --from=build-server ${NUSQLITE3_PATH} ${NUSQLITE3_PATH}

EXPOSE 80

ENV PORT=80 NODE_ENV=production \
  CONFIG_PATH="/config" METADATA_PATH="/metadata" SOURCE="docker" \
  NUSQLITE3_DIR=${NUSQLITE3_DIR} NUSQLITE3_PATH=${NUSQLITE3_PATH}

ENTRYPOINT ["tini", "--"]
CMD ["node", "index.js"]
