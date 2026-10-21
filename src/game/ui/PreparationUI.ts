import { CHARACTER_CLASSES, type CharacterClassId } from '../character/CharacterClasses';
import { ACTIVE_SKILLS, SKILL_SLOT_LIMIT, SKILL_SUPPORTS, type AutoSkillSystem } from '../combat/AutoSkillSystem';
import type { SkillProgression } from '../combat/SkillProgression';

export type PreparationStep = 'title' | 'class' | 'skills';

/**
 * Future hideout entry point. No dungeon time, movement or combat advances
 * while this native HTML flow is open. Character preferences are saved by the
 * existing stash; active skill/support selections remain expedition-local.
 */
export class PreparationUI {
  private readonly root: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly contents: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly error: HTMLElement;
  private step: PreparationStep = 'title';
  private open: boolean;

  constructor(
    private readonly getClass: () => CharacterClassId,
    private readonly chooseClass: (id: CharacterClassId) => boolean,
    private readonly skills: AutoSkillSystem,
    private readonly progression: SkillProgression,
    private readonly onEnter: () => void,
    show: boolean,
  ) {
    this.open = show;
    const root = document.createElement('section');
    root.id = 'ashen-preparation-overlay';
    root.className = 'ashen-preparation-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Prepare expedition');
    root.hidden = !show;
    // Never pass a tap through the native overlay to Phaser movement.
    root.addEventListener('pointerdown', event => event.stopPropagation());

