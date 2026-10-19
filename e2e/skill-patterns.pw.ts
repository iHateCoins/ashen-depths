import { expect, test, type Locator, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function tap(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible({ timeout: 12_000 });
  await locator.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') await locator.click();
  else await locator.tap();
}

test('new attack and spell patterns are named, learned and equipped on mobile and desktop', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ashen-depths-stash-v1', JSON.stringify({
      schema: 1, revision: 0, completed: 0, items: [],
      unlocks: ['skill:piercing-volley', 'skill:arc-relay'],
    }));
  });
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await tap(page, page.locator('#ashen-skills-toggle'));
  const modal = page.locator('#ashen-skills-overlay');
  await expect(modal).toContainText('Piercing Volley');
  await expect(modal).toContainText('ATTACK · Scales with Attack Power');
  await expect(modal).toContainText('28px half-width · pierces enemies');
  await expect(modal).toContainText('Arc Relay');
  await expect(modal).toContainText('SPELL · Scales with Spell Power');
  await expect(modal).toContainText('155px jump range · up to 3 foes');

  await tap(page, modal.getByRole('button', { name: 'Equip Piercing Volley' }));
  await expect(modal).toContainText('2 / 2 slots');
  await tap(page, modal.getByRole('button', { name: 'Unequip Cinder Burst' }));
  await tap(page, modal.getByRole('button', { name: 'Equip Arc Relay' }));
  const equipped = await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return scene.skills.equipped.map((skill: { id: string; type: string; pattern?: string }) => ({
      id: skill.id, type: skill.type, pattern: skill.pattern,
    }));
  });
  expect(equipped).toEqual([
    { id: 'piercing-volley', type: 'attack', pattern: 'pierce' },
    { id: 'arc-relay', type: 'spell', pattern: 'chain' },
  ]);
  await tap(page, modal.getByRole('button', { name: 'CLOSE' }));
  await expect(modal).toBeHidden();
});
