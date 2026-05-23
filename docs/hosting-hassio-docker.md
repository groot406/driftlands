# Hosting Driftlands on HAOS with Docker

This guide hosts the Driftlands server on a Mac mini running Home Assistant OS with Docker access. The browser client is served by `looperlands-platform-frontend` at `/driftlands`; this container only runs the Driftlands game server, Socket.IO, and API routes.

## Optional Hosting TUI

This repository includes a console TUI for the common Docker hosting tasks:

```bash
npm run hosting:tui
```

For a shorter command, install the local package bin once from this repository:

```bash
npm link
```

Then start it with:

```bash
driftlands
```

`driftlands tui` and `driftlands hosting` start the same menu. `driftlands external` or `npm run external` starts the backend-only public server from `.env.external`, asking for the hosted frontend origin the first time. `driftlands https` or `npm run external:https` starts a local Caddy HTTPS proxy for the backend, asking for a real backend hostname the first time. Use arrow keys or `j`/`k` to move, Enter to select, and `q` to exit. Set `DRIFTLANDS_TUI_NO_ANIMATION=1` if you want to disable the startup animation.

The main menu is grouped by task:

- `Overview`: check Docker containers, server image, and platform frontend git status.
- `Server hosting`: build the image and manage the Driftlands/Caddy Docker stack.
- `Home Assistant Docker`: build an image bundle locally and install it from Home Assistant WebSSH.
- `Server config`: edit server env values such as `SERVER_DEBUG_MODE`, `SERVER_TPS`, `SERVER_SETTLEMENT_START_MODE`, `SERVER_SPAWN_SAFETY`, `SERVER_REQUIRE_LOOPERLANDS_AUTH`, `SERVER_SEED`, `LOOPERLANDS_API_URL`, `FRONTEND_ORIGIN`, `HOST`, and `PORT`.
- `Frontend deployment`: copy the current Driftlands client into the platform repo, install dependencies, build, commit, push, and run an optional deploy hook.
- `Diagnostics`: tail logs and check `/health`.
- `Commands and env snippets`: print copy/paste Docker commands and frontend env vars.

Use `Server config` in the TUI to change server variables. Docker containers do not reload `--env-file` values on a plain restart, so choose `Save and recreate server` after editing variables that should apply immediately.

Use `Frontend deployment` in the TUI to copy the current Driftlands client into `looperlands-platform-frontend`, install dependencies, build the platform frontend, commit the platform changes, push the current branch, and run an optional deploy command.

Use `Home Assistant Docker` when you can access HAOS through WebSSH but cannot use normal SSH copy. The guided publish flow builds `driftlands:latest`, writes `output/haos/driftlands.env`, exports `output/haos/driftlands-image.tar`, serves those files temporarily over your LAN, and prints one `curl ... | sh` command to paste into Home Assistant WebSSH. It asks which Home Assistant Docker platform to build for, defaulting to `linux/amd64`, and which Home Assistant host port should publish Driftlands, defaulting to `3000`. If that port is already used, the WebSSH installer automatically tries the next 50 ports and prints the selected port. Use that selected port in Nginx Proxy Manager. Keep the TUI open until the WebSSH install finishes.

By default, it uses the same names as this guide. Override them with environment variables when needed:

```bash
DRIFTLANDS_DOMAIN=driftlands.example.com \
DRIFTLANDS_CONFIG_DIR=/config/driftlands \
FRONTEND_ORIGIN=https://<looperlands-platform-frontend-domain> \
npm run hosting:tui
```

Useful overrides:

