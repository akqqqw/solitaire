/**
 * Правила показа рекламы.
 *
 * Межстраничная реклама — только между партиями и не чаще, чем раз в
 * 3,5 минуты (площадки требуют не чаще раза в минуту, 3–4 минуты комфортно
 * игроку). Награда за ролик — не чаще раза в две минуты, чтобы её нельзя
 * было «фармить» подряд.
 */
import { INTERSTITIAL_INTERVAL_MS, REWARDED_COOLDOWN_MS, type AdState } from '../store/profile';

export function canShowInterstitial(ads: AdState, now = Date.now()): boolean {
  if (!Number.isFinite(ads.interstitialAt) || ads.interstitialAt <= 0) return true;
  return now - ads.interstitialAt >= INTERSTITIAL_INTERVAL_MS;
}

export function canClaimRewarded(ads: AdState, now = Date.now()): boolean {
  if (!Number.isFinite(ads.rewardedAt) || ads.rewardedAt <= 0) return true;
  return now - ads.rewardedAt >= REWARDED_COOLDOWN_MS;
}

/** Сколько секунд осталось до следующей награды за ролик. */
export function rewardedCooldownLeft(ads: AdState, now = Date.now()): number {
  const left = REWARDED_COOLDOWN_MS - (now - ads.rewardedAt);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Сколько секунд осталось до следующей межстраничной рекламы. */
export function interstitialCooldownLeft(ads: AdState, now = Date.now()): number {
  const left = INTERSTITIAL_INTERVAL_MS - (now - ads.interstitialAt);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
