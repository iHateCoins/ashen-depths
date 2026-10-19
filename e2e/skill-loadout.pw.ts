import { expect, test, type Locator, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function unlockSkillCatalog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('ashen-depths-stash-v1', JSON.stringify({
      schema: 1, revision: 0, completed: 0, items: [],
      unlocks: ['skill:frost-bloom', 'skill:ash-lance',
        'support:focused-power', 'support:expansive-blast', 'support:swift-casting'],
    }));
  });
}

async function tap(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 12_000 });
  // A visible control can still be BELOW the scrolled edge of the modal,
  // especially in 844x390 landscape. Touchscreen.tap(x, y) never scrolls and
  // silently taps the wrong surface if the center is outside the viewport.
  await control.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') {
    await control.click();
  } else {
    await control.tap(); // Playwright ensures the target is in view and receives the tap.
  }
}

async function equipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      skills: { equipped: { id: string }[] };
    };
    return scene.skills.equipped.map(skill => skill.id);
  });
}

test('mobile/desktop skills UI enforces two different auto-cast skills', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await unlockSkillCatalog(page);
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#ashen-skills-toggle')).toBeVisible();
  await tap(page, page.locator('#ashen-skills-toggle'));

  const overlay = page.locator('#ashen-skills-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('1 / 2 slots');
  expect(await equipped(page)).toEqual(['cinder-burst']);

  await tap(page, overlay.getByRole('button', { name: 'Equip Frost Bloom' }));
  expect(await equipped(page)).toEqual(['cinder-burst', 'frost-bloom']);
  await expect(overlay).toContainText('2 / 2 slots');
  await expect(overlay.getByRole('button', { name: 'Equip Ash Lance' })).toBeDisabled();

  await tap(page, overlay.getByRole('button', { name: 'Unequip Cinder Burst' }));
  await tap(page, overlay.getByRole('button', { name: 'Equip Ash Lance' }));
  expect(await equipped(page)).toEqual(['frost-bloom', 'ash-lance']);
  await tap(page, overlay.getByRole('button', { name: 'CLOSE' }));
  await expect(overlay).toBeHidden();
  await expect.poll(() => page.locator('canvas').isVisible()).toBe(true);
  expect(errors).toEqual([]);
});

test('camp departure disables loadout changes and restart resets skills', async ({ page }) => {
  await unlockSkillCatalog(page);
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await tap(page, page.locator('#ashen-skills-toggle'));
  await tap(page, page.locator('#ashen-skills-overlay').getByRole('button', { name: 'Equip Frost Bloom' }));
  // Fail immediately at the point of interaction, rather than allowing a missed
  // landscape tap to surface much later as a misleading camp-lock failure.
  await expect.poll(() => equipped(page)).toEqual(['cinder-burst', 'frost-bloom']);
  await tap(page, page.locator('#ashen-skills-overlay').getByRole('button', { name: 'CLOSE' }));

  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as { campAvailable: boolean };
    scene.campAvailable = false;
  });
  await tap(page, page.locator('#ashen-skills-toggle'));
  const overlay = page.locator('#ashen-skills-overlay');
  await expect(overlay).toContainText('Changes available at camp only');
  await expect(overlay.getByRole('button', { name: 'Unequip Cinder Burst' })).toBeDisabled();
  await expect(overlay.getByRole('button', { name: 'Equip Ash Lance' })).toBeDisabled();
  expect(await equipped(page)).toEqual(['cinder-burst', 'frost-bloom']);
  await tap(page, overlay.getByRole('button', { name: 'CLOSE' }));

  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      scene: { restart: () => void };
    };
    scene.scene.restart();
  });
  await expect(page.locator('#ashen-skills-toggle')).toHaveCount(1);
  await expect(page.locator('#ashen-skills-overlay')).toHaveCount(1);
  await expect.poll(() => equipped(page)).toEqual(['cinder-burst']);
});
