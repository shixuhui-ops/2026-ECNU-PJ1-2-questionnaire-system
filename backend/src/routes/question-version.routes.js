const express = require("express");
const mongoose = require("mongoose");
const QuestionVersion = require("../models/question-version.model");
const QuestionBank = require("../models/question-bank.model");
const User = require("../models/user.model");
const Survey = require("../models/survey.model");
const Response = require("../models/response.model");
const summarizeQuestionAnswers = require("../utils/question-statistics");
const requireAuth = require("../middleware/auth.middleware");
const validateQuestion = require("../utils/question-validation");

const router = express.Router();

router.use(requireAuth);

// 可访问自己创建、直接共享、或通过题库共享的题目版本。
async function accessibleVersions(userId) {
    const bankVersionIds = await QuestionBank.distinct(
        "questionVersionIds",
        {
            $or: [
                { ownerId: userId },
                { sharedWith: userId }
            ]
        }
    );

    return {
        $or: [
            { ownerId: userId },
            { sharedWith: userId },
            { _id: { $in: bankVersionIds } }
        ]
    };
}

// 只接受题目内容，不接受客户端指定所有者、版本号或来源。
function buildContent(question) {
    return {
        type: question.type,
        title: question.title.trim(),
        description: (question.description || "").trim(),
        required: question.required === true,
        options: ["single", "multiple"].includes(question.type)
            ? question.options.map((option) => ({
                label: option.label.trim(),
                value: option.value.trim()
            }))
            : [],
        validation: question.validation || {}
    };
}

// 创建一道题，保存为独立版本家族的第一版。
router.post("/", async (req, res) => {
    try {
        const question = req.body?.content;
        const validationError = validateQuestion(question);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const version = await QuestionVersion.create({
            familyId: new mongoose.Types.ObjectId(),
            ownerId: req.user._id,
            version: 1,
            content: buildContent(question)
        });

        return res.status(201).json({
            success: true,
            data: version
        });
    } catch (error) {
        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                success: false,
                message: "题目内容不符合字段约束"
            });
        }

        console.error("创建题目版本失败：", error);

        return res.status(500).json({
            success: false,
            message: "创建题目版本失败"
        });
    }
});

// 列出当前用户有权访问的题目版本。
router.get("/", async (req, res) => {
    try {
        const filter = await accessibleVersions(req.user._id);
        const versions = await QuestionVersion.find(filter)
            .sort({ createdAt: -1, _id: -1 });

        return res.json({
            success: true,
            data: versions
        });
    } catch (error) {
        console.error("获取题目版本列表失败：", error);

        return res.status(500).json({
            success: false,
            message: "获取题目版本列表失败"
        });
    }
});

// 同一家族使用唯一索引防止版本号冲突。
// 并发创建发生冲突时，重新读取最大版本号后重试。
async function createNextVersion(
    source,
    ownerId,
    content,
    changeNote,
    restoredFromVersionId = null
) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const latest = await QuestionVersion.findOne({
            familyId: source.familyId
        })
            .sort({ version: -1 })
            .select("version")
            .lean();

        try {
            return await QuestionVersion.create({
                familyId: source.familyId,
                ownerId,
                version: latest.version + 1,
                parentVersionId: source._id,
                restoredFromVersionId,
                content: buildContent(content),
                changeNote
            });
        } catch (error) {
            if (error.code !== 11000) {
                throw error;
            }
        }
    }

    return null;
}

// 仅题目所有者可以在原家族中创建后续版本。
router.post("/:id/versions", async (req, res) => {
    try {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "题目版本ID无效"
            });
        }

        const source = await QuestionVersion.findOne({
            _id: req.params.id,
            ownerId: req.user._id
        });

        if (!source) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权修改"
            });
        }

        const body = req.body || {};
        const validationError = validateQuestion(body.content);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        if (
            body.changeNote !== undefined &&
            (
                typeof body.changeNote !== "string" ||
                body.changeNote.length > 1000
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "修改说明必须是字符串且不能超过1000个字符"
            });
        }

        const version = await createNextVersion(
            source,
            req.user._id,
            body.content,
            (body.changeNote || "").trim()
        );

        if (!version) {
            return res.status(409).json({
                success: false,
                message: "并发创建版本较多，请稍后重试"
            });
        }

        return res.status(201).json({
            success: true,
            message: "新版本创建成功，旧版本保持不变",
            data: version
        });
    } catch (error) {
        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                success: false,
                message: "题目内容不符合字段约束"
            });
        }

        console.error("创建后续版本失败：", error);

        return res.status(500).json({
            success: false,
            message: "创建后续版本失败"
        });
    }
});

