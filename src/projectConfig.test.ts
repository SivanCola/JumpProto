// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProjectConfig } from './projectConfig';

test('normalizeProjectConfig accepts valid .jumpproto fields', () => {
  const warnings: string[] = [];
  assert.deepEqual(
    normalizeProjectConfig({
      protoRoots: ['proto_src'],
      searchInWorkspace: false,
      makeProtoCommand: 'make proto',
      exclude: ['**/vendor/**']
    }, message => warnings.push(message)),
    {
      protoRoots: ['proto_src'],
      searchInWorkspace: false,
      makeProtoCommand: 'make proto',
      exclude: ['**/vendor/**']
    }
  );
  assert.deepEqual(warnings, []);
});

test('normalizeProjectConfig ignores invalid .jumpproto fields', () => {
  const warnings: string[] = [];
  assert.deepEqual(
    normalizeProjectConfig({
      protoRoots: ['proto_src', 1],
      searchInWorkspace: 'true',
      makeProtoCommand: ['make proto'],
      exclude: [false]
    }, message => warnings.push(message)),
    {}
  );
  assert.equal(warnings.length, 4);
});
