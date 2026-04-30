// Shared protocol definitions for client-server communication
import type {Tile} from "../core/types/Tile.ts";
import type {Hero, HeroScoutResourceIntent, HeroStats} from "../core/types/Hero.ts";
import type {TaskInstance, TaskType} from "../core/types/Task.ts";
import type {ResourceAmount, ResourceType} from "../core/types/Resource.ts";
import type { ScoutTargetType } from '../core/types/Scout.ts';
import type {CoopPingKind, CoopPingSnapshot, CoopStateSnapshot} from "./coop/types.ts";
import type {RunSnapshot} from "./goals/types.ts";
import type {StorageSnapshot} from "./game/storage.ts";
import type { SettlementResourceInventorySnapshot } from '../store/resourceStore.ts';
import type {PopulationSnapshot} from "../store/populationStore.ts";
import type { WorkforceSnapshot } from '../store/jobStore.ts';
import type { StudyStateSnapshot } from '../store/studyStore.ts';
import type { Settler } from '../core/types/Settler.ts';
import type { HeroAbilityKey } from './heroes/heroAbilities.ts';
import type { HeroSkillKey } from './heroes/heroSkills.ts';
import type { SettlementStartCandidate, SettlementStartMarker, SettlementStartTerrainTile } from './multiplayer/settlementStart.ts';
import type { PlayerEntitySnapshot } from './multiplayer/player.ts';

export interface BaseMessage {
    type: string;
    id?: string;
    timestamp?: number;
}


// Game-related messages
export interface PlayerJoinMessage extends BaseMessage {
    type: 'player:join';
    playerId: string;
    playerName: string;
    playerColor?: string;
}

export interface PlayerLeaveMessage extends BaseMessage {
    type: 'player:leave';
    playerId: string;
}

export interface PlayerCountMessage extends BaseMessage {
    type: 'player:count';
    count: number;
}

export interface PlayerSnapshotMessage extends BaseMessage {
    type: 'player:snapshot';
    currentPlayerId: string | null;
    players: PlayerEntitySnapshot[];
}

export interface ChatMessage extends BaseMessage {
    type: 'chat:message';
    playerId: string;
    playerName: string;
    message: string;
}

export interface CoopSnapshotMessage extends BaseMessage {
    type: 'coop:snapshot';
    state: CoopStateSnapshot;
}

export interface CoopSetReadyMessage extends BaseMessage {
    type: 'coop:set_ready';
    ready: boolean;
}

export interface CoopHeroClaimMessage extends BaseMessage {
    type: 'coop:hero_claim';
    heroId: string;
}

export interface CoopHeroReleaseMessage extends BaseMessage {
    type: 'coop:hero_release';
    heroId: string;
}

export interface CoopPingRequestMessage extends BaseMessage {
    type: 'coop:request_ping';
    kind: CoopPingKind;
    q: number;
    r: number;
    heroId?: string;
}

export interface CoopPingMessage extends BaseMessage {
    type: 'coop:ping';
    ping: CoopPingSnapshot;
}

export interface WorldWelcomeMessage extends BaseMessage {
    type: 'world:welcome';
}

export interface WorldRequestMessage extends BaseMessage {
    type: 'world:request';
}

export interface WorldRestartMessage extends BaseMessage {
    type: 'world:restart';
    seed?: number;
    radius?: number;
}

export interface SettlementStartOptionsMessage extends BaseMessage {
    type: 'settlement:start_options';
    playerId: string;
    currentSettlementId: string | null;
    candidates: SettlementStartCandidate[];
    settlements: SettlementStartMarker[];
    terrainTiles?: SettlementStartTerrainTile[];
}

export interface SettlementStartRequestOptionsMessage extends BaseMessage {
    type: 'settlement:request_start_options';
}

export interface SettlementFoundRequestMessage extends BaseMessage {
    type: 'settlement:found_request';
    candidateId: string;
}

export interface SettlementFoundResultMessage extends BaseMessage {
    type: 'settlement:found_result';
    success: boolean;
    playerId: string;
    settlementId: string | null;
    q?: number;
    r?: number;
    message: string;
}

export interface SettlementPlayerFoundMessage extends BaseMessage {
    type: 'settlement:player_found';
    playerId: string;
    playerName: string;
    playerColor?: string | null;
    settlementId: string;
    q: number;
    r: number;
}

export interface SetJobSiteEnabledMessage extends BaseMessage {
    type: 'jobs:set_site_enabled';
    tileId: string;
    enabled: boolean;
}

