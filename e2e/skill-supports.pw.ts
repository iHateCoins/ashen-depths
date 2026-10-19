import { expect, test, type Locator, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function tap(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 12_000 });
  if (test.info().project.name === 'desktop') {
    await control.click();
    return;
  }
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      skills: {
        equipped: { id: string }[];
        supportFor: (id: string) => { id: string } | null;
        effectiveStats: (id: string) => { damage: number; radius: number; cooldownSeconds: number };
      };
    };
    const skills = scene.skills;
    return {
      equipped: skills.equipped.map(skill => skill.id),
      cinderSupport: skills.supportFor('cinder-burst')?.id ?? null,
      frostSupport: skills.supportFor('frost-bloom')?.id ?? null,
      cinderStats: skills.effectiveStats('cinder-burst'),
    };
  });
}

test('skill supports change effective stats and cannot duplicate across skills', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await tap(page, page.locator('#ashen-skills-toggle'));
  const modal = page.locator('#ashen-skills-overlay');
  const cinder = modal.getByRole('combobox', { name: 'Support for Cinder Burst' });
  await expect(cinder).toBeVisible();
  await cinder.selectOption('focused-power');
  await expect(modal).toContainText('47 damage');
  await expect(modal).toContainText('79px area');

  await tap(page, modal.getByRole('button', { name: 'Equip Frost Bloom' }));
  const frost = modal.getByRole('combobox', { name: 'Support for Frost Bloom' });
  // Playwright's toBeDisabled() checks the parent select for an <option>
  // in some engines, even when that option carries its own disabled flag.
  // Assert the option's DOM property, which is the actual selection gate.
  await expect(frost.locator('option[value="focused-power"]'))
    .toHaveJSProperty('disabled', true);
  await frost.selectOption('swift-casting');
  const current = await snapshot(page);
  expect(current.equipped).toEqual(['cinder-burst', 'frost-bloom']);
  expect(current.cinderSupport).toBe('focused-power');
  expect(current.frostSupport).toBe('swift-casting');
  expect(current.cinderStats).toMatchObject({ damage: 47, radius: 79, cooldownSeconds: 4 });
  await tap(page, modal.getByRole('button', { name: 'CLOSE' }));
  await expect(modal).toBeHidden();
  expect(errors).toEqual([]);
});

test('support choices lock after departure and reset without touching stash data', async ({ page }) => {
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await tap(page, page.locator('#ashen-skills-toggle'));
  const modal = page.locator('#ashen-skills-overlay');
  await modal.getByRole('combobox', { name: 'Support for Cinder Burst' }).selectOption('expansive-blast');
  await tap(page, modal.getByRole('button', { name: 'CLOSE' }));

  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as { campAvailable: boolean };
    scene.campAvailable = false;
  });
  await tap(page, page.locator('#ashen-skills-toggle'));
  const locked = modal.getByRole('combobox', { name: 'Support for Cinder Burst' });
  await expect(locked).toBeDisabled();
  await expect(locked).toHaveValue('expansive-blast');
  await tap(page, modal.getByRole('button', { name: 'CLOSE' }));
  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      scene: { restart: () => void };
    };
    scene.scene.restart();
  });
  await expect(page.locator('#ashen-skills-overlay')).toHaveCount(1);
  await expect.poll(async () => (await snapshot(page)).cinderSupport).toBeNull();
  await tap(page, page.locator('#ashen-skills-toggle'));
  await expect(modal.getByRole('combobox', { name: 'Support for Cinder Burst' })).toHaveValue('');
});
