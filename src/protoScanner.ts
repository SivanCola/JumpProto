// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

export type ProtoSymbolKind = 'message' | 'enum' | 'rpc' | 'service' | 'field';

export type ProtoSymbol = {
  name: string;
  kind: ProtoSymbolKind;
  startOffset: number;
  endOffset: number;
  containerName?: string;
  fullName?: string;
  typeName?: {
    name: string;
    goName?: string;
    startOffset: number;
    endOffset: number;
  };
};

export type ProtoFieldContext =
  | { kind: 'fieldName'; fieldName: string; messageName: string }
  | { kind: 'fieldType'; typeName: string; goTypeName?: string };

type Token = {
  type: 'identifier' | 'number' | 'punctuation';
  value: string;
  startOffset: number;
  endOffset: number;
};

export type ProtoBlock = {
  kind: 'message' | 'enum' | 'service';
  name: string;
  fullName: string;
  startOffset: number;
  nameStartOffset: number;
  nameEndOffset: number;
  bodyStartOffset: number;
  bodyEndOffset: number;
};

const PRIMITIVE_PROTO_TYPES = new Set([
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

export function findProtoDeclarationSymbol(protoText: string, symbolName: string): ProtoSymbol | undefined {
  const symbols = scanProtoSymbols(protoText);
  const kindOrder: ProtoSymbolKind[] = ['message', 'enum', 'rpc', 'service'];
  for (const kind of kindOrder) {
    const match = symbols.find(symbol =>
      symbol.kind === kind && (symbol.name === symbolName || symbol.fullName === symbolName)
    );
    if (match) return match;
  }
  return undefined;
}

export function findProtoFieldSymbol(
  protoText: string,
  symbolName: string,
  containerName: string
): ProtoSymbol | undefined {
  const tokens = tokenizeProto(protoText);
  const blocks = scanProtoBlocks(tokens);
  const targetMessage = blocks.find(block =>
    block.kind === 'message' && (block.fullName === containerName || block.name === containerName)
  );
  if (!targetMessage) return undefined;

  for (const field of scanMessageFields(tokens, blocks, targetMessage)) {
    if (
      field.name === symbolName ||
      field.name.toLowerCase() === symbolName.toLowerCase() ||
      toGoExportedName(field.name) === symbolName
    ) {
      return field;
    }
  }

  return undefined;
}

export function findProtoDeclarationAtOffset(protoText: string, offset: number): ProtoSymbol | undefined {
  return scanProtoSymbols(protoText).find(symbol =>
    symbol.kind !== 'field' && offset >= symbol.startOffset && offset <= symbol.endOffset
  );
}

export function findProtoFieldContextAtOffset(protoText: string, offset: number): ProtoFieldContext | undefined {
  const tokens = tokenizeProto(protoText);
  const blocks = scanProtoBlocks(tokens);

  for (const block of blocks) {
    if (block.kind !== 'message') continue;
    for (const field of scanMessageFields(tokens, blocks, block)) {
      if (offset >= field.startOffset && offset <= field.endOffset) {
        return { kind: 'fieldName', fieldName: field.name, messageName: block.fullName };
      }
      if (field.typeName && field.typeName.startOffset <= offset && offset <= field.typeName.endOffset) {
        return { kind: 'fieldType', typeName: field.typeName.name, goTypeName: field.typeName.goName };
      }
    }
  }

  return undefined;
}

export function scanProtoSymbols(protoText: string): ProtoSymbol[] {
  const tokens = tokenizeProto(protoText);
  const blocks = scanProtoBlocks(tokens);
  const symbols: ProtoSymbol[] = blocks.map(block => ({
    name: block.name,
    kind: block.kind,
    startOffset: block.nameStartOffset,
    endOffset: block.nameEndOffset,
    containerName: block.kind === 'message' ? getParentMessageName(block, blocks) : undefined,
    fullName: block.fullName
  }));

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i - 1];
    const nameToken = tokens[i];
    if (token.value !== 'rpc' || nameToken.type !== 'identifier') continue;
    symbols.push({
      name: nameToken.value,
      kind: 'rpc',
      startOffset: nameToken.startOffset,
      endOffset: nameToken.endOffset,
      containerName: findEnclosingBlockName(nameToken.startOffset, blocks, 'service')
    });
  }

  for (const block of blocks) {
    if (block.kind !== 'message') continue;
    symbols.push(...scanMessageFields(tokens, blocks, block));
  }

  return symbols;
}