export interface SetActiveStudyMessage extends BaseMessage {
    type: 'studies:set_active';
    studyKey: string;
}

export interface WorldSnapshotMessage extends BaseMessage {
    type: 'world:snapshot';
    tiles: Tile[];
    heroes: Hero[];
    settlers: Settler[];
    tasks: TaskInstance[];
    resources: Partial<Record<ResourceType, number>>;
    settlementResources?: SettlementResourceInventorySnapshot[];
    storages: StorageSnapshot[];
    population: PopulationSnapshot;
    jobs: WorkforceSnapshot;
    studies: StudyStateSnapshot;
}

export interface WorldSnapshotStartMessage extends BaseMessage {
    type: 'world:snapshot_start';
    snapshotId: string;
    totalTiles: number;
    totalChunks: number;
    heroes: Hero[];
    settlers: Settler[];
    tasks: TaskInstance[];
    resources: Partial<Record<ResourceType, number>>;
    settlementResources?: SettlementResourceInventorySnapshot[];
    storages: StorageSnapshot[];
    population: PopulationSnapshot;
    jobs: WorkforceSnapshot;
    studies: StudyStateSnapshot;
}

export interface WorldSnapshotChunkMessage extends BaseMessage {
    type: 'world:snapshot_chunk';
    snapshotId: string;
    chunkIndex: number;
    totalChunks: number;
    tiles: Tile[];
}

export interface WorldSnapshotCompleteMessage extends BaseMessage {
    type: 'world:snapshot_complete';
    snapshotId: string;
}

export interface TileUpdatedMessage extends BaseMessage {
    type: 'tile:updated';
    tile: Tile;
}

export interface MoveRequestMessage extends BaseMessage {
    type: 'hero:move_request';
    heroId: string;
    startAt: number; // optional client timestamp for when movement started
    origin: { q: number; r: number };
    target: { q: number; r: number };
    // optional client-computed path for validation; server may override
    path?: { q: number; r: number }[];
    task?: TaskType;
    taskLocation?: { q: number; r: number };
    exploreTarget?: { q: number; r: number };
}

export interface PathUpdateMessage extends BaseMessage {
    type: 'hero:path_update';
    heroId: string;
    origin: { q: number; r: number };
    path: { q: number; r: number }[]; // excluding origin, including destination
    target: { q: number; r: number };
    startAt: number; // absolute timestamp for when movement began (or will begin)
    startDelayMs: number; // client should start movement after this delay from receipt or now
    stepDurations: number[]; // per-step durations
    cumulative: number[]; // cumulative end times
    task?: TaskType;
    taskLocation?: { q: number; r: number };
    exploreTarget?: { q: number; r: number };
}

export interface HeroScoutResourceRequestMessage extends BaseMessage {
    type: 'hero:scout_resource_request';
    heroId: string;
    resourceType: ScoutTargetType;
}

export interface HeroScoutResourceUpdateMessage extends BaseMessage {
    type: 'hero:scout_resource_update';
    heroId: string;
    intent: HeroScoutResourceIntent | null;
}

export interface HeroAbilityUseMessage extends BaseMessage {
    type: 'hero:ability_use';
    heroId: string;
    ability: HeroAbilityKey;
    tileId?: string;
    taskId?: string;
}

export interface HeroSkillSelectMessage extends BaseMessage {
    type: 'hero:skill_select';
    heroId: string;
    skill: HeroSkillKey;
}

export interface HeroAbilityUpdateMessage extends BaseMessage {
    type: 'hero:ability_update';
    heroId: string;
    abilityCharges: number;
    xpChargeProgress: number;
    abilityChargesEarned: number;
    skillPoints: number;
    skillPointsEarned: number;
    skills: Partial<Record<HeroSkillKey, number>>;
}

export interface HeroRosterUpdateMessage extends BaseMessage {
    type: 'hero:roster_update';
    heroes: Hero[];
}

// Hero state updates
export interface HeroPayloadUpdateMessage extends BaseMessage {
    type: 'hero:payload_update';
    heroId: string;
    payload: ResourceAmount | null;
}

// Task lifecycle
export interface StartTaskRequestMessage extends BaseMessage {
    type: 'task:request_start';
    heroId: string;
    task: TaskType;
    location: { q: number; r: number };
    exploreTarget?: { q: number; r: number };
}

export interface JoinTaskRequestMessage {
    type: 'task:request_join';
    heroId: string;
    taskId: string;
}

