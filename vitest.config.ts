import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // В тестах Phaser берём из dist: исходная сборка тянет dev-зависимость
      // phaser3spectorjs, которой нет в проекте.
      phaser: 'phaser/dist/phaser.js',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
  },
});
