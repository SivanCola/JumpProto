// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

import {
  getMakeProtoTemplateValues,
  previewMakeProtoCommand,
  resolveProtoCompileContext
} from './compile';
import { getStrings, getUiLanguage } from './i18n';

function getConfig() {
  const config = vscode.workspace.getConfiguration('protoJump');
  return {
    protoRoots: (config.get<string[]>('protoRoots') ?? []).filter(Boolean),
    searchInWorkspace: config.get<boolean>('searchInWorkspace') ?? true,
    makeProtoCommand: (config.get<string>('makeProtoCommand') ?? '').trim()
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type ViewMessage =
  | { type: 'addProtoRoot' }
  | { type: 'removeProtoRoot'; rootPath: string }
  | { type: 'toggleSearchInWorkspace' }
  | { type: 'selectLanguage' }
  | { type: 'testNavigation' }
  | { type: 'openOutput' }
  | { type: 'compileCurrentProto' }
  | { type: 'diagnoseCurrentSymbol' }
  | { type: 'openMakeProtoRuleHelp' }
  | { type: 'openMakeProtoRuleJson' }
  | { type: 'testMakeProtoRule'; value: string }
  | { type: 'saveMakeProtoRule'; value: string };

export class ProtoJumpViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  refresh() {
    if (!this.view) return;
    this.view.webview.html = this.renderHtml(this.view.webview);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };
    webviewView.webview.onDidReceiveMessage((message: ViewMessage) => {
      switch (message.type) {
        case 'addProtoRoot':
          void vscode.commands.executeCommand('protoJump.addProtoRoot');
          break;
        case 'removeProtoRoot':
          void vscode.commands.executeCommand('protoJump.removeProtoRoot', message.rootPath);
          break;
        case 'toggleSearchInWorkspace':
          void vscode.commands.executeCommand('protoJump.toggleSearchInWorkspace');
          break;
        case 'selectLanguage':
          void vscode.commands.executeCommand('protoJump.selectLanguage');
          break;
        case 'testNavigation':
          void vscode.commands.executeCommand('protoJump.testNavigation');
          break;
        case 'openOutput':
          void vscode.commands.executeCommand('protoJump.openOutput');
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
    webviewView.webview.html = this.renderHtml(webviewView.webview);
  }

  private renderHtml(webview: vscode.Webview): string {
    const strings = getStrings();
    const language = getUiLanguage();
    const { protoRoots, searchInWorkspace, makeProtoCommand } = getConfig();
    const activeDoc = vscode.window.activeTextEditor?.document;
    const compileCtx = activeDoc ? resolveProtoCompileContext(activeDoc) : undefined;
    const templateValues = compileCtx ? getMakeProtoTemplateValues(compileCtx) : undefined;
    const preview = previewMakeProtoCommand(makeProtoCommand, activeDoc);
    const renderedPreview = preview.rendered
      ?? (preview.reason === 'empty'
        ? strings.makeProtoRuleUnset
        : preview.reason === 'unresolvedContext'
          ? strings.renderedCommandPreviewNeedContext
          : strings.renderedCommandPreviewNeedProto);
    const nonce = String(Date.now());
    const removeLabel = language === 'zh' ? '移除' : 'Remove';

    const rootItems = protoRoots.length > 0
      ? protoRoots.map(rootPath => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title" title="${escapeHtml(rootPath)}">${escapeHtml(rootPath)}</div>
          </div>
          <button class="button ghost danger" data-action="remove-root" data-root="${escapeHtml(rootPath)}">${escapeHtml(removeLabel)}</button>
        </div>
      `).join('')
      : `<div class="empty">${escapeHtml(strings.noProtoRoots)} · ${escapeHtml(strings.notConfigured)}</div>`;

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
      --muted: var(--vscode-descriptionForeground, var(--vscode-foreground));
      --panel: color-mix(in srgb, var(--vscode-editorWidget-background, var(--bg)) 92%, transparent);
      --panel-strong: color-mix(in srgb, var(--vscode-editorWidget-background, var(--bg)) 85%, var(--vscode-editor-background, #000) 15%);
      --card: color-mix(in srgb, var(--panel) 90%, white 10%);
      --line: var(--vscode-editorWidget-border, rgba(127,127,127,.35));
      --line-soft: color-mix(in srgb, var(--line) 55%, transparent);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border, var(--line));
      --danger: var(--vscode-errorForeground, #f48771);
      --focus: var(--vscode-focusBorder, var(--accent));
      --mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 12px;
      color: var(--fg);
      background:
        radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 55%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg) 90%, black 10%), var(--bg));
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.45;
    }

    .shell {
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: fade-in .18s ease-out;
    }

    .hero {
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      padding: 12px;
      background: linear-gradient(160deg,
        color-mix(in srgb, var(--panel-strong) 88%, var(--accent) 12%),
        color-mix(in srgb, var(--panel) 94%, black 6%) 60%,
        var(--panel));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
    }

    .hero-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: .2px;
    }

    .hero-subtitle {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
    }

    .panel {
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 95%, white 5%), var(--panel));
      overflow: hidden;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line-soft);
      background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 84%, white 16%), color-mix(in srgb, var(--panel) 94%, white 6%));
    }

    .panel-title {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      opacity: .95;
    }
    .lang-en .panel-title {
      text-transform: uppercase;
      letter-spacing: .7px;
    }
    .lang-zh .panel-title {
      text-transform: none;
      letter-spacing: .1px;
    }

    .panel-body {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 10px;
      border: 1px solid var(--line-soft);
      border-radius: 10px;
      background: color-mix(in srgb, var(--card) 92%, transparent);
    }

    .row-label {
      font-size: 12px;
      color: color-mix(in srgb, var(--fg) 90%, var(--muted) 10%);
      font-weight: 550;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .rule-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }

    .rule-actions .button {
      width: 100%;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .button {
      border: 1px solid transparent;
      border-radius: 9px;
      padding: 7px 11px;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all .14s ease;
      color: var(--accent-fg);
      background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 88%, white 12%), var(--accent));
    }

    .button:hover {
      filter: brightness(1.05);
    }

    .button:focus-visible {
      outline: 1px solid var(--focus);
      outline-offset: 1px;
    }

    .button:disabled {
      opacity: .55;
      cursor: not-allowed;
      filter: none;
    }

    .button.ghost {
      color: var(--fg);
      background: color-mix(in srgb, var(--card) 80%, transparent);
      border-color: var(--line);
    }

    .button.danger {
      color: var(--danger);
    }

    .icon-button {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
      flex-shrink: 0;
    }

    .editor-shell {
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      padding: 10px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--panel-strong) 95%, transparent), color-mix(in srgb, var(--panel) 96%, transparent));
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 10%, transparent);
    }

    .editor-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      word-break: break-word;
    }

    .status {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 11px;
      color: var(--muted);
      background: color-mix(in srgb, var(--panel) 80%, transparent);
    }

    .status.dirty {
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 50%, transparent);
      background: color-mix(in srgb, var(--danger) 10%, transparent);
    }

    textarea {
      width: 100%;
      min-height: 124px;
      resize: none;
      border-radius: 10px;
      border: 1px solid var(--input-border);
      background: linear-gradient(180deg, color-mix(in srgb, var(--input-bg) 92%, white 8%), var(--input-bg));
      color: var(--input-fg);
      padding: 11px 12px;
      font: inherit;
      line-height: 1.55;
      transition: border-color .14s ease, box-shadow .14s ease;
    }

    textarea:focus {
      border-color: var(--focus);
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 24%, transparent);
    }

    .editor-shell.collapsed textarea {
      display: none;
    }

    .rule-preview {
      display: none;
      padding: 11px 12px;
      border-radius: 10px;
      border: 1px solid var(--input-border);
      background: color-mix(in srgb, var(--input-bg) 88%, transparent);
      color: var(--input-fg);
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .editor-shell.collapsed .rule-preview {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4;
      overflow: hidden;
    }

    .rendered-preview {
      padding: 10px 11px;
      border-radius: 10px;
      border: 1px solid var(--line-soft);
      background: color-mix(in srgb, var(--panel) 84%, transparent);
    }

    .rendered-preview-label {
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 650;
    }

    .rendered-preview code {
      display: block;
      color: var(--input-fg);
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .list-item {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      border: 1px solid var(--line-soft);
      border-radius: 10px;
      padding: 8px 9px;
      background: color-mix(in srgb, var(--card) 92%, transparent);
    }

    .list-item-main {
      min-width: 0;
    }

    .list-item-title {
      font-size: 12px;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty {
      border: 1px dashed var(--line);
      border-radius: 10px;
      padding: 12px;
      text-align: center;
      color: var(--muted);
      font-size: 12px;
      background: color-mix(in srgb, var(--panel) 82%, transparent);
    }

    .kbd {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--muted);
      border: 1px solid var(--line-soft);
      border-radius: 6px;
      padding: 1px 5px;
      background: color-mix(in srgb, var(--panel) 86%, transparent);
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 760px) {
      .rule-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 430px) {
      .rule-actions {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1 class="hero-title">JumpProto</h1>
      <div class="hero-subtitle">${escapeHtml(strings.heroSubtitle)}</div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">${escapeHtml(strings.config)}</h2>
      </div>
      <div class="panel-body">
        <div class="row">
          <span class="row-label">${escapeHtml(strings.searchInWorkspace)}</span>
          <button id="toggleSearchInWorkspace" class="button ghost">${escapeHtml(searchInWorkspace ? strings.on : strings.off)}</button>
        </div>
        <div class="row">
          <span class="row-label">${escapeHtml(strings.language)}</span>
          <button id="selectLanguage" class="button ghost">${escapeHtml(language === 'zh' ? strings.languageChinese : strings.languageEnglish)}</button>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">${escapeHtml(strings.actions)}</h2>
      </div>
      <div class="panel-body">
        <div class="button-row rule-actions">
          <button id="testNavigation" class="button">${escapeHtml(strings.testNavigation)}</button>
          <button id="openOutput" class="button ghost">${escapeHtml(strings.openOutput)}</button>
          <button id="compileCurrentProto" class="button ghost">${escapeHtml(strings.compileCurrentProto)}</button>
          <button id="diagnoseCurrentSymbol" class="button ghost">${escapeHtml(strings.diagnoseCurrentSymbol)}</button>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">${escapeHtml(strings.protoRoots)}</h2>
      </div>
      <div class="panel-body">
        ${rootItems}
        <div class="button-row">
          <button id="addProtoRoot" class="button">${escapeHtml(strings.addProtoRoot)}</button>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">${escapeHtml(strings.makeProtoRule)}</h2>
        <button id="openMakeProtoRuleHelp" class="button ghost icon-button" title="${escapeHtml(strings.makeProtoRuleHelp)}" aria-label="${escapeHtml(strings.makeProtoRuleHelp)}">?</button>
      </div>
      <div class="panel-body">
        <div class="editor-shell">
          <div class="editor-head">
            <span class="hint">${escapeHtml(strings.makeProtoRule)}</span>
            <span id="ruleStatus" class="status">${escapeHtml(strings.saved)}</span>
          </div>
          <div id="rulePreview" class="rule-preview">${escapeHtml(makeProtoCommand || strings.makeProtoRuleUnset)}</div>
          <textarea id="makeProtoRuleInput" spellcheck="false" placeholder="${escapeHtml(strings.makeProtoRulePlaceholder)}">${escapeHtml(makeProtoCommand)}</textarea>
        </div>

        <div class="button-row rule-actions">
          <button id="editMakeProtoRule" class="button ghost">${escapeHtml(strings.edit)}</button>
          <button id="saveMakeProtoRule" class="button">${escapeHtml(strings.save)}</button>
          <button id="testMakeProtoRule" class="button ghost">${escapeHtml(strings.testCommand)}</button>
          <button id="openMakeProtoRuleJson" class="button ghost">${escapeHtml(strings.openJson)}</button>
        </div>

        <div class="rendered-preview">
          <div class="rendered-preview-label">${escapeHtml(strings.renderedCommandPreview)}</div>
          <code id="renderedMakeProtoPreview">${escapeHtml(renderedPreview)}</code>
        </div>

        <div class="hint"><span class="kbd">Ctrl/Cmd + Enter</span> ${language === 'zh' ? '快速保存' : 'Quick Save'} · <span class="kbd">Esc</span> ${language === 'zh' ? '取消编辑' : 'Cancel Edit'}</div>
      </div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const templateValues = ${JSON.stringify(templateValues ?? null)};
    const shellQuote = (value) => "'" + String(value).replaceAll("'", "'\\\\''") + "'";
    const renderTemplate = (template) => {
      const rule = template.trim();
      if (!rule) return ${JSON.stringify(strings.makeProtoRuleUnset)};
      if (!templateValues) return ${JSON.stringify(preview.reason === 'unresolvedContext' ? strings.renderedCommandPreviewNeedContext : strings.renderedCommandPreviewNeedProto)};
      return Object.entries(templateValues).reduce((out, [key, value]) => {
        return out.replaceAll('{' + key + '}', shellQuote(value));
      }, rule);
    };
    const input = document.getElementById('makeProtoRuleInput');
    const preview = document.getElementById('rulePreview');
    const renderedPreview = document.getElementById('renderedMakeProtoPreview');
    const shell = document.querySelector('.editor-shell');
    const editBtn = document.getElementById('editMakeProtoRule');
    const saveBtn = document.getElementById('saveMakeProtoRule');
    const status = document.getElementById('ruleStatus');
    let isEditing = input.value.trim().length === 0;
    let initialValue = input.value.trim();

    const resizeInput = () => {
      input.style.height = '0px';
      input.style.height = Math.max(124, input.scrollHeight) + 'px';
    };

    const updateMode = () => {
      shell.classList.toggle('collapsed', !isEditing);
      editBtn.disabled = isEditing;
      saveBtn.disabled = !isEditing;
      if (isEditing) {
        input.focus();
      }
    };

    const updateDirty = () => {
      const dirty = input.value.trim() !== initialValue;
      status.textContent = dirty ? ${JSON.stringify(strings.unsaved)} : ${JSON.stringify(strings.saved)};
      status.classList.toggle('dirty', dirty);
      saveBtn.disabled = !isEditing;
      preview.textContent = input.value.trim() || ${JSON.stringify(strings.makeProtoRuleUnset)};
      renderedPreview.textContent = renderTemplate(input.value);
    };

    const submitSave = () => {
      if (input.value.trim() !== initialValue) {
        vscode.postMessage({ type: 'saveMakeProtoRule', value: input.value });
      }
      initialValue = input.value.trim();
      isEditing = false;
      updateDirty();
      updateMode();
      input.blur();
    };

    resizeInput();
    updateDirty();
    updateMode();

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
        input.value = initialValue;
        isEditing = false;
        resizeInput();
        updateDirty();
        updateMode();
      }
    });

    editBtn?.addEventListener('click', () => {
      isEditing = true;
      updateMode();
    });

    saveBtn?.addEventListener('click', submitSave);

    document.getElementById('testMakeProtoRule')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'testMakeProtoRule', value: isEditing ? input.value : initialValue });
    });

    document.getElementById('openMakeProtoRuleJson')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openMakeProtoRuleJson' });
    });

    document.getElementById('openMakeProtoRuleHelp')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openMakeProtoRuleHelp' });
    });

    document.getElementById('testNavigation')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'testNavigation' });
    });

    document.getElementById('openOutput')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openOutput' });
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

    document.getElementById('toggleSearchInWorkspace')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleSearchInWorkspace' });
    });

    document.getElementById('selectLanguage')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'selectLanguage' });
    });

    document.querySelectorAll('[data-action="remove-root"]').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'removeProtoRoot', rootPath: el.getAttribute('data-root') || '' });
      });
    });
  </script>
</body>
</html>`;
  }
}
