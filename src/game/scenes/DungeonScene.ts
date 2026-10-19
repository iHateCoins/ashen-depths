import Phaser from 'phaser';
import { MovementController, type Point } from '../movement/MovementController';
import { NavigationGrid } from '../navigation/Grid';
import { findPath } from '../navigation/Pathfinder';
import { DirectionalAnimator } from '../rendering/DirectionalAnimator';
import { createDebugOptions, toggleDebug, type DebugOptions } from '../debug/DebugOptions';
import { AutoCombat } from '../combat/AutoCombat';
import { AutoSkillSystem, CINDER_BURST } from '../combat/AutoSkillSystem';
import { createEnemyAgent, ENEMY_ARCHETYPES, updateEnemyAgents, type EnemyAgent } from '../combat/EnemyAI';
import { PlayerHealth } from '../combat/PlayerHealth';
import { RoomEncounterDirector } from '../combat/RoomEncounterDirector';
import { ResultOverlay } from '../ui/ResultOverlay';
import { createDungeonNavigationGrid, dungeonFloorAt, dungeonSeedFromSearch, generateDungeon, type DungeonLayout } from '../dungeon/DungeonGenerator';
import { ExplorationTracker } from '../dungeon/ExplorationTracker';
import { ExplorationView } from '../dungeon/ExplorationView';
import { OptionalObjectiveDirector, type OptionalObjectiveKind } from '../dungeon/OptionalObjectiveDirector';
import { OptionalObjectiveUI } from '../ui/OptionalObjectiveUI';
import { ExpeditionLoot, type GroundLoot } from '../loot/ExpeditionLoot';
import { LootUI } from '../ui/LootUI';
import { EquipmentLoadout, EQUIPMENT_SLOTS, mitigatedHitDamage } from '../loot/EquipmentLoadout';
import { SecuredStash } from '../loot/SecuredStash';
import { StashUI } from '../ui/StashUI';
import type { EquipmentSlot } from '../loot/ExpeditionLoot';

const WORLD_WIDTH = 2304;
const WORLD_HEIGHT = 1536;
const GRID = 64;

export class DungeonScene extends Phaser.Scene {
  private movement!: MovementController;
  private player!: Phaser.GameObjects.Container;
  private marker!: Phaser.GameObjects.Arc;
  private status!: Phaser.GameObjects.Text;
  private titleLabel!: Phaser.GameObjects.Text;
  private zoom = 1;
  private grid!: NavigationGrid;
  private waypoints: Point[] = [];
  private dungeon!: DungeonLayout;
  private exploration!: ExplorationTracker;
  private explorationView!: ExplorationView;
  private dungeonSeedLabel!: Phaser.GameObjects.Text;
  private animator = new DirectionalAnimator();
  private debug: DebugOptions = createDebugOptions();
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private routeGraphics!: Phaser.GameObjects.Graphics;
  private cloak!: Phaser.GameObjects.Triangle;
  private face!: Phaser.GameObjects.Triangle;
  private debugButton!: Phaser.GameObjects.Text;
  private combat = new AutoCombat();
  private skills = new AutoSkillSystem();
  private skillStatusLabel!: Phaser.GameObjects.Text;
  private enemies: EnemyAgent[] = [];
  private health = new PlayerHealth();
  private healthLabel!: Phaser.GameObjects.Text;
  private defeatOverlay!: ResultOverlay;
  private enemyVisuals = new Map<number, Phaser.GameObjects.Container>();
  private attackWarnings!: Phaser.GameObjects.Graphics;
  private roomEncounters!: RoomEncounterDirector;
  private optionalObjectives!: OptionalObjectiveDirector;
  private optionalUi!: OptionalObjectiveUI;
  private objectiveMarkers = new Map<OptionalObjectiveKind, Phaser.GameObjects.Text>();
  private objectiveLabel!: Phaser.GameObjects.Text;
  private loot!: ExpeditionLoot;
  private loadout!: EquipmentLoadout;
  private securedStash!: SecuredStash;
  private stashUi!: StashUI;
  private campAvailable = true;
  private lootUi!: LootUI;
  private groundVisuals = new Map<string, Phaser.GameObjects.Container>();
  private victoryOverlay!: ResultOverlay;
  private kills = 0;
  private finalized = false;