    const panel = document.createElement('div');
    panel.className = 'ashen-preparation-panel';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'ashen-preparation-eyebrow';
    eyebrow.textContent = 'THE SANCTUARY · EXPEDITION PREPARATION';
    const heading = document.createElement('h1');
    heading.id = 'ashen-preparation-heading';
    const detail = document.createElement('p');
    detail.className = 'ashen-preparation-detail';
    const contents = document.createElement('div');
    contents.className = 'ashen-preparation-contents';
    const error = document.createElement('p');
    error.className = 'ashen-preparation-error';
    error.setAttribute('role', 'status');
    error.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'ashen-preparation-actions';
    panel.append(eyebrow, heading, detail, contents, error, actions);
    root.append(panel);
    document.body.append(root);
    this.root = root;
    this.heading = heading;
    this.detail = detail;
    this.contents = contents;
    this.error = error;
    this.actions = actions;
    if (show) this.render();
  }

  get isOpen(): boolean { return this.open; }
  get currentStep(): PreparationStep { return this.step; }

  private button(text: string, onClick: () => void, secondary = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = secondary ? 'ashen-preparation-back' : 'ashen-preparation-next';
    button.textContent = text;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private warn(message: string): void {
    this.error.textContent = message;
    this.error.hidden = false;
  }

  private goto(step: PreparationStep): void {
    this.step = step;
    this.render();
  }

  private render(): void {
    if (!this.open) return;
    this.contents.replaceChildren();
    this.actions.replaceChildren();
    this.error.hidden = true;
    if (this.step === 'title') {
      this.root.dataset.step = 'title';
      this.heading.textContent = 'ASHEN DEPTHS';
      this.detail.textContent = 'Build a character. Descend into dangerous dungeons. Extract with the loot and power you have earned. A sanctuary will eventually become your hideout between expeditions.';
      const summary = document.createElement('div');
      summary.className = 'ashen-preparation-summary';
      summary.textContent = `Current adventurer: ${CHARACTER_CLASSES[this.getClass()].name} · Your secured stash, skill discoveries and passive points are retained.`;
      this.contents.append(summary);
      this.actions.append(this.button('PREPARE EXPEDITION', () => this.goto('class')));
      return;
    }

    if (this.step === 'class') {
      this.root.dataset.step = 'class';
      this.heading.textContent = 'Choose your class';
      this.detail.textContent = 'Select your starting combat style. No equipment type is restricted, and learned skills can support hybrid builds. You can choose again before your next expedition.';
      const cards = document.createElement('div');
      cards.className = 'ashen-preparation-classes';
      for (const id of ['vanguard', 'arcanist'] as const) {
        const cls = CHARACTER_CLASSES[id];
        const selected = this.getClass() === id;
        const card = this.button(
          `${cls.name}\n${cls.tagline}\n${cls.health} HP · ${cls.startingSkill.name}\n${selected ? '✓ SELECTED' : 'CHOOSE CLASS'}`,
          () => {
            if (id !== this.getClass() && !this.chooseClass(id)) {
              this.warn('Class selection could not be saved. Check browser storage and try again.');
              return;
            }
            this.render();
          },
          true,
        );
        card.className = 'ashen-preparation-class-choice';
        card.dataset.classId = id;
        card.dataset.selected = String(selected);
        card.setAttribute('aria-label', `Choose ${cls.name}`);
        cards.append(card);
      }
      this.contents.append(cards);
      this.actions.append(
        this.button('BACK', () => this.goto('title'), true),
        this.button('NEXT · SKILLS', () => this.goto('skills')),
      );
      return;
    }

    this.root.dataset.step = 'skills';
    this.heading.textContent = 'Prepare your skills';
    this.detail.textContent = 'Equip up to two different unlocked skills. They activate automatically. Supports modify one equipped skill each. Unlocked discoveries carry over from your prior extractions.';
    const summary = document.createElement('p');
    summary.className = 'ashen-preparation-summary';
    summary.textContent = `${this.skills.equipped.length} / ${SKILL_SLOT_LIMIT} active skills selected`;
    this.contents.append(summary);
    const list = document.createElement('div');
    list.className = 'ashen-preparation-skills';
    for (const skill of ACTIVE_SKILLS) {
      const equipped = this.skills.equipped.some(entry => entry.id === skill.id);
      const learned = this.progression.canUseSkill(skill.id);
      const card = document.createElement('article');
      card.className = 'ashen-preparation-skill';
      const info = document.createElement('span');
      info.textContent = `${skill.name} · ${skill.type.toUpperCase()} · ${skill.damage} damage · ${skill.cooldownSeconds}s cooldown`;
      const action = this.button(!learned ? 'LOCKED' : equipped ? 'REMOVE' : 'EQUIP', () => {
        if (!this.progression.canUseSkill(skill.id)) return;
        const next = equipped
          ? this.skills.equipped.filter(entry => entry.id !== skill.id)
          : [...this.skills.equipped, skill];
        if (next.length > SKILL_SLOT_LIMIT) return;
        this.skills.setEquipped(next);
        this.render();
      });
      action.disabled = !learned || (!equipped && this.skills.equipped.length === SKILL_SLOT_LIMIT);
      action.setAttribute('aria-label', `${equipped ? 'Remove' : 'Equip'} ${skill.name}`);
      card.append(info, action);
      if (equipped) {
        const select = document.createElement('select');
        select.setAttribute('aria-label', `Support for ${skill.name}`);
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'No support';
        select.append(none);
        for (const support of SKILL_SUPPORTS) {
          const option = document.createElement('option');
          option.value = support.id;
          option.textContent = `${support.name} · ${support.description}`;
          option.disabled = !this.progression.canUseSupport(support.id) ||
            this.skills.equipped.some(other => other.id !== skill.id &&
              this.skills.supportFor(other.id)?.id === support.id);
          select.append(option);
        }
        select.value = this.skills.supportFor(skill.id)?.id ?? '';
        select.addEventListener('change', () => {
          if (!select.value || this.progression.canUseSupport(select.value)) {
            this.skills.setSupport(skill.id, select.value || null);
            this.render();
          }
        });
        card.append(select);
      }
      list.append(card);
    }
    this.contents.append(list);
    this.actions.append(
      this.button('BACK', () => this.goto('class'), true),
      this.button('ENTER DUNGEON', () => {
        if (this.skills.equipped.length === 0) {
          this.warn('Equip at least one active skill before entering the dungeon.');
          return;
        }
        this.open = false;
        this.root.hidden = true;
        this.onEnter();
      }),
    );
  }

  destroy(): void { this.root.remove(); }
}
