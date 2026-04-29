// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { getConfig, getWorkspaceExcludeGlob } from './config';
import { extractProtoPathFromPbGo } from './core';
import { findGoImportPathForQualifiedSymbolAtOffset } from './goText';
import {
  buildWorkspaceProtoSourceCandidates,
  resolveGoModuleImportDir,
  resolveProtoSourceNearGeneratedPath
} from './pathResolver';
import { scanProtoSymbols, type ProtoSymbol } from './protoScanner';
import { estimateStringBytes, LruCache, MIB } from './lruCache';
import { toGoExportedName } from './naming';
import { escapeForGlob, makeResolveKey } from './utils';

export type ResolveResult = {
  protoUri: vscode.Uri;
  targetRange: vscode.Range;
};

export type ResolveTraceCandidate = {
  fsPath: string;
  exists: boolean;
  via: string;
};

export type ResolveTrace = {
  symbolName?: string;
  steps: string[];
  protoCandidates: ResolveTraceCandidate[];
  result?: ResolveResult;
};

type NativeDefinition = vscode.Location | vscode.LocationLink;

type CachedGeneratedGoText = {
  mtimeMs: number;
  size: number;
  text: string;
  source?: string;
};

type CachedProtoSymbolIndex = {
  version: number;
  symbols: ProtoSymbol[];
};

type NativeDefinitionResult = {
  definitions: NativeDefinition[];
  error?: unknown;
};

type GeneratedPackageIndex = {
  symbols: Map<string, string>;
};

const GENERATED_GO_TEXT_CACHE_LIMIT_BYTES = 64 * MIB;
const PROTO_SYMBOL_INDEX_CACHE_LIMIT = 300;

const resolvingKeys = new Set<string>();
const protoUriCache = new Map<string, string | undefined>();
const goModuleImportDirCache = new Map<string, string | undefined>();
const generatedPackageIndexCache = new Map<string, GeneratedPackageIndex>();
const generatedGoTextCache = new LruCache<string, CachedGeneratedGoText>({
  maxSize: GENERATED_GO_TEXT_CACHE_LIMIT_BYTES,
  sizeOf: value => estimateStringBytes(value.text)
});
const protoSymbolIndexCache = new LruCache<string, CachedProtoSymbolIndex>({
  maxEntries: PROTO_SYMBOL_INDEX_CACHE_LIMIT
});

