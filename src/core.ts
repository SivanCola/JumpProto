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
    // Look for field within message
    const msgRe = new RegExp(`\\bmessage\\s+${escapeForRegex(containerName)}\\s*\\{([\\s\\S]*?)\\}`, 'm');
    const msgMatch = msgRe.exec(protoText);
    if (msgMatch) {
      const msgBody = msgMatch[1];
      const msgOffset = msgMatch.index + msgMatch[0].indexOf(msgBody);
      
      // Look for field name in message body
      // Fields are usually: [label] type name = tag;
      // We look for the name followed by '='
      const fieldRe = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*\\d+`, 'g');
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(msgBody)) !== null) {
        const protoFieldName = fm[1];
        // Try exact match or case-insensitive match (since Go uses PascalCase)
        if (protoFieldName === symbolName || 
            protoFieldName.toLowerCase() === symbolName.toLowerCase() ||
            toGoExportedName(protoFieldName) === symbolName) {
          const start = msgOffset + fm.index;
          return {
            startOffset: start,
            endOffset: start + protoFieldName.length,
            kind: 'field'
          };
        }
      }
    }
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
