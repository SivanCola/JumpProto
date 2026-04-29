// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import { getGoPackageOptionValue, parseGoPackageOptionValue } from './protoMetadata';

export type GoPackageInfo = {
  packageName: string;
  importPath?: string;
};

export type GoTextUsageKind =
  | 'qualified'
  | 'alias'
  | 'bare'
  | 'compositeField'
  | 'selectorField'
  | 'getter';

export type GoTextUsage = {
  line: number;
  start: number;
  end: number;
  text: string;
  kind: GoTextUsageKind;
};

export type GoSymbolSearchPlan = {
  symbolName: string;
  qualifiedName?: string;
  aliases: string[];
  includeBare: boolean;
};

export type GoQualifiedImportRef = {
  qualifier: string;
  symbolName: string;
  importPath: string;
  symbolStartOffset: number;
  symbolEndOffset: number;
};

type GoToken = {
  type: 'identifier' | 'string' | 'number' | 'punctuation' | 'operator';
  value: string;
  startOffset: number;
  endOffset: number;
};

type TokenContext = {
  tokens: GoToken[];
  lineStarts: number[];
  lines: string[];
};

export function parseGoPackageInfo(protoText: string): GoPackageInfo | undefined {
  const value = getGoPackageOptionValue(protoText);
  return value ? parseGoPackageOptionValue(value) : undefined;
}

export function buildGoSymbolSearchPlan(
  goText: string,
  symbolName: string,
  goPkg?: GoPackageInfo
): GoSymbolSearchPlan {
  const filePackageName = parseGoSourcePackageName(goText);
  return {
    symbolName,
    qualifiedName: goPkg ? `${goPkg.packageName}.${symbolName}` : undefined,
    aliases: goPkg?.importPath ? findImportAliases(goText, goPkg.importPath, goPkg.packageName) : [],
    includeBare: !!goPkg && filePackageName === goPkg.packageName
  };
}

function parseGoSourcePackageName(goText: string): string | undefined {
  const { tokens } = tokenizeGo(goText);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i].type === 'identifier' && tokens[i].value === 'package' && tokens[i + 1].type === 'identifier') {
      return tokens[i + 1].value;
    }
  }
  return undefined;
}

export function findImportAliases(goText: string, importPath: string, packageName: string): string[] {
  const { tokens } = tokenizeGo(goText);
  const aliases = new Set<string>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'identifier' || token.value !== 'import') continue;
    const next = tokens[i + 1];
    if (!next) continue;

    if (next.type === 'string') {
      addImportAlias(aliases, undefined, next.value, importPath, packageName);
      continue;
    }

    if ((next.type === 'identifier' || next.value === '.' || next.value === '_') && tokens[i + 2]?.type === 'string') {
      addImportAlias(aliases, next.value, tokens[i + 2].value, importPath, packageName);
      continue;
    }

    if (next.value === '(') {
      for (let j = i + 2; j < tokens.length && tokens[j].value !== ')'; j += 1) {
        const current = tokens[j];
        if (current.type === 'string') {
          addImportAlias(aliases, undefined, current.value, importPath, packageName);
          continue;
        }
        if ((current.type === 'identifier' || current.value === '.' || current.value === '_') && tokens[j + 1]?.type === 'string') {
          addImportAlias(aliases, current.value, tokens[j + 1].value, importPath, packageName);
          j += 1;
        }
      }
    }
  }

  return Array.from(aliases);
}

export function findGoImportPathForQualifiedSymbolAtOffset(
  goText: string,
  offset: number
): GoQualifiedImportRef | undefined {
  const { tokens } = tokenizeGo(goText);
  for (let i = 0; i < tokens.length - 2; i += 1) {
    const qualifierToken = tokens[i];
    const dot = tokens[i + 1];
    const symbolToken = tokens[i + 2];
    if (qualifierToken.type !== 'identifier' || dot.value !== '.' || symbolToken.type !== 'identifier') continue;
    if (offset < symbolToken.startOffset || offset > symbolToken.endOffset) continue;

    const importPath = findImportPathForQualifier(tokens, qualifierToken.value);
    if (!importPath) return undefined;
    return {
      qualifier: qualifierToken.value,
      symbolName: symbolToken.value,
      importPath,
      symbolStartOffset: symbolToken.startOffset,
      symbolEndOffset: symbolToken.endOffset
    };
  }
  return undefined;
}

