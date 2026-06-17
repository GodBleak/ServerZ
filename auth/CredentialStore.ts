import path from 'node:path';
import { readJson, removeFile, writeJson } from '../runtime/fs.js';
import type { SteamCredentials } from '../types.js';

export interface SteamCredentialStoreOptions {
  dataDirectory?: string;
  fileName?: string;
  filePath?: string;
}

export class SteamCredentialStore {
  readonly filePath: string;

  constructor(options: SteamCredentialStoreOptions) {
    if (options.filePath) {
      this.filePath = options.filePath;
      return;
    }

    if (!options.dataDirectory) 
      throw new Error('SteamCredentialStore needs either dataDirectory or filePath.');
    

    const fileName = options.fileName ?? 'credentials.json';
    if (!fileName || path.isAbsolute(fileName) || fileName !== path.basename(fileName) || fileName.includes('/') || fileName.includes('\\')) 
      throw new Error('SteamCredentialStore fileName must be a basename inside dataDirectory. Use filePath for an explicit path.');
    

    this.filePath = path.join(options.dataDirectory, fileName);
  }

  async read(): Promise<SteamCredentials | null> {
    const value = await readJson<unknown>(this.filePath);
    if (value === null) return null;
    if (!isSteamCredentials(value)) 
      throw new Error(`Steam credential cache at ${this.filePath} is not a valid credential file.`);
    

    return value;
  }

  async write(credentials: SteamCredentials): Promise<void> {
    await writeJson(this.filePath, normalizeCredentials(credentials), { mode: 0o600, strictMode: true });
  }

  async clear(): Promise<void> {
    await removeFile(this.filePath);
  }
}

function normalizeCredentials(credentials: SteamCredentials): SteamCredentials {
  return {
    accountName: credentials.accountName?.toLowerCase(),
    steamID: credentials.steamID,
    refreshToken: credentials.refreshToken,
    accessToken: credentials.accessToken,
    updatedAt: credentials.updatedAt ?? new Date().toISOString(),
    expiresAt: credentials.expiresAt
  };
}

function isSteamCredentials(value: unknown): value is SteamCredentials {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.refreshToken === 'string' && candidate.refreshToken.length > 0;
}
