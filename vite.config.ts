import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // 配信するパス。ふだんはルート（独自ドメインの直下）。
    // GitHub Pages（nozatan530.github.io/mic-scope/）では、ビルド時に VITE_BASE=/mic-scope/ を渡す
    base: process.env.VITE_BASE || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
  };
});