  constructor() { super('DungeonScene'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#10171b');
    this.dungeon = generateDungeon(
      dungeonSeedFromSearch(window.location.search, () => Math.floor(Math.random() * 0x100000000)),
    );
    this.grid = createDungeonNavigationGrid(this.dungeon);
    this.roomEncounters = new RoomEncounterDirector(this.dungeon, this.grid);
    this.optionalObjectives = new OptionalObjectiveDirector(this.dungeon, this.roomEncounters);
    this.loot = new ExpeditionLoot(this.dungeon.seed);
    this.loadout = new EquipmentLoadout(this.loot);
    this.securedStash = new SecuredStash();
    this.campAvailable = true;
    this.groundVisuals.clear();
    this.renderDungeon();
    this.renderOptionalMarkers();
    // Scenes restart without rebuilding the TypeScript object; reset every run.
    this.health = new PlayerHealth();
    this.combat = new AutoCombat();
    this.skills = new AutoSkillSystem();
    this.recalculateEquipment();
    this.kills = 0;
    this.finalized = false;
    this.enemies = [];
    this.enemyVisuals.clear();
    this.waypoints = [];
    this.animator = new DirectionalAnimator();
    this.debug = createDebugOptions();
    this.zoom = 1;
    this.movement = new MovementController(this.dungeon.entrance);
    this.exploration = new ExplorationTracker(this.dungeon, this.grid);
    this.exploration.update(this.movement.position);
    // Room populations are immutable plans; enemy HP and location are run-scoped.
    const shadow = this.add.ellipse(0, 10, 34, 16, 0x000000, 0.45);
    const body = this.add.circle(0, 0, 17, 0x9cb2b6);
    this.cloak = this.add.triangle(0, 5, -13, 15, 0, -20, 13, 15, 0x526b72);
    this.face = this.add.triangle(0, -11, -6, 5, 0, -8, 6, 5, 0xe8c68c);
    this.player = this.add.container(this.movement.position.x, this.movement.position.y, [shadow, body, this.cloak, this.face]);
    this.player.setDepth(10);
    this.attackWarnings = this.add.graphics().setDepth(9);
    this.spawnRoomEnemies();
    this.debugGraphics = this.add.graphics().setDepth(35).setVisible(false);
    this.routeGraphics = this.add.graphics().setDepth(34).setVisible(false);
    this.marker = this.add.circle(0, 0, 12, 0xd9b56c, 0.22).setStrokeStyle(2, 0xeacb85).setVisible(false).setDepth(26);
    this.explorationView = new ExplorationView(this, this.dungeon, this.exploration, this.movement.position, this.optionalObjectives);
    this.cameras.main.setBounds(0, 0, this.grid.width, this.grid.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(this.zoom);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.health.defeated || this.finalized || this.lootUi.isOpen) return;
      if (pointer.event instanceof MouseEvent && pointer.event.button !== 0) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const x = Phaser.Math.Clamp(point.x, 24, this.grid.width - 24);
      const y = Phaser.Math.Clamp(point.y, 24, this.grid.height - 24);
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
    this.titleLabel = this.add.text(14, 3, 'ASHEN DEPTHS · M04 / PR03', { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#e3c99c' })
      .setScrollFactor(0).setDepth(100).setOrigin(0, 0);
    this.status.setY(198).setVisible(false);
    this.dungeonSeedLabel = this.add.text(14, 0, `DUNGEON SEED: ${this.dungeon.seed}`, {
      fontFamily:'Arial, sans-serif',fontSize:'12px',color:'#aab9b5',
      backgroundColor:'#10171bcc',padding:{x:10,y:6},
    }).setScrollFactor(0).setDepth(100);
    this.healthLabel = this.add.text(14, 40, 'HP: 100 / 100', {fontFamily:'Arial, sans-serif',fontSize:'19px',color:'#f5c0b0',backgroundColor:'#10171bcc',padding:{x:10,y:7}}).setScrollFactor(0).setDepth(105);
    this.objectiveLabel = this.add.text(14, 81, 'FIND THE DEEP CHAMBER', {
      fontFamily:'Arial, sans-serif',fontSize:'16px',color:'#f2d6a5',
      backgroundColor:'#10171bcc',padding:{x:10,y:7},
    }).setScrollFactor(0).setDepth(105);
    this.skillStatusLabel = this.add.text(14, 0, 'CINDER BURST: READY', {
      fontFamily:'Arial, sans-serif',fontSize:'15px',color:'#ffbe83',
      backgroundColor:'#10171bcc',padding:{x:10,y:7}
    }).setScrollFactor(0).setDepth(105);
    // These are actual DOM buttons above the canvas. Phaser's interactive
    // Container children can be offset by the scrolling/zooming camera.
    this.optionalUi = new OptionalObjectiveUI(kind => this.activateOptionalObjective(kind));
    this.lootUi = new LootUI(
      this.loot, this.loadout,
      id => this.pickupGroundLoot(id),
      id => this.discardBagItem(id),
      id => this.equipBagItem(id),
      slot => this.unequipGear(slot),
    );
    this.stashUi = new StashUI(this.securedStash, this.loot, id => this.withdrawFromStash(id));
    this.defeatOverlay = new ResultOverlay('defeat', () => this.scene.restart());
    this.victoryOverlay = new ResultOverlay('victory', () => this.scene.restart());
    const defeatOverlay = this.defeatOverlay;
    const victoryOverlay = this.victoryOverlay;
    const explorationView = this.explorationView;
    const optionalUi = this.optionalUi;
    const lootUi = this.lootUi;
    const stashUi = this.stashUi;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      defeatOverlay.destroy();
      victoryOverlay.destroy();
      explorationView.destroy();
      optionalUi.destroy();
      lootUi.destroy();
      stashUi.destroy();
    });
    this.debugButton = this.add.text(0, 8, 'DEBUG: OFF', {fontFamily:'Arial, sans-serif',fontSize:'14px',color:'#e3c99c',backgroundColor:'#243136',padding:{x:10,y:8}}).setScrollFactor(0).setDepth(110).setInteractive();
    this.debugButton.on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.toggleDebug(); });
    this.refreshHud();
    // Only clear the startup overlay after the dungeon actually initializes.
    document.getElementById('boot-status')?.remove();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshHud, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshHud, this));
  }

  private renderDungeon(): void {
    const layout = this.dungeon;
    const graphics = this.add.graphics().setDepth(-20);
    graphics.fillStyle(0x10171b, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const roleAt = (x: number, y: number): 'entrance' | 'cache' | 'depth' | 'chamber' | 'hall' => {
      for (const room of layout.rooms) {
        if (x >= room.x && x < room.x + room.width &&
            y >= room.y && y < room.y + room.height) return room.role;
      }
      return 'hall';
    };

    // Every floor tile and its collision shape derive from the same generated
    // layout. The world remains seamless: no per-room scene transitions.
    for (let y = 0; y < layout.rows; y++) {
      for (let x = 0; x < layout.columns; x++) {
        if (!dungeonFloorAt(layout, {x,y})) continue;
        const px = x * GRID / 2, py = y * GRID / 2;
        const role = roleAt(x,y);
        const even = (x + y) % 2 === 0;
        const roomPalette = role === 'cache' ? [0x544a35,0x4b4333]
          : role === 'depth' ? [0x44353d,0x3e343b]
          : role === 'entrance' ? [0x34413e,0x303b39]
          : role === 'hall' ? [0x272f32,0x252d30]
          : [0x343b3b,0x303738];
        graphics.fillStyle(roomPalette[even ? 0 : 1],1)
          .fillRect(px,py,layout.cellSize,layout.cellSize);
        graphics.lineStyle(1,0x101719,0.24)
          .strokeRect(px + 1,py + 1,layout.cellSize - 2,layout.cellSize - 2);

        // Solid edges are visibly raised and exactly match blocked nav cells.
        const edge = {x,y};
        graphics.lineStyle(3,0x77807c,0.63);
        if (!dungeonFloorAt(layout,{x:edge.x,y:edge.y-1}))
          graphics.lineBetween(px,py,px+layout.cellSize,py);
        if (!dungeonFloorAt(layout,{x:edge.x,y:edge.y+1}))
          graphics.lineBetween(px,py+layout.cellSize,px+layout.cellSize,py+layout.cellSize);
        if (!dungeonFloorAt(layout,{x:edge.x-1,y:edge.y}))
          graphics.lineBetween(px,py,px,py+layout.cellSize);
        if (!dungeonFloorAt(layout,{x:edge.x+1,y:edge.y}))
          graphics.lineBetween(px+layout.cellSize,py,px+layout.cellSize,py+layout.cellSize);
      }
    }
    for (const room of layout.rooms) {
      const px = (room.center.x + 0.5) * layout.cellSize;
      const py = (room.center.y + 0.5) * layout.cellSize;
      if (room.role === 'entrance') {
        graphics.lineStyle(4,0x8eb8a0,0.85).strokeCircle(px,py,37);
        this.add.text(px,py-57,'ENTRANCE',{fontFamily:'Georgia, serif',fontSize:'15px',
          color:'#d0e6cd',stroke:'#172022',strokeThickness:3}).setOrigin(0.5).setDepth(1);
      } else if (room.role === 'cache' || room.role === 'depth') {
        const color = room.role === 'cache' ? 0xe5bc78 : 0xc487a4;
        graphics.lineStyle(4,color,0.82).strokeCircle(px,py,43);
        graphics.fillStyle(color,0.25).fillCircle(px,py,35);
        this.add.text(px,py-59,room.role === 'cache' ? 'SEALED CACHE' : 'DEEP CHAMBER',{
          fontFamily:'Georgia, serif',fontSize:'15px',
          color:room.role === 'cache' ? '#e8d4a6' : '#ecc2d1',
          stroke:'#172022',strokeThickness:3,
        }).setOrigin(0.5).setDepth(1);
      }
    }
  }

  private renderOptionalMarkers(): void {
    this.objectiveMarkers.clear();
    for (const objective of this.optionalObjectives.objectives) {
      const cache = objective.id === 'cache';
      const { x, y } = objective.position;
      const outer = this.add.circle(x, y, cache ? 28 : 25,
        cache ? 0xe1ad62 : 0x79c7ad, 0.18)
        .setStrokeStyle(3, cache ? 0xedc789 : 0xa7e7ce, 0.9).setDepth(3);
      // World markers remain below fog-of-war. Their visibility never spoils
      // unseen chambers on the map or in the world.
      const label = this.add.text(x, y + 38, cache ? 'SEALED · GUARDED' : 'SANCTUARY SHRINE', {
        fontFamily: 'Arial, sans-serif', fontSize: '12px',
        color: cache ? '#f5d4a0' : '#a9ead1',
        stroke: '#101719', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(4);
      outer.setData('objective-kind', objective.id);
      this.objectiveMarkers.set(objective.id, label);
    }
  }

  private activateOptionalObjective(kind: OptionalObjectiveKind): void {
    if (this.health.defeated || this.roomEncounters.completed) return;
    const reward = this.optionalObjectives.activate(
      kind, this.movement.position, this.enemies, this.health.hp, this.health.maxHp,
    );
    if (!reward) return;
    if (reward.kind === 'ember-edge') {
      this.recalculateEquipment();
      this.showCombatText(this.movement.position,
        `EMBER EDGE · +${reward.damageBonus} DAMAGE`, '#f9cc8d');
    } else {
      const healed = this.health.heal(reward.healAmount);
      this.healthLabel.setText(`HP: ${this.health.hp} / ${this.health.maxHp}`);
      this.showCombatText(this.movement.position, `SANCTUARY · +${healed} HP`, '#b0ead2');
    }
    const label = this.objectiveMarkers.get(kind);
    if (label) label.setText(kind === 'cache' ? 'CACHE OPENED' : 'SANCTUARY USED');
    this.explorationView.refresh(this.movement.position);
    this.refreshOptionalPrompt();
    this.updateObjectiveStatus();
  }

  private refreshOptionalPrompt(): void {
    if (this.health.defeated || this.roomEncounters.completed) {
      this.optionalUi.hide();
      return;
    }
    this.optionalUi.show(this.optionalObjectives.nearby(
      this.movement.position, this.enemies, this.health.hp, this.health.maxHp,
    ));
  }

  private refreshHud(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    // Screenshot-driven readability pass: the left HUD never extends into
    // the fixed 192px minimap at the upper right on narrow iPhone layouts.
    const hudWidth = Math.max(110, Math.min(410, width - this.dungeon.columns * 2 - 48));
    this.titleLabel.setFontSize(width < 800 ? 17 : 20);
    this.healthLabel.setY(38).setFontSize(width < 520 ? 16 : 19);
    this.objectiveLabel.setY(79).setFontSize(width < 800 ? 14 : 16)
      .setWordWrapWidth(hudWidth);
    this.status.setWordWrapWidth(hudWidth).setVisible(this.debug.visible);
    this.debugButton?.setX(Math.max(8, width - 146)).setVisible(width >= 900);
    this.skillStatusLabel?.setY(Math.max(152, height - (width < 600 ? 150 : 46)));
    this.dungeonSeedLabel?.setY(Math.max(192, height - 77))
      .setVisible(width >= 600 || this.debug.visible);
  }

  private toggleDebug(): void {
    this.debug = toggleDebug(this.debug);
    this.debugButton.setText(this.debug.visible ? 'DEBUG: ON' : 'DEBUG: OFF');
    this.debugGraphics.setVisible(this.debug.visible);
    this.routeGraphics.setVisible(this.debug.visible);
    this.status.setVisible(this.debug.visible);
    this.refreshHud();
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

  private showDamage(position: Point, amount: number, color: string): void {
    const number = this.add.text(position.x, position.y - 22, `-${amount}`, {
      fontFamily:'Arial, sans-serif',fontSize:'19px',fontStyle:'bold',color,
      stroke:'#171c1e',strokeThickness:3,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({targets:number, y:number.y-38,alpha:0,duration:650,onComplete:()=>number.destroy()});
  }

  private spawnRoomEnemies(): void {
    for (const spawn of this.roomEncounters.placements) {
      const enemy = createEnemyAgent({
        id: spawn.id,
        position: spawn.position,
        hp: spawn.maxHp,
        maxHp: spawn.maxHp,
      }, spawn.kind);
      this.enemies.push(enemy);

      const isBrute = enemy.kind === 'brute';
      const radius = spawn.guardian ? 32 : isBrute ? 27 : 18;
      const color = spawn.guardian ? 0x8c4d6b : isBrute ? 0x75455e : 0xa44949;
      const outline = spawn.guardian ? 0xffc5dc : isBrute ? 0xe7a4cf : 0xf1a49b;
      const body = this.add.circle(0, 0, radius, color).setStrokeStyle(3, outline);
      const bar = this.add.rectangle(0, -radius - 13, spawn.guardian ? 70 : isBrute ? 55 : 40,
        5, 0x7eb88e).setOrigin(0.5);
      const children: Phaser.GameObjects.GameObject[] = [body, bar];
      if (spawn.guardian || isBrute) {
        children.push(this.add.text(0, radius > 25 ? 10 : 6,
          spawn.guardian ? 'WARDEN' : 'BRUTE', {
            fontFamily: 'Arial, sans-serif',
            fontSize: spawn.guardian ? '12px' : '11px',
            color: spawn.guardian ? '#fff0b9' : '#ffe0ef',
          }).setOrigin(0.5));
      }
      if (spawn.guardian) {
        // Keep HP bar as child index 1 (the existing health-sync contract).
        children.push(this.add.circle(0, 0, 43, 0xf0be88, 0.10)
          .setStrokeStyle(2, 0xf0be88, 0.6));
      }
      const container = this.add.container(spawn.position.x, spawn.position.y, children).setDepth(8);
      this.enemyVisuals.set(enemy.id, container);
    }
  }


  private showGroundLoot(drop: GroundLoot): void {
    const color = drop.item.rarity === 'rare' ? 0xf0c779
      : drop.item.rarity === 'magic' ? 0x8ebcff : 0xcfd4d1;
    const glow = this.add.circle(0, 0, 14, color, 0.25)
      .setStrokeStyle(2, color, 0.8);
    const symbol = this.add.star(0, -5, 4, 5, 10, color, 0.95)
      .setStrokeStyle(1, 0x161d20, 0.9);
    const label = this.add.text(0, 24, drop.item.name, {
      fontFamily: 'Arial, sans-serif', fontSize: '12px',
      color: drop.item.rarity === 'rare' ? '#f6d590'
        : drop.item.rarity === 'magic' ? '#a9cafa' : '#d8e1de',
      stroke: '#11181a', strokeThickness: 3,
    }).setOrigin(0.5);
    // Fog's world depth is 24; ground loot remains concealed until seen.
    const visual = this.add.container(drop.position.x, drop.position.y,
      [glow, symbol, label]).setDepth(7);
    this.groundVisuals.set(drop.id, visual);
  }

  private withdrawFromStash(id: string): void {
    if (this.health.defeated || this.finalized || !this.campAvailable || this.loot.bagFull) return;
    const item = this.securedStash.withdraw(id);
    if (!item) return;
    // The persistent transaction succeeds BEFORE the insecure bag is mutated.
    this.loot.bag.push(item);
    this.refreshLootPrompt();
    this.stashUi.refresh(this.campAvailable, this.loot.bagFull);
    this.updateObjectiveStatus();
  }

  private secureAndFinish(): void {
    if (this.health.defeated || this.finalized || !this.roomEncounters.completed) return;
    const items = [
      ...this.loot.bag,
      ...EQUIPMENT_SLOTS.map(slot => this.loadout.get(slot)).filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
    ];
    const result = this.securedStash.secureExpedition(items);
    if (!result.ok) {
      const message = result.reason === 'storage-full'
        ? 'Stash full: no items saved. Gear remains in this run.'
        : result.reason === 'storage-corrupt'
          ? 'Stored stash data is invalid. Nothing overwritten or lost from this run.'
          : result.reason === 'invalid-items'
            ? 'Item validation failed. Nothing secured; your run remains playable.'
            : 'On-device save failed. Gear remains in this run. Enable browser storage and retry.';
      this.lootUi.showFinishError(message);
      return;
    }
    this.finalized = true;
    this.updateObjectiveStatus();
    this.optionalUi.hide();
    this.stashUi.hideForResult();
    this.lootUi.hideForResult();
    this.movement.stop();
    this.waypoints = [];
    this.marker.setVisible(false);
    this.victoryOverlay.show(
      `${result.saved} item${result.saved === 1 ? '' : 's'} secured to this device's stash. ${this.securedStash.count} stored. New expedition awaits.`,
    );
  }

  private recalculateEquipment(): void {
    const stats = this.loadout.stats;
    // Ember Edge and weapon/affix attack bonuses are independent and stack.
    this.combat.bonusDamage = this.optionalObjectives.attackBonus + stats.attack;
    this.skills.bonusDamage = stats.spell;
    this.health.setMaxHp(100 + stats.health);
  }

  private equipBagItem(id: string): void {
    if (this.health.defeated || this.finalized) return;
    if (this.loadout.equip(id) !== 'equipped') return;
    this.recalculateEquipment();
    this.refreshLootPrompt();
    this.updateObjectiveStatus();
    this.showCombatText(this.movement.position, 'EQUIPMENT CHANGED', '#d1e7bf');
  }

  private unequipGear(slot: EquipmentSlot): void {
    if (this.health.defeated || this.finalized) return;
    const result = this.loadout.unequip(slot);
    if (result === 'bag-full') {
      this.showCombatText(this.movement.position, 'BAG FULL', '#ffad8c');
      return;
    }
    if (result !== 'unequipped') return;
    this.recalculateEquipment();
    this.refreshLootPrompt();
    this.updateObjectiveStatus();
    this.showCombatText(this.movement.position, 'GEAR REMOVED', '#d1e7bf');
  }

  private pickupGroundLoot(id: string): void {
    if (this.health.defeated) return;
    const result = this.loot.pickUp(id, this.movement.position,
      (from, to) => this.grid.isSegmentWalkable(from, to));
    if (result.status !== 'picked-up') {
      if (result.status === 'full') {
        this.showCombatText(this.movement.position, 'BAG FULL', '#ffaf8a');
      }
      this.refreshLootPrompt();
      return;
    }
    this.groundVisuals.get(id)?.destroy();
    this.groundVisuals.delete(id);
    this.showCombatText(this.movement.position, 'ITEM COLLECTED', '#e4d3a4');
    this.refreshLootPrompt();
  }

  private discardBagItem(id: string): void {
    if (this.health.defeated) return;
    const drop = this.loot.discard(id, this.movement.position);
    if (drop) this.showGroundLoot(drop);
    this.refreshLootPrompt();
  }

  private refreshLootPrompt(): void {
    if (this.health.defeated) return;
    this.lootUi.refresh(this.loot.nearby(this.movement.position,
      (from, to) => this.grid.isSegmentWalkable(from, to)));
    document.documentElement.dataset.ashenBagCount = String(this.loot.bag.length);
    document.documentElement.dataset.ashenGroundCount = String(this.loot.ground.length);
  }

  private updateObjectiveStatus(): void {
    const room = this.exploration.currentRoom(this.movement.position);
    const guardianAlive = this.roomEncounters.guardianAlive(this.enemies);
    const localHostiles = this.roomEncounters.roomHostiles(room, this.enemies);
    const alive = this.enemies.filter(enemy => enemy.hp > 0).length;
    const worn = this.loadout.stats;
    const shortObjective = this.roomEncounters.completed ? 'WARDEN DEFEATED'
      : this.roomEncounters.hasEnteredDepth ? 'DEFEAT THE WARDEN' : 'FIND THE DEEP CHAMBER';
    this.objectiveLabel.setText(`${shortObjective}\n${alive} foes · ${localHostiles} local · ${this.exploration.roomsDiscovered}/${this.exploration.totalRooms} rooms\nBag ${this.loot.bag.length}/${this.loot.capacity} · Side ${this.optionalObjectives.claimedCount}/${this.optionalObjectives.totalCount}\nGear ${this.loadout.equippedCount}/3 · A+${this.combat.bonusDamage} · S+${worn.spell} · Armor ${worn.armor}`);
    document.documentElement.dataset.ashenEncounter = this.roomEncounters.completed ? 'complete' : 'explore';
    document.documentElement.dataset.ashenGuardianAlive = String(guardianAlive);
    document.documentElement.dataset.ashenEnemyCount = String(alive);
    document.documentElement.dataset.ashenRoomHostiles = String(localHostiles);
    document.documentElement.dataset.ashenOptionalObjectives = String(this.optionalObjectives.claimedCount);
    document.documentElement.dataset.ashenBasicDamageBonus = String(this.combat.bonusDamage);
    document.documentElement.dataset.ashenEquipmentCount = String(this.loadout.equippedCount);
    document.documentElement.dataset.ashenArmor = String(worn.armor);
    document.documentElement.dataset.ashenSpellBonus = String(worn.spell);
    document.documentElement.dataset.ashenMaxHp = String(this.health.maxHp);
    document.documentElement.dataset.ashenStashCount = String(this.securedStash.count);
    document.documentElement.dataset.ashenStashStatus = this.securedStash.status;
    document.documentElement.dataset.ashenCampOpen = String(this.campAvailable);
  }

  private renderAttackWarnings(): void {
    this.attackWarnings.clear();
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.phase !== 'windup' || !enemy.attackTarget) continue;
      const stats = ENEMY_ARCHETYPES[enemy.kind];
      const progress = Phaser.Math.Clamp(1 - enemy.phaseRemaining / stats.windupSeconds, 0, 1);
      const { x, y } = enemy.attackTarget;
      this.attackWarnings.fillStyle(enemy.kind === 'brute' ? 0xd85486 : 0xe66f4e, 0.16 + progress * 0.3);
      this.attackWarnings.fillCircle(x, y, stats.attackRadius);
      this.attackWarnings.lineStyle(3 + progress * 2, enemy.kind === 'brute' ? 0xffacd4 : 0xffb085, 1);
      this.attackWarnings.strokeCircle(x, y, stats.attackRadius);
      this.attackWarnings.lineStyle(5, 0xffe5be, 0.95);
      this.attackWarnings.beginPath();
      this.attackWarnings.arc(x, y, stats.attackRadius + 5, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      this.attackWarnings.strokePath();
    }
  }

  private showCombatText(position: Point, message: string, color: string): void {
    const label = this.add.text(position.x, position.y - 42, message, {
      fontFamily:'Arial, sans-serif',fontSize:'17px',fontStyle:'bold',color,
      stroke:'#14191e',strokeThickness:3,
    }).setOrigin(0.5).setDepth(22);
    this.tweens.add({targets:label,y:label.y-33,alpha:0,duration:650,onComplete:()=>label.destroy()});
  }

  private syncEnemyHealth(): void {
    for (const enemy of this.enemies) {
      const visual = this.enemyVisuals.get(enemy.id);
      if (!visual) continue;
      const bar = visual.list[1] as Phaser.GameObjects.Rectangle;
      bar.setScale(enemy.hp / enemy.maxHp, 1);
      if (enemy.hp <= 0) {
        visual.destroy();
        this.enemyVisuals.delete(enemy.id);
        this.kills++;
        const placement = this.roomEncounters.placements.find(spawn => spawn.id === enemy.id);
        const drop = this.loot.dropForEnemy(
          enemy.id, enemy.kind, placement?.guardian ?? false, enemy.position,
        );
        if (drop) this.showGroundLoot(drop);
      }
    }
  }

  update(_time: number, delta: number): void {
    if(this.health.defeated || this.finalized || this.lootUi.isOpen || this.stashUi.isOpen) return;
    const oldX = this.movement.position.x;
    const oldY = this.movement.position.y;
    this.movement.update(delta / 1000);
    if (!this.movement.destination && this.waypoints.length) this.movement.moveTo(this.waypoints.shift()!);
    const { x, y } = this.movement.position;
    this.player.setPosition(x, y);
    if (this.campAvailable && (
      Math.hypot(x - this.dungeon.entrance.x, y - this.dungeon.entrance.y) > 155 || this.kills > 0
    )) this.campAvailable = false;
    this.stashUi.refresh(this.campAvailable, this.loot.bagFull);
    const explorationDelta = this.exploration.update(this.movement.position);
    if (explorationDelta.movedCell) {
      this.explorationView.refresh(this.movement.position);
      for (const room of explorationDelta.discovered) {
        if (room.role === 'entrance') continue;
        const message = room.role === 'cache' ? 'SEALED CACHE DISCOVERED' :
          room.role === 'depth' ? 'DEEP CHAMBER DISCOVERED' : 'CHAMBER DISCOVERED';
        this.showCombatText(this.movement.position, message, '#d8cda7');
      }
    }
    const state = this.animator.update(x - oldX, y - oldY, delta / 1000);
    const angles = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 };
    this.player.setRotation(angles[state.facing]);
    const gait = state.motion === 'walk' ? Math.sin(state.phase * Math.PI / 2) : 0;
    this.cloak.setY(5 + gait * 3);
    this.face.setY(-11 + Math.abs(gait) * 2);
    const canSee = (from: Point, to: Point): boolean => this.grid.isSegmentWalkable(from, to);
    for (const attack of this.combat.update(this.movement.position, this.enemies, delta / 1000, canSee)) {
      const enemy = this.enemies.find(e => e.id === attack.targetId);
      if (!enemy) continue;
      const pulse = this.add.circle(enemy.position.x, enemy.position.y, 26, 0xf4d28d, 0.3).setDepth(12);
      this.tweens.add({targets:pulse,alpha:0,scale:1.8,duration:220,onComplete:()=>pulse.destroy()});
      this.showDamage(enemy.position, attack.damage, '#fff0b6');
    }
    for (const cast of this.skills.update(this.movement.position, this.enemies, delta / 1000, canSee)) {
      const burst = this.add.circle(cast.center.x, cast.center.y, cast.radius, 0xe56c32, 0.25)
        .setStrokeStyle(4, 0xffb16e, 0.9).setDepth(12);
      this.tweens.add({targets:burst,scale:1.2,alpha:0,duration:460,onComplete:()=>burst.destroy()});
      for (const hit of cast.hits) {
        const enemy = this.enemies.find(e => e.id === hit.enemyId);
        if (enemy) this.showDamage(enemy.position, hit.damage, '#ff9a5c');
      }
    }
    // Both attacks and skills change health; synchronize enemy visuals once per frame.
    this.syncEnemyHealth();
    const remaining = this.skills.remaining(CINDER_BURST.id);
    this.skillStatusLabel.setText(remaining <= 0.01
      ? 'CINDER BURST: READY · automatic'
      : `CINDER BURST: ${remaining.toFixed(1)}s · automatic`);
    for (const strike of updateEnemyAgents(this.enemies,this.movement.position,this.grid,delta/1000)) {
      const flash = this.add.circle(strike.center.x,strike.center.y,strike.radius,
        strike.hit ? 0xf26b57 : 0x89baa3,0.28).setDepth(12);
      this.tweens.add({targets:flash,alpha:0,scale:1.1,duration:240,onComplete:()=>flash.destroy()});
      const mitigatedDamage = mitigatedHitDamage(strike.damage, this.loadout.stats.armor);
      if (strike.hit && this.health.damage(mitigatedDamage)) {
        this.cameras.main.shake(110,0.002);
        this.showDamage(this.movement.position,mitigatedDamage,'#ff7777');
      } else if (!strike.hit) {
        this.showCombatText(strike.center,'DODGED','#b0e2ca');
      }
    }
    this.renderAttackWarnings();
    for(const enemy of this.enemies) {
      const visual=this.enemyVisuals.get(enemy.id);
      if(visual) visual.setPosition(enemy.position.x,enemy.position.y);
    }
    this.healthLabel.setText(`HP: ${this.health.hp} / ${this.health.maxHp}`);
    if (!this.health.defeated && this.roomEncounters.update(this.movement.position, this.enemies)) {
      // Winning is not the same as extracting. Let the player pick up Warden
      // loot and inspect the bag before deliberately finishing the run.
      this.showCombatText(this.movement.position, 'WARDEN DEFEATED', '#f5d7a4');
      this.lootUi.enableFinish(() => this.secureAndFinish());
    }
    this.updateObjectiveStatus();
    this.refreshOptionalPrompt();
    this.refreshLootPrompt();
    if(this.health.defeated) {
      this.movement.stop();this.waypoints=[];this.marker.setVisible(false);
      this.lootUi.hideForResult();
      this.stashUi.hideForResult();
      this.defeatOverlay.show();
    }
    if (this.debug.visible) this.redrawRoute();
    if (!this.movement.destination && !this.waypoints.length) this.marker.setVisible(false);
    this.status.setText(`Tap/click to explore · Wheel or +/- to zoom · Zoom ${this.zoom.toFixed(1)}x\nPosition: ${Math.round(x)}, ${Math.round(y)} · ${state.motion} · Kills: ${this.kills} · Rooms ${this.exploration.roomsDiscovered}/${this.exploration.totalRooms} · Seed: ${this.dungeon.seed}`);
  }
}
