import type { SkillProgression } from '../combat/SkillProgression';
import { ACTIVE_SKILLS, SKILL_SLOT_LIMIT, SKILL_SUPPORTS, type AutoSkillDefinition, type AutoSkillSystem } from '../combat/AutoSkillSystem';

/**
 * Expedition-only active skill selection. No purchased/unlocked skills or
 * persistent character progression are introduced in this milestone.
 * The simulation pauses while the dialog is open. Supports have one socket per
 * equipped skill and are exclusive by support ID within a loadout.
 */
export class SkillLoadoutUI {
  private readonly toggle: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly list: HTMLElement;
  private readonly summary: HTMLElement;
  private open = false;

  constructor(
    private readonly skills: AutoSkillSystem,
    private readonly canOpen: () => boolean,
    private readonly onOpen: () => void,
    private readonly canModify: () => boolean,
    private readonly progression: SkillProgression,
  ) {
    this.toggle = document.createElement('button');
    this.toggle.id = 'ashen-skills-toggle';
    this.toggle.className = 'ashen-skills-toggle';
    this.toggle.type = 'button';
    this.toggle.textContent = 'SKILLS';
    this.toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.show();
    });

    const overlay = document.createElement('section');
    overlay.id = 'ashen-skills-overlay';
    overlay.className = 'ashen-skills-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Active skills');

    const panel = document.createElement('div');
    panel.className = 'ashen-skills-panel';
    const header = document.createElement('header');
    header.className = 'ashen-skills-header';
    const heading = document.createElement('h2');
    heading.textContent = 'Active Skills';
    const close = document.createElement('button');
    close.className = 'ashen-skills-close';
    close.type = 'button';
    close.textContent = 'CLOSE';
    close.addEventListener('click', () => this.hide());
    header.append(heading, close);

    const description = document.createElement('p');
    description.className = 'ashen-skills-description';
    description.textContent = 'Equip up to two different skills at entrance camp. They cast automatically on enemies in range. Attach one trade-off support per equipped skill. Each support can be assigned to only one skill. You may inspect your loadout later, but changes must wait for your next expedition.';
    const summary = document.createElement('p');
    summary.id = 'ashen-skills-summary';
    summary.className = 'ashen-skills-summary';
    const list = document.createElement('div');
    list.className = 'ashen-skills-list';

    panel.append(header, description, summary, list);
    overlay.append(panel);
    // Ignore taps on the modal: they must not issue a move order.
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    document.body.append(this.toggle, overlay);
    this.overlay = overlay;
    this.list = list;
    this.summary = summary;
  }

  get isOpen(): boolean { return this.open; }

  private show(): void {
    if (this.open || !this.canOpen()) return;
    this.onOpen(); // Cancels any active waystone channel before pausing.
    this.open = true;
    this.overlay.hidden = false;
    this.render();
    this.overlay.querySelector<HTMLButtonElement>('.ashen-skills-close')?.focus();
  }

  private render(): void {
    const selected = this.skills.equipped;
    const editable = this.canModify();
    this.summary.textContent = `${selected.length} / ${SKILL_SLOT_LIMIT} slots · ${selected.length ? selected.map(skill => skill.name).join(' + ') : 'No skills equipped'}${editable ? '' : ' · Changes available at camp only'}`;
    this.list.replaceChildren();
    // Attack skills scale with Attack Power; spells scale with Spell Power.

    for (const skill of ACTIVE_SKILLS) {
      const equipped = selected.some(item => item.id === skill.id);
      const learned = this.progression.canUseSkill(skill.id);
      const card = document.createElement('article');
      card.className = 'ashen-skill-card';
      const details = document.createElement('div');
      details.className = 'ashen-skill-details';
      const name = document.createElement('strong');
      name.textContent = skill.name;
      const category = document.createElement('span');
      category.className = 'ashen-skill-type';
      category.textContent = `${skill.type.toUpperCase()} · Scales with ${skill.type === 'attack' ? 'Attack Power' : 'Spell Power'}`;
      const stats = document.createElement('span');
      stats.textContent = `${skill.damage} damage · ${skill.radius}px area · ${skill.range}px range · ${skill.cooldownSeconds}s cooldown`;
      if (equipped) {
        const effective = this.skills.effectiveStats(skill.id);
        stats.textContent = `${effective.damage} damage · ${effective.radius}px area · ${effective.range}px range · ${effective.cooldownSeconds}s cooldown`;
        const supportDescription = document.createElement('span');
        supportDescription.className = 'ashen-skill-support-detail';
        supportDescription.textContent = this.skills.supportFor(skill.id)?.description ?? 'No support modifier';
        details.append(name, category, stats, supportDescription);
      } else {
        details.append(name, category, stats);
      }

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'ashen-skill-equip';
      action.textContent = !learned ? 'LOCKED' : !editable ? 'CAMP ONLY' : equipped ? 'UNEQUIP' : selected.length >= SKILL_SLOT_LIMIT ? 'SLOTS FULL' : 'EQUIP';
      action.disabled = !learned || !editable || (!equipped && selected.length >= SKILL_SLOT_LIMIT);
      action.setAttribute('aria-label', `${equipped ? 'Unequip' : 'Equip'} ${skill.name}`);
      action.addEventListener('click', event => {
        if (!this.canModify() || !this.progression.canUseSkill(skill.id)) return;
        event.preventDefault();
        event.stopPropagation();
        const current = this.skills.equipped;
        const updated: AutoSkillDefinition[] = equipped
          ? current.filter(item => item.id !== skill.id)
          : [...current, skill];
        this.skills.setEquipped(updated);
        this.render();
      });
      card.append(details, action);
      if (equipped) {
        const supportRow = document.createElement('label');
        supportRow.className = 'ashen-skill-support-row';
        supportRow.textContent = 'Support modifier';
        const select = document.createElement('select');
        select.className = 'ashen-skill-support-select';
        select.setAttribute('aria-label', `Support for ${skill.name}`);
        select.disabled = !editable;
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'None';
        select.append(none);
        for (const support of SKILL_SUPPORTS) {
          const option = document.createElement('option');
          option.value = support.id;
          option.textContent = `${support.name} · ${support.description}`;
          option.disabled = !this.progression.canUseSupport(support.id) || selected.some(other =>
            other.id !== skill.id && this.skills.supportFor(other.id)?.id === support.id);
          select.append(option);
        }
        select.value = this.skills.supportFor(skill.id)?.id ?? '';
        select.addEventListener('change', () => {
          if (!this.canModify() || (select.value && !this.progression.canUseSupport(select.value))) return;
          this.skills.setSupport(skill.id, select.value || null);
          this.render();
        });
        supportRow.append(select);
        card.append(supportRow);
      }
      this.list.append(card);
    }
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