type ProtoFieldSymbol = ProtoSymbol & { kind: 'field' };

function scanMessageFields(tokens: Token[], blocks: ProtoBlock[], targetMessage: ProtoBlock): ProtoFieldSymbol[] {
  const nestedDeclarationRanges = blocks
    .filter(block => block.startOffset > targetMessage.bodyStartOffset && block.bodyEndOffset < targetMessage.bodyEndOffset)
    .map(block => ({ start: block.startOffset, end: block.bodyEndOffset + 1 }));
  const isInsideNestedDeclaration = (offset: number) =>
    nestedDeclarationRanges.some(range => offset >= range.start && offset < range.end);

  const fields: ProtoFieldSymbol[] = [];
  for (let i = 1; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (token.value !== '=') continue;
    if (tokens[i + 1]?.type !== 'number') continue;

    const fieldToken = tokens[i - 1];
    if (fieldToken.type !== 'identifier') continue;
    if (fieldToken.startOffset <= targetMessage.bodyStartOffset || fieldToken.endOffset >= targetMessage.bodyEndOffset) continue;
    if (isInsideNestedDeclaration(fieldToken.startOffset)) continue;

    const typeName = findFieldTypeName(tokens, i - 1, blocks);
    fields.push({
      name: fieldToken.value,
      kind: 'field',
      startOffset: fieldToken.startOffset,
      endOffset: fieldToken.endOffset,
      containerName: targetMessage.fullName,
      typeName
    });
  }

  return fields;
}

function scanProtoBlocks(tokens: Token[]): ProtoBlock[] {
  const rawBlocks: Array<Omit<ProtoBlock, 'fullName'>> = [];
  for (let i = 0; i < tokens.length - 2; i += 1) {
    const keyword = tokens[i];
    if (keyword.type !== 'identifier' || !isBlockKeyword(keyword.value)) continue;

    const name = tokens[i + 1];
    if (name.type !== 'identifier') continue;

    const openBraceIndex = findNextTokenIndex(tokens, i + 2, '{');
    if (openBraceIndex === undefined) continue;
    const closeBraceIndex = findMatchingBraceTokenIndex(tokens, openBraceIndex);
    if (closeBraceIndex === undefined) continue;

    rawBlocks.push({
      kind: keyword.value,
      name: name.value,
      startOffset: keyword.startOffset,
      nameStartOffset: name.startOffset,
      nameEndOffset: name.endOffset,
      bodyStartOffset: tokens[openBraceIndex].endOffset,
      bodyEndOffset: tokens[closeBraceIndex].startOffset
    });
  }

  const blocks: ProtoBlock[] = rawBlocks.map(block => ({ ...block, fullName: block.name }));
  for (const block of blocks) {
    if (block.kind !== 'message') continue;
    const parent = blocks
      .filter(candidate =>
        candidate.kind === 'message' &&
        candidate.startOffset < block.startOffset &&
        candidate.bodyEndOffset > block.startOffset
      )
      .sort((a, b) => b.startOffset - a.startOffset)[0];
    block.fullName = parent ? `${parent.fullName}_${block.name}` : block.name;
  }
  return blocks;
}

