// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';

export function resolveProtoSrcRootPath(
  protoFile: string,
  protoRoots: string[],
  hasMakefile: (dir: string) => boolean = dir => fs.existsSync(path.join(dir, 'Makefile'))
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
  while (true) {
    if (path.basename(current) === 'proto_src' && hasMakefile(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
