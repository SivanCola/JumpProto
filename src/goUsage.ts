// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { getConfig, getWorkspaceExcludeGlob, type ProtoJumpConfig } from './config';
import {
  findGoCompositeFieldUsagesInText,
  findGoFieldAccessUsagesInText,
  findGoSymbolUsagesInText,
  findGoVariableFieldUsagesInText,
  parseGoPackageInfo,
  type GoPackageInfo,
  type GoTextUsage
} from './goText';
import { getStrings } from './i18n';
import {
  findProtoDeclarationAtOffset,
  findProtoDeclarationSymbol,
  findProtoFieldContextAtOffset,
  scanProtoSymbols,
  type ProtoFieldContext
} from './protoScanner';
import { mergeLocations, normalizeSlashes } from './utils';

export type GoUsage = {
  uri: vscode.Uri;
  range: vscode.Range;
  preview: string;
};

const MAX_WORKSPACE_GO_FILES = 5000;
const MAX_USAGE_RESULTS = 200;
const MAX_REFERENCE_LOCATIONS = 200;
const PB_HEADER_BYTES = 6000;

type CachedFileText = {
  mtimeMs: number;
  size: number;
  text: string;
};

type CachedPbHeader = {
  mtimeMs: number;
  size: number;
  source?: string;
  packageName?: string;
};

let goFileUrisCache: { excludeKey: string; uris: vscode.Uri[] } | undefined;
let pbGoFileUrisCache: { excludeKey: string; uris: vscode.Uri[] } | undefined;
const fileTextCache = new Map<string, CachedFileText>();
const pbHeaderCache = new Map<string, CachedPbHeader>();
const protoPackageInfoCache = new Map<string, GoPackageInfo | undefined>();

function isCancellationRequested(token?: vscode.CancellationToken): boolean {
  return token?.isCancellationRequested === true;
}

function buildConfigCacheKey(config: ProtoJumpConfig): string {
  return JSON.stringify({
    protoRoots: config.protoRoots,
    exclude: config.exclude
  });
}

function isGeneratedGoFile(uri: vscode.Uri): boolean {
  const base = path.basename(uri.fsPath);
  return base.endsWith('.pb.go') || base.endsWith('.pb.gw.go') || base.includes('.pb.');
}

async function getWorkspaceGoFileUris(token?: vscode.CancellationToken): Promise<vscode.Uri[]> {
  if (isCancellationRequested(token)) return [];

  const config = getConfig();
  const excludeKey = config.exclude.join('\n');
  if (goFileUrisCache?.excludeKey === excludeKey) return goFileUrisCache.uris;

  const uris = await vscode.workspace.findFiles(
    '**/*.go',
    getWorkspaceExcludeGlob(config),
    MAX_WORKSPACE_GO_FILES,
    token
  );
  goFileUrisCache = { excludeKey, uris };
  return uris;
}

async function getWorkspacePbGoFileUris(token?: vscode.CancellationToken): Promise<vscode.Uri[]> {
  if (isCancellationRequested(token)) return [];

  const config = getConfig();
  const excludeKey = config.exclude.join('\n');
  if (pbGoFileUrisCache?.excludeKey === excludeKey) return pbGoFileUrisCache.uris;

  const uris = await vscode.workspace.findFiles(
    '**/*.pb.go',
    getWorkspaceExcludeGlob(config),
    MAX_WORKSPACE_GO_FILES,
    token
  );
  pbGoFileUrisCache = { excludeKey, uris };
  return uris;
}

async function getNonGeneratedGoFileUris(token?: vscode.CancellationToken): Promise<vscode.Uri[]> {
  return (await getWorkspaceGoFileUris(token)).filter(uri => !isGeneratedGoFile(uri));
}