function findFieldTypeName(
  tokens: Token[],
  fieldNameIndex: number,
  blocks: ProtoBlock[]
): { name: string; goName?: string; startOffset: number; endOffset: number } | undefined {
  const prev = tokens[fieldNameIndex - 1];
  if (!prev) return undefined;

  if (prev.value === '>') {
    const openIndex = findMatchingAngleOpenTokenIndex(tokens, fieldNameIndex - 1);
    if (openIndex === undefined || tokens[openIndex - 1]?.value !== 'map') return undefined;
    const commaIndex = findTopLevelCommaTokenIndex(tokens, openIndex + 1, fieldNameIndex - 1);
    if (commaIndex === undefined) return undefined;
    for (let i = fieldNameIndex - 2; i > commaIndex; i -= 1) {
      const token = tokens[i];
      if (token.type !== 'identifier') continue;
      if (PRIMITIVE_PROTO_TYPES.has(token.value)) return undefined;
      return {
        name: token.value,
        goName: resolveProtoMessageGoName(token.value, blocks),
        startOffset: token.startOffset,
        endOffset: token.endOffset
      };
    }
    return undefined;
  }

  if (prev.type !== 'identifier') return undefined;
  if (PRIMITIVE_PROTO_TYPES.has(prev.value)) return undefined;
  if (prev.value === 'repeated' || prev.value === 'optional' || prev.value === 'required') return undefined;
  return {
    name: prev.value,
    goName: resolveProtoMessageGoName(prev.value, blocks),
    startOffset: prev.startOffset,
    endOffset: prev.endOffset
  };
}

function resolveProtoMessageGoName(typeName: string, blocks: ProtoBlock[]): string | undefined {
  const matches = blocks.filter(block => block.kind === 'message' && block.name === typeName);
  return matches.length === 1 ? matches[0].fullName : undefined;
}

function findMatchingAngleOpenTokenIndex(tokens: Token[], closeIndex: number): number | undefined {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i -= 1) {
    if (tokens[i].value === '>') depth += 1;
    if (tokens[i].value === '<') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

function findTopLevelCommaTokenIndex(tokens: Token[], startIndex: number, endIndex: number): number | undefined {
  let depth = 0;
  for (let i = startIndex; i < endIndex; i += 1) {
    const value = tokens[i].value;
    if (value === '<') depth += 1;
    if (value === '>') depth -= 1;
    if (value === ',' && depth === 0) return i;
  }
  return undefined;
}

function getParentMessageName(block: ProtoBlock, blocks: ProtoBlock[]): string | undefined {
  return blocks
    .filter(candidate =>
      candidate.kind === 'message' &&
      candidate.startOffset < block.startOffset &&
      candidate.bodyEndOffset > block.startOffset
    )
    .sort((a, b) => b.startOffset - a.startOffset)[0]?.fullName;
}

function findEnclosingBlockName(
  offset: number,
  blocks: ProtoBlock[],
  kind: ProtoBlock['kind']
): string | undefined {
  return blocks
    .filter(block => block.kind === kind && block.bodyStartOffset <= offset && block.bodyEndOffset >= offset)
    .sort((a, b) => b.startOffset - a.startOffset)[0]?.fullName;
}

function tokenizeProto(protoText: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < protoText.length) {
    const ch = protoText[i];
    const next = protoText[i + 1];

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < protoText.length && protoText[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < protoText.length && !(protoText[i] === '*' && protoText[i + 1] === '/')) i += 1;
      i = Math.min(i + 2, protoText.length);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipQuotedString(protoText, i);
      continue;
    }
    if (isIdentifierStart(ch)) {
      const start = i;
      i += 1;
      while (i < protoText.length && isIdentifierPart(protoText[i])) i += 1;
      tokens.push({ type: 'identifier', value: protoText.slice(start, i), startOffset: start, endOffset: i });
      continue;
    }
    if (isDigit(ch)) {
      const start = i;
      i += 1;
      while (i < protoText.length && isDigit(protoText[i])) i += 1;
      tokens.push({ type: 'number', value: protoText.slice(start, i), startOffset: start, endOffset: i });
      continue;
    }
    if ('{}=;()<>[],.'.includes(ch)) {
      tokens.push({ type: 'punctuation', value: ch, startOffset: i, endOffset: i + 1 });
    }
    i += 1;
  }

  return tokens;
}

function skipQuotedString(text: string, quoteOffset: number): number {
  const quote = text[quoteOffset];
  let i = quoteOffset + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function findNextTokenIndex(tokens: Token[], startIndex: number, value: string): number | undefined {
  for (let i = startIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.value === ';') return undefined;
    if (token.value === value) return i;
  }
  return undefined;
}

function findMatchingBraceTokenIndex(tokens: Token[], openBraceIndex: number): number | undefined {
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

function isBlockKeyword(value: string): value is ProtoBlock['kind'] {
  return value === 'message' || value === 'enum' || value === 'service';
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
