import { describe, expect, it } from 'vitest';
import { stageFor, stageLabel, versionText } from '../../src/env';

describe('Umgebung aus dem Branch', () => {
  it('release = Produktion ohne Abzeichen, main = Integration, sonst Abnahme bzw. lokal', () => {
    expect(stageFor('release')).toBe('release');
    expect(stageFor('main')).toBe('integration');
    expect(stageFor('feat/x')).toBe('abnahme');
    expect(stageFor('HEAD')).toBe('lokal');
    expect(stageLabel('release', 'release')).toBeNull();
    expect(stageLabel('abnahme', 'feat/x')).toBe('Abnahme: feat/x');
  });

  it('Versionszeile: in Produktion nur die Version, sonst mit Branch und Commit', () => {
    expect(versionText({ version: '1.2.3', branch: 'release', commit: 'abc1234', stage: 'release' })).toBe('v1.2.3');
    expect(versionText({ version: '1.2.3', branch: 'main', commit: 'abc1234', stage: 'integration' })).toBe('v1.2.3 · main · abc1234');
  });
});
