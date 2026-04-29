// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

import { getConfig } from './config';
import { getGoUsagesForProtoPosition } from './goUsage';
import { parseGoPackageInfo } from './goText';
import { getStrings, type Strings } from './i18n';
import { resolveProtoDefinitionWithTrace, type ResolveTraceCandidate } from './protoResolver';
import { redactMessagePathsForOutput, redactPathForOutput } from './utils';

export async function diagnoseCurrentSymbol(output: vscode.OutputChannel): Promise<void> {
  const strings = getStrings();
  const editor = vscode.window.activeTextEditor;
  output.clear();
  output.appendLine(strings.diagnosticsOutputTitle);
  output.appendLine(`${strings.outputTime}: ${new Date().toISOString()}`);

  if (!editor) {
    output.appendLine(strings.outputActiveEditorNone);
    output.show(true);
    vscode.window.showInformationMessage(strings.diagnoseCurrentSymbolDone);
    return;
  }

  const doc = editor.document;
  const pos = editor.selection.active;
  const wordRange = doc.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_]*/);
  const symbol = wordRange ? doc.getText(wordRange) : '';
  const config = getConfig();

  output.appendLine('');
  output.appendLine(`[${strings.diagnosticsEditorSection}]`);
  output.appendLine(`${strings.outputLanguage}: ${doc.languageId}`);
  output.appendLine(`${strings.outputFile}: ${redactPathForOutput(doc.uri.fsPath)}`);
  output.appendLine(`${strings.outputCursor}: ${pos.line + 1}:${pos.character + 1}`);
  output.appendLine(`${strings.outputSymbol}: ${symbol || strings.outputNone}`);
  const workspacePath = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;
  output.appendLine(`${strings.outputWorkspace}: ${workspacePath ? redactPathForOutput(workspacePath) : strings.outputNone}`);

  output.appendLine('');
  output.appendLine(`[${strings.diagnosticsConfigSection}]`);
  output.appendLine(`protoRoots: ${config.protoRoots.length > 0 ? config.protoRoots.map(redactPathForOutput).join(', ') : strings.outputEmpty}`);
  output.appendLine(`searchInWorkspace: ${config.searchInWorkspace}`);
  output.appendLine(`exclude: ${config.exclude.length > 0 ? config.exclude.join(', ') : strings.outputEmpty}`);
  output.appendLine(`makeProtoCommand: ${config.makeProtoCommand ? strings.outputConfigured : strings.outputEmpty}`);

  if (doc.uri.fsPath.endsWith('.proto')) {
    await diagnoseProtoEditor(doc, pos, output, strings);
  } else if (doc.languageId === 'go' || doc.uri.fsPath.endsWith('.go')) {
    await diagnoseGoEditor(doc, pos, output, strings);
  } else {
    output.appendLine('');
    output.appendLine(`[${strings.outputResult}]`);
    output.appendLine(strings.diagnosticsUnsupportedEditor);
  }

  output.show(true);
  vscode.window.showInformationMessage(strings.diagnoseCurrentSymbolDone);
}

async function diagnoseProtoEditor(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  output: vscode.OutputChannel,
  strings: Strings
): Promise<void> {
  const protoText = doc.getText();
  const goPackage = parseGoPackageInfo(protoText);
  const usages = await getGoUsagesForProtoPosition(doc, pos, false);

  output.appendLine('');
  output.appendLine(`[${strings.diagnosticsProtoSection}]`);
  output.appendLine(`${strings.diagnosticsGoPackageName}: ${goPackage?.packageName ?? strings.outputNotFound}`);
  output.appendLine(`${strings.diagnosticsGoPackageImportPath}: ${goPackage?.importPath ?? strings.outputNotFound}`);
  output.appendLine(`${strings.diagnosticsUsageStrategy}: ${strings.diagnosticsUsageStrategyValue}`);
  output.appendLine(`${strings.diagnosticsUsageCandidates}: ${usages?.length ?? 0}`);
}

async function diagnoseGoEditor(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  output: vscode.OutputChannel,
  strings: Strings
): Promise<void> {
  const definitionStarted = Date.now();
  let defs: Array<vscode.Location | vscode.LocationLink> = [];
  let definitionError: unknown;
  try {
    defs = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
      'vscode.executeDefinitionProvider',
      doc.uri,
      pos
    ) ?? [];
  } catch (error) {
    definitionError = error;
  }
  const definitionMs = Date.now() - definitionStarted;
  const locations = (defs ?? []).map(d => 'targetUri' in d
    ? new vscode.Location((d as vscode.LocationLink).targetUri, (d as vscode.LocationLink).targetSelectionRange ?? (d as vscode.LocationLink).targetRange)
    : (d as vscode.Location));
  const pbGoLocations = locations.filter(loc => loc.uri.fsPath.endsWith('.pb.go') || loc.uri.fsPath.endsWith('.pb.gw.go'));

  output.appendLine('');
  output.appendLine(`[${strings.diagnosticsGoDefinitionProviderSection}]`);
  output.appendLine(`${strings.diagnosticsTotalDefinitions}: ${locations.length}`);
  output.appendLine(`${strings.diagnosticsGeneratedGoDefinitions}: ${pbGoLocations.length}`);
  output.appendLine(`${strings.diagnosticsElapsed}: ${definitionMs}ms`);
  if (definitionError) {
    const message = definitionError instanceof Error ? definitionError.message : String(definitionError);
    output.appendLine(`${strings.diagnosticsError}: ${redactMessagePathsForOutput(message)}`);
  }
  locations.slice(0, 20).forEach((loc, index) => {
    output.appendLine(`- #${index + 1}: ${redactPathForOutput(loc.uri.fsPath)}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`);
  });

  const trace = await resolveProtoDefinitionWithTrace(doc, pos, defs);
  output.appendLine('');
  output.appendLine(`[${strings.diagnosticsResolutionSection}]`);
  output.appendLine(`${strings.outputSymbol}: ${trace.symbolName ?? strings.outputNone}`);
  output.appendLine(`${strings.diagnosticsSteps}:`);
  for (const step of trace.steps) {
    output.appendLine(`- ${redactMessagePathsForOutput(step)}`);
  }

  const candidates = dedupeCandidates(trace.protoCandidates);
  output.appendLine(`${strings.diagnosticsProtoCandidates}: ${candidates.length}`);
  for (const candidate of candidates.slice(0, 30)) {
    output.appendLine(`- ${redactPathForOutput(candidate.fsPath)} (${candidate.exists ? strings.diagnosticsCandidateExists : strings.diagnosticsCandidateMissing}, ${strings.diagnosticsCandidateVia} ${candidate.via})`);
  }

  if (trace.result) {
    output.appendLine(`${strings.diagnosticsResolvedProto}: ${redactPathForOutput(trace.result.protoUri.fsPath)}:${trace.result.targetRange.start.line + 1}:${trace.result.targetRange.start.character + 1}`);
  } else {
    output.appendLine(`${strings.diagnosticsResolvedProto}: ${strings.outputNotFound}`);
  }
}

function dedupeCandidates(
  candidates: ResolveTraceCandidate[]
): ResolveTraceCandidate[] {
  const out: ResolveTraceCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.fsPath;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
