import { test, expect, type Page, type Locator } from '@playwright/test';

const url='http://127.0.0.1:4173/ashen-depths/?seed=42';
async function activate(page:Page,target:Locator):Promise<void>{
  await expect(target).toBeVisible({timeout:12000});
  await target.scrollIntoViewIfNeeded();
  if(test.info().project.name==='desktop') await target.click();
  else await target.tap();
}
async function beatWarden(page:Page):Promise<void>{
  await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth=true;
    const boss=scene.enemies.find((enemy:any)=>enemy.id===scene.roomEncounters.guardianId);
    if(!boss) throw Error('Missing Warden');
    boss.hp=0;
    for(const enemy of scene.enemies){
      if(enemy.id!==boss.id) enemy.position={x:-2000-enemy.id*25,y:-2000};
    }
  });
  await expect.poll(()=>page.evaluate(()=>
    document.documentElement.dataset.ashenEncounter),{timeout:12000}).toBe('complete');
}
async function descend(page:Page,depth:number):Promise<void>{
  await activate(page,page.locator('#ashen-descend-run'));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth),
    {timeout:15000}).toBe(String(depth));
}
async function readProgress(page:Page):Promise<{depth:number;cls:string;banked:number;pending:number}>{
  return page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {depth:scene.depth,cls:scene.selectedClass,
      banked:scene.passives.bankedPoints,pending:scene.passives.pendingPoints};
  });
}

test('only even-depth Warden victory grants a risky point, which banks atomically upon extraction',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  expect(await readProgress(page)).toEqual({depth:1,cls:'arcanist',banked:0,pending:0});
  await beatWarden(page);
  expect(await readProgress(page)).toEqual({depth:1,cls:'arcanist',banked:0,pending:0});
  await descend(page,2);
  expect(await readProgress(page)).toEqual({depth:2,cls:'arcanist',banked:0,pending:0});
  // Merely arriving on depth 2 does not award anything.
  const before=await page.evaluate(()=>localStorage.getItem('ashen-depths-stash-v1'));
  expect(before).toBeNull();
  await beatWarden(page);
  expect(await readProgress(page)).toEqual({depth:2,cls:'arcanist',banked:0,pending:1});
  await expect(page.locator('#ashen-class-toggle')).toContainText('PASSIVES 0 (+1 RISK)');
  await activate(page,page.locator('#ashen-class-toggle'));
  await expect(page.locator('#ashen-class-overlay')).toContainText('0 secured · 1 unsecured');
  await activate(page,page.locator('#ashen-class-overlay').getByRole('button',{name:'CLOSE'}));
  expect(await page.evaluate(()=>localStorage.getItem('ashen-depths-stash-v1'))).toBeNull();
  await activate(page,page.getByRole('button',{name:'FINISH EXPEDITION'}));
  await expect(page.locator('#ashen-victory-overlay')).toContainText('1 passive point secured for Arcanist');
  const raw=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(raw.passiveMilestones).toEqual({arcanist:[2]});
  expect(raw.completed).toBe(1);
  await activate(page,page.locator('#ashen-victory-overlay').getByRole('button',{name:'NEW EXPEDITION'}));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  expect(await readProgress(page)).toEqual({depth:1,cls:'arcanist',banked:1,pending:0});
  expect(errors).toEqual([]);
});

test('banked points are once per class, and a different class has a separate ledger',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:5,completed:3,items:[],unlocks:['skill:frost-bloom'],
      preferredClass:'vanguard',forgeEmbers:4,
      passiveMilestones:{vanguard:[2,4],arcanist:[2]},
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  expect(await readProgress(page)).toEqual({depth:1,cls:'vanguard',banked:2,pending:0});
  await activate(page,page.locator('#ashen-class-toggle'));
  await activate(page,page.locator('#ashen-class-overlay').getByRole('button',{name:'Choose Arcanist'}));
  expect(await readProgress(page)).toEqual({depth:1,cls:'arcanist',banked:1,pending:0});
  await activate(page,page.locator('#ashen-class-overlay').getByRole('button',{name:'CLOSE'}));
  await beatWarden(page);
  await descend(page,2);
  await beatWarden(page);
  expect(await readProgress(page)).toEqual({depth:2,cls:'arcanist',banked:1,pending:0});
  // Repeated Warden does not create another passive point, although it
  // remains possible to secure normal loot/skills and finish.
  await activate(page,page.getByRole('button',{name:'FINISH EXPEDITION'}));
  await expect(page.locator('#ashen-victory-overlay')).toContainText('0 passive points secured for Arcanist');
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(save.passiveMilestones).toEqual({vanguard:[2,4],arcanist:[2]});
  expect(save.forgeEmbers).toBe(4);
  expect(save.unlockedIds).toBeUndefined();
  expect(save.unlocks).toEqual(['skill:frost-bloom']);
});

test('unsecured Warden point disappears on restart; saved ledger survives bad extraction write',async({page})=>{
  await page.addInitScript(()=>{
    if(sessionStorage.getItem('passive-seeded'))return;
    sessionStorage.setItem('passive-seeded','1');
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:1,completed:1,items:[],preferredClass:'arcanist',
      passiveMilestones:{vanguard:[2]},forgeEmbers:3,
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await beatWarden(page);await descend(page,2);await beatWarden(page);
  expect(await readProgress(page)).toEqual({depth:2,cls:'arcanist',banked:0,pending:1});
  await page.evaluate(()=>{
    const proto=Storage.prototype as Storage & {__savedSetter?:typeof Storage.prototype.setItem};
    proto.__savedSetter=proto.setItem;
    proto.setItem=function():void{throw Error('quota');};
  });
  await activate(page,page.getByRole('button',{name:'FINISH EXPEDITION'}));
  await expect(page.locator('#ashen-finish-warning')).toContainText('On-device save failed');
  expect(await readProgress(page)).toEqual({depth:2,cls:'arcanist',banked:0,pending:1});
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).passiveMilestones))
    .toEqual({vanguard:[2]});
  await page.evaluate(()=>{
    const proto=Storage.prototype as Storage & {__savedSetter?:typeof Storage.prototype.setItem};
    proto.setItem=proto.__savedSetter!;
    delete proto.__savedSetter;
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.scene.restart({kind:'fresh'});
  });
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  expect(await readProgress(page)).toEqual({depth:1,cls:'arcanist',banked:0,pending:0});
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).passiveMilestones))
    .toEqual({vanguard:[2]});
});
