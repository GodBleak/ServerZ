type LogLevel = "crit" | "error" | "warn" | "info" | "debug"
type Secret = { pattern: string; replacement: string }

const LEVELS:  Record<LogLevel, number> = { crit: 0, error: 1, warn: 2, info: 3, debug: 4 }
const LABELS:  Record<LogLevel, string> = { crit: "CRIT", error: "ERROR", warn: "WARN", info: "INFO", debug: "DBUG" }
const COLORS:  Record<LogLevel, string> = { crit: "\x1b[31;1m", error: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[32m", debug: "\x1b[34m" }
const RESET = "\x1b[0m"

export class Logger {
    private readonly secrets: Secret[] = []
    private readonly scrubbingFacade: Pick<Logger, LogLevel>

    constructor() {
        // Pre-bound facade so logger.scrub() is allocation-free per call.
        this.scrubbingFacade = {
            crit:  (...a) => this.write("crit",  a, true),
            error: (...a) => this.write("error", a, true),
            warn:  (...a) => this.write("warn",  a, true),
            info:  (...a) => this.write("info",  a, true),
            debug: (...a) => this.write("debug", a, true),
        }
    }

    public registerSecret(value: string | undefined | null, replacement = "********"): void {
        if (!value) return
        const trimmed = value.trim()
        if (!trimmed) return
        if (this.secrets.some((s) => s.pattern === trimmed)) return
        this.secrets.push({ pattern: trimmed, replacement })
    }

    public scrub(): Pick<Logger, LogLevel> {
        return this.scrubbingFacade
    }

    public crit  = (...a: unknown[]) => this.write("crit",  a, false)
    public error = (...a: unknown[]) => this.write("error", a, false)
    public warn  = (...a: unknown[]) => this.write("warn",  a, false)
    public info  = (...a: unknown[]) => this.write("info",  a, false)
    public debug = (...a: unknown[]) => this.write("debug", a, false)

    private write(level: LogLevel, args: unknown[], doScrub: boolean): void {
        if (!this.shouldLog(level)) return

        let output = this.formatLines(level, args)
        if (doScrub && Logger.scrubbingEnabled()) output = this.scrubText(output)

        if (level === "crit" || level === "error") console.error(output)
        else if (level === "warn") console.warn(output)
        else console.log(output)
    }

    private scrubText(text: string): string {
        let out = text
        for (const { pattern, replacement } of this.secrets) {
            if (out.includes(pattern)) 
                out = out.split(pattern).join(replacement)
            
            const escaped = JSON.stringify(pattern).slice(1, -1)
            if (escaped !== pattern && out.includes(escaped)) 
                out = out.split(escaped).join(replacement)
            
        }
        return out
    }

    private formatLines(level: LogLevel, args: unknown[]): string {
        const prefix = `[${new Date().toISOString()}] [ServerZ] [${LABELS[level]}] `
        const message = args.map(Logger.formatArg).join(" ")
        return message
            .split("\n")
            .map((line, i) => this.colorize(level, i === 0 ? `${prefix}${line}` : `${" ".repeat(prefix.length)}${line}`))
            .join("\n")
    }

    private colorize(level: LogLevel, text: string): string {
        return Logger.useColor() ? `${COLORS[level]}${text}${RESET}` : text
    }

    private shouldLog(level: LogLevel): boolean {
        return LEVELS[level] <= LEVELS[Logger.currentLevel()]
    }

    private static formatArg(this: void, arg: unknown): string {
        if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`
        if (typeof arg === "string") return arg
        return Bun.inspect(arg, { depth: Infinity, colors: false })
    }

    private static useColor(): boolean {
        return Bun.env.NO_COLOR !== "1" && Bun.env.NO_COLOR !== "true"
    }

    private static scrubbingEnabled(): boolean {
        const value = Bun.env.LOG_SCRUB_SECRETS?.toLowerCase()
        return value !== "0" && value !== "false"
    }

    private static currentLevel(): LogLevel {
        const l = Bun.env.LOG_LEVEL?.toLowerCase()
        if (l === "crit" || l === "error" || l === "warn" || l === "info" || l === "debug") return l
        return "info"
    }
}

export const logger = new Logger()