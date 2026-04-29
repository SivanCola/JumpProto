// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as path from 'node:path';

export { escapeHtml } from './html';
export { redactMessagePathsForOutput } from './redaction';

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

export function redactPathForOutput(filePath: string): string {
  const normalized = path.normalize(filePath);
  const workspaceFolder = vscode.workspace.workspaceFolders
    ?.map(folder => folder.uri.fsPath)
    .sort((a, b) => b.length - a.length)
    .find(folderPath => {
      const normalizedFolder = path.normalize(folderPath);
      const folderWithSep = normalizedFolder.endsWith(path.sep) ? normalizedFolder : normalizedFolder + path.sep;
      return normalized === normalizedFolder || normalized.startsWith(folderWithSep);
    });

  if (workspaceFolder) {
    const relative = path.relative(workspaceFolder, normalized);
    return relative ? `$WORKSPACE/${normalizeSlashes(relative)}` : '$WORKSPACE';
  }

  const home = process.env.HOME;
  if (home) {
    const normalizedHome = path.normalize(home);
    const homeWithSep = normalizedHome.endsWith(path.sep) ? normalizedHome : normalizedHome + path.sep;
    if (normalized === normalizedHome) return '~';
    if (normalized.startsWith(homeWithSep)) {
      return `~/${normalizeSlashes(path.relative(normalizedHome, normalized))}`;
    }
  }

  return path.isAbsolute(normalized) ? '/ABSOLUTE/PATH' : normalizeSlashes(normalized);
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
