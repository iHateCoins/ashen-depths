import { expect, test, type Locator, type Page } from '@playwright/test';

const url='http://127.0.0.1:4173/ashen-depths/?seed=42';

async function activate(page:Page, target:Locator):Promise<void> {
  await expect(target).toBeVisible({timeout:15000});
  await target.scrollIntoViewIfNeeded();
  if(test.info().project.name==='desktop') await target.click();
  else await target.tap();
}

async function defeatWarden(page:Page):Promise<void> {
  await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    s.roomEncounters.hasEnteredDepth=true;
    const boss=s.enemies.find((e:any)=>e.id===s.roomEncounters.guardianId);
    if (!boss || boss.hp<=0) throw Error('Current floor Warden missing');
    boss.hp=0;
    for(const enemy of s.enemies) if(enemy.id!==boss.id)
      enemy.position={x:-3000-enemy.id*30,y:-3000};
  });
  await expect.poll(()=>page.evaluate(()=>
    document.documentElement.dataset.ashenEncounter),{timeout:12000}).toBe('complete');
}
async function nextFloor(page:Page,depth:number):Promise<void> {
  await activate(page,page.locator('#ashen-descend-run'));
  await expect.poll(()=>page.evaluate(()=>
    Number(document.documentElement.dataset.ashenDepth)),
  {timeout:15000}).toBe(depth);
  await expect(page.locator('#ashen-descend-run')).toBeHidden();
}
async function claimWardenEmber(page:Page):Promise<void> {
  await activate(page,page.locator('#ashen-reward-toggle'));
  const dialog = page.locator('#ashen-reward-overlay');
  await activate(page,dialog.getByRole('button',{name:'Choose Forge Ember'}));
  // On later floors, earlier Cache/Warden discoveries may remain unclaimed,
  // so selecting one Ember advances to the next reward instead of dismissing
  // the modal. Close it intentionally before tapping world/dock controls.
  if (await dialog.isVisible()) {
    await activate(page,dialog.getByRole('button',{name:'CLOSE'}));
  }
  await expect(dialog).toBeHidden();
}
async function readRun(page:Page):Promise<{
  depth:number;hp:number;banked:number;pending:number;bag:number;worn:number;
  embers:number;classId:string;camp:boolean;modalCount:number
}>{
  return page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {depth:s.depth,hp:s.health.hp,banked:s.passives.bankedPoints,
      pending:s.passives.pendingPoints,bag:s.loot.bag.length,
      worn:s.loadout.equippedCount,embers:s.progression.pendingForgeEmbers,
      classId:s.selectedClass,camp:s.campAvailable,
      modalCount:document.querySelectorAll('#ashen-class-toggle').length};
  });
}

test('M07: four Warden-gated floors bank gear, discovery and two first-clear passive points exactly once',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await expect(page.locator('#ashen-descend-run')).toBeHidden();
  await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    s.loot.bag.push({id:'m07-riskiest-blade',name:'Enchanted Runeblade',
      baseName:'Runeblade',baseStats:{attack:16,spell:4,armor:0,health:0},
      slot:'weapon',rarity:'magic',itemLevel:8,
      affixes:[{id:'battlemage',label:"Battlemage's Might",tier:2,value:8}]});
    if(s.loadout.equip('m07-riskiest-blade')!=='equipped') throw Error('Equip failed');
    s.recalculateEquipment();
    s.health.damage(17);
  });
  expect(await readRun(page)).toMatchObject({depth:1,hp:83,banked:0,pending:0,bag:0,worn:1,modalCount:1});
  await defeatWarden(page);
  expect(await readRun(page)).toMatchObject({depth:1,pending:0});
  await claimWardenEmber(page);
  await nextFloor(page,2);
  expect(await readRun(page)).toMatchObject({depth:2,hp:83,pending:0,worn:1,embers:1,modalCount:1});
  await defeatWarden(page);
  expect(await readRun(page)).toMatchObject({depth:2,pending:1});
  await nextFloor(page,3);
  expect(await readRun(page)).toMatchObject({depth:3,hp:83,pending:1,worn:1,modalCount:1});
  await defeatWarden(page);
  expect(await readRun(page)).toMatchObject({depth:3,pending:1});
  await nextFloor(page,4);
  expect(await readRun(page)).toMatchObject({depth:4,hp:83,pending:1,worn:1,modalCount:1});
  await defeatWarden(page);
  expect(await readRun(page)).toMatchObject({depth:4,pending:2,banked:0,embers:1});
  await claimWardenEmber(page);
  // Unclaimed rewards are deliberately allowed, but the reward modal must
  // be dismissed by a real Close click before the Finish button is tappable.
  await expect(page.locator('#ashen-reward-overlay')).toBeHidden();
  await expect(page.getByRole('button',{name:'FINISH EXPEDITION'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('ashen-depths-stash-v1'))).toBeNull();
  await activate(page,page.getByRole('button',{name:'FINISH EXPEDITION'}));
  const result=page.locator('#ashen-victory-overlay');
  await expect(result).toBeVisible({timeout:12000});
  await expect(result).toContainText('Depth 4');
  await expect(result).toContainText('2 passive points secured');
  await expect(result).toContainText('2 Forge Embers secured');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(stored.completed).toBe(1);
  expect(stored.passiveMilestones).toEqual({arcanist:[2,4]});
  expect(stored.forgeEmbers).toBe(2);
  expect(stored.items).toHaveLength(1);
  expect(stored.items[0].baseStats).toEqual({attack:16,spell:4,armor:0,health:0});
  expect(stored.items[0].id).not.toBe('m07-riskiest-blade');
  await activate(page,result.getByRole('button',{name:'NEW EXPEDITION'}));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  expect(await readRun(page)).toMatchObject({depth:1,hp:100,banked:2,pending:0,
    bag:0,worn:0,embers:0,classId:'arcanist',camp:true,modalCount:1});
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).completed)).toBe(1);
  expect(errors).toEqual([]);
});

