export type ResultKind = 'victory' | 'defeat';

/**
 * Screen-fixed result UI deliberately lives outside Phaser's canvas.
 * Unlike interactive children of camera-fixed Phaser Containers, native
 * buttons receive touch/click events at the same place they are rendered.
 */
export class ResultOverlay {
  private readonly root: HTMLElement;
  private readonly restartButton: HTMLButtonElement;

  constructor(kind: ResultKind, restart: () => void) {
    const won = kind === 'victory';
    const root = document.createElement('section');
    root.id = won ? 'ashen-victory-overlay' : 'ashen-defeat-overlay';
    root.className = 'ashen-result-overlay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'ashen-result-panel';

    const title = document.createElement('h2');
    title.id = won ? 'ashen-victory-title' : 'ashen-defeat-title';
    title.textContent = won ? 'TRIAL CLEARED' : 'YOU HAVE FALLEN';
    root.setAttribute('aria-labelledby', title.id);

    const description = document.createElement('p');
    description.textContent = won ? 'Three waves survived' : 'Your expedition has ended';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ashen-result-restart';
    button.textContent = won ? 'REPLAY TRIAL' : 'RESTART EXPEDITION';
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
  }

  show(): void {
    if (!this.root.hidden) return;
    this.root.hidden = false;
    // Keyboard accessibility, without scrolling the full-screen game.
    this.restartButton.focus({ preventScroll: true });
  }

  destroy(): void {
    this.root.remove();
  }
}
