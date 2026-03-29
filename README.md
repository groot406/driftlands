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

Start the full game locally:

```bash
npm start
```

Then open:

- client: `http://localhost:5173`
- server: `http://localhost:3000`

`npm start` runs both the client and the server together, which is the fastest way to get the game running for local development.
The Vite client and Socket.IO server also bind to your local network, so you can open the game from another device on the same Wi-Fi.

To play on an iPad or another device on your LAN:

1. Start the game with `npm start`
2. Find your computer's local IP address, for example with `ipconfig getifaddr en0` on macOS
3. Open `http://<your-local-ip>:5173` on the iPad

## Run Scripts

- `npm start` starts client and server together
- `npm run dev` does the same as `npm start`
- `npm run client` starts only the Vite client
- `npm run server` starts only the Socket.IO server with `nodemon`
- `npm run dev:client` keeps backward-compatible client startup
- `npm run dev:server` keeps backward-compatible server startup
- `npm run start:server` starts the server once without file watching
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

Helpful notes:

- the client talks to the local game server over Socket.IO
- Vite proxies `/socket.io` requests to `http://localhost:3000` during development, including when the page is opened via your LAN IP
- the client can also target a custom server with `VITE_SERVER_URL`
- the server supports `HOST`, `PORT`, `FRONTEND_ORIGIN`, `SERVER_TPS`, and `SERVER_SEED`
- `FRONTEND_ORIGIN` can be a comma-separated allowlist, or omitted to allow localhost plus common LAN origins by default

## What You Can Do In-Game

- explore a procedurally generated hex world
- select heroes and send them across the map
- queue tile actions like chopping, planting, mining, and irrigation
- collect shared resources and expand your little settlement loop
- use multiplayer presence and chat while testing the sandbox

## Controls

- click a hero or hero portrait to select it
- press `1-9` to select a hero directly
- press `Tab` to cycle heroes
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
