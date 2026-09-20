const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests",
    testMatch: "*.browser.js",
    use: {
        baseURL: "http://127.0.0.1:4173/attendance-system/",
        timezoneId: "Asia/Tokyo",
        // headless shellを使い、GUIなしで確認できるようにする。
        headless: true,
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        }
    },
    webServer: {
        command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ..",
        url: "http://127.0.0.1:4173/attendance-system/",
        reuseExistingServer: false
    }
});
