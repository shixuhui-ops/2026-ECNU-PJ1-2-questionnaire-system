const express = require("express");
const crypto = require("crypto");
const Survey = require("../models/survey.model");
const requireAuth = require("../middleware/auth.middleware");
const validateQuestion = require("../utils/question-validation");

const router = express.Router();

function createAccessCode() {
    return crypto.randomBytes(6).toString("hex");
}

function isOwner(survey, userId) {
    return survey.ownerId.toString() === userId.toString();
}

router.post("/", requireAuth, async (req, res) => {
    try {
        const body = req.body || {};
        const title = String(body.title || "").trim();

        if (!title) {
            return res.status(400).json({
                success: false,
                message: "问卷标题不能为空"
            });
        }
        if (
            body.allowAnonymous !== undefined &&
            typeof body.allowAnonymous !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "allowAnonymous 必须是布尔值"
            });
        }
        if (
            body.allowMultipleSubmissions !== undefined &&
            typeof body.allowMultipleSubmissions !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "allowMultipleSubmissions 必须是布尔值"
            });
        }
        let deadline = null;

        if (body.deadline !== undefined && body.deadline !== null && body.deadline !== "") {
            deadline = new Date(body.deadline);

            if (Number.isNaN(deadline.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "截止时间格式无效"
                });
            }
        }
        const survey = await Survey.create({
            ownerId: req.user._id,
            title,
            description: String(body.description || "").trim(),
            allowAnonymous: body.allowAnonymous === true,
            allowMultipleSubmissions:
                body.allowMultipleSubmissions !== false,
            deadline,
            accessCode: createAccessCode()
        });

        res.status(201).json({
            success: true,
            data: survey
        });
    } catch (error) {
        console.error("创建问卷失败：", error);

        res.status(500).json({
            success: false,
            message: "创建问卷失败"
        });
    }
});

router.get("/mine", requireAuth, async (req, res) => {
    try {
        const surveys = await Survey.find({ ownerId: req.user._id })
            .sort({ createdAt: -1 })
            .select("-__v");

        res.json({
            success: true,
            data: surveys
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "获取问卷列表失败"
        });
    }
});

router.get("/public/:accessCode", async (req, res) => {
    try {
        const survey = await Survey.findOne({
            accessCode: req.params.accessCode,
            status: "published"
        }).select("-ownerId -__v");

        if (!survey) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在或未发布"
            });
        }

        if (survey.deadline && new Date() > survey.deadline) {
            return res.status(400).json({
                success: false,
                message: "问卷已超过截止时间"
            });
        }

        res.json({
            success: true,
            data: survey
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "获取问卷失败"
        });
    }
});

router.get("/:id", requireAuth, async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (!survey || !isOwner(survey, req.user._id)) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在"
            });
        }

        res.json({
            success: true,
            data: survey
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "问卷ID无效"
        });
    }
});

router.patch("/:id", requireAuth, async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (!survey || !isOwner(survey, req.user._id)) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在"
            });
        }

        if (survey.status === "closed") {
            return res.status(400).json({
                success: false,
                message: "已关闭的问卷不能修改"
            });
        }

        const allowedFields = [
            "title",
            "description",
            "allowAnonymous",
            "allowMultipleSubmissions",
            "deadline"
        ];

        for (const field of allowedFields) {
            if (req.body[field] === undefined) {
                continue;
            }
            if (
                field === "allowAnonymous" ||
                field === "allowMultipleSubmissions"
            ) {
                if (typeof req.body[field] !== "boolean") {
                    return res.status(400).json({
                        success: false,
                        message: `${field} 必须是布尔值`
                    });
                }

                survey[field] = req.body[field];
                continue;
            }
            if (field === "deadline") {
                if (req.body.deadline === null || req.body.deadline === "") {
                    survey.deadline = null;
                    continue;
                }

                const deadline = new Date(req.body.deadline);

                if (Number.isNaN(deadline.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "截止时间格式无效"
                    });
                }

                survey.deadline = deadline;
                continue;
            }

            survey[field] = req.body[field];
        }

        await survey.save();

        res.json({
            success: true,
            data: survey
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "修改问卷失败"
        });
    }
});

router.post("/:id/questions", requireAuth, async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (!survey || !isOwner(survey, req.user._id)) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在"
            });
        }

        if (survey.status !== "draft") {
            return res.status(400).json({
                success: false,
                message: "只有草稿状态的问卷可以添加题目"
            });
        }

        const validationError = validateQuestion(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const question = {
            type: req.body.type,
            title: String(req.body.title).trim(),
            description: String(req.body.description || "").trim(),
            required: Boolean(req.body.required),
            order: survey.questions.length,
            options: req.body.options || [],
            validation: req.body.validation || {}
        };

        survey.questions.push(question);
        await survey.save();

        res.status(201).json({
            success: true,
            data: survey.questions[survey.questions.length - 1]
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "添加题目失败"
        });
    }
});

