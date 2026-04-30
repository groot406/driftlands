import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';

export type GameplayEvent =
  | {
      type: 'tile:discovered';
      tileId: string;
      q: number;
      r: number;
      terrain: string | null;
    }
  | {
      type: 'resource:delivered';
      heroId: string;
      resourceType: ResourceType;
      amount: number;
    }
  | {
      type: 'task:completed';
      taskType: TaskType;
      tileId: string;
      participantIds: string[];
    }
  | {
      type: 'study:completed';
      studyKey: string;
    }
  | {
      type: 'tile:restored';
      tileId: string;
      q: number;
      r: number;
      terrain: string | null;
    }
  | {
      type: 'population:changed';
      settlementId: string | null;
    };

type GameplayListener = (event: GameplayEvent) => void;
type GameplayRuntimeHook = (event: GameplayEvent) => void;

const GLOBAL_HOOK_KEY = '__driftlandsGameplayEventHook';

const listeners = new Set<GameplayListener>();

function getGlobalHookContainer(): typeof globalThis & {
  [GLOBAL_HOOK_KEY]?: GameplayRuntimeHook;
} {
  return globalThis as typeof globalThis & {
    [GLOBAL_HOOK_KEY]?: GameplayRuntimeHook;
  };
}

export function configureGameplayEventRuntime(hook?: GameplayRuntimeHook) {
  const container = getGlobalHookContainer();

  if (hook) {
    container[GLOBAL_HOOK_KEY] = hook;
    return;
  }

  delete container[GLOBAL_HOOK_KEY];
}

export function emitGameplayEvent(event: GameplayEvent) {
  getGlobalHookContainer()[GLOBAL_HOOK_KEY]?.(event);

  for (const listener of listeners) {
    listener(event);
  }
}

export function onGameplayEvent(listener: GameplayListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
