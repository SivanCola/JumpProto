// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'node:path';

function normalizeSlashes(p: string): string {
  return p.replaceAll('\\', '/');
}

export function redactMessagePathsForOutput(message: string, home: string | undefined = process.env.HOME): string {
  if (!home) return message;
  const normalizedHome = normalizeSlashes(path.normalize(home));
  const escapedHome = normalizedHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return message.replace(new RegExp(`${escapedHome}([^\\s)'"]*)`, 'g'), (_match, suffix: string) => `~${suffix}`);
}
