export type InteractionTab = 'loot' | 'extract';

/**
 * A single on-screen surface for mutually competing contextual actions.
 *
 * LootUI and ExtractionUI keep owning their own markup and action handlers.
 * The dock only coordinates presentation, so proximity, bag capacity, channel
 * interruption and save transactions are still validated by the game scene.
 *
 * When a waystone and loot are both nearby, the player gets two large tabs
 * rather than overlapping independently positioned panels. During an active
 * escape channel, the extraction tab stays selected so CANCEL remains visible;
 * choosing loot deliberately cancels the channel.
 */
export class InteractionDock {
  private readonly root: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly lootButton: HTMLButtonElement;
  private readonly extractButton: HTMLButtonElement;
  private readonly lootPanel: HTMLElement;
  private readonly extractionPanel: HTMLElement;
  private active: InteractionTab = 'loot';
  private wasBoth = false;
  private channeling = false;

  constructor(onCancelExtraction: () => void) {
    const lootPanel = document.getElementById('ashen-loot-nearby');
    const extractionPanel = document.getElementById('ashen-extraction-panel');
    if (!lootPanel || !extractionPanel) {
      throw new Error('Loot and extraction panels must exist before the interaction dock');
    }

    const root = document.createElement('aside');
    root.id = 'ashen-interaction-dock';
    root.className = 'ashen-interaction-dock';
    root.setAttribute('aria-label', 'Nearby actions');
    root.hidden = true;

    const tabs = document.createElement('nav');
    tabs.className = 'ashen-interaction-tabs';
    tabs.setAttribute('aria-label', 'Choose nearby action');
    tabs.hidden = true;

    const lootButton = document.createElement('button');
    lootButton.type = 'button';
    lootButton.id = 'ashen-interaction-loot';
    lootButton.textContent = 'LOOT';
    lootButton.setAttribute('aria-label', 'Show nearby loot');
    lootButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (this.channeling) onCancelExtraction();
      this.active = 'loot';
      this.render();
    });

    const extractButton = document.createElement('button');
    extractButton.type = 'button';
    extractButton.id = 'ashen-interaction-extract';
    extractButton.textContent = 'EXTRACT';
    extractButton.setAttribute('aria-label', 'Show extraction waystone');
    extractButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.active = 'extract';
      this.render();
    });

    tabs.append(lootButton, extractButton);
    root.append(tabs, lootPanel, extractionPanel);
    document.body.append(root);
    this.root = root;
    this.tabs = tabs;
    this.lootButton = lootButton;
    this.extractButton = extractButton;
    this.lootPanel = lootPanel;
    this.extractionPanel = extractionPanel;
    this.render();
  }

  get selected(): InteractionTab { return this.active; }

  /** Called after both proximity UIs update on the current scene frame. */
  refresh(channeling: boolean): void {
    const lootAvailable = !this.lootPanel.hidden;
    const extractionAvailable = !this.extractionPanel.hidden;
    const both = lootAvailable && extractionAvailable;
    this.channeling = channeling;

    if (channeling && extractionAvailable) this.active = 'extract';
    else if (!both) this.active = lootAvailable ? 'loot' : 'extract';
    else if (!this.wasBoth) this.active = 'loot';

    this.root.hidden = !lootAvailable && !extractionAvailable;
    this.tabs.hidden = !both;
    this.wasBoth = both;
    this.render();
  }

  /** A terminal victory, escape or defeat hides all contextual controls. */
  hideForResult(): void {
    this.root.hidden = true;
    this.tabs.hidden = true;
    this.channeling = false;
    this.wasBoth = false;
  }

  private render(): void {
    this.root.dataset.active = this.active;
    this.lootButton.setAttribute('aria-pressed', String(this.active === 'loot'));
    this.extractButton.setAttribute('aria-pressed', String(this.active === 'extract'));
  }

  /** Child controls are disposed of by their original UI owners. */
  destroy(): void {
    this.root.remove();
  }
}
