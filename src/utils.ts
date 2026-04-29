// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

export function makeResolveKey(uri: vscode.Uri, position: vscode.Position): string {
  return `${uri.toString()}::${position.line}:${position.character}`;
}

export function escapeForGlob(p: string): string {
  return p.replaceAll('\\', '/');
}

export function normalizeSlashes(p: string): string {
  return p.replaceAll('\\', '/');
}

export function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function isTextEditor(arg: unknown): arg is vscode.TextEditor {
  return !!arg && typeof arg === 'object' && 'document' in (arg as any) && 'selection' in (arg as any);
}

export function countChar(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === ch) n += 1;
  }
  return n;
}

export function mergeLocations(primary: vscode.Location[], secondary: vscode.Location[]): vscode.Location[] {
  const out: vscode.Location[] = [];
  const seen = new Set<string>();
  for (const loc of [...primary, ...secondary]) {
    const key = `${loc.uri.toString()}#${loc.range.start.line}:${loc.range.start.character}-${loc.range.end.line}:${loc.range.end.character}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}
