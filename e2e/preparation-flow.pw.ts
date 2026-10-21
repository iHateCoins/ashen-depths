import {test,expect,type Page,type Locator} from '@playwright/test';

const url='http://127.0.0.1:4173/ashen-depths/?seed=42&intro=1';
async function press(target:Locator):Promise<void>{
  await expect(target).toBeVisible({timeout:15000});
  if(test.info().project.name==='desktop')await target.click();
  else await target.tap();
}
async function openExpedition(page:Page,klass:'vanguard'|'arcanist'='vanguard'):Promise<void>{
  const intro=page.locator('#ashen-preparation-overlay');
  await expect(intro).toBeVisible();
  await expect(intro).toHaveAttribute('data-step','title');
  await press(intro.getByRole('button',{name:'PREPARE EXPEDITION'}));
  await expect(intro).toHaveAttribute('data-step','class');
  await press(intro.getByRole('button',{name:`Choose ${klass==='vanguard'?'Vanguard':'Arcanist'}`}));
  await press(intro.getByRole('button',{name:'NEXT · SKILLS'}));
  await expect(intro).toHaveAttribute('data-step','skills');
  await press(intro.getByRole('button',{name:'ENTER DUNGEON'}));
  await expect(intro).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenPreparation)).toBe('entered');
}

test('new player prepares class and automatic skills before entering an otherwise paused dungeon',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  const intro=page.locator('#ashen-preparation-overlay');
  await expect(intro).toBeVisible();
  await expect(intro).toContainText('ASHEN DEPTHS');
  const before=await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {pos:{...s.movement.position},health:s.health.hp,depth:s.depth,kills:s.kills,
      phase:document.documentElement.dataset.ashenPreparation};
  });
  await page.waitForTimeout(450);
  const after=await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {pos:{...s.movement.position},health:s.health.hp,depth:s.depth,kills:s.kills,
      phase:document.documentElement.dataset.ashenPreparation};
  });
  expect(after).toEqual(before);
  await press(intro.getByRole('button',{name:'PREPARE EXPEDITION'}));
  await press(intro.getByRole('button',{name:'Choose Vanguard'}));
  await expect(intro).toContainText('✓ SELECTED');
  await press(intro.getByRole('button',{name:'NEXT · SKILLS'}));
  await expect(intro.getByRole('button',{name:'Remove Crescent Cleave'})).toBeVisible();
  await expect(intro.getByRole('button',{name:'Equip Cinder Burst'})).toBeDisabled();
  await press(intro.getByRole('button',{name:'Remove Crescent Cleave'}));
  await press(intro.getByRole('button',{name:'ENTER DUNGEON'}));
  await expect(intro.locator('.ashen-preparation-error')).toContainText('at least one');
  await press(intro.getByRole('button',{name:'Equip Crescent Cleave'}));
  await press(intro.getByRole('button',{name:'ENTER DUNGEON'}));
  await expect(intro).toBeHidden();
  const run=await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return {cls:s.selectedClass,max:s.health.maxHp,skills:s.skills.equipped.map((k:any)=>k.id),
      depth:s.depth,stored:s.securedStash.preferredClass};
  });
  expect(run).toEqual({cls:'vanguard',max:120,skills:['crescent-cleave'],depth:1,stored:'vanguard'});
  expect(errors).toEqual([]);
});

test('successful extraction returns to preparation, while Warden descent stays in combat',async({page})=>{
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await openExpedition(page);
  await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    s.roomEncounters.hasEnteredDepth=true;
    const boss=s.enemies.find((enemy:any)=>enemy.id===s.roomEncounters.guardianId);
    boss.hp=0;
    for(const enemy of s.enemies)if(enemy.id!==boss.id)
      enemy.position={x:-2000-enemy.id*25,y:-2000};
  });
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenEncounter)).toBe('complete');
  await press(page.locator('#ashen-descend-run'));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('2');
  await expect(page.locator('#ashen-preparation-overlay')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.dataset.ashenPreparation)).toBe('entered');
  await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    s.roomEncounters.hasEnteredDepth=true;
    const boss=s.enemies.find((enemy:any)=>enemy.id===s.roomEncounters.guardianId);
    boss.hp=0;
    for(const enemy of s.enemies)if(enemy.id!==boss.id)
      enemy.position={x:-2000-enemy.id*25,y:-2000};
  });
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenEncounter)).toBe('complete');
  await press(page.getByRole('button',{name:'FINISH EXPEDITION'}));
  await expect(page.locator('#ashen-victory-overlay')).toBeVisible();
  await press(page.locator('#ashen-victory-overlay').getByRole('button',{name:'NEW EXPEDITION'}));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  const intro=page.locator('#ashen-preparation-overlay');
  await expect(intro).toHaveAttribute('data-step','title');
  await expect(intro).toContainText('Current adventurer: Vanguard');
});

test('a guarded cache message never intercepts touch movement or forces a confirmation',async({page})=>{
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await openExpedition(page,'arcanist');
  await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const cache=s.optionalObjectives.objectives.find((x:any)=>x.id==='cache');
    s.movement.stop();s.waypoints=[];s.movement.position={...cache.position};
  });
  const hint=page.locator('#ashen-objective-hint');
  await expect(hint).toBeVisible({timeout:10000});
  await expect(page.locator('#ashen-optional-objective')).toBeHidden();
  expect(await hint.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  await page.evaluate(()=>{
    const s=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const cache=s.optionalObjectives.objectives.find((x:any)=>x.id==='cache');
    const guardianIds=new Set(s.roomEncounters.placements.filter((x:any)=>x.roomId===cache.roomId)
      .map((x:any)=>x.id));
    for(const enemy of s.enemies)if(guardianIds.has(enemy.id))enemy.hp=0;
  });
  await expect(hint).toBeHidden({timeout:10000});
  const objective=page.locator('#ashen-optional-objective');
  // Defeating the cache guards may drop gear in pickup range. The interaction
  // dock deliberately prioritizes LOOT to prevent reward panels obscuring it.
  // Select OBJECTIVE explicitly when it is behind the LOOT tab.
  if (!await objective.isVisible()) {
    const objectiveTab=page.locator('#ashen-interaction-objective');
    await expect(objectiveTab).toBeVisible({timeout:10000});
    await press(objectiveTab);
  }
  await expect(objective).toBeVisible();
  await expect(objective.getByRole('button',{name:'OPEN CACHE'})).toBeEnabled();
});
