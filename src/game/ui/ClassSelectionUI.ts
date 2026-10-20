import { CHARACTER_CLASSES, type CharacterClassId } from '../character/CharacterClasses';
import { PASSIVE_TREES, passiveEffects, type PassiveAllocationResult } from '../character/PassiveTrees';

/** Deliberate class selection at the entrance; native buttons work on iPhone. */
export class ClassSelectionUI {
  private readonly toggle: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly warning: HTMLElement;
  private readonly passiveSummary: HTMLElement;
  private readonly tree: HTMLElement;
  private open = false;

  constructor(
    private readonly selected: () => CharacterClassId,
    private readonly canChange: () => boolean,
    private readonly onChoose: (id: CharacterClassId) => boolean,
    private readonly passiveCounts: () => { banked: number; pending: number },
    private readonly allocationState: () => { selected: readonly string[]; available: number; canAllocate: boolean },
    private readonly onAllocate: (id: string) => PassiveAllocationResult | 'storage-error',
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
    const passiveSummary = document.createElement('p');
    passiveSummary.id = 'ashen-passive-summary';
    passiveSummary.className = 'ashen-class-passive-summary';
    const cards = document.createElement('div');
    cards.className = 'ashen-class-cards';
    const tree = document.createElement('section');
    tree.className = 'ashen-passive-tree';
    tree.id = 'ashen-passive-tree';
    tree.setAttribute('aria-label', 'Passive skill tree');
    const warning = document.createElement('p');
    warning.className = 'ashen-class-warning';
    warning.setAttribute('role', 'status');
    warning.hidden = true;
    panel.append(header, intro, passiveSummary, cards, tree, warning);
    overlay.append(panel);
    document.body.append(toggle, overlay);
    this.toggle = toggle;
    this.overlay = overlay;
    this.cards = cards;
    this.warning = warning;
    this.passiveSummary = passiveSummary;
    this.tree = tree;
    this.refresh();
  }

  get isOpen(): boolean { return this.open; }

  updatePassiveStatus(): void {
    const { banked, pending } = this.passiveCounts();
    this.toggle.textContent = `CLASS: ${CHARACTER_CLASSES[this.selected()].name.toUpperCase()} · PASSIVES ${banked}${pending ? ` (+${pending} RISK)` : ''}`;
    const state=this.allocationState();
    this.passiveSummary.textContent = `Passive points: ${banked} secured · ${pending} unsecured · ${state.selected.length} spent · ${state.available} available. Defeat the Warden at new even-numbered depths (2, 4, 6…) and extract to bank them. Only secured points can be spent at the initial camp.`;
  }

  refresh(): void {
    this.updatePassiveStatus();
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
    this.renderTree();
  }

  private renderTree(): void {
    this.tree.replaceChildren();
    const cls=this.selected();
    const state=this.allocationState();
    const nodes=PASSIVE_TREES[cls];
    const h3=document.createElement('h3');
    h3.textContent = `${CHARACTER_CLASSES[cls].name} passive tree`;
    const hint=document.createElement('p');
    hint.textContent='Three paths: Assault, Ward and Hybrid. Each node costs 1 secured point and requires its preceding node. Choices are permanent for now; no free respec.';
    this.tree.append(h3,hint);
    const branches=document.createElement('div');
    branches.className='ashen-passive-branches';
    for(const branchId of ['assault','ward','hybrid'] as const){
      const lane=document.createElement('section');
      lane.className='ashen-passive-lane';
      const laneTitle=document.createElement('h4');
      laneTitle.textContent=branchId==='assault'?'Assault':branchId==='ward'?'Ward':'Hybrid';
      lane.append(laneTitle);
      for(const node of nodes.filter(item=>item.branch===branchId)){
        const learned=state.selected.includes(node.id);
        const eligible=node.requires.every(req=>state.selected.includes(req));
        const button=document.createElement('button');
        button.className='ashen-passive-node';
        button.type='button';
        button.dataset.nodeId=node.id;
        button.dataset.allocated=String(learned);
        button.setAttribute('aria-label',`Allocate ${node.name}`);
        button.disabled=learned || !eligible || state.available<=0 || !state.canAllocate;
        const name=document.createElement('strong');
        name.textContent=`${node.tier}. ${node.name}`;
        const detail=document.createElement('span');
        detail.textContent=node.description;
        const status=document.createElement('span');
        status.className='ashen-passive-node-status';
        status.textContent=learned?'ALLOCATED':!eligible?'PREREQUISITE':!state.canAllocate?'ENTRANCE CAMP ONLY':state.available===0?'NO SECURED POINTS':'SPEND 1 POINT';
        button.append(name,detail,status);
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          const result=this.onAllocate(node.id);
          if(result==='allocated'){this.warning.hidden=true;this.refresh();}
          else this.showError(result==='storage-error'
            ? 'Passive allocation could not be saved. No point was spent; try again.'
            : 'This node cannot be allocated yet. Check secured points and prerequisites.');
        });
        lane.append(button);
      }
      branches.append(lane);
    }
    this.tree.append(branches);
    const effects=passiveEffects(cls,state.selected);
    const summary=document.createElement('p');
    summary.className='ashen-passive-effects';
    summary.textContent=`Current permanent bonuses: +${effects.attack} Attack · +${effects.spell} Spell · +${effects.armor} Armor · +${effects.health} HP · ${effects.cooldownReduction}% faster skill cooldowns`;
    this.tree.append(summary);
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