test('M07: previously banked milestones, class-specific trees and existing saved equipment survive deeper extraction',async({page})=>{
  test.setTimeout(75000);
  await page.addInitScript(()=>{
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:7,completed:3,preferredClass:'vanguard',
      passiveMilestones:{vanguard:[2],arcanist:[2]},
      passiveAllocations:{vanguard:['v-fortitude']},
      forgeEmbers:3,unlocks:['skill:frost-bloom'],
      items:[{id:'m07-kept-weapon',name:'Old Iron Cleaver',baseName:'Iron Cleaver',
        slot:'weapon',rarity:'magic',itemLevel:5,
        affixes:[{id:'sharp',label:'Attack Power',value:5}]}],
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  expect(await readRun(page)).toMatchObject({depth:1,classId:'vanguard',hp:126,banked:1,pending:0,worn:0});
  await defeatWarden(page);await nextFloor(page,2);await defeatWarden(page);
  expect(await readRun(page)).toMatchObject({depth:2,banked:1,pending:0});
  await nextFloor(page,3);await defeatWarden(page);await nextFloor(page,4);await defeatWarden(page);
  expect(await readRun(page)).toMatchObject({depth:4,banked:1,pending:1,classId:'vanguard'});
  await activate(page,page.getByRole('button',{name:'FINISH EXPEDITION'}));
  await expect(page.locator('#ashen-victory-overlay')).toContainText('1 passive point secured for Vanguard');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(stored.passiveMilestones).toEqual({vanguard:[2,4],arcanist:[2]});
  expect(stored.passiveAllocations).toEqual({vanguard:['v-fortitude']});
  expect(stored.forgeEmbers).toBe(3);
  expect(stored.unlocks).toEqual(['skill:frost-bloom']);
  expect(stored.items.map((x:any)=>x.id)).toEqual(['m07-kept-weapon']);
  await activate(page,page.locator('#ashen-victory-overlay').getByRole('button',{name:'NEW EXPEDITION'}));
  expect(await readRun(page)).toMatchObject({depth:1,classId:'vanguard',banked:2,pending:0,hp:126});
});

test('M07: death after an even-depth Warden loses only unsecured rewards',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:2,completed:2,items:[],forgeEmbers:4,
      passiveMilestones:{arcanist:[4]},
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await defeatWarden(page);await nextFloor(page,2);await defeatWarden(page);
  expect(await readRun(page)).toMatchObject({depth:2,pending:1,banked:1});
  const before=await page.evaluate(()=>localStorage.getItem('ashen-depths-stash-v1'));
  await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    s.health.damage(9999);
  });
  await expect(page.locator('#ashen-defeat-overlay')).toBeVisible({timeout:12000});
  expect(await page.evaluate(()=>localStorage.getItem('ashen-depths-stash-v1'))).toBe(before);
  await activate(page,page.locator('#ashen-defeat-overlay').getByRole('button',{name:'RESTART EXPEDITION'}));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  expect(await readRun(page)).toMatchObject({depth:1,banked:1,pending:0,embers:0});
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).passiveMilestones))
    .toEqual({arcanist:[4]});
});
