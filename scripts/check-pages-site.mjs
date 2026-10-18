const url = new URL(process.env.PAGES_URL || 'https://ihatecoins.github.io/ashen-depths/');
url.searchParams.set('deployment-check', process.env.GITHUB_RUN_ID || 'manual');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastError = '';
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(8000) });
    const html = await response.text();
    if (response.ok && /\/ashen-depths\/assets\/[^"'\s]+\.js/.test(html) && !html.includes('src="/src/main.ts"')) {
      console.log(`Published GitHub Pages serves bundled game assets (attempt ${attempt}).`);
      process.exit(0);
    }
    lastError = `HTTP ${response.status}; compiled JS asset reference missing or source TypeScript served`;
  } catch (error) {
    lastError = String(error);
  }
  if (attempt < 12) await pause(5000);
}
console.error(`GitHub Pages is not serving the built game: ${lastError}. Check Settings → Pages → Source: GitHub Actions; disable branch/Jekyll publishing.`);
process.exit(1);
