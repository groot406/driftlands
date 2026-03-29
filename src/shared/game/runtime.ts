import type { Hero } from '../../core/types/Hero';
import type { TaskType } from '../../core/types/Task';

type RuntimeMessage = { type: string };
type TargetPosition = { q: number; r: number };

export interface GameRuntime {
  broadcast: <T extends RuntimeMessage>(message: T) => void;
  moveHero: (hero: Hero, target: TargetPosition, task?: TaskType) => void;
}

const defaultRuntime: GameRuntime = {
  broadcast: () => {},
  moveHero: () => {},
};

let runtime: GameRuntime = defaultRuntime;

export function configureGameRuntime(partial: Partial<GameRuntime>) {
  runtime = {
    ...runtime,
    ...partial,
  };
}

export function resetGameRuntime() {
  runtime = defaultRuntime;
}

export function broadcastGameMessage<T extends RuntimeMessage>(message: T) {
  runtime.broadcast(message);
}

export function moveHeroWithRuntime(hero: Hero, target: TargetPosition, task?: TaskType) {
  runtime.moveHero(hero, target, task);
}
