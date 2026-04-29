// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

import { extractProtoPathFromPbGo, findProtoSymbolMatch } from './core';
import { ProtoJumpViewProvider } from './view';
import { getStrings, getUiLanguage } from './i18n';

type ResolveResult = {
  protoUri: vscode.Uri;
  targetRange: vscode.Range;
};

type GoPackageInfo = {
  packageName: string;
  importPath?: string;
};

type GoUsage = {
  uri: vscode.Uri;
  range: vscode.Range;
  preview: string;
};

const resolvingKeys = new Set<string>();
const execFile = promisify(execFileCb);

function makeResolveKey(uri: vscode.Uri, position: vscode.Position): string {
  return `${uri.toString()}::${position.line}:${position.character}`;
}

function getConfig() {
  const config = vscode.workspace.getConfiguration('protoJump');
  return {
    protoRoots: (config.get<string[]>('protoRoots') ?? []).map(normalizeConfigPath).filter(Boolean),
    searchInWorkspace: config.get<boolean>('searchInWorkspace') ?? true,
    makeProtoCommand: (config.get<string>('makeProtoCommand') ?? '').trim()
  };
}

type ProtoCompileContext = {
  workspaceFolder: string,
  protoSrcRoot: string,
  protoFile: string,
  protoFileNoExt: string,
  protoDir: string,
  relativeProto: string,
  relativeProtoNoExt: string,
  protoPackage: string,
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function normalizeConfigPath(configPath: string): string {
  const trimmed = configPath.trim();
  if (!trimmed) return '';
  const home = process.env.HOME;
  const expanded = home
    ? trimmed.replace(/^\$HOME(?=$|[\\/])/, home).replace(/^~(?=$|[\\/])/, home)
    : trimmed;
  return path.normalize(expanded);
}

function resolveProtoSrcRoot(protoFile: string): string | undefined {
  const normalizedProtoFile = path.normalize(protoFile);
  const matchingConfiguredRoots = getConfig().protoRoots
    .filter(root => {
      const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
      return normalizedProtoFile === root || normalizedProtoFile.startsWith(rootWithSep);
    })
    .sort((a, b) => b.length - a.length);
  if (matchingConfiguredRoots.length > 0) return matchingConfiguredRoots[0];

  let current = path.dirname(protoFile);
  while (true) {
    if (path.basename(current) === 'proto_src' && fs.existsSync(path.join(current, 'Makefile'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function resolveProtoCompileContext(doc: vscode.TextDocument): ProtoCompileContext | undefined {
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;
  const protoFile = doc.uri.fsPath;
  const protoSrcRoot = resolveProtoSrcRoot(protoFile);
  if (!protoSrcRoot) return undefined;

  const relativeProto = normalizeSlashes(path.relative(protoSrcRoot, protoFile));
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath ?? path.dirname(protoSrcRoot);
  const text = doc.getText();
  const goPackageMatch = text.match(/^\s*option\s+go_package\s*=\s*"([^"]+)";/m);
  const protoPackageMatch = text.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
  const protoPackage = goPackageMatch
    ? (goPackageMatch[1].split(';').pop()?.split('/').pop()?.trim() ?? '')
    : (protoPackageMatch?.[1].split('.').pop()?.trim() ?? '');
  if (!protoPackage) return undefined;

  const protoFileNoExt = path.basename(protoFile, '.proto');
  return {
    workspaceFolder,
    protoSrcRoot,
    protoFile,
    protoFileNoExt,
    protoDir: path.dirname(protoFile),
    relativeProto,
    relativeProtoNoExt: normalizeSlashes(relativeProto.replace(/\.proto$/, '')),
    protoPackage,
  };
}

function applyMakeProtoTemplate(template: string, ctx: ProtoCompileContext): string {
  const values: Record<string, string> = {
    workspaceFolder: ctx.workspaceFolder,
    protoSrcRoot: ctx.protoSrcRoot,
    protoFile: ctx.protoFile,
    protoFileNoExt: ctx.protoFileNoExt,
    protoDir: ctx.protoDir,
    relativeProto: ctx.relativeProto,
    relativeProtoNoExt: ctx.relativeProtoNoExt,
    protoPackage: ctx.protoPackage,
  };

  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, shellQuote(value));
  }
  return output;
}

function escapeForGlob(p: string): string {
  return p.replaceAll('\\', '/');
}

function normalizeSlashes(p: string): string {
  return p.replaceAll('\\', '/');
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isTextEditor(arg: unknown): arg is vscode.TextEditor {
  return !!arg && typeof arg === 'object' && 'document' in (arg as any) && 'selection' in (arg as any);
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === ch) n += 1;
  }
  return n;
}

function buildProtoSourceCandidates(protoFsPath: string): string[] {
  const { protoRoots } = getConfig();
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

function parseGoPackageInfo(protoText: string): GoPackageInfo | undefined {
  const goPackageMatch = protoText.match(/^\s*option\s+go_package\s*=\s*"([^"]+)";/m);
  if (!goPackageMatch) return undefined;

  const value = goPackageMatch[1].trim();
  if (!value) return undefined;
  if (value.includes(';')) {
    const [importPath, packageName] = value.split(';');
    const trimmedPackageName = packageName?.trim();
    if (!trimmedPackageName) return undefined;
    return {
      packageName: trimmedPackageName,
      importPath: importPath.trim() || undefined
    };
  }

  const parts = value.split('/');
  const packageName = parts[parts.length - 1]?.trim();
  if (!packageName) return undefined;
  return {
    packageName,
    importPath: value.includes('/') ? value : undefined
  };
}

async function resolveGoPackageInfoForProtoFile(protoDoc: vscode.TextDocument): Promise<GoPackageInfo | undefined> {
  const strictCandidates = buildProtoSourceCandidates(protoDoc.uri.fsPath);
  const basenameCandidate = normalizeSlashes(path.basename(protoDoc.uri.fsPath));
  const exclude = '**/{node_modules,vendor,out,dist,.git}/**';
  const pbGos = await vscode.workspace.findFiles('**/*.pb.go', exclude, 5000);
  const basenameMatchedPackages: string[] = [];
  const declaredInfo = parseGoPackageInfo(protoDoc.getText());

  for (const uri of pbGos) {
    let header: string;
    try {
      header = fs.readFileSync(uri.fsPath, 'utf8').slice(0, 6000);
    } catch {
      continue;
    }
    const sourceMatch = header.match(/^\/\/\s*source:\s*(.+)\s*$/m);
    if (!sourceMatch) continue;
    const source = normalizeSlashes(sourceMatch[1].trim());
    if (!strictCandidates.includes(source)) {
      if (source === basenameCandidate) {
        const pkgMatch = header.match(/^package\s+([A-Za-z_][A-Za-z0-9_]*)/m);
        if (pkgMatch) basenameMatchedPackages.push(pkgMatch[1]);
      }
      continue;
    }

    const pkgMatch = header.match(/^package\s+([A-Za-z_][A-Za-z0-9_]*)/m);
    if (pkgMatch) return { packageName: pkgMatch[1], importPath: declaredInfo?.importPath };
  }

  if (basenameMatchedPackages.length === 1) {
    return { packageName: basenameMatchedPackages[0], importPath: declaredInfo?.importPath };
  }

  if (declaredInfo) return declaredInfo;

  const protoPackageMatch = protoDoc.getText().match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
  if (protoPackageMatch) {
    const seg = protoPackageMatch[1].split('.').pop()?.trim();
    if (seg) return { packageName: seg };
  }

  return undefined;
}

async function resolveGoPackageForProtoFile(protoDoc: vscode.TextDocument): Promise<string | undefined> {
  return (await resolveGoPackageInfoForProtoFile(protoDoc))?.packageName;
}

function getProtoDefinitionNameAtPosition(doc: vscode.TextDocument, pos: vscode.Position): string | undefined {
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;
  const wordRange = doc.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_]*/);
  if (!wordRange) return undefined;
  const name = doc.getText(wordRange);
  if (!name) return undefined;
  const line = doc.lineAt(pos.line).text;
  const re = new RegExp(`\\b(message|enum|service|rpc)\\s+${escapeForRegex(name)}\\b`);
  if (!re.test(line)) return undefined;
  return name;
}

