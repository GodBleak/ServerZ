export async function hang() {
    setInterval(() => {}, 1000)

    return new Promise<void>(() => {
        process.once("SIGINT", () => process.exit(130))
        process.once("SIGTERM", () => process.exit(143))
    })
}
