import { describe, expect, it } from 'vitest';
import { decideUpdate, isReleaseBuildId, updateUrl } from '../src/game/update/UpdatePolicy';

const oldBuild = 'a'.repeat(40);
const newBuild = 'b'.repeat(40);

describe('installed web app update policy', () => {
  it('recognizes only full release commit identifiers', () => {
    expect(isReleaseBuildId(newBuild)).toBe(true);
    expect(isReleaseBuildId('dev')).toBe(false);
    expect(isReleaseBuildId('m02-pr03')).toBe(false);
    expect(isReleaseBuildId('b'.repeat(41))).toBe(false);
  });

  it('keeps a current app in place', () => {
    expect(decideUpdate(newBuild, newBuild, null)).toBe('current');
    expect(decideUpdate('local', newBuild, null)).toBe('current');
  });

  it('requests one startup refresh for a newer build', () => {
    expect(decideUpdate(oldBuild, newBuild, null)).toBe('refresh');
    expect(decideUpdate(oldBuild, newBuild, oldBuild)).toBe('refresh');
  });

  it('never loops when the URL already requested the current release', () => {
    expect(decideUpdate(oldBuild, newBuild, newBuild)).toBe('manual');
    expect(decideUpdate(oldBuild, 'broken', null)).toBe('invalid');
  });

  it('preserves app path but replaces obsolete manual version parameters', () => {
    expect(updateUrl('https://example.com/ashen-depths/?v=m02-pr02&theme=dark', newBuild))
      .toBe(`https://example.com/ashen-depths/?theme=dark&build=${newBuild}`);
    expect(() => updateUrl('https://example.com/', 'wrong')).toThrow();
  });
});
