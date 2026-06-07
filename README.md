# Driftlands

Driftlands is a hex-based colony sandbox prototype built with Vue, TypeScript, Canvas, and Socket.IO. You guide a small crew of heroes across a procedurally generated world, queue jobs on tiles, gather resources, and slowly reshape the map through farming, forestry, mining, and exploration.

This repository contains both sides of the game:

- the Vite-powered browser client in `src/`
- the real-time Socket.IO server in `server/`
- shared protocol and task definitions in `src/shared/`

## Quick Start

Requirements:

- Node.js
- npm

Install dependencies:

```bash
npm install
```

To enable WalletConnect wallets such as Loopring Wallet, create a project in Reown Cloud and set the project id before starting:

```bash
VITE_WALLETCONNECT_PROJECT_ID=<your-reown-project-id> npm start
```

Without `VITE_WALLETCONNECT_PROJECT_ID`, wallet login falls back to injected browser wallets such as MetaMask.

Start the full game locally:

```bash
npm start
```

Then open:

- client: `http://localhost:5173`
- server: `http://localhost:3000`

`npm start` runs both the client and the server using the values in `.env.local`.
The Vite client and Socket.IO server also bind to your local network, so you can open the game from another device on the same Wi-Fi.

To start in debug/test mode with the helper panels enabled, set `SERVER_DEBUG_MODE=true` in `.env.local` and run:

```bash
npm run dev
```

In-game, press `F2`, backtick, or `Tab` to toggle the debug helper panel. Use a `no-debug` script when you want that panel disabled regardless of `.env.local`.

To play on an iPad or another device on your LAN:

1. Start the game with `npm start`
2. Find your computer's local IP address, for example with `ipconfig getifaddr en0` on macOS
3. Open `http://<your-local-ip>:5173` on the iPad

To run only the public-facing server for an online-hosted frontend:

```bash
npm run external
```

The first run asks for the online frontend origin, then saves the answer in `.env.external`. Later runs reuse that file, bind the server to `0.0.0.0:3000`, disable debug helpers, use the hosted Looperlands API, and allow the saved frontend origin for Socket.IO/API requests.

If you installed the local `driftlands` command with `npm link`, the same launcher is available as:

```bash
driftlands external
```

For an HTTPS backend URL, use a real hostname such as `driftlands.looperlands.io`; browsers will not trust a certificate for the raw public IP address. Point that hostname at your public IP, forward public TCP `80` and `443` to this machine, start the Driftlands server, then start the local Caddy proxy:

```bash
npm run external
npm run external:https
```

The HTTPS helper asks for the backend hostname once, writes `.env.https` and `.caddy/Caddyfile`, then runs a Caddy Docker container that proxies `https://<hostname>` to the local server on `localhost:3000`.

To publish the backend as a Docker container on Home Assistant OS from this machine:

```bash
npm run haos:deploy
```

The guided flow builds `driftlands:latest`, exports it into `output/haos`, starts a temporary LAN bundle server, and prints one command to paste into Home Assistant WebSSH. It defaults to a `linux/amd64` image for HAOS and host port `3695`. After that, point Nginx Proxy Manager at the Home Assistant host and the selected port.

For the regular full deploy flow:

```bash
npm run deploy
```

This first asks whether to deploy frontend, backend, or both, then prints a plan before running anything. The backend path uses `ssh haos`, copies the bundle to `/config/driftlands`, recreates the Docker container, and waits for `/health`. Use `npm run deploy -- frontend`, `npm run deploy -- backend`, or `npm run deploy -- both` to preselect the target.

To play from outside your network through router port forwarding:

1. Start the client and server together with `npm start`, or run `npm run start:server:no-debug` next to `npm run preview`
2. Forward external port `5173` to this computer's port `5173`
3. Open `http://<your-public-ip-or-hostname>:5173`

Socket.IO uses `/socket.io` on the same public `5173` origin and Vite forwards that traffic to the local game server on `3000`, so you do not need to expose port `3000` separately for the default setup.

## Run Scripts

