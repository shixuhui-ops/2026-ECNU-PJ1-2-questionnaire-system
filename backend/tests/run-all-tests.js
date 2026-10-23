const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const backendDir = path.resolve(__dirname, "..");
const dbPath = path.join(backendDir, "data", "test-db");

fs.mkdirSync(dbPath, {
    recursive: true
});

const testMongoPort = Number(process.env.TEST_MONGO_PORT || 27018);
const testApiPort = Number(process.env.TEST_API_PORT || 3100);

const testMongoUri =
    process.env.TEST_MONGODB_URI ||
    `mongodb://127.0.0.1:${testMongoPort}/questionnaire_system_test`;

const testApiBaseUrl = `http://127.0.0.1:${testApiPort}/api`;

const testEnvironment = {
    ...process.env,
    PORT: String(testApiPort),
    MONGODB_URI: testMongoUri,
    JWT_SECRET:
        process.env.JWT_SECRET ||
        "questionnaire-test-secret"
};

const children = [];

function startProcess(command, args, options = {}) {
    const child = spawn(command, args, {
        cwd: backendDir,
        stdio: "inherit",
        ...options
    });

    children.push(child);
    return child;
}

async function waitForHealth(url, timeoutMs = 30000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(url);

            if (response.ok) {
                return;
            }
        } catch (error) {
            // Service is still starting.
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("后端服务启动超时");
}

function cleanup() {
    for (const child of children) {
        if (!child.killed && child.exitCode === null) {
            child.kill();
        }
    }
}

async function main() {
    process.on("SIGINT", () => {
        cleanup();
        process.exit(130);
    });

    process.on("SIGTERM", () => {
        cleanup();
        process.exit(143);
    });

    const mongodCommand = process.env.MONGOD_BIN || "mongod";

    startProcess(mongodCommand, [
        "--dbpath",
        dbPath,
        "--port",
        String(testMongoPort),
        "--bind_ip",
        "127.0.0.1",
        "--quiet"
    ]);

    startProcess(process.execPath, ["src/server.js"], {
        env: testEnvironment
    });

    try {
        await waitForHealth(`${testApiBaseUrl}/health`);

        const testFiles = [
            "tests/api.test.js",
            "tests/question-version.test.js",
            "tests/question-bank.test.js"
        ];

        for (const testFile of testFiles) {
            const test = spawn(process.execPath, [testFile], {
                cwd: backendDir,
                stdio: "inherit",
                env: {
                    ...testEnvironment,
                    API_BASE_URL: testApiBaseUrl
                }
            });

            const exitCode = await new Promise((resolve, reject) => {
                test.on("error", reject);
                test.on("exit", (code) => resolve(code ?? 1));
            });

            if (exitCode !== 0) {
                process.exitCode = exitCode;
                break;
            }
        }
    } finally {
        cleanup();
    }
}

main().catch((error) => {
    console.error(`一键测试失败：${error.message}`);
    cleanup();
    process.exitCode = 1;
});