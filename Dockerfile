# PWD Works Tracker – container image (Render / Docker / any host)
FROM node:20-bookworm-slim
WORKDIR /app

# Build toolchain required by native modules (better-sqlite3 compiles via node-gyp
# when no prebuilt binary matches the target)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY assets ./assets

ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
