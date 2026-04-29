// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { getConfig, getWorkspaceExcludeGlob } from './config';
import { extractProtoPathFromPbGo, findProtoSymbolMatch } from './core';
import { escapeForGlob, makeResolveKey } from './utils';

export type ResolveResult = {
  protoUri: vscode.Uri;
  targetRange: vscode.Range;
};

const resolvingKeys = new Set<string>();

async function resolveProtoUri(protoPathFromPbGo: string): Promise<vscode.Uri | undefined> {
  if (path.isAbsolute(protoPathFromPbGo) && fs.existsSync(protoPathFromPbGo)) {
    return vscode.Uri.file(protoPathFromPbGo);
  }

  const config = getConfig();
  const { protoRoots, searchInWorkspace } = config;

  for (const root of protoRoots) {
    const full = path.join(root, protoPathFromPbGo);
    if (fs.existsSync(full)) {
      return vscode.Uri.file(full);
    }
  }

  if (searchInWorkspace) {
    const glob = `**/${escapeForGlob(protoPathFromPbGo)}`;
    const matches = await vscode.workspace.findFiles(glob, getWorkspaceExcludeGlob(config), 5);
    if (matches.length > 0) return matches[0];
  }

  return undefined;
}

export async function resolveProtoDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<ResolveResult | undefined> {
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
  if (!wordRange) return undefined;
  const symbolName = document.getText(wordRange);
  if (!symbolName) return undefined;

  const defs = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
    'vscode.executeDefinitionProvider',
    document.uri,
    position
  );

  if (!defs || defs.length === 0) return undefined;

  const pbGoDef = defs.find(d => {
    const uri = 'targetUri' in d ? (d as vscode.LocationLink).targetUri : (d as vscode.Location).uri;
    return uri.fsPath.endsWith('.pb.go') || uri.fsPath.endsWith('.pb.gw.go');
  });

  if (!pbGoDef) return undefined;

  const pbGoUri = 'targetUri' in pbGoDef ? (pbGoDef as vscode.LocationLink).targetUri : (pbGoDef as vscode.Location).uri;
  const pbGoRange = 'targetRange' in pbGoDef ? (pbGoDef as vscode.LocationLink).targetRange : (pbGoDef as vscode.Location).range;
  const defPath = pbGoUri.fsPath;

  let pbGoText: string;
  try {
    pbGoText = fs.readFileSync(defPath, 'utf8');
  } catch {
    return undefined;
  }

  let containerName: string | undefined;
  const pbGoLines = pbGoText.split('\n');
  const defLineIndex = pbGoRange.start.line;
  const defLine = pbGoLines[defLineIndex];

  if (defLine.includes('`protobuf:')) {
    for (let i = defLineIndex - 1; i >= 0 && i > defLineIndex - 100; i--) {
      const line = pbGoLines[i];
      const structMatch = line.match(/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct\s*\{/);
      if (structMatch) {
        containerName = structMatch[1];
        break;
      }
    }
  }

  const protoPathFromPbGo = extractProtoPathFromPbGo(pbGoText);
  if (!protoPathFromPbGo) return undefined;

  const protoUri = await resolveProtoUri(protoPathFromPbGo);
  if (!protoUri) return undefined;

  const protoDoc = await vscode.workspace.openTextDocument(protoUri);
  const protoText = protoDoc.getText();

  const match = findProtoSymbolMatch(protoText, symbolName, containerName);
  const range = match
    ? new vscode.Range(protoDoc.positionAt(match.startOffset), protoDoc.positionAt(match.endOffset))
    : new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

  return { protoUri, targetRange: range };
}

export async function goToProtoDefinition(editor: vscode.TextEditor): Promise<boolean> {
  const document = editor.document;
  const position = editor.selection.active;
  const key = makeResolveKey(document.uri, position);
  if (resolvingKeys.has(key)) return false;
  resolvingKeys.add(key);
  let resolved: ResolveResult | undefined;
  try {
    resolved = await resolveProtoDefinition(document, position);
  } finally {
    resolvingKeys.delete(key);
  }
  if (!resolved) return false;

  const targetDoc = await vscode.workspace.openTextDocument(resolved.protoUri);
  await vscode.window.showTextDocument(targetDoc, { selection: resolved.targetRange, preserveFocus: false, preview: true });
  return true;
}

export async function provideGoDefinitionWithProtoFirst(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location[] | undefined> {
  const key = makeResolveKey(document.uri, position);
  if (resolvingKeys.has(key)) return undefined;
  resolvingKeys.add(key);
  let resolved: ResolveResult | undefined;
  let nativeDefs: vscode.Location[] = [];
  try {
    const defs = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
      'vscode.executeDefinitionProvider',
      document.uri,
      position
    );
    nativeDefs = (defs ?? [])
      .map(d => 'targetUri' in d
        ? new vscode.Location((d as vscode.LocationLink).targetUri, (d as vscode.LocationLink).targetSelectionRange ?? (d as vscode.LocationLink).targetRange)
        : (d as vscode.Location))
      .filter(loc => loc.uri.fsPath.endsWith('.pb.go') || loc.uri.fsPath.endsWith('.pb.gw.go'));
    resolved = await resolveProtoDefinition(document, position);
  } finally {
    resolvingKeys.delete(key);
  }
  if (!resolved) return undefined;

  const protoLocation = new vscode.Location(resolved.protoUri, resolved.targetRange);
  const ordered: vscode.Location[] = [protoLocation];
  const seen = new Set<string>([
    `${protoLocation.uri.toString()}#${protoLocation.range.start.line}:${protoLocation.range.start.character}-${protoLocation.range.end.line}:${protoLocation.range.end.character}`
  ]);
  for (const loc of nativeDefs) {
    const key = `${loc.uri.toString()}#${loc.range.start.line}:${loc.range.start.character}-${loc.range.end.line}:${loc.range.end.character}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(loc);
  }
  return ordered;
}
