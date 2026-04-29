// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

import { compileCurrentProto, testMakeProtoRule } from './compile';
import { getConfig, openProjectConfig, updateProjectConfig } from './config';
import { diagnoseCurrentSymbol } from './diagnostics';
import {
  findGoUsagesPreferQualifiedName,
  findProtoDefinitionPosition,
  getGoUsagesForProtoPosition,
  getProtoDefinitionNameAtCursor,
  pickProtoDefinitionName,
  ProtoGoDefinitionProvider,
  clearGoUsageCaches,
  registerGoUsageCacheInvalidation,
  showReferencesNative
} from './goUsage';
import { getStrings, getUiLanguage, type Strings } from './i18n';
import {
  clearProtoResolverCaches,
  goToProtoDefinition,
  provideGoDefinitionWithProtoFirst,
  registerProtoResolverCacheInvalidation,
  resolveProtoDefinition
} from './protoResolver';
import { escapeHtml, isTextEditor, redactPathForOutput } from './utils';
import { ProtoJumpViewProvider } from './view';

export function activate(context: vscode.ExtensionContext): void {
  const viewProvider = new ProtoJumpViewProvider(context.extensionUri, context.globalState);
  const output = vscode.window.createOutputChannel('JumpProto');
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('protoJump.view', viewProvider));
  context.subscriptions.push(output);
  registerGoUsageCacheInvalidation(context);
  registerProtoResolverCacheInvalidation(context);

  const clearAllCaches = () => {
    clearGoUsageCaches();
    clearProtoResolverCaches();
  };
  const refreshProjectConfig = () => {
    clearAllCaches();
    viewProvider.refresh();
  };
  const projectConfigWatcher = vscode.workspace.createFileSystemWatcher('**/.jumpproto');
  context.subscriptions.push(projectConfigWatcher);
  context.subscriptions.push(projectConfigWatcher.onDidCreate(refreshProjectConfig));
  context.subscriptions.push(projectConfigWatcher.onDidChange(refreshProjectConfig));
  context.subscriptions.push(projectConfigWatcher.onDidDelete(refreshProjectConfig));

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [{ language: 'proto' }, { language: 'proto3' }, { language: 'protobuf' }],
      new ProtoGoDefinitionProvider()
    )
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = 'JumpProto';
  status.command = 'protoJump.goToProtoDefinition';
  context.subscriptions.push(status);

  const updateStatusVisibility = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'go') {
      status.show();
    } else {
      status.hide();
    }
  };
  updateStatusVisibility();

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('protoJump.goToProtoDefinition', async editor => {
      const strings = getStrings();
      const ok = await goToProtoDefinition(editor);
      if (!ok) {
        const picked = await vscode.window.showInformationMessage(
          strings.resolveFailed,
          strings.resolveFailedDiagnoseAction
        );
        if (picked === strings.resolveFailedDiagnoseAction) {
          await vscode.commands.executeCommand('protoJump.diagnoseCurrentSymbol');
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: 'go' }, {
      provideDefinition: provideGoDefinitionWithProtoFirst
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.openSettings', async () => {
      const strings = getStrings();
      await vscode.commands.executeCommand('workbench.action.openSettingsJson');
      vscode.window.showInformationMessage(strings.openSettingsOpenedJson);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.addProtoRoot', async () => {
      const strings = getStrings();
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: strings.addProtoRoot
      });
      if (!picked || picked.length === 0) return;
      const existing = getConfig().protoRoots;
      const next = Array.from(new Set([...existing, ...picked.map(u => u.fsPath)]));
      await updateProjectConfig({ protoRoots: next });
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.removeProtoRoot', async (arg?: unknown) => {
      const rootPath =
        typeof arg === 'string'
          ? arg
          : typeof arg === 'object' && arg && 'meta' in (arg as any) && (arg as any).meta?.kind === 'protoRoot'
            ? (arg as any).meta.rootPath
            : undefined;
      if (!rootPath) return;
      const existing = getConfig().protoRoots;
      const next = existing.filter(p => p !== rootPath);
      await updateProjectConfig({ protoRoots: next });
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.toggleSearchInWorkspace', async () => {
      const current = getConfig().searchInWorkspace;
      await updateProjectConfig({ searchInWorkspace: !current });
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.refreshView', () => viewProvider.refresh())
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateStatusVisibility();
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.selectLanguage', async () => {
      const strings = getStrings();
      const current = getUiLanguage();
      const picked = await vscode.window.showQuickPick(
        [
          { label: strings.languageChinese, value: 'zh' as const },
          { label: strings.languageEnglish, value: 'en' as const }
        ],
        { title: strings.languageSelectTitle }
      );
      if (!picked) return;
      if (picked.value === current) return;
      const config = vscode.workspace.getConfiguration('protoJump');
      await config.update('uiLanguage', picked.value, vscode.ConfigurationTarget.Global);
      viewProvider.refresh();
      vscode.window.showInformationMessage(getStrings(picked.value).languageUpdated);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.editMakeProtoRule', async () => {
      const strings = getStrings();
      await openProjectConfig();
      vscode.window.showInformationMessage(strings.makeProtoRuleOpenedJson);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.openMakeProtoRuleHelp', () => openMakeProtoRuleHelp())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.openOutput', () => {
      output.show(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.clearCaches', () => {
      clearAllCaches();
      vscode.window.showInformationMessage(getStrings().clearCachesDone);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.testNavigation', () => testNavigation(output))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.setMakeProtoRule', async (value?: unknown) => {
      const strings = getStrings();
      await updateProjectConfig({ makeProtoCommand: typeof value === 'string' ? value.trim() : '' });
      viewProvider.refresh();
      vscode.window.showInformationMessage(strings.makeProtoRuleSaved);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.testMakeProtoRule', (value?: unknown) => testMakeProtoRule(value, output))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.compileCurrentProto', () => compileCurrentProto(output))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.diagnoseCurrentSymbol', () => diagnoseCurrentSymbol(output))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.goToGoUsage', async (arg?: unknown) => {
      const strings = getStrings();
      const active = (isTextEditor(arg) ? arg : vscode.window.activeTextEditor) ?? undefined;
      if (!active) {
        vscode.window.showInformationMessage(strings.protoDefinitionRequired);
        return;
      }

      const locations = await getGoUsagesForProtoPosition(active.document, active.selection.active, true);
      if (locations) {
        if (locations.length > 0) {
          await showReferencesNative(active.document.uri, active.selection.active, locations);
        } else {
          vscode.window.showInformationMessage(strings.noGoUsagesFound);
        }
        return;
      }

      let name = getProtoDefinitionNameAtCursor(active);
      if (!name) {
        name = await pickProtoDefinitionName(active, strings);
        if (!name) {
          vscode.window.showInformationMessage(strings.protoDefinitionRequired);
          return;
        }
        const pos = findProtoDefinitionPosition(active.document, name);
        if (pos) active.selection = new vscode.Selection(pos, pos);
      }

      const matches = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: strings.searchingGoUsages, cancellable: true },
        (_progress, token) => findGoUsagesPreferQualifiedName(active.document, name!, token)
      );

      if (matches.length === 0) {
        vscode.window.showInformationMessage(strings.noGoUsagesFound);
        return;
      }

      const matchLocs = matches.map(m => new vscode.Location(m.uri, m.range));
      await showReferencesNative(active.document.uri, active.selection.active, matchLocs);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('protoJump')) {
        refreshProjectConfig();
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(refreshProjectConfig)
  );
}

async function testNavigation(output: vscode.OutputChannel): Promise<void> {
  const strings = getStrings();
  const editor = vscode.window.activeTextEditor;

  output.clear();
  output.appendLine(strings.testNavigationOutputTitle);
  output.appendLine(`${strings.outputTime}: ${new Date().toISOString()}`);

  if (!editor) {
    output.appendLine(strings.outputActiveEditorNone);
    output.show(true);
    vscode.window.showInformationMessage(strings.testNavigationNeedEditor);
    return;
  }

  const doc = editor.document;
  const pos = editor.selection.active;
  output.appendLine(`${strings.outputFile}: ${redactPathForOutput(doc.uri.fsPath)}`);
  output.appendLine(`${strings.outputLanguage}: ${doc.languageId}`);
  output.appendLine(`${strings.outputCursor}: ${formatPosition(pos)}`);

  if (doc.languageId === 'go' || doc.uri.fsPath.endsWith('.go')) {
    const resolved = await resolveProtoDefinition(doc, pos);
    output.appendLine('');
    output.appendLine('[Go -> Proto]');
    if (resolved) {
      output.appendLine(`${strings.outputResolved}: ${redactPathForOutput(resolved.protoUri.fsPath)}:${formatPosition(resolved.targetRange.start)}`);
      output.show(true);
      vscode.window.showInformationMessage(strings.testNavigationResolved);
      return;
    }
    output.appendLine(`${strings.outputResolved}: ${strings.outputNotFound}`);
    output.show(true);
    vscode.window.showInformationMessage(strings.testNavigationNoResult);
    return;
  }

  if (doc.uri.fsPath.endsWith('.proto')) {
    output.appendLine('');
    output.appendLine('[Proto -> Go]');
    const directLocations = await getGoUsagesForProtoPosition(doc, pos, false);
    if (directLocations && directLocations.length > 0) {
      appendLocations(output, directLocations, strings);
      output.show(true);
      vscode.window.showInformationMessage(strings.testNavigationResolved);
      return;
    }

    const name = getProtoDefinitionNameAtCursor(editor);
    if (name) {
      const usages = await findGoUsagesPreferQualifiedName(doc, name);
      const locations = usages.map(usage => new vscode.Location(usage.uri, usage.range));
      if (locations.length > 0) {
        output.appendLine(`${strings.outputSymbol}: ${name}`);
        appendLocations(output, locations, strings);
        output.show(true);
        vscode.window.showInformationMessage(strings.testNavigationResolved);
        return;
      }
    }

    output.appendLine(`${strings.outputResolved}: ${strings.outputNotFound}`);
    output.show(true);
    vscode.window.showInformationMessage(strings.testNavigationNoResult);
    return;
  }

  output.appendLine('');
  output.appendLine(`[${strings.outputResult}]`);
  output.appendLine(strings.testNavigationOutputUnsupported);
  output.show(true);
  vscode.window.showInformationMessage(strings.testNavigationUnsupported);
}

function appendLocations(output: vscode.OutputChannel, locations: vscode.Location[], strings: Strings): void {
  output.appendLine(`${strings.outputCandidates}: ${locations.length}`);
  locations.slice(0, 20).forEach((loc, index) => {
    output.appendLine(`- #${index + 1}: ${redactPathForOutput(loc.uri.fsPath)}:${formatPosition(loc.range.start)}`);
  });
  if (locations.length > 20) {
    output.appendLine(`... ${locations.length - 20} ${strings.outputMore}`);
  }
}

function formatPosition(pos: vscode.Position): string {
  return `${pos.line + 1}:${pos.character + 1}`;
}

function openMakeProtoRuleHelp(): void {
  const strings = getStrings();
  const placeholders = [
    { token: '{protoSrcRoot}', desc: strings.makeProtoRuleHelpPlaceholderProtoSrcRoot },
    { token: '{relativeProto}', desc: strings.makeProtoRuleHelpPlaceholderRelativeProto },
    { token: '{protoFileNoExt}', desc: strings.makeProtoRuleHelpPlaceholderProtoFileNoExt },
    { token: '{protoPackage}', desc: strings.makeProtoRuleHelpPlaceholderProtoPackage },
    { token: '{workspaceFolder}', desc: strings.makeProtoRuleHelpPlaceholderWorkspaceFolder }
  ];

  const panel = vscode.window.createWebviewPanel(
    'protoJump.makeProtoRuleHelp',
    strings.makeProtoRuleHelpTitle,
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  panel.webview.html = `<!DOCTYPE html>
<html lang="${getUiLanguage()}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(strings.makeProtoRuleHelpTitle)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.55;
      margin: 0;
      padding: 16px;
      max-width: 820px;
    }
    h1, h2 { margin: 0 0 10px 0; line-height: 1.35; }
    h1 { font-size: 18px; }
    h2 { font-size: 14px; margin-top: 16px; }
    p { margin: 0 0 10px 0; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 0 0 6px 0; }
    ol { margin: 0; padding-left: 20px; }
    ol li { margin: 0 0 6px 0; }
    code {
      padding: 2px 5px;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
      font-family: var(--vscode-editor-font-family, monospace);
    }
    pre {
      margin: 8px 0 12px 0;
      padding: 10px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(strings.makeProtoRuleHelpTitle)}</h1>
  <p>${escapeHtml(strings.makeProtoRuleHelpIntro)}</p>
  <h2>${escapeHtml(strings.makeProtoRuleHelpUsageTitle)}</h2>
  <p>${escapeHtml(strings.makeProtoRuleHelpUsage)}</p>
  <pre>cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}</pre>
  <h2>${escapeHtml(strings.makeProtoRuleHelpDemoTitle)}</h2>
  <p class="muted">${escapeHtml(strings.makeProtoRuleHelpDemoContext)}</p>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpDemoResultLabel)}</strong></p>
  <pre>cd /ABSOLUTE/PATH/TO/proto_src && make special_proto packagename=activity filename=user_profile</pre>
  <h2>${escapeHtml(strings.makeProtoRuleHelpPlaceholdersTitle)}</h2>
  <ul>
    ${placeholders.map(item => `<li><code>${escapeHtml(item.token)}</code>: ${escapeHtml(item.desc)}</li>`).join('')}
  </ul>
  <h2>${escapeHtml(strings.makeProtoRuleHelpQuickStartTitle)}</h2>
  <ol>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep1)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep2)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep3)}</li>
  </ol>
  <h2>${escapeHtml(strings.makeProtoRuleHelpTroubleshootingTitle)}</h2>
  <ul>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting1)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting2)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting3)}</li>
  </ul>
  <p class="muted">${escapeHtml(strings.makeProtoRuleHelpTips)}</p>
</body>
</html>`;
}