export function findGoSymbolUsagesInText(
  goText: string,
  symbolName: string,
  goPkg?: GoPackageInfo
): GoTextUsage[] {
  const ctx = tokenizeGo(goText);
  const plan = buildGoSymbolSearchPlan(goText, symbolName, goPkg);
  const exactMatches = plan.qualifiedName
    ? findQualifiedSymbolUsages(ctx, goPkg!.packageName, symbolName, 'qualified')
    : [];
  const aliasMatches = plan.aliases
    .filter(alias => alias !== goPkg?.packageName)
    .flatMap(alias => findQualifiedSymbolUsages(ctx, alias, symbolName, 'alias'));
  const bareMatches = plan.includeBare ? findBareSymbolUsages(ctx, symbolName) : [];
  return mergeTextUsages(exactMatches, aliasMatches, bareMatches);
}

export function findGoCompositeFieldUsagesInText(
  goText: string,
  messageName: string,
  goFieldName: string,
  goPkg?: GoPackageInfo
): GoTextUsage[] {
  const ctx = tokenizeGo(goText);
  const typeRefs = buildTypeRefs(goText, messageName, goPkg);
  const results: GoTextUsage[] = [];

  for (let i = 0; i < ctx.tokens.length; i += 1) {
    const match = matchTypeRefAt(ctx.tokens, i, typeRefs);
    if (!match || ctx.tokens[match.nextIndex]?.value !== '{') continue;
    const closeBraceIndex = findMatchingBraceTokenIndex(ctx.tokens, match.nextIndex);
    if (closeBraceIndex === undefined) continue;

    let depth = 0;
    for (let j = match.nextIndex; j < closeBraceIndex; j += 1) {
      const token = ctx.tokens[j];
      if (token.value === '{') {
        depth += 1;
        continue;
      }
      if (token.value === '}') {
        depth -= 1;
        continue;
      }
      if (depth !== 1) continue;
      if (token.type !== 'identifier' || token.value !== goFieldName) continue;
      if (ctx.tokens[j + 1]?.value !== ':') continue;
      results.push(toUsage(ctx, token.startOffset, token.endOffset, 'compositeField'));
    }
  }

  return mergeTextUsages(results);
}

export function findGoVariableFieldUsagesInText(
  goText: string,
  messageName: string,
  goFieldName: string,
  goPkg?: GoPackageInfo
): GoTextUsage[] {
  const ctx = tokenizeGo(goText);
  const typeRefs = buildTypeRefs(goText, messageName, goPkg);
  const varToType = new Set<string>();
  const results: GoTextUsage[] = [];

  for (let i = 0; i < ctx.tokens.length; i += 1) {
    trackVariableType(ctx.tokens, i, typeRefs, varToType);

    const token = ctx.tokens[i];
    const dot = ctx.tokens[i + 1];
    const selector = ctx.tokens[i + 2];
    if (token.type !== 'identifier' || dot?.value !== '.' || selector?.type !== 'identifier') continue;
    if (!varToType.has(token.value)) continue;

    if (selector.value === goFieldName) {
      results.push(toUsage(ctx, selector.startOffset, selector.endOffset, 'selectorField'));
      continue;
    }
    if (selector.value === `Get${goFieldName}` && ctx.tokens[i + 3]?.value === '(') {
      const fieldStart = selector.startOffset + 'Get'.length;
      results.push(toUsage(ctx, fieldStart, selector.endOffset, 'getter'));
    }
  }

  return mergeTextUsages(results);
}

export function findGoFieldAccessUsagesInText(goText: string, goFieldName: string): GoTextUsage[] {
  const ctx = tokenizeGo(goText);
  const results: GoTextUsage[] = [];

  for (let i = 0; i < ctx.tokens.length; i += 1) {
    const token = ctx.tokens[i];
    if (token.type !== 'identifier') continue;

    if (token.value === goFieldName) {
      const prev = ctx.tokens[i - 1];
      const next = ctx.tokens[i + 1];
      if (prev?.value === '.' || next?.value === ':') {
        results.push(toUsage(ctx, token.startOffset, token.endOffset, prev?.value === '.' ? 'selectorField' : 'compositeField'));
      }
      continue;
    }

    if (token.value === `Get${goFieldName}` && ctx.tokens[i - 1]?.value === '.' && ctx.tokens[i + 1]?.value === '(') {
      const fieldStart = token.startOffset + 'Get'.length;
      results.push(toUsage(ctx, fieldStart, token.endOffset, 'getter'));
    }
  }

  return mergeTextUsages(results);
}

