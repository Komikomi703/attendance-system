const { test, expect } = require('@playwright/test');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => { errors.set(page, []); page.on('pageerror', e => errors.get(page).push(e.message)); });
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test('フッター入口・全選択・PC操作・保存を保って出席アプリに戻る', async ({ page }) => {
    await page.goto('./index.html#settings');
    await page.locator('[name="fridayElective"][value="B"]').check();
    const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('chibanyGame'))));
    await page.locator('.chibany-entrance').click();
    await expect(page).toHaveURL(/game\/index.html\?from=settings/);
    await expect(page.locator('#menu')).toBeVisible();
    for (let n = 1; n <= 5; n++) { await page.locator(`[data-stage="${n}"]`).click(); await expect(page.locator(`[data-stage="${n}"]`)).toHaveAttribute('aria-pressed', 'true'); }
    for (const d of ['HARD', 'EASY', 'NORMAL']) { await page.locator(`[data-difficulty="${d}"]`).click(); await expect(page.locator(`[data-difficulty="${d}"]`)).toHaveAttribute('aria-pressed', 'true'); }
    // 実際のエンジンを観測してキー入力と当たり判定を確認。製品コードにデバッグAPIは追加しない。
    await page.evaluate(() => { const update = ChibanyEngine.Game.prototype.update; ChibanyEngine.Game.prototype.update = function (...args) { window.observedGame = this; return update.apply(this, args); }; });
    await page.locator('#start').click();
    await page.keyboard.down('ArrowLeft'); await page.keyboard.down('Space'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Space');
    expect(await page.evaluate(() => observedGame.player.x)).toBeLessThan(200);
    expect(await page.evaluate(() => observedGame.shots.length)).toBeGreaterThan(0);
    await page.keyboard.press('KeyP'); await expect(page.locator('#pause-panel')).toBeVisible();
    await page.locator('#resume').click();
    await page.evaluate(() => { const g = observedGame; g.spawnEnemy('straight', g.player.x, g.player.y - 80); });
    await page.keyboard.down('Space'); await page.waitForTimeout(800); await page.keyboard.up('Space');
    expect(await page.evaluate(() => observedGame.score)).toBeGreaterThan(0);
    await page.evaluate(() => { const g = observedGame; g.player.hp = 1; g.player.shield = 0; g.player.invincible = 0; g.bullets.push({ x: g.player.x, y: g.player.y, vx: 0, vy: 0, r: 5 }); });
    await expect(page.locator('#result-title')).toHaveText('GAME OVER');
    expect(await page.evaluate(() => JSON.parse(localStorage.chibanyGameHighScore))).toBeGreaterThan(0);
    await page.locator('#retry').click(); await expect(page.locator('#result')).toBeHidden();
    await expect.poll(() => page.evaluate(() => observedGame.state)).toBe('running');
    await page.evaluate(() => { const g = observedGame; g.spawnBoss(); g.boss.hp = 1; g.bomb(); });
    await expect(page.locator('#result-title')).toHaveText('STAGE CLEAR!');
    expect(await page.evaluate(() => JSON.parse(localStorage.chibanyGameClearedStages))).toEqual([5]);
    await page.locator('#result .to-menu').click(); await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#menu [data-return]').click(); await expect(page.locator('#view-settings')).toBeVisible();
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('chibanyGame'))))).toEqual(saved);
    await expect(page.locator('[name="fridayElective"][value="B"]')).toBeChecked();
});

test('スマホ縦画面・タッチドラッグ・自動射撃と一時停止', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/attendance-system/game/index.html');
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { const update = ChibanyEngine.Game.prototype.update; ChibanyEngine.Game.prototype.update = function (...args) { window.observedGame = this; return update.apply(this, args); }; });
    await page.locator('#start').tap(); await page.waitForTimeout(400);
    const box = await page.locator('#canvas').boundingBox();
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .5, y: box.y + box.height * .8 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .2, y: box.y + box.height * .7 }] });
    await page.waitForTimeout(400); await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.evaluate(() => observedGame.player.x)).toBeLessThan(180);
    const playerY = await page.evaluate(() => observedGame.player.y);
    const offset = box.height * .7 - playerY / 640 * box.height;
    expect(offset).toBeGreaterThanOrEqual(40); expect(offset).toBeLessThanOrEqual(70);
    expect(await page.evaluate(() => observedGame.shots.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const bomb = await page.locator('#bomb').boundingBox(); expect(bomb.y + bomb.height).toBeLessThan(568);
    await page.screenshot({ path: 'test-results/chibany-mobile.png' });
    await page.locator('#pause').tap(); await expect(page.locator('#pause-panel')).toBeVisible();
    await context.close();
});

