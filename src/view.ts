// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

import {
  getMakeProtoTemplateValues,
  previewMakeProtoCommand,
  resolveProtoCompileContext
} from './compile';
import { getConfig } from './config';
import { getStrings, getUiLanguage } from './i18n';
import { shellQuote } from './shell';
import { escapeHtml, redactPathForOutput } from './utils';
import { getProtoRootsLabel, renderProtoRootItems } from './viewHtml';

type ThemeMode = 'system' | 'dark' | 'light' | 'aurora' | 'coffee' | 'sunlit' | 'clean' | 'purple' | 'contrast';

const THEME_STATE_KEY = 'protoJump.themeMode';
const FEEDBACK_URL = 'https://github.com/SivanCola/JumpProto/issues';
const THEME_MODES: ThemeMode[] = ['system', 'dark', 'light', 'aurora', 'coffee', 'sunlit', 'clean', 'purple', 'contrast'];

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as string[]).includes(value);
}

function getNonce(): string {
  return randomBytes(16).toString('base64');
}

type ViewMessage =
  | { type: 'addProtoRoot' }
  | { type: 'removeProtoRoot'; rootPath: string }
  | { type: 'setLanguage'; value: 'zh' | 'en' }
  | { type: 'setThemeMode'; themeMode: ThemeMode }
  | { type: 'openFeedback' }
  | { type: 'goToProtoDefinition' }
  | { type: 'testNavigation' }
  | { type: 'openOutput' }
  | { type: 'clearCaches' }
  | { type: 'compileCurrentProto' }
  | { type: 'diagnoseCurrentSymbol' }
  | { type: 'openMakeProtoRuleHelp' }
  | { type: 'openMakeProtoRuleJson' }
  | { type: 'testMakeProtoRule'; value: string }
  | { type: 'saveMakeProtoRule'; value: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isViewMessage(value: unknown): value is ViewMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'addProtoRoot':
    case 'openFeedback':
    case 'goToProtoDefinition':
    case 'testNavigation':
    case 'openOutput':
    case 'clearCaches':
    case 'compileCurrentProto':
    case 'diagnoseCurrentSymbol':
    case 'openMakeProtoRuleHelp':
    case 'openMakeProtoRuleJson':
      return true;
    case 'removeProtoRoot':
      return typeof value.rootPath === 'string';
    case 'setLanguage':
      return value.value === 'zh' || value.value === 'en';
    case 'setThemeMode':
      return isThemeMode(value.themeMode);
    case 'testMakeProtoRule':
    case 'saveMakeProtoRule':
      return typeof value.value === 'string';
    default:
      return false;
  }
}