function addImportAlias(
  aliases: Set<string>,
  rawAlias: string | undefined,
  rawPath: string | undefined,
  importPath: string,
  packageName: string
) {
  if (rawPath !== importPath) return;
  const alias = rawAlias?.trim();
  if (!alias) {
    aliases.add(packageName);
    return;
  }
  if (alias === '_' || alias === '.') return;
  aliases.add(alias);
}

function findImportPathForQualifier(tokens: GoToken[], qualifier: string): string | undefined {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'identifier' || token.value !== 'import') continue;
    const next = tokens[i + 1];
    if (!next) continue;

    if (next.type === 'string') {
      if (getImportQualifier(undefined, next.value) === qualifier) return next.value;
      continue;
    }

    if ((next.type === 'identifier' || next.value === '.' || next.value === '_') && tokens[i + 2]?.type === 'string') {
      if (getImportQualifier(next.value, tokens[i + 2].value) === qualifier) return tokens[i + 2].value;
      continue;
    }

    if (next.value === '(') {
      for (let j = i + 2; j < tokens.length && tokens[j].value !== ')'; j += 1) {
        const current = tokens[j];
        if (current.type === 'string') {
          if (getImportQualifier(undefined, current.value) === qualifier) return current.value;
          continue;
        }
        if ((current.type === 'identifier' || current.value === '.' || current.value === '_') && tokens[j + 1]?.type === 'string') {
          if (getImportQualifier(current.value, tokens[j + 1].value) === qualifier) return tokens[j + 1].value;
          j += 1;
        }
      }
    }
  }

  return undefined;
}

function getImportQualifier(rawAlias: string | undefined, importPath: string): string | undefined {
  const alias = rawAlias?.trim();
  if (alias) {
    if (alias === '_' || alias === '.') return undefined;
    return alias;
  }

  const lastSegment = importPath.split('/').filter(Boolean).at(-1);
  return lastSegment ? lastSegment.replace(/[^A-Za-z0-9_]/g, '_') : undefined;
}

function findQualifiedSymbolUsages(
  ctx: TokenContext,
  qualifier: string,
  symbolName: string,
  kind: GoTextUsageKind
): GoTextUsage[] {
  const results: GoTextUsage[] = [];
  for (let i = 0; i < ctx.tokens.length - 2; i += 1) {
    const qualifierToken = ctx.tokens[i];
    const dot = ctx.tokens[i + 1];
    const symbolToken = ctx.tokens[i + 2];
    if (qualifierToken.type !== 'identifier' || qualifierToken.value !== qualifier) continue;
    if (dot.value !== '.') continue;
    if (symbolToken.type !== 'identifier' || symbolToken.value !== symbolName) continue;
    results.push(toUsage(ctx, qualifierToken.startOffset, symbolToken.endOffset, kind));
  }
  return results;
}

function findBareSymbolUsages(ctx: TokenContext, symbolName: string): GoTextUsage[] {
  const results: GoTextUsage[] = [];
  for (let i = 0; i < ctx.tokens.length; i += 1) {
    const token = ctx.tokens[i];
    if (token.type !== 'identifier' || token.value !== symbolName) continue;
    if (ctx.tokens[i - 1]?.value === '.') continue;
    results.push(toUsage(ctx, token.startOffset, token.endOffset, 'bare'));
  }
  return results;
}

