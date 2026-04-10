export class RenderProfiler {
    private readonly passTimingsMs: Record<string, number> = {};

    record(passName: string, durationMs: number) {
        this.passTimingsMs[passName] = durationMs;
    }

    snapshot() {
        return {
            ...this.passTimingsMs,
        };
    }

    reset() {
        for (const key of Object.keys(this.passTimingsMs)) {
            delete this.passTimingsMs[key];
        }
    }
}
