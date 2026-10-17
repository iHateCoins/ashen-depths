import Phaser from 'phaser';
import { MovementController } from '../movement/MovementController';

const WORLD_WIDTH = 2304;
const WORLD_HEIGHT = 1536;
const GRID = 64;

export class DungeonScene extends Phaser.Scene {
  private movement!: MovementController;
  private player!: Phaser.GameObjects.Container;
  private marker!: Phaser.GameObjects.Arc;
  private status!: Phaser.GameObjects.Text;
  private zoom = 1;

  constructor() { super('DungeonScene'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#10171b');
    const graphics = this.add.graphics();
    graphics.fillStyle(0x20282b, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let y = 0; y < WORLD_HEIGHT; y += GRID) {
      for (let x = 0; x < WORLD_WIDTH; x += GRID) {
        const even = (x / GRID + y / GRID) % 2 === 0;
        graphics.fillStyle(even ? 0x293235 : 0x252e31, 1).fillRect(x + 1, y + 1, GRID - 2, GRID - 2);
        graphics.lineStyle(1, 0x344144, 0.35).strokeRect(x, y, GRID, GRID);
      }
    }
    graphics.lineStyle(8, 0x9b7b4b, 1).strokeRect(4, 4, WORLD_WIDTH - 8, WORLD_HEIGHT - 8);
    for (let i = 0; i < 20; i++) {
      const x = 150 + (i % 5) * 420;
      const y = 130 + Math.floor(i / 5) * 380;
      graphics.fillStyle(0x445255, 1).fillCircle(x, y, 20);
      graphics.lineStyle(3, 0x758488, 1).strokeCircle(x, y, 20);
    }

    this.movement = new MovementController({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
    const shadow = this.add.ellipse(0, 10, 34, 16, 0x000000, 0.45);
    const body = this.add.circle(0, 0, 17, 0x9cb2b6);
    const cloak = this.add.triangle(0, 5, -13, 15, 0, -20, 13, 15, 0x526b72);
    const facing = this.add.triangle(0, -11, -6, 5, 0, -8, 6, 5, 0xe8c68c);
    this.player = this.add.container(this.movement.position.x, this.movement.position.y, [shadow, body, cloak, facing]);
    this.player.setDepth(10);
    this.marker = this.add.circle(0, 0, 12, 0xd9b56c, 0.22).setStrokeStyle(2, 0xeacb85).setVisible(false);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(this.zoom);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.event instanceof MouseEvent && pointer.event.button !== 0) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const x = Phaser.Math.Clamp(point.x, 24, WORLD_WIDTH - 24);
      const y = Phaser.Math.Clamp(point.y, 24, WORLD_HEIGHT - 24);
      this.movement.moveTo({ x, y });
      this.marker.setPosition(x, y).setVisible(true);
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      this.setZoom(this.zoom + (dy > 0 ? -0.1 : 0.1));
    });
    this.input.keyboard?.on('keydown-PLUS', () => this.setZoom(this.zoom + 0.1));
    this.input.keyboard?.on('keydown-MINUS', () => this.setZoom(this.zoom - 0.1));

    this.status = this.add.text(14, 14, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#f0e2c3',
      backgroundColor: '#10171bcc', padding: { x: 10, y: 8 }
    }).setScrollFactor(0).setDepth(100);
    this.add.text(14, 0, 'ASHEN DEPTHS · M01 / PR02', { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#e3c99c' })
      .setScrollFactor(0).setDepth(100).setOrigin(0, 0);
    this.status.setY(32);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshHud, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshHud, this));
  }

  private refreshHud(): void { this.status.setWordWrapWidth(Math.max(240, this.scale.width - 28)); }

  private setZoom(value: number): void {
    this.zoom = Phaser.Math.Clamp(Math.round(value * 10) / 10, 0.7, 1.7);
    this.cameras.main.setZoom(this.zoom);
  }

  update(_time: number, delta: number): void {
    const oldX = this.movement.position.x;
    const oldY = this.movement.position.y;
    this.movement.update(delta / 1000);
    const { x, y } = this.movement.position;
    this.player.setPosition(x, y);
    if (Math.hypot(x - oldX, y - oldY) > 0.01) {
      this.player.setRotation(Math.atan2(y - oldY, x - oldX) + Math.PI / 2);
    }
    if (!this.movement.destination) this.marker.setVisible(false);
    this.status.setText(`Tap/click to move · Wheel or +/- to zoom · Zoom ${this.zoom.toFixed(1)}x\nPosition: ${Math.round(x)}, ${Math.round(y)} · No obstacle collision yet (PR03)`);
  }
}
