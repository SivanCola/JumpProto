// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';

import { LruCache } from './lruCache';

test('LruCache evicts the least recently used entry by count', () => {
  const cache = new LruCache<string, number>({ maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);

  assert.equal(cache.get('a'), 1);

  cache.set('c', 3);

  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('LruCache evicts entries by estimated size', () => {
  const cache = new LruCache<string, string>({
    maxSize: 5,
    sizeOf: value => value.length
  });

  cache.set('a', '12');
  cache.set('b', '345');
  assert.equal(cache.totalSize, 5);

  cache.set('c', '67');

  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), '345');
  assert.equal(cache.get('c'), '67');
  assert.equal(cache.totalSize, 5);
});

test('LruCache does not retain a single oversized entry', () => {
  const cache = new LruCache<string, string>({
    maxSize: 5,
    sizeOf: value => value.length
  });

  cache.set('big', '123456');

  assert.equal(cache.get('big'), undefined);
  assert.equal(cache.size, 0);
  assert.equal(cache.totalSize, 0);
});
