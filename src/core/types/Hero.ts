import type {ResourceAmount} from "./Resource";

export interface HeroStats {
    xp: number; // experience points
    hp: number; // hit points
    atk: number; // attack power
    spd: number; // speed / initiative
}

export type HeroStat = keyof HeroStats;

export interface HeroMovementState {
    path: { q: number; r: number }[]; // sequence of tiles to traverse (excluding origin, including destination)
    origin: { q: number; r: number };
    target: { q: number; r: number };
    startMs: number; // date.now() when movement started
    stepDurations: number[]; // per-step durations (same length as path)
    cumulative: number[]; // cumulative end times relative to startMs for each step
    taskType?: string; // optional task type to start upon arrival
}

export interface Hero {
    id: string;
    name: string;
    avatar: string; // asset path for sprite sheet
    q: number; // axial coordinate q
    r: number; // axial coordinate r
    stats: HeroStats;
    facing: 'up' | 'down' | 'left' | 'right'; // sprite facing direction
    movement?: HeroMovementState; // optional movement state if hero is walking
    currentTaskId?: string; // id of currently assigned active task (if any)
    carryingPayload?: ResourceAmount; // new payload model for carried resources
    pendingChain?: { sourceTileId: string; taskType: string }; // defer auto-chain until after delivery
    returnPos?: { q: number; r: number }; // restore optional original position for return flows
    delayedMovementTimer?: ReturnType<typeof setTimeout>;
    currentOffset?: { x: number; y: number }; // store current pixel offset for rendering hero related things
    lastActivity?: 'idle' | 'walk' | 'attack'; // track last known activity for sound management
    lastSoundPosition?: { q: number; r: number }; // track last sound position to avoid unnecessary updates
}