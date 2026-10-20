/**
 * Внутриигровые покупки через Yandex Games Payments.
 *
 * Монеты — премиальная валюта: их нельзя заработать в партиях, только купить.
 * Все товары — расходуемые (consumable): после начисления монет покупка
 * подтверждается через `consumePurchase`, иначе площадка не даст купить её снова.
 *
 * Вне Яндекс Игр сервис честно сообщает `available = false`: витрина показывает
 * цены-заглушки, а кнопки покупки заблокированы. Игра остаётся полностью
 * играбельной офлайн — просто без пополнения кошелька.
 */

/** Сколько ждём ответа платежей при запуске, прежде чем уйти в офлайн-режим. */
const PAYMENTS_WAIT_MS = 2500;

export interface CoinPack {
  /** Идентификатор товара в консоли разработчика Yandex Games. */
  id: string;
  coins: number;
  title: string;
  subtitle: string;
  /** Показывается, пока площадка не прислала настоящий каталог. */
  fallbackPrice: string;
  badge?: string;
}

/** Наборы монет. id должны совпадать с товарами в консоли разработчика. */
export const COIN_PACKS: readonly CoinPack[] = [
  {
    id: 'coins_100',
    coins: 100,
    title: 'Горсть монет',
    subtitle: 'На один скромный стиль',
    fallbackPrice: '99 ₽',
  },
  {
    id: 'coins_320',
    coins: 320,
    title: 'Мешочек монет',
    subtitle: 'Хватит на рубашку карт',
    fallbackPrice: '249 ₽',
    badge: '+8%',
  },
  {
    id: 'coins_750',
    coins: 750,
    title: 'Сундук монет',
    subtitle: 'Рубашка и стол в комплекте',
    fallbackPrice: '499 ₽',
    badge: '+25%',
  },
  {
    id: 'coins_1600',
    coins: 1600,
    title: 'Казна клуба',
    subtitle: 'Вся коллекция стилей сразу',
    fallbackPrice: '899 ₽',
    badge: '+60%',
  },
];

export interface PurchaseProduct {
  id: string;
  title?: string;
  description?: string;
  price: string;
  priceValue?: number;
  currencyCode?: string;
  image?: string;
}

export type PurchaseStatus = 'ok' | 'cancelled' | 'unavailable' | 'failed';

export interface PurchaseResult {
  status: PurchaseStatus;
  productId?: string;
  token?: string;
  coins?: number;
  message?: string;
}

export interface PendingPurchase {
  productId: string;
  token: string;
}

interface YandexPurchase {
  productID: string;
  purchaseToken: string;
  developerPayload?: string;
}

interface YandexPayments {
  getCatalog(): Promise<
    Array<{
      id: string;
      title?: string;
      description?: string;
      price?: string;
      priceValue?: string;
      priceCurrencyCode?: string;
      imageURI?: string;
      getPriceCurrencyImage?: (size: string) => string;
    }>
  >;
  getPurchases(): Promise<YandexPurchase[]>;
  purchase(options: { id: string; developerPayload?: string }): Promise<YandexPurchase>;
  consumePurchase(token: string): Promise<void>;
}

interface YandexSDKWithPayments {
  getPayments?: (options?: { signed?: boolean }) => Promise<YandexPayments>;
  payments?: YandexPayments;
}

export class IapService {
  private payments: YandexPayments | null = null;
  private initPromise: Promise<void> | null = null;
  private catalogCache: Map<string, PurchaseProduct> | null = null;
  /** Ссылка на уже инициализированный SDK площадки (если он есть). */
  private sdkProvider: (() => unknown) | null = null;

  /** Позволяет взять тот же SDK, что использует платформа (без второго init). */
  bindSdk(provider: () => unknown): void {
    this.sdkProvider = provider;
    // SDK мог появиться позже первой попытки инициализации — пробуем снова.
    this.initPromise = null;
    this.catalogCache = null;
  }

