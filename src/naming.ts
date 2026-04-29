// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

export function toGoExportedName(protoName: string): string {
  let out = '';
  let capitalizeNext = true;
  for (let i = 0; i < protoName.length; i += 1) {
    const ch = protoName[i];
    if (ch === '_') {
      if (i === 0 && out.length === 0) out += 'X';
      const next = protoName[i + 1];
      if (next && /[a-z]/.test(next)) {
        capitalizeNext = true;
        continue;
      }
      out += '_';
      capitalizeNext = true;
      continue;
    }
    if (/[a-z]/.test(ch)) {
      out += capitalizeNext ? ch.toUpperCase() : ch;
      capitalizeNext = false;
      continue;
    }
    out += ch;
    capitalizeNext = false;
  }
  return out;
}
