import type { CoopPingKind } from '../shared/coop/types';
import { sendMessage } from './socket';

export function requestHeroClaim(heroId: string) {
  sendMessage({
    type: 'coop:hero_claim',
    heroId,
    timestamp: Date.now(),
  });
}

export function requestHeroRelease(heroId: string) {
  sendMessage({
    type: 'coop:hero_release',
    heroId,
    timestamp: Date.now(),
  });
}

export function setReadyState(ready: boolean) {
  sendMessage({
    type: 'coop:set_ready',
    ready,
    timestamp: Date.now(),
  });
}

export function sendCoopPing(kind: CoopPingKind, position: { q: number; r: number }, heroId?: string) {
  sendMessage({
    type: 'coop:request_ping',
    kind,
    q: position.q,
    r: position.r,
    heroId,
    timestamp: Date.now(),
  });
}
