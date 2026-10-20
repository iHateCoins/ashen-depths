import { type RewardSource, type SkillProgression } from '../combat/SkillProgression';

/** Non-blocking expedition discoveries. Only extraction secures choices. */
export class SkillRewardUI {
  private readonly toggle: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly list: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly count: HTMLElement;
  private open = false;
  private source: RewardSource | null = null;

  constructor(
    private readonly progression: SkillProgression,
    private readonly canOpen: () => boolean,
    private readonly onOpen: () => void,
  ) {
    this.toggle = document.createElement('button');
    this.toggle.id = 'ashen-reward-toggle';
    this.toggle.className = 'ashen-reward-toggle';
    this.toggle.type = 'button';
    this.toggle.hidden = true;
    this.toggle.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); this.show();
    });
    this.overlay = document.createElement('section');
    this.overlay.id = 'ashen-reward-overlay';
    this.overlay.className = 'ashen-skills-overlay';
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Choose expedition discovery');
    const panel = document.createElement('div');
    panel.className = 'ashen-skills-panel';
    const header = document.createElement('header');
    header.className = 'ashen-skills-header';
    this.heading = document.createElement('h2');
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = 'CLOSE';
    close.className = 'ashen-skills-close';
    close.addEventListener('click', () => this.hide());
    header.append(this.heading, close);
    const intro = document.createElement('p');
    intro.className = 'ashen-skills-description';
    intro.textContent = 'Choose one discovery. It remains AT RISK until you extract alive. New skills and supports become usable in later expeditions. Forge Embers can be spent on secured gear at your next entrance camp.';
    this.count = document.createElement('p');
    this.count.className = 'ashen-skills-summary';
    this.list = document.createElement('div');
    this.list.className = 'ashen-skills-list';
    panel.append(header, intro, this.count, this.list);
    this.overlay.append(panel);
    this.overlay.addEventListener('pointerdown', event => event.stopPropagation());
    document.body.append(this.toggle, this.overlay);
  }

  get isOpen(): boolean { return this.open; }

  refresh(): void {
    const n = this.progression.choicesRemaining.length;
    this.toggle.hidden = n === 0 || !this.canOpen();
    this.toggle.textContent = `CLAIM REWARDS ${n}`;
    this.toggle.title = n ? `${n} reward choice(s) waiting. Choose before extraction or lose them.` : 'All discoveries claimed';
    if (this.open) this.render();
  }

  private show(): void {
    if (!this.canOpen() || this.open || !this.progression.choicesRemaining.length) return;
    this.onOpen();
    this.open = true;
    this.overlay.hidden = false;
    this.render();
  }

  private render(): void {
    this.source = this.progression.choicesRemaining[0] ?? null;
    if (!this.source) { this.hide(); this.refresh(); return; }
    this.heading.textContent = this.source.startsWith('cache') ? 'Sealed Cache Discovery' : 'Warden Discovery';
    this.count.textContent = `${this.progression.choicesRemaining.length} reward choice(s) · ${this.progression.pendingUnlocks.length} unsecured unlocks · ${this.progression.pendingForgeEmbers} unsecured Forge Embers`;
    this.list.replaceChildren();
    for (const choice of this.progression.rewardChoices) {
      const card = document.createElement('article');
      card.className = 'ashen-skill-card';
      const details = document.createElement('div');
      details.className = 'ashen-skill-details';
      const title = document.createElement('strong');
      title.textContent = choice.label;
      const description = document.createElement('span');
      description.textContent = choice.description;
      details.append(title, description);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ashen-skill-equip';
      button.textContent = 'CHOOSE';
      button.setAttribute('aria-label', `Choose ${choice.label}`);
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        if (!this.source || !this.progression.choose(this.source, choice.id)) return;
        this.render();
      });
      card.append(details, button);
      this.list.append(card);
    }
  }

  hide(): void { this.open = false; this.overlay.hidden = true; }
  hideForResult(): void { this.hide(); this.toggle.hidden = true; }
  destroy(): void { this.toggle.remove(); this.overlay.remove(); }
}
