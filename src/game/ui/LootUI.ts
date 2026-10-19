import type { ExpeditionLoot, GroundLoot, LootItem, ItemRarity, EquipmentSlot } from '../loot/ExpeditionLoot';
import {
  EQUIPMENT_SLOTS, EquipmentLoadout, itemBonuses, type EquipmentStats,
} from '../loot/EquipmentLoadout';

const RARITY_COLOR: Readonly<Record<ItemRarity, string>> = {
  common: '#ced3d4',
  magic: '#88b9f9',
  rare: '#f4d280',
};

function createElement<K extends keyof HTMLElementTagNameMap>(
  name: K, className: string, text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function statLines(stats: EquipmentStats): string {
  return `Attack +${stats.attack} · Spell +${stats.spell} · Armor ${stats.armor} · Health +${stats.health}`;
}

function previewDifference(current: EquipmentStats, next: EquipmentStats): string {
  const parts: string[] = [];
  for (const [key, label] of [
    ['attack', 'Attack'], ['spell', 'Spell'], ['armor', 'Armor'], ['health', 'Health'],
  ] as const) {
    const diff = next[key] - current[key];
    if (diff) parts.push(`${diff > 0 ? '+' : ''}${diff} ${label}`);
  }
  return parts.length ? `If equipped: ${parts.join(' · ')}` : 'If equipped: no change';
}

/**
 * Native iPhone-safe inventory. The bag and three worn equipment slots have
 * separate ownership; both are unsecured until the later extraction system.
 * A deliberate EQUIP tap replaces existing equipment atomically, and UNEQUIP
 * respects the bag's 24-slot capacity.
 */
export class LootUI {
  private readonly button: HTMLButtonElement;
  private readonly finishButton: HTMLButtonElement;
  private readonly finishWarning: HTMLElement;
  private victoryOffered = false;
  private readonly nearbyPanel: HTMLElement;
  private readonly nearbyTitle: HTMLElement;
  private readonly nearbyDescription: HTMLElement;
  private readonly pickupButton: HTMLButtonElement;
  private readonly bagOverlay: HTMLElement;
  private readonly bagList: HTMLElement;
  private readonly bagCount: HTMLElement;
  private readonly equipmentList: HTMLElement;
  private readonly statsLine: HTMLElement;
  private highlightedDrop: GroundLoot | null = null;
  private lastSignature = '';
  private open = false;

  constructor(
    private readonly loot: ExpeditionLoot,
    private readonly equipment: EquipmentLoadout,
    private readonly onPickup: (id: string) => void,
    private readonly onDiscard: (id: string) => void,
    private readonly onEquip: (id: string) => void,
    private readonly onUnequip: (slot: EquipmentSlot) => void,
  ) {
    const bagButton = createElement('button', 'ashen-bag-toggle', `BAG 0 / ${loot.capacity}`);
    bagButton.id = 'ashen-bag-toggle';
    bagButton.type = 'button';
    bagButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openBag();
    });
    document.body.append(bagButton);
    this.button = bagButton;

    const finish = createElement('button', 'ashen-finish-run', 'FINISH EXPEDITION');
    finish.id = 'ashen-finish-run';
    finish.type = 'button';
    finish.hidden = true;
    document.body.append(finish);
    this.finishButton = finish;
    const finishWarning = createElement('p', 'ashen-finish-warning');
    finishWarning.id = 'ashen-finish-warning';
    finishWarning.hidden = true;
    finishWarning.setAttribute('role', 'alert');
    document.body.append(finishWarning);
    this.finishWarning = finishWarning;

    const nearby = createElement('aside', 'ashen-loot-nearby');
    nearby.id = 'ashen-loot-nearby';
    nearby.hidden = true;
    nearby.setAttribute('role', 'region');
    nearby.setAttribute('aria-label', 'Nearby loot');

    const title = createElement('strong', 'ashen-loot-title');
    const description = createElement('span', 'ashen-loot-description');
    const pickup = createElement('button', 'ashen-loot-pickup', 'PICK UP');
    pickup.type = 'button';
    pickup.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (this.highlightedDrop && !this.loot.bagFull) this.onPickup(this.highlightedDrop.id);
    });
    nearby.append(title, description, pickup);
    document.body.append(nearby);
    this.nearbyPanel = nearby;
    this.nearbyTitle = title;
    this.nearbyDescription = description;
    this.pickupButton = pickup;

    const overlay = createElement('section', 'ashen-bag-overlay');
    overlay.id = 'ashen-bag-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Expedition bag');

    const panel = createElement('div', 'ashen-bag-panel');
    const header = createElement('div', 'ashen-bag-header');
    const heading = createElement('h2', '', 'Expedition Bag & Gear');
    const close = createElement('button', 'ashen-bag-close', 'CLOSE');
    close.type = 'button';
    close.addEventListener('click', () => this.closeBag());
    header.append(heading, close);

    const warning = createElement('p', 'ashen-bag-warning',
      'UNSECURED LOOT — worn and carried gear is lost on death. Finish the Warden expedition to secure it in your on-device stash.');
    const equipmentHeading = createElement('h3', 'ashen-gear-heading', 'Equipped Gear');
    const equipmentList = createElement('div', 'ashen-equipment-list');
    const stats = createElement('p', 'ashen-equipment-stats');
    stats.id = 'ashen-equipment-stats';
    const bagHeading = createElement('h3', 'ashen-gear-heading', 'Carried Equipment');
    const count = createElement('p', 'ashen-bag-count');
    const list = createElement('div', 'ashen-bag-list');
    panel.append(header, warning, equipmentHeading, equipmentList, stats, bagHeading, count, list);
    overlay.append(panel);
    document.body.append(overlay);
    this.bagOverlay = overlay;
    this.bagCount = count;
    this.bagList = list;
    this.equipmentList = equipmentList;
    this.statsLine = stats;

    this.refresh(null);
  }

  get isOpen(): boolean { return this.open; }

  /** The Warden drop remains accessible until the player finishes the run. */
  enableFinish(onFinish: () => void): void {
    if (this.victoryOffered) return;
    this.victoryOffered = true;
    this.finishButton.hidden = false;
    this.finishButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.closeBag();
      // Do not hide the control until the scene confirms a successful
      // persistent stash write. Storage errors must allow retry.
      onFinish();
    });
  }

  showFinishError(message: string): void {
    this.finishWarning.textContent = message;
    this.finishWarning.hidden = false;
  }

  openBag(): void {
    this.open = true;
    this.bagOverlay.hidden = false;
    this.nearbyPanel.hidden = true;
    this.renderBag();
    const close = this.bagOverlay.querySelector('button.ashen-bag-close');
    if (close instanceof HTMLButtonElement) close.focus({ preventScroll: true });
  }

  closeBag(): void {
    this.open = false;
    this.bagOverlay.hidden = true;
    this.lastSignature = '';
  }

  private renderBag(): void {
    this.bagCount.textContent = `${this.loot.bag.length} / ${this.loot.capacity} bag slots used`;
    this.statsLine.textContent = `Worn bonuses: ${statLines(this.equipment.stats)}`;

    this.equipmentList.replaceChildren();
    for (const slot of EQUIPMENT_SLOTS) {
      const item = this.equipment.get(slot);
      const card = createElement('article', 'ashen-equipped-slot');
      card.dataset.slot = slot;
      const description = createElement('div', 'ashen-bag-item-details');
      const heading = createElement('strong', '', slot.toUpperCase());
      description.append(heading);
      if (item) {
        const name = createElement('span', '', item.name);
        name.style.color = RARITY_COLOR[item.rarity];
        description.append(name, createElement('span', '', statLines(itemBonuses(item))));
        const unequip = createElement('button', 'ashen-bag-unequip', 'UNEQUIP');
        unequip.type = 'button';
        unequip.setAttribute('aria-label', `Unequip ${slot}`);
        unequip.disabled = this.loot.bagFull;
        if (unequip.disabled) unequip.title = 'Bag is full';
        unequip.addEventListener('click', () => {
          this.onUnequip(slot);
          this.lastSignature = '';
          this.renderBag();
        });
        card.append(description, unequip);
      } else {
        description.append(createElement('span', '', 'Empty slot'));
        card.append(description);
      }
      this.equipmentList.append(card);
    }

    this.bagList.replaceChildren();
    if (!this.loot.bag.length) {
      this.bagList.append(createElement('p', 'ashen-bag-empty',
        'Your bag is empty. Defeat enemies, collect gear, and equip it here.'));
      return;
    }
    for (const item of this.loot.bag) this.bagList.append(this.renderItem(item));
  }

  private renderItem(item: LootItem): HTMLElement {
    const card = createElement('article', 'ashen-bag-item');
    const details = createElement('div', 'ashen-bag-item-details');
    const name = createElement('strong', '', item.name);
    name.style.color = RARITY_COLOR[item.rarity];
    const category = createElement('span', '',
      `${item.rarity.toUpperCase()} · ${item.slot.toUpperCase()} · Level ${item.itemLevel}`);
    details.append(name, category);
    const bonuses = itemBonuses(item);
    details.append(createElement('span', '', statLines(bonuses)));
    if (item.affixes.length) {
      details.append(createElement('span', '', item.affixes.map(
        modifier => `+${modifier.value} ${modifier.label}`,
      ).join(' · ')));
    }
    const previous = this.equipment.get(item.slot);
    if (previous) details.append(createElement('span', '', `Replacing: ${previous.name}`));
    details.append(createElement('span', 'ashen-bag-comparison',
      previewDifference(this.equipment.stats, this.equipment.previewEquip(item))));

    const buttons = createElement('div', 'ashen-bag-item-actions');
    const equip = createElement('button', 'ashen-bag-equip', 'EQUIP');
    equip.type = 'button';
    equip.setAttribute('aria-label', `Equip ${item.name}`);
    equip.addEventListener('click', () => {
      this.onEquip(item.id);
      this.lastSignature = '';
      this.renderBag();
    });
    const discard = createElement('button', 'ashen-bag-discard', 'DROP');
    discard.type = 'button';
    discard.setAttribute('aria-label', `Drop ${item.name}`);
    discard.addEventListener('click', () => {
      this.onDiscard(item.id);
      this.lastSignature = '';
      this.renderBag();
    });
    buttons.append(equip, discard);
    card.append(details, buttons);
    return card;
  }

  /** Only changes visible DOM when inventory, loadout or nearest loot changes. */
  refresh(nearest: GroundLoot | null): void {
    this.highlightedDrop = nearest;
    const signature = [
      this.loot.bag.map(item => item.id).join(','),
      EQUIPMENT_SLOTS.map(slot => this.equipment.get(slot)?.id ?? '-').join(','),
      nearest?.id ?? 'none',
      this.loot.bagFull ? 'full' : 'space',
    ].join('|');
    if (this.lastSignature === signature) return;
    this.lastSignature = signature;
    this.button.textContent = `BAG ${this.loot.bag.length} / ${this.loot.capacity}`;
    if (this.open) {
      this.nearbyPanel.hidden = true;
      this.renderBag();
      return;
    }
    if (!nearest) {
      this.nearbyPanel.hidden = true;
      return;
    }
    this.nearbyPanel.hidden = false;
    this.nearbyTitle.textContent = nearest.item.name;
    this.nearbyTitle.style.color = RARITY_COLOR[nearest.item.rarity];
    this.nearbyDescription.textContent = `${nearest.item.rarity.toUpperCase()} ${nearest.item.slot} · ${nearest.item.affixes.length ? nearest.item.affixes.map(
      affix => `+${affix.value} ${affix.label}`,
    ).join(', ') : 'No modifiers'}`;
    this.pickupButton.textContent = this.loot.bagFull ? 'BAG FULL' : 'PICK UP';
    this.pickupButton.disabled = this.loot.bagFull;
  }

  hideForResult(): void {
    this.closeBag();
    this.button.hidden = true;
    this.finishButton.hidden = true;
    this.finishWarning.hidden = true;
    this.nearbyPanel.hidden = true;
  }

  destroy(): void {
    this.button.remove();
    this.finishButton.remove();
    this.finishWarning.remove();
    this.nearbyPanel.remove();
    this.bagOverlay.remove();
  }
}
