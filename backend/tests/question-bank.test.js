const assert = require("node:assert/strict");

const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000/api";
const ownerName = `bank_owner_${Date.now()}`;
const viewerName = `bank_viewer_${Date.now()}`;
const password = "123456";

async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const body = await response.json();

    if (!response.ok) {
        const error = new Error(
            `${response.status}: ${JSON.stringify(body)}`
        );
        error.status = response.status;
        error.body = body;
        throw error;
    }

    return body;
}

async function register(username) {
    const result = await request("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password })
    });

    assert.equal(result.success, true);
    return result.data.token;
}

async function run() {
    const ownerToken = await register(ownerName);
    const viewerToken = await register(viewerName);

    const ownerHeaders = {
        Authorization: `Bearer ${ownerToken}`
    };
    const viewerHeaders = {
        Authorization: `Bearer ${viewerToken}`
    };

    const version = await request("/question-versions", {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
            content: {
                type: "text",
                title: "题库共享测试题",
                required: true,
                validation: {
                    minLength: 1,
                    maxLength: 100
                }
            }
        })
    });

    assert.equal(version.success, true);
    const versionId = version.data._id;

    const bank = await request("/question-banks", {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
            name: "共享题库测试",
            description: "验证题库加入和共享"
        })
    });

    assert.equal(bank.success, true);
    const bankId = bank.data._id;

    const added = await request(`/question-banks/${bankId}/questions`, {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
            questionVersionId: versionId
        })
    });

    assert.equal(added.success, true);
    assert.equal(
        added.data.questionVersionIds.some(
            (id) => String(id) === String(versionId)
        ),
        true
    );

    const shared = await request(`/question-banks/${bankId}/share`, {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
            username: viewerName
        })
    });

    assert.equal(shared.success, true);
    assert.equal(shared.data.sharedWithUser.username, viewerName);

    const viewerBanks = await request("/question-banks", {
        headers: viewerHeaders
    });

    assert.equal(viewerBanks.success, true);
    const sharedBank = viewerBanks.data.find(
        (item) => String(item._id) === String(bankId)
    );

    assert.ok(sharedBank);
    assert.equal(
        sharedBank.questionVersionIds.some(
            (id) => String(id) === String(versionId)
        ),
        true
    );

    const viewerDetail = await request(`/question-banks/${bankId}`, {
        headers: viewerHeaders
    });

    assert.equal(viewerDetail.success, true);
    assert.equal(String(viewerDetail.data._id), String(bankId));
    let viewerMutationDenied = false;

    try {
        await request(`/question-banks/${bankId}/questions`, {
            method: "POST",
            headers: viewerHeaders,
            body: JSON.stringify({
                questionVersionId: versionId
            })
        });
    } catch (error) {
        assert.equal(error.status, 404);
        viewerMutationDenied = true;
    }

    assert.equal(viewerMutationDenied, true);

    console.log("题库创建、加入和共享测试通过");
}

run().catch((error) => {
    console.error("题库流程测试失败：", error.message);
    process.exitCode = 1;
});