import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // 配信するパス。本番は独自ドメイン（oscillo.meetupsensei.com）の直下なので '/'。
    // サブパス（例: nozatan530.github.io/mic-scope/）に置くときだけ VITE_BASE=/mic-scope/ を渡す
    base: process.env.VITE_BASE || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
  };
});
