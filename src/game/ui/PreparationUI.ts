import { CHARACTER_CLASSES, type CharacterClassId } from '../character/CharacterClasses';
import { ACTIVE_SKILLS, SKILL_SLOT_LIMIT, SKILL_SUPPORTS, type AutoSkillSystem } from '../combat/AutoSkillSystem';
import type { SkillProgression } from '../combat/SkillProgression';
import type { SecuredStash } from '../loot/SecuredStash';

export type PreparationStep = 'title' | 'class' | 'hideout' | 'skills';

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
  private selectedDepth: number;

  constructor(
    private readonly getClass: () => CharacterClassId,
    private readonly chooseClass: (id: CharacterClassId) => boolean,
    private readonly skills: AutoSkillSystem,
    private readonly progression: SkillProgression,
    private readonly onEnter: (depth: number) => boolean,
    show: boolean,
    private readonly highestUnlockedDepth = 1,
    private readonly stash?: SecuredStash,
  ) {
    this.open = show;
    this.selectedDepth = Math.max(1, Math.min(497, highestUnlockedDepth));
    const saved = this.stash?.skillLoadout;
    if (saved) {
      const skills = ACTIVE_SKILLS.filter(skill => saved.active.includes(skill.id) &&
        this.progression.canUseSkill(skill.id));
      if (skills.length) {
        this.skills.setEquipped(skills);
        for (const skill of skills) {
          this.skills.setSupportCapacity(skill.id, this.stash?.socketsFor(skill.id) ?? 0);
          const supported = (saved.supports[skill.id] ?? []).filter(id => this.progression.canUseSupport(id));
          try { this.skills.setSupports(skill.id, supported); } catch { this.skills.setSupports(skill.id, []); }
        }
      }
    }
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
    eyebrow.textContent = 'THE HIDEOUT · EXPEDITION PREPARATION';
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

  /** Hideout actions are explicitly callable only while preparation is open. */
  addHideoutActions(openStash: () => void, openPassives: () => void): void {
    this.hideoutStash = openStash;
    this.hideoutPassives = openPassives;
    if (this.open) this.render();
  }
  private hideoutStash: (() => void) | null = null;
  private hideoutPassives: (() => void) | null = null;

  private render(): void {
    if (!this.open) return;
    this.contents.replaceChildren();
    this.actions.replaceChildren();
    this.error.hidden = true;
    if (this.step === 'hideout' && (this.hideoutStash || this.hideoutPassives)) {
      const management = document.createElement('div');
      management.className = 'ashen-preparation-actions';
      if (this.hideoutStash) management.append(this.button('HIDEOUT STASH & ITEM FORGE', this.hideoutStash, true));
      if (this.hideoutPassives) management.append(this.button('HIDEOUT PASSIVE TREE', this.hideoutPassives, true));
      this.contents.append(management);
    }
    if (this.step === 'title') {
      this.root.dataset.step = 'title';
      this.heading.textContent = 'ASHEN DEPTHS';
      this.detail.textContent = 'Build a character. Descend into dangerous dungeons. Extract with the loot and power you have earned. Your hideout is your safe place between tower expeditions.';
      const summary = document.createElement('div');
      summary.className = 'ashen-preparation-summary';
      summary.textContent = `Current adventurer: ${CHARACTER_CLASSES[this.getClass()].name} · Your secured stash, skill discoveries and passive points are retained.`;
      this.contents.append(summary);
      if (this.stash?.hasCharacter) {
        this.actions.append(this.button('LOAD CHARACTER', () => this.goto('hideout')));
        this.actions.append(this.button('DELETE SAVE', () => {
          if (!window.confirm('Permanently delete this character, all stored items, progression and tower access? This cannot be undone.')) return;
          if (!this.stash!.deleteCharacter()) {
            this.warn('Deletion failed. Existing save has not been changed.');
            return;
          }
          window.location.reload();
        }, true));
      } else {
        this.actions.append(this.button('NEW GAME', () => this.goto('class')));
      }
      return;
    }

    if (this.step === 'hideout') {
      this.root.dataset.step = 'hideout';
      this.heading.textContent = 'Your Hideout';
      this.detail.textContent = `Your ${CHARACTER_CLASSES[this.getClass()].name} is permanent. Organize equipment, skills, crafting and passives before choosing an expedition.`;
      this.actions.append(this.button('PREPARE EXPEDITION', () => this.goto('skills')));
      this.actions.append(this.button('RETURN TO TITLE', () => this.goto('title'), true));
      return;
    }

    if (this.step === 'class') {
      this.root.dataset.step = 'class';
      this.heading.textContent = 'Choose your class';
      this.detail.textContent = 'Select your starting combat style. No equipment type is restricted, and learned skills can support hybrid builds. Your class is permanent for this character.';
      const cards = document.createElement('div');
      cards.className = 'ashen-preparation-classes';
      for (const id of ['vanguard', 'arcanist'] as const) {
        const cls = CHARACTER_CLASSES[id];
        const selected = this.getClass() === id;
        const card = this.button(
          `${cls.name}\n${cls.tagline}\n${cls.health} HP · ${cls.startingSkill.name}\n${selected ? '✓ SELECTED' : 'CHOOSE CLASS'}`,
          () => {
            if (!this.stash?.hasCharacter && !this.chooseClass(id)) {
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
        this.button('NEXT · STARTING SKILL', () => this.goto('skills')),
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
    const checkpoint = document.createElement('div');
    checkpoint.className = 'ashen-preparation-summary';
    const depthLabel = document.createElement('label');
    depthLabel.textContent = 'Tower entry floor: ';
    const depthSelect = document.createElement('select');
    depthSelect.setAttribute('aria-label', 'Tower entry floor');
    for (let depth = 1; depth <= this.highestUnlockedDepth; depth++) {
      const option = document.createElement('option');
      option.value = String(depth);
      option.textContent = depth === this.highestUnlockedDepth ? `Depth ${depth} · Highest unlocked` : `Depth ${depth}`;
      depthSelect.append(option);
    }
    depthSelect.value = String(this.selectedDepth);
    depthSelect.addEventListener('change', () => { this.selectedDepth = Number(depthSelect.value); });
    depthLabel.append(depthSelect);
    checkpoint.append(depthLabel);
    this.contents.append(checkpoint);
    const list = document.createElement('div');
    list.className = 'ashen-preparation-skills';
    for (const skill of ACTIVE_SKILLS) {
      const socketCount = this.stash?.socketsFor(skill.id) ?? 0;
      const equipped = this.skills.equipped.some(entry => entry.id === skill.id);
      const learned = this.progression.canUseSkill(skill.id);
      const card = document.createElement('article');
      card.className = 'ashen-preparation-skill';
      const info = document.createElement('span');
      info.textContent = `${skill.name} · ${skill.type.toUpperCase()} · ${skill.damage} damage · ${skill.cooldownSeconds}s cooldown · ${socketCount}/6 support sockets`;
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
      if (learned && this.stash) {
        const craft = this.button(`FORGE SOCKET · 1 EMBER (${this.stash.forgeEmbers} held)`, () => {
          const result = this.stash!.craftSkillSocket(skill.id);
          if (result === 'storage-error' || result === 'no-embers') {
            this.warn(result === 'no-embers' ? 'No secured Forge Embers available.' : 'Crafting could not be saved. No Ember consumed.');
            return;
          }
          if (result !== 'invalid-skill') {
            this.skills.setSupportCapacity(skill.id, this.stash!.socketsFor(skill.id));
            this.render();
            this.warn(result === 'added' ? 'Socket added.' : result === 'removed' ? 'Socket removed.' : 'No socket change. Ember consumed.');
          }
        }, true);
        craft.disabled = this.stash.forgeEmbers < 1;
        card.append(craft);
      }
      if (equipped) {
        this.skills.setSupportCapacity(skill.id, socketCount);
        const assigned = this.skills.supportsFor(skill.id).map(support => support.id);
        const legend = document.createElement('p');
        legend.textContent = `Support modifiers: ${assigned.length} / ${socketCount} sockets filled`;
        card.append(legend);
        for (const support of SKILL_SUPPORTS) {
          const active = assigned.includes(support.id);
          const assignedElsewhere = this.skills.equipped.some(other => other.id !== skill.id &&
            this.skills.supportsFor(other.id).some(used => used.id === support.id));
          const button = this.button(
            `${active ? '✓ REMOVE' : 'ADD'} · ${support.name} · ${support.description}`, () => {
              const next = active ? assigned.filter(id => id !== support.id) : [...assigned, support.id];
              try {
                this.skills.setSupports(skill.id, next);
                this.render();
              } catch {
                this.warn('Support could not be assigned. Check the available sockets.');
              }
            }, true);
          button.disabled = !this.progression.canUseSupport(support.id) ||
            (!active && (assigned.length >= socketCount || assignedElsewhere));
          card.append(button);
        }
      }
      list.append(card);
    }
    this.contents.append(list);
    this.actions.append(
      this.button('BACK', () => this.goto(this.stash?.completedExpeditions || this.stash?.highestUnlockedDepth !== 1 ? 'hideout' : 'class'), true),
      this.button('ENTER DUNGEON', () => {
        if (this.skills.equipped.length === 0) {
          this.warn('Equip at least one active skill before entering the dungeon.');
          return;
        }
        if (this.stash) {
          const active = this.skills.equipped.map(skill => skill.id);
          const supports = Object.fromEntries(active.map(id =>
            [id, this.skills.supportsFor(id).map(support => support.id)]));
          if (!this.stash.saveSkillLoadout(active, supports)) {
            this.warn('Skill loadout could not be saved. Expedition has not started.');
            return;
          }
        }
        if (!this.onEnter(this.selectedDepth)) {
          this.warn('Expedition could not begin. Equipment remains safe in the hideout. Check storage and retry.');
          return;
        }
        this.open = false;
        this.root.hidden = true;
      }),
    );
  }

  destroy(): void { this.root.remove(); }
}
