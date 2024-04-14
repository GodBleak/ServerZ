export interface SteamCMDAdapter {
    /**
     * Sets up the adapter.
     */
    init(): Promise<void>
    /**
     * Whether the adapter is set up and ready to execute commands.
     * If this is false, executeCommand will throw an error.
     */
    ready: boolean
    /**
     * Executes an array of commands and returns the output.
     * @param commands The commands to execute.
     * @param callback A function to call with the output of each command. Only applicable to the Console adapter.
     */
    processCommands(commands: string[], callback?: (data: { [command: string]: string[] }) => void): Promise<string[]>
    /**
     * The credentials to use for the SteamCMD session.
     * Only applicable to the CLI adapter.
     */
}

type NoForceDir<T extends Partial<SteamCMD>> = Omit<T, "forceDir">
type NoVerify<T extends Partial<SteamCMD>> = Omit<T, "verify">
type NoBeta<T extends Partial<SteamCMD>> = Omit<T, "beta">

export class SteamCMD {
    private adapter: SteamCMDAdapter
    private credentials: { username: string; password?: string; code?: string }
    private commands: string[] = []
    constructor(adapter: SteamCMDAdapter) {
        this.adapter = adapter
        this.credentials = { username: "anonymous" }
    }

    private appendToLastAppUpdate(command: string): void {
        const lastCommandPosition = this.commands.length - 1
        const lastCommand = this.commands[lastCommandPosition]
        if (lastCommand.startsWith("app_update")) {
            this.commands[lastCommandPosition] = `${lastCommand} ${command}`
        }
    }

    public async init(): Promise<void> {
        return this.adapter.init()
    }

    public get ready(): boolean {
        return this.adapter.ready
    }

    public login(username?: string, password?: string, code?: string): NoForceDir<NoBeta<NoVerify<this>>> {
        if (username) this.credentials = { username, password, code }
        const loginCommand = ["login", this.credentials.username]
        if (this.credentials.password) loginCommand.push(this.credentials.password)
        if (this.credentials.code) loginCommand.push(this.credentials.code)
        this.commands.push(loginCommand.join(" "))
        return this
    }

    public forceDir(dir: string): NoBeta<NoVerify<this>> {
        this.commands.push(`force_install_dir ${dir}`)
        return this
    }

    public updateApp(appId: number): NoForceDir<this> {
        this.commands.push(`app_update ${appId}`)
        return this
    }

    public beta(betaName: string, betaPassword?: string): NoForceDir<this> {
        const betaCommand = ["-beta", betaName]
        if (betaPassword) betaCommand.concat(["-betapassword", betaPassword])
        this.appendToLastAppUpdate(betaCommand.join(" "))
        return this
    }

    public verify(): NoForceDir<NoBeta<this>> {
        this.appendToLastAppUpdate("validate")
        return this
    }

    public workshopDownload(appID: number, workshopID: number): NoForceDir<NoBeta<NoVerify<this>>> {
        this.commands.push(`workshop_download_item ${appID} ${workshopID}`)
        return this
    }

    public async execute(callback?: (data: { [command: string]: string[] }) => void): Promise<string[]> {
        const response = await this.adapter.processCommands(this.commands, callback)
        this.commands = []
        return response
    }
}
