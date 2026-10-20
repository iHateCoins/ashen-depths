import { test, expect, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

type Rect = { left:number; right:number; top:number; bottom:number; width:number; height:number };
const ids = ['ashen-skills-toggle','ashen-class-toggle','ashen-stash-toggle','ashen-bag-toggle'];

async function geometry(page:Page) {
  return page.evaluate((keys)=>{
    const rect=(r:DOMRect):Rect=>({left:r.left,right:r.right,top:r.top,
      bottom:r.bottom,width:r.width,height:r.height});
    const controls=keys.map(id=>{
      const button=document.getElementById(id)!;
      const r=button.getBoundingClientRect();
      const center=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {id,rect:rect(r),visible:!button.hidden,
        hittable:center===button||button.contains(center)};
    });
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const minimap=scene.explorationView.mapHitArea;
    const safe=window.getComputedStyle(document.getElementById('ashen-safe-area-probe')!);
    return {width:innerWidth,height:innerHeight,controls,
      safeTop:parseFloat(safe.paddingTop)||0,
      safeLeft:parseFloat(safe.paddingLeft)||0,
      map:rect(minimap.getBounds()),
      title:rect(scene.titleLabel.getBounds()),
      health:rect(scene.healthLabel.getBounds()),
      objective:rect(scene.objectiveLabel.getBounds()),
      skill:rect(scene.skillStatusLabel.getBounds()),
      objectiveText:scene.objectiveLabel.text as string,
    };
  },ids);
}

function overlapping(a:Rect,b:Rect):boolean{
  return a.left<b.right-1 && a.right>b.left+1 &&
    a.top<b.bottom-1 && a.bottom>b.top+1;
}

test('portrait iPhone controls remain visible, independently tappable and clear of the canvas HUD',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.ashenDepth)).toBe('1');
  await expect.poll(()=>page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return scene.scale.width;
  }),{timeout:12000}).toBe(390);
  const g=await geometry(page);
  expect(g.controls.map(c=>c.visible)).toEqual([true,true,true,true]);
  for(const control of g.controls){
    expect(control.rect.width,control.id).toBeGreaterThanOrEqual(44);
    expect(control.rect.height,control.id).toBeGreaterThanOrEqual(44);
    expect(control.rect.left,control.id).toBeGreaterThanOrEqual(-1);
    expect(control.rect.right,control.id).toBeLessThanOrEqual(g.width+1);
    expect(control.rect.bottom,control.id).toBeLessThanOrEqual(g.height+1);
    expect(control.hittable,control.id).toBe(true);
  }
  for(let i=0;i<g.controls.length;i++)
    for(let j=i+1;j<g.controls.length;j++)
      expect(overlapping(g.controls[i].rect,g.controls[j].rect),
        `${g.controls[i].id} must not overlap ${g.controls[j].id}`).toBe(false);
  expect(g.title.top).toBeGreaterThanOrEqual(g.safeTop);
  expect(g.health.top).toBeGreaterThan(g.title.top);
  expect(g.objective.top).toBeGreaterThan(g.health.top);
  expect(g.skill.top).toBeGreaterThanOrEqual(g.objective.bottom+4);
  for (const hud of [g.title,g.health,g.objective,g.skill])
    expect(overlapping(hud,g.map),'Portrait minimap must not obscure HUD').toBe(false);
  expect(g.objectiveText).toContain('FIND THE DEEP CHAMBER');
  expect(g.objectiveText).toContain('Passives');

  // Real tap/click to interact with menus, without force and without the
  // Phaser canvas swallowing a button's pointer event.
  for (const [id,dialogId] of [
    ['ashen-class-toggle','#ashen-class-overlay'],
    ['ashen-skills-toggle','#ashen-skills-overlay'],
    ['ashen-bag-toggle','#ashen-bag-overlay'],
    ['ashen-stash-toggle','#ashen-stash-overlay'],
  ] as const) {
    const button=page.locator('#'+id);
    if(test.info().project.name==='desktop')await button.click();
    else await button.tap();
    await expect(page.locator(dialogId)).toBeVisible();
    const close=page.locator(dialogId).getByRole('button',{name:'CLOSE'});
    if(test.info().project.name==='desktop')await close.click();
    else await close.tap();
    await expect(page.locator(dialogId)).toBeHidden();
  }
});

test('rotating portrait to landscape reflows the HUD and buttons without blocking movement',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0,{timeout:20000});
  await page.setViewportSize({width:844,height:390});
  await expect.poll(()=>page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return scene.scale.width;
  }),{timeout:12000}).toBe(844);
  await expect.poll(()=>page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return scene.objectiveLabel.text.includes('ARCANIST · DEPTH 1');
  })).toBe(true);
  const g=await geometry(page);
  expect(g.objectiveText).toContain('ARCANIST · DEPTH 1');
  expect(g.skill.top).toBeGreaterThanOrEqual(g.objective.bottom+4);
  expect(g.map.right).toBeLessThanOrEqual(g.width+1);
  expect(g.controls.filter(c=>c.visible).every(c=>c.hittable)).toBe(true);
  for (const hud of [g.title,g.health,g.objective])
    expect(overlapping(hud,g.map)).toBe(false);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>{
    const scene=(window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return scene.objectiveLabel.text.startsWith('FIND THE DEEP CHAMBER');
  })).toBe(true);
  const again=await geometry(page);
  expect(again.controls.filter(c=>c.visible).every(c=>c.hittable)).toBe(true);
  expect(again.skill.top).toBeGreaterThanOrEqual(again.objective.bottom+4);
});