function elapsedSince(startMs: number): string {
  return `${Date.now() - startMs}ms`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function executeNativeDefinitionProvider(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<NativeDefinitionResult> {
  try {
    const definitions = await vscode.commands.executeCommand<NativeDefinition[]>(
      'vscode.executeDefinitionProvider',
      document.uri,
      position
    );
    return { definitions: definitions ?? [] };
  } catch (error) {
    return { definitions: [], error };
  }
}

async function resolveProtoUri(
  protoPathFromPbGo: string,
  generatedGoFile?: string,
  trace?: ResolveTrace
): Promise<vscode.Uri | undefined> {
  const config = getConfig();
  const workspaceFolders = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? [];
  const cacheKey = buildProtoUriCacheKey(
    protoPathFromPbGo,
    generatedGoFile,
    config.protoRoots,
    workspaceFolders,
    config.searchInWorkspace,
    config.exclude
  );
  if (protoUriCache.has(cacheKey)) {
    const cached = protoUriCache.get(cacheKey);
    trace?.steps.push(`proto uri cache ${cached ? 'hit' : 'miss'}: ${protoPathFromPbGo}`);
    return cached ? vscode.Uri.file(cached) : undefined;
  }

  if (path.isAbsolute(protoPathFromPbGo) && fs.existsSync(protoPathFromPbGo)) {
    addTraceCandidate(trace, protoPathFromPbGo, true, 'absolute source');
    protoUriCache.set(cacheKey, path.normalize(protoPathFromPbGo));
    return vscode.Uri.file(protoPathFromPbGo);
  } else if (path.isAbsolute(protoPathFromPbGo)) {
    addTraceCandidate(trace, protoPathFromPbGo, false, 'absolute source');
  }

  const { protoRoots, searchInWorkspace } = config;

  for (const root of protoRoots) {
    const full = path.join(root, protoPathFromPbGo);
    const exists = fs.existsSync(full);
    addTraceCandidate(trace, full, exists, 'protoRoots');
    if (exists) {
      protoUriCache.set(cacheKey, path.normalize(full));
      return vscode.Uri.file(full);
    }
  }

  if (generatedGoFile) {
    const inferred = resolveProtoSourceNearGeneratedPath(protoPathFromPbGo, generatedGoFile);
    if (inferred) {
      addTraceCandidate(trace, inferred, true, 'generated sibling proto_src');
      protoUriCache.set(cacheKey, inferred);
      return vscode.Uri.file(inferred);
    }
    trace?.steps.push('generated sibling proto_src: no match');
  }

  for (const candidate of buildWorkspaceProtoSourceCandidates(protoPathFromPbGo, workspaceFolders)) {
    const exists = fs.existsSync(candidate);
    addTraceCandidate(trace, candidate, exists, 'workspace fixed candidate');
    if (exists) {
      const normalized = path.normalize(candidate);
      protoUriCache.set(cacheKey, normalized);
      return vscode.Uri.file(normalized);
    }
  }

  if (searchInWorkspace) {
    const glob = `**/${escapeForGlob(protoPathFromPbGo)}`;
    const started = Date.now();
    const matches = await vscode.workspace.findFiles(glob, getWorkspaceExcludeGlob(config), 5);
    if (matches.length > 0) {
      for (const match of matches) {
        addTraceCandidate(trace, match.fsPath, true, `workspace glob ${glob}`);
      }
      trace?.steps.push(`workspace glob ${glob}: ${matches.length} match(es) in ${elapsedSince(started)}`);
      protoUriCache.set(cacheKey, matches[0].fsPath);
      return matches[0];
    }
    trace?.steps.push(`workspace glob ${glob}: no match in ${elapsedSince(started)}`);
  }

  protoUriCache.set(cacheKey, undefined);
  return undefined;
}

function addTraceCandidate(
  trace: ResolveTrace | undefined,
  fsPath: string,
  exists: boolean,
  via: string
): void {
  trace?.protoCandidates.push({ fsPath: path.normalize(fsPath), exists, via });
}

function buildProtoUriCacheKey(
  protoPathFromPbGo: string,
  generatedGoFile: string | undefined,
  protoRoots: string[],
  workspaceFolders: string[],
  searchInWorkspace: boolean,
  exclude: string[]
): string {
  return JSON.stringify({
    protoPathFromPbGo,
    generatedGoDir: generatedGoFile ? path.dirname(generatedGoFile) : '',
    protoRoots,
    workspaceFolders,
    searchInWorkspace,
    exclude
  });
}

export async function resolveProtoDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<ResolveResult | undefined> {
  return (await resolveProtoDefinitionWithTrace(document, position)).result;
}

export async function resolveProtoDefinitionWithTrace(
  document: vscode.TextDocument,
  position: vscode.Position,
  nativeDefinitions?: NativeDefinition[]
): Promise<ResolveTrace> {
  const trace: ResolveTrace = { steps: [], protoCandidates: [] };
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
  if (!wordRange) {
    trace.steps.push('No symbol under cursor.');
    return trace;
  }
  const symbolName = document.getText(wordRange);
  trace.symbolName = symbolName;
  if (!symbolName) {
    trace.steps.push('Empty symbol under cursor.');
    return trace;
  }

  const nativeResolved = await resolveProtoDefinitionViaNativeDefinition(document, position, symbolName, trace, nativeDefinitions);
  if (nativeResolved) {
    trace.result = nativeResolved;
    return trace;
  }

  const fallbackResolved = await resolveProtoDefinitionViaImportFallback(document, position, symbolName, trace);
  if (fallbackResolved) trace.result = fallbackResolved;
  return trace;
}

async function resolveProtoDefinitionViaNativeDefinition(
  document: vscode.TextDocument,
  position: vscode.Position,
  symbolName: string,
  trace?: ResolveTrace,
  nativeDefinitions?: NativeDefinition[]
): Promise<ResolveResult | undefined> {
  let defs = nativeDefinitions;
  if (defs) {
    trace?.steps.push(`Native definition provider reused ${defs.length} definition(s).`);
  } else {
    const started = Date.now();
    const nativeResult = await executeNativeDefinitionProvider(document, position);
    defs = nativeResult.definitions;
    if (nativeResult.error) {
      trace?.steps.push(`Native definition provider failed in ${elapsedSince(started)}: ${errorMessage(nativeResult.error)}`);
    } else {
      trace?.steps.push(`Native definition provider returned ${defs.length} definition(s) in ${elapsedSince(started)}.`);
    }
  }

  if (!defs || defs.length === 0) return undefined;

  const pbGoDef = defs.find(d => {
    const uri = 'targetUri' in d ? (d as vscode.LocationLink).targetUri : (d as vscode.Location).uri;
    return uri.fsPath.endsWith('.pb.go') || uri.fsPath.endsWith('.pb.gw.go');
  });

  if (!pbGoDef) {
    trace?.steps.push('Native definitions did not include generated .pb.go.');
    return undefined;
  }

  const pbGoUri = 'targetUri' in pbGoDef ? (pbGoDef as vscode.LocationLink).targetUri : (pbGoDef as vscode.Location).uri;
  const pbGoRange = 'targetRange' in pbGoDef ? (pbGoDef as vscode.LocationLink).targetRange : (pbGoDef as vscode.Location).range;
  const defPath = pbGoUri.fsPath;

  const generatedText = readGeneratedTextInfo(defPath, trace);
  if (!generatedText) {
    trace?.steps.push(`Failed to read generated file: ${defPath}`);
    return undefined;
  }
  const pbGoText = generatedText.text;

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

  return resolveProtoFromGeneratedFile(defPath, generatedText, symbolName, containerName, trace);
}

async function resolveProtoFromGeneratedFile(
  generatedGoFile: string,
  generatedGo: CachedGeneratedGoText,
  symbolName: string,
  containerName?: string,
  trace?: ResolveTrace
): Promise<ResolveResult | undefined> {
  const protoPathFromPbGo = generatedGo.source;
  trace?.steps.push(`Generated source header: ${protoPathFromPbGo ?? '(not found)'}`);
  if (!protoPathFromPbGo) return undefined;

  const protoUri = await resolveProtoUri(protoPathFromPbGo, generatedGoFile, trace);
  if (!protoUri) return undefined;

  const protoDoc = await vscode.workspace.openTextDocument(protoUri);

  const match = findProtoSymbolMatchInDocument(protoDoc, symbolName, containerName, trace);
  const range = match
    ? new vscode.Range(protoDoc.positionAt(match.startOffset), protoDoc.positionAt(match.endOffset))
    : new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

  return { protoUri, targetRange: range };
}

async function resolveProtoDefinitionViaImportFallback(
  document: vscode.TextDocument,
  position: vscode.Position,
  symbolName: string,
  trace?: ResolveTrace
): Promise<ResolveResult | undefined> {
  const goText = document.getText();
  const ref = findGoImportPathForQualifiedSymbolAtOffset(goText, document.offsetAt(position));
  if (!ref || ref.symbolName !== symbolName) {
    trace?.steps.push('Import fallback: no qualified import reference under cursor.');
    return undefined;
  }
  trace?.steps.push(`Import fallback: ${ref.importPath}`);

  const importDir = resolveCachedGoModuleImportDir(ref.importPath, document.uri.fsPath);
  if (!importDir) {
    trace?.steps.push('Import fallback: import directory not resolved.');
    return undefined;
  }
  trace?.steps.push(`Import fallback directory: ${importDir}`);

  const generated = findGeneratedGoFileForSymbol(importDir, symbolName);
  if (!generated) {
    trace?.steps.push(`Import fallback: generated file not found for symbol ${symbolName}.`);
    return undefined;
  }

  return resolveProtoFromGeneratedFile(generated.filePath, generated.text, symbolName, undefined, trace);
}

function resolveCachedGoModuleImportDir(importPath: string, fromFile: string): string | undefined {
  const cacheKey = `${path.dirname(fromFile)}\n${importPath}`;
  if (goModuleImportDirCache.has(cacheKey)) return goModuleImportDirCache.get(cacheKey);

  const resolved = resolveGoModuleImportDir(importPath, fromFile);
  goModuleImportDirCache.set(cacheKey, resolved);
  return resolved;
}

function findGeneratedGoFileForSymbol(
  importDir: string,
  symbolName: string
): { filePath: string; text: CachedGeneratedGoText } | undefined {
  const index = getGeneratedPackageIndex(importDir);
  const filePath = index?.symbols.get(symbolName);
  if (!filePath) return undefined;
  const text = readGeneratedTextInfo(filePath);
  if (!text) return undefined;
  return { filePath, text };
}

function getGeneratedPackageIndex(importDir: string): GeneratedPackageIndex | undefined {
  const cached = generatedPackageIndexCache.get(importDir);
  if (cached) return cached;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(importDir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const index = { symbols: new Map<string, string>() };
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.pb.go') && !entry.name.endsWith('.pb.gw.go')) continue;

    const filePath = path.join(importDir, entry.name);
    const generatedText = readGeneratedTextInfo(filePath);
    if (!generatedText) continue;

    for (const match of generatedText.text.matchAll(/^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm)) {
      const symbolName = match[1];
      if (!index.symbols.has(symbolName)) index.symbols.set(symbolName, filePath);
    }
  }

  generatedPackageIndexCache.set(importDir, index);
  return index;
}

function readGeneratedTextInfo(filePath: string, trace?: ResolveTrace): CachedGeneratedGoText | undefined {
  try {
    const stat = fs.statSync(filePath);
    const cached = generatedGoTextCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      trace?.steps.push(`generated file cache hit: ${filePath}`);
      return cached;
    }
    const started = Date.now();
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      text,
      source: extractProtoPathFromPbGo(text)
    };
    generatedGoTextCache.set(filePath, parsed);
    trace?.steps.push(`generated file cache miss: ${filePath} read in ${elapsedSince(started)}`);
    return parsed;
  } catch {
    return undefined;
  }
}

