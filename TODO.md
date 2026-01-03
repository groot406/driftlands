# Server-Authoritative Client-Server Split Refactor TODO

Status legend:
- [ ] pending

Core steps

1) Protocol and Contracts
- [ ] Audit and expand `src/shared/protocol.ts` to cover all message types with strict typing and versioning.
- [ ] Add correlation IDs and server timestamps; standardize acknowledgments where needed.
- [ ] Add runtime validation (e.g., Zod) for all incoming/outgoing messages.

2) Server as Source of Truth
- [ ] Move authoritative game state into `server/src/state/` (world, entities, tasks, sessions).

3) Server Tick and Systems
- [x] Introduce a central tick loop (configurable TPS) and modular systems (movement, tasks, growth).
- [x] Ensure deterministic updates and seeded RNG.

4) Messaging & Validation
- [ ] Validate all incoming messages; enforce permissions and idempotency.
- [ ] Add per-socket rate limiting; standardize error responses.

5) Server Stores & Persistence
- [ ] Add optional persistence (snapshot + replay) for world and entities.

6) Client Refactor: Render, Don’t Decide
- [ ] Replace client-side authority with request → server confirm → event updates.
- [ ] Update `src/store/*` to be read-only projections; actions send requests.

7) Diff-based State Updates
- [ ] Server computes diffs; client applies efficiently; snapshot resync fallback.

8) Authentication and Sessions
- [ ] Add session management and reconnection handling.

9) Observability and Testing
- [ ] Add unit tests for task/movement/terrain systems.
- [ ] Add integration tests for protocol using mock client/server.
- [ ] Structured logging and metrics (tick duration, messages/sec).

10) Incremental Migration Plan
- [ ] Phase migration of subsystems (tasks → movement → world growth → etc.).

11) Performance, Scaling, Persistence
- [ ] Bound tick workload; batch updates; consider rooms per world instance.
- [ ] Persistence for world snapshots; profile hotspots.

12) Developer UX and Docs
- [ ] Architecture doc (server vs client, message flows, tick lifecycle).
- [ ] Dev script for running server+client with hot reload.
- [ ] Contribution guide for adding new actions.

13) Safety and Edge Cases
- [ ] Handle invalid IDs, out-of-bounds, task preconditions, resource conflicts.
- [ ] Desync recovery via snapshot; graceful disconnect behavior.

14) Codebase Hygiene
- [ ] Stricter TS configs for server; lint rule to prevent cross-layer imports.