export class ProtoJumpViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalState: vscode.Memento
  ) {}

  refresh() {
    if (!this.view) return;
    this.view.webview.html = this.safeRenderHtml(this.view.webview);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    try {
      this.view = webviewView;
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this.extensionUri]
      };
      webviewView.webview.html = this.renderLoadingHtml();
      webviewView.webview.onDidReceiveMessage((message: unknown) => {
        if (!isViewMessage(message)) return;
        switch (message.type) {
          case 'addProtoRoot':
            void vscode.commands.executeCommand('protoJump.addProtoRoot');
            break;
          case 'removeProtoRoot':
            void vscode.commands.executeCommand('protoJump.removeProtoRoot', message.rootPath);
            break;
          case 'setLanguage':
            void vscode.workspace.getConfiguration('protoJump')
              .update('uiLanguage', message.value, vscode.ConfigurationTarget.Global)
              .then(() => this.refresh());
            break;
          case 'setThemeMode':
            if (isThemeMode(message.themeMode)) {
              void this.globalState.update(THEME_STATE_KEY, message.themeMode).then(() => this.refresh());
            }
            break;
          case 'openFeedback':
            void vscode.env.openExternal(vscode.Uri.parse(FEEDBACK_URL));
            break;
          case 'goToProtoDefinition':
            void vscode.commands.executeCommand('protoJump.goToProtoDefinition');
            break;
          case 'testNavigation':
            void vscode.commands.executeCommand('protoJump.testNavigation');
            break;
          case 'openOutput':
            void vscode.commands.executeCommand('protoJump.openOutput');
            break;
          case 'clearCaches':
            void vscode.commands.executeCommand('protoJump.clearCaches');
            break;
          case 'compileCurrentProto':
            void vscode.commands.executeCommand('protoJump.compileCurrentProto');
            break;
          case 'diagnoseCurrentSymbol':
            void vscode.commands.executeCommand('protoJump.diagnoseCurrentSymbol');
            break;
          case 'openMakeProtoRuleHelp':
            void vscode.commands.executeCommand('protoJump.openMakeProtoRuleHelp');
            break;
          case 'openMakeProtoRuleJson':
            void vscode.commands.executeCommand('protoJump.editMakeProtoRule');
            break;
          case 'testMakeProtoRule':
            void vscode.commands.executeCommand('protoJump.testMakeProtoRule', message.value);
            break;
          case 'saveMakeProtoRule':
            void vscode.commands.executeCommand('protoJump.setMakeProtoRule', message.value);
            break;
          default:
            break;
        }
      });
      webviewView.webview.html = this.safeRenderHtml(webviewView.webview);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('JumpProto sidebar initialization failed:', error);
      webviewView.webview.html = this.renderErrorHtml(webviewView.webview, message);
    }
  }

  private safeRenderHtml(webview: vscode.Webview): string {
    try {
      return this.renderHtml(webview);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('JumpProto sidebar render failed:', error);
      return this.renderErrorHtml(webview, message);
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const strings = getStrings();
    const language = getUiLanguage();
    const { protoRoots, makeProtoCommand } = getConfig();
    const activeDoc = vscode.window.activeTextEditor?.document;
    const hasMakeProtoRule = makeProtoCommand.length > 0;
    const activeKind = activeDoc
      ? (activeDoc.languageId === 'go' || activeDoc.uri.fsPath.endsWith('.go')
        ? 'go'
        : activeDoc.uri.fsPath.endsWith('.proto')
          ? 'proto'
          : 'other')
      : 'none';
    let primaryActionType = 'none';
    let primaryActionTitle = strings.primaryActionEmptyTitle;
    let primaryActionLabel = strings.primaryActionDisabledButton;
    let primaryActionDescription = strings.primaryActionFallbackDescription;
    let primaryActionDisabled = true;
    if (activeKind === 'go') {
      primaryActionType = 'goToProtoDefinition';
      primaryActionTitle = strings.primaryActionGoTitle;
      primaryActionLabel = strings.primaryActionGoButton;
      primaryActionDescription = strings.primaryActionGoDescription;
      primaryActionDisabled = false;
    } else if (activeKind === 'proto' && hasMakeProtoRule) {
      primaryActionType = 'compileCurrentProto';
      primaryActionTitle = strings.primaryActionProtoCompileTitle;
      primaryActionLabel = strings.compileCurrentProto;
      primaryActionDescription = strings.primaryActionProtoDescription;
      primaryActionDisabled = false;
    } else if (activeKind === 'proto') {
      primaryActionType = 'configureMakeProtoRule';
      primaryActionTitle = strings.primaryActionProtoSetupTitle;
      primaryActionLabel = strings.primaryActionConfigureRule;
      primaryActionDescription = strings.primaryActionProtoSetupDescription;
      primaryActionDisabled = false;
    } else if (activeKind === 'other') {
      primaryActionTitle = strings.primaryActionUnsupportedTitle;
      primaryActionDescription = strings.primaryActionUnsupportedDescription;
    }
    let compileCtx: ReturnType<typeof resolveProtoCompileContext> | undefined;
    try {
      compileCtx = activeDoc ? resolveProtoCompileContext(activeDoc) : undefined;
    } catch (error) {
      console.error('JumpProto compile context preview failed:', error);
      compileCtx = undefined;
    }
    const templateValues = compileCtx ? getMakeProtoTemplateValues(compileCtx) : undefined;
    const quotedTemplateValues = templateValues
      ? Object.fromEntries(Object.entries(templateValues).map(([key, value]) => [key, shellQuote(value)]))
      : undefined;
    let preview: ReturnType<typeof previewMakeProtoCommand>;
    try {
      preview = previewMakeProtoCommand(makeProtoCommand, activeDoc);
    } catch (error) {
      console.error('JumpProto command preview failed:', error);
      preview = { reason: activeDoc ? 'unresolvedContext' : 'noActiveProto' };
    }
    const renderedPreview = preview.rendered
      ?? (preview.reason === 'empty'
        ? strings.makeProtoRuleUnset
        : preview.reason === 'unresolvedContext'
          ? strings.renderedCommandPreviewNeedContext
          : strings.renderedCommandPreviewNeedProto);
    const nonce = getNonce();
    const removeLabel = strings.remove;
    const rootsLabel = getProtoRootsLabel(protoRoots.length, language);
    const configuredLabel = makeProtoCommand ? strings.saved : strings.notConfigured;
    const quickSaveLabel = strings.save;
    const cancelLabel = strings.cancel;
    const editRuleLabel = makeProtoCommand ? strings.edit : strings.configure;
    const currentThemeMode = this.getThemeMode();
    const bodyThemeClass = currentThemeMode === 'system' ? '' : `theme-${currentThemeMode}`;
    const themeOptions = THEME_MODES.map(mode => {
      const label = this.getThemeLabel(strings, mode);
      return `
        <button class="theme-option ${mode === currentThemeMode ? 'active' : ''}" data-theme-option="${mode}" role="menuitemradio" aria-checked="${mode === currentThemeMode}">
          <span class="theme-swatch ${mode}"></span>
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    }).join('');

    const rootItems = renderProtoRootItems(
      protoRoots,
      strings.protoRootsEmptyDescription,
      removeLabel,
      redactPathForOutput
    );

    return `<!DOCTYPE html>
<html lang="${language}" class="lang-${language}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: dark light;
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-sideBarSectionHeader-border, var(--vscode-editorWidget-border, rgba(127,127,127,.35)));
      --section: var(--vscode-sideBarSectionHeader-background, transparent);
      --row: var(--vscode-list-hoverBackground, rgba(127,127,127,.08));
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border, var(--border));
      --button: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --button-hover: var(--vscode-button-hoverBackground, var(--button));
      --secondary: var(--vscode-button-secondaryBackground, transparent);
      --secondary-fg: var(--vscode-button-secondaryForeground, var(--fg));
      --secondary-hover: var(--vscode-button-secondaryHoverBackground, var(--row));
      --danger: var(--vscode-errorForeground);
      --focus: var(--vscode-focusBorder, var(--button));
      --mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    }

    body.theme-dark {
      color-scheme: dark;
      --bg: #141520;
      --fg: #edf1ff;
      --muted: #aab3cf;
      --border: rgba(213, 219, 255, .16);
      --section: #191b2a;
      --row: rgba(125, 146, 255, .12);
      --input-bg: #10121e;
      --input-fg: #edf1ff;
      --input-border: rgba(213, 219, 255, .2);
      --button: #7d92ff;
      --button-fg: #ffffff;
      --button-hover: #8da0ff;
      --secondary: rgba(255,255,255,.04);
      --secondary-fg: #edf1ff;
      --secondary-hover: rgba(125, 146, 255, .16);
      --danger: #ff7aa7;
      --focus: #8da0ff;
    }

    body.theme-light {
      color-scheme: light;
      --bg: #f5f7fb;
      --fg: #20263a;
      --muted: #65708a;
      --border: rgba(53, 65, 101, .18);
      --section: #eef2fa;
      --row: rgba(82, 105, 216, .08);
      --input-bg: #ffffff;
      --input-fg: #20263a;
      --input-border: rgba(53, 65, 101, .2);
      --button: #5269d8;
      --button-fg: #ffffff;
      --button-hover: #465cc7;
      --secondary: rgba(255,255,255,.66);
      --secondary-fg: #20263a;
      --secondary-hover: rgba(82, 105, 216, .1);
      --danger: #c93568;
      --focus: #5269d8;
    }

    body.theme-aurora {
      color-scheme: dark;
      --bg: #101827;
      --fg: #eceff4;
      --muted: #a9b7cc;
      --border: rgba(216, 222, 233, .17);
      --section: #151f30;
      --row: rgba(136, 192, 208, .12);
      --input-bg: #0d1421;
      --input-fg: #eceff4;
      --input-border: rgba(136, 192, 208, .24);
      --button: #88c0d0;
      --button-fg: #0d1421;
      --button-hover: #9ad2df;
      --secondary: rgba(255,255,255,.04);
      --secondary-fg: #eceff4;
      --secondary-hover: rgba(136, 192, 208, .16);
      --danger: #bf616a;
      --focus: #81a1c1;
    }

    body.theme-coffee {
      color-scheme: dark;
      --bg: #181825;
      --fg: #cdd6f4;
      --muted: #a6adc8;
      --border: rgba(205, 214, 244, .17);
      --section: #1e1e2e;
      --row: rgba(203, 166, 247, .12);
      --input-bg: #11111b;
      --input-fg: #cdd6f4;
      --input-border: rgba(203, 166, 247, .22);
      --button: #cba6f7;
      --button-fg: #1e1e2e;
      --button-hover: #dab9ff;
      --secondary: rgba(255,255,255,.04);
      --secondary-fg: #cdd6f4;
      --secondary-hover: rgba(203, 166, 247, .16);
      --danger: #f38ba8;
      --focus: #b4befe;
    }

    body.theme-sunlit {
      color-scheme: light;
      --bg: #fdf6e3;
      --fg: #073642;
      --muted: #657b83;
      --border: rgba(101, 123, 131, .26);
      --section: #eee8d5;
      --row: rgba(38, 139, 210, .08);
      --input-bg: #fffaf0;
      --input-fg: #073642;
      --input-border: rgba(101, 123, 131, .28);
      --button: #268bd2;
      --button-fg: #ffffff;
      --button-hover: #1f7dbd;
      --secondary: rgba(255,250,240,.7);
      --secondary-fg: #073642;
      --secondary-hover: rgba(38, 139, 210, .12);
      --danger: #dc322f;
      --focus: #268bd2;
    }

    body.theme-clean {
      color-scheme: light;
      --bg: #ffffff;
      --fg: #24292f;
      --muted: #57606a;
      --border: rgba(31, 35, 40, .15);
      --section: #f6f8fa;
      --row: rgba(9, 105, 218, .07);
      --input-bg: #ffffff;
      --input-fg: #24292f;
      --input-border: rgba(31, 35, 40, .18);
      --button: #0969da;
      --button-fg: #ffffff;
      --button-hover: #0759ba;
      --secondary: #f6f8fa;
      --secondary-fg: #24292f;
      --secondary-hover: rgba(9, 105, 218, .09);
      --danger: #cf222e;
      --focus: #0969da;
    }

    body.theme-purple {
      color-scheme: dark;
      --bg: #120f1f;
      --fg: #f4edff;
      --muted: #b9a7d8;
      --border: rgba(232, 213, 255, .18);
      --section: #191328;
      --row: rgba(189, 124, 255, .13);
      --input-bg: #0e0a19;
      --input-fg: #f4edff;
      --input-border: rgba(189, 124, 255, .25);
      --button: #bd7cff;
      --button-fg: #140d22;
      --button-hover: #d2a2ff;
      --secondary: rgba(255,255,255,.04);
      --secondary-fg: #f4edff;
      --secondary-hover: rgba(189, 124, 255, .18);
      --danger: #ff76a8;
      --focus: #d6a7ff;
    }

    body.theme-contrast {
      color-scheme: dark;
      --bg: #000000;
      --fg: #ffffff;
      --muted: #d7d7d7;
      --border: rgba(255, 255, 255, .5);
      --section: #101010;
      --row: rgba(255, 255, 0, .12);
      --input-bg: #080808;
      --input-fg: #ffffff;
      --input-border: rgba(255, 255, 255, .6);
      --button: #ffff00;
      --button-fg: #000000;
      --button-hover: #f0f000;
      --secondary: #101010;
      --secondary-fg: #ffffff;
      --secondary-hover: #202020;
      --danger: #ff5c8a;
      --focus: #ffff00;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 8px 14px 12px;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.35;
    }

    button,
    textarea {
      font: inherit;
    }

    .shell {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .topbar {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding: 2px 0 6px;
      border-bottom: 1px solid var(--border);
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .theme-control {
      position: relative;
    }

    .brand {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 1px;
    }

    .brand-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .section {
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      background: transparent;
    }

    .section-head {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding: 6px 8px;
      background: var(--section);
      border-bottom: 1px solid var(--border);
    }

    .section-title {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .section-meta,
    .chip {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .section-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
    }

    .primary-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(128px, auto);
      align-items: center;
      gap: 8px;
      padding: 10px;
    }

    .primary-copy {
      min-width: 0;
    }

    .primary-title {
      font-size: 12px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .primary-description,
    .empty-copy {
      margin-top: 2px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }

    .main-action {
      min-height: 32px;
      padding: 6px 12px;
    }

    .btn,
    .icon-btn {
      border: 1px solid transparent;
      border-radius: 5px;
      min-height: 28px;
      cursor: pointer;
      transition: background-color .12s ease, border-color .12s ease, opacity .12s ease;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 5px 8px;
      min-width: 0;
      color: var(--secondary-fg);
      background: var(--secondary);
      border-color: var(--border);
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .btn:hover {
      background: var(--secondary-hover);
    }

    .btn.primary {
      color: var(--button-fg);
      background: var(--button);
      border-color: var(--button);
    }

    .btn.primary:hover {
      background: var(--button-hover);
    }

    .btn.compact {
      min-height: 24px;
      padding: 3px 8px;
      font-size: 12px;
    }

    .btn:disabled {
      opacity: .45;
      cursor: default;
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      color: var(--secondary-fg);
      background: var(--secondary);
      border-color: var(--border);
      font-weight: 700;
      line-height: 1;
      flex-shrink: 0;
    }

    .icon-btn:hover {
      background: var(--secondary-hover);
    }

    .icon-btn.danger {
      color: var(--danger);
      font-size: 13px;
    }

    .theme-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 20;
      display: none;
      min-width: 168px;
      padding: 5px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      box-shadow: 0 10px 24px rgba(0, 0, 0, .24);
    }

    .theme-menu.visible {
      display: grid;
      gap: 2px;
    }

    .theme-option {
      min-height: 28px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 0;
      border-radius: 4px;
      padding: 4px 8px;
      background: transparent;
      color: var(--fg);
      cursor: pointer;
      text-align: left;
    }

    .theme-option:hover,
    .theme-option.active {
      background: var(--row);
    }

    .theme-swatch {
      width: 13px;
      height: 13px;
      border-radius: 999px;
      border: 1px solid var(--border);
      flex: 0 0 auto;
    }

    .theme-swatch.system { background: conic-gradient(#7d92ff 0 25%, #f5f7fb 0 50%, #141520 0 75%, #88c0d0 0); }
    .theme-swatch.dark { background: linear-gradient(135deg, #141520 0 48%, #7d92ff 48%); }
    .theme-swatch.light { background: linear-gradient(135deg, #f5f7fb 0 48%, #5269d8 48%); }
    .theme-swatch.aurora { background: linear-gradient(135deg, #101827 0 48%, #88c0d0 48%); }
    .theme-swatch.coffee { background: linear-gradient(135deg, #181825 0 48%, #cba6f7 48%); }
    .theme-swatch.sunlit { background: linear-gradient(135deg, #fdf6e3 0 48%, #268bd2 48%); }
    .theme-swatch.clean { background: linear-gradient(135deg, #ffffff 0 48%, #0969da 48%); }
    .theme-swatch.purple { background: linear-gradient(135deg, #120f1f 0 48%, #bd7cff 48%); }
    .theme-swatch.contrast { background: linear-gradient(135deg, #000000 0 48%, #ffff00 48%); }

    .btn:focus-visible,
    .icon-btn:focus-visible,
    .segment:focus-visible,
    .theme-option:focus-visible,
    textarea:focus-visible {
      outline: 1px solid var(--focus);
      outline-offset: 1px;
    }

    .segmented {
      display: grid;
      grid-template-columns: repeat(2, minmax(32px, 1fr));
      min-width: 78px;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: 5px;
      background: var(--secondary);
    }

    .segment {
      min-height: 22px;
      border: 0;
      border-radius: 3px;
      color: var(--secondary-fg);
      background: transparent;
      cursor: pointer;
      font-weight: 600;
    }

    .segment.active {
      color: var(--button-fg);
      background: var(--button);
    }

    .top-language {
      min-width: 76px;
      flex: 0 0 auto;
      background: var(--secondary);
    }

    .top-language .segment {
      min-height: 20px;
      padding: 0 7px;
      font-size: 12px;
    }

    .roots-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .root-item {
      display: grid;
      grid-template-columns: 1fr 34px;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 4px 0 4px 8px;
      border: 1px solid var(--border);
      border-radius: 5px;
      background: var(--row);
    }

    .root-item .icon-btn {
      justify-self: start;
    }

    .root-path {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--mono);
      font-size: 11px;
    }

    .empty-line {
      min-height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 8px;
      border: 1px dashed var(--border);
      border-radius: 5px;
      color: var(--muted);
      text-align: center;
    }

    .empty-line.actionable {
      align-items: flex-start;
      justify-content: flex-start;
      text-align: left;
      line-height: 1.4;
    }

    .rule-summary {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 5px;
      background: var(--row);
    }

    .rule-summary-main {
      min-width: 0;
    }

    .rule-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rule-command {
      margin-top: 2px;
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .status.dirty {
      color: var(--danger);
    }

    .rule-editor {
      display: none;
      flex-direction: column;
      gap: 6px;
    }

    .rule-editor.editing {
      display: flex;
    }

    textarea {
      width: 100%;
      min-height: 84px;
      max-height: 220px;
      resize: vertical;
      border: 1px solid var(--input-border);
      border-radius: 5px;
      background: var(--input-bg);
      color: var(--input-fg);
      padding: 7px 8px;
      line-height: 1.45;
    }

    .rendered-preview {
      display: grid;
      gap: 4px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 5px;
      background: var(--row);
    }

    .rendered-preview-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
    }

    .rendered-preview code {
      display: block;
      color: var(--fg);
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.4;
      max-height: 72px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .edit-actions {
      display: none;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    .edit-actions.editing {
      display: grid;
    }

    .view-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 6px;
    }

    .view-actions.editing {
      display: none;
    }

    .advanced-tools summary {
      cursor: pointer;
      list-style: none;
    }

    .advanced-summary {
      grid-template-columns: 1fr auto auto;
    }

    .advanced-tools summary::-webkit-details-marker {
      display: none;
    }

    .advanced-summary::after {
      content: ">";
      color: var(--muted);
      font-size: 13px;
      transform: rotate(0deg);
      transition: transform .12s ease;
    }

    .advanced-tools[open] .advanced-summary::after {
      transform: rotate(90deg);
    }

    .advanced-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    @media (max-width: 340px) {
      .primary-card,
      .advanced-actions,
      .view-actions {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body class="${bodyThemeClass}">
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-title">JumpProto</div>
      </div>
      <div class="top-actions">
        <div class="segmented top-language" role="group" aria-label="${escapeHtml(strings.language)}" title="${escapeHtml(strings.language)}">
          <button class="segment ${language === 'zh' ? 'active' : ''}" data-language="zh" aria-pressed="${language === 'zh'}">中</button>
          <button class="segment ${language === 'en' ? 'active' : ''}" data-language="en" aria-pressed="${language === 'en'}">EN</button>
        </div>
        <div class="theme-control">
          <button id="themeToggle" class="icon-btn" title="${escapeHtml(strings.themeLabel)}: ${escapeHtml(this.getThemeLabel(strings, currentThemeMode))}" aria-label="${escapeHtml(strings.themeLabel)}" aria-haspopup="menu" aria-expanded="false">◐</button>
          <div id="themeMenu" class="theme-menu" role="menu">${themeOptions}</div>
        </div>
        <button id="feedbackToggle" class="icon-btn" title="${escapeHtml(strings.feedbackLabel)}" aria-label="${escapeHtml(strings.feedbackLabel)}">?</button>
      </div>
    </header>

    <section class="section">
      <div class="primary-card">
        <div class="primary-copy">
          <div class="primary-title">${escapeHtml(primaryActionTitle)}</div>
          <div class="primary-description">${escapeHtml(primaryActionDescription)}</div>
        </div>
        <button id="primaryAction" class="btn primary main-action" data-primary-action="${escapeHtml(primaryActionType)}"${primaryActionDisabled ? ' disabled' : ''}>${escapeHtml(primaryActionLabel)}</button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${escapeHtml(strings.protoRoots)}</h2>
        ${rootsLabel ? `<span class="section-meta">${escapeHtml(rootsLabel)}</span>` : ''}
      </div>
      <div class="section-body">
        <div class="roots-list">${rootItems}</div>
        <button id="addProtoRoot" class="btn primary compact">${escapeHtml(strings.addProtoRoot)}</button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${escapeHtml(strings.makeProtoRule)}</h2>
        <button id="openMakeProtoRuleHelp" class="icon-btn" title="${escapeHtml(strings.makeProtoRuleHelp)}" aria-label="${escapeHtml(strings.makeProtoRuleHelp)}">?</button>
      </div>
      <div class="section-body">
        <div class="rule-summary">
          <div class="rule-summary-main">
            <div id="rulePreview" class="rule-name" title="${escapeHtml(makeProtoCommand || strings.makeProtoRuleUnset)}">${escapeHtml(makeProtoCommand || strings.makeProtoRuleUnset)}</div>
            <div class="rule-command">${escapeHtml(makeProtoCommand ? strings.makeProtoRuleConfiguredDescription : strings.makeProtoRuleEmptyDescription)}</div>
          </div>
          <span id="ruleStatus" class="status">${escapeHtml(configuredLabel)}</span>
        </div>

        <div id="ruleEditor" class="rule-editor">
          <textarea id="makeProtoRuleInput" spellcheck="false" placeholder="${escapeHtml(strings.makeProtoRulePlaceholder)}">${escapeHtml(makeProtoCommand)}</textarea>
          <div class="rendered-preview">
            <div class="rendered-preview-label">${escapeHtml(strings.renderedCommandPreview)}</div>
            <code id="renderedMakeProtoPreview">${escapeHtml(renderedPreview)}</code>
          </div>
        </div>

        <div id="viewActions" class="view-actions">
          <button id="editMakeProtoRule" class="btn ${makeProtoCommand ? '' : 'primary'}">${escapeHtml(editRuleLabel)}</button>
        </div>

        <div id="editActions" class="edit-actions">
          <button id="cancelMakeProtoRule" class="btn">${escapeHtml(cancelLabel)}</button>
          <button id="saveMakeProtoRule" class="btn primary">${escapeHtml(quickSaveLabel)}</button>
        </div>
      </div>
    </section>

    <details class="section advanced-tools">
      <summary class="section-head advanced-summary">
        <h2 class="section-title">${escapeHtml(strings.diagnosticTools)}</h2>
        <span class="section-meta">${escapeHtml(strings.advanced)}</span>
      </summary>
      <div class="section-body">
        <div class="advanced-actions">
          <button id="testNavigation" class="btn compact">${escapeHtml(strings.testNavigation)}</button>
          <button id="diagnoseCurrentSymbol" class="btn compact">${escapeHtml(strings.diagnoseCurrentSymbol)}</button>
          <button id="testMakeProtoRule" class="btn compact">${escapeHtml(strings.testCommand)}</button>
          <button id="openMakeProtoRuleJson" class="btn compact">${escapeHtml(strings.openJson)}</button>
          <button id="openOutput" class="btn compact">${escapeHtml(strings.openOutput)}</button>
          <button id="clearCaches" class="btn compact">${escapeHtml(strings.clearCaches)}</button>
        </div>
      </div>
    </details>

  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const quotedTemplateValues = ${JSON.stringify(quotedTemplateValues ?? null)};
    const themeModes = ${JSON.stringify(THEME_MODES)};
    const themeMenu = document.getElementById('themeMenu');
    const themeToggle = document.getElementById('themeToggle');
    const feedbackToggle = document.getElementById('feedbackToggle');
    const renderTemplate = (template) => {
      const rule = template.trim();
      if (!rule) return ${JSON.stringify(strings.makeProtoRuleUnset)};
      if (!quotedTemplateValues) return ${JSON.stringify(preview.reason === 'unresolvedContext' ? strings.renderedCommandPreviewNeedContext : strings.renderedCommandPreviewNeedProto)};
      return Object.entries(quotedTemplateValues).reduce((out, [key, value]) => {
        return out.replaceAll('{' + key + '}', value);
      }, rule);
    };

    const input = document.getElementById('makeProtoRuleInput');
    const preview = document.getElementById('rulePreview');
    const renderedPreview = document.getElementById('renderedMakeProtoPreview');
    const editor = document.getElementById('ruleEditor');
    const viewActions = document.getElementById('viewActions');
    const editActions = document.getElementById('editActions');
    const editBtn = document.getElementById('editMakeProtoRule');
    const saveBtn = document.getElementById('saveMakeProtoRule');
    const cancelBtn = document.getElementById('cancelMakeProtoRule');
    const status = document.getElementById('ruleStatus');
    let isEditing = false;
    let initialValue = input.value.trim();

    const applyThemeMode = (themeMode) => {
      themeModes.forEach(mode => {
        if (mode !== 'system') document.body.classList.toggle('theme-' + mode, themeMode === mode);
      });
      document.querySelectorAll('[data-theme-option]').forEach(el => {
        const active = el.getAttribute('data-theme-option') === themeMode;
        el.classList.toggle('active', active);
        el.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    };

    const hideThemeMenu = () => {
      themeMenu?.classList.remove('visible');
      themeToggle?.setAttribute('aria-expanded', 'false');
    };

    const resizeInput = () => {
      input.style.height = '0px';
      input.style.height = Math.max(84, input.scrollHeight) + 'px';
    };

    const setEditing = (next) => {
      isEditing = next;
      editor.classList.toggle('editing', isEditing);
      viewActions.classList.toggle('editing', isEditing);
      editActions.classList.toggle('editing', isEditing);
      saveBtn.disabled = !isEditing || input.value.trim() === initialValue;
      if (isEditing) {
        resizeInput();
        input.focus();
      }
    };

    const updateDirty = () => {
      const trimmed = input.value.trim();
      const dirty = trimmed !== initialValue;
      status.textContent = dirty ? ${JSON.stringify(strings.unsaved)} : (trimmed ? ${JSON.stringify(strings.saved)} : ${JSON.stringify(strings.notConfigured)});
      status.classList.toggle('dirty', dirty);
      saveBtn.disabled = !isEditing || !dirty;
      preview.textContent = trimmed || ${JSON.stringify(strings.makeProtoRuleUnset)};
      preview.title = trimmed || ${JSON.stringify(strings.makeProtoRuleUnset)};
      renderedPreview.textContent = renderTemplate(input.value);
    };

    const cancelEdit = () => {
      input.value = initialValue;
      resizeInput();
      updateDirty();
      setEditing(false);
      input.blur();
    };

    const submitSave = () => {
      const trimmed = input.value.trim();
      if (trimmed !== initialValue) {
        vscode.postMessage({ type: 'saveMakeProtoRule', value: input.value });
      }
      initialValue = trimmed;
      updateDirty();
      setEditing(false);
      input.blur();
    };

    resizeInput();
    updateDirty();
    setEditing(false);

    input.addEventListener('input', () => {
      resizeInput();
      updateDirty();
    });

    input.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submitSave();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });

    editBtn?.addEventListener('click', () => setEditing(true));
    saveBtn?.addEventListener('click', submitSave);
    cancelBtn?.addEventListener('click', cancelEdit);

    themeToggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const visible = !themeMenu?.classList.contains('visible');
      themeMenu?.classList.toggle('visible', visible);
      themeToggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
    });

    themeMenu?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const option = target.closest('[data-theme-option]');
      if (!(option instanceof HTMLElement)) return;
      const themeMode = option.getAttribute('data-theme-option') || 'system';
      applyThemeMode(themeMode);
      vscode.postMessage({ type: 'setThemeMode', themeMode });
      hideThemeMenu();
    });

    feedbackToggle?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openFeedback' });
      hideThemeMenu();
    });

    document.getElementById('testMakeProtoRule')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'testMakeProtoRule', value: isEditing ? input.value : initialValue });
    });

    document.getElementById('openMakeProtoRuleJson')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openMakeProtoRuleJson' });
    });

    document.getElementById('openMakeProtoRuleHelp')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openMakeProtoRuleHelp' });
    });

    document.getElementById('primaryAction')?.addEventListener('click', (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      const type = target.getAttribute('data-primary-action');
      if (type === 'goToProtoDefinition' || type === 'compileCurrentProto' || type === 'testNavigation') {
        vscode.postMessage({ type });
      } else if (type === 'configureMakeProtoRule') {
        setEditing(true);
        document.getElementById('ruleEditor')?.scrollIntoView({ block: 'nearest' });
      }
    });

    document.getElementById('testNavigation')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'testNavigation' });
    });

    document.getElementById('openOutput')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openOutput' });
    });

    document.getElementById('clearCaches')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearCaches' });
    });

    document.getElementById('compileCurrentProto')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'compileCurrentProto' });
    });

    document.getElementById('diagnoseCurrentSymbol')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'diagnoseCurrentSymbol' });
    });

    document.getElementById('addProtoRoot')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'addProtoRoot' });
    });

    document.querySelectorAll('[data-language]').forEach(el => {
      el.addEventListener('click', () => {
        const value = el.getAttribute('data-language');
        if (value === 'zh' || value === 'en') {
          vscode.postMessage({ type: 'setLanguage', value });
        }
      });
    });

    document.querySelectorAll('[data-action="remove-root"]').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'removeProtoRoot', rootPath: el.getAttribute('data-root') || '' });
      });
    });

    document.addEventListener('click', hideThemeMenu);
  </script>
