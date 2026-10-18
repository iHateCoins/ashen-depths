import type { ExpeditionLoot, GroundLoot, LootItem, ItemRarity } from '../loot/ExpeditionLoot';

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

/**
 * Native DOM for reliable iPhone hit testing, matching result/objective UI.
 * Pickup is always deliberate, inventory is run-scoped and inspectable, and
 * no item can be equipped or secured permanently in this milestone.
 */
export class LootUI {
  private readonly button: HTMLButtonElement;
  private readonly nearbyPanel: HTMLElement;
  private readonly nearbyTitle: HTMLElement;
  private readonly nearbyDescription: HTMLElement;
  private readonly pickupButton: HTMLButtonElement;
  private readonly bagOverlay: HTMLElement;
  private readonly bagList: HTMLElement;
  private readonly bagCount: HTMLElement;
  private highlightedDrop: GroundLoot | null = null;
  private lastSignature = '';
  private open = false;

  constructor(
    private readonly loot: ExpeditionLoot,
    private readonly onPickup: (id: string) => void,
    private readonly onDiscard: (id: string) => void,
  ) {
    const bagButton = createElement('button', 'ashen-bag-toggle', 'BAG 0 / 24');
    bagButton.id = 'ashen-bag-toggle';
    bagButton.type = 'button';
    bagButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openBag();
    });
    document.body.append(bagButton);
    this.button = bagButton;

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
    const heading = createElement('h2', '', 'Expedition Bag');
    const close = createElement('button', 'ashen-bag-close', 'CLOSE');
    close.type = 'button';
    close.addEventListener('click', () => this.closeBag());
    header.append(heading, close);

    const warning = createElement('p', 'ashen-bag-warning',
      'UNSECURED LOOT — gear in this bag is lost when the run ends. Extraction and equipment arrive in later updates.');
    const count = createElement('p', 'ashen-bag-count');
    const list = createElement('div', 'ashen-bag-list');
    panel.append(header, warning, count, list);
    overlay.append(panel);
    document.body.append(overlay);
    this.bagOverlay = overlay;
    this.bagCount = count;
    this.bagList = list;

    this.refresh(null);
  }

  get isOpen(): boolean { return this.open; }

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
    this.bagCount.textContent = `${this.loot.bag.length} / ${this.loot.capacity} slots used`;
    this.bagList.replaceChildren();
    if (!this.loot.bag.length) {
      this.bagList.append(createElement('p', 'ashen-bag-empty',
        'Your bag is empty. Defeat enemies and approach dropped items to collect them.'));
      return;
    }
    for (const item of this.loot.bag) {
      this.bagList.append(this.renderItem(item));
    }
  }

  private renderItem(item: LootItem): HTMLElement {
    const card = createElement('article', 'ashen-bag-item');
    const details = createElement('div', 'ashen-bag-item-details');
    const name = createElement('strong', '', item.name);
    name.style.color = RARITY_COLOR[item.rarity];
    const category = createElement('span', '', `${item.rarity.toUpperCase()} · ${item.slot.toUpperCase()} · Level ${item.itemLevel}`);
    details.append(name, category);
    if (item.affixes.length) {
      const affixes = createElement('span', '', item.affixes.map(
        modifier => `+${modifier.value} ${modifier.label}`,
      ).join(' · '));
      details.append(affixes);
    }
    const discard = createElement('button', 'ashen-bag-discard', 'DROP');
    discard.type = 'button';
    discard.setAttribute('aria-label', `Drop ${item.name}`);
    discard.addEventListener('click', () => {
      this.onDiscard(item.id);
      this.lastSignature = '';
      this.renderBag();
    });
    card.append(details, discard);
    return card;
  }

  /** Only changes visible DOM when inventory or nearest loot changes. */
  refresh(nearest: GroundLoot | null): void {
    this.highlightedDrop = nearest;
    const signature = [
      this.loot.bag.map(item => item.id).join(','),
      nearest?.id ?? 'none',
      this.loot.bagFull ? 'full' : 'space',
    ].join('|');
    if (this.lastSignature === signature) return;
    this.lastSignature = signature;
    this.button.textContent = `BAG ${this.loot.bag.length} / ${this.loot.capacity}`;

    if (!nearest || this.open) {
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
    this.nearbyPanel.hidden = true;
  }

  destroy(): void {
    this.button.remove();
    this.nearbyPanel.remove();
    this.bagOverlay.remove();
  }
}
