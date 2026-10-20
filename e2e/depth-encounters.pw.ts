import {expect,test,type Page,type Locator} from '@playwright/test';

const url='http://127.0.0.1:4173/ashen-depths/?seed=42';
async function activate(page:Page,button:Locator):Promise<void>{
  await expect(button).toBeVisible({timeout:12000});
  await button.scrollIntoViewIfNeeded();
  if(test.info().project.name==='desktop')await button.click();
  else await button.tap();
}
async function beatWarden(page:Page):Promise<void>{
  await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth=true;
    const boss=scene.enemies.find((enemy:any)=>enemy.id===scene.roomEncounters.guardianId);
    if(!boss)throw Error('Missing floor Warden');
    boss.hp=0;
    for(const enemy of scene.enemies){
      if(enemy.id!==boss.id)enemy.position={x:-2000-enemy.id*30,y:-2000};
    }
  });
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenEncounter),
    {timeout:12000}).toBe('complete');
}
test('Depth 1 stays classic; Depth 2 and 3 give distinct Wardens and elite encounters',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  expect(await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {depth:scene.depth,warden:document.documentElement.dataset.ashenWardenVariant,
      elite:scene.roomEncounters.placements.filter((p:any)=>p.elite).length,
      skirmishers:scene.enemies.filter((e:any)=>e.kind==='skirmisher').length,
      bossDamage:scene.enemies.find((e:any)=>e.id===scene.roomEncounters.guardianId).profile?.attackDamage??22};
  })).toEqual({depth:1,warden:'warden',elite:0,skirmishers:0,bossDamage:22});
  await beatWarden(page);
  await activate(page,page.locator('#ashen-descend-run'));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('2');
  const second=await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const boss=scene.enemies.find((e:any)=>e.id===scene.roomEncounters.guardianId);
    return {variant:document.documentElement.dataset.ashenWardenVariant,
      radius:boss.profile?.attackRadius,windup:boss.profile?.windupSeconds,
      hp:boss.hp,elite:scene.roomEncounters.placements.filter((p:any)=>p.elite).length};
  });
  expect(second.variant).toBe('ash-reaver');
  expect(second.radius).toBe(53);
  expect(second.windup).toBe(0.68);
  expect(second.hp).toBeGreaterThan(300);
  expect(second.elite).toBe(0);
  await beatWarden(page);
  await activate(page,page.locator('#ashen-descend-run'));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('3');
  const third=await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const boss=scene.enemies.find((e:any)=>e.id===scene.roomEncounters.guardianId);
    const elites=scene.roomEncounters.placements.filter((p:any)=>p.elite);
    const skirmishers=scene.enemies.filter((e:any)=>e.kind==='skirmisher');
    const elite=elites[0];
    const drop=elite ? scene.loot.dropForEnemy(elite.id,elite.kind,false,elite.position,true) : null;
    return {variant:document.documentElement.dataset.ashenWardenVariant,
      radius:boss.profile?.attackRadius,windup:boss.profile?.windupSeconds,
      eliteCount:elites.length,skirmisherCount:skirmishers.length,
      eliteRarity:drop?.item.rarity??null,
      eliteLevel:drop?.item.itemLevel??null,
      bag:scene.loot.bag.length,stored:localStorage.getItem('ashen-depths-stash-v1')};
  });
  expect(third.variant).toBe('stone-sentinel');
  expect(third.radius).toBe(93);
  expect(third.windup).toBe(1.35);
  expect(third.skirmisherCount).toBeGreaterThan(0);
  if(third.eliteCount>0){
    expect(['magic','rare']).toContain(third.eliteRarity);
    expect(third.eliteLevel).toBeGreaterThanOrEqual(7);
  }
  expect(third.stored).toBeNull(); // still at risk until extraction
  expect(errors).toEqual([]);
});