function trackVariableType(
  tokens: GoToken[],
  index: number,
  typeRefs: string[],
  varToType: Set<string>
) {
  const token = tokens[index];
  if (!token) return;

  if (token.type === 'identifier' && tokens[index + 1]?.value === ':=') {
    let typeIndex = index + 2;
    if (tokens[typeIndex]?.value === '&') typeIndex += 1;
    const typeMatch = matchTypeRefAt(tokens, typeIndex, typeRefs);
    if (typeMatch) varToType.add(token.value);
    return;
  }

  if (token.type === 'identifier' && token.value === 'var' && tokens[index + 1]?.type === 'identifier') {
    let typeIndex = index + 2;
    if (tokens[typeIndex]?.value === '*') typeIndex += 1;
    const typeMatch = matchTypeRefAt(tokens, typeIndex, typeRefs);
    if (typeMatch) varToType.add(tokens[index + 1].value);
    return;
  }

  if (token.type === 'identifier' && token.value === 'func' && tokens[index + 1]?.value === '(') {
    const receiverName = tokens[index + 2];
    let typeIndex = index + 3;
    if (tokens[typeIndex]?.value === '*') typeIndex += 1;
    const typeMatch = matchTypeRefAt(tokens, typeIndex, typeRefs);
    if (receiverName?.type === 'identifier' && typeMatch && tokens[typeMatch.nextIndex]?.value === ')') {
      varToType.add(receiverName.value);
    }
    trackFunctionParameterTypes(tokens, index, typeRefs, varToType);
    return;
  }

  if (token.type === 'identifier' && token.value === 'func') {
    trackFunctionParameterTypes(tokens, index, typeRefs, varToType);
  }
}

function trackFunctionParameterTypes(
  tokens: GoToken[],
  funcIndex: number,
  typeRefs: string[],
  varToType: Set<string>
) {
  const bodyIndex = findNextTokenIndex(tokens, funcIndex + 1, '{');
  if (bodyIndex === undefined) return;

  for (let i = funcIndex + 1; i < bodyIndex; i += 1) {
    if (tokens[i].value !== '(') continue;
    const closeIndex = findMatchingParenTokenIndex(tokens, i);
    if (closeIndex === undefined || closeIndex > bodyIndex) continue;
    trackTypedNamesInParenGroup(tokens, i + 1, closeIndex, typeRefs, varToType);
    i = closeIndex;
  }
}

function trackTypedNamesInParenGroup(
  tokens: GoToken[],
  startIndex: number,
  endIndex: number,
  typeRefs: string[],
  varToType: Set<string>
) {
  for (let i = startIndex; i < endIndex; i += 1) {
    const token = tokens[i];
    if (token.type !== 'identifier') continue;

    const directTypeMatch = matchTypeRefAfterPointers(tokens, i + 1, typeRefs);
    if (directTypeMatch) {
      varToType.add(token.value);
      i = directTypeMatch.nextIndex - 1;
      continue;
    }

    const names = [token.value];
    let j = i;
    while (tokens[j + 1]?.value === ',' && tokens[j + 2]?.type === 'identifier') {
      j += 2;
      names.push(tokens[j].value);
    }
    if (j === i) continue;

    const sharedTypeMatch = matchTypeRefAfterPointers(tokens, j + 1, typeRefs);
    if (!sharedTypeMatch) continue;
    for (const name of names) varToType.add(name);
    i = sharedTypeMatch.nextIndex - 1;
  }
}

function matchTypeRefAfterPointers(
  tokens: GoToken[],
  index: number,
  typeRefs: string[]
): { ref: string; nextIndex: number } | undefined {
  let typeIndex = index;
  while (tokens[typeIndex]?.value === '*') typeIndex += 1;
  return matchTypeRefAt(tokens, typeIndex, typeRefs);
}

function buildTypeRefs(goText: string, messageName: string, goPkg?: GoPackageInfo): string[] {
  const refs = new Set<string>([messageName]);
  if (goPkg) refs.add(`${goPkg.packageName}.${messageName}`);
  if (goPkg?.importPath) {
    for (const alias of findImportAliases(goText, goPkg.importPath, goPkg.packageName)) {
      refs.add(`${alias}.${messageName}`);
    }
  }
  return Array.from(refs);
}

function matchTypeRefAt(
  tokens: GoToken[],
  index: number,
  typeRefs: string[]
): { ref: string; nextIndex: number } | undefined {
  for (const ref of typeRefs) {
    const parts = ref.split('.');
    if (parts.length === 1) {
      if (tokens[index]?.type === 'identifier' && tokens[index].value === parts[0]) {
        return { ref, nextIndex: index + 1 };
      }
      continue;
    }
    if (
      tokens[index]?.type === 'identifier' &&
      tokens[index].value === parts[0] &&
      tokens[index + 1]?.value === '.' &&
      tokens[index + 2]?.type === 'identifier' &&
      tokens[index + 2].value === parts[1]
    ) {
      return { ref, nextIndex: index + 3 };
    }
  }
  return undefined;
}

