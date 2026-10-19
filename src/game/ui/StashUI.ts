import { affixSummary, type ExpeditionLoot, type LootItem } from '../loot/ExpeditionLoot';
import { SecuredStash } from '../loot/SecuredStash';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string, label?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (label) node.textContent = label;
  return node;
}

/**
 * The stash can be inspected during any run, but withdrawals are only
 * permitted at the safe entrance before the expedition has begun.
 * Nothing collected in the dungeon can be deposited here; successful exit
 * is the sole way to secure fresh drops or worn gear.
 */
export class StashUI {
  private readonly toggle: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly items: HTMLElement;
  private readonly instructions: HTMLElement;
  private readonly count: HTMLElement;
  private readonly onWithdraw: (id: string) => void;
  private readonly onReforge: (id: string, affixIndex: number) => boolean;
  private forgeNotice = '';
  private armedForge: { id: string; index: number } | null = null;
  private open = false;
  private canWithdraw = false;
  private isBagFull = false;
  private lastSignature = '';

  constructor(
    private readonly stash: SecuredStash,
    private readonly loot: ExpeditionLoot,
    onWithdraw: (id: string) => void,
    onReforge: (id: string, affixIndex: number) => boolean,
  ) {
    this.onWithdraw = onWithdraw;
    this.onReforge = onReforge;
    this.toggle = element('button', 'ashen-stash-toggle', 'STASH');
    this.toggle.id = 'ashen-stash-toggle';
    this.toggle.type = 'button';
    this.toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openStash();
    });
    document.body.append(this.toggle);

    this.overlay = element('section', 'ashen-stash-overlay');
    this.overlay.id = 'ashen-stash-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Secured stash');
    this.overlay.hidden = true;
    const panel = element('div', 'ashen-stash-panel');
    const heading = element('div', 'ashen-stash-header');
    heading.append(element('h2', '', 'Secured Stash'));
    const close = element('button', 'ashen-stash-close', 'CLOSE');
    close.type = 'button';
    close.addEventListener('click', () => this.closeStash());
    heading.append(close);

    const instructions = element('p', 'ashen-stash-instructions');
    const count = element('p', 'ashen-stash-count');
    const items = element('div', 'ashen-stash-items');
    panel.append(heading, instructions, count, items);
    this.overlay.append(panel);
    document.body.append(this.overlay);
    this.instructions = instructions;
    this.count = count;
    this.items = items;
    this.refresh(true, false);
  }

  get isOpen(): boolean { return this.open; }

  openStash(): void {
    this.open = true;
    this.overlay.hidden = false;
    this.render();
    const close = this.overlay.querySelector('button.ashen-stash-close');
    if (close instanceof HTMLButtonElement) close.focus({ preventScroll: true });
  }

  closeStash(): void {
    this.open = false;
    this.overlay.hidden = true;
    this.lastSignature = '';
    this.armedForge = null;
  }

  refresh(canWithdraw: boolean, bagFull: boolean): void {
    this.canWithdraw = canWithdraw && this.stash.status === 'ready';
    this.isBagFull = bagFull;
    const signature = [
      this.stash.status, this.stash.count, this.stash.completedExpeditions,
      this.stash.forgeEmbers, this.stash.spendableForgeEmbers,
      canWithdraw, bagFull,
    ].join('|');
    if (this.lastSignature === signature) return;
    this.lastSignature = signature;
    this.toggle.textContent = this.stash.status === 'ready'
      ? `STASH ${this.stash.count}` : 'STASH ERROR';
    this.toggle.title = this.stash.status === 'ready'
      ? 'View secured equipment' : 'Stored equipment unavailable — open for details';
    if (this.open) this.render();
  }

  private render(): void {
    const status = this.stash.status;
    if (status !== 'ready') {
      this.instructions.textContent = status === 'corrupt'
        ? 'Saved stash data could not be verified. The original save is preserved; no gear will be overwritten. Resolve storage before securing new loot.'
        : 'On-device storage is unavailable. The game cannot secure gear on this device until storage is enabled.';
      this.count.textContent = 'Storage unavailable';
      this.items.replaceChildren();
      return;
    }

    this.instructions.textContent = this.canWithdraw
      ? 'At entrance camp, WITHDRAW risks equipment in this expedition. FORGE is ONCE PER ITEM, permanently. 25% ERASE affix, 20% CURSE it (negative stat), 55% random reroll. Confirm the risk before committing 1 Ember; results save instantly. Embers earned during a run are usable next expedition.'
      : 'View only after leaving camp. On your next expedition you can withdraw gear or spend secured Forge Embers on stored gear. Loot can only be secured through extraction.';
    this.count.textContent = `${this.stash.count} secured items · ${this.stash.forgeEmbers} Forge Ember${this.stash.forgeEmbers === 1 ? '' : 's'} (${this.stash.spendableForgeEmbers} usable this run) · ${this.stash.completedExpeditions} successful expedition${this.stash.completedExpeditions === 1 ? '' : 's'}${this.forgeNotice ? ' · ' + this.forgeNotice : ''}`;
    this.items.replaceChildren();
    const items = this.stash.items;
    if (!items.length) {
      this.items.append(element('p', 'ashen-stash-empty',
        'No secured gear yet. Defeat the Warden, collect gear, then Finish Expedition to store it here.'));
      return;
    }
    for (const item of items) this.items.append(this.renderItem(item));
  }

  private renderItem(item: LootItem): HTMLElement {
    const card = element('article', 'ashen-stash-item');
    const details = element('div', 'ashen-stash-item-details');
    const name = element('strong', '', item.name);
    name.style.color = item.rarity === 'rare' ? '#f4d280'
      : item.rarity === 'magic' ? '#88b9f9' : '#ced3d4';
    const type = element('span', '', `${item.rarity.toUpperCase()} · ${item.slot.toUpperCase()} · LEVEL ${item.itemLevel}`);
    details.append(name, type);
    if (item.forged) details.append(element('span', 'ashen-stash-forged',
      `FORGED — ${item.forgeOutcome === 'erased' ? 'AFFIX ERASED' : item.forgeOutcome === 'cursed' ? 'CURSED' : 'REFORGED'} · No attempts remaining`));
    for (const [index, affix] of item.affixes.entries()) {
      const affixRow = element('div', 'ashen-stash-affix-row');
      affixRow.append(element('span', '', affixSummary(affix)));
      const armed = this.armedForge?.id === item.id && this.armedForge.index === index;
      const reforge = element('button', 'ashen-stash-reforge',
        item.forged ? 'FORGED · NO ATTEMPTS' : armed ? 'CONFIRM FORGE RISK' : 'FORGE 1 EMBER');
      reforge.type = 'button';
      reforge.disabled = item.forged === true || !this.canWithdraw || this.stash.spendableForgeEmbers < 1;
      reforge.setAttribute('aria-label', armed
        ? `Confirm forge ${affix.label} on ${item.name}`
        : `Reforge ${affix.label} on ${item.name}`);
      reforge.title = item.forged ? 'Lifetime forge attempt already spent'
        : !this.canWithdraw ? 'Only available at entrance camp'
          : this.stash.spendableForgeEmbers < 1 ? 'Requires an Ember secured before this run'
            : '25% removal, 20% negative stat, 55% random reroll. Permanent one-use attempt.';
      reforge.addEventListener('click', () => {
        if (item.forged || !this.canWithdraw || this.stash.spendableForgeEmbers < 1) return;
        if (!armed) {
          this.armedForge = { id: item.id, index };
          this.forgeNotice = 'CONFIRM to risk erasing or cursing this affix. One attempt per item, forever.';
          this.render();
          return;
        }
        this.armedForge = null;
        const ok = this.onReforge(item.id, index);
        const result = this.stash.items.find(stored => stored.id === item.id);
        this.forgeNotice = ok
          ? result?.forgeOutcome === 'erased' ? 'AFFIX ERASED — item permanently forged'
            : result?.forgeOutcome === 'cursed' ? 'CURSED — affix now applies a negative stat permanently'
            : 'Affix rerolled — item permanently forged'
          : 'Forge could not be saved; no Ember spent and attempt remains available';
        this.lastSignature = '';
        this.refresh(this.canWithdraw, this.loot.bagFull);
      });
      affixRow.append(reforge);
      if (armed && !item.forged) affixRow.append(element('span', 'ashen-stash-forge-warning',
        'Permanent: 25% erase · 20% curse · 55% reroll. No second chance.'));
      details.append(affixRow);
    }
    const withdraw = element('button', 'ashen-stash-withdraw', 'WITHDRAW');
    withdraw.type = 'button';
    withdraw.disabled = !this.canWithdraw || this.isBagFull;
    withdraw.setAttribute('aria-label', `Withdraw ${item.name}`);
    if (this.isBagFull) withdraw.title = 'Expedition bag full';
    else if (!this.canWithdraw) withdraw.title = 'Available at camp before departure';
    withdraw.addEventListener('click', () => {
      this.onWithdraw(item.id);
      this.lastSignature = '';
      this.refresh(this.canWithdraw, this.loot.bagFull);
      this.render();
    });
    card.append(details, withdraw);
    return card;
  }

  hideForResult(): void {
    this.closeStash();
    this.toggle.hidden = true;
  }

  destroy(): void {
    this.toggle.remove();
    this.overlay.remove();
  }
}
