import { expect, test, type Locator, type Page } from '@playwright/test';
const url='http://127.0.0.1:4173/ashen-depths/?seed=42';

async function activate(page:Page,target:Locator):Promise<void>{
  await expect(target).toBeVisible({timeout:12000});
  await target.scrollIntoViewIfNeeded();
  if(test.info().project.name==='desktop') await target.click();
  else await target.tap();
}
async function details(page:Page):Promise<{cls:string;hp:number;attack:number;armor:number;haste:number;selected:string[];available:number}>{
  return page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {cls:scene.selectedClass,hp:scene.health.maxHp,attack:scene.combat.bonusDamage,
      armor:scene.passiveTree.effects.armor,haste:scene.skills.passiveCooldownReduction,
      selected:[...scene.passiveTree.allocations],available:scene.passiveTree.available};
  });
}
test('three passive branches spend secured points and apply real stats without changing legacy gear',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    if(sessionStorage.getItem('passive-tree-seeded'))return;
    sessionStorage.setItem('passive-tree-seeded','1');
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:6,completed:4,preferredClass:'vanguard',
      items:[{id:'historic-weapon',name:'Old Cleaver',baseName:'Iron Cleaver',
        rarity:'magic',slot:'weapon',itemLevel:5,
        affixes:[{id:'sharp',label:'Attack Power',value:6}]}],
      forgeEmbers:3,unlocks:['skill:frost-bloom'],
      passiveMilestones:{vanguard:[2,4,6,8],arcanist:[2,4]},
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  expect(await details(page)).toEqual({cls:'vanguard',hp:120,attack:0,armor:0,
    haste:0,selected:[],available:4});
  await activate(page,page.locator('#ashen-class-toggle'));
  const modal=page.locator('#ashen-class-overlay');
  const tree=page.locator('#ashen-passive-tree');
  await expect(tree).toBeVisible();
  await expect(tree.locator('.ashen-passive-lane')).toHaveCount(3);
  await expect(tree.locator('.ashen-passive-node')).toHaveCount(12);
  await expect(tree.getByRole('button',{name:'Allocate Measured Strikes'})).toBeDisabled();
  await activate(page,tree.getByRole('button',{name:'Allocate Iron Grip'}));
  await activate(page,tree.getByRole('button',{name:'Allocate Measured Strikes'}));
  await activate(page,tree.getByRole('button',{name:'Allocate Stalwart'}));
  await activate(page,tree.getByRole('button',{name:'Allocate Reinforced Mail'}));
  expect(await details(page)).toEqual({
    cls:'vanguard',hp:126,attack:5,armor:2,haste:3,
    selected:['v-strike','v-tempo','v-fortitude','v-plating'],available:0,
  });
  await expect(tree.getByRole('button',{name:'Allocate Fell Edge'})).toBeDisabled();
  await expect(page.locator('#ashen-passive-summary')).toContainText('4 spent · 0 available');
  const raw=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(raw.passiveAllocations.vanguard).toEqual(['v-strike','v-tempo','v-fortitude','v-plating']);
  expect(raw.forgeEmbers).toBe(3);
  expect(raw.items[0].id).toBe('historic-weapon');

  // Class selection changes the active talent tree but retains all purchases.
  await activate(page,modal.getByRole('button',{name:'Choose Arcanist'}));
  await expect(tree.getByRole('button',{name:'Allocate Kindled Mind'})).toBeEnabled();
  expect((await details(page)).selected).toEqual([]);
  await activate(page,tree.getByRole('button',{name:'Allocate Kindled Mind'}));
  const mage=await details(page);
  expect(mage.cls).toBe('arcanist');
  expect(mage.attack).toBe(0);
  expect(mage.hp).toBe(100);
  expect(mage.selected).toEqual(['a-spark']);
  expect(mage.available).toBe(1);
  await activate(page,modal.getByRole('button',{name:'CLOSE'}));

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  expect((await details(page)).selected).toEqual(['a-spark']);
  await activate(page,page.locator('#ashen-class-toggle'));
  await activate(page,modal.getByRole('button',{name:'Choose Vanguard'}));
  expect((await details(page)).selected).toEqual(['v-strike','v-tempo','v-fortitude','v-plating']);
  expect((await details(page)).hp).toBe(126);
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(persisted.passiveAllocations).toEqual({
    vanguard:['v-strike','v-tempo','v-fortitude','v-plating'],arcanist:['a-spark'],
  });
  expect(errors).toEqual([]);
});

test('failed node write never spends a point and leaving camp locks tree purchases',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:2,completed:1,items:[],preferredClass:'arcanist',
      passiveMilestones:{arcanist:[2]},forgeEmbers:7,
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await activate(page,page.locator('#ashen-class-toggle'));
  const tree=page.locator('#ashen-passive-tree');
  const spark=tree.getByRole('button',{name:'Allocate Kindled Mind'});
  await expect(spark).toBeEnabled();
  await page.evaluate(()=>{
    const proto=Storage.prototype as Storage & {__beforeTalent?:typeof Storage.prototype.setItem};
    proto.__beforeTalent=proto.setItem;
    proto.setItem=function():void{throw Error('quota');};
  });
  await activate(page,spark);
  await expect(page.locator('#ashen-class-overlay')).toContainText('Passive allocation could not be saved');
  expect((await details(page)).selected).toEqual([]);
  expect((await details(page)).available).toBe(1);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).passiveAllocations))
    .toBeUndefined();
  await page.evaluate(()=>{
    const proto=Storage.prototype as Storage & {__beforeTalent?:typeof Storage.prototype.setItem};
    proto.setItem=proto.__beforeTalent!;
    delete proto.__beforeTalent;
  });
  await activate(page,spark);
  expect((await details(page)).selected).toEqual(['a-spark']);
  expect((await details(page)).available).toBe(0);
  await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.campAvailable=false; scene.classUi.refresh();
  });
  await expect(tree.getByRole('button',{name:'Allocate Ember Ward'})).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).forgeEmbers))
    .toBe(7);
});
