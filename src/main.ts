import Phaser from 'phaser';
import { DungeonScene } from './game/scenes/DungeonScene';
import { startUpdateWatcher } from './game/update/UpdateWatcher';
import './style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#10171b',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540 },
  render: { pixelArt: false, antialias: true },
  scene: [DungeonScene],
});

// E2E browser tests need to drive the actual end-of-trial state. Never expose
// the running game object on the public GitHub Pages hostname.
if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
  (window as Window & { __ashenE2eGame?: Phaser.Game }).__ashenE2eGame = game;
}

// Keep the web app's Home Screen installation on the latest published build.
startUpdateWatcher({ currentBuild: __ASHEN_BUILD_ID__, baseUrl: import.meta.env.BASE_URL });