export interface LeaveTaskRequestMessage {
    type: 'task:request_leave';
    heroId: string;
    taskId: string;
}

export interface ResourceDepositMessage {
    type: 'resource:deposit';
    heroId: string;
    storageTileId: string;
    resource: ResourceAmount;
}

export interface ResourceWithdrawMessage {
    type: 'resource:withdraw';
    heroId: string;
    storageTileId: string;
    resource: ResourceAmount;
}

export interface TaskCreatedMessage {
    type: 'task:created';
    taskId: string;
    taskType: TaskType;
    tileId: string;
    requiredXp: number;
    participantIds: string[];
    requiredResources?: ResourceAmount[];
}

export interface TaskProgressMessage {
    type: 'task:progress';
    taskId: string;
    progressXp: number;
    participants: Record<string, number>;
    // Optional fields to reflect resource collection state and activation toggles
    collectedResources?: ResourceAmount[];
    active?: boolean;
}

export interface TaskCompletedMessage {
    type: 'task:completed';
    taskId: string;
    rewards: {
        heroId: string;
        stats: Partial<HeroStats>;
        resources?: ResourceAmount;
    }[];
}

export interface TaskRemovedMessage {
    type: 'task:removed';
    taskId: string;
    tileId: string;
}

export interface RunSnapshotMessage extends BaseMessage {
    type: 'run:snapshot';
    settlementId?: string | null;
    run: RunSnapshot;
}

export interface RunUpdateMessage extends BaseMessage {
    type: 'run:update';
    settlementId?: string | null;
    run: RunSnapshot;
}

export interface PopulationUpdateMessage extends BaseMessage {
    type: 'population:update';
    current: number;
    max: number;
    beds: number;
    hungerMs: number;
    supportCapacity: number;
    activeTileCount: number;
    inactiveTileCount: number;
    pressureState: PopulationSnapshot['pressureState'];
    settlements: PopulationSnapshot['settlements'];
}

export interface JobsUpdateMessage extends BaseMessage {
    type: 'jobs:update';
    availableWorkers: number;
    assignedWorkers: number;
    idleWorkers: number;
    sites: WorkforceSnapshot['sites'];
}

export interface StudiesUpdateMessage extends BaseMessage {
    type: 'studies:update';
    studies: StudyStateSnapshot;
}

export interface SettlersUpdateMessage extends BaseMessage {
    type: 'settlers:update';
    settlers: Settler[];
}

export type ClientMessage =
    | PlayerJoinMessage
    | PlayerLeaveMessage
    | ChatMessage
    | CoopSetReadyMessage
    | CoopHeroClaimMessage
    | CoopHeroReleaseMessage
    | CoopPingRequestMessage
    | WorldRequestMessage
    | WorldRestartMessage
    | SettlementStartRequestOptionsMessage
    | SettlementFoundRequestMessage
    | SetJobSiteEnabledMessage
    | SetActiveStudyMessage
    | MoveRequestMessage
    | HeroScoutResourceRequestMessage
    | HeroAbilityUseMessage
    | HeroSkillSelectMessage
    | StartTaskRequestMessage
    | JoinTaskRequestMessage
    | LeaveTaskRequestMessage;

export type ServerMessage =
    | PlayerJoinMessage
    | PlayerLeaveMessage
    | PlayerCountMessage
    | PlayerSnapshotMessage
    | ChatMessage
    | CoopSnapshotMessage
    | CoopPingMessage
    | SettlementStartOptionsMessage
    | SettlementFoundResultMessage
    | SettlementPlayerFoundMessage
    | WorldSnapshotMessage
    | WorldSnapshotStartMessage
    | WorldSnapshotChunkMessage
    | WorldSnapshotCompleteMessage
    | WorldWelcomeMessage
    | TileUpdatedMessage
    | PathUpdateMessage
    | TaskCreatedMessage
    | TaskProgressMessage
    | TaskRemovedMessage
    | TaskCompletedMessage
    | ResourceDepositMessage
    | ResourceWithdrawMessage
    | HeroPayloadUpdateMessage
    | HeroScoutResourceUpdateMessage
    | HeroAbilityUpdateMessage
    | HeroRosterUpdateMessage
    | RunSnapshotMessage
    | RunUpdateMessage
    | PopulationUpdateMessage
    | JobsUpdateMessage
    | StudiesUpdateMessage
    | SettlersUpdateMessage;
