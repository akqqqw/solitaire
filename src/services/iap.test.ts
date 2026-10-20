import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COIN_PACKS,
  IapService,
  type YandexPayments,
} from './iap';

interface FakeOptions {
  catalog?: Awaited<ReturnType<YandexPayments['getCatalog']>>;
  purchases?: Awaited<ReturnType<YandexPayments['getPurchases']>>;
  purchaseError?: unknown;
}

function makePayments(options: FakeOptions = {}) {
  const consumed: string[] = [];
  const payments = {
    getCatalog: vi.fn(async () => options.catalog ?? []),
    getPurchases: vi.fn(async () => options.purchases ?? []),
    purchase: vi.fn(async ({ id }: { id: string; developerPayload?: string }) => {
      if (options.purchaseError) throw options.purchaseError;
      return { productID: id, purchaseToken: `token-${id}`, developerPayload: 'coins' };
    }),
    consumePurchase: vi.fn(async (token: string) => {
      consumed.push(token);
    }),
  };
  return { payments, consumed };
}

function serviceWith(payments: object): IapService {
  const service = new IapService();
  service.bindSdk(() => ({ payments }));
  return service;
}

describe('покупки: офлайн-режим', () => {
  it('честно сообщает недоступность и не выдаёт товар', async () => {
    const service = new IapService();
    await service.init();

    expect(service.available).toBe(false);
    await expect(service.purchase(COIN_PACKS[0].id)).resolves.toMatchObject({
      status: 'unavailable',
    });
    await expect(service.pendingPurchases()).resolves.toEqual([]);
    await expect(service.consume('token')).resolves.toBe(false);

    const catalog = await service.catalog();
    expect(catalog).toHaveLength(COIN_PACKS.length);
    expect(catalog[0].price).toBe(COIN_PACKS[0].fallbackPrice);
    expect(catalog[0].id).toBe(COIN_PACKS[0].id);
  });
});

describe('покупки: каталог и транзакции', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('подменяет цены-заглушки настоящими ценами площадки', async () => {
    const { payments } = makePayments({
      catalog: [
        {
          id: COIN_PACKS[1].id,
          title: 'Мешочек',
          price: '249 ₽',
          priceValue: '249',
          priceCurrencyCode: 'RUB',
        },
      ],
    });
    const service = serviceWith(payments);
    await service.init();
    expect(service.available).toBe(true);

    const catalog = await service.catalog();
    const pack = catalog.find((item) => item.id === COIN_PACKS[1].id)!;
    expect(pack.price).toBe('249 ₽');
    expect(pack.priceValue).toBe(249);
    expect(pack.currencyCode).toBe('RUB');
    // Товары, которых нет в каталоге площадки, остаются с заглушкой.
    expect(catalog.find((item) => item.id === COIN_PACKS[0].id)?.price).toBe(
      COIN_PACKS[0].fallbackPrice,
    );
  });

  it('возвращает токен и количество монет после оплаты', async () => {
    const { payments, consumed } = makePayments();
    const service = serviceWith(payments);
    await service.init();

    const pack = COIN_PACKS[2];
    const result = await service.purchase(pack.id);
    expect(result).toEqual({
      status: 'ok',
      productId: pack.id,
      token: `token-${pack.id}`,
      coins: pack.coins,
    });
    await service.consume(result.token!);
    expect(consumed).toEqual([`token-${pack.id}`]);
    expect(payments.purchase).toHaveBeenCalledWith({
      id: pack.id,
      developerPayload: `coins:${pack.coins}`,
    });
  });

  it('при ошибке оплаты подхватывает уже оформленную покупку', async () => {
    const { payments } = makePayments({
      purchaseError: new Error('Покупка отменена'),
      purchases: [{ productID: 'coins_100', purchaseToken: 'pending-token' }],
    });
    const service = serviceWith(payments);
    await service.init();

    const result = await service.purchase('coins_100');
    expect(result).toMatchObject({ status: 'ok', token: 'pending-token', coins: 100 });
  });

  it('игнорирует неизвестные товары и пустые токены', async () => {
    const { payments } = makePayments({
      purchases: [
        { productID: 'coins_100', purchaseToken: 'a' },
        { productID: '', purchaseToken: 'b' },
      ],
    });
    const service = serviceWith(payments);
    await service.init();

    await expect(service.purchase('unknown')).resolves.toMatchObject({ status: 'failed' });
    const pending = await service.pendingPurchases();
    expect(pending).toEqual([{ productId: 'coins_100', token: 'a' }]);
  });

  it('переживает падение каталога и подтверждения', async () => {
    const { payments } = makePayments();
    payments.getCatalog.mockRejectedValueOnce(new Error('нет сети'));
    payments.consumePurchase.mockRejectedValueOnce(new Error('нет сети'));
    const service = serviceWith(payments);
    await service.init();

    const catalog = await service.catalog();
    expect(catalog).toHaveLength(COIN_PACKS.length);
    await expect(service.consume('token')).resolves.toBe(false);
  });
});
