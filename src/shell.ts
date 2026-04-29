// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

export type ShellMode = 'syntax' | 'execute';

export type ShellInvocation = {
  executable: string;
  args: string[];
  supportsSyntaxCheck: boolean;
};

export function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return `"${value
      .replace(/([&|<>^"])/g, '^$1')
      .replace(/%/g, '%%')}"`;
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function resolveShellInvocation(
  command: string,
  mode: ShellMode,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): ShellInvocation {
  if (platform === 'win32') {
    const executable = env.ComSpec || env.COMSPEC || 'cmd.exe';
    if (mode === 'syntax') {
      return { executable, args: [], supportsSyntaxCheck: false };
    }
    return { executable, args: ['/d', '/s', '/c', command], supportsSyntaxCheck: true };
  }

  const executable = env.SHELL?.trim() || '/bin/sh';
  return {
    executable,
    args: mode === 'syntax' ? ['-n', '-c', command] : ['-c', command],
    supportsSyntaxCheck: true
  };
}
