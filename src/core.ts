// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import { findProtoDeclarationSymbol, findProtoFieldSymbol } from './protoScanner';

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

export function findProtoSymbolMatch(protoText: string, symbolName: string, containerName?: string): ProtoSymbolMatch | undefined {
  if (containerName) {
    const fieldMatch = findProtoFieldSymbol(protoText, symbolName, containerName);
    if (fieldMatch) return fieldMatch;
  }

  return findProtoDeclarationSymbol(protoText, symbolName);
}
