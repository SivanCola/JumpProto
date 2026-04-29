// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { normalizeProjectConfig, type ProjectConfigFile } from './projectConfig';

export type ProtoJumpConfig = {
  protoRoots: string[];
  searchInWorkspace: boolean;
  makeProtoCommand: string;
  exclude: string[];
};

const PROJECT_CONFIG_FILE = '.jumpproto';

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/vendor/**',
  '**/out/**',
  '**/dist/**',
  '**/.git/**'
];

let projectConfigWriteQueue: Promise<void> = Promise.resolve();

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

function getProjectRoot(uri: vscode.Uri | undefined = vscode.window.activeTextEditor?.document.uri): string | undefined {
  const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
  return folder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getProjectConfigPath(projectRoot: string | undefined = getProjectRoot()): string | undefined {
  return projectRoot ? path.join(projectRoot, PROJECT_CONFIG_FILE) : undefined;
}

function readProjectConfig(projectRoot: string | undefined = getProjectRoot()): ProjectConfigFile {
  const filePath = getProjectConfigPath(projectRoot);
  if (!filePath) return {};
  try {
    if (!fs.existsSync(filePath)) return {};
    return normalizeProjectConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    console.warn('JumpProto: failed to read .jumpproto; ignoring project config.');
    return {};
  }
}

function normalizeProjectPath(configPath: string, projectRoot: string | undefined): string {
  const normalized = normalizeConfigPath(configPath);
  if (!normalized) return '';
  return path.isAbsolute(normalized) || !projectRoot
    ? normalized
    : path.normalize(path.join(projectRoot, normalized));
}

function toProjectRelativePath(filePath: string, projectRoot: string | undefined): string {
  const normalized = normalizeConfigPath(filePath);
  if (!projectRoot || !normalized || !path.isAbsolute(normalized)) return normalized;
  const relative = path.relative(projectRoot, normalized);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? normalizeExcludePattern(relative)
    : normalized;
}

export function getConfig(): ProtoJumpConfig {
  const config = vscode.workspace.getConfiguration('protoJump');
  const projectRoot = getProjectRoot();
  const projectConfig = readProjectConfig(projectRoot);
  const exclude = config.get<string[]>('exclude');
  const configuredProtoRoots = Array.isArray(projectConfig.protoRoots)
    ? projectConfig.protoRoots
    : (config.get<string[]>('protoRoots') ?? []);
  const configuredExclude = Array.isArray(projectConfig.exclude)
    ? projectConfig.exclude
    : exclude;
  return {
    protoRoots: configuredProtoRoots.map(root => normalizeProjectPath(root, projectRoot)).filter(Boolean),
    searchInWorkspace: typeof projectConfig.searchInWorkspace === 'boolean'
      ? projectConfig.searchInWorkspace
      : config.get<boolean>('searchInWorkspace') ?? true,
    makeProtoCommand: (typeof projectConfig.makeProtoCommand === 'string'
      ? projectConfig.makeProtoCommand
      : config.get<string>('makeProtoCommand') ?? '').trim(),
    exclude: (configuredExclude && configuredExclude.length > 0 ? configuredExclude : DEFAULT_EXCLUDE)
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

export async function updateProjectConfig(patch: ProjectConfigFile): Promise<void> {
  const nextWrite = projectConfigWriteQueue.then(
    () => updateProjectConfigNow(patch),
    () => updateProjectConfigNow(patch)
  );
  projectConfigWriteQueue = nextWrite.catch(() => undefined);
  return nextWrite;
}

async function updateProjectConfigNow(patch: ProjectConfigFile): Promise<void> {
  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    const config = vscode.workspace.getConfiguration('protoJump');
    if (patch.protoRoots) await config.update('protoRoots', patch.protoRoots, getUpdateTarget());
    if (typeof patch.searchInWorkspace === 'boolean') await config.update('searchInWorkspace', patch.searchInWorkspace, getUpdateTarget());
    if (typeof patch.makeProtoCommand === 'string') await config.update('makeProtoCommand', patch.makeProtoCommand, getUpdateTarget());
    if (patch.exclude) await config.update('exclude', patch.exclude, getUpdateTarget());
    return;
  }

  const filePath = getProjectConfigPath(projectRoot)!;
  const existing = readProjectConfig(projectRoot);
  const next: ProjectConfigFile = { ...existing, ...patch };
  if (next.protoRoots) {
    next.protoRoots = next.protoRoots.map(root => toProjectRelativePath(root, projectRoot)).filter(Boolean);
  }

  await writeProjectConfigFile(filePath, next);
}

export async function openProjectConfig(): Promise<void> {
  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    await vscode.commands.executeCommand('workbench.action.openSettingsJson', 'protoJump.makeProtoCommand');
    return;
  }
  const filePath = getProjectConfigPath(projectRoot)!;
  const nextWrite = projectConfigWriteQueue.then(
    () => writeProjectConfigFile(filePath, readProjectConfig(projectRoot)),
    () => writeProjectConfigFile(filePath, readProjectConfig(projectRoot))
  );
  projectConfigWriteQueue = nextWrite.catch(() => undefined);
  await nextWrite;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc);
}

async function writeProjectConfigFile(filePath: string, config: ProjectConfigFile): Promise<void> {
  await writeTextFileAtomic(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  const target = vscode.Uri.file(filePath);
  const temp = vscode.Uri.file(`${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await vscode.workspace.fs.writeFile(temp, Buffer.from(content, 'utf8'));
    await vscode.workspace.fs.rename(temp, target, { overwrite: true });
  } catch (error) {
    try {
      await vscode.workspace.fs.delete(temp);
    } catch {
      // ignore cleanup failures
    }
    throw error;
  }
}
