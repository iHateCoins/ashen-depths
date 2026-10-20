import { expect, test, type Locator, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';
async function activate(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible({ timeout: 12_000 });
  await target.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') await target.click();
  else await target.tap();
}

test('new base identities show real dual-stat bonuses alongside legacy items on all devices', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript(() => {
    localStorage.setItem('ashen-depths-stash-v1', JSON.stringify({
      schema:1,revision:3,completed:2,unlocks:[],forgeEmbers:0,
      items:[
        {id:'advanced-weapon',name:'Forgotten Runeblade',baseName:'Runeblade',
         rarity:'rare',slot:'weapon',itemLevel:8,
         baseStats:{attack:16,spell:4,armor:0,health:0},
         affixes:[{id:'battlemage',label:"Battlemage's Might",tier:2,value:9},
                  {id:'raider',label:"Raider's Vigor",tier:1,value:5}]},
        {id:'advanced-armor',name:'Forgotten Warden Carapace',baseName:'Warden Carapace',
         rarity:'rare',slot:'armor',itemLevel:8,
         baseStats:{attack:0,spell:0,armor:10,health:6},
         affixes:[{id:'sturdy',label:'Armor',value:8,tier:2},
                  {id:'vital',label:'Maximum Health',value:7,tier:1}]},
        {id:'legacy-staff',name:'Enchanted Ashwood Staff',baseName:'Ashwood Staff',
         rarity:'magic',slot:'weapon',itemLevel:5,
         affixes:[{id:'ember',label:'Ember Potency',value:7}]},
      ],
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0, { timeout: 20_000 });
  await activate(page, page.locator('#ashen-stash-toggle'));
  const stash=page.locator('#ashen-stash-overlay');
  await expect(stash.locator('.ashen-stash-item')).toHaveCount(3);
  await expect(stash).toContainText('Forgotten Runeblade');
  await expect(stash).toContainText('Base · +16 Attack · +4 Spell');
  await expect(stash).toContainText("Battlemage's Might · T2: +9 Attack · +5 Spell");
  await expect(stash).toContainText('Base · +10 Armor · +6 Health');
  await expect(stash).toContainText('Base · +9 Attack'); // legacy stays unchanged
  const saved=await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(saved.items).toHaveLength(3);
  expect(saved.items[2].baseStats).toBeUndefined();
  await activate(page, stash.getByRole('button', {name:'CLOSE'}));
  await expect(stash).toBeHidden();
  expect(errors).toEqual([]);
});
