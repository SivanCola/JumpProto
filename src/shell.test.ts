// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveShellInvocation, shellQuote } from './shell';

test('resolveShellInvocation uses POSIX shell from environment', () => {
  assert.deepEqual(
    resolveShellInvocation('make proto', 'syntax', { SHELL: '/bin/bash' }, 'darwin'),
    { executable: '/bin/bash', args: ['-n', '-c', 'make proto'], supportsSyntaxCheck: true }
  );
  assert.deepEqual(
    resolveShellInvocation('make proto', 'execute', { SHELL: '/bin/bash' }, 'linux'),
    { executable: '/bin/bash', args: ['-c', 'make proto'], supportsSyntaxCheck: true }
  );
});

test('resolveShellInvocation uses COMSPEC on Windows', () => {
  assert.deepEqual(
    resolveShellInvocation('make proto', 'execute', { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' }, 'win32'),
    {
      executable: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'make proto'],
      supportsSyntaxCheck: true
    }
  );
  assert.equal(resolveShellInvocation('make proto', 'syntax', {}, 'win32').supportsSyntaxCheck, false);
});

test('shellQuote quotes values for POSIX and Windows shells', () => {
  assert.equal(shellQuote("a b's", 'linux'), "'a b'\\''s'");
  assert.equal(shellQuote('a b&c', 'win32'), '"a b^&c"');
});