function getProtoDefinitionNameAtCursor(editor: vscode.TextEditor): string | undefined {
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

function getEnclosingProtoMessageNameAtLine(doc: vscode.TextDocument, lineIndex: number): string | undefined {
  const declRe = /^\s*message\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
  const stack: Array<{ name: string; startDepth: number }> = [];
  let depth = 0;
  let pending: { name: string; depth: number } | undefined;

  const finalizePendingIfNeeded = (line: string) => {
    if (!pending) return;
    const braceIdx = line.indexOf('{');
    if (braceIdx === -1) return;
    const before = line.slice(0, braceIdx);
    if (declRe.test(before) || declRe.test(line)) {
      depth += 1;
      stack.push({ name: pending.name, startDepth: depth });
      pending = undefined;
      depth += countChar(line.slice(braceIdx + 1), '{');
      depth -= countChar(line.slice(braceIdx + 1), '}');
    }
  };

  for (let i = 0; i <= lineIndex && i < doc.lineCount; i += 1) {
    const line = doc.lineAt(i).text;
    const m = declRe.exec(line);
    if (m) pending = { name: m[1], depth };

    const open = countChar(line, '{');
    const close = countChar(line, '}');
    if (pending && open > 0) {
      finalizePendingIfNeeded(line);
    } else {
      depth += open;
      depth -= close;
    }

    while (stack.length > 0 && depth < stack[stack.length - 1].startDepth) {
      stack.pop();
    }
  }

  return stack.length > 0 ? stack[stack.length - 1].name : undefined;
}

function getProtoFieldContextAtPosition(
  doc: vscode.TextDocument,
  pos: vscode.Position
): { kind: 'fieldName'; fieldName: string; messageName?: string } | { kind: 'fieldType'; typeName: string } | undefined {
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;
  const wordRange = doc.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_]*/);
  if (!wordRange) return undefined;
  const word = doc.getText(wordRange);
  if (!word) return undefined;
  const line = doc.lineAt(pos.line).text;

  const fieldDeclRe = /^\s*(?:repeated|optional)?\s*(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\d+\b/;
  const m = fieldDeclRe.exec(line);
  if (!m) return undefined;
  const typePart = m[1].trim();
  const fieldName = m[2];

  if (word === fieldName) {
    const messageName = getEnclosingProtoMessageNameAtLine(doc, pos.line);
    return { kind: 'fieldName', fieldName, messageName };
  }

  const primitives = new Set([
    'double',
    'float',
    'int32',
    'int64',
    'uint32',
    'uint64',
    'sint32',
    'sint64',
    'fixed32',
    'fixed64',
    'sfixed32',
    'sfixed64',
    'bool',
    'string',
    'bytes'
  ]);

  let typeName = typePart;
  if (typeName.startsWith('map<')) {
    const mm = /^map<[^,]+,\s*([A-Za-z_][A-Za-z0-9_\.]*)\s*>/.exec(typeName);
    if (mm) typeName = mm[1];
  }
  typeName = typeName.split(/\s+/).pop() ?? typeName;
  typeName = typeName.split('.').pop() ?? typeName;
  if (!typeName || primitives.has(typeName)) return undefined;

  if (word === typeName) return { kind: 'fieldType', typeName };
  return undefined;
}