// 查询同一道题的版本历史，只返回当前用户有权访问的版本。
router.get("/:id/history", async (req, res) => {
    try {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "题目版本ID无效"
            });
        }

        const accessFilter = await accessibleVersions(req.user._id);

        const source = await QuestionVersion.findOne({
            _id: req.params.id,
            ...accessFilter
        }).lean();

        if (!source) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权访问"
            });
        }

        const versions = await QuestionVersion.find({
            familyId: source.familyId,
            ...accessFilter
        })
            .sort({ version: 1 })
            .lean();

        return res.json({
            success: true,
            data: {
                familyId: source.familyId,
                versions
            }
        });
    } catch (error) {
        console.error("获取版本历史失败：", error);

        return res.status(500).json({
            success: false,
            message: "获取版本历史失败"
        });
    }
});

// 基于当前版本恢复同一家族中的旧版本，生成新的版本文档。
router.post("/:id/restore", async (req, res) => {
    try {
        const currentVersionId = req.params.id;
        const body = req.body || {};
        const targetVersionId = body.targetVersionId;

        if (
            !mongoose.isObjectIdOrHexString(currentVersionId) ||
            !mongoose.isObjectIdOrHexString(targetVersionId)
        ) {
            return res.status(400).json({
                success: false,
                message: "当前版本ID或恢复目标版本ID无效"
            });
        }

        if (
            body.changeNote !== undefined &&
            (
                typeof body.changeNote !== "string" ||
                body.changeNote.length > 1000
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "恢复说明必须是字符串且不能超过1000个字符"
            });
        }

        const current = await QuestionVersion.findOne({
            _id: currentVersionId,
            ownerId: req.user._id
        });

        if (!current) {
            return res.status(404).json({
                success: false,
                message: "当前版本不存在或无权修改"
            });
        }

        const target = await QuestionVersion.findOne({
            _id: targetVersionId,
            familyId: current.familyId,
            ownerId: req.user._id
        });

        if (!target) {
            return res.status(404).json({
                success: false,
                message: "恢复目标不存在或不属于当前题目家族"
            });
        }

        if (target.version >= current.version) {
            return res.status(400).json({
                success: false,
                message: "恢复目标必须是比当前版本更早的版本"
            });
        }

        const restoredContent = target.content.toObject();
        const validationError = validateQuestion(restoredContent);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const changeNote = body.changeNote === undefined
            ? `恢复版本 v${target.version}`
            : body.changeNote.trim();

        const version = await createNextVersion(
            current,
            req.user._id,
            restoredContent,
            changeNote,
            target._id
        );

        if (!version) {
            return res.status(409).json({
                success: false,
                message: "并发创建版本较多，请稍后重试"
            });
        }

        return res.status(201).json({
            success: true,
            message: "旧版本内容已恢复为新版本，历史记录保留",
            data: version
        });
    } catch (error) {
        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                success: false,
                message: "恢复内容不符合字段约束"
            });
        }

        console.error("恢复题目版本失败：", error);

        return res.status(500).json({
            success: false,
            message: "恢复题目版本失败"
        });
    }
});

// 仅所有者可以将指定版本共享给其他已注册用户。
router.post("/:id/share", async (req, res) => {
    try {
        const versionId = req.params.id;
        const username = req.body?.username;

        if (!mongoose.isObjectIdOrHexString(versionId)) {
            return res.status(400).json({
                success: false,
                message: "题目版本ID无效"
            });
        }

        if (
            typeof username !== "string" ||
            username.trim().length < 3 ||
            username.trim().length > 30
        ) {
            return res.status(400).json({
                success: false,
                message: "请输入3到30个字符的目标用户名"
            });
        }

        const source = await QuestionVersion.findOne({
            _id: versionId,
            ownerId: req.user._id
        }).select("_id");

        if (!source) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权共享"
            });
        }

        const targetUser = await User.findOne({
            username: username.trim()
        }).select("_id username");

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "目标用户不存在"
            });
        }

        if (String(targetUser._id) === String(req.user._id)) {
            return res.status(400).json({
                success: false,
                message: "无需将自己的题目共享给自己"
            });
        }

        const updated = await QuestionVersion.findOneAndUpdate(
            {
                _id: versionId,
                ownerId: req.user._id
            },
            {
                $addToSet: {
                    sharedWith: targetUser._id
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权共享"
            });
        }

        return res.json({
            success: true,
            message: "题目版本共享成功",
            data: {
                questionVersionId: updated._id,
                sharedWithUser: {
                    id: targetUser._id,
                    username: targetUser.username
                }
            }
        });
    } catch (error) {
        console.error("共享题目版本失败：", error);

        return res.status(500).json({
            success: false,
            message: "共享题目版本失败"
        });
    }
});

