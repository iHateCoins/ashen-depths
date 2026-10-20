export type InteractionTab = 'loot' | 'objective' | 'extract';

type ContextVisibility = Record<InteractionTab, boolean>;
const ORDER: readonly InteractionTab[] = ['loot', 'objective', 'extract'];

/**
 * One fixed interaction surface for ALL contextual world panels. Loot,
 * shrine/cache and extraction controls retain their existing DOM IDs and
 * independent validation; only their layout and selection are coordinated.
 *
 * A single nearby action appears directly, without tabs. Two or three nearby
 * actions get clearly named touch targets and only the selected panel renders.
 * Selecting any other action during a waystone channel cancels the channel
 * before that action can be used. The Warden's Finish Expedition button
 * also lives inside this dock, below nearby gear rather than on top of it.
 */
export class InteractionDock {
  private readonly root: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly panels: Record<InteractionTab, HTMLElement>;
  private readonly buttons: Record<InteractionTab, HTMLButtonElement>;
  private readonly finishButton: HTMLElement;
  private readonly descendButton: HTMLElement;
  private active: InteractionTab = 'loot';
  private wasMultiple = false;
  private channeling = false;

  constructor(onCancelExtraction: () => void) {
    const loot = document.getElementById('ashen-loot-nearby');
    const objective = document.getElementById('ashen-optional-objective');
    const extract = document.getElementById('ashen-extraction-panel');
    const finish = document.getElementById('ashen-finish-run');
    const descend = document.getElementById('ashen-descend-run');
    const finishWarning = document.getElementById('ashen-finish-warning');
    if (!loot || !objective || !extract || !finish || !descend || !finishWarning) {
      throw new Error('All context controls must exist before the interaction dock');
    }
    this.panels = { loot, objective, extract };

    const root = document.createElement('aside');
    root.id = 'ashen-interaction-dock';
    root.className = 'ashen-interaction-dock';
    root.setAttribute('aria-label', 'Nearby actions');
    root.hidden = true;

    const tabs = document.createElement('nav');
    tabs.className = 'ashen-interaction-tabs';
    tabs.setAttribute('aria-label', 'Choose nearby action');
    tabs.hidden = true;

    const labels: Record<InteractionTab, string> = {
      loot: 'LOOT', objective: 'OBJECTIVE', extract: 'EXTRACT',
    };
    const ariaLabels: Record<InteractionTab, string> = {
      loot: 'Show nearby loot',
      objective: 'Show nearby shrine or cache',
      extract: 'Show extraction waystone',
    };
    const buttons = {} as Record<InteractionTab, HTMLButtonElement>;
    for (const name of ORDER) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `ashen-interaction-${name}`;
      button.textContent = labels[name];
      button.setAttribute('aria-label', ariaLabels[name]);
      button.hidden = true;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (this.channeling && name !== 'extract') onCancelExtraction();
        this.active = name;
        this.render();
      });
      buttons[name] = button;
      tabs.append(button);
    }

    // The end-of-run action is always directly accessible, even if Warden
    // loot is nearby. A separate fixed Finish button would overlap the dock.
    root.append(tabs, loot, objective, extract, finish, descend, finishWarning);
    document.body.append(root);
    this.root = root;
    this.tabs = tabs;
    this.buttons = buttons;
    this.finishButton = finish;
    this.descendButton = descend;
    this.render();
  }

  get selected(): InteractionTab { return this.active; }

  /** Called after all three proximity UIs update on the current frame. */
  refresh(channeling: boolean): void {
    const available = {} as ContextVisibility;
    for (const name of ORDER) available[name] = !this.panels[name].hidden;
    const count = ORDER.filter(name => available[name]).length;
    this.channeling = channeling;

    if (channeling && available.extract) this.active = 'extract';
    else if (!available[this.active] || (count > 1 && !this.wasMultiple)) {
      // Loot is most time-sensitive (and can be beside an active waystone);
      // then optional rewards, then the exit, when no channel is active.
      this.active = ORDER.find(name => available[name]) ?? 'loot';
    }

    this.root.hidden = count === 0 && this.finishButton.hidden && this.descendButton.hidden;
    this.tabs.hidden = count <= 1;
    for (const name of ORDER) this.buttons[name].hidden = !available[name];
    this.wasMultiple = count > 1;
    this.render();
  }

  /** Terminal victory, early escape and defeat hide the complete dock. */
  hideForResult(): void {
    this.root.hidden = true;
    this.tabs.hidden = true;
    this.channeling = false;
    this.wasMultiple = false;
  }

  private render(): void {
    this.root.dataset.active = this.active;
    for (const name of ORDER) {
      this.buttons[name].setAttribute('aria-pressed', String(this.active === name));
    }
  }

  /** The owner UIs destroy their own moved DOM panels on scene shutdown. */
  destroy(): void {
    this.root.remove();
  }
}