</body>
</html>`;
  }

  private renderLoadingHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
  </style>
</head>
<body>JumpProto</body>
</html>`;
  }

  private getThemeMode(): ThemeMode {
    const stored = this.globalState.get<unknown>(THEME_STATE_KEY);
    return isThemeMode(stored) ? stored : 'system';
  }

  private renderErrorHtml(webview: vscode.Webview, message: string): string {
    const nonce = getNonce();
    const strings = getStrings();
    return `<!DOCTYPE html>
<html lang="${getUiLanguage()}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.4;
    }
    .error {
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 6px;
      padding: 10px;
      background: var(--vscode-inputValidation-errorBackground, transparent);
    }
    .title {
      font-weight: 700;
      margin-bottom: 6px;
    }
    .message {
      color: var(--vscode-descriptionForeground);
      word-break: break-word;
    }
    button {
      margin-top: 10px;
      min-height: 28px;
      border: 1px solid var(--vscode-button-background);
      border-radius: 5px;
      padding: 4px 10px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="error">
    <div class="title">JumpProto</div>
    <div class="message">${escapeHtml(message || strings.resolveFailed)}</div>
    <button id="openOutputFallback">${escapeHtml(strings.openOutput)}</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('openOutputFallback')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openOutput' });
    });
  </script>
</body>
</html>`;
  }

  private getThemeLabel(strings: ReturnType<typeof getStrings>, mode: ThemeMode): string {
    switch (mode) {
      case 'dark':
        return strings.themeDark;
      case 'light':
        return strings.themeLight;
      case 'aurora':
        return strings.themeAurora;
      case 'coffee':
        return strings.themeCoffee;
      case 'sunlit':
        return strings.themeSunlit;
      case 'clean':
        return strings.themeClean;
      case 'purple':
        return strings.themePurple;
      case 'contrast':
        return strings.themeContrast;
      case 'system':
      default:
        return strings.themeSystem;
    }
  }
}