// 将有权使用的题目版本复制到自己的草稿问卷。
router.post("/:id/use", async (req, res) => {
    try {
        const versionId = req.params.id;
        const surveyId = req.body?.surveyId;

        if (
            !mongoose.isObjectIdOrHexString(versionId) ||
            !mongoose.isObjectIdOrHexString(surveyId)
        ) {
            return res.status(400).json({
                success: false,
                message: "题目版本ID或问卷ID无效"
            });
        }

        const survey = await Survey.findOne({
            _id: surveyId,
            ownerId: req.user._id
        });

        if (!survey) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在或无权管理"
            });
        }

        if (survey.status !== "draft") {
            return res.status(400).json({
                success: false,
                message: "只有草稿问卷可以加入题目"
            });
        }

        const accessFilter = await accessibleVersions(req.user._id);

        const version = await QuestionVersion.findOne({
            _id: versionId,
            ...accessFilter
        });

        if (!version) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权使用"
            });
        }

        const content = version.content.toObject();
        const validationError = validateQuestion(content);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const questionId = new mongoose.Types.ObjectId();
        const questionCount = survey.questions.length;

        const question = {
            ...buildContent(content),
            _id: questionId,
            order: questionCount,
            sourceQuestionVersionId: version._id
        };

        // 同时检查状态和题目数量，防止并发添加导致顺序重复，
        // 或在读取问卷后、写入前问卷已经发布。
        const updated = await Survey.findOneAndUpdate(
            {
                _id: surveyId,
                ownerId: req.user._id,
                status: "draft",
                questions: { $size: questionCount }
            },
            {
                $push: { questions: question },
                $inc: { __v: 1 }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!updated) {
            return res.status(409).json({
                success: false,
                message: "问卷状态或题目列表已变化，请刷新后重试"
            });
        }

        return res.status(201).json({
            success: true,
            message: "题目版本已加入问卷",
            data: updated.questions.id(questionId)
        });
    } catch (error) {
        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                success: false,
                message: "题目内容不符合字段约束"
            });
        }

        console.error("从题库加入问卷失败：", error);

        return res.status(500).json({
            success: false,
            message: "从题库加入问卷失败"
        });
    }
});

// 查看指定版本或整个题目家族被哪些问卷使用。
// 默认只查当前版本；使用 ?scope=family 查询所有版本。
router.get("/:id/usages", async (req, res) => {
    try {
        const versionId = req.params.id;
        const scope = req.query.scope || "version";

        if (!mongoose.isObjectIdOrHexString(versionId)) {
            return res.status(400).json({
                success: false,
                message: "题目版本ID无效"
            });
        }

        if (!["version", "family"].includes(scope)) {
            return res.status(400).json({
                success: false,
                message: "scope 只能是 version 或 family"
            });
        }

        const source = await QuestionVersion.findOne({
            _id: versionId,
            ownerId: req.user._id
        }).lean();

        if (!source) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权查看使用情况"
            });
        }

        let versions = [source];

        if (scope === "family") {
            versions = await QuestionVersion.find({
                familyId: source.familyId,
                ownerId: req.user._id
            })
                .sort({ version: 1 })
                .lean();
        }

        const versionById = new Map(
            versions.map((version) => [
                String(version._id),
                version
            ])
        );

        const versionIds = versions.map((version) => version._id);

        const surveys = await Survey.find({
            "questions.sourceQuestionVersionId": {
                $in: versionIds
            }
        })
            .select(
                "ownerId title status accessCode questions createdAt updatedAt"
            )
            .lean();

        const usages = [];

        for (const survey of surveys) {
            for (const question of survey.questions) {
                const sourceId = String(
                    question.sourceQuestionVersionId || ""
                );
                const usedVersion = versionById.get(sourceId);

                if (!usedVersion) {
                    continue;
                }

                usages.push({
                    surveyId: survey._id,
                    surveyTitle: survey.title,
                    surveyStatus: survey.status,
                    surveyOwnerId: survey.ownerId,
                    accessCode:
                        survey.status === "published"
                            ? survey.accessCode
                            : null,
                    questionId: question._id,
                    questionOrder: question.order,
                    questionVersionId: usedVersion._id,
                    version: usedVersion.version,
                    createdAt: survey.createdAt,
                    updatedAt: survey.updatedAt
                });
            }
        }

        usages.sort((left, right) => {
            if (left.version !== right.version) {
                return left.version - right.version;
            }

            return String(left.surveyId).localeCompare(
                String(right.surveyId)
            );
        });

        return res.json({
            success: true,
            data: {
                familyId: source.familyId,
                scope,
                totalUsages: usages.length,
                usages
            }
        });
    } catch (error) {
        console.error("获取题目使用情况失败：", error);

        return res.status(500).json({
            success: false,
            message: "获取题目使用情况失败"
        });
    }
});

