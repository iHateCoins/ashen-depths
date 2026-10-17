import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/ashen-depths/' : '/',
  build: { target: 'es2022' },
});
