// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';

import { redactMessagePathsForOutput } from './redaction';

test('redactMessagePathsForOutput redacts home paths in compile errors', () => {
  assert.equal(
    redactMessagePathsForOutput("Command failed in /home/dev/project/proto_src: open '/home/dev/project/foo.proto'", '/home/dev'),
    "Command failed in ~/project/proto_src: open '~/project/foo.proto'"
  );
});