// 题目所有者查询跨问卷统计。
// 默认统计指定版本；scope=family 时按版本分别统计整个家族。
router.get("/:id/statistics", async (req, res) => {
    try {
        const versionId = req.params.id;
        const scope = req.query.scope || "version";

        if (!mongoose.isObjectIdOrHexString(versionId)) {
            return res.status(400).json({
                success: false,
                message: "题目版本ID无效"
            });
        }

        if (!["version", "family"].includes(scope)) {
            return res.status(400).json({
                success: false,
                message: "scope 只能是 version 或 family"
            });
        }

        const source = await QuestionVersion.findOne({
            _id: versionId,
            ownerId: req.user._id
        }).lean();

        if (!source) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权查看统计"
            });
        }

        const versions = scope === "family"
            ? await QuestionVersion.find({
                familyId: source.familyId,
                ownerId: req.user._id
            }).sort({ version: 1 }).lean()
            : [source];

        const buckets = new Map(
            versions.map((version) => [
                String(version._id),
                {
                    version,
                    answers: [],
                    surveyIds: new Set(),
                    responseIds: new Set()
                }
            ])
        );

        const surveys = await Survey.find({
            "questions.sourceQuestionVersionId": {
                $in: versions.map((version) => version._id)
            }
        }).select("_id questions").lean();

        // 每份问卷使用独立的题目ID，通过来源字段映射到题库版本。
        const questionMaps = new Map();

        for (const survey of surveys) {
            const questionMap = new Map();

            for (const question of survey.questions) {
                const sourceId = String(
                    question.sourceQuestionVersionId || ""
                );

                if (!buckets.has(sourceId)) {
                    continue;
                }

                questionMap.set(String(question._id), sourceId);
                buckets.get(sourceId).surveyIds.add(String(survey._id));
            }

            questionMaps.set(String(survey._id), questionMap);
        }

        const responses = await Response.find({
            surveyId: { $in: surveys.map((survey) => survey._id) }
        }).select("_id surveyId answers").lean();

        const answeredResponseIds = new Set();

        for (const response of responses) {
            const questionMap = questionMaps.get(
                String(response.surveyId)
            );

            if (!questionMap) {
                continue;
            }

            for (const answer of response.answers) {
                const sourceId = questionMap.get(
                    String(answer.questionId)
                );

                if (!sourceId) {
                    continue;
                }

                const bucket = buckets.get(sourceId);
                bucket.answers.push(answer.value);
                bucket.responseIds.add(String(response._id));
                answeredResponseIds.add(String(response._id));
            }
        }

        const versionStatistics = [...buckets.values()].map(
            (bucket) => ({
                questionVersionId: bucket.version._id,
                version: bucket.version.version,
                totalSurveys: bucket.surveyIds.size,
                totalResponses: bucket.responseIds.size,
                statistics: summarizeQuestionAnswers(
                    bucket.version.content,
                    bucket.answers
                )
            })
        );

        return res.json({
            success: true,
            data: {
                familyId: source.familyId,
                scope,
                totalSurveys: surveys.length,
                totalSurveyResponses: responses.length,
                totalResponses: answeredResponseIds.size,
                versionStatistics
            }
        });
    } catch (error) {
        console.error("获取跨问卷统计失败：", error);

        return res.status(500).json({
            success: false,
            message: "获取跨问卷统计失败"
        });
    }
});

module.exports = router;