test('PWAキャッシュからゲームと出席アプリをオフラインで開ける', async ({ page, context }) => {
    await page.goto('./index.html');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(async () => { if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
    await context.setOffline(true);
    await page.goto('./game/index.html?from=timetable');
    await expect(page.locator('#title')).toContainText('チバニー');
    expect(await page.locator('.game-title img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.locator('#start').click(); await expect(page.locator('#canvas')).toBeVisible();
    await page.locator('.toolbar [data-return]').click(); await expect(page.locator('#view-timetable')).toBeVisible();
    await context.setOffline(false);
});

test('保存値が不正でもメニューを開き、保存不可でもプレイできる', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('chibanyGameClearedStages', '{}'); localStorage.setItem('chibanyGameDifficulty', '"bad"');
        localStorage.setItem('chibanyGameHighScore', '"bad"');
        Storage.prototype.setItem = () => { throw new Error('disabled'); };
    });
    await page.goto('./game/index.html'); await expect(page.locator('[data-difficulty="NORMAL"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#start').click(); await expect(page.locator('#canvas')).toBeVisible(); await expect(page.locator('#save-status')).toContainText('保存できません');
});

test('5ステージの背景描画・ボス表示・低HPフェーズが動作する', async ({ page }) => {
    await page.goto('./game/index.html');
    await page.evaluate(() => { const update = ChibanyEngine.Game.prototype.update; ChibanyEngine.Game.prototype.update = function (...args) { window.observedGame = this; return update.apply(this, args); }; });
    await page.screenshot({ path: 'test-results/chibany-menu.png', fullPage: true });
    for (let n = 1; n <= 5; n++) {
        await page.locator(`[data-stage="${n}"]`).click(); await page.locator('#start').click();
        await expect.poll(() => page.evaluate(() => window.observedGame?.stage)).toBe(n);
        await page.evaluate(() => { const g = observedGame; g.time = g.config.duration; g.player.invincible = 99; });
        await expect(page.locator('#boss-bar')).toBeVisible();
        await page.evaluate(() => { const g = observedGame; g.boss.y = 100; g.boss.hp *= .3; g.boss.fire = 0; });
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => observedGame.bullets.length)).toBeGreaterThan(0);
        await page.screenshot({ path: `test-results/chibany-stage-${n}.png` });
        await page.locator('#pause').click(); await page.locator('#pause-panel .to-menu').click();
    }
});

test('スマホ各サイズで主要操作が収まり、高DPRでも鮮明・終了後は停止する', async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/attendance-system/game/index.html');
    await page.evaluate(() => { const update = ChibanyEngine.Game.prototype.update; ChibanyEngine.Game.prototype.update = function (...args) { window.observedGame = this; return update.apply(this, args); }; });
    for (const [width, height] of [[320,568], [375,667], [390,844], [360,800], [412,915]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => scrollTo(0, 0));
        const start = await page.locator('#start').boundingBox(); expect(start.y + start.height).toBeLessThanOrEqual(height);
        for (const button of await page.locator('#stages button, #difficulties button').all()) { const b = await button.boundingBox(); expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
        if (width === 320) await page.screenshot({ path: 'test-results/chibany-menu-mobile.png', fullPage: true });
        await page.locator('#start').tap();
        await expect.poll(() => page.locator('#canvas').evaluate(el => Math.abs(el.width - el.clientWidth * 2) < 2)).toBe(true);
        const bomb = await page.locator('#bomb').boundingBox(); expect(bomb.y + bomb.height).toBeLessThanOrEqual(height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const fontSize = await page.locator('#hud-score').evaluate(el => parseFloat(getComputedStyle(el).fontSize)); expect(fontSize).toBeGreaterThanOrEqual(14);
        await page.locator('#pause').tap();
        const before = await page.evaluate(() => observedGame.time); await page.waitForTimeout(100);
        expect(await page.evaluate(() => observedGame.time)).toBe(before);
        await page.locator('#pause-panel .to-menu').tap();
    }
    await context.close();
});

test('音は初期OFF・設定を復元し、クリア後は次のステージへ進める', async ({ page }) => {
    await page.goto('./game/index.html');
    await expect(page.locator('#sound')).toHaveText('SOUND OFF'); await page.locator('#sound').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.chibanyGameSound))).toBe(true);
    await page.reload(); await expect(page.locator('#sound')).toHaveText('SOUND ON');
    await page.evaluate(() => { const update = ChibanyEngine.Game.prototype.update; ChibanyEngine.Game.prototype.update = function (...args) { window.observedGame = this; return update.apply(this, args); }; });
    await page.locator('#start').click(); await expect.poll(() => page.evaluate(() => !!window.observedGame)).toBe(true);
    await page.evaluate(() => { const g = observedGame; g.spawnBoss(); g.boss.hp = 1; g.bomb(); });
    await expect(page.locator('#result-title')).toHaveText('STAGE CLEAR!'); await expect(page.locator('#next-stage')).toBeVisible();
    const stopped = await page.evaluate(() => observedGame.time); await page.waitForTimeout(150); expect(await page.evaluate(() => observedGame.time)).toBe(stopped);
    await page.locator('#next-stage').click(); await expect(page.locator('#hud-stage')).toHaveText('2');
    await page.locator('#pause').click(); await page.locator('#pause-panel .to-menu').click(); await page.locator('#sound').click();
    await expect(page.locator('#sound')).toHaveText('SOUND OFF');
});

test('チバニーの外側は透明・体は不透明で、入口とゲームが同じ画像を使う', async ({ page }) => {
    await page.goto('./index.html');
    const entrance = await page.locator('.chibany-entrance img').getAttribute('src');
    expect(entrance).toContain('chibany-transparent.png');
    await page.goto('./game/index.html');
    const result = await page.locator('.game-title img').evaluate(async img => {
        await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        const corners = [[0,0],[c.width-1,0],[0,c.height-1],[c.width-1,c.height-1]].map(([x,y]) => ctx.getImageData(x,y,1,1).data[3]);
        return { corners, body: ctx.getImageData(c.width*.5,c.height*.4,1,1).data[3] };
    });
    expect(result.corners).toEqual([0,0,0,0]); expect(result.body).toBeGreaterThanOrEqual(250);
});
