import { DepotFileFlags, type FileMatcher, type SteamDepotFile } from '../types.js';

export function isDirectory(file: SteamDepotFile): boolean {
  return Boolean((file.flags ?? 0) & DepotFileFlags.Directory);
}

export function isSymlink(file: SteamDepotFile): boolean {
  return Boolean((file.flags ?? 0) & DepotFileFlags.Symlink);
}

export async function shouldIncludeFile(
  file: SteamDepotFile,
  options: {
    include?: FileMatcher[];
    exclude?: FileMatcher[];
    filter?: (file: SteamDepotFile) => boolean | Promise<boolean>;
    skipSymlinks?: boolean;
  }
): Promise<boolean> {
  if (isDirectory(file)) return false;
  if ((options.skipSymlinks ?? true) && isSymlink(file)) return false;

  if (options.include?.length && !options.include.some(matcher => matchesFile(matcher, file))) 
    return false;
  

  if (options.exclude?.some(matcher => matchesFile(matcher, file))) 
    return false;
  

  if (options.filter && !(await options.filter(file))) 
    return false;
  

  return true;
}

export function matchesFile(matcher: FileMatcher, file: SteamDepotFile): boolean {
  if (typeof matcher === 'function') 
    return matcher(file);
  

  const filename = normalizeDepotPath(file.filename);

  if (matcher instanceof RegExp) 
    return testRegExpMatcher(matcher, filename);
  

  return globToRegExp(matcher).test(filename);
}

function testRegExpMatcher(matcher: RegExp, filename: string): boolean {
  // RegExp#test mutates lastIndex when /g or /y is set, which makes repeated
  // file matching alternate between true/false. Treat caller-provided regexes
  // as stateless matchers by stripping only the stateful flags.
  const statelessFlags = matcher.flags.replace(/[gy]/g, '');
  const statelessMatcher = new RegExp(matcher.source, statelessFlags);
  return statelessMatcher.test(filename);
}

export function normalizeDepotPath(filename: string): string {
  return filename.replace(/\\/g, '/').replace(/^\/+/, '');
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizeDepotPath(glob);
  let pattern = '^';

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]!;
    const next = normalized[i + 1];
    const afterNext = normalized[i + 2];

    if (char === '*') {
      if (next === '*') {
        if (afterNext === '/') {
          // Treat **/ as zero or more directories. This matches common glob
          // expectations where **/*.pdb matches both foo.pdb and bar/foo.pdb.
          pattern += '(?:.*/)?';
          i += 2;
        } else {
          pattern += '.*';
          i++;
        }
      } else {
        pattern += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      pattern += '[^/]';
      continue;
    }

    pattern += escapeRegExp(char);
  }

  pattern += '$';
  return new RegExp(pattern, 'i');
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}
