// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

import { getConfig } from './config';
import { getStrings } from './i18n';
import { resolveProtoSrcRootPath } from './pathResolver';
import { inferProtoPackage } from './protoMetadata';
import { redactMessagePathsForOutput } from './redaction';
import { resolveShellInvocation, shellQuote } from './shell';
import { normalizeSlashes } from './utils';

const execFile = promisify(execFileCb);

export type ProtoCompileContext = {
  workspaceFolder: string,
  protoSrcRoot: string,
  protoFile: string,
  protoFileNoExt: string,
  protoDir: string,
  relativeProto: string,
  relativeProtoNoExt: string,
  protoPackage: string,
};

export function resolveProtoSrcRoot(protoFile: string): string | undefined {
  return resolveProtoSrcRootPath(protoFile, getConfig().protoRoots);
}

export function resolveProtoCompileContext(doc: vscode.TextDocument): ProtoCompileContext | undefined {
  if (!doc.uri.fsPath.endsWith('.proto')) return undefined;
  const protoFile = doc.uri.fsPath;
  const protoSrcRoot = resolveProtoSrcRoot(protoFile);
  if (!protoSrcRoot) return undefined;

  const relativeProto = normalizeSlashes(path.relative(protoSrcRoot, protoFile));
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath ?? path.dirname(protoSrcRoot);
  const protoPackage = inferProtoPackage(doc.getText());

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

export function getMakeProtoTemplateValues(ctx: ProtoCompileContext): Record<string, string> {
  return {
    workspaceFolder: ctx.workspaceFolder,
    protoSrcRoot: ctx.protoSrcRoot,
    protoFile: ctx.protoFile,
    protoFileNoExt: ctx.protoFileNoExt,
    protoDir: ctx.protoDir,
    relativeProto: ctx.relativeProto,
    relativeProtoNoExt: ctx.relativeProtoNoExt,
    protoPackage: ctx.protoPackage,
  };
}

export function applyMakeProtoTemplate(template: string, ctx: ProtoCompileContext): string {
  const values = getMakeProtoTemplateValues(ctx);

  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, shellQuote(value));
  }
  return output;
}

export function previewMakeProtoCommand(template: string, doc: vscode.TextDocument | undefined): {
  rendered?: string;
  reason?: 'empty' | 'noActiveProto' | 'unresolvedContext';
} {
  const rule = template.trim();
  if (!rule) return { reason: 'empty' };
  if (!doc || !doc.uri.fsPath.endsWith('.proto')) return { reason: 'noActiveProto' };

  const compileCtx = resolveProtoCompileContext(doc);
  if (!compileCtx) return { reason: 'unresolvedContext' };

  return { rendered: applyMakeProtoTemplate(rule, compileCtx) };
}

export async function testMakeProtoRule(value: unknown, output: vscode.OutputChannel): Promise<void> {
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
  output.appendLine(`[dry-run] ${redactMessagePathsForOutput(rendered)}`);

  try {
    const invocation = resolveShellInvocation(rendered, 'syntax');
    if (!invocation.supportsSyntaxCheck) {
      output.appendLine(`[dry-run] ${strings.testMakeProtoRuleRenderedOnly}`);
      output.show(true);
      vscode.window.showInformationMessage(strings.testMakeProtoRuleRenderedOnly);
      return;
    }
    await execFile(invocation.executable, invocation.args, {
      cwd: compileCtx.workspaceFolder,
      maxBuffer: 10 * 1024 * 1024
    });
    vscode.window.showInformationMessage(strings.testMakeProtoRuleDone);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const redactedMessage = redactMessagePathsForOutput(message);
    output.appendLine(redactedMessage);
    output.show(true);
    vscode.window.showErrorMessage(`${strings.testMakeProtoRuleFailed} ${redactedMessage}`);
  }
}

export async function compileCurrentProto(output: vscode.OutputChannel): Promise<void> {
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
  output.appendLine(`[command] ${redactMessagePathsForOutput(rendered)}`);

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: strings.compilingCurrentProto, cancellable: false },
      async () => {
        const invocation = resolveShellInvocation(rendered, 'execute');
        const result = await execFile(invocation.executable, invocation.args, {
          cwd: compileCtx.workspaceFolder,
          maxBuffer: 10 * 1024 * 1024
        });
        if (result.stdout) output.appendLine(redactMessagePathsForOutput(result.stdout.trimEnd()));
        if (result.stderr) output.appendLine(redactMessagePathsForOutput(result.stderr.trimEnd()));
      }
    );
    vscode.window.showInformationMessage(strings.compileCurrentProtoDone);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const redactedMessage = redactMessagePathsForOutput(message);
    output.appendLine(redactedMessage);
    output.show(true);
    vscode.window.showErrorMessage(`${strings.compileCurrentProtoFailed} ${redactedMessage}`);
  }
}
