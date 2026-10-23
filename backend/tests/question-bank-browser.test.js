const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const apiBase =
    process.env.API_BASE_URL || "http://127.0.0.1:3100/api";
const frontendBaseUrl =
    process.env.FRONTEND_BASE_URL || "http://127.0.0.1:5501";

async function apiRequest(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const body = await response.json();

    if (!response.ok) {
        throw new Error(body.message || `请求失败：${response.status}`);
    }

    return body.data;
}

async function run() {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const username = `browser${suffix}`;
    const password = "browser-test-password";
    const questionTitle = `浏览器题库测试题-${suffix}`;

    const registered = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password })
    });
    const token = registered.token;

    const survey = await apiRequest("/surveys", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            title: `浏览器草稿问卷-${suffix}`,
            description: "第二阶段前端自动化测试",
            allowAnonymous: false,
            allowMultipleSubmissions: true
        })
    });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.addInitScript(
            ({ authToken, configuredApiBase }) => {
                localStorage.setItem("questionnaire_token", authToken);
                localStorage.setItem(
                    "questionnaire_api_base",
                    configuredApiBase
                );
            },
            {
                authToken: token,
                configuredApiBase: apiBase
            }
        );

        await page.goto(`${frontendBaseUrl}/question-bank.html`, {
            waitUntil: "domcontentloaded"
        });

        await page.waitForSelector("#workspace", { state: "visible" });
        await page.waitForSelector("#createQuestionForm");

        await page.fill("#questionTitle", questionTitle);
        await page.selectOption("#questionType", "number");
        await page.fill("#minValue", "0");
        await page.fill("#maxValue", "120");
        await page.selectOption("#integerOnly", "true");
        await page.click(
            '#createQuestionForm button[type="submit"]'
        );

        await page.waitForFunction(
            title =>
                document.querySelector("#message")?.textContent.includes(
                    `独立题目“${title}”创建成功`
                ),
            questionTitle
        );

        const questionRow = page
            .locator("#questionList tbody tr")
            .filter({ hasText: questionTitle });

        await questionRow
            .getByRole("button", { name: "管理版本" })
            .click();

        const useForm = page
            .locator("#versionDetail form")
            .filter({ hasText: "选入草稿问卷" });

        const surveySelect = useForm.locator("select");

        await page.waitForFunction(
            surveyId =>
                [...document.querySelectorAll("#versionDetail select option")]
                    .some(option => option.value === surveyId),
            String(survey._id)
        );

        await surveySelect.selectOption(String(survey._id));
        await useForm
            .getByRole("button", { name: "加入问卷" })
            .click();

        await page.waitForFunction(
            () =>
                document.querySelector("#message")?.textContent.includes(
                    "题目已加入问卷"
                )
        );

        const savedSurvey = await apiRequest(
            `/surveys/${survey._id}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        assert.equal(savedSurvey.questions.length, 1);
        assert.equal(savedSurvey.questions[0].title, questionTitle);
        assert.ok(
            savedSurvey.questions[0].sourceQuestionVersionId,
            "选入问卷的题目应保存来源版本 ID"
        );

        console.log("第二阶段题库浏览器端到端测试通过");
    } finally {
        await browser.close();
    }
}

run().catch(error => {
    console.error(
        "第二阶段题库浏览器端到端测试失败：",
        error.message
    );
    process.exit(1);
});