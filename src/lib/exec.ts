export async function exec(command: string, args: string[] = []): Promise<string> {
    const proc = Bun.spawn([command, ...args], {
        stdout: "pipe",
        stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])

    if (exitCode !== 0) 
        throw new ExecError(command, args, exitCode, stdout, stderr)
    

    return stdout
}

export class ExecError extends Error {
    constructor(
        public command: string,
        public args: string[],
        public exitCode: number,
        public stdout: string,
        public stderr: string
    ) {
        super(`Command failed: ${command} ${args.join(" ")}\n${stderr}`)
        this.name = "ExecError"
    }
}
