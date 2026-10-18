const url = new URL(process.env.PAGES_URL || 'https://ihatecoins.github.io/ashen-depths/');
url.searchParams.set('deployment-check', process.env.GITHUB_RUN_ID || 'manual');
const manifestUrl = new URL('version.json', url);
manifestUrl.searchParams.set('deployment-check', process.env.GITHUB_RUN_ID || 'manual');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastError = '';
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const [pageResponse, manifestResponse] = await Promise.all([
      fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(8000) }),
      fetch(manifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
    ]);
    const html = await pageResponse.text();
    const manifest = manifestResponse.ok ? await manifestResponse.json() : null;
    const compiled = pageResponse.ok &&
      /\/ashen-depths\/assets\/[^"'\s]+\.js/.test(html) &&
      !html.includes('src="/src/main.ts"');
    const upToDate = manifest?.buildId === process.env.GITHUB_SHA;
    if (compiled && upToDate) {
      console.log(`Published GitHub Pages serves a compiled game and current version manifest (attempt ${attempt}).`);
      process.exit(0);
    }
    lastError = `page HTTP ${pageResponse.status}, manifest HTTP ${manifestResponse.status}; ` +
      `compiled entry: ${compiled}; manifest current: ${upToDate}`;
  } catch (error) {
    lastError = String(error);
  }
  if (attempt < 12) await pause(5000);
}
console.error(`Published GitHub Pages is not serving the current compiled build: ${lastError}. Check Settings → Pages → Source: GitHub Actions.`);
process.exit(1);
