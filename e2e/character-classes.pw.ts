import { expect, test, type Locator, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';
async function activate(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible({ timeout: 12_000 });
  await target.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') await target.click();
  else await target.tap();
}

async function wardenDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth = true;
    const boss = scene.enemies.find((enemy: any) => enemy.id === scene.roomEncounters.guardianId);
    if (!boss) throw new Error('No Warden');
    boss.hp = 0;
    for (const enemy of scene.enemies) {
      if (enemy.id !== boss.id) enemy.position = {x:-2000 - enemy.id*25,y:-2000};
    }
  });
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenEncounter),{timeout:12_000}).toBe('complete');
}

test('Vanguard class choice persists through two floors, extraction and next expedition',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror', err=>errors.push(err.message));
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20_000});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenClass)).toBe('arcanist');
  await activate(page,page.locator('#ashen-class-toggle'));
  const dialog=page.locator('#ashen-class-overlay');
  await expect(dialog).toContainText('Vanguard');
  await expect(dialog).toContainText('Arcanist');
  await activate(page,dialog.getByRole('button',{name:'Choose Vanguard'}));
  const first = await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {classId:scene.selectedClass, hp:scene.health.hp,
      max:scene.health.maxHp,range:scene.combat.range,
      damage:scene.combat.damage, skills:scene.skills.equipped.map((s:any)=>s.id),
      starter:scene.progression.canUseSkill('crescent-cleave'),
      lockedSpell:scene.progression.canUseSkill('cinder-burst'),
    };
  });
  expect(first).toEqual({classId:'vanguard',hp:120,max:120,range:165,
    damage:30,skills:['crescent-cleave'],starter:true,lockedSpell:false});
  await expect(page.locator('#ashen-class-toggle')).toContainText('VANGUARD');
  await activate(page,dialog.getByRole('button',{name:'CLOSE'}));
  await expect(dialog).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenClass)).toBe('vanguard');

  await wardenDown(page);
  await activate(page,page.locator('#ashen-descend-run'));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth),{timeout:15_000}).toBe('2');
  const carried=await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {cls:scene.selectedClass,hp:scene.health.maxHp,
      starter:scene.skills.equipped.map((s:any)=>s.id),
      camp:scene.campAvailable};
  });
  expect(carried).toEqual({cls:'vanguard',hp:120,starter:['crescent-cleave'],camp:false});
  await activate(page,page.locator('#ashen-class-toggle'));
  await expect(dialog.getByRole('button',{name:'Choose Arcanist'})).toBeDisabled();
  await expect(dialog).toContainText('Class is locked');
  await activate(page,dialog.getByRole('button',{name:'CLOSE'}));
  await wardenDown(page);
  await activate(page,page.getByRole('button',{name:'FINISH EXPEDITION'}));
  await expect(page.locator('#ashen-victory-overlay')).toBeVisible({timeout:12_000});
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(stored.preferredClass).toBe('vanguard');
  expect(stored.completed).toBe(1);
  await activate(page,page.locator('#ashen-victory-overlay').getByRole('button',{name:'NEW EXPEDITION'}));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  expect(await page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {cls:scene.selectedClass,hp:scene.health.hp,
      skills:scene.skills.equipped.map((s:any)=>s.id)};
  })).toEqual({cls:'vanguard',hp:120,skills:['crescent-cleave']});
  expect(errors).toEqual([]);
});

test('legacy character class remains permanent and existing saved items remain intact',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:3,completed:2,items:[
        {id:'saved-gear',name:'Stored Sword',baseName:'Rustbound Sword',
         rarity:'magic',slot:'weapon',itemLevel:5,
         affixes:[{id:'sharp',label:'Attack Power',value:6}]}
      ],unlocks:['skill:frost-bloom'],forgeEmbers:3
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20_000});
  await activate(page,page.locator('#ashen-class-toggle'));
  const dialog=page.locator('#ashen-class-overlay');
  await expect(dialog.getByRole('button',{name:'Choose Vanguard'})).toBeDisabled();
  await expect(dialog).toContainText('Class is permanent');
  expect(await page.evaluate(()=>document.documentElement.dataset.ashenClass)).toBe('arcanist');
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(save.preferredClass).toBeUndefined(); // Legacy saves retain original default Arcanist.
  expect(save.items).toHaveLength(1);
  expect(save.items[0].id).toBe('saved-gear');
  expect(save.unlocks).toEqual(['skill:frost-bloom']);
  expect(save.forgeEmbers).toBe(3);
  expect(save.completed).toBe(2);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20_000});
  expect(await page.evaluate(()=>document.documentElement.dataset.ashenClass)).toBe('arcanist');
});
