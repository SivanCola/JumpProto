// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'node:path';
import * as vscode from 'vscode';

export type ProtoJumpConfig = {
  protoRoots: string[];
  searchInWorkspace: boolean;
  makeProtoCommand: string;
  exclude: string[];
};

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/vendor/**',
  '**/out/**',
  '**/dist/**',
  '**/.git/**'
];

export function normalizeConfigPath(configPath: string): string {
  const trimmed = configPath.trim();
  if (!trimmed) return '';
  const home = process.env.HOME;
  const expanded = home
    ? trimmed.replace(/^\$HOME(?=$|[\\/])/, home).replace(/^~(?=$|[\\/])/, home)
    : trimmed;
  return path.normalize(expanded);
}

function normalizeExcludePattern(pattern: string): string {
  return pattern.trim().replace(/\\/g, '/');
}

export function getConfig(): ProtoJumpConfig {
  const config = vscode.workspace.getConfiguration('protoJump');
  const exclude = config.get<string[]>('exclude');
  return {
    protoRoots: (config.get<string[]>('protoRoots') ?? []).map(normalizeConfigPath).filter(Boolean),
    searchInWorkspace: config.get<boolean>('searchInWorkspace') ?? true,
    makeProtoCommand: (config.get<string>('makeProtoCommand') ?? '').trim(),
    exclude: (exclude && exclude.length > 0 ? exclude : DEFAULT_EXCLUDE)
      .map(normalizeExcludePattern)
      .filter(Boolean)
  };
}

export function getWorkspaceExcludeGlob(config: ProtoJumpConfig = getConfig()): string | undefined {
  return config.exclude.length > 0 ? `{${config.exclude.join(',')}}` : undefined;
}

export function getUpdateTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}
