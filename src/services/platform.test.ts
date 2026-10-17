import { describe, expect, it } from 'vitest';
import { LEADERBOARDS, platform } from './platform';

describe('Яндекс SDK вне платформы', () => {
  it('инициализируется в офлайн-режиме без ошибок', async () => {
    expect(platform.available).toBe(false);
    expect(platform.name).toBe('offline');
    await platform.init();
    expect(platform.available).toBe(false);
    expect(platform.name).toBe('offline');
  });

  it('безопасно отвечает на рекламу и лидерборды', async () => {
    await expect(platform.showInterstitial()).resolves.toBe(false);
    await expect(platform.showRewarded()).resolves.toBe(false);
    await expect(platform.submitScore(LEADERBOARDS.totalWins, 12)).resolves.toBeUndefined();
  });

  it('не требует облака и не теряет локальный прогресс', async () => {
    await expect(platform.pullCloudSave()).resolves.toBeNull();
    await expect(platform.pushCloudSave({ coins: 5 })).resolves.toBeUndefined();
    expect(LEADERBOARDS.klondikeTime).toBe('klondike_best_time');
    expect(LEADERBOARDS.spiderTime).toBe('spider_best_time');
    expect(LEADERBOARDS.freecellTime).toBe('freecell_best_time');
    expect(LEADERBOARDS.pyramidTime).toBe('pyramid_best_time');
  });
});
