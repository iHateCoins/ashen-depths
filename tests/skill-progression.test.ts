import { describe, expect, it } from 'vitest';
import { SkillProgression } from '../src/game/combat/SkillProgression';
import { SecuredStash, STASH_STORAGE_KEY, type StashStorage } from '../src/game/loot/SecuredStash';

class Storage implements StashStorage {
  readonly data = new Map<string, string>();
  broken = false;
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.broken) throw new Error('quota');
    this.data.set(key, value);
  }
}

describe('skill acquisition and secure extraction', () => {
  it('starts with only Cinder Burst learned and never awards on discovery alone', () => {
    const progression = new SkillProgression();
    expect(progression.canUseSkill('cinder-burst')).toBe(true);
    expect(progression.canUseSkill('frost-bloom')).toBe(false);
    expect(progression.canUseSupport('focused-power')).toBe(false);
    expect(progression.offer('cache')).toBe(true);
    expect(progression.offer('cache')).toBe(false);
    expect(progression.pendingUnlocks).toEqual([]);
    expect(progression.choicesRemaining).toEqual(['cache']);
  });

  it('each source yields one distinct choice with validation and no duplicates', () => {
    const progression = new SkillProgression();
    expect(progression.choose('cache', 'skill:frost-bloom')).toBe(false);
    progression.offer('cache');
    expect(progression.choose('cache', 'invalid')).toBe(false);
    expect(progression.choose('cache', 'skill:frost-bloom')).toBe(true);
    expect(progression.choose('cache', 'skill:ash-lance')).toBe(false);
    expect(progression.offer('warden')).toBe(true);
    expect(progression.choose('warden', 'skill:frost-bloom')).toBe(false);
    expect(progression.choose('warden', 'support:focused-power')).toBe(true);
    expect(progression.pendingUnlocks).toEqual(['skill:frost-bloom', 'support:focused-power']);
    expect(progression.canUseSkill('frost-bloom')).toBe(false);
  });

  it('secures discoveries with the same atomic save as gear', () => {
    const storage = new Storage();
    const stash = new SecuredStash(storage);
    const run = new SkillProgression(stash.unlockedIds);
    run.offer('cache');
    run.choose('cache', 'skill:frost-bloom');
    storage.broken = true;
    expect(stash.secureExpedition([], run.pendingUnlocks)).toMatchObject({ ok: false });
    expect(stash.unlockedIds).toEqual([]);
    storage.broken = false;
    expect(stash.secureExpedition([], run.pendingUnlocks)).toMatchObject({ ok: true, saved: 0 });
    const next = new SkillProgression(new SecuredStash(storage).unlockedIds);
    expect(next.canUseSkill('frost-bloom')).toBe(true);
    expect(next.pendingUnlocks).toEqual([]);
  });

  it('preserves legacy schema-1 items-only stash without deleting gear', () => {
    const storage = new Storage();
    const old = { schema: 1, revision: 3, completed: 4, items: [] };
    storage.data.set(STASH_STORAGE_KEY, JSON.stringify(old));
    const stash = new SecuredStash(storage);
    expect(stash.status).toBe('ready');
    expect(stash.unlockedIds).toEqual([]);
    expect(stash.secureExpedition([], ['skill:ash-lance'])).toMatchObject({ ok: true });
    const reloaded = new SecuredStash(storage);
    expect(reloaded.completedExpeditions).toBe(5);
    expect(reloaded.unlockedIds).toEqual(['skill:ash-lance']);
  });

  it('rejects invalid permanent skill IDs while preserving stored data', () => {
    const storage = new Storage();
    const stash = new SecuredStash(storage);
    expect(stash.secureExpedition([], ['skill:unknown'])).toMatchObject({
      ok: false, reason: 'invalid-items',
    });
    expect(storage.data.size).toBe(0);
    storage.data.set(STASH_STORAGE_KEY, JSON.stringify({
      schema: 1, revision: 1, completed: 1, items: [], unlocks: ['support:invalid'],
    }));
    const corrupted = new SecuredStash(storage);
    expect(corrupted.status).toBe('corrupt');
    expect(corrupted.secureExpedition([]).ok).toBe(false);
  });

  it('does not allow outdated tabs to overwrite successful skill unlocks', () => {
    const storage = new Storage();
    const first = new SecuredStash(storage);
    const stale = new SecuredStash(storage);
    expect(first.secureExpedition([], ['skill:frost-bloom']).ok).toBe(true);
    expect(stale.secureExpedition([], ['skill:ash-lance']).ok).toBe(false);
    expect(new SecuredStash(storage).unlockedIds).toEqual(['skill:frost-bloom']);
  });
});
