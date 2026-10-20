// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearProfileStorage,
  loadProfile,
  saveProfile,
  saveProfileLocal,
} from './persistence';
import { createDefaultProfile } from '../store/profile';

const LS_KEY = 'solitaire-club:profile';
const LS_BACKUP = 'solitaire-club:profile-backup';

beforeEach(() => {
  localStorage.clear();
});

describe('Сохранение профиля', () => {
  it('записывает и возвращает профиль без потерь', async () => {
    const profile = createDefaultProfile();
    profile.coins = 145;
    profile.career.totalPlayed = 7;
    profile.career.totalWins = 4;
    profile.stats.pyramid.played = 3;
    profile.stats.pyramid.wins = 2;
    profile.settings.cardBack = 'sapphire';
    profile.achievements.first_win = 111;

    saveProfileLocal(profile);
    const loaded = await loadProfile();
    expect(loaded.coins).toBe(145);
    expect(loaded.career.totalPlayed).toBe(7);
    expect(loaded.career.totalWins).toBe(4);
    expect(loaded.stats.pyramid.wins).toBe(2);
    expect(loaded.settings.cardBack).toBe('sapphire');
    expect(loaded.achievements.first_win).toBe(111);
  });

  it('возвращает профиль из IndexedDB-совместимого пути и обновляет метку времени', async () => {
    const profile = createDefaultProfile();
    profile.coins = 12;
    await saveProfile(profile);
    const raw = JSON.parse(localStorage.getItem(LS_KEY) as string);
    expect(raw.coins).toBe(12);
    expect(typeof raw.updatedAt).toBe('number');
    expect(raw.updatedAt).toBeGreaterThan(0);
    const loaded = await loadProfile();
    expect(loaded.coins).toBe(12);
  });

  it('выбирает более свежую копию при расхождении основной и резервной', async () => {
    const older = { ...createDefaultProfile(), updatedAt: 1000, coins: 5 };
    const newer = { ...createDefaultProfile(), updatedAt: 5000, coins: 77 };
    localStorage.setItem(LS_KEY, JSON.stringify(older));
    localStorage.setItem(LS_BACKUP, JSON.stringify(newer));
    const loaded = await loadProfile();
    expect(loaded.coins).toBe(77);
  });

  it('переживает повреждённый JSON и мусор вместо профиля', async () => {
    localStorage.setItem(LS_KEY, '{not json');
    localStorage.setItem(LS_BACKUP, JSON.stringify({ hello: 'world' }));
    const loaded = await loadProfile();
    expect(loaded.version).toBe(2);
    expect(loaded.career.totalPlayed).toBe(0);
    expect(loaded.sessions).toEqual({});
  });

  it('очищает основное хранилище и резервную копию', async () => {
    saveProfileLocal(createDefaultProfile());
    expect(localStorage.getItem(LS_KEY)).toBeTruthy();
    await clearProfileStorage();
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(localStorage.getItem(LS_BACKUP)).toBeNull();
    const loaded = await loadProfile();
    expect(loaded.coins).toBe(0);
  });
});
