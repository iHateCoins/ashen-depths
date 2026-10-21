import Phaser from 'phaser';
import { MovementController, type Point } from '../movement/MovementController';
import { NavigationGrid } from '../navigation/Grid';
import { findPath } from '../navigation/Pathfinder';
import { DirectionalAnimator } from '../rendering/DirectionalAnimator';
import { createDebugOptions, toggleDebug, type DebugOptions } from '../debug/DebugOptions';
import { AutoCombat } from '../combat/AutoCombat';
import { AutoSkillSystem } from '../combat/AutoSkillSystem';
import { createEnemyAgent, ENEMY_ARCHETYPES, updateEnemyAgents, type EnemyAgent } from '../combat/EnemyAI';
import { WARDEN_VARIANTS, wardenForDepth, eliteCombatProfile } from '../combat/DepthEncounters';
import { PlayerHealth } from '../combat/PlayerHealth';
import { RoomEncounterDirector } from '../combat/RoomEncounterDirector';
import { ResultOverlay } from '../ui/ResultOverlay';
import { createDungeonNavigationGrid, dungeonFloorAt, dungeonSeedFromSearch, generateDungeon, type DungeonLayout } from '../dungeon/DungeonGenerator';
import { ExplorationTracker } from '../dungeon/ExplorationTracker';
import { ExplorationView } from '../dungeon/ExplorationView';
import { OptionalObjectiveDirector, type OptionalObjectiveKind } from '../dungeon/OptionalObjectiveDirector';
import { OptionalObjectiveUI } from '../ui/OptionalObjectiveUI';
import { ExpeditionLoot } from '../loot/ExpeditionLoot';
import { groupGroundLoot, LOOT_CLUSTER_DISTANCE } from '../loot/LootPresentation';
import { LootUI } from '../ui/LootUI';
import { EquipmentLoadout, EQUIPMENT_SLOTS, mitigatedHitDamage } from '../loot/EquipmentLoadout';
import { SecuredStash } from '../loot/SecuredStash';
import { StashUI } from '../ui/StashUI';
import { ExtractionDirector } from '../dungeon/ExtractionDirector';
import { ExtractionUI } from '../ui/ExtractionUI';
import { InteractionDock } from '../ui/InteractionDock';
import { SkillLoadoutUI } from '../ui/SkillLoadoutUI';
import { SkillProgression, rewardSourceAtDepth } from '../combat/SkillProgression';
import { canDescend, seedForDepth } from '../dungeon/DepthProgression';
import { enemyHealthMultiplier, enemyStrikeDepthBonus, threatAtDepth } from '../dungeon/DepthBalance';
import { SkillRewardUI } from '../ui/SkillRewardUI';
import { ClassSelectionUI } from '../ui/ClassSelectionUI';
import { PreparationUI } from '../ui/PreparationUI';
import { narrowPortrait, viewportInsets } from '../ui/ViewportLayout';
import { CHARACTER_CLASSES, type CharacterClassId } from '../character/CharacterClasses';
import { PassiveMilestoneProgress } from '../character/PassiveMilestones';
import { PassiveTreeProgress, type PassiveAllocationResult } from '../character/PassiveTrees';
import type { EquipmentSlot, LootItem } from '../loot/ExpeditionLoot';

/** In-memory handoff only. Nothing here is secured without extraction. */
interface CheckpointTransfer {
  kind: 'checkpoint';
  consumed?: boolean;
  depth: number;
  equipped: LootItem[];
  skills: AutoSkillSystem;
  classId: CharacterClassId;
}

