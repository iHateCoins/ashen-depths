import Phaser from 'phaser';
import { DungeonScene } from './game/scenes/DungeonScene';
import './style.css';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#10171b',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540 },
  render: { pixelArt: false, antialias: true },
  scene: [DungeonScene],
});
