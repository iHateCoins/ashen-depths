export type ResultKind = 'victory' | 'defeat' | 'extraction';

/**
 * Screen-fixed result UI deliberately lives outside Phaser's canvas.
 * Unlike interactive children of camera-fixed Phaser Containers, native
 * buttons receive touch/click events at the same place they are rendered.
 */
export class ResultOverlay {
  private readonly root: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly description: HTMLElement;

  constructor(kind: ResultKind, restart: () => void) {
    const won = kind !== 'defeat';
    const escaped = kind === 'extraction';
    const root = document.createElement('section');
    root.id = escaped ? 'ashen-extraction-overlay' : won ? 'ashen-victory-overlay' : 'ashen-defeat-overlay';
    root.className = 'ashen-result-overlay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'ashen-result-panel';

    const title = document.createElement('h2');
    title.id = escaped ? 'ashen-extraction-title' : won ? 'ashen-victory-title' : 'ashen-defeat-title';
    title.textContent = escaped ? 'ESCAPED ALIVE' : won ? 'WARDEN DEFEATED' : 'YOU HAVE FALLEN';
    root.setAttribute('aria-labelledby', title.id);

    const description = document.createElement('p');
    description.textContent = escaped ? 'You survived the expedition with your secured gear.' : won ? 'The deep chamber is conquered. Begin a new expedition.' : 'Your expedition has ended';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ashen-result-restart';
    button.textContent = won ? 'NEW EXPEDITION' : 'RESTART EXPEDITION';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      restart();
    });

    panel.append(title, description, button);
    root.append(panel);
    document.body.append(root);
    this.root = root;
    this.restartButton = button;
    this.description = description;
  }

  show(message?: string): void {
    if (!this.root.hidden) return;
    if (message) this.description.textContent = message;
    this.root.hidden = false;
    // Keyboard accessibility, without scrolling the full-screen game.
    this.restartButton.focus({ preventScroll: true });
  }

  destroy(): void {
    this.root.remove();
  }
}
