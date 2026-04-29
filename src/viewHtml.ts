// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import { escapeHtml } from './html';

export type ViewLanguage = 'zh' | 'en';

export function getProtoRootsLabel(count: number, language: ViewLanguage): string {
  if (count <= 0) return '';
  return language === 'zh' ? `${count} 个根目录` : `${count} roots`;
}

export function renderProtoRootItems(
  protoRoots: string[],
  emptyDescription: string,
  removeLabel: string,
  displayPath: (rootPath: string) => string = rootPath => rootPath
): string {
  if (protoRoots.length === 0) {
    return `<div class="empty-line actionable">${escapeHtml(emptyDescription)}</div>`;
  }

  return protoRoots.map(rootPath => {
    const visiblePath = displayPath(rootPath);
    return `
        <div class="root-item">
          <span class="root-path" title="${escapeHtml(visiblePath)}">${escapeHtml(visiblePath)}</span>
          <button class="icon-btn danger" data-action="remove-root" data-root="${escapeHtml(rootPath)}" title="${escapeHtml(removeLabel)}" aria-label="${escapeHtml(removeLabel)}">x</button>
        </div>
      `;
  }).join('');
}
