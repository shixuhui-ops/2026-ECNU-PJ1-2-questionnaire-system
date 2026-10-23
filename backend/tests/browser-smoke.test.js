const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const frontendBaseUrl =
    process.env.FRONTEND_BASE_URL || "http://127.0.0.1:5500/frontend";

async function run() {
    const browser = await chromium.launch({
        headless: true
    });

    const page = await browser.newPage();

    try {
        await page.goto(`${frontendBaseUrl}/index.html`, {
            waitUntil: "domcontentloaded"
        });

        await assertPageTitle(page, "在线问卷系统");
        await assertVisible(page, "nav a[href='./manage.html']");
        await assertVisible(page, "nav a[href='./fill.html']");
        await assertVisible(page, "nav a[href='./stats.html']");
        await assertVisible(page, "nav a[href='./question-bank.html']");
        await assertVisible(page, "#authSection");
        await assertVisible(page, "#username");
        await assertVisible(page, "#password");

        await page.goto(`${frontendBaseUrl}/fill.html`, {
            waitUntil: "domcontentloaded"
        });

        await assertPageTitle(page, "填写问卷");
        await assertVisible(page, "#accessCode");
        await assertVisible(page, "#loadButton");
        await assertAttached(page, "#questionContainer");

        await page.goto(`${frontendBaseUrl}/manage.html`, {
            waitUntil: "domcontentloaded"
        });

        await assertPageTitle(page, "管理问卷");
        await assertVisible(page, "#surveyId");
        await assertVisible(page, "#addQuestionButton");
        await assertVisible(page, "#allowMultipleSubmissions");
        await assertVisible(page, "#saveSettingsButton");

        await page.goto(`${frontendBaseUrl}/stats.html`, {
            waitUntil: "domcontentloaded"
        });

        await assertPageTitle(page, "问卷统计");
        await assertVisible(page, "#surveyId");
        await assertVisible(page, "#loadButton");
        await assertAttached(page, "#statistics");
        await page.goto(`${frontendBaseUrl}/question-bank.html`, {
            waitUntil: "domcontentloaded"
        });

        await assertPageTitle(page, "题库与题目版本管理");
        await assertVisible(page, "nav a[href='./index.html']");
        await assertVisible(page, "#loginNotice");
        await assertAttached(page, "#workspace");
        await assertAttached(page, "#createBankForm");
        await assertAttached(page, "#questionEditor");
        await assertAttached(page, "#versionDetailSection");
        console.log("浏览器端冒烟测试通过");
    } finally {
        await browser.close();
    }
}

async function assertPageTitle(page, expectedTitle) {
    const title = await page.title();
    assert.equal(title, expectedTitle);
}

async function assertVisible(page, selector) {
    await page.waitForSelector(selector, {
        state: "visible"
    });
}

async function assertAttached(page, selector) {
    await page.waitForSelector(selector, {
        state: "attached"
    });
}

run().catch((error) => {
    console.error("浏览器端冒烟测试失败：", error.message);
    process.exit(1);
});