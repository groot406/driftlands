type NativePluginMethod = (...args: unknown[]) => Promise<unknown> | void;

type NativeGameCenterPlugin = {
    [name: string]: NativePluginMethod | undefined;
    signIn?: NativePluginMethod;
    authenticate?: NativePluginMethod;
    login?: NativePluginMethod;
    submitScore?: NativePluginMethod;
    postScore?: NativePluginMethod;
    reportScore?: NativePluginMethod;
    setScore?: NativePluginMethod;
    reportAchievement?: NativePluginMethod;
    reportAchievements?: NativePluginMethod;
    submitAchievement?: NativePluginMethod;
    reportProgress?: NativePluginMethod;
};

type CapacitorHost = {
    Plugins?: Record<string, NativeGameCenterPlugin>;
    Plugin?: Record<string, NativeGameCenterPlugin>;
};

type ScoreSubmissionPayload = {
    playerId: string;
    playerName: string;
    seasonId: string;
    score: number;
    rank?: number;
    leaderboardId: string;
};

type StreakState = {
    lastWinDayUtc: number;
    streak: number;
};

const LEADERBOARD_ID = 'driftlands.leaderboard.global';
const ACHIEVEMENT_PROGRESS_KEY = 'driftlands.game-center.achievement-progress-v1';
const STREAK_STATE_KEY = 'driftlands.game-center.win-streak-v1';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const SCORE_ACHIEVEMENT_IDS = [
    { id: 'driftlands.score.25k', threshold: 25_000 },
    { id: 'driftlands.score.50k', threshold: 50_000 },
    { id: 'driftlands.score.100k', threshold: 100_000 },
    { id: 'driftlands.score.250k', threshold: 250_000 },
] as const;

function isNavigatorAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.navigator !== 'undefined';
}

function nowMs(): number {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function clamp01to100(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
}

function readJsonStorage<T>(key: string, fallback: T): T {
    if (!isNavigatorAvailable()) {
        return fallback;
    }
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return fallback;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
            return parsed as T;
        }
    } catch {
        return fallback;
    }
    return fallback;
}

function writeJsonStorage<T>(key: string, value: T): void {
    if (!isNavigatorAvailable()) {
        return;
    }
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
}

function utcDayForTs(timestamp: number): number {
    return Math.floor(timestamp / MILLISECONDS_PER_DAY);
}

class GameCenterService {
    private readonly bestScoreBySeason = new Map<string, number>();
    private readonly submittedAchievements = new Map<string, number>();
    private authInFlight: Promise<boolean> | null = null;
    private lastAuthAt = 0;
    private lastAuthenticatedPlayerId: string | null = null;

    constructor() {
        this.loadAchievementProgress();
    }

    isAvailable(): boolean {
        return this.getPlugin() !== null && this.isNativeContext();
    }

    async authenticate(playerId: string, playerName: string | null = null): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        const now = nowMs();
        if (now - this.lastAuthAt < 90_000) {
            return true;
        }
        if (!this.authInFlight) {
            this.authInFlight = this.authenticateInternal(playerId, playerName)
                .finally(() => {
                    this.authInFlight = null;
                });
        }

