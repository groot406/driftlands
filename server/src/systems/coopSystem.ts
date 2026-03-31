import type { TickContext } from '../tick';
import type { CoopSnapshotMessage } from '../../../src/shared/protocol';
import { heroes } from '../../../src/shared/game/state/heroStore';
import { broadcast } from '../messages/messageRouter';
import { coopState } from '../state/coopState';

/** Only run the idle-hero check once per second (not every tick). */
const CHECK_INTERVAL_MS = 1000;
let lastCheckAt = 0;

function broadcastSnapshot() {
  const message: CoopSnapshotMessage = {
    type: 'coop:snapshot',
    state: coopState.getSnapshot(),
    timestamp: Date.now(),
  };

  broadcast(message);
}

export const coopSystem = {
  name: 'coop',

  tick: (ctx: TickContext) => {
    if (ctx.now - lastCheckAt < CHECK_INTERVAL_MS) {
      return;
    }

    lastCheckAt = ctx.now;

    const released = coopState.releaseIdleHeroes(heroes, ctx.now);
    if (released.length > 0) {
      broadcastSnapshot();
    }
  },
};
