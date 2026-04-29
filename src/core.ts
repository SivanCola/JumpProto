// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

const PROTO_SOURCE_RE = /^\/\/\s*(?:source|Source):\s*(.+?\.proto)\s*$/m;

export function extractProtoPathFromPbGo(generatedGoText: string): string | undefined {
  const match = generatedGoText.match(PROTO_SOURCE_RE);
  if (!match) return undefined;
  return match[1].trim();
}

export type ProtoSymbolMatch = {
  startOffset: number;
  endOffset: number;
  kind: 'message' | 'enum' | 'rpc' | 'service' | 'field';
};

type MessageBlock = {
  name: string;
  fullName: string;
  startOffset: number;
  bodyStartOffset: number;
  bodyEndOffset: number;
};

export function findProtoSymbolMatch(protoText: string, symbolName: string, containerName?: string): ProtoSymbolMatch | undefined {
  if (containerName) {
    const fieldMatch = findFieldMatchInMessage(protoText, symbolName, containerName);
    if (fieldMatch) return fieldMatch;
  }

  const patterns: Array<{ kind: ProtoSymbolMatch['kind']; re: RegExp }> = [
    { kind: 'message', re: new RegExp(`\\bmessage\\s+${escapeForRegex(symbolName)}\\b`, 'm') },
    { kind: 'enum', re: new RegExp(`\\benum\\s+${escapeForRegex(symbolName)}\\b`, 'm') },
    { kind: 'rpc', re: new RegExp(`\\brpc\\s+${escapeForRegex(symbolName)}\\b`, 'm') },
    { kind: 'service', re: new RegExp(`\\bservice\\s+${escapeForRegex(symbolName)}\\b`, 'm') }
  ];

  for (const { kind, re } of patterns) {
    const m = re.exec(protoText);
    if (!m || m.index === undefined) continue;
    const kwLen = m[0].length - symbolName.length;
    const startOffset = m.index + kwLen;
    const endOffset = startOffset + symbolName.length;
    return { startOffset, endOffset, kind };
  }

  return undefined;
}

function findFieldMatchInMessage(protoText: string, symbolName: string, containerName: string): ProtoSymbolMatch | undefined {
  const targetMessage = findMessageBlocks(protoText).find(block => block.fullName === containerName || block.name === containerName);
  if (!targetMessage) return undefined;

  const nestedMessageRanges = findMessageBlocks(protoText)
    .filter(block => block.startOffset > targetMessage.bodyStartOffset && block.bodyEndOffset < targetMessage.bodyEndOffset)
    .map(block => ({ start: block.startOffset, end: block.bodyEndOffset + 1 }));

  const msgBody = protoText.slice(targetMessage.bodyStartOffset, targetMessage.bodyEndOffset);
  const fieldRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\d+/g;
  let fm: RegExpExecArray | null;
  while ((fm = fieldRe.exec(msgBody)) !== null) {
    const start = targetMessage.bodyStartOffset + fm.index;
    if (nestedMessageRanges.some(range => start >= range.start && start < range.end)) continue;

    const protoFieldName = fm[1];
    if (
      protoFieldName === symbolName ||
      protoFieldName.toLowerCase() === symbolName.toLowerCase() ||
      toGoExportedName(protoFieldName) === symbolName
    ) {
      return {
        startOffset: start,
        endOffset: start + protoFieldName.length,
        kind: 'field'
      };
    }
  }

  return undefined;
}

function findMessageBlocks(protoText: string): MessageBlock[] {
  const declRe = /\bmessage\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
  const rawBlocks: Array<Omit<MessageBlock, 'fullName'>> = [];
  let match: RegExpExecArray | null;

  while ((match = declRe.exec(protoText)) !== null) {
    const openBrace = protoText.indexOf('{', match.index);
    if (openBrace < 0) continue;
    const closeBrace = findMatchingBrace(protoText, openBrace);
    if (closeBrace === undefined) continue;

    rawBlocks.push({
      name: match[1],
      startOffset: match.index,
      bodyStartOffset: openBrace + 1,
      bodyEndOffset: closeBrace
    });
  }

  const blocks: MessageBlock[] = rawBlocks.map(block => ({ ...block, fullName: block.name }));
  for (const block of blocks) {
    const parent = blocks
      .filter(candidate => candidate.startOffset < block.startOffset && candidate.bodyEndOffset > block.startOffset)
      .sort((a, b) => b.startOffset - a.startOffset)[0];
    block.fullName = parent ? `${parent.fullName}_${block.name}` : block.name;
  }
  return blocks;
}

function findMatchingBrace(text: string, openBraceOffset: number): number | undefined {
  let depth = 0;
  for (let i = openBraceOffset; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