async function pickProtoDefinitionName(editor: vscode.TextEditor, strings: ReturnType<typeof getStrings>): Promise<string | undefined> {
  const doc = editor.document;
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;

  const regex = /^\s*(message|enum|service|rpc)\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
  const candidates: Array<{ kind: string; name: string; line: number }> = [];

  const symbols = await vscode.commands.executeCommand<unknown>('vscode.executeDocumentSymbolProvider', doc.uri);
  const pushSymbol = (kind: string, name: string) => {
    if (!name) return;
    candidates.push({ kind, name, line: -1 });
  };
  const walk = (items: any[]) => {
    for (const it of items) {
      if (!it) continue;
      if (typeof it.name === 'string') {
        pushSymbol(typeof it.kind === 'number' ? String(it.kind) : 'symbol', it.name);
      }
      if (Array.isArray(it.children) && it.children.length > 0) walk(it.children);
    }
  };
  if (Array.isArray(symbols)) walk(symbols as any[]);

  if (candidates.length === 0) {
    for (let i = 0; i < doc.lineCount; i += 1) {
      const line = doc.lineAt(i).text;
      const m = regex.exec(line);
      if (!m) continue;
      candidates.push({ kind: m[1], name: m[2], line: i });
    }
  }

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

function findProtoDefinitionPosition(doc: vscode.TextDocument, name: string): vscode.Position | undefined {
  const re = new RegExp(`\\b(message|enum|service|rpc)\\s+${escapeForRegex(name)}\\b`);
  for (let i = 0; i < doc.lineCount; i += 1) {
    const line = doc.lineAt(i).text;
    const m = re.exec(line);
    if (!m || m.index === undefined) continue;
    const idx = line.indexOf(name, m.index);
    if (idx >= 0) return new vscode.Position(i, idx);
  }
  return undefined;
}

function findProtoSymbolLocationsInDocument(
  doc: vscode.TextDocument,
  symbolName: string
): vscode.Location[] {
  const escaped = escapeForRegex(symbolName);
  const re = new RegExp(`\\b${escaped}\\b`, 'g');
  const locations: vscode.Location[] = [];
  for (let i = 0; i < doc.lineCount; i += 1) {
    const line = doc.lineAt(i).text;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const idx = m.index ?? 0;
      locations.push(
        new vscode.Location(
          doc.uri,
          new vscode.Range(new vscode.Position(i, idx), new vscode.Position(i, idx + symbolName.length))
        )
      );
      if ((m[0] ?? '').length === 0) break;
    }
  }
  return locations;
}

function mergeLocations(primary: vscode.Location[], secondary: vscode.Location[]): vscode.Location[] {
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

function goUsageKey(usage: GoUsage): string {
  return `${usage.uri.toString()}#${usage.range.start.line}:${usage.range.start.character}-${usage.range.end.line}:${usage.range.end.character}`;
}

function mergeGoUsageResults(...groups: GoUsage[][]): GoUsage[] {
  const out: GoUsage[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const usage of group) {
      const key = goUsageKey(usage);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(usage);
    }
  }
  return out;
}

async function showReferencesNative(
  sourceUri: vscode.Uri,
  sourcePos: vscode.Position,
  locations: vscode.Location[]
): Promise<void> {
  await vscode.commands.executeCommand('editor.action.showReferences', sourceUri, sourcePos, locations);
}

function collectRegexMatchesInText(
  uri: vscode.Uri,
  text: string,
  regexes: RegExp[],
  results: GoUsage[],
  maxResults: number
): boolean {
  const lines = text.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const re of regexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const start = m.index ?? 0;
        const length = m[0]?.length ?? 0;
        results.push({
          uri,
          range: new vscode.Range(
            new vscode.Position(lineIndex, start),
            new vscode.Position(lineIndex, start + length)
          ),
          preview: line.replace(/\s+/g, ' ').trim()
        });
        if (results.length >= maxResults) return true;
        if (length === 0) break;
      }
      if (results.length >= maxResults) return true;
    }
  }
  return false;
}

async function findGoUsagesInWorkspaceByRegexes(
  regexes: RegExp[],
  maxResults: number,
  filePredicate?: (uri: vscode.Uri, text: string) => boolean
): Promise<GoUsage[]> {
  const exclude = '**/{node_modules,vendor,out,dist,.git}/**';
  const results: GoUsage[] = [];
  const uris = await vscode.workspace.findFiles('**/*.go', exclude, 5000);

  for (const uri of uris) {
    const base = path.basename(uri.fsPath);
    if (base.endsWith('.pb.go') || base.endsWith('.pb.gw.go') || base.includes('.pb.')) continue;
    let text: string;
    try {
      text = fs.readFileSync(uri.fsPath, 'utf8');
    } catch {
      continue;
    }
    if (filePredicate && !filePredicate(uri, text)) continue;
    if (collectRegexMatchesInText(uri, text, regexes, results, maxResults)) return results;
  }

  return results;
}

