# syntax=docker/dockerfile:1

FROM node:20-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi

COPY server ./server
COPY src ./src
COPY public ./public
COPY tsconfig.server.json ./

EXPOSE 3000

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    SERVER_DEBUG_MODE=0 \
    SERVER_TPS=10 \
    DRIFTLANDS_ANALYTICS_PATH=/data/analytics \
    DRIFTLANDS_ANALYTICS_RETENTION_DAYS=30

CMD ["npm", "run", "start:server:no-debug"]