function getProtoSymbolIndex(protoDoc: vscode.TextDocument, trace?: ResolveTrace): ProtoSymbol[] {
  const cacheKey = protoDoc.uri.toString();
  const cached = protoSymbolIndexCache.get(cacheKey);
  if (cached && cached.version === protoDoc.version) {
    trace?.steps.push(`proto symbol index cache hit: ${protoDoc.uri.fsPath}`);
    return cached.symbols;
  }
  const started = Date.now();
  const symbols = scanProtoSymbols(protoDoc.getText());
  protoSymbolIndexCache.set(cacheKey, { version: protoDoc.version, symbols });
  trace?.steps.push(`proto symbol index cache miss: ${protoDoc.uri.fsPath} scanned ${symbols.length} symbol(s) in ${elapsedSince(started)}`);
  return symbols;
}

function findProtoSymbolMatchInDocument(
  protoDoc: vscode.TextDocument,
  symbolName: string,
  containerName?: string,
  trace?: ResolveTrace
): ProtoSymbol | undefined {
  const symbols = getProtoSymbolIndex(protoDoc, trace);

  if (containerName) {
    const fieldMatch = symbols.find(symbol =>
      symbol.kind === 'field' &&
      (symbol.containerName === containerName || symbol.containerName?.split('_').pop() === containerName) &&
      (
        symbol.name === symbolName ||
        symbol.name.toLowerCase() === symbolName.toLowerCase() ||
        toGoExportedName(symbol.name) === symbolName
      )
    );
    if (fieldMatch) return fieldMatch;
  }

  const kindOrder: Array<ProtoSymbol['kind']> = ['message', 'enum', 'rpc', 'service'];
  for (const kind of kindOrder) {
    const match = symbols.find(symbol =>
      symbol.kind === kind && (symbol.name === symbolName || symbol.fullName === symbolName)
    );
    if (match) return match;
  }
  return undefined;
}

