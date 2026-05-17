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
- `SERVER_DEBUG_MODE`: debug/test helpers toggle, default enabled; set `0`, `false`, `no`, or `off` to disable
- `SERVER_SETTLEMENT_START_MODE`: settlement placement mode, `candidates` or `free`
- `SERVER_SPAWN_SAFETY`: safer world-generation spawn constraints toggle, default disabled
- `LOOPERLANDS_API_URL`: Looperlands API URL used by the Driftlands server for wallet validation and proxying
- `SERVER_REQUIRE_LOOPERLANDS_AUTH`: force wallet auth requirement when set to `1`
- `DRIFTLANDS_ENV_FILE`: optional server-only env file path; when set in the shell, the server loads only that file

Helpful notes:

- the client talks to the local game server over Socket.IO
- Vite proxies `/socket.io` requests to `http://localhost:3000` during development and preview, including when the page is opened via your LAN IP or a forwarded public `5173` port
- the client can also target a custom server with `VITE_SERVER_URL`
- omit `SERVER_SEED` to let the server roll a fresh random world/story seed on startup; set it only when you want a fixed run
- set `SERVER_DEBUG_MODE=0` to disable Tab helper panels, render/debug controls, test-mode controls, and debug restart handling for connected clients
- `FRONTEND_ORIGIN` can be a comma-separated allowlist, or omitted to allow localhost, common LAN origins, and ngrok-free.app by default

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
