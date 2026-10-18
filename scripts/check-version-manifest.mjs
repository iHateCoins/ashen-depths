import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const expected = process.env.GITHUB_SHA;
const manifest = JSON.parse(readFileSync(resolve('dist/version.json'), 'utf8'));
if (!expected || !/^[a-f0-9]{40}$/i.test(expected)) {
  throw new Error('Production verification requires the 40-character GITHUB_SHA.');
}
if (manifest.buildId !== expected) {
  throw new Error(`Manifest build ID ${manifest.buildId} does not match GitHub commit ${expected}.`);
}
const bundles = readdirSync(resolve('dist/assets')).filter(name => name.endsWith('.js'));
if (!bundles.length || !bundles.some(name =>
  readFileSync(resolve('dist/assets', name), 'utf8').includes(expected))) {
  throw new Error('The running app bundle does not contain the manifest build ID.');
}
console.log(`Verified deployment manifest and compiled game both identify commit ${expected.slice(0, 7)}.`);
