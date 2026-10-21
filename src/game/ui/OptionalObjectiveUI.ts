import type { ObjectivePrompt, OptionalObjectiveKind } from '../dungeon/OptionalObjectiveDirector';

/**
 * DOM controls avoid the transformed hit-testing problem with Phaser camera
 * HUD containers. Interaction remains explicitly player-driven: entering
 * range exposes a button but never auto-claims a reward.
 */
export class OptionalObjectiveUI {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly description: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private currentId: OptionalObjectiveKind | null = null;
  private lastKey = '';

  constructor(private readonly onActivate: (id: OptionalObjectiveKind) => void) {
    const root = document.createElement('aside');
    root.id = 'ashen-optional-objective';
    root.className = 'ashen-objective-panel';
    root.hidden = true;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Nearby optional objective');

    const title = document.createElement('strong');
    title.className = 'ashen-objective-title';
    const description = document.createElement('span');
    description.className = 'ashen-objective-description';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ashen-objective-button';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentId && !button.disabled) this.onActivate(this.currentId);
    });

    root.append(title, description, button);
    const hint = document.createElement('aside');
    hint.id = 'ashen-objective-hint';
    hint.className = 'ashen-objective-hint';
    hint.hidden = true;
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    // The guarded/healthy explanation must NEVER intercept movement taps.
    document.body.append(root, hint);
    this.hint = hint;
    this.root = root;
    this.title = title;
    this.description = description;
    this.button = button;
  }

  show(prompt: ObjectivePrompt | null): void {
    if (!prompt || prompt.availability === 'claimed') {
      this.hide();
      return;
    }
    const key = `${prompt.objective.id}:${prompt.availability}:${prompt.remainingGuards}`;
    if (key === this.lastKey &&
        ((prompt.availability === 'ready' && !this.root.hidden) ||
         (prompt.availability !== 'ready' && !this.hint.hidden))) return;
    this.lastKey = key;
    this.currentId = prompt.objective.id;
    const cache = prompt.objective.id === 'cache';
    if (prompt.availability !== 'ready') {
      this.root.hidden = true;
      this.hint.hidden = false;
      this.hint.textContent = prompt.availability === 'guarded'
        ? `SEALED CACHE · ${prompt.remainingGuards} guardian${prompt.remainingGuards===1?'':'s'} remaining`
        : 'SANCTUARY · Full health';
      return;
    }
    this.hint.hidden = true;
    this.root.hidden = false;
    this.title.textContent = prompt.objective.label;
    const description = prompt.availability === 'guarded'
      ? `Defeat ${prompt.remainingGuards} remaining cache guardian${prompt.remainingGuards === 1 ? '' : 's'} to unlock this reward.`
      : prompt.availability === 'healthy'
        ? 'Already at full health. Return when wounded.'
        : cache
          ? 'Open for Ember Edge: +10 basic-attack damage for this expedition.'
          : 'Restore up to 35 health. Can be used once per expedition.';

    this.description.textContent = description;
    this.button.textContent = prompt.availability === 'guarded' ? 'GUARDED'
      : prompt.availability === 'healthy' ? 'HEALTH FULL'
        : cache ? 'OPEN CACHE' : 'USE SHRINE';
    this.button.disabled = prompt.availability !== 'ready';
  }

  hide(): void {
    if (this.root.hidden && this.hint.hidden) return;
    this.hint.hidden = true;
    this.currentId = null;
    this.lastKey = '';
    this.root.hidden = true;
  }

  destroy(): void {
    this.hint.remove();
    this.root.remove();
  }
}
