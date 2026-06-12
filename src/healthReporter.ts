export class HealthReporter {
    private interval: NodeJS.Timeout | null = null

    constructor(private readonly intervalMs: number) {}

    public start() {
        this.interval = setInterval(async () => {
            await Bun.write("/tmp/health", new Date().toISOString())
        }, this.intervalMs)
    }

    public stop() {
        if (this.interval) clearInterval(this.interval)
    }
}

export const healthReporter = new HealthReporter(1000 * 10)
