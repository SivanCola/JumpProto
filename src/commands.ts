// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

import { compileCurrentProto, testMakeProtoRule } from './compile';
import { getUpdateTarget } from './config';
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
import { getStrings, getUiLanguage } from './i18n';
import { goToProtoDefinition, provideGoDefinitionWithProtoFirst, resolveProtoDefinition } from './protoResolver';
import { escapeHtml, isTextEditor } from './utils';
import { ProtoJumpViewProvider } from './view';

export function activate(context: vscode.ExtensionContext): void {
  const viewProvider = new ProtoJumpViewProvider(context.extensionUri);
  const output = vscode.window.createOutputChannel('JumpProto');
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('protoJump.view', viewProvider));
  context.subscriptions.push(output);
  registerGoUsageCacheInvalidation(context);

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
        vscode.window.showInformationMessage(strings.resolveFailed);
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
      const config = vscode.workspace.getConfiguration('protoJump');
      const existing = (config.get<string[]>('protoRoots') ?? []).filter(Boolean);
      const next = Array.from(new Set([...existing, ...picked.map(u => u.fsPath)]));
      await config.update('protoRoots', next, getUpdateTarget());
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
      const config = vscode.workspace.getConfiguration('protoJump');
      const existing = (config.get<string[]>('protoRoots') ?? []).filter(Boolean);
      const next = existing.filter(p => p !== rootPath);
      await config.update('protoRoots', next, getUpdateTarget());
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.toggleSearchInWorkspace', async () => {
      const config = vscode.workspace.getConfiguration('protoJump');
      const current = config.get<boolean>('searchInWorkspace') ?? true;
      await config.update('searchInWorkspace', !current, getUpdateTarget());
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
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
      } else {
        await vscode.commands.executeCommand('workbench.action.openSettingsJson', 'protoJump.makeProtoCommand');
      }
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
    vscode.commands.registerCommand('protoJump.testNavigation', () => testNavigation(output))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('protoJump.setMakeProtoRule', async (value?: unknown) => {
      const strings = getStrings();
      const config = vscode.workspace.getConfiguration('protoJump');
      await config.update('makeProtoCommand', typeof value === 'string' ? value.trim() : '', getUpdateTarget());
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
        clearGoUsageCaches();
        viewProvider.refresh();
      }
    })
  );
}

async function testNavigation(output: vscode.OutputChannel): Promise<void> {
  const strings = getStrings();
  const editor = vscode.window.activeTextEditor;

  output.clear();
  output.appendLine('JumpProto Test Navigation');
  output.appendLine(`Time: ${new Date().toISOString()}`);

  if (!editor) {
    output.appendLine('Active editor: none');
    output.show(true);
    vscode.window.showInformationMessage(strings.testNavigationNeedEditor);
    return;
  }

  const doc = editor.document;
  const pos = editor.selection.active;
  output.appendLine(`File: ${doc.uri.fsPath}`);
  output.appendLine(`Language: ${doc.languageId}`);
  output.appendLine(`Cursor: ${formatPosition(pos)}`);

  if (doc.languageId === 'go' || doc.uri.fsPath.endsWith('.go')) {
    const resolved = await resolveProtoDefinition(doc, pos);
    output.appendLine('');
    output.appendLine('[Go -> Proto]');
    if (resolved) {
      output.appendLine(`Resolved: ${resolved.protoUri.fsPath}:${formatPosition(resolved.targetRange.start)}`);
      output.show(true);
      vscode.window.showInformationMessage(strings.testNavigationResolved);
      return;
    }
    output.appendLine('Resolved: (not found)');
    output.show(true);
    vscode.window.showInformationMessage(strings.testNavigationNoResult);
    return;
  }

  if (doc.uri.fsPath.endsWith('.proto')) {
    output.appendLine('');
    output.appendLine('[Proto -> Go]');
    const directLocations = await getGoUsagesForProtoPosition(doc, pos, false);
    if (directLocations && directLocations.length > 0) {
      appendLocations(output, directLocations);
      output.show(true);
      vscode.window.showInformationMessage(strings.testNavigationResolved);
      return;
    }

    const name = getProtoDefinitionNameAtCursor(editor);
    if (name) {
      const usages = await findGoUsagesPreferQualifiedName(doc, name);
      const locations = usages.map(usage => new vscode.Location(usage.uri, usage.range));
      if (locations.length > 0) {
        output.appendLine(`Symbol: ${name}`);
        appendLocations(output, locations);
        output.show(true);
        vscode.window.showInformationMessage(strings.testNavigationResolved);
        return;
      }
    }

    output.appendLine('Resolved: (not found)');
    output.show(true);
    vscode.window.showInformationMessage(strings.testNavigationNoResult);
    return;
  }

  output.appendLine('');
  output.appendLine('[Result]');
  output.appendLine('Unsupported editor. Open a Go or .proto file first.');
  output.show(true);
  vscode.window.showInformationMessage(strings.testNavigationUnsupported);
}