function tokenizeGo(goText: string): TokenContext {
  const tokens: GoToken[] = [];
  const lineStarts = buildLineStarts(goText);
  const lines = goText.split('\n');
  let i = 0;

  while (i < goText.length) {
    const ch = goText[i];
    const next = goText[i + 1];

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < goText.length && goText[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < goText.length && !(goText[i] === '*' && goText[i + 1] === '/')) i += 1;
      i = Math.min(i + 2, goText.length);
      continue;
    }
    if (ch === '"' || ch === '`' || ch === "'") {
      const parsed = readQuotedString(goText, i);
      tokens.push({ type: 'string', value: parsed.value, startOffset: i, endOffset: parsed.endOffset });
      i = parsed.endOffset;
      continue;
    }
    if (isIdentifierStart(ch)) {
      const start = i;
      i += 1;
      while (i < goText.length && isIdentifierPart(goText[i])) i += 1;
      tokens.push({ type: 'identifier', value: goText.slice(start, i), startOffset: start, endOffset: i });
      continue;
    }
    if (isDigit(ch)) {
      const start = i;
      i += 1;
      while (i < goText.length && isDigit(goText[i])) i += 1;
      tokens.push({ type: 'number', value: goText.slice(start, i), startOffset: start, endOffset: i });
      continue;
    }
    if (ch === ':' && next === '=') {
      tokens.push({ type: 'operator', value: ':=', startOffset: i, endOffset: i + 2 });
      i += 2;
      continue;
    }
    if ('{}=;()<>[],.:*&'.includes(ch)) {
      tokens.push({ type: 'punctuation', value: ch, startOffset: i, endOffset: i + 1 });
    }
    i += 1;
  }

  return { tokens, lineStarts, lines };
}

function readQuotedString(text: string, quoteOffset: number): { value: string; endOffset: number } {
  const quote = text[quoteOffset];
  let i = quoteOffset + 1;
  let value = '';
  while (i < text.length) {
    if (quote !== '`' && text[i] === '\\') {
      if (i + 1 < text.length) value += text[i + 1];
      i += 2;
      continue;
    }
    if (text[i] === quote) return { value, endOffset: i + 1 };
    value += text[i];
    i += 1;
  }
  return { value, endOffset: i };
}

function findMatchingBraceTokenIndex(tokens: GoToken[], openBraceIndex: number): number | undefined {
  let depth = 0;
  for (let i = openBraceIndex; i < tokens.length; i += 1) {
    const value = tokens[i].value;
    if (value === '{') depth += 1;
    if (value === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

function findMatchingParenTokenIndex(tokens: GoToken[], openParenIndex: number): number | undefined {
  let depth = 0;
  for (let i = openParenIndex; i < tokens.length; i += 1) {
    const value = tokens[i].value;
    if (value === '(') depth += 1;
    if (value === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

function findNextTokenIndex(tokens: GoToken[], startIndex: number, value: string): number | undefined {
  for (let i = startIndex; i < tokens.length; i += 1) {
    if (tokens[i].value === value) return i;
  }
  return undefined;
}

function toUsage(
  ctx: TokenContext,
  startOffset: number,
  endOffset: number,
  kind: GoTextUsageKind
): GoTextUsage {
  const line = offsetToLine(ctx.lineStarts, startOffset);
  const start = startOffset - ctx.lineStarts[line];
  const end = endOffset - ctx.lineStarts[line];
  return {
    line,
    start,
    end,
    text: ctx.lines[line]?.replace(/\s+/g, ' ').trim() ?? '',
    kind
  };
}

function mergeTextUsages(...groups: GoTextUsage[][]): GoTextUsage[] {
  const out: GoTextUsage[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const usage of group) {
      const key = `${usage.line}:${usage.start}-${usage.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(usage);
    }
  }
  return out;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function offsetToLine(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid];
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;
    if (offset >= start && offset < next) return mid;
    if (offset < start) high = mid - 1;
    else low = mid + 1;
  }
  return Math.max(0, lineStarts.length - 1);
}

function isIdentifierStart(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string | undefined): boolean {
  return !!ch && /[0-9]/.test(ch);
}
