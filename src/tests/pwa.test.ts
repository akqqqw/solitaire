// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('PWA: манифест, иконки и офлайн-кэш', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    name: string;
    lang: string;
    start_url: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: Array<{ src: string; sizes: string; type: string }>;
  };

  it('манифест заполнен по требованиям установки', () => {
    expect(manifest.name).toContain('Пасьянс Клуб');
    expect(manifest.lang).toBe('ru');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.start_url).toBe('./');
  });

  it('для установки есть PNG-иконки 192 и 512 пикселей', () => {
    const png = manifest.icons.filter((icon) => icon.type === 'image/png');
    expect(png.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(png.some((icon) => icon.sizes === '512x512')).toBe(true);
    for (const icon of manifest.icons) {
      const path = resolve(root, 'public', icon.src.replace(/^\.\//, ''));
      expect(existsSync(path), `нет файла иконки ${icon.src}`).toBe(true);
    }
    expect(manifest.icons.some((icon) => icon.type === 'image/svg+xml')).toBe(true);
  });

  it('иконки действительно PNG нужного размера', () => {
    for (const [file, size] of [
      ['public/icons/icon-192.png', 192],
      ['public/icons/icon-512.png', 512],
      ['public/icons/apple-touch-icon.png', 180],
    ] as const) {
      const buffer = readFileSync(resolve(root, file));
      expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      // Ширина и высота лежат в заголовке IHDR сразу после сигнатуры и длины чанка.
      expect(buffer.readUInt32BE(16)).toBe(size);
      expect(buffer.readUInt32BE(20)).toBe(size);
      expect(buffer.byteLength).toBeGreaterThan(1000);
    }
  });

  it('иконка — золотая пика, а не чёрная клякса от вырожденного градиента', () => {
    const svg = read('public/icons/icon.svg');
    // Ручка и основание пики когда-то были залиты url(#gold) — на вертикальной
    // линии такой градиент вырождается и SVG-рендерер рисовал чёрный цвет.
    const spadeStem = /<path d="M316 286v34" stroke="([^"]+)"/.exec(svg);
    const spadeBase = /<path d="M290 320h52" stroke="([^"]+)"/.exec(svg);
    expect(spadeStem?.[1]).toBeTruthy();
    expect(spadeBase?.[1]).toBeTruthy();
    expect(spadeStem?.[1]).not.toContain('url(');
    expect(spadeBase?.[1]).not.toContain('url(');
  });

  it('index.html подключает манифест, PNG-иконку для iOS и офлайн-скрипт', () => {
    const html = read('index.html');
    expect(html).toContain('rel="manifest" href="./manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="./icons/apple-touch-icon.png"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('theme-color');
  });

  it('service worker кэширует оболочку и знает про иконки', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("const CACHE = 'solitaire-club-v");
    for (const asset of [
      './index.html',
      './manifest.webmanifest',
      './icons/icon.svg',
      './icons/icon-192.png',
      './icons/icon-512.png',
    ]) {
      expect(sw).toContain(asset);
    }
    // Сеть в приоритете: иначе обновления игры не доедут до игрока.
    expect(sw).toContain('fetch(request)');
    expect(sw).toContain('caches.match(request)');
  });
});
