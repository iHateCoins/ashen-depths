import { expect, test, type Locator, type Page } from '@playwright/test';

const url='http://127.0.0.1:4173/ashen-depths/?seed=42';
async function tap(page:Page, target:Locator):Promise<void>{
  await expect(target).toBeVisible({timeout:12000});
  await target.scrollIntoViewIfNeeded();
  if(test.info().project.name==='desktop') await target.click();
  else await target.tap();
}
async function defeatFloorWarden(page:Page):Promise<void>{
  await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth=true;
    const boss=scene.enemies.find((enemy:any)=>enemy.id===scene.roomEncounters.guardianId);
    if(!boss) throw new Error('Missing floor Warden');
    boss.hp=0;
    for(const enemy of scene.enemies){
      if(enemy.id!==boss.id) enemy.position={x:-2000-enemy.id*20,y:-2000};
    }
  });
  await expect.poll(()=>page.evaluate(()=>
    document.documentElement.dataset.ashenEncounter),{timeout:12000}).toBe('complete');
}
test('only a defeated Warden unlocks descent, which retains risky loot, HP and discovery choices',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  await expect(page.locator('#ashen-descend-run')).toBeHidden();
  await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    // Add valid risky test gear; the descent must not persist it yet.
    scene.loot.bag.push({
      id:'depth-carry-weapon',name:'Enchanted Iron Cleaver',baseName:'Iron Cleaver',
      rarity:'magic',slot:'weapon',itemLevel:5,
      affixes:[{id:'sharp',label:'Attack Power',value:5}],
    });
    scene.health.damage(25);
    // Reaching a room alone must never authorize descent.
    scene.roomEncounters.hasEnteredDepth=true;
    scene.descend();
  });
  expect(await page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  await defeatFloorWarden(page);
  const descend=page.locator('#ashen-descend-run');
  await expect(descend).toBeVisible();
  await expect(descend).toContainText('DEPTH 2');
  await expect(descend).toContainText('KEEP LOOT AT RISK');
  // Regression for PR34's initial cross-browser failure: a visible button
  // must actually receive pointer events, not hand them to the Phaser canvas.
  await expect.poll(async () => descend.evaluate(button => {
    const box = button.getBoundingClientRect();
    const atCenter = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return getComputedStyle(button).pointerEvents === 'auto' &&
      (atCenter === button || button.contains(atCenter));
  })).toBe(true);
  // Claim the depth-one Warden Ember; it must not yet exist in secure storage.
  await tap(page,page.locator('#ashen-reward-toggle'));
  await tap(page,page.locator('#ashen-reward-overlay').getByRole('button',{name:'Choose Forge Ember'}));
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')??'null'))).toBeNull();

  await tap(page,descend);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth),{timeout:15000}).toBe('2');
  await expect(page.locator('#ashen-descend-run')).toBeHidden();
  await expect(page.locator('#ashen-finish-run')).toBeHidden();
  const carried=await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {
      bag:scene.loot.bag.map((item:any)=>item.id),
      hp:scene.health.hp,
      embers:scene.progression.pendingForgeEmbers,
      camp:scene.campAvailable,
      seed:scene.dungeon.seed,
      level:scene.loot.dropForEnemy(9999,'brute',true,{x:0,y:0})?.item.itemLevel,
    };
  });
  expect(carried.bag).toEqual(['depth-carry-weapon']);
  expect(carried.hp).toBe(75);
  expect(carried.embers).toBe(1);
  expect(carried.camp).toBe(false);
  expect(carried.seed).not.toBe(42);
  expect(carried.level).toBe(10);
  expect(await page.evaluate(()=>localStorage.getItem('ashen-depths-stash-v1'))).toBeNull();
  await defeatFloorWarden(page);
  await expect(page.locator('#ashen-descend-run')).toContainText('DEPTH 3');
  await tap(page,page.locator('#ashen-reward-toggle'));
  await expect(page.locator('#ashen-reward-overlay')).toContainText('Warden Discovery');
  await tap(page,page.locator('#ashen-reward-overlay').getByRole('button',{name:'Choose Forge Ember'}));
  await tap(page,page.getByRole('button',{name:'FINISH EXPEDITION'}));
  const result=page.locator('#ashen-victory-overlay');
  await expect(result).toBeVisible({timeout:12000});
  await expect(result).toContainText('Depth 2');
  await expect(result).toContainText('1 item secured');
  await expect(result).toContainText('2 Forge Embers secured');
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(save.items).toHaveLength(1);
  expect(save.forgeEmbers).toBe(2);
  expect(save.completed).toBe(1);
  await tap(page,result.getByRole('button',{name:'NEW EXPEDITION'}));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 1');
  expect(errors).toEqual([]);
});

test('restart without extraction resets the depth and does not secure risky loot',async({page})=>{
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await defeatFloorWarden(page);
  await tap(page,page.locator('#ashen-descend-run'));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('2');
  await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.scene.restart();
  });
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  expect(await page.evaluate(()=>localStorage.getItem('ashen-depths-stash-v1'))).toBeNull();
});
