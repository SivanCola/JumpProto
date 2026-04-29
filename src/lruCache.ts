// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

export const MIB = 1024 * 1024;

export function estimateStringBytes(text: string): number {
  return text.length * 2;
}

type LruCacheOptions<K, V> = {
  maxEntries?: number;
  maxSize?: number;
  sizeOf?: (value: V, key: K) => number;
};

type LruEntry<V> = {
  value: V;
  size: number;
};

export class LruCache<K, V> {
  private readonly entries = new Map<K, LruEntry<V>>();
  private readonly maxEntries: number;
  private readonly maxSize: number;
  private readonly sizeOf: (value: V, key: K) => number;
  private currentSize = 0;

  constructor(options: LruCacheOptions<K, V>) {
    this.maxEntries = options.maxEntries ?? Number.POSITIVE_INFINITY;
    this.maxSize = options.maxSize ?? Number.POSITIVE_INFINITY;
    this.sizeOf = options.sizeOf ?? (() => 1);
  }

  get size(): number {
    return this.entries.size;
  }

  get totalSize(): number {
    return this.currentSize;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const old = this.entries.get(key);
    if (old) {
      this.currentSize -= old.size;
      this.entries.delete(key);
    }

    const size = Math.max(0, Math.ceil(this.sizeOf(value, key)));
    this.entries.set(key, { value, size });
    this.currentSize += size;
    this.trim();
  }

  clear(): void {
    this.entries.clear();
    this.currentSize = 0;
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries || this.currentSize > this.maxSize) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;

      const entry = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      if (entry) this.currentSize -= entry.size;
    }
  }
}
