// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_MAX_UPWARD_DEPTH = 10;

export function resolveProtoSrcRootPath(
  protoFile: string,
  protoRoots: string[],
  hasMakefile: (dir: string) => boolean = dir => fs.existsSync(path.join(dir, 'Makefile')),
  maxUpwardDepth: number = DEFAULT_MAX_UPWARD_DEPTH
): string | undefined {
  const normalizedProtoFile = path.normalize(protoFile);
  const matchingConfiguredRoots = protoRoots
    .map(root => path.normalize(root))
    .filter(Boolean)
    .filter(root => {
      const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
      return normalizedProtoFile === root || normalizedProtoFile.startsWith(rootWithSep);
    })
    .sort((a, b) => b.length - a.length);
  if (matchingConfiguredRoots.length > 0) return matchingConfiguredRoots[0];

  let current = path.dirname(protoFile);
  for (let depth = 0; depth <= maxUpwardDepth; depth += 1) {
    if (path.basename(current) === 'proto_src' && hasMakefile(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

export function resolveProtoSourceNearGeneratedPath(
  protoPathFromPbGo: string,
  generatedGoFile: string,
  exists: (filePath: string) => boolean = fs.existsSync,
  maxUpwardDepth: number = DEFAULT_MAX_UPWARD_DEPTH
): string | undefined {
  if (path.isAbsolute(protoPathFromPbGo)) {
    return exists(protoPathFromPbGo) ? path.normalize(protoPathFromPbGo) : undefined;
  }

  let current = path.dirname(generatedGoFile);
  for (let depth = 0; depth <= maxUpwardDepth; depth += 1) {
    const candidate = path.join(current, 'proto_src', protoPathFromPbGo);
    if (exists(candidate)) return path.normalize(candidate);

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

export function buildWorkspaceProtoSourceCandidates(
  protoPathFromPbGo: string,
  workspaceFolders: string[]
): string[] {
  if (path.isAbsolute(protoPathFromPbGo)) return [protoPathFromPbGo];
  return workspaceFolders.flatMap(folder => [
    path.join(folder, 'proto_src', protoPathFromPbGo),
    path.join(folder, protoPathFromPbGo),
    path.join(folder, 'proto', protoPathFromPbGo)
  ]);
}

export function resolveProtoSourceFromWorkspaceFolders(
  protoPathFromPbGo: string,
  workspaceFolders: string[],
  exists: (filePath: string) => boolean = fs.existsSync
): string | undefined {
  if (path.isAbsolute(protoPathFromPbGo)) {
    return exists(protoPathFromPbGo) ? path.normalize(protoPathFromPbGo) : undefined;
  }

  for (const candidate of buildWorkspaceProtoSourceCandidates(protoPathFromPbGo, workspaceFolders)) {
    if (exists(candidate)) return path.normalize(candidate);
  }

  return undefined;
}

export function resolveGoModuleImportDir(
  importPath: string,
  fromFile: string,
  exists: (filePath: string) => boolean = fs.existsSync,
  readFile: (filePath: string) => string = filePath => fs.readFileSync(filePath, 'utf8')
): string | undefined {
  let current = path.dirname(fromFile);
  while (true) {
    const goModPath = path.join(current, 'go.mod');
    if (exists(goModPath)) {
      const modulePath = readGoModulePath(goModPath, readFile);
      if (!modulePath) return undefined;
      if (importPath === modulePath) return current;
      if (importPath.startsWith(`${modulePath}/`)) {
        const relativeImport = importPath.slice(modulePath.length + 1);
        const candidate = path.join(current, relativeImport);
        return exists(candidate) ? path.normalize(candidate) : undefined;
      }
      return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function readGoModulePath(
  goModPath: string,
  readFile: (filePath: string) => string
): string | undefined {
  try {
    const match = readFile(goModPath).match(/^\s*module\s+(\S+)\s*$/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}