async function readCachedFileText(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<string | undefined> {
  if (isCancellationRequested(token)) return undefined;

  let stat;
  try {
    stat = await fs.stat(uri.fsPath);
  } catch {
    return undefined;
  }

  const cached = fileTextCache.get(uri.fsPath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.text;
  }

  if (isCancellationRequested(token)) return undefined;
  let text: string;
  try {
    text = await fs.readFile(uri.fsPath, 'utf8');
  } catch {
    return undefined;
  }

  fileTextCache.set(uri.fsPath, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    text
  });
  return text;
}

async function readCachedPbHeader(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<CachedPbHeader | undefined> {
  if (isCancellationRequested(token)) return undefined;

  let stat;
  try {
    stat = await fs.stat(uri.fsPath);
  } catch {
    return undefined;
  }

  const cached = pbHeaderCache.get(uri.fsPath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  if (isCancellationRequested(token)) return undefined;
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(uri.fsPath, 'r');
    const buffer = Buffer.alloc(Math.min(PB_HEADER_BYTES, stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.toString('utf8', 0, bytesRead);
    const sourceMatch = header.match(/^\/\/\s*source:\s*(.+)\s*$/m);
    const pkgMatch = header.match(/^package\s+([A-Za-z_][A-Za-z0-9_]*)/m);
    const parsed = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      source: sourceMatch ? normalizeSlashes(sourceMatch[1].trim()) : undefined,
      packageName: pkgMatch?.[1]
    };
    pbHeaderCache.set(uri.fsPath, parsed);
    return parsed;
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

export function clearGoUsageCaches(): void {
  goFileUrisCache = undefined;
  pbGoFileUrisCache = undefined;
  fileTextCache.clear();
  pbHeaderCache.clear();
  protoPackageInfoCache.clear();
}

export function registerGoUsageCacheInvalidation(context: vscode.ExtensionContext): void {
  const clear = () => clearGoUsageCaches();
  for (const pattern of ['**/*.go', '**/*.proto']) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    context.subscriptions.push(
      watcher,
      watcher.onDidCreate(clear),
      watcher.onDidChange(clear),
      watcher.onDidDelete(clear)
    );
  }
}

function buildProtoSourceCandidates(protoFsPath: string, config: ProtoJumpConfig): string[] {
  const { protoRoots } = config;
  const candidates = new Set<string>();
  candidates.add(normalizeSlashes(vscode.workspace.asRelativePath(protoFsPath, false)));
  for (const root of protoRoots) {
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (protoFsPath.startsWith(rootWithSep)) {
      candidates.add(normalizeSlashes(path.relative(root, protoFsPath)));
    }
  }
  return Array.from(candidates).filter(Boolean);
}

async function resolveGoPackageInfoForProtoFile(
  protoDoc: vscode.TextDocument,
  token?: vscode.CancellationToken
): Promise<GoPackageInfo | undefined> {
  if (isCancellationRequested(token)) return undefined;

  const config = getConfig();
  const cacheKey = `${protoDoc.uri.toString()}#${protoDoc.version}#${buildConfigCacheKey(config)}`;
  if (protoPackageInfoCache.has(cacheKey)) return protoPackageInfoCache.get(cacheKey);

  const strictCandidates = buildProtoSourceCandidates(protoDoc.uri.fsPath, config);
  const basenameCandidate = normalizeSlashes(path.basename(protoDoc.uri.fsPath));
  const pbGos = await getWorkspacePbGoFileUris(token);
  const basenameMatchedPackages: string[] = [];
  const declaredInfo = parseGoPackageInfo(protoDoc.getText());

  for (const uri of pbGos) {
    if (isCancellationRequested(token)) return undefined;
    const header = await readCachedPbHeader(uri, token);
    if (!header?.source) continue;
    const source = header.source;
    if (!strictCandidates.includes(source)) {
      if (source === basenameCandidate) {
        if (header.packageName) basenameMatchedPackages.push(header.packageName);
      }
      continue;
    }

    if (header.packageName) {
      const result = { packageName: header.packageName, importPath: declaredInfo?.importPath };
      protoPackageInfoCache.set(cacheKey, result);
      return result;
    }
  }

  if (basenameMatchedPackages.length === 1) {
    const result = { packageName: basenameMatchedPackages[0], importPath: declaredInfo?.importPath };
    protoPackageInfoCache.set(cacheKey, result);
    return result;
  }

  if (declaredInfo) {
    protoPackageInfoCache.set(cacheKey, declaredInfo);
    return declaredInfo;
  }

  const protoPackageMatch = protoDoc.getText().match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
  if (protoPackageMatch) {
    const seg = protoPackageMatch[1].split('.').pop()?.trim();
    if (seg) {
      const result = { packageName: seg };
      protoPackageInfoCache.set(cacheKey, result);
      return result;
    }
  }

  protoPackageInfoCache.set(cacheKey, undefined);
  return undefined;
}

function getProtoDefinitionNameAtPosition(doc: vscode.TextDocument, pos: vscode.Position): string | undefined {
  return getProtoDefinitionSymbolAtPosition(doc, pos)?.name;
}

function getProtoDefinitionSymbolAtPosition(doc: vscode.TextDocument, pos: vscode.Position) {
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;
  return findProtoDeclarationAtOffset(doc.getText(), doc.offsetAt(pos));
}

export function getProtoDefinitionNameAtCursor(editor: vscode.TextEditor): string | undefined {
  return getProtoDefinitionNameAtPosition(editor.document, editor.selection.active);
}

function toGoExportedName(protoName: string): string {
  const parts = protoName.split('_').filter(Boolean);
  let out = '';
  for (let i = 0; i < parts.length; i += 1) {
    const seg = parts[i];
    const mapped = seg.length === 0 ? seg : seg[0].toUpperCase() + seg.slice(1);
    if (i > 0 && /^\d/.test(seg)) out += '_';
    out += mapped;
  }
  return out;
}

function getProtoFieldContextAtPosition(
  doc: vscode.TextDocument,
  pos: vscode.Position
): ProtoFieldContext | undefined {
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;
  return findProtoFieldContextAtOffset(doc.getText(), doc.offsetAt(pos));
}

export async function pickProtoDefinitionName(editor: vscode.TextEditor, strings: ReturnType<typeof getStrings>): Promise<string | undefined> {
  const doc = editor.document;
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;

  const candidates = scanProtoSymbols(doc.getText())
    .filter(symbol => symbol.kind !== 'field')
    .map(symbol => ({
      kind: symbol.kind,
      name: symbol.name,
      line: doc.positionAt(symbol.startOffset).line
    }));

  const seen = new Set<string>();
  const items = candidates
    .filter(c => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    })
    .slice(0, 500)
    .map(c => ({
      label: c.name,
      description: c.kind,
      line: c.line
    }));

  const picked = await vscode.window.showQuickPick(items, {
    title: strings.pickProtoDefinitionTitle,
    placeHolder: strings.pickProtoDefinitionPlaceholder,
    matchOnDescription: true
  });
  if (!picked) return undefined;
  return picked.label;
}

export function findProtoDefinitionPosition(doc: vscode.TextDocument, name: string): vscode.Position | undefined {
  const match = findProtoDeclarationSymbol(doc.getText(), name);
  return match ? doc.positionAt(match.startOffset) : undefined;
}

function findProtoSymbolLocationsInDocument(
  doc: vscode.TextDocument,
  symbolName: string
): vscode.Location[] {
  const locations: vscode.Location[] = [];
  const addLocation = (startOffset: number, endOffset: number) => {
    locations.push(new vscode.Location(doc.uri, new vscode.Range(doc.positionAt(startOffset), doc.positionAt(endOffset))));
  };

  for (const symbol of scanProtoSymbols(doc.getText())) {
    if (symbol.name === symbolName) addLocation(symbol.startOffset, symbol.endOffset);
    if (symbol.typeName?.name === symbolName) addLocation(symbol.typeName.startOffset, symbol.typeName.endOffset);
  }
  return locations;
}

export async function showReferencesNative(
  sourceUri: vscode.Uri,
  sourcePos: vscode.Position,
  locations: vscode.Location[]
): Promise<void> {
  await vscode.commands.executeCommand('editor.action.showReferences', sourceUri, sourcePos, locations);
}

function mergeGoUsageResults(...groups: GoUsage[][]): GoUsage[] {
  const out: GoUsage[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const usage of group) {
      const key = `${usage.uri.toString()}#${usage.range.start.line}:${usage.range.start.character}-${usage.range.end.line}:${usage.range.end.character}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(usage);
    }
  }
  return out;
}

function toGoUsage(uri: vscode.Uri, usage: GoTextUsage): GoUsage {
  return {
    uri,
    range: new vscode.Range(
      new vscode.Position(usage.line, usage.start),
      new vscode.Position(usage.line, usage.end)
    ),
    preview: usage.text
  };
}

async function findGoUsagesInWorkspaceByText(
  searchText: (text: string) => GoTextUsage[],
  maxResults: number,
  filePredicate?: (uri: vscode.Uri, text: string) => boolean,
  token?: vscode.CancellationToken
): Promise<GoUsage[]> {
  const results: GoUsage[] = [];
  const uris = await getNonGeneratedGoFileUris(token);

  for (const uri of uris) {
    if (isCancellationRequested(token)) return results;
    const text = await readCachedFileText(uri, token);
    if (text === undefined) continue;
    if (filePredicate && !filePredicate(uri, text)) continue;
    const matches = searchText(text);
    for (const match of matches) {
      results.push(toGoUsage(uri, match));
      if (results.length >= maxResults) return results;
    }
  }

  return results;
}

export async function findGoUsagesPreferQualifiedName(
  protoDoc: vscode.TextDocument,
  symbolName: string,
  token?: vscode.CancellationToken
): Promise<GoUsage[]> {
  const goPkg = await resolveGoPackageInfoForProtoFile(protoDoc, token);
  return findGoUsagesInWorkspaceByText(
    text => findGoSymbolUsagesInText(text, symbolName, goPkg),
    MAX_USAGE_RESULTS,
    (_uri, text) => text.includes(symbolName),
    token
  );
}

async function findGoCompositeFieldUsages(
  messageName: string,
  goFieldName: string,
  goPkg?: GoPackageInfo,
  token?: vscode.CancellationToken
): Promise<GoUsage[]> {
  return findGoUsagesInWorkspaceByText(
    text => findGoCompositeFieldUsagesInText(text, messageName, goFieldName, goPkg),
    MAX_USAGE_RESULTS,
    (_uri, text) => text.includes(goFieldName) && text.includes(messageName),
    token
  );
}

async function findGoVariableFieldUsages(
  messageName: string,
  goFieldName: string,
  goPkg?: GoPackageInfo,
  token?: vscode.CancellationToken
): Promise<GoUsage[]> {
  return findGoUsagesInWorkspaceByText(
    text => findGoVariableFieldUsagesInText(text, messageName, goFieldName, goPkg),
    MAX_USAGE_RESULTS,
    (_uri, text) => text.includes(goFieldName) && text.includes(messageName),
    token
  );
}

async function findGoFieldAccessUsages(
  goFieldName: string,
  filePredicate?: (uri: vscode.Uri, text: string) => boolean,
  token?: vscode.CancellationToken
): Promise<GoUsage[]> {
  return findGoUsagesInWorkspaceByText(
    text => findGoFieldAccessUsagesInText(text, goFieldName),
    MAX_USAGE_RESULTS,
    filePredicate,
    token
  );
}

export async function getGoUsagesForProtoPosition(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  withProgress: boolean,
  token?: vscode.CancellationToken
): Promise<vscode.Location[] | undefined> {
  const strings = getStrings();
  const fieldCtx = getProtoFieldContextAtPosition(doc, pos);

  if (fieldCtx?.kind === 'fieldName') {
    const goField = toGoExportedName(fieldCtx.fieldName);
    const messageName = fieldCtx.messageName;
    const findTask = async (searchToken?: vscode.CancellationToken) => {
      if (messageName && messageName.length > 0) {
        const goPkgInfo = await resolveGoPackageInfoForProtoFile(doc, searchToken);
        const filePredicate = (_uri: vscode.Uri, text: string) =>
          text.includes(goField) &&
          (
            text.includes(messageName) ||
            (goPkgInfo?.packageName ? text.includes(goPkgInfo.packageName) : false) ||
            (goPkgInfo?.importPath ? text.includes(goPkgInfo.importPath) : false)
          );

        const [varUsages, composite] = await Promise.all([
          findGoVariableFieldUsages(messageName, goField, goPkgInfo, searchToken),
          findGoCompositeFieldUsages(messageName, goField, goPkgInfo, searchToken)
        ]);
        if (isCancellationRequested(searchToken)) return mergeGoUsageResults(varUsages, composite).slice(0, MAX_USAGE_RESULTS);
        const fallback = await findGoFieldAccessUsages(goField, filePredicate, searchToken);
        const merged = mergeGoUsageResults(varUsages, composite, fallback).slice(0, MAX_USAGE_RESULTS);
        if (merged.length > 0) return merged;
      }
      return findGoFieldAccessUsages(
        goField,
        messageName && messageName.length > 0
          ? (_uri, text) => text.includes(goField) && text.includes(messageName)
          : (_uri, text) => text.includes(goField),
        searchToken
      );
    };

    const combined = withProgress
      ? await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: strings.searchingGoUsages, cancellable: true },
        (_progress, progressToken) => findTask(progressToken)
      )
      : await findTask(token);
    return combined.slice(0, MAX_REFERENCE_LOCATIONS).map(m => new vscode.Location(m.uri, m.range));
  }

  if (fieldCtx?.kind === 'fieldType') {
    const goTypeName = fieldCtx.goTypeName ?? fieldCtx.typeName;
    const findTask = (searchToken?: vscode.CancellationToken) => findGoUsagesPreferQualifiedName(doc, goTypeName, searchToken);
    const matches = withProgress
      ? await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: strings.searchingGoUsages, cancellable: true },
        (_progress, progressToken) => findTask(progressToken)
      )
      : await findTask(token);
    const goLocations = matches.map(m => new vscode.Location(m.uri, m.range));
    const protoLocations = findProtoSymbolLocationsInDocument(doc, fieldCtx.typeName);
    return mergeLocations(protoLocations, goLocations).slice(0, MAX_REFERENCE_LOCATIONS);
  }

  const symbol = getProtoDefinitionSymbolAtPosition(doc, pos);
  if (symbol) {
    const goSymbolName = symbol.kind === 'message' ? symbol.fullName ?? symbol.name : symbol.name;
    const findTask = (searchToken?: vscode.CancellationToken) => findGoUsagesPreferQualifiedName(doc, goSymbolName, searchToken);
    const matches = withProgress
      ? await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: strings.searchingGoUsages, cancellable: true },
        (_progress, progressToken) => findTask(progressToken)
      )
      : await findTask(token);
    const goLocations = matches.map(m => new vscode.Location(m.uri, m.range));
    const protoLocations = findProtoSymbolLocationsInDocument(doc, symbol.name);
    return mergeLocations(protoLocations, goLocations).slice(0, MAX_REFERENCE_LOCATIONS);
  }

  return undefined;
}

export class ProtoGoDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition | vscode.LocationLink[]> {
    const locations = await getGoUsagesForProtoPosition(document, position, false, token);
    return locations || [];
  }
}
