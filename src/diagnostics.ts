// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { getConfig, getWorkspaceExcludeGlob } from './config';
import { extractProtoPathFromPbGo } from './core';
import { getGoUsagesForProtoPosition } from './goUsage';
import { parseGoPackageInfo } from './goText';
import { getStrings } from './i18n';
import { resolveProtoDefinition } from './protoResolver';
import { escapeForGlob, normalizeSlashes } from './utils';

export async function diagnoseCurrentSymbol(output: vscode.OutputChannel): Promise<void> {
  const strings = getStrings();
  const editor = vscode.window.activeTextEditor;
  output.clear();
  output.appendLine('JumpProto Diagnostics');
  output.appendLine(`Time: ${new Date().toISOString()}`);

  if (!editor) {
    output.appendLine('Active editor: none');
    output.show(true);
    vscode.window.showInformationMessage(strings.diagnoseCurrentSymbolDone);
    return;
  }

  const doc = editor.document;
  const pos = editor.selection.active;
  const wordRange = doc.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_]*/);
  const symbol = wordRange ? doc.getText(wordRange) : '';
  const config = getConfig();

  output.appendLine('');
  output.appendLine('[Editor]');
  output.appendLine(`Language: ${doc.languageId}`);
  output.appendLine(`File: ${doc.uri.fsPath}`);
  output.appendLine(`Cursor: ${pos.line + 1}:${pos.character + 1}`);
  output.appendLine(`Symbol: ${symbol || '(none)'}`);
  output.appendLine(`Workspace: ${vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath ?? '(none)'}`);

  output.appendLine('');
  output.appendLine('[Config]');
  output.appendLine(`protoRoots: ${config.protoRoots.length > 0 ? config.protoRoots.join(', ') : '(empty)'}`);
  output.appendLine(`searchInWorkspace: ${config.searchInWorkspace}`);
  output.appendLine(`exclude: ${config.exclude.length > 0 ? config.exclude.join(', ') : '(empty)'}`);
  output.appendLine(`makeProtoCommand: ${config.makeProtoCommand ? '(configured)' : '(empty)'}`);

  if (doc.uri.fsPath.endsWith('.proto')) {
    await diagnoseProtoEditor(doc, pos, output);
  } else if (doc.languageId === 'go' || doc.uri.fsPath.endsWith('.go')) {
    await diagnoseGoEditor(doc, pos, output);
  } else {
    output.appendLine('');
    output.appendLine('[Result]');
    output.appendLine('This command is most useful in Go or .proto files.');
  }

  output.show(true);
  vscode.window.showInformationMessage(strings.diagnoseCurrentSymbolDone);
}

async function diagnoseProtoEditor(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  output: vscode.OutputChannel
): Promise<void> {
  const protoText = doc.getText();
  const goPackage = parseGoPackageInfo(protoText);
  const usages = await getGoUsagesForProtoPosition(doc, pos, false);

  output.appendLine('');
  output.appendLine('[Proto]');
  output.appendLine(`go_package packageName: ${goPackage?.packageName ?? '(not found)'}`);
  output.appendLine(`go_package importPath: ${goPackage?.importPath ?? '(not found)'}`);
  output.appendLine('Usage strategy: cached workspace scan + proto scanner + Go token scanner + import alias + same-package bare name + structured field access');
  output.appendLine(`Usage candidates: ${usages?.length ?? 0}`);
}

async function diagnoseGoEditor(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  output: vscode.OutputChannel
): Promise<void> {
  const defs = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
    'vscode.executeDefinitionProvider',
    doc.uri,
    pos
  );
  const locations = (defs ?? []).map(d => 'targetUri' in d
    ? new vscode.Location((d as vscode.LocationLink).targetUri, (d as vscode.LocationLink).targetSelectionRange ?? (d as vscode.LocationLink).targetRange)
    : (d as vscode.Location));
  const pbGoLocations = locations.filter(loc => loc.uri.fsPath.endsWith('.pb.go') || loc.uri.fsPath.endsWith('.pb.gw.go'));

  output.appendLine('');
  output.appendLine('[Go Definition Provider]');
  output.appendLine(`Total definitions: ${locations.length}`);
  output.appendLine(`Generated Go definitions: ${pbGoLocations.length}`);
  locations.slice(0, 20).forEach((loc, index) => {
    output.appendLine(`- #${index + 1}: ${loc.uri.fsPath}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`);
  });

  for (const loc of pbGoLocations.slice(0, 5)) {
    await diagnoseGeneratedGoLocation(loc, output);
  }

  const resolved = await resolveProtoDefinition(doc, pos);
  output.appendLine('');
  output.appendLine('[JumpProto Resolution]');
  if (resolved) {
    output.appendLine(`Resolved proto: ${resolved.protoUri.fsPath}:${resolved.targetRange.start.line + 1}:${resolved.targetRange.start.character + 1}`);
  } else {
    output.appendLine('Resolved proto: (not found)');
  }
}

async function diagnoseGeneratedGoLocation(loc: vscode.Location, output: vscode.OutputChannel): Promise<void> {
  output.appendLine('');
  output.appendLine('[Generated Go]');
  output.appendLine(`File: ${loc.uri.fsPath}`);

  let text: string;
  try {
    text = fs.readFileSync(loc.uri.fsPath, 'utf8');
  } catch (error) {
    output.appendLine(`Read failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const source = extractProtoPathFromPbGo(text);
  output.appendLine(`source header: ${source ?? '(not found)'}`);
  if (!source) return;

  const candidates = await resolveProtoCandidates(source);
  output.appendLine(`proto candidates: ${candidates.length}`);
  candidates.forEach((candidate, index) => {
    output.appendLine(`- #${index + 1}: ${candidate.fsPath} (${candidate.exists ? 'exists' : 'missing'}, via ${candidate.via})`);
  });
}

async function resolveProtoCandidates(protoPathFromPbGo: string): Promise<Array<{ fsPath: string; exists: boolean; via: string }>> {
  const candidates: Array<{ fsPath: string; exists: boolean; via: string }> = [];
  const config = getConfig();

  if (path.isAbsolute(protoPathFromPbGo)) {
    candidates.push({
      fsPath: protoPathFromPbGo,
      exists: fs.existsSync(protoPathFromPbGo),
      via: 'absolute source'
    });
  }

  for (const root of config.protoRoots) {
    const full = path.join(root, protoPathFromPbGo);
    candidates.push({
      fsPath: full,
      exists: fs.existsSync(full),
      via: 'protoRoots'
    });
  }

  if (config.searchInWorkspace) {
    const glob = `**/${escapeForGlob(protoPathFromPbGo)}`;
    const matches = await vscode.workspace.findFiles(glob, getWorkspaceExcludeGlob(config), 5);
    for (const match of matches) {
      candidates.push({
        fsPath: match.fsPath,
        exists: true,
        via: `workspace glob ${normalizeSlashes(glob)}`
      });
    }
  }

  return dedupeCandidates(candidates);
}

function dedupeCandidates(
  candidates: Array<{ fsPath: string; exists: boolean; via: string }>
): Array<{ fsPath: string; exists: boolean; via: string }> {
  const out: Array<{ fsPath: string; exists: boolean; via: string }> = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = path.normalize(candidate.fsPath);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
