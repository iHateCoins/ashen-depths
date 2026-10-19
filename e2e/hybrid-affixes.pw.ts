import { expect, test, type Locator, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';
async function activate(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible({ timeout: 12000 });
  await locator.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') await locator.click();
  else await locator.tap();
}

test('tiered hybrid equipment previews both stats, preserves legacy gear on iPhone and desktop', async ({ page }) => {
  const errors: string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('ashen-depths-stash-v1',JSON.stringify({
      schema:1,revision:2,completed:2,unlocks:[],forgeEmbers:0,
      items:[
        {id:'new-hybrid',name:'Forgotten Iron Cleaver',baseName:'Iron Cleaver',
         rarity:'rare',slot:'weapon',itemLevel:8,
         affixes:[{id:'battlemage',label:"Battlemage's Might",tier:2,value:9},
                  {id:'raider',label:"Raider's Vigor",tier:1,value:5}]},
        {id:'old-weapon',name:'Old Rustbound Sword',baseName:'Rustbound Sword',
         rarity:'magic',slot:'weapon',itemLevel:5,
         affixes:[{id:'sharp',label:'Attack Power',value:6}]},
      ],
    }));
  });
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({timeout:20000});
  await activate(page,page.locator('#ashen-stash-toggle'));
  const stash=page.locator('#ashen-stash-overlay');
  await expect(stash).toContainText("Battlemage's Might · T2: +9 Attack · +5 Spell");
  await expect(stash).toContainText("Raider's Vigor · T1: +5 Attack · +3 Health");
  await expect(stash).toContainText('Attack Power: +6 Attack');
  await expect(stash.locator('.ashen-stash-item')).toHaveCount(2);
  await expect(stash.getByRole('button',{name:"Reforge Battlemage's Might on Forgotten Iron Cleaver"})).toBeDisabled();
  await activate(page,stash.getByRole('button',{name:'CLOSE'}));
  await expect(stash).toBeHidden();
  expect(errors).toEqual([]);
});
