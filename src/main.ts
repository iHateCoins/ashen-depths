import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import './style.css';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#10171b',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540 },
  render: { pixelArt: false, antialias: true },
  scene: [BootScene],
});
