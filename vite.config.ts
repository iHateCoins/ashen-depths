import { defineConfig, type Plugin } from 'vite';

const buildId = /^[a-f0-9]{40}$/i.test(process.env.GITHUB_SHA ?? '')
  ? process.env.GITHUB_SHA!
  : 'local';

function versionManifest(): Plugin {
  return {
    name: 'ashen-depths-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }) + '\n',
      });
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/ashen-depths/' : '/',
  define: { __ASHEN_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [versionManifest()],
  build: { target: 'es2022' },
});
