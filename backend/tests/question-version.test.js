const assert = require("node:assert/strict");

const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000/api";
const username = `version_tester_${Date.now()}`;
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

async function run() {
    const register = await request("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password })
    });

    assert.equal(register.success, true);
    const token = register.data.token;
    const authHeaders = {
        Authorization: `Bearer ${token}`
    };

    const contentV1 = {
        type: "single",
        title: "版本测试题 v1",
        required: true,
        options: [
            { label: "选项A", value: "A" },
            { label: "选项B", value: "B" }
        ]
    };

    const created = await request("/question-versions", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ content: contentV1 })
    });

    assert.equal(created.success, true);
    assert.equal(created.data.version, 1);
    assert.deepEqual(
        created.data.content.options.map(({ label, value }) => ({ label, value })),
        contentV1.options
    );

    const version1Id = created.data._id;
    const familyId = String(created.data.familyId);

    const contentV2 = {
        ...contentV1,
        title: "版本测试题 v2"
    };

    const updated = await request(
        `/question-versions/${version1Id}/versions`,
        {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                content: contentV2,
                changeNote: "修改题目标题"
            })
        }
    );

    assert.equal(updated.success, true);
    assert.equal(updated.data.version, 2);
    assert.equal(String(updated.data.familyId), familyId);
    assert.equal(String(updated.data.parentVersionId), String(version1Id));
    assert.equal(updated.data.content.title, "版本测试题 v2");

    const version2Id = updated.data._id;

    const history = await request(
        `/question-versions/${version2Id}/history`,
        { headers: authHeaders }
    );

    assert.equal(history.success, true);
    assert.equal(String(history.data.familyId), familyId);
    assert.equal(history.data.versions.length, 2);
    assert.deepEqual(
        history.data.versions.map((item) => item.version),
        [1, 2]
    );

    const restored = await request(
        `/question-versions/${version2Id}/restore`,
        {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                targetVersionId: version1Id,
                changeNote: "恢复到初始版本"
            })
        }
    );

    assert.equal(restored.success, true);
    assert.equal(restored.data.version, 3);
    assert.equal(
        String(restored.data.restoredFromVersionId),
        String(version1Id)
    );
    assert.equal(
        String(restored.data.parentVersionId),
        String(version2Id)
    );
    assert.equal(restored.data.content.title, "版本测试题 v1");
    const snapshotContent = {
        type: "text",
        title: "问卷快照原始标题",
        required: true,
        validation: {
            minLength: 1,
            maxLength: 100
        }
    };

    const snapshotVersion = await request("/question-versions", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ content: snapshotContent })
    });

    const survey = await request("/surveys", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
            title: "题目快照不可变测试",
            allowAnonymous: true
        })
    });

    const surveyId = survey.data._id;

    const usedQuestion = await request(
        `/question-versions/${snapshotVersion.data._id}/use`,
        {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ surveyId })
        }
    );

    assert.equal(usedQuestion.success, true);
    assert.equal(
        usedQuestion.data.title,
        "问卷快照原始标题"
    );
    assert.equal(
        String(usedQuestion.data.sourceQuestionVersionId),
        String(snapshotVersion.data._id)
    );

    await request(
        `/question-versions/${snapshotVersion.data._id}/versions`,
        {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                content: {
                    ...snapshotContent,
                    title: "题库后续版本标题"
                },
                changeNote: "验证问卷快照独立"
            })
        }
    );

    const surveyDetail = await request(`/surveys/${surveyId}`, {
        headers: authHeaders
    });

    assert.equal(surveyDetail.success, true);
    assert.equal(surveyDetail.data.questions.length, 1);
    assert.equal(
        surveyDetail.data.questions[0].title,
        "问卷快照原始标题"
    );
    assert.equal(
        String(surveyDetail.data.questions[0].sourceQuestionVersionId),
        String(snapshotVersion.data._id)
    );
    const usages = await request(
        `/question-versions/${snapshotVersion.data._id}/usages`,
        { headers: authHeaders }
    );

    assert.equal(usages.success, true);
    assert.equal(usages.data.scope, "version");
    assert.equal(usages.data.totalUsages, 1);
    assert.equal(usages.data.usages.length, 1);
    assert.equal(
        String(usages.data.usages[0].surveyId),
        String(surveyId)
    );
    assert.equal(
        String(usages.data.usages[0].questionVersionId),
        String(snapshotVersion.data._id)
    );

    const familyUsages = await request(
        `/question-versions/${snapshotVersion.data._id}/usages?scope=family`,
        { headers: authHeaders }
    );

    assert.equal(familyUsages.success, true);
    assert.equal(familyUsages.data.scope, "family");
    assert.equal(familyUsages.data.totalUsages, 1);

    const statistics = await request(
        `/question-versions/${snapshotVersion.data._id}/statistics`,
        { headers: authHeaders }
    );

    assert.equal(statistics.success, true);
    assert.equal(statistics.data.scope, "version");
    assert.equal(statistics.data.totalSurveys, 1);
    assert.equal(statistics.data.totalSurveyResponses, 0);
    assert.equal(statistics.data.totalResponses, 0);
    assert.equal(statistics.data.versionStatistics.length, 1);
    assert.equal(
        statistics.data.versionStatistics[0].version,
        snapshotVersion.data.version
    );
    const published = await request(`/surveys/${surveyId}/publish`, {
        method: "POST",
        headers: authHeaders
    });

    assert.equal(published.success, true);
    const accessCode = published.data.survey.accessCode;
    const snapshotQuestionId = usedQuestion.data._id;

    const submitted = await request(`/responses/${accessCode}`, {
        method: "POST",
        body: JSON.stringify({
            answers: [
                {
                    questionId: snapshotQuestionId,
                    value: "统计测试答案"
                }
            ]
        })
    });

    assert.equal(submitted.success, true);

    const statisticsAfterSubmit = await request(
        `/question-versions/${snapshotVersion.data._id}/statistics`,
        { headers: authHeaders }
    );

    assert.equal(statisticsAfterSubmit.success, true);
    assert.equal(statisticsAfterSubmit.data.totalSurveys, 1);
    assert.equal(statisticsAfterSubmit.data.totalSurveyResponses, 1);
    assert.equal(statisticsAfterSubmit.data.totalResponses, 1);
    assert.equal(
        statisticsAfterSubmit.data.versionStatistics[0].totalResponses,
        1
    );
    assert.equal(
        statisticsAfterSubmit.data.versionStatistics[0].statistics.totalAnswers,
        1
    );
    const snapshotHistory = await request(
        `/question-versions/${snapshotVersion.data._id}/history`,
        { headers: authHeaders }
    );

    assert.equal(snapshotHistory.success, true);
    assert.equal(snapshotHistory.data.versions.length, 2);

    const snapshotVersion2 = snapshotHistory.data.versions.find(
        (item) => item.version === 2
    );

    assert.ok(snapshotVersion2);

    const secondSurvey = await request("/surveys", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
            title: "题目族统计 v2 测试",
            allowAnonymous: true
        })
    });

    const secondSurveyId = secondSurvey.data._id;

    const secondUsedQuestion = await request(
        `/question-versions/${snapshotVersion2._id}/use`,
        {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ surveyId: secondSurveyId })
        }
    );

    assert.equal(secondUsedQuestion.success, true);
    assert.equal(secondUsedQuestion.data.title, "题库后续版本标题");

    const secondPublished = await request(
        `/surveys/${secondSurveyId}/publish`,
        {
            method: "POST",
            headers: authHeaders
        }
    );

    const secondAccessCode = secondPublished.data.survey.accessCode;

    const secondSubmitted = await request(
        `/responses/${secondAccessCode}`,
        {
            method: "POST",
            body: JSON.stringify({
                answers: [
                    {
                        questionId: secondUsedQuestion.data._id,
                        value: "v2统计答案"
                    }
                ]
            })
        }
    );

    assert.equal(secondSubmitted.success, true);

    const familyStatistics = await request(
        `/question-versions/${snapshotVersion.data._id}/statistics?scope=family`,
        { headers: authHeaders }
    );

    assert.equal(familyStatistics.success, true);
    assert.equal(familyStatistics.data.scope, "family");
    assert.equal(familyStatistics.data.totalSurveys, 2);
    assert.equal(familyStatistics.data.totalSurveyResponses, 2);
    assert.equal(familyStatistics.data.totalResponses, 2);
    assert.deepEqual(
        familyStatistics.data.versionStatistics.map((item) => ({
            version: item.version,
            totalSurveys: item.totalSurveys,
            totalResponses: item.totalResponses,
            totalAnswers: item.statistics.totalAnswers
        })),
        [
            {
                version: 1,
                totalSurveys: 1,
                totalResponses: 1,
                totalAnswers: 1
            },
            {
                version: 2,
                totalSurveys: 1,
                totalResponses: 1,
                totalAnswers: 1
            }
        ]
    );
    const otherUsername = `version_viewer_${Date.now()}`;
    const otherRegister = await request("/auth/register", {
        method: "POST",
        body: JSON.stringify({
            username: otherUsername,
            password
        })
    });

    const otherHeaders = {
        Authorization: `Bearer ${otherRegister.data.token}`
    };

    for (const endpoint of [
        `/question-versions/${snapshotVersion.data._id}/usages`,
        `/question-versions/${snapshotVersion.data._id}/statistics`
    ]) {
        let accessDenied = false;

        try {
            await request(endpoint, { headers: otherHeaders });
        } catch (error) {
            assert.equal(error.status, 404);
            accessDenied = true;
        }

        assert.equal(accessDenied, true);
    }

    let invalidScopeRejected = false;

    try {
        await request(
            `/question-versions/${snapshotVersion.data._id}/statistics?scope=unknown`,
            { headers: authHeaders }
        );
    } catch (error) {
        assert.equal(error.status, 400);
        invalidScopeRejected = true;
    }

    assert.equal(invalidScopeRejected, true);
    console.log("题目版本生命周期测试通过");
}

run().catch((error) => {
    console.error("题目版本生命周期测试失败：", error.message);
    process.exitCode = 1;
});