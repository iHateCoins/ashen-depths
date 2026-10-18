import { decideUpdate, updateUrl, type UpdateDecision } from './UpdatePolicy';

interface VersionResponse { buildId?: unknown }

export interface UpdateWatcherConfig {
  /** Vite-injected SHA of the JavaScript bundle currently running on screen. */
  currentBuild: string;
  /** import.meta.env.BASE_URL: /ashen-depths/ in Pages, / during local development. */
  baseUrl: string;
  /** Optional override for tests; default checks every three minutes. */
  intervalMs?: number;
}

function createBuildLabel(build: string): HTMLElement {
  const label = document.createElement('div');
  label.id = 'ashen-build-id';
  label.textContent = `Build ${build === 'local' ? 'dev' : build.slice(0, 7)}`;
  label.title = `Current app build: ${build}`;
  document.body.append(label);
  document.documentElement.dataset.ashenBuild = build;
  return label;
}

/**
 * No service worker or persistent offline cache is used. GitHub Pages deploys
 * hashed Vite bundles; an uncached version.json announces new releases.
 */
export function startUpdateWatcher(config: UpdateWatcherConfig): () => void {
  const label = createBuildLabel(config.currentBuild);
  // Local Vite dev builds have no deployment SHA or update endpoint.
  if (config.currentBuild === 'local') return () => label.remove();

  let checking = false;
  let disposed = false;
  let dismissedBuild: string | null = null;
  let notice: HTMLElement | null = null;

  const dismiss = (): void => {
    notice?.remove();
    notice = null;
  };

  const showNotice = (newBuild: string, decision: UpdateDecision): void => {
    if (dismissedBuild === newBuild) return;
    dismiss();

    const panel = document.createElement('aside');
    panel.id = 'ashen-update-notice';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');

    const message = document.createElement('span');
    message.textContent = decision === 'manual'
      ? 'A newer build is published, but this shortcut loaded an older cached copy. Retry the update.'
      : 'A new Ashen Depths build is available. Update when you are ready.';

    const controls = document.createElement('div');
    controls.className = 'ashen-update-controls';

    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.textContent = decision === 'manual' ? 'Retry update' : 'Update now';
    updateButton.addEventListener('click', () => {
      const next = new URL(updateUrl(window.location.href, newBuild));
      // A one-time manual retry uses a fresh URL. Never retry automatically.
      if (decision === 'manual') next.searchParams.set('retry', Date.now().toString());
      window.location.replace(next.toString());
    });

    const laterButton = document.createElement('button');
    laterButton.type = 'button';
    laterButton.textContent = 'Later';
    laterButton.className = 'ashen-update-later';
    laterButton.addEventListener('click', () => {
      dismissedBuild = newBuild;
      dismiss();
    });

    controls.append(updateButton, laterButton);
    panel.append(message, controls);
    document.body.append(panel);
    notice = panel;
  };

  const check = async (reason: 'startup' | 'foreground' | 'interval'): Promise<void> => {
    if (disposed || checking || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      const url = new URL('version.json', new URL(config.baseUrl, window.location.origin));
      url.searchParams.set('check', Date.now().toString());
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return;
      const remote = await response.json() as VersionResponse;
      const availableBuild = remote?.buildId;
      const requestedBuild = new URL(window.location.href).searchParams.get('build');
      const decision = decideUpdate(config.currentBuild, availableBuild, requestedBuild);
      if (disposed) return;
      if (decision === 'current') {
        dismiss();
        return;
      }
      if (decision === 'invalid') return;
      if (reason === 'startup' && decision === 'refresh') {
        // A newly launched Home Screen app safely updates before regular play.
        // 'build' prevents an endless reload if an old HTML/JS copy persists.
        window.location.replace(updateUrl(window.location.href, availableBuild as string));
        return;
      }
      showNotice(availableBuild as string, decision);
    } catch {
      // Offline / captive-portal / failed version fetch: continue playing.
    } finally {
      checking = false;
    }
  };

  const onForeground = (): void => {
    if (document.visibilityState === 'visible') void check('foreground');
  };

  // On first launch update automatically. During active play, ask before a reload
  // to avoid losing the current expedition's unsaved state.
  void check('startup');
  document.addEventListener('visibilitychange', onForeground);
  window.addEventListener('pageshow', onForeground);
  window.addEventListener('focus', onForeground);
  const timer = window.setInterval(() => void check('interval'), config.intervalMs ?? 180_000);

  return () => {
    disposed = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onForeground);
    window.removeEventListener('pageshow', onForeground);
    window.removeEventListener('focus', onForeground);
    dismiss();
    label.remove();
  };
}