export function clearProtoResolverCaches(): void {
  protoUriCache.clear();
  goModuleImportDirCache.clear();
  generatedPackageIndexCache.clear();
  generatedGoTextCache.clear();
  protoSymbolIndexCache.clear();
}

export function registerProtoResolverCacheInvalidation(context: vscode.ExtensionContext): void {
  for (const pattern of ['**/*.go', '**/*.proto', '**/go.mod']) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    context.subscriptions.push(
      watcher,
      watcher.onDidCreate(clearProtoResolverCaches),
      watcher.onDidChange(clearProtoResolverCaches),
      watcher.onDidDelete(clearProtoResolverCaches)
    );
  }
}

export async function goToProtoDefinition(editor: vscode.TextEditor): Promise<boolean> {
  const document = editor.document;
  const position = editor.selection.active;
  const key = makeResolveKey(document.uri, position);
  if (resolvingKeys.has(key)) return false;
  resolvingKeys.add(key);
  let resolved: ResolveResult | undefined;
  try {
    const nativeResult = await executeNativeDefinitionProvider(document, position);
    resolved = (await resolveProtoDefinitionWithTrace(document, position, nativeResult.definitions)).result;
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
    const nativeResult = await executeNativeDefinitionProvider(document, position);
    nativeDefs = nativeResult.definitions
      .map(d => 'targetUri' in d
        ? new vscode.Location((d as vscode.LocationLink).targetUri, (d as vscode.LocationLink).targetSelectionRange ?? (d as vscode.LocationLink).targetRange)
        : (d as vscode.Location))
      .filter(loc => loc.uri.fsPath.endsWith('.pb.go') || loc.uri.fsPath.endsWith('.pb.gw.go'));
    resolved = (await resolveProtoDefinitionWithTrace(document, position, nativeResult.definitions)).result;
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
