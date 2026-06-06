# Server Performance Debugging

Use this when players report delayed hero commands, late-game slowdown, or a rising player/entity count that looks suspicious.

## Enable telemetry

Start the server with performance telemetry enabled:

```sh
SERVER_PERF_DEBUG=1 npm run start:server
```

For the full local client plus server stack:

```sh
SERVER_PERF_DEBUG=1 npm run dev
```

The server logs one sample every 10 seconds by default:

```text
[perf:sample] {...}
```

The live snapshot is available at:

```text
GET /debug/perf
```

Telemetry is disabled by default. When disabled, `/debug/perf` returns 404 unless normal server debug mode is enabled.

## Local UI

Run the local dashboard against the HAOS endpoint:

```sh
npm run perf:monitor
```

Then open:

```text
http://localhost:8787
```

By default this proxies:

```text
https://driftlands.andredegroot.duckdns.org/debug/perf
```

Use a different endpoint or port when needed:

```sh
PERF_MONITOR_TARGET=https://example.com/debug/perf PERF_MONITOR_PORT=8788 npm run perf:monitor
```

The UI uses a local proxy at `/api/perf`, so it can read production snapshots even when the remote server does not allow browser CORS requests from localhost.

## Useful knobs

All values are milliseconds.

```sh
SERVER_PERF_INTERVAL_MS=10000
SERVER_PERF_SLOW_TICK_MS=50
SERVER_PERF_SLOW_SYSTEM_MS=25
SERVER_PERF_SLOW_COMMAND_MS=75
SERVER_PERF_SLOW_PATH_MS=25
SERVER_PERF_SLOW_SAVE_MS=100
```

`DRIFTLANDS_PERF_DEBUG=1` is accepted as an alias for `SERVER_PERF_DEBUG=1`.

## What the snapshot captures

- `current.stats`: connected sockets, known players, connected players, heroes, settlers, tasks, active tasks, and active movements.
- `current.memory`: RSS and heap usage in MB.
- `current.eventLoop`: mean, max, p95, and p99 event loop delay.
- `current.ticks`: tick count, average tick duration, and max tick duration for the current sample window.
- `current.systems`: per-system count, average, max, and total duration.
- `current.commands`: server command duration aggregates, currently including `hero:move_request`.
- `current.pathfinding`: pathfinding aggregates grouped by source, for example `hero_command`, `runtime_move`, `task_resource_fetch`, and `settler_reachability`.
- `current.pathfindingCache`: pathfinding cache hit/miss counters grouped by source, for example `task_resource_fetch:hit` and `task_resource_fetch:miss`.
- `current.persistence`: save timing grouped by reason and status.
- `current.messages` and `current.messageBytes`: inbound/outbound socket message counts and outbound payload sizes by message type.

The snapshot also keeps recent `samples`, `slowTicks`, `slowSystems`, `slowCommands`, `slowPathfinds`, and `slowSaves` ring buffers.

## Triage flow

1. Capture `/debug/perf` before the slowdown, during the slowdown, and after a save/load cycle.
2. If event loop p95/p99 spikes while tick/system durations stay low, look for blocking work outside tick systems.
3. If `slowTicks` or `current.systems` names one system repeatedly, profile that system first.
4. If `hero:move_request` is slow, compare `pathfinding.hero_command` duration, path length, and `activeMovements`.
5. If players or connected players rise without matching socket counts, inspect player settlement state and reconnect handling.
6. If memory rises monotonically across samples, compare entity counts and message rates before assuming a heap leak.

For a lag report, attach the server log lines containing `[perf:sample]`, `[perf:slow_tick]`, `[perf:slow_command]`, and `[perf:slow_path]`, plus the `/debug/perf` JSON.
