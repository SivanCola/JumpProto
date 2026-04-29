// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';

import { toGoExportedName } from './naming';

test('toGoExportedName follows protoc-style field name boundaries', () => {
  assert.equal(toGoExportedName('user_name'), 'UserName');
  assert.equal(toGoExportedName('foo_1'), 'Foo_1');
  assert.equal(toGoExportedName('foo_Bar'), 'Foo_Bar');
  assert.equal(toGoExportedName('foo__bar'), 'Foo_Bar');
  assert.equal(toGoExportedName('_internal_name'), 'XInternalName');
});