```dotenv
DRIFTLANDS_IMAGE=driftlands:latest
DRIFTLANDS_DOMAIN=driftlands.example.com
DRIFTLANDS_CONFIG_DIR=/config/driftlands
DRIFTLANDS_ENV_FILE=/config/driftlands/.env
DRIFTLANDS_CADDYFILE=/config/driftlands/Caddyfile
DRIFTLANDS_HEALTH_URL=https://driftlands.example.com/health
DRIFTLANDS_DOCKER_NETWORK=driftlands-net
DRIFTLANDS_CONTAINER=driftlands
DRIFTLANDS_CADDY_CONTAINER=driftlands-caddy
DRIFTLANDS_CADDY_DATA_VOLUME=driftlands-caddy-data
DRIFTLANDS_FRONTEND_REPO=/path/to/looperlands-platform-frontend
DRIFTLANDS_FRONTEND_COMMIT_MESSAGE=Update embedded Driftlands client
DRIFTLANDS_FRONTEND_DEPLOY_COMMAND=npm run deploy
DRIFTLANDS_TUI_NO_ANIMATION=1
FRONTEND_ORIGIN=https://<looperlands-platform-frontend-domain>
```

If `DRIFTLANDS_FRONTEND_DEPLOY_COMMAND` is empty, the TUI will build, commit, and push, but it will skip the deploy step. Set it to the command your platform host expects, such as `npm run deploy`, `vercel --prod`, or `docker compose up -d --build`.

If your local Docker CLI can reach the HAOS machine over SSH, you can also use Docker's remote host support:

```bash
DOCKER_HOST=ssh://root@<haos-hostname-or-ip> npm run hosting:tui
```

When using `DOCKER_HOST=ssh://...`, Docker commands run against the remote host, but template file writing still writes on the machine running the TUI. Create `/config/driftlands/.env` and `/config/driftlands/Caddyfile` on the HAOS host before starting the containers.

## 1. Build or Pull the Image

Build the image from this repository:

```bash
docker build -t driftlands:latest .
```

Alternatively, build it elsewhere, push it to a registry, and pull it on the HAOS host:

```bash
docker pull <registry>/driftlands:latest
docker tag <registry>/driftlands:latest driftlands:latest
```

## 2. Create the Environment File

On the HAOS host:

```bash
mkdir -p /config/driftlands
vi /config/driftlands/.env
```

Use this as the starting point:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

SERVER_DEBUG_MODE=0
SERVER_TPS=10
SERVER_SETTLEMENT_START_MODE=candidates
SERVER_SPAWN_SAFETY=0
SERVER_REQUIRE_LOOPERLANDS_AUTH=0
SERVER_SEED=

LOOPERLANDS_API_URL=https://api.looperlands.io/api
FRONTEND_ORIGIN=https://<looperlands-platform-frontend-domain>
```

Leave `SERVER_SEED` empty unless you want the same world after every restart.

## 3. Run the Driftlands Server

Create a Docker network once:

```bash
docker network create driftlands-net
```

Start the Driftlands server:

```bash
docker run -d \
  --name driftlands \
  --restart unless-stopped \
  --network driftlands-net \
  --env-file /config/driftlands/.env \
  driftlands:latest
```

## 4. Run Caddy for HTTPS

Create `/config/driftlands/Caddyfile`:

```caddyfile
driftlands.example.com {
  reverse_proxy driftlands:3000
}
```

Start Caddy:

```bash
docker run -d \
  --name driftlands-caddy \
  --restart unless-stopped \
  --network driftlands-net \
  -p 80:80 \
  -p 443:443 \
  -v /config/driftlands/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v driftlands-caddy-data:/data \
  caddy:2
```

## 5. Router and DNS

1. Give the Mac mini a static LAN IP or DHCP reservation.
2. Forward public TCP `80` and `443` to the Mac mini.
3. Point `driftlands.example.com` to your home public IP.
4. Use `https://driftlands.example.com` as the frontend `VITE_DRIFTLANDS_SERVER_URL`.

## 6. Verification

Check container logs:

```bash
docker logs -f driftlands
docker logs -f driftlands-caddy
```

Verify the public health endpoint:

```bash
curl https://driftlands.example.com/health
```

The expected response is:

```json
{"status":"ok"}
```

Then open the hosted Looperlands platform frontend `/driftlands` route and confirm:

- the browser does not show mixed-content errors;
- Socket.IO connects to `https://driftlands.example.com/socket.io`;
- wallet login still goes through the Driftlands server;
- `/api/looperlands` and `/api/driftlands` requests go to the Driftlands backend.
