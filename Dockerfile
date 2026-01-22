# syntax=docker/dockerfile:1

# Use a small, modern Node.js base image
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install all dependencies (including dev) so tsx is available to run TS directly
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# Copy project files
COPY . .

# The server listens on 3000 inside the container
EXPOSE 3000

# Environment defaults (can be overridden at runtime)
ENV SERVER_TPS=10 \
    SERVER_SEED=123456789 \
    NODE_ENV=production

# Start the server
CMD ["npm", "run", "start:server"]