- `npm start` starts client and server together using `.env.local`
- `npm run start:free` starts client and server together with `SERVER_SETTLEMENT_START_MODE=free`
- `npm test` runs the same debug startup as `npm run dev`
- `npm run dev` starts client and server together using `.env.local`
- `npm run dev:no-debug` starts client and server together with debug/test helpers disabled
- `npm run dev:free` starts client and server together with `SERVER_SETTLEMENT_START_MODE=free`
- `npm run client` starts only the Vite client
- `npm run server` starts only the Socket.IO server with `nodemon`
- `npm run server:no-debug` starts only the Socket.IO server with debug/test helpers disabled
- `npm run dev:client` keeps backward-compatible client startup
- `npm run dev:server` keeps backward-compatible server startup
- `npm run start:server` starts the server once without file watching
- `npm run start:server:no-debug` starts the server once with debug/test helpers disabled
- `npm run external` starts only the public-facing server on `0.0.0.0:3000`; it asks for the frontend origin once and stores it in `.env.external`
- `npm run external:https` starts a local Caddy HTTPS proxy in Docker; it asks for the backend hostname once and stores it in `.env.https`
- `npm run start-external` is a longer alias for `npm run external`
- `npm run start:external` is an alias for `npm run start-external`
- `npm run deploy` lets you choose frontend, backend, or both, prints a plan, then runs the selected deployment
- `npm run haos:deploy` builds and serves a Home Assistant Docker install bundle for WebSSH
- `npm run test:unit` runs the automated test suite
- `npm run build` builds the client for production
- `npm run preview` previews the built client

## Repo Overview

```text
src/
  components/   Vue UI, menus, overlays, and canvas host components
  core/         rendering, camera, world helpers, audio, networking, pathfinding
  store/        reactive client-side game state
  shared/       protocol types and shared task definitions
server/
  handlers/     player, movement, and task handlers
  systems/      tick-driven simulation systems
  messages/     server-side message routing and logging
```

## Environment

Copy `.env.example` to `.env.local` to manage local configuration in one place:

```bash
cp .env.example .env.local
```

The Vite client reads `VITE_*` variables from `.env.local`. The Driftlands server now reads `.env` and `.env.local` on startup too. Values exported in your shell take precedence over file values, and `.env.local` overrides `.env`.

Available variables:

- `VITE_SERVER_URL`: explicit Socket.IO/API origin for the browser client; leave empty to use the current origin and Vite proxy
- `VITE_LOOPERLANDS_API_URL`: Looperlands API URL used by the browser client
- `VITE_API_URL`: legacy client alias for `VITE_LOOPERLANDS_API_URL`
- `VITE_WALLETCONNECT_PROJECT_ID`: Reown Cloud project id for WalletConnect wallets such as Loopring Wallet
- `HOST`: server bind host, default `0.0.0.0`
- `PORT`: server port, default `3000`
- `FRONTEND_ORIGIN`: comma-separated Socket.IO/API CORS allowlist; leave empty for localhost, LAN origins, and ngrok-free.app
- `SERVER_TPS`: server simulation ticks per second, default `10`
- `SERVER_SEED`: fixed world seed; leave empty for a random world
- `SERVER_SAVE_PATH`: JSON snapshot path for persistent server progress; local non-production runs default to `.driftlands/world-save.json`, HAOS uses `/data/world-save.json`
- `SERVER_SAVE_INTERVAL_MS`: autosave interval for `SERVER_SAVE_PATH`, default `5000`
- `SERVER_DEBUG_MODE`: debug/test helpers toggle, default enabled; set `0`, `false`, `no`, or `off` to disable
- `SERVER_SETTLEMENT_START_MODE`: settlement placement mode, `candidates` or `free`
- `SERVER_SPAWN_SAFETY`: safer world-generation spawn constraints toggle, default disabled
- `LOOPERLANDS_API_URL`: Looperlands API URL used by the Driftlands server for wallet validation and proxying
- `SERVER_REQUIRE_LOOPERLANDS_AUTH`: force wallet auth requirement when set to `1`
- `DRIFTLANDS_ADMIN_WALLETS`: comma-separated wallet allowlist for production admin controls; casing does not matter
- `DRIFTLANDS_ENV_FILE`: optional server-only env file path; when set in the shell, the server loads only that file
- `DRIFTLANDS_DISCORD_BOT_TOKEN`: server-only Discord bot token for in-game chat logging; `DISCORD_TOKEN` is also accepted as a fallback
- `DRIFTLANDS_DISCORD_CHANNEL_ID`: existing Discord text channel ID for chat logs; when set, Driftlands sends directly to this channel
- `DRIFTLANDS_DISCORD_GUILD_ID`: Discord server/guild ID; when no channel ID is set, Driftlands uses this plus the bot token to find or create the chat log channel
- `DRIFTLANDS_DISCORD_CHANNEL_NAME`: channel name to find/create when using `DRIFTLANDS_DISCORD_GUILD_ID`, default `driftlands-chat`
- `DRIFTLANDS_DISCORD_CATEGORY_ID`: optional Discord category ID for the auto-created chat log channel
- `DRIFTLANDS_DISCORD_WEBHOOK_URL`: optional webhook-only fallback; this can post chat logs but cannot create channels

