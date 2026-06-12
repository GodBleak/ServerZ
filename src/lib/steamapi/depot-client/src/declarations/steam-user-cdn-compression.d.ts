declare module "steam-user/components/cdn_compression.js" {
  export function unzip(data: Buffer): Promise<Buffer>;
}
