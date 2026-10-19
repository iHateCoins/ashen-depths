import type { LootItem } from './ExpeditionLoot';

export const STASH_STORAGE_KEY = 'ashen-depths-stash-v1';
export const STASH_CAPACITY = 500;

export interface StashStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StashSnapshot {
  schema: 1;
  revision: number;
  completed: number;
  items: LootItem[];
}

export type StashStatus = 'ready' | 'unavailable' | 'corrupt';
export interface StashOutcome {
  ok: boolean;
  saved: number;
  reason?: 'storage-unavailable' | 'storage-corrupt' | 'storage-full' | 'invalid-items';
}

function freshSnapshot(): StashSnapshot {
  return { schema: 1, revision: 0, completed: 0, items: [] };
}

function validItem(value: unknown): value is LootItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<LootItem>;
  if (typeof item.id !== 'string' || !item.id || item.id.length > 160 ||
      typeof item.name !== 'string' || !item.name || item.name.length > 140 ||
      typeof item.baseName !== 'string' || !item.baseName || item.baseName.length > 140 ||
      !(['common','magic','rare'] as unknown[]).includes(item.rarity) ||
      !(['weapon','armor','charm'] as unknown[]).includes(item.slot) ||
      !Number.isInteger(item.itemLevel) || item.itemLevel! < 1 || item.itemLevel! > 1000 ||
      !Array.isArray(item.affixes) || item.affixes.length > 8) return false;

  return item.affixes.every(affix =>
    affix && typeof affix === 'object' &&
    ['sharp','sturdy','ember','vital'].includes(affix.id) &&
    typeof affix.label === 'string' && affix.label.length <= 120 &&
    Number.isFinite(affix.value) && affix.value >= 0 && affix.value <= 10000
  );
}

function parseSnapshot(raw: string): StashSnapshot | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const data = value as Partial<StashSnapshot>;
    if (data.schema !== 1 || !Number.isSafeInteger(data.revision) || data.revision! < 0 ||
        !Number.isSafeInteger(data.completed) || data.completed! < 0 ||
        !Array.isArray(data.items) || data.items.length > STASH_CAPACITY ||
        !data.items.every(validItem)) return null;
    const ids = data.items.map(item => item.id);
    if (new Set(ids).size !== ids.length) return null;
    return data as StashSnapshot;
  } catch {
    return null;
  }
}

function tryStorage(): StashStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cloneItem(item: LootItem): LootItem {
  return { ...item, affixes: item.affixes.map(affix => ({ ...affix })) };
}

/**
 * Small, versioned on-device stash. A single atomic localStorage write moves
 * ownership; failing writes must NEVER claim gear is secured or withdrawn.
 * Invalid existing saves are preserved, not silently overwritten.
 */
export class SecuredStash {
  private data = freshSnapshot();
  private state: StashStatus = 'ready';
  private lastStored: string | null = null;

  constructor(private readonly storage: StashStorage | null = tryStorage()) {
    if (!this.storage) {
      this.state = 'unavailable';
      return;
    }
    try {
      const raw = this.storage.getItem(STASH_STORAGE_KEY);
      this.lastStored = raw;
      if (raw !== null) {
        const loaded = parseSnapshot(raw);
        if (!loaded) {
          this.state = 'corrupt';
          return;
        }
        this.data = loaded;
      }
    } catch {
      this.state = 'unavailable';
    }
  }

  get status(): StashStatus { return this.state; }
  get count(): number { return this.data.items.length; }
  get completedExpeditions(): number { return this.data.completed; }
  get items(): readonly LootItem[] { return this.data.items.map(cloneItem); }

  /** A successful Warden exit secures carried AND worn gear. */
  secureExpedition(items: readonly LootItem[]): StashOutcome {
    if (this.state !== 'ready') return this.failure();
    if (!items.every(validItem) || new Set(items.map(item => item.id)).size !== items.length) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    if (this.data.items.length + items.length > STASH_CAPACITY) {
      return { ok: false, saved: 0, reason: 'storage-full' };
    }
    const revision = this.data.revision + 1;
    if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(this.data.completed + 1)) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    const secured = items.map((item, index) => ({
      ...cloneItem(item),
      // Multiple successful expeditions with a fixed ?seed must never produce
      // indistinguishable item IDs or allow an item to be claimed twice.
      id: `secure-${revision}-${index}`,
    }));
    const next: StashSnapshot = {
      schema: 1,
      revision,
      completed: this.data.completed + 1,
      items: [...this.data.items, ...secured],
    };
    if (!this.commit(next)) return this.failure();
    return { ok: true, saved: secured.length };
  }

  /** Remove a secured item BEFORE placing it in the risky expedition bag. */
  withdraw(id: string): LootItem | null {
    if (this.state !== 'ready') return null;
    const index = this.data.items.findIndex(item => item.id === id);
    if (index < 0) return null;
    const withdrawn = cloneItem(this.data.items[index]);
    const next = { ...this.data, revision: this.data.revision + 1,
      items: this.data.items.filter(item => item.id !== id) };
    if (!this.commit(next)) return null;
    return withdrawn;
  }

  private commit(next: StashSnapshot): boolean {
    if (this.state !== 'ready' || !this.storage) return false;
    try {
      // Avoid overwriting a more recent save from another open game tab.
      if (this.storage.getItem(STASH_STORAGE_KEY) !== this.lastStored) return false;
      const serialized = JSON.stringify(next);
      this.storage.setItem(STASH_STORAGE_KEY, serialized);
      this.lastStored = serialized;
      this.data = next;
      return true;
    } catch {
      // An unavailable or quota-exceeded store must never report success.
      return false;
    }
  }

  private failure(): StashOutcome {
    return {
      ok: false, saved: 0,
      reason: this.state === 'corrupt' ? 'storage-corrupt' : 'storage-unavailable',
    };
  }
}
