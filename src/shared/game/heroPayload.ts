import type { HeroPayloadUpdateMessage } from '../protocol';
import type { Hero } from './types/Hero';
import type { ResourceAmount } from './types/Resource';
import type { TaskType } from './types/Task';
import { broadcastGameMessage as broadcast } from './runtime';

export function setHeroPayload(hero: Hero, payload: ResourceAmount | null | undefined) {
  hero.carryingPayload = payload ?? undefined;
  broadcast({
    type: 'hero:payload_update',
    heroId: hero.id,
    payload: payload ?? null,
  } as HeroPayloadUpdateMessage);
}

export function clearHeroPayload(hero: Hero) {
  setHeroPayload(hero, null);
}

export function setHeroFetchIntent(
  hero: Hero,
  sourceTileId: string,
  taskType: TaskType,
  returnPos: { q: number; r: number },
  resource: ResourceAmount,
) {
  hero.pendingTask = {
    tileId: sourceTileId,
    taskType,
  };
  hero.returnPos = returnPos;
  setHeroPayload(hero, {
    type: resource.type,
    amount: -Math.abs(resource.amount),
  });
}
