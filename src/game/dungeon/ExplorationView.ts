import Phaser from 'phaser';
import type { Point } from '../movement/MovementController';
import type { DungeonLayout } from './DungeonGenerator';
import type { ExplorationTracker } from './ExplorationTracker';
import type { OptionalObjectiveDirector } from './OptionalObjectiveDirector';
import type { ExtractionDirector } from './ExtractionDirector';

/** Presentation-only layer: the tracker owns all gameplay/exploration state. */
export class ExplorationView {
  private readonly fog: Phaser.GameObjects.Graphics;
  private readonly map: Phaser.GameObjects.Graphics;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly mapHitArea: Phaser.GameObjects.Zone;
  private readonly tilePixels = 2;
  private readonly mapY = 62;
  private readonly onResize = (): void => this.redrawMap(this.lastPlayer);
  private lastPlayer: Point;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: DungeonLayout,
    private readonly exploration: ExplorationTracker,
    player: Point,
    private readonly objectives?: OptionalObjectiveDirector,
    private readonly extraction?: ExtractionDirector,
  ) {
    this.lastPlayer = { ...player };
    // Overlay world geometry and monsters, never the player once standing on a
    // discovered cell. Unexplored destinations cannot reveal enemies/effects.
    this.fog = scene.add.graphics().setDepth(24);
    this.map = scene.add.graphics().setScrollFactor(0).setDepth(115);
    this.heading = scene.add.text(0, 43, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#d3c59e',
      backgroundColor: '#10171bdd',
      padding: { x: 4, y: 3 },
    }).setScrollFactor(0).setDepth(116);
    // Prevent tapping the minimap from inadvertently moving in the game world.
    this.mapHitArea = scene.add.zone(0, 0, layout.columns * this.tilePixels + 10,
      layout.rows * this.tilePixels + 10).setScrollFactor(0).setDepth(117).setInteractive();
    this.mapHitArea.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number,
      _localY: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
    this.refresh(player);
  }

  refresh(player: Point): void {
    this.lastPlayer = { ...player };
    this.redrawFog();
    this.redrawMap(player);
  }

  private redrawFog(): void {
    this.fog.clear().fillStyle(0x080e11, 0.98);
    const size = this.layout.cellSize;
    for (let y = 0; y < this.layout.rows; y++) {
      for (let x = 0; x < this.layout.columns; x++) {
        const index = y * this.layout.columns + x;
        if (this.layout.floors[index] && !this.exploration.revealed[index]) {
          this.fog.fillRect(x * size, y * size, size, size);
        }
      }
    }
  }

  private redrawMap(player: Point): void {
    const pixel = this.tilePixels;
    const mapWidth = this.layout.columns * pixel;
    const mapHeight = this.layout.rows * pixel;
    const left = Math.max(8, this.scene.scale.width - mapWidth - 12);
    const top = this.mapY;
    this.mapHitArea.setPosition(left + mapWidth / 2, top + mapHeight / 2);
    this.map.clear()
      .fillStyle(0x080e11, 0.92).fillRoundedRect(left - 5, top - 5, mapWidth + 10, mapHeight + 10, 5)
      .lineStyle(1, 0x927a5b, 0.7).strokeRoundedRect(left - 5, top - 5, mapWidth + 10, mapHeight + 10, 5);

    for (let y = 0; y < this.layout.rows; y++) {
      for (let x = 0; x < this.layout.columns; x++) {
        const index = y * this.layout.columns + x;
        if (!this.exploration.revealed[index]) continue;
        this.map.fillStyle(0x687a77, 1).fillRect(left + x * pixel, top + y * pixel, pixel, pixel);
      }
    }

    // Discovered landmarks appear on the map only after actually entering the
    // room. Undiscovered chambers and their types remain intentionally hidden.
    for (const room of this.layout.rooms) {
      if (!this.exploration.hasDiscovered(room.id)) continue;
      const sideObjective = this.objectives?.objectives.find(item => item.roomId === room.id);
      const claimed = sideObjective ? this.objectives?.hasClaimed(sideObjective.id) : false;
      const exit = this.extraction?.sites.find(site => site.roomId === room.id);
      const color = exit ? 0x82e4e6 : claimed ? 0x648f86 :
        sideObjective?.id === 'shrine' ? 0x9fe0ca :
        room.role === 'cache' ? 0xf0c676 :
        room.role === 'depth' ? 0xe0a3b6 :
        room.role === 'entrance' ? 0x92d6b2 : 0xc4cbbd;
      this.map.fillStyle(color).fillCircle(
        left + (room.center.x + 0.5) * pixel,
        top + (room.center.y + 0.5) * pixel,
        exit ? 4 : room.role === 'chamber' && !sideObjective ? 2 : 3,
      );
    }
    const x = Math.max(left + 1, Math.min(left + mapWidth - 1, left + player.x / this.layout.cellSize * pixel));
    const y = Math.max(top + 1, Math.min(top + mapHeight - 1, top + player.y / this.layout.cellSize * pixel));
    this.map.fillStyle(0x111820).fillCircle(x, y, 4);
    this.map.fillStyle(0xffffff).fillCircle(x, y, 2.5);
    this.heading
      .setText(`EXPLORED ${this.exploration.roomsDiscovered}/${this.exploration.totalRooms} ROOMS`)
      .setPosition(left - 1, top - 25);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
    this.fog.destroy();
    this.map.destroy();
    this.heading.destroy();
    this.mapHitArea.destroy();
  }
}
