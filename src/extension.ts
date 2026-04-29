// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

import { activate as activateExtension } from './commands';

export function activate(context: vscode.ExtensionContext) {
  activateExtension(context);
}

export function deactivate() {}
