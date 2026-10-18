import Phaser from 'phaser';
import { MovementController, type Point } from '../movement/MovementController';
import { NavigationGrid } from '../navigation/Grid';
import { findPath } from '../navigation/Pathfinder';
import { DirectionalAnimator } from '../rendering/DirectionalAnimator';
import { createDebugOptions, toggleDebug, type DebugOptions } from '../debug/DebugOptions';
import { AutoCombat } from '../combat/AutoCombat';
import { createEnemyAgent, updateEnemyAgents, type EnemyAgent } from '../combat/EnemyAI';
import { PlayerHealth } from '../combat/PlayerHealth';

const WORLD_WIDTH = 2304;
const WORLD_HEIGHT = 1536;
const GRID = 64;

export class DungeonScene extends Phaser.Scene {
  private movement!: MovementController;
  private player!: Phaser.GameObjects.Container;
  private marker!: Phaser.GameObjects.Arc;
  private status!: Phaser.GameObjects.Text;
  private zoom = 1;
  private grid!: NavigationGrid;
  private waypoints: Point[] = [];
  private obstacleGraphics!: Phaser.GameObjects.Graphics;
  private animator = new DirectionalAnimator();
  private debug: DebugOptions = createDebugOptions();
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private routeGraphics!: Phaser.GameObjects.Graphics;
  private cloak!: Phaser.GameObjects.Triangle;
  private face!: Phaser.GameObjects.Triangle;
  private debugButton!: Phaser.GameObjects.Text;
  private combat = new AutoCombat();
  private enemies: EnemyAgent[] = [];
  private health = new PlayerHealth();
  private healthLabel!: Phaser.GameObjects.Text;
  private defeatOverlay!: Phaser.GameObjects.Container;
  private enemyVisuals = new Map<number, Phaser.GameObjects.Container>();
  private kills = 0;

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
    this.grid = new NavigationGrid(WORLD_WIDTH, WORLD_HEIGHT, 32);
    this.obstacleGraphics = this.add.graphics();
    const block = (left: number, top: number, width: number, height: number): void => {
      for (let y = Math.floor(top / 32); y <= Math.floor((top + height - 1) / 32); y++) {
        for (let x = Math.floor(left / 32); x <= Math.floor((left + width - 1) / 32); x++) this.grid.setBlocked({x,y});
      }
      this.obstacleGraphics.fillStyle(0x536266, 1).fillRoundedRect(left, top, width, height, 5);
      this.obstacleGraphics.lineStyle(3, 0x9ba7a0, 0.8).strokeRoundedRect(left, top, width, height, 5);
    };
    for (let i = 0; i < 20; i++) {
      const x = 150 + (i % 5) * 420;
      const y = 130 + Math.floor(i / 5) * 380;
      block(x - 32, y - 32, 64, 64);
    }