router.post("/:id/jump-rules", requireAuth, async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (!survey || !isOwner(survey, req.user._id)) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在"
            });
        }
        if (survey.status !== "draft") {
            return res.status(400).json({
                success: false,
                message: "只有草稿状态的问卷可以添加跳转规则"
            });
        }

        const questionIds = survey.questions.map((question) => question._id.toString());
        const { sourceQuestionId, targetQuestionId, operator, expectedValue } = req.body;

        if (
            !questionIds.includes(String(sourceQuestionId)) ||
            !questionIds.includes(String(targetQuestionId))
        ) {
            return res.status(400).json({
                success: false,
                message: "跳转规则中的题目不存在"
            });
        }

        if (String(sourceQuestionId) === String(targetQuestionId)) {
            return res.status(400).json({
                success: false,
                message: "跳转目标不能是当前题目"
            });
        }

        const sourceQuestion = survey.questions.find(
            (question) => String(question._id) === String(sourceQuestionId)
        );

        const targetQuestion = survey.questions.find(
            (question) => String(question._id) === String(targetQuestionId)
        );

        if (targetQuestion.order <= sourceQuestion.order) {
            return res.status(400).json({
                success: false,
                message: "跳转目标必须位于源题目之后"
            });
        }

        const numericOperators = [
            "greaterThan",
            "lessThan",
            "greaterOrEqual",
            "lessOrEqual"
        ];

        if (operator === "contains" && sourceQuestion.type !== "multiple") {
            return res.status(400).json({
                success: false,
                message: "只有多选题支持包含条件"
            });
        }

        if (numericOperators.includes(operator) && sourceQuestion.type !== "number") {
            return res.status(400).json({
                success: false,
                message: "只有数字题支持数值比较条件"
            });
        }
        const duplicateRule = survey.jumpRules.some(
            (rule) =>
                String(rule.sourceQuestionId) === String(sourceQuestionId) &&
                String(rule.targetQuestionId) === String(targetQuestionId) &&
                rule.operator === operator &&
                String(rule.expectedValue) === String(expectedValue)
        );

        if (duplicateRule) {
            return res.status(409).json({
                success: false,
                message: "跳转规则已经存在"
            });
        }
        survey.jumpRules.push({
            sourceQuestionId,
            targetQuestionId,
            operator,
            expectedValue
        });

        await survey.save();

        res.status(201).json({
            success: true,
            data: survey.jumpRules[survey.jumpRules.length - 1]
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "添加跳转规则失败"
        });
    }
});

router.post("/:id/publish", requireAuth, async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (!survey || !isOwner(survey, req.user._id)) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在"
            });
        }
        if (survey.status === "closed") {
            return res.status(400).json({
                success: false,
                message: "已关闭的问卷不能重新发布"
            });
        }

        if (survey.questions.length === 0) {
            return res.status(400).json({
                success: false,
                message: "问卷至少需要一道题目"
            });
        }
        if (survey.deadline && new Date(survey.deadline) <= new Date()) {
            return res.status(400).json({
                success: false,
                message: "截止时间必须晚于当前时间"
            });
        }
        survey.status = "published";
        await survey.save();

        res.json({
            success: true,
            message: "问卷发布成功",
            data: {
                accessUrl: `/survey/${survey.accessCode}`,
                survey
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "发布问卷失败"
        });
    }
});

router.post("/:id/close", requireAuth, async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (!survey || !isOwner(survey, req.user._id)) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在"
            });
        }

        survey.status = "closed";
        await survey.save();

        res.json({
            success: true,
            message: "问卷已关闭",
            data: survey
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "关闭问卷失败"
        });
    }
});

router.post("/public/:accessCode/next-question", async (req, res) => {
    try {
        const survey = await Survey.findOne({
            accessCode: req.params.accessCode,
            status: "published"
        });

        if (!survey) {
            return res.status(404).json({
                success: false,
                message: "问卷不存在或未发布"
            });
        }
        if (survey.deadline && new Date() > survey.deadline) {
            return res.status(400).json({
                success: false,
                message: "问卷已超过截止时间"
            });
        }
        const answers = new Map(
            (Array.isArray(req.body.answers) ? req.body.answers : []).map(
                (answer) => [String(answer.questionId), answer.value]
            )
        );

        let currentQuestionId = req.body.currentQuestionId || null;
        let targetQuestionId = null;

        if (currentQuestionId) {
            const rule = survey.jumpRules.find((item) => {
                if (String(item.sourceQuestionId) !== String(currentQuestionId)) {
                    return false;
                }

                return compareJumpValue(
                    answers.get(String(currentQuestionId)),
                    item.operator,
                    item.expectedValue
                );
            });

            if (rule) {
                targetQuestionId = String(rule.targetQuestionId);
            }
        }

        const questions = [...survey.questions].sort((a, b) => a.order - b.order);
        let nextQuestion = null;

        if (targetQuestionId) {
            nextQuestion = questions.find(
                (question) => String(question._id) === targetQuestionId
            );
        } else {
            const currentIndex = questions.findIndex(
                (question) => String(question._id) === String(currentQuestionId)
            );

            nextQuestion = questions[currentIndex + 1] || null;
        }

        res.json({
            success: true,
            data: {
                completed: !nextQuestion,
                question: nextQuestion
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "计算下一道题失败"
        });
    }
});

function compareJumpValue(answer, operator, expectedValue) {
    if (operator === "contains") {
        return Array.isArray(answer) && answer.includes(expectedValue);
    }

    if (operator === "equals") {
        return String(answer) === String(expectedValue);
    }

    const left = Number(answer);
    const right = Number(expectedValue);

    if (Number.isNaN(left) || Number.isNaN(right)) {
        return false;
    }

    if (operator === "greaterThan") return left > right;
    if (operator === "lessThan") return left < right;
    if (operator === "greaterOrEqual") return left >= right;
    if (operator === "lessOrEqual") return left <= right;

    return false;
}

module.exports = router;