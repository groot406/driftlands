# Docker Setup for Driftlands

This project includes Docker and Docker Compose configurations for both development and production environments.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+

## Development Setup

The development setup runs both the frontend (Vite) and backend (Express + Socket.io) as separate services with hot-reload enabled.

### Start Development Environment

```bash
docker-compose up
```

This will:
- Start the backend server on `http://localhost:3000`
- Start the Vite dev server on `http://localhost:5173`
- Enable hot-reload for both frontend and backend code changes

Access the application at: **http://localhost:5173**

### Stop Development Environment

```bash
docker-compose down
```

### Rebuild After Dependency Changes

If you modify `package.json`, rebuild the containers:

```bash
docker-compose up --build
```

## Production Setup

The production setup builds the frontend and serves it alongside the backend from a single container.

### Build and Start Production Environment

```bash
docker-compose -f docker-compose.prod.yml up --build
```

Access the application at: **http://localhost:3000**

### Stop Production Environment

```bash
docker-compose -f docker-compose.prod.yml down
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Key environment variables:

- `PORT`: Server port (default: 3000)
- `SERVER_TPS`: Server ticks per second (default: 10)
- `SERVER_SEED`: Random seed for world generation (default: 123456789)
- `NODE_ENV`: Environment mode (development/production)
- `FRONTEND_ORIGIN`: CORS origin for frontend (default: http://localhost:5173)

### Docker Compose Services

#### Development (`docker-compose.yml`)

- **backend**: Express server with Socket.io
  - Port: 3000
  - Hot-reload enabled via volume mounts

- **frontend**: Vite dev server
  - Port: 5173
  - Hot-reload enabled via volume mounts
  - Proxies Socket.io requests to backend

#### Production (`docker-compose.prod.yml`)

- **app**: Combined frontend + backend
  - Port: 3000
  - Frontend built and served as static files
  - Optimized for production use

## Useful Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Execute Commands in Container

```bash
# Backend container
docker-compose exec backend sh

# Frontend container
docker-compose exec frontend sh
```

### Clean Up

Remove all containers, networks, and volumes:

```bash
docker-compose down -v
```

## Troubleshooting

### Port Already in Use

If ports 3000 or 5173 are already in use, modify the port mappings in `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # Maps host port 3001 to container port 3000
```

### Hot Reload Not Working

Ensure volume mounts are correctly configured and your Docker installation supports file watching.

### Module Not Found Errors

Rebuild the containers to reinstall dependencies:

```bash
docker-compose down
docker-compose up --build
```