    // Four longer dividers create corridors with multiple routes around them.
    for (const y of [480, 1056]) {
      block(300, y, 480, 32);
      block(1056, y, 480, 32);
    }
    this.movement = new MovementController({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
    const practicePositions = [{x:900,y:740},{x:1280,y:740},{x:1160,y:940},{x:980,y:1030},{x:1420,y:850},{x:800,y:900}];
    for (const [index, position] of practicePositions.entries()) {
      if (!this.grid.isWalkable(this.grid.cellAt(position))) continue;
      const enemy = createEnemyAgent({ id: index+1, position, hp: 100, maxHp: 100 });
      this.enemies.push(enemy);
      const shape = this.add.circle(0,0,18,0xa44949).setStrokeStyle(3,0xf1a49b);
      const bar = this.add.rectangle(0,-29,40,5,0x7eb88e).setOrigin(0.5);
      const container = this.add.container(position.x,position.y,[shape,bar]).setDepth(8);
      this.enemyVisuals.set(enemy.id,container);
    }
    const shadow = this.add.ellipse(0, 10, 34, 16, 0x000000, 0.45);
    const body = this.add.circle(0, 0, 17, 0x9cb2b6);
    this.cloak = this.add.triangle(0, 5, -13, 15, 0, -20, 13, 15, 0x526b72);
    this.face = this.add.triangle(0, -11, -6, 5, 0, -8, 6, 5, 0xe8c68c);
    this.player = this.add.container(this.movement.position.x, this.movement.position.y, [shadow, body, this.cloak, this.face]);
    this.player.setDepth(10);
    this.debugGraphics = this.add.graphics().setDepth(20).setVisible(false);
    this.routeGraphics = this.add.graphics().setDepth(19).setVisible(false);
    this.marker = this.add.circle(0, 0, 12, 0xd9b56c, 0.22).setStrokeStyle(2, 0xeacb85).setVisible(false);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(this.zoom);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.event instanceof MouseEvent && pointer.event.button !== 0) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const x = Phaser.Math.Clamp(point.x, 24, WORLD_WIDTH - 24);
      const y = Phaser.Math.Clamp(point.y, 24, WORLD_HEIGHT - 24);
      const path = findPath(this.grid, this.movement.position, { x, y });
      if (!path) {
        this.waypoints = [];
        this.movement.stop();
        this.marker.setVisible(false);
        this.redrawRoute();
        return;
      }
      const finalPoint = path[path.length - 1];
      this.waypoints = [...path];
      this.movement.moveTo(this.waypoints.shift()!);
      this.redrawRoute();
      this.marker.setPosition(finalPoint.x, finalPoint.y).setVisible(true);
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      this.setZoom(this.zoom + (dy > 0 ? -0.1 : 0.1));
    });
    this.input.keyboard?.on('keydown-PLUS', () => this.setZoom(this.zoom + 0.1));
    this.input.keyboard?.on('keydown-MINUS', () => this.setZoom(this.zoom - 0.1));
    this.input.keyboard?.on('keydown-F3', () => this.toggleDebug());

    this.status = this.add.text(14, 14, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#f0e2c3',
      backgroundColor: '#10171bcc', padding: { x: 10, y: 8 }
    }).setScrollFactor(0).setDepth(100);
    this.add.text(14, 0, 'ASHEN DEPTHS · M02 / PR02', { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#e3c99c' })
      .setScrollFactor(0).setDepth(100).setOrigin(0, 0);
    this.status.setY(32);
    this.healthLabel = this.add.text(14, 90, 'HP: 100 / 100', {fontFamily:'Arial, sans-serif',fontSize:'19px',color:'#f5c0b0',backgroundColor:'#10171bcc',padding:{x:10,y:7}}).setScrollFactor(0).setDepth(105);
    const shade=this.add.rectangle(0,0,960,540,0x090d10,0.82).setOrigin(0).setInteractive();
    const message=this.add.text(0,-35,'YOU HAVE FALLEN',{fontFamily:'Georgia, serif',fontSize:'34px',color:'#e3c99c'}).setOrigin(0.5);
    const restart=this.add.text(0,32,'RESTART EXPEDITION',{fontFamily:'Arial, sans-serif',fontSize:'19px',color:'#ffffff',backgroundColor:'#42565b',padding:{x:18,y:12}}).setOrigin(0.5).setInteractive();
    restart.on('pointerdown',(_pointer:Phaser.Input.Pointer,_lx:number,_ly:number,event:Phaser.Types.Input.EventData)=>{event.stopPropagation();this.scene.restart();});
    this.defeatOverlay=this.add.container(0,0,[shade,message,restart]).setScrollFactor(0).setDepth(200).setVisible(false);
    this.debugButton = this.add.text(0, 8, 'DEBUG: OFF', {fontFamily:'Arial, sans-serif',fontSize:'14px',color:'#e3c99c',backgroundColor:'#243136',padding:{x:10,y:8}}).setScrollFactor(0).setDepth(110).setInteractive();
    this.debugButton.on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.toggleDebug(); });
    this.refreshHud();
    // Only clear the startup overlay after the dungeon actually initializes.
    document.getElementById('boot-status')?.remove();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshHud, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshHud, this));
  }

  private refreshHud(): void {
    this.status.setWordWrapWidth(Math.max(240, this.scale.width - 28));
    this.debugButton?.setX(Math.max(8, this.scale.width - 130));
    if(this.defeatOverlay) {
      const shade=this.defeatOverlay.list[0] as Phaser.GameObjects.Rectangle;
      shade.setSize(this.scale.width,this.scale.height);
      (this.defeatOverlay.list[1] as Phaser.GameObjects.Text).setPosition(this.scale.width/2,this.scale.height/2-35);
      (this.defeatOverlay.list[2] as Phaser.GameObjects.Text).setPosition(this.scale.width/2,this.scale.height/2+32);
    }
  }

  private toggleDebug(): void {
    this.debug = toggleDebug(this.debug);
    this.debugButton.setText(this.debug.visible ? 'DEBUG: ON' : 'DEBUG: OFF');
    this.debugGraphics.setVisible(this.debug.visible);
    this.routeGraphics.setVisible(this.debug.visible);
    this.debugGraphics.clear();
    if (this.debug.visible) {
      this.debugGraphics.lineStyle(1, 0x75a5b2, 0.15);
      for(let x=0;x<=WORLD_WIDTH;x+=32) this.debugGraphics.lineBetween(x,0,x,WORLD_HEIGHT);
      for(let y=0;y<=WORLD_HEIGHT;y+=32) this.debugGraphics.lineBetween(0,y,WORLD_WIDTH,y);
      this.debugGraphics.fillStyle(0xe07867,0.25);
      for(let y=0;y<this.grid.rows;y++) for(let x=0;x<this.grid.columns;x++) if(!this.grid.isWalkable({x,y})) this.debugGraphics.fillRect(x*32,y*32,32,32);
    }
    this.redrawRoute();
  }

  private redrawRoute(): void {
    this.routeGraphics.clear();
    if(!this.debug.visible) return;
    const points=[this.movement.position, ...(this.movement.destination ? [this.movement.destination] : []), ...this.waypoints];
    if(points.length<2) return;
    this.routeGraphics.lineStyle(3,0xe8c68c,0.8);
    this.routeGraphics.beginPath();this.routeGraphics.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1)) this.routeGraphics.lineTo(p.x,p.y);
    this.routeGraphics.strokePath();
  }

  private setZoom(value: number): void {
    this.zoom = Phaser.Math.Clamp(Math.round(value * 10) / 10, 0.7, 1.7);
    this.cameras.main.setZoom(this.zoom);
  }

  update(_time: number, delta: number): void {
    if(this.health.defeated) return;
    const oldX = this.movement.position.x;
    const oldY = this.movement.position.y;
    this.movement.update(delta / 1000);
    if (!this.movement.destination && this.waypoints.length) this.movement.moveTo(this.waypoints.shift()!);
    const { x, y } = this.movement.position;
    this.player.setPosition(x, y);
    const state = this.animator.update(x - oldX, y - oldY, delta / 1000);
    const angles = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 };
    this.player.setRotation(angles[state.facing]);
    const gait = state.motion === 'walk' ? Math.sin(state.phase * Math.PI / 2) : 0;
    this.cloak.setY(5 + gait * 3);
    this.face.setY(-11 + Math.abs(gait) * 2);
    for (const attack of this.combat.update(this.movement.position,this.enemies,delta/1000)) {
      const enemy = this.enemies.find(e=>e.id===attack.targetId);
      if (!enemy) continue;
      const pulse = this.add.circle(enemy.position.x,enemy.position.y,26,0xf4d28d,0.3).setDepth(12);
      this.tweens.add({targets:pulse,alpha:0,scale:1.8,duration:220,onComplete:()=>pulse.destroy()});
      const visual = this.enemyVisuals.get(enemy.id);
      if (visual) {
        const healthBar = visual.list[1] as Phaser.GameObjects.Rectangle;
        healthBar.setScale(enemy.hp/enemy.maxHp,1);
        if (enemy.hp<=0) {visual.destroy();this.enemyVisuals.delete(enemy.id);this.kills++;}
      }
    }
    for (const hit of updateEnemyAgents(this.enemies,this.movement.position,this.grid,delta/1000)) {
      if(this.health.damage(hit.damage)) this.cameras.main.shake(110,0.002);
    }
    for(const enemy of this.enemies) {
      const visual=this.enemyVisuals.get(enemy.id);
      if(visual) visual.setPosition(enemy.position.x,enemy.position.y);
    }
    this.healthLabel.setText(`HP: ${this.health.hp} / ${this.health.maxHp}`);
    if(this.health.defeated) {
      this.movement.stop();this.waypoints=[];this.marker.setVisible(false);
      this.defeatOverlay.setVisible(true);
    }
    if (this.debug.visible) this.redrawRoute();
    if (!this.movement.destination && !this.waypoints.length) this.marker.setVisible(false);
    this.status.setText(`Tap/click to move · Wheel or +/- to zoom · Zoom ${this.zoom.toFixed(1)}x\nPosition: ${Math.round(x)}, ${Math.round(y)} · Facing: ${state.facing} · ${state.motion} · Auto-attack · Kills: ${this.kills}`);
  }
}