async function findGoUsagesInWorkspace(
  symbolName: string,
  filePredicate?: (uri: vscode.Uri, text: string) => boolean
): Promise<GoUsage[]> {
  const re = new RegExp(`\\b${escapeForRegex(symbolName)}\\b`, 'g');
  return findGoUsagesInWorkspaceByRegexes([re], 200, filePredicate);
}

function findImportAliases(goText: string, importPath: string, packageName: string): string[] {
  const aliases = new Set<string>();
  const addAlias = (rawAlias: string | undefined, rawPath: string | undefined) => {
    if (rawPath !== importPath) return;
    const alias = rawAlias?.trim();
    if (!alias) {
      aliases.add(packageName);
      return;
    }
    if (alias === '_' || alias === '.') return;
    aliases.add(alias);
  };

  const singleImportRe = /^\s*import\s+(?:(\w+|\.|_)\s+)?"([^"]+)"/gm;
  let singleMatch: RegExpExecArray | null;
  while ((singleMatch = singleImportRe.exec(goText)) !== null) {
    addAlias(singleMatch[1], singleMatch[2]);
  }

  const importBlockRe = /^\s*import\s*\(([\s\S]*?)^\s*\)/gm;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = importBlockRe.exec(goText)) !== null) {
    const body = blockMatch[1];
    const lineRe = /^\s*(?:(\w+|\.|_)\s+)?"([^"]+)"/gm;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRe.exec(body)) !== null) {
      addAlias(lineMatch[1], lineMatch[2]);
    }
  }

  return Array.from(aliases);
}

async function findGoImportAliasUsages(
  goPkg: GoPackageInfo,
  symbolName: string,
  maxResults: number
): Promise<GoUsage[]> {
  if (!goPkg.importPath) return [];

  const exclude = '**/{node_modules,vendor,out,dist,.git}/**';
  const results: GoUsage[] = [];
  const uris = await vscode.workspace.findFiles('**/*.go', exclude, 5000);

  for (const uri of uris) {
    const base = path.basename(uri.fsPath);
    if (base.endsWith('.pb.go') || base.endsWith('.pb.gw.go') || base.includes('.pb.')) continue;
    let text: string;
    try {
      text = fs.readFileSync(uri.fsPath, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes(goPkg.importPath) || !text.includes(symbolName)) continue;

    const aliases = findImportAliases(text, goPkg.importPath, goPkg.packageName);
    if (aliases.length === 0) continue;
    const regexes = aliases.map(alias => new RegExp(`\\b${escapeForRegex(alias)}\\.${escapeForRegex(symbolName)}\\b`, 'g'));
    if (collectRegexMatchesInText(uri, text, regexes, results, maxResults)) return results;
  }

  return results;
}

async function findGoUsagesPreferQualifiedName(
  protoDoc: vscode.TextDocument,
  symbolName: string
): Promise<GoUsage[]> {
  const goPkg = await resolveGoPackageInfoForProtoFile(protoDoc);
  let exactMatches: GoUsage[] = [];
  let aliasMatches: GoUsage[] = [];
  if (goPkg) {
    const qualifiedName = `${goPkg.packageName}.${symbolName}`;
    exactMatches = await findGoUsagesInWorkspaceByRegexes(
      [new RegExp(`\\b${escapeForRegex(qualifiedName)}\\b`, 'g')],
      200,
      (_uri, text) => text.includes(qualifiedName)
    );
    aliasMatches = await findGoImportAliasUsages(goPkg, symbolName, 200);
  }
  const bareMatches = await findGoUsagesInWorkspaceByRegexes(
    [new RegExp(`(?<!\\.)\\b${escapeForRegex(symbolName)}\\b`, 'g')],
    200
  );
  return mergeGoUsageResults(exactMatches, aliasMatches, bareMatches).slice(0, 200);
}

async function findGoCompositeFieldUsages(
  messageName: string,
  goFieldName: string
): Promise<Array<{ uri: vscode.Uri; range: vscode.Range; preview: string }>> {
  const exclude = '**/{node_modules,vendor,out,dist,.git}/**';
  const results: Array<{ uri: vscode.Uri; range: vscode.Range; preview: string }> = [];
  const uris = await vscode.workspace.findFiles('**/*.go', exclude, 5000);
  const typeRe = new RegExp(`(?:\\b|\\.)${escapeForRegex(messageName)}\\s*\\{`);
  const fieldRe = new RegExp(`\\b${escapeForRegex(goFieldName)}\\s*:`);

  for (const uri of uris) {
    const base = path.basename(uri.fsPath);
    if (base.endsWith('.pb.go') || base.endsWith('.pb.gw.go') || base.includes('.pb.')) continue;
    let text: string;
    try {
      text = fs.readFileSync(uri.fsPath, 'utf8');
    } catch {
      continue;
    }

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!typeRe.test(line)) continue;

      let started = false;
      let depth = 0;
      for (let j = i; j < lines.length && j < i + 60; j += 1) {
        const l = lines[j];
        if (!started) {
          const m = typeRe.exec(l);
          typeRe.lastIndex = 0;
          if (m && m.index !== undefined) {
            const braceIdx = l.indexOf('{', m.index);
            if (braceIdx >= 0) {
              started = true;
              depth = 1;
              const rest = l.slice(braceIdx + 1);
              depth += countChar(rest, '{');
              depth -= countChar(rest, '}');
            }
          }
        } else {
          depth += countChar(l, '{');
          depth -= countChar(l, '}');
        }

        if (fieldRe.test(l)) {
          const idx = l.search(new RegExp(`\\b${escapeForRegex(goFieldName)}\\b`));
          const start = idx >= 0 ? idx : 0;
          results.push({
            uri,
            range: new vscode.Range(new vscode.Position(j, start), new vscode.Position(j, start + goFieldName.length)),
            preview: l.replace(/\s+/g, ' ').trim()
          });
          if (results.length >= 200) return results;
        }

        if (started && depth <= 0 && j > i) break;
      }
    }
  }

  return results;
}