  get available(): boolean {
    return this.payments !== null;
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    // Типы SDK площадки живут в platform.ts; здесь нужен только срез с платежами.
    const sdk = this.sdkProvider?.() as YandexSDKWithPayments | null | undefined;
    if (!sdk) return;
    try {
      if (sdk.payments) {
        this.payments = sdk.payments;
        return;
      }
      if (sdk.getPayments) {
        // Не держим загрузку игры, если платежи площадки отвечают слишком долго.
        this.payments = await Promise.race([
          sdk.getPayments({ signed: false }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), PAYMENTS_WAIT_MS)),
        ]);
      }
    } catch {
      // Покупки недоступны (нет авторизации, отключены в консоли) — офлайн-режим.
      this.payments = null;
    }
  }

  /** Каталог с настоящими ценами площадки; отсутствующие товары остаются с заглушкой. */
  async catalog(): Promise<PurchaseProduct[]> {
    const fallback = COIN_PACKS.map<PurchaseProduct>((pack) => ({
      id: pack.id,
      title: pack.title,
      description: pack.subtitle,
      price: pack.fallbackPrice,
    }));
    if (!this.payments) return fallback;
    if (this.catalogCache) {
      return fallback.map((item) => this.catalogCache?.get(item.id) ?? item);
    }
    try {
      const items = await this.payments.getCatalog();
      const cache = new Map<string, PurchaseProduct>();
      for (const item of items) {
        const price = item.price?.trim() || fallback.find((f) => f.id === item.id)?.price || '';
        cache.set(item.id, {
          id: item.id,
          title: item.title,
          description: item.description,
          price,
          priceValue: Number(item.priceValue) || undefined,
          currencyCode: item.priceCurrencyCode,
          image: item.getPriceCurrencyImage?.('small') ?? item.imageURI,
        });
      }
      this.catalogCache = cache;
      return fallback.map((item) => ({ ...item, ...cache.get(item.id) }));
    } catch {
      return fallback;
    }
  }

  /** Покупка набора монет. Возвращает токен: списывать его должен вызывающий код. */
  async purchase(packId: string): Promise<PurchaseResult> {
    const pack = COIN_PACKS.find((item) => item.id === packId);
    if (!pack) return { status: 'failed', message: 'Неизвестный товар' };
    if (!this.payments) return { status: 'unavailable', message: 'Покупки доступны в Яндекс Играх' };
    try {
      const purchase = await this.payments.purchase({
        id: pack.id,
        developerPayload: `coins:${pack.coins}`,
      });
      if (!purchase?.purchaseToken) {
        return { status: 'failed', message: 'Платёж не завершён' };
      }
      return {
        status: 'ok',
        productId: pack.id,
        token: purchase.purchaseToken,
        coins: pack.coins,
      };
    } catch (error) {
      // Пользователь мог закрыть платёжную форму, или товар уже куплен
      // и не был подтверждён. Второй случай проверяем через getPurchases().
      const pending = await this.pendingPurchases();
      const already = pending.find((item) => item.productId === pack.id);
      if (already) {
        return { status: 'ok', productId: pack.id, token: already.token, coins: pack.coins };
      }
      return { status: 'cancelled', message: errorMessage(error) };
    }
  }

  /** Нераспределённые покупки: начисляем их при запуске, даже если игра закрылась. */
  async pendingPurchases(): Promise<PendingPurchase[]> {
    if (!this.payments) return [];
    try {
      const list = await this.payments.getPurchases();
      return list
        .filter((item) => typeof item.purchaseToken === 'string' && !!item.productID)
        .map((item) => ({ productId: item.productID, token: item.purchaseToken }));
    } catch {
      return [];
    }
  }

  /** Подтверждает расходуемую покупку. Без этого повторная покупка невозможна. */
  async consume(token: string): Promise<boolean> {
    if (!this.payments) return false;
    try {
      await this.payments.consumePurchase(token);
      return true;
    } catch {
      return false;
    }
  }

  /** Только для тестов: сбросить состояние между сценариями. */
  reset(): void {
    this.payments = null;
    this.initPromise = null;
    this.catalogCache = null;
    this.sdkProvider = null;
  }
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown };
    if (typeof value.message === 'string' && value.message.trim()) return value.message;
    if (typeof value.code === 'string') return value.code;
  }
  return 'Покупка отменена';
}

export const iap = new IapService();
export type { YandexPayments };
