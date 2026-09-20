const { test, expect } = require("@playwright/test");

const electiveKey = "cit-attendance-2026-fall-friday-elective";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
    errors.set(page, []);
    page.on("pageerror", error => errors.get(page).push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.get(page).push(message.text()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function visit(page, time) {
    await page.clock.setFixedTime(new Date(time + "+09:00"));
    await page.goto("./index.html");
}

async function choose(page, value) {
    await page.locator('[data-view="settings"]').click();
    await page.locator(`[name="fridayElective"][value="${value}"]`).check();
    await page.locator('[data-view="home"]').click();
}

async function openManual(page) {
    await page.locator("#manualEntry > summary").click();
}

test("ホームの授業は重複せず、曜日タブから全授業と詳細を確認できる", async ({ page }) => {
    await visit(page, "2026-09-22T14:00:00");
    await expect(page.locator("#focusClasses .class-card")).toHaveCount(1);
    await expect(page.locator("#focus-heading")).toHaveText("現在の授業");
    await expect(page.locator("#schedule .class-card")).toHaveCount(0);
    await expect(page.locator("#schedule")).toContainText("今日の授業は、上の1件です。");
    await page.locator("#focusClasses summary").click();
    for (const text of ["NWプログラミング応用演習", "14:00", "18:00", "火曜日", "6〜9限", "屋代 智之", "1232 講義室", "新習志野キャンパス", "受付中"]) {
        await expect(page.locator("#focusClasses")).toContainText(text);
    }
    await page.locator('[data-view="timetable"]').click();
    const expected = {
        1: [], 2: ["NWプログラミング応用演習"],
        3: ["OSとシステムソフトウェア", "統計解析", "社会数理モデリング"],
        4: ["高度応用情報科学概論2", "情報数学2"],
        5: ["情報ネットワーク", "データサイエンス入門", "選択授業が未設定です"], 6: [], 0: []
    };
    for (const [day, subjects] of Object.entries(expected)) {
        await page.locator(`#weekday-${day}`).click();
        await expect(page.locator('.week-day:visible')).toHaveCount(1);
        await expect(page.locator(`.week-day[data-day="${day}"] .class-subject`)).toHaveText(subjects);
    }
    await page.locator(".period-panel > summary").click();
    await expect(page.locator("#periodList")).toContainText("1限：09:00〜10:00");
    await expect(page.locator("#periodList")).toContainText("10限：18:00〜19:00");
});

test("開始10分前・終了20分後を秒単位で自動更新し、新タブに番号だけのURLを渡す", async ({ page, context }) => {
    await page.clock.install({ time: new Date("2026-09-22T13:49:59+09:00") });
    await page.clock.pauseAt(new Date("2026-09-22T13:49:59+09:00"));
    await page.goto("./index.html");
    const button = page.locator('#view-home [data-room-code="1232"] .class-button');
    await expect(button).toBeDisabled();
    await expect(page.locator('#view-home [data-room-code="1232"] .state-label')).toHaveText("開始前");
    await page.clock.runFor(1000);
    await expect(button).toBeEnabled();
    await expect(page.locator("#clock")).toHaveText("13:50:00");
    await context.route("https://attendance.is.chibatech.ac.jp/**", route => route.fulfill({ body: "attendance test" }));
    const popupPromise = context.waitForEvent("page");
    await button.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toBe("https://attendance.is.chibatech.ac.jp/attendance/class_room/1232");
    expect(await popup.evaluate(() => window.opener)).toBe(null);
    await popup.close();
    await page.clock.setFixedTime(new Date("2026-09-22T18:20:00+09:00"));
    await page.evaluate(() => update());
    await expect(button).toBeEnabled();
    await page.clock.setFixedTime(new Date("2026-09-22T18:20:01+09:00"));
    await page.evaluate(() => update());
    await expect(button).toBeDisabled();
    await expect(page.locator('#view-home [data-room-code="1232"] .state-label')).toHaveText("受付終了");
});

test("月曜は全休、土日を含め次の登校日へ進む", async ({ page }) => {
    for (const date of ["2026-09-26", "2026-09-27", "2026-09-28"]) {
        await visit(page, `${date}T10:00:00`);
        await expect(page.locator("#schedule")).toHaveText("本日は全休です。");
        await expect(page.locator("#focus-heading")).toHaveText("次の授業");
        await expect(page.locator("#focusClasses")).toContainText("09/29 火曜日");
        await expect(page.locator("#focusClasses .class-subject")).toHaveText("NWプログラミング応用演習");
        await expect(page.locator("#focusClasses .class-button")).toBeDisabled();
    }
});

test("金曜の未設定からA/Bを選択し全画面とURLに即時反映、再読み込み後も保持", async ({ page }) => {
    await visit(page, "2026-09-25T15:00:00");
    await expect(page.locator("#focusClasses .class-subject").first()).toHaveText("選択授業が未設定です");
    await page.locator("#focusClasses").getByRole("button", { name: /授業を選ぶ/ }).click();
    await expect(page.locator('[data-elective="A"]')).toBeFocused();
    await page.evaluate(() => { window.opened = []; window.open = (...args) => { window.opened.push(args); return null; }; });
    for (const [choice, name, excluded, room] of [
        ["A", "総合学際科目「科学哲学―科学とはどのような活動か」", "課題探求セミナー「映画における恐怖の歴史」", "7201"],
        ["B", "課題探求セミナー「映画における恐怖の歴史」", "総合学際科目「科学哲学―科学とはどのような活動か」", "5305"]
    ]) {
        await choose(page, choice);
        await expect(page.locator("#electiveStatus")).toHaveText("選択内容を保存しました");
        await expect(page.locator(`.elective-option:has(input[value="${choice}"]) .elective-choice-state`)).toHaveText("✓ 選択中");
        await page.clock.runFor(4000);
        await expect(page.locator("#electiveStatus")).toContainText("を選択しています。");
        for (const selector of ["#focusClasses", "#weeklySchedule"]) {
            await expect(page.locator(selector)).toContainText(name);
            await expect(page.locator(selector)).not.toContainText(excluded);
        }
        await expect(page.locator('.week-day[data-day="5"] .class-card')).toHaveCount(3);
        expect(await page.evaluate(key => localStorage.getItem(key), electiveKey)).toBe(choice);
        await page.locator("#focusClasses .class-button").first().click();
        expect(await page.evaluate(() => window.opened.at(-1))).toEqual([
            `https://attendance.is.chibatech.ac.jp/attendance/class_room/${room}`, "_blank", "noopener,noreferrer"
        ]);
    }
    await page.reload();
    await expect(page.locator('[name="fridayElective"][value="B"]')).toBeChecked();
    await expect(page.locator("#focusClasses .class-subject").first()).toContainText("映画における恐怖の歴史");
    await page.clock.setFixedTime(new Date("2026-09-25T14:00:00+09:00"));
    await page.evaluate(() => update());
    await expect(page.locator("#schedule .class-subject").last()).toContainText("映画における恐怖の歴史");
    await choose(page, "A");
    await expect(page.locator("#schedule .class-subject").last()).toContainText("科学哲学");
});

test("手入力も受付時間を守り、全角数字を正規化して保存する", async ({ page }) => {
    await visit(page, "2026-09-22T14:00:00");
    await page.evaluate(() => { window.opened = []; window.open = (...args) => { window.opened.push(args); return null; }; });
    await openManual(page);
    await page.locator("#classNumberInput").fill("１２３２");
    await expect(page.locator("#manualAttendanceButton")).toBeEnabled();
    await page.locator("#manualAttendanceButton").click();
    expect(await page.evaluate(() => window.opened[0][0])).toBe("https://attendance.is.chibatech.ac.jp/attendance/class_room/1232");
    await page.reload();
    await openManual(page);
    await expect(page.locator("#classNumberInput")).toHaveValue("1232");
    await page.locator("#classNumberInput").fill("1232 講義室");
    await expect(page.locator("#manualAttendanceButton")).toBeDisabled();
    await page.locator("#classNumberInput").fill("1232");
    await page.clock.setFixedTime(new Date("2026-09-22T18:20:01+09:00"));
    await page.evaluate(() => update());
    await expect(page.locator("#manualAttendanceButton")).toBeDisabled();
});

test("隣接授業の受付が重なっても現在の授業は新しい授業になる", async ({ page }) => {
    await visit(page, "2026-09-23T15:00:00");
    await expect(page.locator("#focusClasses .class-subject").first()).toHaveText("社会数理モデリング");
    await expect(page.locator('#view-home [data-room-code="7201"] button')).toBeEnabled();
    await expect(page.locator('#view-home [data-room-code="8109"] button')).toBeEnabled();
    await page.clock.setFixedTime(new Date("2026-09-23T15:20:01+09:00"));
    await page.evaluate(() => update());
    await expect(page.locator('#view-home [data-room-code="7201"] button')).toBeDisabled();
    await expect(page.locator('#view-home [data-room-code="8109"] button')).toBeEnabled();
});

test("日本国外の端末でも日本時間と曜日を表示する", async ({ page }) => {
    // このテストだけ別コンテキストでUTCの日付が前日のケースを確認する。
    const context = await page.context().browser().newContext({ timezoneId: "America/Los_Angeles" });
    const foreign = await context.newPage();
    await foreign.clock.setFixedTime(new Date("2026-09-27T15:00:00Z"));
    await foreign.goto("http://127.0.0.1:4173/attendance-system/index.html");
    await expect(foreign.locator("#today")).toContainText("月曜日");
    await expect(foreign.locator("#clock")).toHaveText("00:00:00");
    await expect(foreign.locator("#schedule")).toHaveText("本日は全休です。");
    await context.close();
});

test("スマートフォンとデスクトップで横にはみ出さず操作できる", async ({ page }) => {
    await visit(page, "2026-09-25T15:00:00");
    await choose(page, "A");
    for (const width of [320, 375, 390, 620, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator("#focusClasses .class-button").first()).toBeVisible();
        const buttonsFit = await page.locator(".class-button:visible").evaluateAll(buttons => buttons.every(button => {
            const rect = button.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth;
        }));
        expect(buttonsFit).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});

test("GitHub Pages相当のサブパスでPWAをキャッシュし、オフラインでも選択を復元する", async ({ page, context }) => {
    await visit(page, "2026-09-25T16:00:00");
    await choose(page, "B");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const cached = await page.evaluate(async () => {
        const cache = await caches.open("cit-attendance-2026-fall-v4");
        return (await cache.keys()).map(request => new URL(request.url).pathname);
    });
    for (const name of ["index.html", "styles.css", "app.js", "timetable.js", "manifest.webmanifest", "icon-192.png", "icon-512.png",
        "assets/autumn-campus-768.webp", "assets/autumn-campus-1536.webp"]) {
        expect(cached).toContain(`/attendance-system/${name}`);
    }
    await context.setOffline(true);
    await page.reload();
    await expect.poll(() => page.locator(".autumn-scene").evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator('[name="fridayElective"][value="B"]')).toBeChecked();
    await expect(page.locator("#focusClasses .class-subject").first()).toContainText("映画における恐怖の歴史");
    await expect(page.locator("#pwaStatus")).toBeEmpty();
});

test("ストレージが使えない場合も画面は動作し、保存できない旨を表示する", async ({ page }) => {
    await page.addInitScript(() => {
        Storage.prototype.setItem = () => { throw new Error("Storage unavailable"); };
    });
    await visit(page, "2026-09-25T16:00:00");
    await choose(page, "B");
    await expect(page.locator("#electiveStatus")).toContainText("保存できません");
    await expect(page.locator("#focusClasses .class-subject").first()).toContainText("映画における恐怖の歴史");
});

test("既存の通知は10分前と5分前に選択授業だけを通知し、変更済み・期限切れの通知では出席を開かない", async ({ page }) => {
    await page.addInitScript(() => {
        window.notices = [];
        window.opened = [];
        window.Notification = class {
            static permission = "granted";
            constructor(title, options) { this.title = title; this.options = options; window.notices.push(this); }
            close() {}
        };
        window.open = (...args) => { window.opened.push(args); return null; };
    });
    await visit(page, "2026-09-25T14:49:59");
    await choose(page, "B");
    expect(await page.evaluate(() => window.notices.length)).toBe(0);
    await page.clock.setFixedTime(new Date("2026-09-25T14:50:00+09:00"));
    await page.evaluate(() => { update(); update(); });
    expect(await page.evaluate(() => window.notices.map(n => n.title))).toEqual(["出席受付が始まりました"]);
    expect(await page.evaluate(() => window.notices[0].options.body)).toContain("映画における恐怖の歴史");
    await page.clock.setFixedTime(new Date("2026-09-25T14:55:00+09:00"));
    await page.evaluate(() => { update(); update(); });
    expect(await page.evaluate(() => window.notices.map(n => n.title))).toEqual(["出席受付が始まりました", "授業開始5分前です"]);
    await choose(page, "A");
    await page.evaluate(() => window.notices[0].onclick());
    expect(await page.evaluate(() => window.opened)).toEqual([]);
    await page.evaluate(() => window.notices.at(-1).onclick());
    expect(await page.evaluate(() => window.opened.at(-1)[0])).toBe("https://attendance.is.chibatech.ac.jp/attendance/class_room/7201");
    await page.clock.setFixedTime(new Date("2026-09-25T17:20:01+09:00"));
    await page.evaluate(() => window.notices.at(-1).onclick());
    expect(await page.evaluate(() => window.opened.length)).toBe(1);
});

test("別タブの選択変更も現在の授業に反映する", async ({ page, context }) => {
    await visit(page, "2026-09-25T15:00:00");
    const other = await context.newPage();
    await visit(other, "2026-09-25T15:00:00");
    await choose(other, "B");
    await expect(page.locator('[name="fridayElective"][value="B"]')).toBeChecked();
    await expect(page.locator("#focusClasses .class-subject").first()).toContainText("映画における恐怖の歴史");
    await other.close();
});

test("ホームで初回選択が完了し、短い授業名と保存結果を表示する", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, "2026-09-25T15:00:00");
    await expect(page.locator("#homeElectiveSetup")).toBeVisible();
    await page.locator("#focusClasses .class-button").click();
    await expect(page.locator('[data-elective="B"]')).toBeVisible();
    await page.locator('[data-elective="B"]').click();
    await expect(page.locator("#homeElectiveSetup")).toBeHidden();
    await expect(page.locator("#settingsBadge")).toBeHidden();
    await expect(page.locator("#homeElectiveStatus")).toContainText("映画における恐怖の歴史を選択しました");
    await expect(page.locator("#focusClasses .class-subject")).toHaveText("映画における恐怖の歴史");
    await expect(page.locator('#view-home [data-room-code="5305"]')).toHaveCount(1);
    const button = await page.locator("#focusClasses .class-button").boundingBox();
    const nav = await page.locator(".bottom-nav").boundingBox();
    expect(button.y).toBeGreaterThan(0);
    expect(button.y + button.height).toBeLessThan(nav.y);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.reload();
    await expect(page.locator("#homeElectiveSetup")).toBeHidden();
    await expect(page.locator("#focusClasses .class-subject")).toHaveText("映画における恐怖の歴史");
});

test("教室番号の無効理由と受付時刻を入力直後に案内する", async ({ page }) => {
    await visit(page, "2026-09-22T13:49:59");
    await openManual(page);
    const input = page.locator("#classNumberInput");
    const status = page.locator("#manualStatus");
    await input.fill("１２３２");
    await expect(status).toHaveText("受付開始前です。13:50から出席できます。");
    await expect(page.locator("#manualAttendanceButton")).toBeDisabled();
    await page.clock.setFixedTime(new Date("2026-09-22T13:50:00+09:00"));
    await page.evaluate(() => update());
    await expect(status).toContainText("出席ページを開けます");
    await expect(page.locator("#manualAttendanceButton")).toBeEnabled();
    await input.fill("9999");
    await expect(status).toContainText("今日の選択済み授業にない教室番号");
    await input.fill("1232 講義室");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(status).toContainText("3〜10桁の数字");
    await input.fill("1232");
    await expect(input).toHaveAttribute("aria-invalid", "false");
    await page.clock.setFixedTime(new Date("2026-09-22T18:20:01+09:00"));
    await page.evaluate(() => update());
    await expect(status).toContainText("今日の出席受付は終了");
    await input.fill("");
    await expect(status).toHaveText("今日の授業の教室番号を入力してください。");
    await page.clock.setFixedTime(new Date("2026-09-25T15:00:00+09:00"));
    await page.evaluate(() => update());
    await input.fill("5305");
    await expect(status).toContainText("金曜の選択授業が未設定");
    await page.clock.setFixedTime(new Date("2026-09-28T10:00:00+09:00"));
    await page.evaluate(() => update());
    await expect(status).toContainText("今日は通常授業がない");
});

test("下部ナビ・履歴・曜日のキー操作と、更新時の詳細・フォーカスを保つ", async ({ page }) => {
    await visit(page, "2026-09-23T14:00:00");
    await page.locator('[data-view="timetable"]').click();
    await expect(page.locator("#view-home")).toBeHidden();
    await expect(page.locator("#timetable-heading")).toBeFocused();
    await page.locator("#weekday-3").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#weekday-4")).toBeFocused();
    await expect(page.locator("#weekday-4")).toHaveAttribute("aria-selected", "true");
    const summary = page.locator('#week-panel-4 .course-details summary').first();
    await summary.click();
    await summary.focus();
    await page.clock.setFixedTime(new Date("2026-09-23T14:01:00+09:00"));
    await page.evaluate(() => update());
    await expect(summary).toBeFocused();
    await expect(page.locator('#week-panel-4 .course-details').first()).toHaveAttribute("open", "");
    await expect(page.locator("#weekday-4")).toHaveAttribute("aria-selected", "true");
    await page.locator('[data-view="settings"]').click();
    await page.goBack();
    await expect(page.locator("#view-timetable")).toBeVisible();
    await expect(page.locator('[data-view="timetable"]')).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(page.locator("#view-timetable")).toBeVisible();
    await page.locator("#weekday-3").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#weekday-0")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#weekday-1")).toBeFocused();
    await page.clock.setFixedTime(new Date("2026-09-24T00:00:00+09:00"));
    await page.evaluate(() => update());
    await expect(page.locator("#weekday-4")).toHaveAttribute("aria-selected", "true");
});

test("授業終了後の受付をホームに残し、締切後に次の授業へ切り替える", async ({ page }) => {
    await visit(page, "2026-09-22T18:00:00");
    await expect(page.locator("#focus-heading")).toHaveText("出席受付中の授業");
    await expect(page.locator("#focusClasses .class-subject")).toHaveText("NWプログラミング応用演習");
    await expect(page.locator("#focusClasses .class-button")).toBeEnabled();
    await expect(page.locator("#focusClasses .class-status")).toContainText("授業終了後");
    await expect(page.locator("#schedule .class-card")).toHaveCount(0);
    await page.clock.setFixedTime(new Date("2026-09-22T18:20:01+09:00"));
    await page.evaluate(() => update());
    await expect(page.locator("#focus-heading")).toHaveText("次の授業");
    await expect(page.locator("#focusClasses .class-subject")).toHaveText("OSとシステムソフトウェア");
    await expect(page.locator("#focusClasses .class-status")).toContainText("09/23 水曜日");
    await expect(page.locator('#schedule [data-room-code="1232"] button')).toBeDisabled();
});

test("小さなスマホでも出席ボタンが初期画面に収まり、全画面で横にはみ出さない", async ({ page }) => {
    await visit(page, "2026-09-25T15:00:00");
    await choose(page, "B");
    for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
        await page.setViewportSize({ width, height });
        await page.locator('[data-view="home"]').click();
        await page.evaluate(() => window.scrollTo(0, 0));
        const box = await page.locator("#focusClasses .class-button").boundingBox();
        const nav = await page.locator(".bottom-nav").boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
        for (const view of ["home", "timetable", "settings"]) {
            await page.locator(`[data-view="${view}"]`).click();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const last = page.locator(`#view-${view} button:visible:not(:disabled)`).last();
            await last.scrollIntoViewIfNeeded();
            const lastBox = await last.boundingBox();
            const navBox = await page.locator(".bottom-nav").boundingBox();
            // 画面最下部までスクロールすればナビに操作が隠れない。
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            const reachable = await last.boundingBox();
            expect(reachable.y + reachable.height).toBeLessThanOrEqual(navBox.y);
        }
    }
});
