import type { ExtractionSite, ExtractionPhase } from '../dungeon/ExtractionDirector';
import { EXTRACTION_SECONDS } from '../dungeon/ExtractionDirector';

/**
 * Mobile-first world-exit control. This native panel is never a Phaser hit
 * target, so touch events cannot accidentally issue click-to-move commands.
 */
export class ExtractionUI {
  private readonly root: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly notice: HTMLElement;
  private siteId: string | null = null;
  private phase: ExtractionPhase = 'idle';
  private enabled = true;
  private signature = '';
  private errorMessage = '';

  constructor(
    private readonly begin: (siteId: string) => void,
    private readonly cancel: () => void,
  ) {
    const root = document.createElement('aside');
    root.id = 'ashen-extraction-panel';
    root.className = 'ashen-extraction-panel';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Early extraction');
    root.hidden = true;

    const heading = document.createElement('strong');
    const detail = document.createElement('span');
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'ashen-extraction-button';
    action.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.enabled || !this.siteId) return;
      this.errorMessage = '';
      if (this.phase === 'channeling') this.cancel();
      else this.begin(this.siteId);
    });
    const notice = document.createElement('small');
    notice.className = 'ashen-extraction-notice';
    notice.setAttribute('role', 'status');
    root.append(heading, detail, action, notice);
    document.body.append(root);

    this.root = root;
    this.heading = heading;
    this.detail = detail;
    this.action = action;
    this.notice = notice;
  }

  show(site: ExtractionSite | null, phase: ExtractionPhase, remaining: number, enabled = true, unclaimed = 0): void {
    if (!site) {
      this.hide();
      return;
    }
    this.root.hidden = false;
    this.siteId = site.id;
    this.phase = phase;
    this.enabled = enabled;
    const signature = [site.id, phase, remaining.toFixed(1), enabled, unclaimed].join(':');
    if (signature === this.signature) return;
    this.signature = signature;
    this.heading.textContent = site.label;
    this.detail.textContent = phase === 'channeling'
      ? `Channeling escape: ${remaining.toFixed(1)}s · stay near the stone and avoid damage.`
      : 'Leave now with worn and carried gear, or explore deeper for more loot.';
    this.action.textContent = phase === 'channeling' ? 'CANCEL ESCAPE'
      : unclaimed > 0 ? `EXTRACT NOW · ${unclaimed} REWARD${unclaimed === 1 ? '' : 'S'} LOST`
      : 'EXTRACT NOW';
    this.action.setAttribute('aria-label', phase === 'channeling' ? 'CANCEL ESCAPE' : 'EXTRACT NOW');
    this.action.disabled = !enabled;
    const warning = unclaimed > 0
      ? ` UNCLAIMED: ${unclaimed} discovery reward${unclaimed === 1 ? '' : 's'} will be forfeited. Use CLAIM REWARDS first.`
      : '';
    this.notice.textContent = (this.errorMessage || (enabled
      ? phase === 'channeling'
        ? 'Taking damage, moving away, or opening your bag interrupts extraction.'
        : `Hold the waystone for ${EXTRACTION_SECONDS.toFixed(1)}s. No room clearing required.`
      : 'Extraction is unavailable after the Warden has fallen.')) + warning;
  }

  showError(message: string): void {
    this.errorMessage = message;
    this.notice.textContent = message;
    this.root.hidden = false;
    this.signature = '';
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.siteId = null;
    this.errorMessage = '';
    this.signature = '';
  }

  destroy(): void {
    this.root.remove();
  }
}