function appendLocations(output: vscode.OutputChannel, locations: vscode.Location[]): void {
  output.appendLine(`Candidates: ${locations.length}`);
  locations.slice(0, 20).forEach((loc, index) => {
    output.appendLine(`- #${index + 1}: ${loc.uri.fsPath}:${formatPosition(loc.range.start)}`);
  });
  if (locations.length > 20) {
    output.appendLine(`... ${locations.length - 20} more`);
  }
}

function formatPosition(pos: vscode.Position): string {
  return `${pos.line + 1}:${pos.character + 1}`;
}

function openMakeProtoRuleHelp(): void {
  const strings = getStrings();
  const placeholders = [
    { token: '{workspaceFolder}', desc: strings.makeProtoRuleHelpPlaceholderWorkspaceFolder },
    { token: '{protoSrcRoot}', desc: strings.makeProtoRuleHelpPlaceholderProtoSrcRoot },
    { token: '{protoFile}', desc: strings.makeProtoRuleHelpPlaceholderProtoFile },
    { token: '{protoFileNoExt}', desc: strings.makeProtoRuleHelpPlaceholderProtoFileNoExt },
    { token: '{protoDir}', desc: strings.makeProtoRuleHelpPlaceholderProtoDir },
    { token: '{relativeProto}', desc: strings.makeProtoRuleHelpPlaceholderRelativeProto },
    { token: '{relativeProtoNoExt}', desc: strings.makeProtoRuleHelpPlaceholderRelativeProtoNoExt },
    { token: '{protoPackage}', desc: strings.makeProtoRuleHelpPlaceholderProtoPackage }
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
      line-height: 1.6;
      margin: 0;
      padding: 16px;
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
  <h2>${escapeHtml(strings.makeProtoRuleHelpQuickStartTitle)}</h2>
  <ol>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep1)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep2)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpQuickStartStep3)}</li>
  </ol>
  <h2>${escapeHtml(strings.makeProtoRuleHelpUsageTitle)}</h2>
  <p>${escapeHtml(strings.makeProtoRuleHelpUsage)}</p>
  <h2>${escapeHtml(strings.makeProtoRuleHelpDemoTitle)}</h2>
  <p class="muted">${escapeHtml(strings.makeProtoRuleHelpDemoContext)}</p>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpDemoRuleLabel)}</strong></p>
  <pre>cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}</pre>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpDemoResultLabel)}</strong></p>
  <pre>cd /ABSOLUTE/PATH/TO/proto_src && make special_proto packagename=activity filename=user_profile</pre>
  <h2>${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoTitle)}</h2>
  <p class="muted">${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoContext)}</p>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoRuleLabel)}</strong></p>
  <pre>cd {protoSrcRoot} && case {relativeProto} in
  rpc/*) make rpc pkg={protoFileNoExt} ;;
  api/*) make api pkg={protoFileNoExt} ;;
  model/*) make golang_model_proto ;;
  *) make special_proto packagename={protoPackage} filename={protoFileNoExt} ;;
esac</pre>
  <p><strong>${escapeHtml(strings.makeProtoRuleHelpAdvancedDemoResultLabel)}</strong></p>
  <pre>cd /ABSOLUTE/PATH/TO/proto_src && case rpc/user/get_user.proto in
  rpc/*) make rpc pkg=get_user ;;
  api/*) make api pkg=get_user ;;
  model/*) make golang_model_proto ;;
  *) make special_proto packagename=user filename=get_user ;;
esac</pre>
  <h2>${escapeHtml(strings.makeProtoRuleHelpPlaceholdersTitle)}</h2>
  <ul>
    ${placeholders.map(item => `<li><code>${escapeHtml(item.token)}</code>: ${escapeHtml(item.desc)}</li>`).join('')}
  </ul>
  <h2>${escapeHtml(strings.makeProtoRuleHelpTipsTitle)}</h2>
  <p>${escapeHtml(strings.makeProtoRuleHelpTips)}</p>
  <h2>${escapeHtml(strings.makeProtoRuleHelpTroubleshootingTitle)}</h2>
  <ul>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting1)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting2)}</li>
    <li>${escapeHtml(strings.makeProtoRuleHelpTroubleshooting3)}</li>
  </ul>
</body>
</html>`;
}