Helpful notes:

- the client talks to the local game server over Socket.IO
- Vite proxies `/socket.io` requests to `http://localhost:3000` during development and preview, including when the page is opened via your LAN IP or a forwarded public `5173` port
- the client can also target a custom server with `VITE_SERVER_URL`
- `npm run external` uses `.env.external`; edit that file when you want to change the public server port, debug mode, auth requirement, world seed, or allowed frontend origin
- `npm run external:https` uses `.env.https`; edit that file when you want to change the HTTPS backend hostname or Caddy container name
- omit `SERVER_SEED` to let the server roll a fresh random world/story seed on startup; set it only when you want a fixed run
- set `SERVER_SAVE_PATH` to keep the current world, settlements, resources, workers, tasks, ownership, market, ship orders, run state, and season state across server restarts; local non-production runs use `.driftlands/world-save.json` when this is empty
- set `SERVER_DEBUG_MODE=0` to disable Tab helper panels, render/debug controls, test-mode controls, and debug restart handling for connected clients
- `FRONTEND_ORIGIN` can be a comma-separated allowlist, or omitted to allow localhost, common LAN origins, and ngrok-free.app by default
- put Discord credentials only in server env files such as `.env.local`, `.env.external`, backend service env vars, or `/config/driftlands/.env` on HAOS; do not use `VITE_*` for Discord secrets
- to let Driftlands create `driftlands-chat`, invite the bot to the Discord server with `Manage Channels` and `Send Messages`; if you create the channel manually and set `DRIFTLANDS_DISCORD_CHANNEL_ID`, `Send Messages` is enough

## Backend Deployment

For a backend-only host, run the Socket.IO/API server without the Vite client:

```bash
npm ci
npm run external
```

Use `npm run external` for hosted environments. It creates `.env.external` on first run and starts the same one-shot server process each time. `npm run server:no-debug` uses `nodemon`, which is meant for local file-watching during development.

Set these environment variables on the backend service:

```bash
HOST=0.0.0.0
PORT=3000
NODE_ENV=production
SERVER_DEBUG_MODE=0
SERVER_TPS=10
FRONTEND_ORIGIN=https://your-frontend-domain.example
LOOPERLANDS_API_URL=https://api.looperlands.io/api
SERVER_REQUIRE_LOOPERLANDS_AUTH=1
DRIFTLANDS_ADMIN_WALLETS=0xfE49e5c384f5FddDFc52e9610BfAB3d49D86847D
DRIFTLANDS_DISCORD_BOT_TOKEN=<discord-bot-token>
DRIFTLANDS_DISCORD_GUILD_ID=<discord-server-id>
DRIFTLANDS_DISCORD_CHANNEL_NAME=driftlands-chat
```

The included `Procfile` starts the same non-debug server command for Node buildpack platforms. If you deploy with Docker, the `Dockerfile` also uses that command.

### Persistent Server Progress

The server can persist the active world to a JSON snapshot. Local non-production runs default to `.driftlands/world-save.json`; production runs should set `SERVER_SAVE_PATH` explicitly. The server restores that file on startup, saves every `SERVER_SAVE_INTERVAL_MS`, and flushes once more on `SIGTERM`/`SIGINT`.

For Docker/HAOS deployments, mount a host directory to `/data` and use:

```bash
SERVER_SAVE_PATH=/data/world-save.json
```

The included HAOS deploy scripts now create `/config/driftlands/state`, mount it as `/data`, and stop the old container before recreating it so the final save can be written.

## What You Can Do In-Game

- explore a procedurally generated hex world
- select heroes and send them across the map
- queue tile actions like chopping, planting, mining, and irrigation
- collect shared resources and expand your little settlement loop
- use multiplayer presence and chat while testing the sandbox

## Controls

- click a hero or hero portrait to select it
- press `1-9` to select a hero directly
- press `[` or `]` to cycle heroes
- press `Tab` to show playtest/debug controls when the server allows debug mode
- click a tile to move or open its task menu
- drag to move the camera
- press `Escape` to open the in-game menu
- use the online players button to open chat

## Project Status

The game is already playable as an early sandbox, but it is still in active iteration. The simulation, task system, and map interactions are ahead of the long-term progression layer, and the codebase is still moving toward a cleaner server-authoritative architecture.

For deeper project notes, see:

- `AGENT.md` for codebase notes and guardrails
- `IDEAS.md` for gameplay and feature ideas
- `TODO.md` for current cleanup and refactor work