        const result = await this.authInFlight;
        if (result) {
            this.lastAuthAt = now;
        }
        return result;
    }

    async submitSeasonLeaderboard(payload: ScoreSubmissionPayload): Promise<void> {
        if (!this.isAvailable() || !payload.playerId || payload.playerId.trim() === '') {
            return;
        }
        if (!Number.isFinite(payload.score) || payload.score < 0) {
            return;
        }

        const scoreKey = `${payload.seasonId}:${payload.playerId}`;
        const bestScore = this.bestScoreBySeason.get(scoreKey);
        if (bestScore !== undefined && payload.score <= bestScore) {
            return;
        }

        await this.authenticate(payload.playerId, payload.playerName);
        const plugin = this.getPlugin();
        if (!plugin) {
            return;
        }

        const leaderboardPayload = {
            leaderboardId: payload.leaderboardId,
            seasonId: payload.seasonId,
            playerId: payload.playerId,
            playerName: payload.playerName,
            score: payload.score,
            rank: payload.rank ?? null,
        };

        const submitted = await this.invokePluginMethod(plugin, ['submitScore'], leaderboardPayload, payload.score, payload.leaderboardId)
            || await this.invokePluginMethod(plugin, ['postScore'], leaderboardPayload, payload.score, payload.leaderboardId)
            || await this.invokePluginMethod(plugin, ['reportScore'], leaderboardPayload, payload.score, payload.leaderboardId)
            || await this.invokePluginMethod(plugin, ['setScore'], leaderboardPayload, payload.score, payload.leaderboardId);
        if (submitted) {
            this.bestScoreBySeason.set(scoreKey, payload.score);
        }
    }

    async reportAchievement(id: string, percentComplete: number): Promise<void> {
        if (!this.isAvailable() || !id) {
            return;
        }

        const clamped = clamp01to100(percentComplete);
        const previous = this.submittedAchievements.get(id) ?? 0;
        if (clamped <= previous) {
            return;
        }

        await this.ensureAuthForAchievement(id);
        const plugin = this.getPlugin();
        if (!plugin) {
            return;
        }

        const achievementPayload = {
            identifier: id,
            percentComplete: clamped,
            showCompletionBanner: true,
        };
        const submitted = await this.invokePluginMethod(
            plugin,
            ['reportAchievement'],
            achievementPayload,
            [{identifier: id, percentComplete: clamped, showCompletionBanner: true}],
        );
        if (submitted) {
            this.submittedAchievements.set(id, clamped);
            this.saveAchievementProgress();
        }
    }

    recordWinStreakOnDay(now: number, won: boolean): number {
        if (!won) {
            return 0;
        }

        const state = this.loadStreakState();
        const today = utcDayForTs(now);

        if (state.lastWinDayUtc === today) {
            return state.streak;
        }

        const nextStreak = state.lastWinDayUtc === today - 1 ? state.streak + 1 : 1;
        const nextState: StreakState = {
            lastWinDayUtc: today,
            streak: nextStreak,
        };
        writeJsonStorage(STREAK_STATE_KEY, nextState);

        return nextStreak;
    }

    reportStreakAchievements(streak: number): Array<{id: string; percent: number}> {
        const milestones = [
            { id: 'driftlands.streak.3', min: 3 },
            { id: 'driftlands.streak.7', min: 7 },
            { id: 'driftlands.streak.14', min: 14 },
            { id: 'driftlands.streak.30', min: 30 },
        ];

        return milestones
            .filter((milestone) => streak >= milestone.min)
            .map((milestone) => ({id: milestone.id, percent: 100}));
    }

    scoreAchievementsFor(score: number): Array<{id: string; percent: number}> {
        return SCORE_ACHIEVEMENT_IDS
            .filter((entry) => score >= entry.threshold)
            .map((entry) => ({id: entry.id, percent: 100}));
    }

    championAchievements(rank: number | null): Array<{id: string; percent: number}> {
        if (rank === 1) {
            return [
                {id: 'driftlands.champion.season', percent: 100},
                {id: 'driftlands.rank.top1', percent: 100},
            ];
        }
        return [];
    }

    defaultLeaderboardId(): string {
        return LEADERBOARD_ID;
    }

    private async ensureAuthForAchievement(id: string): Promise<boolean> {
        if (this.submittedAchievements.has(id) && this.submittedAchievements.get(id) === 100) {
            return true;
        }

        return await this.authenticate(this.lastAuthenticatedPlayerId ?? 'anonymous');
    }

    private loadAchievementProgress(): void {
        const saved = readJsonStorage<Record<string, number>>(ACHIEVEMENT_PROGRESS_KEY, {});
        for (const [id, percent] of Object.entries(saved)) {
            if (typeof percent === 'number' && Number.isFinite(percent)) {
                this.submittedAchievements.set(id, clamp01to100(percent));
            }
        }
    }

    private saveAchievementProgress(): void {
        const payload: Record<string, number> = {};
        for (const [id, percent] of this.submittedAchievements.entries()) {
            payload[id] = percent;
        }
        writeJsonStorage(ACHIEVEMENT_PROGRESS_KEY, payload);
    }

    private loadStreakState(): StreakState {
        const fallback: StreakState = {
            lastWinDayUtc: -1,
            streak: 0,
        };
        return readJsonStorage(STREAK_STATE_KEY, fallback);
    }

    private async authenticateInternal(playerId: string, playerName: string | null): Promise<boolean> {
        const plugin = this.getPlugin();
        if (!plugin) {
            return false;
        }

        const authPayload = {
            playerId,
            playerName,
        };

        const authenticated = await this.invokePluginMethod(
            plugin,
            ['signIn'],
            authPayload,
        ) || await this.invokePluginMethod(
            plugin,
            ['authenticate'],
            authPayload,
        ) || await this.invokePluginMethod(
            plugin,
            ['login'],
            authPayload,
        );
        if (authenticated) {
            this.lastAuthenticatedPlayerId = playerId;
        }
        return authenticated;
    }

    private async invokePluginMethod(
        plugin: NativeGameCenterPlugin,
        methodNames: string[],
        ...args: unknown[]
    ): Promise<boolean> {
        for (const methodName of methodNames) {
            const method = plugin[methodName];
            if (typeof method !== 'function') {
                continue;
            }
            await method(...args);
            return true;
        }
        return false;
    }

    private getPlugin(): NativeGameCenterPlugin | null {
        if (typeof window === 'undefined') {
            return null;
        }
        const host = (window as unknown as { Capacitor?: CapacitorHost }).Capacitor;
        if (!host) {
            return null;
        }

        return host.Plugins?.GameCenter
            ?? host.Plugin?.GameCenter
            ?? host.Plugins?.gameCenter
            ?? host.Plugin?.gameCenter
            ?? null;
    }

    private isNativeContext(): boolean {
        if (!isNavigatorAvailable()) {
            return false;
        }
        const navigatorRef = window.navigator as Navigator & { standalone?: boolean };
        if (navigatorRef.standalone === true) {
            return true;
        }
        if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
            return true;
        }
        return false;
    }
}

export const gameCenterService = new GameCenterService();

export type { ScoreSubmissionPayload };
