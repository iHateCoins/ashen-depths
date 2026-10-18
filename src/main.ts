import Phaser from 'phaser';
import { DungeonScene } from './game/scenes/DungeonScene';
import { startUpdateWatcher } from './game/update/UpdateWatcher';
import './style.css';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#10171b',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540 },
  render: { pixelArt: false, antialias: true },
  scene: [DungeonScene],
});

// Keep the web app's Home Screen installation on the latest published build.
startUpdateWatcher({ currentBuild: __ASHEN_BUILD_ID__, baseUrl: import.meta.env.BASE_URL });
