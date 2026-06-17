import SteamCrypto from '@doctormckay/steam-crypto';
import type {
  DepotDescriptor,
  ResolveDepotsOptions,
  SteamAppInfo,
  SteamDepotSection,
  SteamEncryptedManifestReference,
  SteamManifestReference,
  SteamUserLike
} from './types.js';

export function resolveDepotsFromAppInfo(appId: number, appInfo: SteamAppInfo, options: ResolveDepotsOptions = {}): DepotDescriptor[] {
  const branch = options.branch ?? 'public';
  const depots = appInfo.depots ?? {};
  const requestedDepots = options.depots ? new Set(options.depots.map(Number)) : null;
  const output: DepotDescriptor[] = [];

  for (const [key, rawDepot] of Object.entries(depots)) {
    if (!/^\d+$/.test(key)) continue;

    const depot = rawDepot as SteamDepotSection;
    const depotId = Number(key);
    if (requestedDepots && !requestedDepots.has(depotId)) continue;
    if (!requestedDepots && !depotMatchesPlatform(depot, options)) continue;

    const directManifest = extractManifestId(depot.manifests?.[branch]);
    const encrypted = Boolean(depot.encryptedmanifests?.[branch]);

    const sourceAppId = parseOptionalAppId(depot.depotfromapp);
    // depotfromapp means this depot's content/manifest lives under another app.
    // That relationship is independent of whether the requesting app is free-to-download.
    const contentAppId = sourceAppId ?? appId;

    output.push({
      appId,
      contentAppId,
      depotId,
      branch,
      manifestId: directManifest,
      encrypted,
      name: typeof depot.name === 'string' ? depot.name : undefined,
      config: depot.config,
      sourceAppId
    });
  }

  if (requestedDepots) {
    const found = new Set(output.map(depot => depot.depotId));
    const missing = [...requestedDepots].filter(depotId => !found.has(depotId));
    if (missing.length) 
      throw new Error(`Depot ${missing.join(', ')} not listed for app ${appId}`);
    
  }

  return output;
}

export async function resolveManifestIdFromAppInfo(
  user: SteamUserLike,
  appId: number,
  depotId: number,
  appInfo: SteamAppInfo,
  branch: string,
  branchPassword?: string
): Promise<string> {
  const depot = appInfo.depots?.[String(depotId)];
  if (!depot) 
    throw new Error(`Depot ${depotId} not listed for app ${appId}`);
  

  const directManifestId = extractManifestId(depot.manifests?.[branch]);
  if (directManifestId) return directManifestId;

  const encrypted = depot.encryptedmanifests?.[branch];
  if (encrypted) 
    return decryptEncryptedManifestId(user, appId, branch, encrypted, branchPassword);
  

  if (branch !== 'public') {
    const publicManifestId = extractManifestId(depot.manifests?.public);
    if (publicManifestId) return publicManifestId;
  }

  throw new Error(`No manifest found for app ${appId}, depot ${depotId}, branch "${branch}"`);
}

export function extractManifestId(reference: SteamManifestReference | string | number | undefined): string | undefined {
  if (typeof reference === 'string' || typeof reference === 'number') 
    return String(reference);
  

  if (!reference) return undefined;
  if (reference.gid) return String(reference.gid);
  return undefined;
}

async function decryptEncryptedManifestId(
  user: SteamUserLike,
  appId: number,
  branch: string,
  encrypted: SteamEncryptedManifestReference,
  branchPassword?: string
): Promise<string> {
  if (!branchPassword) 
    throw new Error(`Branch "${branch}" has an encrypted manifest. Provide branchPassword to decrypt it.`);
  

  const { keys } = await user.getAppBetaDecryptionKeys(appId, branchPassword);
  const key = keys[branch];
  if (!key) 
    throw new Error(`Steam did not return a beta decryption key for branch "${branch}". The branch password may be wrong.`);
  

  if (encrypted.encrypted_gid_2) {
    const decrypted = SteamCrypto.symmetricDecryptECB(Buffer.from(encrypted.encrypted_gid_2, 'hex'), key);
    return decrypted.readBigUInt64LE(0).toString();
  }

  if (encrypted.encrypted_gid) {
    const decrypted = SteamCrypto.symmetricDecryptECB(Buffer.from(encrypted.encrypted_gid, 'hex'), key);
    return decrypted.readBigUInt64LE(0).toString();
  }

  throw new Error(`Branch "${branch}" has encrypted manifest metadata, but no encrypted gid was present.`);
}

function parseOptionalAppId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function depotMatchesPlatform(depot: SteamDepotSection, options: ResolveDepotsOptions): boolean {
  const config = depot.config;
  if (!config) return true;

  if (!options.includeAllPlatforms && config.oslist) {
    const accepted = String(config.oslist).split(',').map(value => value.trim()).filter(Boolean);
    if (accepted.length && !accepted.includes(options.os ?? detectSteamOS())) return false;
  }

  if (!options.includeAllArchitectures && config.osarch) 
    if (String(config.osarch) !== (options.arch ?? detectSteamArch())) return false;
  

  if (!options.includeAllLanguages && config.language) {
    const accepted = String(config.language).split(',').map(value => value.trim()).filter(Boolean);
    if (accepted.length && !accepted.includes(options.language ?? 'english')) return false;
  }

  if (!options.includeLowViolence && isTruthy(config.lowviolence)) 
    return false;
  

  return true;
}

function detectSteamOS(): string {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'linux' || process.platform === 'freebsd') return 'linux';
  return 'unknown';
}

function detectSteamArch(): string {
  return process.arch === 'x64' || process.arch === 'arm64' ? '64' : '32';
}

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes'].includes(value.toLowerCase());
  return false;
}