async function findGoVariableFieldUsages(
  typeRef: string,
  goFieldName: string
): Promise<Array<{ uri: vscode.Uri; range: vscode.Range; preview: string }>> {
  const exclude = '**/{node_modules,vendor,out,dist,.git}/**';
  const results: Array<{ uri: vscode.Uri; range: vscode.Range; preview: string }> = [];
  const uris = await vscode.workspace.findFiles('**/*.go', exclude, 5000);

  const typeRe = new RegExp(`${escapeForRegex(typeRef)}`);
  // Regex to find variable assignments/declarations: `varName := &Type{`, `varName := new(Type)`, `var varName Type`
  const assignRes = [
    { re: new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*:=\\s*&?\\s*([A-Za-z0-9_\\.]+)`, 'g'), nameIdx: 1, typeIdx: 2 },
    { re: new RegExp(`\\bvar\\s+([A-Za-z_][A-Za-z0-9_]*)\\s+\\*?([A-Za-z0-9_\\.]+)`, 'g'), nameIdx: 1, typeIdx: 2 },
    { re: new RegExp(`func\\s*\\([^\\)]*?\\b([A-Za-z_][A-Za-z0-9_]*)\\s+\\*?([A-Za-z0-9_\\.]+)\\s*\\)`, 'g'), nameIdx: 1, typeIdx: 2 }
  ];

  const fieldRegexes = [
    new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\.${escapeForRegex(goFieldName)}\\b`, 'g'),
    new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\.Get${escapeForRegex(goFieldName)}\\s*\\(`, 'g')
  ];

  for (const uri of uris) {
    const base = path.basename(uri.fsPath);
    if (base.endsWith('.pb.go') || base.endsWith('.pb.gw.go') || base.includes('.pb.')) continue;
    let text: string;
    try {
      text = fs.readFileSync(uri.fsPath, 'utf8');
    } catch {
      continue;
    }
    // Optimization: check if both type and field name exist in the file at all
    if (!typeRe.test(text) || !text.includes(goFieldName)) continue;

    const lines = text.split('\n');
    // Map variable name -> target type ref string
    const varToType = new Map<string, string>();

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];

      // 1. Update variable type tracking based on assignments in this line
      for (const { re, nameIdx, typeIdx } of assignRes) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const varName = m[nameIdx];
          const typeFound = m[typeIdx];
          if (varName && typeFound) {
            // Normalize type: remove pointer and package prefix if present for simple comparison
            // Or keep it full if typeRef is full. Here we use exact match or endsWith match.
            if (typeFound === typeRef || typeRef.endsWith('.' + typeFound)) {
              varToType.set(varName, typeRef);
            } else {
              // Redefined to a different type, remove from tracking
              varToType.delete(varName);
            }
          }
          if (m[0].length === 0) break;
        }
      }

      // 2. Check for field usages using tracked variables
      for (const re of fieldRegexes) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const varName = m[1];
          if (varName && varToType.get(varName) === typeRef) {
            const hit = m[0] ?? '';
            const idx = hit.lastIndexOf(goFieldName);
            const start = (m.index ?? 0) + (idx >= 0 ? idx : 0);
            results.push({
              uri,
              range: new vscode.Range(
                new vscode.Position(i, start),
                new vscode.Position(i, start + goFieldName.length)
              ),
              preview: line.replace(/\s+/g, ' ').trim()
            });
            if (results.length >= 200) return results;
          }
          if (m[0].length === 0) break;
        }
      }
    }
  }

  return results;
}

async function resolveProtoUri(protoPathFromPbGo: string): Promise<vscode.Uri | undefined> {
  if (path.isAbsolute(protoPathFromPbGo) && fs.existsSync(protoPathFromPbGo)) {
    return vscode.Uri.file(protoPathFromPbGo);
  }

  const { protoRoots, searchInWorkspace } = getConfig();

  for (const root of protoRoots) {
    const full = path.join(root, protoPathFromPbGo);
    if (fs.existsSync(full)) {
      return vscode.Uri.file(full);
    }
  }

  if (searchInWorkspace) {
    const glob = `**/${escapeForGlob(protoPathFromPbGo)}`;
    const matches = await vscode.workspace.findFiles(glob, '**/{node_modules,vendor,out,.git}/**', 5);
    if (matches.length > 0) return matches[0];
  }

  return undefined;
}

async function resolveProtoDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<ResolveResult | undefined> {
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

  // Find the first definition in a .pb.go file
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

  // Determine container message if it's a field
  let containerName: string | undefined;
  const pbGoLines = pbGoText.split('\n');
  const defLineIndex = pbGoRange.start.line;
  const defLine = pbGoLines[defLineIndex];

  // Check if it's a struct field: `FieldName type `protobuf:"..."``
  if (defLine.includes('`protobuf:')) {
    // Scan backwards to find the struct name
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

async function goToProtoDefinition(editor: vscode.TextEditor): Promise<boolean> {
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

async function getGoUsagesForProtoPosition(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  withProgress: boolean
): Promise<vscode.Location[] | undefined> {
  const strings = getStrings();
  const fieldCtx = getProtoFieldContextAtPosition(doc, pos);

  if (fieldCtx?.kind === 'fieldName') {
    const goField = toGoExportedName(fieldCtx.fieldName);
    const messageName = fieldCtx.messageName;
    const regexes = [
      new RegExp(`\\.${escapeForRegex(goField)}\\b`, 'g'),
      new RegExp(`\\.Get${escapeForRegex(goField)}\\s*\\(`, 'g'),
      new RegExp(`\\b${escapeForRegex(goField)}\\s*:`, 'g')
    ];
    const findTask = async () => {
      if (messageName && messageName.length > 0) {
        const goPkg = await resolveGoPackageForProtoFile(doc);
        const qualifiedType = goPkg ? `${goPkg}.${messageName}` : messageName;
        const filePredicate = goPkg
          ? (_uri: vscode.Uri, text: string) => text.includes(`${goPkg}.`) || text.includes(qualifiedType)
          : undefined;

        const [varUsages, composite] = await Promise.all([
          findGoVariableFieldUsages(qualifiedType, goField),
          findGoCompositeFieldUsages(qualifiedType, goField)
        ]);
        if (varUsages.length > 0) return [...varUsages, ...composite].slice(0, 200);
        if (composite.length > 0) return composite.slice(0, 200);

        const narrowed = await findGoUsagesInWorkspaceByRegexes(regexes, 200, filePredicate);
        if (narrowed.length > 0) return narrowed.slice(0, 200);
      }
      return findGoUsagesInWorkspaceByRegexes(
        regexes,
        200,
        messageName && messageName.length > 0 ? (_uri, text) => text.includes(messageName) : undefined
      );
    };

    const combined = withProgress
      ? await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: strings.searchingGoUsages, cancellable: false }, findTask)
      : await findTask();
    return combined.map(m => new vscode.Location(m.uri, m.range));
  }

  if (fieldCtx?.kind === 'fieldType') {
    const findTask = () => findGoUsagesPreferQualifiedName(doc, fieldCtx.typeName);
    const matches = withProgress
      ? await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: strings.searchingGoUsages, cancellable: false }, findTask)
      : await findTask();
    const goLocations = matches.map(m => new vscode.Location(m.uri, m.range));
    const protoLocations = findProtoSymbolLocationsInDocument(doc, fieldCtx.typeName);
    return mergeLocations(protoLocations, goLocations);
  }

  const name = getProtoDefinitionNameAtPosition(doc, pos);
  if (name) {
    const findTask = () => findGoUsagesPreferQualifiedName(doc, name);
    const matches = withProgress
      ? await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: strings.searchingGoUsages, cancellable: false }, findTask)
      : await findTask();
    const goLocations = matches.map(m => new vscode.Location(m.uri, m.range));
    const protoLocations = findProtoSymbolLocationsInDocument(doc, name);
    return mergeLocations(protoLocations, goLocations);
  }

  return undefined;
}

class ProtoGoDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition | vscode.LocationLink[]> {
    const locations = await getGoUsagesForProtoPosition(document, position, false);
    return locations || [];
  }
}

export function activate(context: vscode.ExtensionContext) {
  const viewProvider = new ProtoJumpViewProvider(context.extensionUri);
  const output = vscode.window.createOutputChannel('JumpProto');
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('protoJump.view', viewProvider));
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [{ language: 'proto' }, { language: 'proto3' }, { language: 'protobuf' }],
      new ProtoGoDefinitionProvider()
    )
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = 'JumpProto';
  status.command = 'protoJump.goToProtoDefinition';
  context.subscriptions.push(status);

  const getUpdateTarget = (): vscode.ConfigurationTarget =>
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

  const updateStatusVisibility = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'go') {
      status.show();
    } else {
      status.hide();
    }
  };
  updateStatusVisibility();
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => updateStatusVisibility()));

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('protoJump.goToProtoDefinition', async editor => {
      const strings = getStrings();
      const ok = await goToProtoDefinition(editor);
      if (!ok) {
        vscode.window.showInformationMessage(strings.resolveFailed);
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: 'go' }, {
      provideDefinition: async (document, position) => {
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
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.openSettings', async () => {
      const strings = getStrings();
      await vscode.commands.executeCommand('workbench.action.openSettingsJson');
      vscode.window.showInformationMessage(strings.openSettingsOpenedJson);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.addProtoRoot', async () => {
      const strings = getStrings();
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: strings.addProtoRoot
      });
      if (!picked || picked.length === 0) return;
      const config = vscode.workspace.getConfiguration('protoJump');
      const existing = (config.get<string[]>('protoRoots') ?? []).filter(Boolean);
      const next = Array.from(new Set([...existing, ...picked.map(u => u.fsPath)]));
      await config.update('protoRoots', next, getUpdateTarget());
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.removeProtoRoot', async (arg?: unknown) => {
      const rootPath =
        typeof arg === 'string'
          ? arg
          : typeof arg === 'object' && arg && 'meta' in (arg as any) && (arg as any).meta?.kind === 'protoRoot'
            ? (arg as any).meta.rootPath
            : undefined;
      if (!rootPath) return;
      const config = vscode.workspace.getConfiguration('protoJump');
      const existing = (config.get<string[]>('protoRoots') ?? []).filter(Boolean);
      const next = existing.filter(p => p !== rootPath);
      await config.update('protoRoots', next, getUpdateTarget());
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.toggleSearchInWorkspace', async () => {
      const config = vscode.workspace.getConfiguration('protoJump');
      const current = config.get<boolean>('searchInWorkspace') ?? true;
      await config.update('searchInWorkspace', !current, getUpdateTarget());
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.refreshView', () => viewProvider.refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.selectLanguage', async () => {
      const strings = getStrings();
      const current = getUiLanguage();
      const picked = await vscode.window.showQuickPick(
        [
          { label: strings.languageChinese, value: 'zh' as const },
          { label: strings.languageEnglish, value: 'en' as const }
        ],
        { title: strings.languageSelectTitle }
      );
      if (!picked) return;
      if (picked.value === current) return;
      const config = vscode.workspace.getConfiguration('protoJump');
      await config.update('uiLanguage', picked.value, vscode.ConfigurationTarget.Global);
      viewProvider.refresh();
      vscode.window.showInformationMessage(getStrings(picked.value).languageUpdated);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.editMakeProtoRule', async () => {
      const strings = getStrings();
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
      } else {
        await vscode.commands.executeCommand('workbench.action.openSettingsJson', 'protoJump.makeProtoCommand');
      }
      vscode.window.showInformationMessage(strings.makeProtoRuleOpenedJson);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.openMakeProtoRuleHelp', async () => {
      const strings = getStrings();
      const placeholders = [
        { token: '{workspaceFolder}', desc: strings.makeProtoRuleHelpPlaceholderWorkspaceFolder },
        { token: '{protoSrcRoot}', desc: strings.makeProtoRuleHelpPlaceholderProtoSrcRoot },
        { token: '{protoFile}', desc: strings.makeProtoRuleHelpPlaceholderProtoFile },
        { token: '{protoFileNoExt}', desc: strings.makeProtoRuleHelpPlaceholderProtoFileNoExt },
        { token: '{protoDir}', desc: strings.makeProtoRuleHelpPlaceholderProtoDir },
        { token: '{relativeProto}', desc: strings.makeProtoRuleHelpPlaceholderRelativeProto },
        { token: '{relativeProtoNoExt}', desc: strings.makeProtoRuleHelpPlaceholderRelativeProtoNoExt },
        { token: '{protoPackage}', desc: strings.makeProtoRuleHelpPlaceholderProtoPackage }
      ];

      const panel = vscode.window.createWebviewPanel(
        'protoJump.makeProtoRuleHelp',
        strings.makeProtoRuleHelpTitle,
        vscode.ViewColumn.Active,
        { enableScripts: false }
      );

      panel.webview.html = `<!DOCTYPE html>
<html lang="${getUiLanguage()}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(strings.makeProtoRuleHelpTitle)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.6;
      margin: 0;
      padding: 16px;
    }
    h1, h2 { margin: 0 0 10px 0; line-height: 1.35; }
    h1 { font-size: 18px; }
    h2 { font-size: 14px; margin-top: 16px; }
    p { margin: 0 0 10px 0; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 0 0 6px 0; }
    ol { margin: 0; padding-left: 20px; }
    ol li { margin: 0 0 6px 0; }
    code {
      padding: 2px 5px;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
      font-family: var(--vscode-editor-font-family, monospace);
    }
    pre {
      margin: 8px 0 12px 0;
      padding: 10px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(strings.makeProtoRuleHelpTitle)}</h1>
  <p>${escapeHtml(strings.makeProtoRuleHelpIntro)}</p>
  <h2>${escapeHtml(strings.makeProtoRuleHelpQuickStartTitle)}</h2>
  <ol>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep1)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep2)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep3)}</li>
  </ol>
  <h2>${escapeHtml(strings.makeProtoRuleHelpUsageTitle)}</h2>
  <p>${escapeHtml(strings.makeProtoRuleHelpUsage)}</p>
  <h2>${escapeHtml(strings.makeProtoRuleHelpDemoTitle)}</h2>
  <p class="muted">${escapeHtml(strings.makeProtoRuleHelpDemoContext)}</p>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpDemoRuleLabel)}</strong></p>
  <pre>cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}</pre>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpDemoResultLabel)}</strong></p>
  <pre>cd /ABSOLUTE/PATH/TO/proto_src && make special_proto packagename=activity filename=user_profile</pre>
  <h2>${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoTitle)}</h2>
  <p class="muted">${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoContext)}</p>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoRuleLabel)}</strong></p>
  <pre>cd {protoSrcRoot} && case {relativeProto} in
  rpc/*) make rpc pkg={protoFileNoExt} ;;
  api/*) make api pkg={protoFileNoExt} ;;
  model/*) make golang_model_proto ;;
  *) make special_proto packagename={protoPackage} filename={protoFileNoExt} ;;
esac</pre>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoResultLabel)}</strong></p>
  <pre>cd /ABSOLUTE/PATH/TO/proto_src && case rpc/user/get_user.proto in
  rpc/*) make rpc pkg=get_user ;;
  api/*) make api pkg=get_user ;;
  model/*) make golang_model_proto ;;
  *) make special_proto packagename=user filename=get_user ;;
esac</pre>
  <h2>${escapeHtml(strings.makeProtoRuleHelpPlaceholdersTitle)}</h2>
  <ul>
    ${placeholders.map(item => `<li><code>${escapeHtml(item.token)}</code>: ${escapeHtml(item.desc)}</li>`).join('')}
  </ul>
  <h2>${escapeHtml(strings.makeProtoRuleHelpTipsTitle)}</h2>
  <p>${escapeHtml(strings.makeProtoRuleHelpTips)}</p>
  <h2>${escapeHtml(strings.makeProtoRuleHelpTroubleshootingTitle)}</h2>
  <ul>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting1)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting2)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting3)}</li>
  </ul>
</body>
</html>`;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.setMakeProtoRule', async (value?: unknown) => {
      const strings = getStrings();
      const config = vscode.workspace.getConfiguration('protoJump');
      await config.update('makeProtoCommand', typeof value === 'string' ? value.trim() : '', getUpdateTarget());
      viewProvider.refresh();
      vscode.window.showInformationMessage(strings.makeProtoRuleSaved);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.testMakeProtoRule', async (value?: unknown) => {
      const strings = getStrings();
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.uri.fsPath.endsWith('.proto')) {
        vscode.window.showInformationMessage(strings.testMakeProtoRuleNeedActiveProto);
        return;
      }

      const compileCtx = resolveProtoCompileContext(editor.document);
      if (!compileCtx) {
        vscode.window.showInformationMessage(strings.testMakeProtoRuleNeedActiveProto);
        return;
      }

      const rule = typeof value === 'string' ? value.trim() : '';
      if (!rule) {
        vscode.window.showInformationMessage(strings.makeProtoRuleEmpty);
        return;
      }

      const rendered = applyMakeProtoTemplate(rule, compileCtx);
      output.clear();
      output.appendLine(`[dry-run] ${rendered}`);

      try {
        await execFile('/bin/zsh', ['-n', '-c', rendered], {
          cwd: compileCtx.workspaceFolder,
          maxBuffer: 10 * 1024 * 1024
        });
        vscode.window.showInformationMessage(strings.testMakeProtoRuleDone);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(message);
        output.show(true);
        vscode.window.showErrorMessage(`${strings.testMakeProtoRuleFailed} ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.compileCurrentProto', async () => {
      const strings = getStrings();
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(strings.compileCurrentProtoInvalid);
        return;
      }

      const compileCtx = resolveProtoCompileContext(editor.document);
      if (!compileCtx) {
        vscode.window.showInformationMessage(strings.compileCurrentProtoInvalid);
        return;
      }

      let { makeProtoCommand } = getConfig();
      if (!makeProtoCommand) {
        await vscode.commands.executeCommand('protoJump.editMakeProtoRule');
        makeProtoCommand = getConfig().makeProtoCommand;
        if (!makeProtoCommand) return;
      }

      const rendered = applyMakeProtoTemplate(makeProtoCommand, compileCtx);
      output.clear();
      output.appendLine(`[command] ${rendered}`);

      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: strings.compilingCurrentProto, cancellable: false },
          async () => {
            const result = await execFile('/bin/zsh', ['-lc', rendered], {
              cwd: compileCtx.workspaceFolder,
              maxBuffer: 10 * 1024 * 1024
            });
            if (result.stdout) output.appendLine(result.stdout.trimEnd());
            if (result.stderr) output.appendLine(result.stderr.trimEnd());
          }
        );
        vscode.window.showInformationMessage(strings.compileCurrentProtoDone);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(message);
        output.show(true);
        vscode.window.showErrorMessage(`${strings.compileCurrentProtoFailed} ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.goToGoUsage', async (arg?: unknown) => {
      const strings = getStrings();
      const active = (isTextEditor(arg) ? arg : vscode.window.activeTextEditor) ?? undefined;
      if (!active) {
        vscode.window.showInformationMessage(strings.protoDefinitionRequired);
        return;
      }

      const locations = await getGoUsagesForProtoPosition(active.document, active.selection.active, true);
      if (locations && locations.length > 0) {
        await showReferencesNative(active.document.uri, active.selection.active, locations);
        return;
      }

      // fallback to pick list if nothing at cursor
      let name = getProtoDefinitionNameAtCursor(active);
      if (!name) {
        name = await pickProtoDefinitionName(active, strings);
        if (!name) {
          vscode.window.showInformationMessage(strings.protoDefinitionRequired);
          return;
        }
        const pos = findProtoDefinitionPosition(active.document, name);
        if (pos) active.selection = new vscode.Selection(pos, pos);
      }

      const progressTitle = strings.searchingGoUsages;
      const matches = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: progressTitle, cancellable: false },
        () => findGoUsagesPreferQualifiedName(active.document, name!)
      );

      if (matches.length === 0) {
        vscode.window.showInformationMessage(strings.noGoUsagesFound);
        return;
      }

      const matchLocs = matches.map(m => new vscode.Location(m.uri, m.range));
      await showReferencesNative(active.document.uri, active.selection.active, matchLocs);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('protoJump')) viewProvider.refresh();
    })
  );
}

export function deactivate() {}
