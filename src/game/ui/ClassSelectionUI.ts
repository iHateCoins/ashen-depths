import { CHARACTER_CLASSES, type CharacterClassId } from '../character/CharacterClasses';

/** Deliberate class selection at the entrance; native buttons work on iPhone. */
export class ClassSelectionUI {
  private readonly toggle: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly warning: HTMLElement;
  private open = false;

  constructor(
    private readonly selected: () => CharacterClassId,
    private readonly canChange: () => boolean,
    private readonly onChoose: (id: CharacterClassId) => boolean,
  ) {
    const toggle = document.createElement('button');
    toggle.id = 'ashen-class-toggle';
    toggle.className = 'ashen-class-toggle';
    toggle.type = 'button';
    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.show();
    });
    const overlay = document.createElement('section');
    overlay.id = 'ashen-class-overlay';
    overlay.className = 'ashen-class-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Character class');
    overlay.setAttribute('aria-modal', 'true');
    overlay.hidden = true;
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    const panel = document.createElement('div');
    panel.className = 'ashen-class-panel';
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Choose your path';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ashen-class-close';
    close.textContent = 'CLOSE';
    close.addEventListener('click', () => this.hide());
    header.append(title, close);
    const intro = document.createElement('p');
    intro.textContent = 'Class determines your starting skill, health and basic attack. Both classes can develop attack, spell or hybrid equipment builds. Change only at the entrance before taking any loot; your selection is saved on this device.';
    const cards = document.createElement('div');
    cards.className = 'ashen-class-cards';
    const warning = document.createElement('p');
    warning.className = 'ashen-class-warning';
    warning.setAttribute('role', 'status');
    warning.hidden = true;
    panel.append(header, intro, cards, warning);
    overlay.append(panel);
    document.body.append(toggle, overlay);
    this.toggle = toggle;
    this.overlay = overlay;
    this.cards = cards;
    this.warning = warning;
    this.refresh();
  }

  get isOpen(): boolean { return this.open; }

  refresh(): void {
    this.toggle.textContent = `CLASS: ${CHARACTER_CLASSES[this.selected()].name.toUpperCase()}`;
    if (!this.open) return;
    this.cards.replaceChildren();
    const current = this.selected();
    const editable = this.canChange();
    for (const key of ['vanguard', 'arcanist'] as const) {
      const cls = CHARACTER_CLASSES[key];
      const card = document.createElement('article');
      card.className = 'ashen-class-card';
      if (current === key) card.dataset.selected = 'true';
      const heading = document.createElement('h3');
      heading.textContent = cls.name;
      const tagline = document.createElement('strong');
      tagline.textContent = cls.tagline;
      const description = document.createElement('p');
      description.textContent = cls.description;
      const stats = document.createElement('span');
      stats.textContent = `${cls.health} starting HP · ${cls.basicRange}px basic attack reach · ${cls.startingSkill.name} auto-skill`;
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'ashen-class-select';
      choose.setAttribute('aria-label', `Choose ${cls.name}`);
      choose.textContent = current === key ? 'SELECTED' : editable ? 'CHOOSE' : 'CAMP ONLY';
      choose.disabled = !editable || current === key;
      choose.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.canChange()) { this.showError('Return to the next expedition entrance to change class.'); return; }
        if (!this.onChoose(key)) {
          this.showError('Class could not be saved. Check local storage and try again. Your current class remains unchanged.');
          return;
        }
        this.warning.hidden = true;
        this.refresh();
      });
      card.append(heading, tagline, description, stats, choose);
      this.cards.append(card);
    }
    if (!editable) this.showError('Class is locked for this expedition. Change before withdrawing equipment or leaving camp on your next run.');
    else this.warning.hidden = true;
  }

  private showError(message: string): void {
    this.warning.textContent = message;
    this.warning.hidden = false;
  }

  private show(): void {
    if (this.open) return;
    this.open = true;
    this.overlay.hidden = false;
    this.refresh();
    this.overlay.querySelector<HTMLButtonElement>('.ashen-class-close')?.focus({ preventScroll: true });
  }
  hide(): void {
    this.open = false;
    this.overlay.hidden = true;
  }
  hideForResult(): void {
    this.hide();
    this.toggle.hidden = true;
  }
  destroy(): void {
    this.toggle.remove();
    this.overlay.remove();
  }
}
