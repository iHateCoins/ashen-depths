import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('dist/index.html'), 'utf8');
if (html.includes('src="/src/main.ts"')) {
  throw new Error('dist/index.html still references TypeScript source rather than a bundled game.');
}
const assets = [...html.matchAll(/(?:src|href)="(\/ashen-depths\/assets\/[^"]+)"/g)].map(match => match[1]);
if (!assets.some(asset => asset.endsWith('.js'))) {
  throw new Error('The GitHub Pages build is missing a compiled JavaScript entry point.');
}
for (const asset of assets) {
  const filepath = resolve('dist', asset.slice('/ashen-depths/'.length));
  if (statSync(filepath).size === 0) throw new Error(`Empty deployment asset: ${filepath}`);
}
console.log(`Verified compiled Pages entry and ${assets.length} linked assets.`);
