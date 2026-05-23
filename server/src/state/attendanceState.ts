// Default to active so isolated system tests keep their historical behavior.
// worldState.init resets this to 0 before the real server starts accepting players.
let activePlayerCount = 1;
let unattendedSinceMs: number | null = null;

export function getActivePlayerCount() {
  return activePlayerCount;
}

export function hasActivePlayers() {
  return activePlayerCount > 0;
}

export function noteFirstActivePlayer(now: number = Date.now()) {
  activePlayerCount = Math.max(1, activePlayerCount);
  const since = unattendedSinceMs;
  unattendedSinceMs = null;

  if (since == null || since >= now) {
    return null;
  }

  return {
    startedAtMs: since,
    endedAtMs: now,
    offlineMs: now - since,
  };
}

export function noteActivePlayerCount(count: number, now: number = Date.now()) {
  const previous = activePlayerCount;
  activePlayerCount = Math.max(0, Math.trunc(count));

  if (previous > 0 && activePlayerCount === 0 && unattendedSinceMs == null) {
    unattendedSinceMs = now;
  }
}

export function resetAttendanceState() {
  activePlayerCount = 0;
  unattendedSinceMs = null;
}
