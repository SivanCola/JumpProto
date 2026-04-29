// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';

import { getProtoRootsLabel, renderProtoRootItems } from './viewHtml';

test('getProtoRootsLabel hides zero root count and renders positive counts', () => {
  assert.equal(getProtoRootsLabel(0, 'zh'), '');
  assert.equal(getProtoRootsLabel(1, 'zh'), '1 个根目录');
  assert.equal(getProtoRootsLabel(2, 'en'), '2 roots');
});

test('renderProtoRootItems renders empty, single, and multiple root states', () => {
  assert.equal(
    renderProtoRootItems([], '未配置 Proto 根目录', '移除'),
    '<div class="empty-line actionable">未配置 Proto 根目录</div>'
  );

  const single = renderProtoRootItems(['/abs/project/proto_src'], 'empty', 'remove', () => '$WORKSPACE/proto_src');
  assert.match(single, />\$WORKSPACE\/proto_src</);
  assert.match(single, /data-root="\/abs\/project\/proto_src"/);

  const multiple = renderProtoRootItems(['/abs/a', '/abs/b'], 'empty', 'remove', root => root.replace('/abs', '~'));
  assert.equal((multiple.match(/class="root-item"/g) ?? []).length, 2);
  assert.match(multiple, />~\/a</);
  assert.match(multiple, />~\/b</);
});
