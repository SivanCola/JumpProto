// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

export type ProjectConfigFile = {
  protoRoots?: string[];
  searchInWorkspace?: boolean;
  makeProtoCommand?: string;
  exclude?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(
  source: Record<string, unknown>,
  key: keyof Pick<ProjectConfigFile, 'protoRoots' | 'exclude'>,
  warn: (message: string) => void
): string[] | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value;
  warn(`JumpProto: ignoring invalid .jumpproto field "${key}"; expected string[].`);
  return undefined;
}

export function normalizeProjectConfig(
  value: unknown,
  warn: (message: string) => void = console.warn
): ProjectConfigFile {
  if (!isRecord(value)) {
    warn('JumpProto: ignoring invalid .jumpproto; expected a JSON object.');
    return {};
  }

  const out: ProjectConfigFile = {};
  const protoRoots = readStringArray(value, 'protoRoots', warn);
  if (protoRoots) out.protoRoots = protoRoots;

  const exclude = readStringArray(value, 'exclude', warn);
  if (exclude) out.exclude = exclude;

  if (value.searchInWorkspace !== undefined) {
    if (typeof value.searchInWorkspace === 'boolean') {
      out.searchInWorkspace = value.searchInWorkspace;
    } else {
      warn('JumpProto: ignoring invalid .jumpproto field "searchInWorkspace"; expected boolean.');
    }
  }

  if (value.makeProtoCommand !== undefined) {
    if (typeof value.makeProtoCommand === 'string') {
      out.makeProtoCommand = value.makeProtoCommand;
    } else {
      warn('JumpProto: ignoring invalid .jumpproto field "makeProtoCommand"; expected string.');
    }
  }

  return out;
}
