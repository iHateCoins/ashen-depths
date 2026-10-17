import Phaser from 'phaser';
import { buildWelcomeCopy } from '../welcome';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create(): void {
    const title = this.add.text(0, 0, 'ASHEN DEPTHS', { fontFamily: 'Georgia, serif', fontSize: '42px', color: '#e3c99c' }).setOrigin(0.5);
    const subtitle = this.add.text(0, 0, buildWelcomeCopy(), { fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#a7b7b7', align: 'center', wordWrap: { width: 600 } }).setOrigin(0.5);
    const layout = () => {
      const { width, height } = this.scale;
      title.setPosition(width / 2, height / 2 - 40);
      subtitle.setPosition(width / 2, height / 2 + 30);
      subtitle.setWordWrapWidth(Math.max(260, width - 40));
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
  }
}
