import { describe, expect, it } from 'vitest';
import {
  canClaimRewarded,
  canShowInterstitial,
  interstitialCooldownLeft,
  rewardedCooldownLeft,
} from './adPolicy';
import { INTERSTITIAL_INTERVAL_MS, REWARDED_COOLDOWN_MS } from '../store/profile';

const now = 10_000_000;

describe('политика рекламы', () => {
  it('первую межстраничную рекламу можно показать сразу', () => {
    expect(canShowInterstitial({ interstitialAt: 0, rewardedAt: 0 }, now)).toBe(true);
    expect(interstitialCooldownLeft({ interstitialAt: 0, rewardedAt: 0 }, now)).toBe(0);
  });

  it('не показывает межстраничную рекламу чаще интервала', () => {
    const ads = { interstitialAt: now, rewardedAt: 0 };
    expect(canShowInterstitial(ads, now + INTERSTITIAL_INTERVAL_MS - 1)).toBe(false);
    expect(canShowInterstitial(ads, now + INTERSTITIAL_INTERVAL_MS)).toBe(true);
  });

  it('держит награду за ролик на паузе две минуты', () => {
    const ads = { interstitialAt: 0, rewardedAt: now };
    expect(canClaimRewarded(ads, now + 1_000)).toBe(false);
    expect(rewardedCooldownLeft(ads, now + 1_000)).toBe(
      Math.ceil((REWARDED_COOLDOWN_MS - 1_000) / 1000),
    );
    expect(canClaimRewarded(ads, now + REWARDED_COOLDOWN_MS)).toBe(true);
    expect(rewardedCooldownLeft(ads, now + REWARDED_COOLDOWN_MS)).toBe(0);
  });

  it('считает испорченные отметки времени как «можно показывать»', () => {
    const ads = { interstitialAt: Number.NaN, rewardedAt: -5 };
    expect(canShowInterstitial(ads, now)).toBe(true);
    expect(canClaimRewarded(ads, now)).toBe(true);
  });
});