interface DescentTransfer {
  kind: 'descend';
  /** Phaser can reuse the last restart data when restart() has no arguments. */
  consumed?: boolean;
  depth: number;
  expeditionSeed: number;
  hp: number;
  bag: LootItem[];
  equipped: LootItem[];
  skills: AutoSkillSystem;
  progression: SkillProgression;
  classId: CharacterClassId;
  passives: PassiveMilestoneProgress;
}

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
  private extraction!: ExtractionDirector;
  private extractionUi!: ExtractionUI;
  private interactionDock!: InteractionDock;
  private skillUi!: SkillLoadoutUI;
  private progression!: SkillProgression;
  private rewardUi!: SkillRewardUI;
  private classUi!: ClassSelectionUI;
  private preparationUi!: PreparationUI;
  private selectedClass: CharacterClassId = 'arcanist';
  private passives!: PassiveMilestoneProgress;
  private passiveTree!: PassiveTreeProgress;
  private extractionOverlay!: ResultOverlay;
  private lootUi!: LootUI;
  private groundVisuals = new Map<string, Phaser.GameObjects.Container>();
  private victoryOverlay!: ResultOverlay;
  private kills = 0;
  private finalized = false;
  private defeatPresented = false;
  private depth = 1;
  private expeditionSeed = 0;
  private incoming: DescentTransfer | CheckpointTransfer | null = null;
  private returnToHideout = false;

  constructor() { super('DungeonScene'); }

  init(data?: DescentTransfer | CheckpointTransfer | {kind:'hideout'}): void {
    this.returnToHideout = data?.kind === 'hideout';
    // ScenePlugin.restart() without new data can replay the previous payload.
    // A descent handoff may initialize ONE floor only; it is not a saved run.
    this.incoming = data && (data.kind === 'descend' || data.kind === 'checkpoint') && !data.consumed ? data : null;
  }

  create(): void {
    const carry = this.incoming;
    this.incoming = null;
    if (carry) carry.consumed = true;
    this.cameras.main.setBackgroundColor('#10171b');
    this.depth = carry?.depth ?? 1;
    this.expeditionSeed = (carry?.kind === 'descend' ? carry.expeditionSeed : undefined) ??
      dungeonSeedFromSearch(window.location.search, () => Math.floor(Math.random() * 0x100000000));
    this.dungeon = generateDungeon(seedForDepth(this.expeditionSeed, this.depth));
    this.grid = createDungeonNavigationGrid(this.dungeon);
    this.roomEncounters = new RoomEncounterDirector(this.dungeon, this.grid, this.depth);
    this.optionalObjectives = new OptionalObjectiveDirector(this.dungeon, this.roomEncounters);
    this.loot = new ExpeditionLoot(this.dungeon.seed, undefined, this.depth);
    this.loadout = new EquipmentLoadout(this.loot);
    if (carry) {
      this.loot.bag.push(...(carry.kind === 'descend' ? carry.bag : []), ...carry.equipped);
      for (const item of carry.equipped) {
        if (this.loadout.equip(item.id) !== 'equipped') {
          throw new Error('Cannot restore worn equipment during descent');
        }
      }
    }
    this.securedStash = new SecuredStash();
    this.selectedClass = carry?.classId ?? this.securedStash.preferredClass;
    this.progression = (carry?.kind === 'descend' ? carry.progression : null) ??
      new SkillProgression(this.securedStash.unlockedIds, this.selectedClass);
    this.passives = (carry?.kind === 'descend' ? carry.passives : null) ?? new PassiveMilestoneProgress(
      this.selectedClass, this.securedStash.passiveDepthsFor(this.selectedClass),
    );
    this.passiveTree = new PassiveTreeProgress(this.selectedClass,
      this.securedStash.allocationsFor(this.selectedClass),
      this.securedStash.passivePointsFor(this.selectedClass));
    this.extraction = new ExtractionDirector(this.dungeon);
    // Only the initial entrance camp permits withdrawals and class/loadout edits.
    this.campAvailable = !carry;
    this.groundVisuals.clear();
    this.renderDungeon();
    this.renderOptionalMarkers();
    this.renderExtractionMarkers();
    // Scenes restart without rebuilding the TypeScript object; reset every run.
    this.health = new PlayerHealth();
    const archetype = CHARACTER_CLASSES[this.selectedClass];
    this.combat = new AutoCombat(archetype.basicRange, archetype.basicDamage,
      archetype.basicInterval);
    this.skills = carry?.skills ?? new AutoSkillSystem([archetype.startingSkill]);
    this.recalculateEquipment();
    if (carry?.kind === 'descend') this.health.hp = Math.max(1, Math.min(this.health.maxHp, carry.hp));
    this.kills = 0;
    this.finalized = false;
    this.defeatPresented = false;
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
    this.explorationView = new ExplorationView(this, this.dungeon, this.exploration, this.movement.position, this.optionalObjectives, this.extraction);
    this.cameras.main.setBounds(0, 0, this.grid.width, this.grid.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(this.zoom);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.preparationUi?.isOpen || this.health.defeated || this.finalized || this.lootUi.isOpen || this.stashUi.isOpen || this.skillUi.isOpen || this.rewardUi.isOpen || this.classUi.isOpen) return;
      if (this.extraction.phase === 'channeling') this.cancelExtraction();
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
    this.titleLabel = this.add.text(14, 3, `ASHEN DEPTHS · DEPTH ${this.depth} · M07 / PR06`, { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#e3c99c' })
      .setScrollFactor(0).setDepth(100).setOrigin(0, 0);
    this.status.setY(198).setVisible(false);
    this.dungeonSeedLabel = this.add.text(14, 0, `FLOOR SEED: ${this.dungeon.seed}`, {
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
    this.stashUi = new StashUI(
      this.securedStash, this.loot, id => this.withdrawFromStash(id),
      (id, affixIndex) => this.reforgeStashItem(id, affixIndex),
      () => document.documentElement.dataset.ashenHideoutRules !== 'true' ||
        !!this.preparationUi?.isOpen,
    );
    this.skillUi = new SkillLoadoutUI(this.skills,
      () => !this.health.defeated && !this.finalized && !this.lootUi.isOpen && !this.stashUi.isOpen,
      () => this.cancelExtraction(),
      () => this.campAvailable,
      this.progression);
    this.rewardUi = new SkillRewardUI(this.progression,
      () => !this.health.defeated && !this.finalized && !this.lootUi.isOpen && !this.stashUi.isOpen && !this.skillUi.isOpen,
      () => this.cancelExtraction());
    // The class UI immediately renders allocation eligibility in its
    // constructor, so all referenced overlay instances must exist first.
    this.classUi = new ClassSelectionUI(
      () => this.selectedClass,
      () => this.canChangeClass(),
      id => this.changeClass(id),
      () => ({ banked: this.passives.bankedPoints, pending: this.passives.pendingPoints }),
      () => ({selected:this.passiveTree.allocations,available:this.passiveTree.available,
        canAllocate:this.canAllocatePassive()}),
      id => this.allocatePassive(id),
    );
    this.extractionUi = new ExtractionUI(id => this.startExtraction(id), () => this.cancelExtraction());
    this.interactionDock = new InteractionDock(() => this.cancelExtraction());
    this.interactionDock.refresh(false);
    // Always pass a fresh-start marker for player-facing restarts. The consumed
    // descent guard also covers a bare restart() from external scene callers.
    this.defeatOverlay = new ResultOverlay('defeat', () => this.scene.restart({ kind: 'fresh' }));
    this.victoryOverlay = new ResultOverlay('victory', () => this.scene.restart({ kind: 'hideout' }));
    this.extractionOverlay = new ResultOverlay('extraction', () => this.scene.restart({ kind: 'hideout' }));
    // The localhost Playwright harness retains legacy direct-dungeon tests.
    // Real players always enter preparation first. ?intro=1 opts local tests
    // into the complete pre-expedition flow.
    const localHarness = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const prepare = !carry && (!localHarness ||
      new URLSearchParams(window.location.search).get('intro') === '1');
    this.preparationUi = new PreparationUI(
      () => this.selectedClass,
      id => this.changeClass(id),
      this.skills,
      this.progression,
      depth => {
        if (!this.securedStash.hasCharacter || depth > this.securedStash.highestUnlockedDepth) return false;
        this.stashUi.closeStash();
        this.classUi.hide();
        // The saved loadout becomes at-risk BEFORE entering the tower.
        // A failed compare-and-set leaves every item in the hideout.
        const equipped = this.securedStash.withdrawEquippedForExpedition();
        if (equipped === null) return false;
        if (depth > 1) {
          // New floor without any unextracted loot from a previous expedition.
          this.scene.restart({kind: 'checkpoint', depth, classId: this.selectedClass,
            skills: this.skills, equipped} satisfies CheckpointTransfer);
          return true;
        }
        this.loot.bag.push(...equipped);
        for (const item of equipped) {
          if (this.loadout.equip(item.id) !== 'equipped') {
            throw new Error('Cannot restore risked equipment on entry');
          }
        }
        this.stashUi.setHideoutMode(false);
        this.recalculateEquipment();
        this.refreshLootPrompt();
        this.updateObjectiveStatus();
        document.documentElement.dataset.ashenPreparation = 'entered';
        return true;
      },
      prepare,
      this.securedStash.highestUnlockedDepth,
      this.securedStash,
    );
    this.stashUi.setHideoutMode(prepare);
    this.preparationUi.addHideoutActions(
      () => this.stashUi.openStash(),
      () => this.classUi.openFromHideout(),
    );
    if (this.returnToHideout && prepare) this.preparationUi.enterHideout();
    document.documentElement.dataset.ashenHideoutRules = (!localHarness || new URLSearchParams(window.location.search).get('intro') === '1') ? 'true' : 'false';
    document.documentElement.dataset.ashenPreparation = prepare ? 'title' : 'entered';
    const preparationUi = this.preparationUi;
    const defeatOverlay = this.defeatOverlay;
    const victoryOverlay = this.victoryOverlay;
    const explorationView = this.explorationView;
    const optionalUi = this.optionalUi;
    const lootUi = this.lootUi;
    const stashUi = this.stashUi;
    const extractionUi = this.extractionUi;
    const interactionDock = this.interactionDock;
    const skillUi = this.skillUi;
    const rewardUi = this.rewardUi;
    const classUi = this.classUi;
    const extractionOverlay = this.extractionOverlay;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      defeatOverlay.destroy();
      victoryOverlay.destroy();
      explorationView.destroy();
      optionalUi.destroy();
      lootUi.destroy();
      stashUi.destroy();
      extractionUi.destroy();
      interactionDock.destroy();
      skillUi.destroy();
      rewardUi.destroy();
      classUi.destroy();
      preparationUi.destroy();
      extractionOverlay.destroy();
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
      const label = this.add.text(x, y + 38, cache ? '' : 'SANCTUARY SHRINE', {
        fontFamily: 'Arial, sans-serif', fontSize: '12px',
        color: cache ? '#f5d4a0' : '#a9ead1',
        stroke: '#101719', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(4);
      outer.setData('objective-kind', objective.id);
      this.objectiveMarkers.set(objective.id, label);
    }
  }

  private renderExtractionMarkers(): void {
    for (const site of this.extraction.sites) {
      const { x, y } = site.position;
      const ring = this.add.circle(x, y, 34, 0x5abbd0, 0.16)
        .setStrokeStyle(3, 0x8be3eb, 0.95).setDepth(4);
      this.add.circle(x, y, 17, 0x8ad2db, 0.18)
        .setStrokeStyle(2, 0xcaf3f4, 0.85).setDepth(4);
      this.add.star(x, y, 4, 8, 17, 0xa6eef2, 0.85)
        .setStrokeStyle(2, 0x2b6e7c, 0.9).setDepth(5);
      ring.setData('waystone-site', site.id);
    }
  }

  private activateOptionalObjective(kind: OptionalObjectiveKind): void {
    if (this.health.defeated || this.finalized) return;
    const reward = this.optionalObjectives.activate(
      kind, this.movement.position, this.enemies, this.health.hp, this.health.maxHp,
    );
    if (!reward) return;
    if (reward.kind === 'ember-edge') {
      this.recalculateEquipment();
      this.showCombatText(this.movement.position,
        `EMBER EDGE · +${reward.damageBonus} DAMAGE`, '#f9cc8d');
      this.progression.offer(rewardSourceAtDepth('cache', this.depth));
      this.rewardUi.refresh();
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
    if (this.health.defeated || this.finalized) {
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
    const portrait = narrowPortrait(width, height);
    const safe = viewportInsets();
    const left = Math.max(10, safe.left + 10);
    const top = Math.max(7, safe.top + 7);

    // Canvas HUD does not inherit CSS safe-area padding. Keep all labels away
    // from the iOS status bar / Dynamic Island / landscape camera notch.
    const hudWidth = portrait
      ? Math.max(120, Math.min(225, width * 0.58 - safe.left - 12))
      : Math.max(110, Math.min(410, width - this.dungeon.columns * 2 - 48));
    this.titleLabel.setText(portrait ? `ASHEN DEPTHS · DEPTH ${this.depth}`
      : `ASHEN DEPTHS · DEPTH ${this.depth} · M07 / PR06`)
      .setPosition(left, top).setFontSize(portrait ? 13 : width < 800 ? 17 : 20);
    this.healthLabel.setPosition(left, top + (portrait ? 25 : 36))
      .setFontSize(portrait ? 15 : width < 520 ? 16 : 19);
    this.objectiveLabel.setPosition(left, top + (portrait ? 56 : 75))
      .setFontSize(portrait ? 11 : width < 800 ? 14 : 16)
      .setWordWrapWidth(hudWidth);
    // Place spell status after whatever height the wrapped objective uses.
    // In landscape, this also moves it above the bottom action controls.
    this.skillStatusLabel.setPosition(left,
      this.objectiveLabel.y + this.objectiveLabel.height + (portrait ? 8 : 12))
      .setFontSize(portrait ? 11 : 15)
      .setWordWrapWidth(hudWidth);
    this.status.setPosition(left, top + 190)
      .setWordWrapWidth(hudWidth).setVisible(this.debug.visible);
    this.debugButton?.setPosition(Math.max(left, width - 146 - safe.right), top)
      .setVisible(width >= 900);
    this.dungeonSeedLabel.setPosition(left,
      Math.max(top + 210, height - 77 - safe.bottom))
      .setVisible(width >= 900 || this.debug.visible);
    // Orientation may change without moving the character. Reformat the
    // objective immediately rather than waiting for the next dungeon step.
    this.updateObjectiveStatus();
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
      const variant = spawn.guardian ?
        WARDEN_VARIANTS[spawn.wardenVariant ?? 'warden'] : null;
      const healthScale = enemyHealthMultiplier(this.depth) *
        (spawn.elite ? 1.5 : variant?.healthMultiplier ?? 1);
      const maxHp = Math.round(spawn.maxHp * healthScale);
      const enemy = createEnemyAgent({
        id: spawn.id,
        position: spawn.position,
        hp: maxHp,
        maxHp,
      }, spawn.kind, variant?.profile ??
        (spawn.elite ? eliteCombatProfile(spawn.kind) : undefined));
      this.enemies.push(enemy);

      const isBrute = enemy.kind === 'brute';
      const isSkirmisher = enemy.kind === 'skirmisher';
      const radius = spawn.guardian ? 32 : spawn.elite ? 29
        : isBrute ? 27 : isSkirmisher ? 19 : 18;
      const color = variant?.color ?? (spawn.elite ? 0x8b722d
        : isSkirmisher ? 0x458e83 : isBrute ? 0x75455e : 0xa44949);
      const outline = spawn.guardian ? 0xffc5dc : spawn.elite ? 0xffe39e
        : isSkirmisher ? 0xaffff2 : isBrute ? 0xe7a4cf : 0xf1a49b;
      const body = this.add.circle(0, 0, radius, color).setStrokeStyle(3, outline);
      const bar = this.add.rectangle(0, -radius - 13, spawn.guardian ? 70 : isBrute ? 55 : 40,
        5, 0x7eb88e).setOrigin(0.5);
      const children: Phaser.GameObjects.GameObject[] = [body, bar];
      if (spawn.guardian || isBrute || isSkirmisher || spawn.elite) {
        children.push(this.add.text(0, radius > 25 ? 10 : 6,
          variant ? variant.label.toUpperCase() : spawn.elite ? 'ELITE'
            : isBrute ? 'BRUTE' : 'SKIRMISHER', {
            fontFamily: 'Arial, sans-serif',
            fontSize: spawn.guardian ? '12px' : '11px',
            color: spawn.guardian ? '#fff0b9' : spawn.elite ? '#ffeaa2'
              : isSkirmisher ? '#bbfff0' : '#ffe0ef',
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


  /**
   * World drops are visually merged into compact rarity-colored piles rather
   * than printing full item names across enemies, rooms, and waystone labels.
   * The underlying individual loot items are unchanged and can be selected
   * one at a time from the nearby-loot picker.
   */
  private refreshGroundVisuals(): void {
    for (const visual of this.groundVisuals.values()) visual.destroy();
    this.groundVisuals.clear();
    for (const group of groupGroundLoot(
      this.loot.ground, LOOT_CLUSTER_DISTANCE,
      (from, to) => this.grid.isSegmentWalkable(from, to),
    )) {
      const color = group.topRarity === 'rare' ? 0xf0c779
        : group.topRarity === 'magic' ? 0x8ebcff : 0xcfd4d1;
      const glow = this.add.circle(0, 0, group.members.length > 1 ? 20 : 14,
        color, 0.19).setStrokeStyle(2, color, 0.75);
      const symbol = this.add.star(0, -3, 4, 5, 10, color, 0.95)
        .setStrokeStyle(1, 0x161d20, 0.9);
      const children: Phaser.GameObjects.GameObject[] = [glow, symbol];
      if (group.members.length > 1) {
        const count = this.add.text(17, -14, `×${group.members.length}`, {
          fontFamily: 'Arial, sans-serif', fontSize: '12px',
          fontStyle: 'bold', color: '#f2f4ed',
          backgroundColor: '#152126df', padding: { x: 3, y: 1 },
        }).setOrigin(0.2, 0.5);
        children.push(count);
      }
      // Entire visual stays below fog of war (depth 24).
      const visual = this.add.container(
        group.position.x, group.position.y, children,
      ).setDepth(7);
      this.groundVisuals.set(group.id, visual);
    }
  }

  private startExtraction(id: string): void {
    if (this.finalized || this.health.defeated || this.finalized ||
        this.lootUi.isOpen || this.stashUi.isOpen) return;
    if (!this.extraction.start(id, this.movement.position)) return;
    this.movement.stop();
    this.waypoints = [];
    this.marker.setVisible(false);
    this.redrawRoute();
    this.refreshExtractionPrompt();
  }

  private cancelExtraction(): void {
    if (this.extraction.phase !== 'channeling') return;
    this.extraction.cancel();
    this.refreshExtractionPrompt();
  }

  private refreshExtractionPrompt(): void {
    if (this.health.defeated || this.finalized) {
      this.extractionUi.hide();
      this.interactionDock.refresh(false);
      return;
    }
    const nearby = this.extraction.nearby(this.movement.position);
    this.extractionUi.show(nearby, this.extraction.phase,
      this.extraction.remaining, true, this.progression.choicesRemaining.length);
    this.interactionDock.refresh(this.extraction.phase === 'channeling');
  }

  private reforgeStashItem(id: string, affixIndex: number): boolean {
    if (this.health.defeated || this.finalized || !this.campAvailable ||
        (document.documentElement.dataset.ashenHideoutRules === 'true' && !this.preparationUi?.isOpen)) return false;
    const saved = this.securedStash.reforgeItem(id, affixIndex);
    if (saved) this.updateObjectiveStatus();
    return saved;
  }

  private withdrawFromStash(id: string): boolean {
    if (document.documentElement.dataset.ashenHideoutRules === 'true') return false;
    if (this.health.defeated || this.finalized || !this.campAvailable || this.loot.bagFull) return false;
    const item = this.securedStash.withdraw(id);
    if (!item) return false;
    // The persistent transaction succeeds BEFORE the insecure bag is mutated.
    this.loot.bag.push(item);
    this.refreshLootPrompt();
    this.stashUi.refresh(this.campAvailable, this.loot.bagFull);
    this.updateObjectiveStatus();
    return true;
  }

  private canChangeClass(): boolean {
    return !this.securedStash.hasCharacter &&
      (document.documentElement.dataset.ashenHideoutRules !== 'true' || !!this.preparationUi?.isOpen) &&
      this.depth === 1 && this.campAvailable && !this.finalized &&
      !this.health.defeated && this.kills === 0 && this.loot.bag.length === 0 &&
      this.loadout.equippedCount === 0 && !this.lootUi.isOpen &&
      !this.stashUi.isOpen && !this.skillUi.isOpen && !this.rewardUi.isOpen;
  }

  private changeClass(id: CharacterClassId): boolean {
    if (!this.canChangeClass() || this.securedStash.hasCharacter) return false;
    const previous = this.selectedClass;
    if (id !== previous && !this.progression.setCharacterClass(id)) return false;
    if (!this.securedStash.createCharacter(id)) {
      if (id !== previous) this.progression.setCharacterClass(previous);
      return false;
    }
    this.selectedClass = id;
    this.passives.selectClass(id, this.securedStash.passiveDepthsFor(id));
    this.passiveTree.selectClass(id, this.securedStash.allocationsFor(id),
      this.securedStash.passivePointsFor(id));
    const cls = CHARACTER_CLASSES[id];
    this.combat = new AutoCombat(cls.basicRange, cls.basicDamage, cls.basicInterval);
    this.skills.setEquipped([cls.startingSkill]);
    this.recalculateEquipment();
    this.healthLabel.setText(`HP: ${this.health.hp} / ${this.health.maxHp}`);
    this.updateObjectiveStatus();
    this.classUi.refresh();
    return true;
  }

  private canAllocatePassive(): boolean {
    return this.depth === 1 && this.campAvailable && !this.finalized &&
      (document.documentElement.dataset.ashenHideoutRules !== 'true' || this.preparationUi?.isOpen) &&
      !this.health.defeated && !this.lootUi.isOpen && !this.stashUi.isOpen &&
      !this.skillUi.isOpen && !this.rewardUi.isOpen;
  }

  private allocatePassive(id: string): PassiveAllocationResult | 'storage-error' {
    if (!this.canAllocatePassive()) return 'storage-error';
    const result = this.securedStash.allocatePassiveNode(this.selectedClass,id);
    if (result !== 'allocated') return result;
    this.passiveTree.selectClass(this.selectedClass,
      this.securedStash.allocationsFor(this.selectedClass),
      this.securedStash.passivePointsFor(this.selectedClass));
    this.recalculateEquipment();
    this.healthLabel.setText(`HP: ${this.health.hp} / ${this.health.maxHp}`);
    this.updateObjectiveStatus();
    return 'allocated';
  }

  private descend(): void {
    if (!canDescend(this.depth, this.roomEncounters.completed, this.health.defeated) ||
        this.finalized || this.lootUi.isOpen || this.stashUi.isOpen ||
        this.skillUi.isOpen || this.rewardUi.isOpen) return;
    // The previous floor's uncollected ground gear is abandoned. Everything in
    // the bag and equipped slots remains unsecured until extraction.
    const transfer: DescentTransfer = {
      kind: 'descend',
      depth: this.depth + 1,
      expeditionSeed: this.expeditionSeed,
      hp: this.health.hp,
      bag: [...this.loot.bag],
      equipped: EQUIPMENT_SLOTS.map(slot => this.loadout.get(slot)).filter(
        (item): item is LootItem => item !== null,
      ),
      skills: this.skills,
      progression: this.progression,
      classId: this.selectedClass,
      passives: this.passives,
    };
    this.cancelExtraction();
    this.scene.restart(transfer);
  }

  private secureAndFinish(mode: 'warden' | 'early' = 'warden'): void {
    if (this.health.defeated || this.finalized ||
        (mode === 'warden' && !this.roomEncounters.completed) ||
        (mode === 'early' && this.extraction.phase !== 'completed')) return;
    const items = [
      ...this.loot.bag,
      ...EQUIPMENT_SLOTS.map(slot => this.loadout.get(slot)).filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
    ];
    const result = this.securedStash.secureExpedition(
      items, this.progression.pendingUnlocks, this.progression.pendingForgeEmbers,
      { classId: this.selectedClass, depths: this.passives.pendingDepths },
      this.roomEncounters.completed ? this.depth : undefined,
      EQUIPMENT_SLOTS.map(slot => this.loadout.get(slot)?.id).filter((id): id is string => id !== undefined),
    );
    if (!result.ok) {
      const message = result.reason === 'storage-full'
        ? 'Stash full: no items saved. Gear remains in this run.'
        : result.reason === 'storage-corrupt'
          ? 'Stored stash data is invalid. Nothing overwritten or lost from this run.'
          : result.reason === 'invalid-items'
            ? 'Item validation failed. Nothing secured; your run remains playable.'
            : 'On-device save failed. Gear remains in this run. Enable browser storage and retry.';
      if (mode === 'early') {
        this.extraction.resetAfterSaveFailure();
        this.extractionUi.show(this.extraction.nearby(this.movement.position),
          this.extraction.phase, this.extraction.remaining, true,
          this.progression.choicesRemaining.length);
        this.extractionUi.showError(message + ' You may attempt escape again.');
        this.interactionDock.refresh(false);
      } else {
        this.lootUi.showFinishError(message);
      }
      return;
    }
    this.finalized = true;
    this.updateObjectiveStatus();
    this.optionalUi.hide();
    this.extractionUi.hide();
    this.interactionDock.hideForResult();
    this.stashUi.hideForResult();
    this.skillUi.hideForResult();
    this.rewardUi.hideForResult();
    this.classUi.hideForResult();
    this.lootUi.hideForResult();
    this.movement.stop();
    this.waypoints = [];
    this.marker.setVisible(false);
    const lostChoices = this.progression.choicesRemaining.length;
    const message = `Depth ${this.depth} · ${this.passives.pendingPoints} passive point${this.passives.pendingPoints === 1 ? '' : 's'} secured for ${CHARACTER_CLASSES[this.selectedClass].name} · ${result.saved} item${result.saved === 1 ? '' : 's'} secured to this device's stash. ${this.progression.pendingUnlocks.length} new skill/support unlocks · ${this.progression.pendingForgeEmbers} Forge Embers secured. ${lostChoices > 0 ? `${lostChoices} unclaimed discovery reward${lostChoices === 1 ? '' : 's'} forfeited. ` : ''}${this.securedStash.count} items stored. New expedition awaits.`;
    if (mode === 'early') this.extractionOverlay.show(message);
    else this.victoryOverlay.show(message);
  }

  private recalculateEquipment(): void {
    const stats = this.loadout.stats;
    // Ember Edge and weapon/affix attack bonuses are independent and stack.
    const passive = this.passiveTree.effects;
    this.combat.bonusDamage = this.optionalObjectives.attackBonus + stats.attack + passive.attack;
    this.skills.bonusDamage = stats.spell + passive.spell;
    this.skills.bonusAttackDamage = stats.attack + passive.attack;
    this.skills.passiveCooldownReduction = passive.cooldownReduction;
    this.health.setMaxHp(Math.max(1,
      CHARACTER_CLASSES[this.selectedClass].health + stats.health + passive.health));
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
    this.refreshGroundVisuals();
    this.showCombatText(this.movement.position, 'ITEM COLLECTED', '#e4d3a4');
    this.refreshLootPrompt();
  }

  private discardBagItem(id: string): void {
    if (this.health.defeated) return;
    const drop = this.loot.discard(id, this.movement.position);
    if (drop) this.refreshGroundVisuals();
    this.refreshLootPrompt();
  }

  private refreshLootPrompt(): void {
    if (this.health.defeated) return;
    const nearby = this.loot.nearbyItems(this.movement.position,
      (from, to) => this.grid.isSegmentWalkable(from, to));
    this.lootUi.refresh(nearby[0] ?? null, nearby);
    document.documentElement.dataset.ashenBagCount = String(this.loot.bag.length);
    document.documentElement.dataset.ashenGroundCount = String(this.loot.ground.length);
  }

  private updateObjectiveStatus(): void {
    const room = this.exploration.currentRoom(this.movement.position);
    const guardianAlive = this.roomEncounters.guardianAlive(this.enemies);
    const localHostiles = this.roomEncounters.roomHostiles(room, this.enemies);
    const alive = this.enemies.filter(enemy => enemy.hp > 0).length;
    const worn = this.loadout.stats;
    const wardenName = WARDEN_VARIANTS[wardenForDepth(this.depth)].label.toUpperCase();
    const shortObjective = this.roomEncounters.completed ? 'WARDEN DEFEATED · EXTRACT OR DESCEND'
      : this.roomEncounters.hasEnteredDepth ? `DEFEAT THE ${wardenName}` : 'FIND THE DEEP CHAMBER';
    const portrait = narrowPortrait(this.scale.width, this.scale.height);
    // Portrait has a narrow left information column beside the minimap.
    // Put verbose counters in landscape and retain the essential objectives,
    // survivability and progression in a legible five-line portrait HUD.
    this.objectiveLabel.setText(portrait
      ? `${shortObjective}\n${alive} foes · ${this.exploration.roomsDiscovered}/${this.exploration.totalRooms} rooms\nBag ${this.loot.bag.length}/${this.loot.capacity} · Gear ${this.loadout.equippedCount}/3\nA+${this.combat.bonusDamage} · S+${worn.spell + this.passiveTree.effects.spell} · Armor ${worn.armor + this.passiveTree.effects.armor}\nPassives ${this.passives.bankedPoints} · ${this.passives.pendingPoints} risk`
      : `${CHARACTER_CLASSES[this.selectedClass].name.toUpperCase()} · DEPTH ${this.depth} · ${shortObjective}\n${alive} foes · ${localHostiles} local · ${this.exploration.roomsDiscovered}/${this.exploration.totalRooms} rooms\nBag ${this.loot.bag.length}/${this.loot.capacity} · Side ${this.optionalObjectives.claimedCount}/${this.optionalObjectives.totalCount}\nGear ${this.loadout.equippedCount}/3 · A+${this.combat.bonusDamage} · S+${worn.spell + this.passiveTree.effects.spell} · Armor ${worn.armor + this.passiveTree.effects.armor}\nPassives ${this.passives.bankedPoints} secured · ${this.passives.pendingPoints} AT RISK`);
    // Objective height changes as rooms and rewards update. Reflow the skill
    // readout instead of letting wrapped text draw over other labels.
    this.skillStatusLabel.setY(this.objectiveLabel.y + this.objectiveLabel.height +
      (portrait ? 8 : 12));
    document.documentElement.dataset.ashenEncounter = this.roomEncounters.completed ? 'complete' : 'explore';
    document.documentElement.dataset.ashenDepth = String(this.depth);
    document.documentElement.dataset.ashenThreatTier = threatAtDepth(this.depth);
    document.documentElement.dataset.ashenStrikeBonus =
      String(enemyStrikeDepthBonus(this.depth));
    document.documentElement.dataset.ashenWardenVariant = wardenForDepth(this.depth);
    document.documentElement.dataset.ashenEliteCount =
      String(this.roomEncounters.placements.filter(spawn => spawn.elite).length);
    document.documentElement.dataset.ashenSkirmisherCount =
      String(this.roomEncounters.placements.filter(spawn => spawn.kind === 'skirmisher').length);
    document.documentElement.dataset.ashenClass = this.selectedClass;
    document.documentElement.dataset.ashenPassiveSpent = String(this.passiveTree.spent);
    document.documentElement.dataset.ashenPassiveAvailable = String(this.passiveTree.available);
    document.documentElement.dataset.ashenPassiveSecured = String(this.passives.bankedPoints);
    document.documentElement.dataset.ashenPassivePending = String(this.passives.pendingPoints);
    this.classUi.updatePassiveStatus();
    document.documentElement.dataset.ashenNextDepthUnlocked = String(
      canDescend(this.depth, this.roomEncounters.completed, this.health.defeated));
    document.documentElement.dataset.ashenGuardianAlive = String(guardianAlive);
    document.documentElement.dataset.ashenEnemyCount = String(alive);
    document.documentElement.dataset.ashenRoomHostiles = String(localHostiles);
    document.documentElement.dataset.ashenOptionalObjectives = String(this.optionalObjectives.claimedCount);
    document.documentElement.dataset.ashenBasicDamageBonus = String(this.combat.bonusDamage);
    document.documentElement.dataset.ashenEquipmentCount = String(this.loadout.equippedCount);
    document.documentElement.dataset.ashenArmor =
      String(worn.armor + this.passiveTree.effects.armor);
    document.documentElement.dataset.ashenSpellBonus = String(worn.spell);
    document.documentElement.dataset.ashenMaxHp = String(this.health.maxHp);
    document.documentElement.dataset.ashenStashCount = String(this.securedStash.count);
    document.documentElement.dataset.ashenStashStatus = this.securedStash.status;
    document.documentElement.dataset.ashenCampOpen = String(this.campAvailable);
    document.documentElement.dataset.ashenPendingUnlocks = String(this.progression.pendingUnlocks.length);
    document.documentElement.dataset.ashenSecuredUnlocks = String(this.progression.secured.length);
    document.documentElement.dataset.ashenPendingForgeEmbers = String(this.progression.pendingForgeEmbers);
    document.documentElement.dataset.ashenUnclaimedDiscoveries = String(this.progression.choicesRemaining.length);
    this.lootUi.setUnclaimedDiscoveries(this.progression.choicesRemaining.length);
    document.documentElement.dataset.ashenSecuredForgeEmbers = String(this.securedStash.forgeEmbers);
    document.documentElement.dataset.ashenExitCount = String(this.extraction.sites.length);
    document.documentElement.dataset.ashenExtractionPhase = this.extraction.phase;
    document.documentElement.dataset.ashenExtractionSite = this.extraction.site?.id ?? '';
    document.documentElement.dataset.ashenExtractionNearby =
      this.extraction.nearby(this.movement.position)?.id ?? '';
  }

  private renderAttackWarnings(): void {
    this.attackWarnings.clear();
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.phase !== 'windup' || !enemy.attackTarget) continue;
      const stats = enemy.profile ?? ENEMY_ARCHETYPES[enemy.kind];
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
          placement?.elite ?? false,
        );
        if (drop) this.refreshGroundVisuals();
      }
    }
  }

  /** A lethal hit must always show defeat, including asynchronous damage. */
  private presentDefeat(): void {
    if (!this.health.defeated || this.defeatPresented || this.finalized) return;
    this.defeatPresented = true;
    this.cancelExtraction();
    this.movement.stop();
    this.waypoints = [];
    this.marker.setVisible(false);
    this.lootUi.hideForResult();
    this.stashUi.hideForResult();
    this.skillUi.hideForResult();
    this.rewardUi.hideForResult();
    this.classUi.hideForResult();
    this.extractionUi.hide();
    this.interactionDock.hideForResult();
    this.defeatOverlay.show();
  }

  update(_time: number, delta: number): void {
    // Defeat might originate outside a contact-strike frame (future hazards,
    // scripted bosses or asynchronous state transitions). Never leave a dead
    // character on a frozen dungeon without the restart action.
    if (this.health.defeated) { this.presentDefeat(); return; }
    if (this.extraction.phase === 'channeling' &&
        (this.lootUi.isOpen || this.stashUi.isOpen || this.skillUi.isOpen ||
         this.rewardUi.isOpen || this.classUi.isOpen)) this.cancelExtraction();
    if(this.preparationUi?.isOpen || this.health.defeated || this.finalized || this.lootUi.isOpen || this.stashUi.isOpen || this.skillUi.isOpen || this.rewardUi.isOpen || this.classUi.isOpen) return;
    const hpBeforeFrame = this.health.hp;
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
      const color = cast.skillId === 'crescent-cleave' ? 0xe8bb6c
        : cast.skillId === 'piercing-volley' ? 0xf5c576
        : cast.skillId === 'arc-relay' ? 0x82c8ff
        : cast.skillId === 'frost-bloom' ? 0x74cce2
        : cast.skillId === 'ash-lance' ? 0xb28ce8 : 0xe56c32;
      const rim = cast.skillId === 'crescent-cleave' ? 0xffedac
        : cast.skillId === 'piercing-volley' ? 0xffe7b0
        : cast.skillId === 'arc-relay' ? 0xd0f4ff
        : cast.skillId === 'frost-bloom' ? 0xb9f4ff
        : cast.skillId === 'ash-lance' ? 0xe2ccff : 0xffb16e;
      if (cast.pattern === 'area') {
        const burst = this.add.circle(cast.center.x, cast.center.y, cast.radius, color, 0.25)
          .setStrokeStyle(4, rim, 0.9).setDepth(12);
        this.tweens.add({targets:burst,scale:1.2,alpha:0,duration:460,onComplete:()=>burst.destroy()});
      } else if (cast.pattern === 'pierce' && cast.path && cast.path.length > 1) {
        const beam = this.add.graphics().setDepth(12);
        const [from, to] = cast.path;
        const line = new Phaser.Geom.Line(from.x, from.y, to.x, to.y);
        beam.lineStyle(cast.radius * 2, color, 0.20).strokeLineShape(line);
        beam.lineStyle(4, rim, 0.90).strokeLineShape(line);
        this.tweens.add({targets:beam,alpha:0,duration:360,onComplete:()=>beam.destroy()});
      } else if (cast.pattern === 'chain' && cast.path) {
        const arc = this.add.graphics().setDepth(12);
        arc.lineStyle(7, color, 0.75);
        for (let index = 1; index < cast.path.length; index++) {
          const from = cast.path[index - 1];
          const to = cast.path[index];
          arc.strokeLineShape(new Phaser.Geom.Line(from.x, from.y, to.x, to.y));
        }
        // A solitary first hit still gets a visible marker.
        for (const hit of cast.path) {
          arc.lineStyle(2, rim, 0.9).strokeCircle(hit.x, hit.y, 16);
        }
        this.tweens.add({targets:arc,alpha:0,duration:430,onComplete:()=>arc.destroy()});
      }
      for (const hit of cast.hits) {
        const enemy = this.enemies.find(e => e.id === hit.enemyId);
        if (enemy) this.showDamage(enemy.position, hit.damage,
          cast.skillId === 'crescent-cleave' || cast.skillId === 'piercing-volley' ? '#ffdc93' : cast.skillId === 'arc-relay' ? '#c5efff' : cast.skillId === 'frost-bloom' ? '#a8ebfb' : cast.skillId === 'ash-lance' ? '#e0baff' : '#ff9a5c');
      }
    }
    // Both attacks and skills change health; synchronize enemy visuals once per frame.
    this.syncEnemyHealth();
    this.skillStatusLabel.setText(this.skills.equipped.length
      ? this.skills.equipped.map(skill => {
        const remaining = this.skills.remaining(skill.id);
        const support = this.skills.supportFor(skill.id);
        return `[${skill.type.toUpperCase()}] ${skill.name.toUpperCase()}${support ? ' + ' + support.name.toUpperCase() : ''}: ${remaining <= 0.01 ? 'READY' : `${remaining.toFixed(1)}s`}`;
      }).join('\n') : 'NO ACTIVE SKILLS');
    for (const strike of updateEnemyAgents(this.enemies,this.movement.position,this.grid,delta/1000)) {
      const flash = this.add.circle(strike.center.x,strike.center.y,strike.radius,
        strike.hit ? 0xf26b57 : 0x89baa3,0.28).setDepth(12);
      this.tweens.add({targets:flash,alpha:0,scale:1.1,duration:240,onComplete:()=>flash.destroy()});
      const mitigatedDamage = mitigatedHitDamage(
        strike.damage + enemyStrikeDepthBonus(this.depth),
        this.loadout.stats.armor + this.passiveTree.effects.armor,
      );
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
    // Enemy strikes are resolved before extraction can complete. A lethal or
    // nonlethal hit on the final frame interrupts instead of saving the run.
    const extractionTick = this.extraction.update(
      delta / 1000, this.movement.position,
      this.health.hp < hpBeforeFrame, this.health.defeated,
    );
    if (extractionTick === 'interrupted') {
      this.showCombatText(this.movement.position, 'EXTRACTION INTERRUPTED', '#ffad8b');
    } else if (extractionTick === 'completed') {
      this.secureAndFinish('early');
      this.updateObjectiveStatus();
      if (this.finalized) return;
    }
    if (!this.health.defeated && this.roomEncounters.update(this.movement.position, this.enemies)) {
      // Winning is not the same as extracting. Let the player pick up Warden
      // loot and inspect the bag before deliberately finishing the run.
      this.showCombatText(this.movement.position, 'WARDEN DEFEATED', '#f5d7a4');
      if (this.passives.defeatWarden(this.depth, this.roomEncounters.completed)) {
        this.showCombatText(this.movement.position, '+1 PASSIVE POINT · UNSECURED', '#b7efc6');
      }
      // Defeating the Warden unlocks Finish but does not close optional
      // objectives or early extraction. Both remain until an exit is saved.
      this.lootUi.enableFinish(() => this.secureAndFinish());
      if (canDescend(this.depth, this.roomEncounters.completed, this.health.defeated)) {
        this.lootUi.enableDescent(this.depth + 1, () => this.descend());
      }
      this.progression.offer(rewardSourceAtDepth('warden', this.depth));
      this.rewardUi.refresh();
    }
    this.updateObjectiveStatus();
    this.rewardUi.refresh();
    this.refreshOptionalPrompt();
    this.refreshLootPrompt();
    this.refreshExtractionPrompt();
    if (this.health.defeated) this.presentDefeat();
    if (this.debug.visible) this.redrawRoute();
    if (!this.movement.destination && !this.waypoints.length) this.marker.setVisible(false);
    this.status.setText(`Tap/click to explore · Wheel or +/- to zoom · Zoom ${this.zoom.toFixed(1)}x\nPosition: ${Math.round(x)}, ${Math.round(y)} · ${state.motion} · Kills: ${this.kills} · Rooms ${this.exploration.roomsDiscovered}/${this.exploration.totalRooms} · Seed: ${this.dungeon.seed}`);
  }
}
