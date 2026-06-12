import path from 'node:path';
import { readJson, writeJson } from '../runtime/fs.js';
import type { SteamDepotFile } from '../types.js';

export interface DepotStateFile {
  appId: number;
  depotId: number;
  branch: string;
  manifestId: string;
  updatedAt: string;
  files: Array<{
    filename: string;
    size?: string | number;
    flags?: number;
    sha_content?: string;
  }>;
}

export class DepotStateStore {
  constructor(private readonly directory: string, private readonly rootDirectory?: string) {}

  async read(appId: number, depotId: number, branch: string): Promise<DepotStateFile | null> {
    return readJson<DepotStateFile>(this.pathFor(appId, depotId, branch));
  }

  async write(appId: number, depotId: number, branch: string, manifestId: string, files: SteamDepotFile[]): Promise<void> {
    const state: DepotStateFile = {
      appId,
      depotId,
      branch,
      manifestId,
      updatedAt: new Date().toISOString(),
      files: files.map(file => ({
        filename: file.filename,
        size: file.size,
        flags: file.flags,
        sha_content: file.sha_content
      }))
    };

    await writeJson(this.pathFor(appId, depotId, branch), state, this.rootDirectory ? { rootDirectory: this.rootDirectory } : {});
  }

  pathFor(appId: number, depotId: number, branch: string): string {
    const safeBranch = branch.replace(/[^a-z0-9._-]+/gi, '_');
    return path.join(this.directory, `app_${appId}_depot_${depotId}_${safeBranch}.json`);
  }
}
