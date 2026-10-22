const express = require("express");
const mongoose = require("mongoose");
const QuestionBank = require("../models/question-bank.model");
const QuestionVersion = require("../models/question-version.model");
const User = require("../models/user.model");
const requireAuth = require("../middleware/auth.middleware");

const router = express.Router();

router.use(requireAuth);

function accessibleBanks(userId) {
    return {
        $or: [
            { ownerId: userId },
            { sharedWith: userId }
        ]
    };
}

// 创建题库
router.post("/", async (req, res) => {
    try {
        const body = req.body || {};

        if (
            typeof body.name !== "string" ||
            !body.name.trim() ||
            body.name.trim().length > 200
        ) {
            return res.status(400).json({
                success: false,
                message: "题库名称必须为1到200个字符"
            });
        }

        if (
            body.description !== undefined &&
            (
                typeof body.description !== "string" ||
                body.description.length > 2000
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "题库说明必须是字符串且不能超过2000个字符"
            });
        }

        const bank = await QuestionBank.create({
            ownerId: req.user._id,
            name: body.name.trim(),
            description: (body.description || "").trim()
        });

        return res.status(201).json({
            success: true,
            data: bank
        });
    } catch (error) {
        console.error("创建题库失败：", error);

        return res.status(500).json({
            success: false,
            message: "创建题库失败"
        });
    }
});

// 列出自己创建的、以及共享给自己的题库
router.get("/", async (req, res) => {
    try {
        const banks = await QuestionBank.find(
            accessibleBanks(req.user._id)
        ).sort({ createdAt: -1 });

        return res.json({
            success: true,
            data: banks
        });
    } catch (error) {
        console.error("获取题库列表失败：", error);

        return res.status(500).json({
            success: false,
            message: "获取题库列表失败"
        });
    }
});

// 查看题库详情
router.get("/:id", async (req, res) => {
    try {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "题库ID无效"
            });
        }

        const bank = await QuestionBank.findOne({
            _id: req.params.id,
            ...accessibleBanks(req.user._id)
        });

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "题库不存在或无权访问"
            });
        }

        return res.json({
            success: true,
            data: bank
        });
    } catch (error) {
        console.error("获取题库详情失败：", error);

        return res.status(500).json({
            success: false,
            message: "获取题库详情失败"
        });
    }
});

// 将指定题目版本加入题库；重复添加不会产生重复记录。
router.post("/:id/questions", async (req, res) => {
    try {
        const bankId = req.params.id;
        const questionVersionId = req.body?.questionVersionId;

        if (
            !mongoose.isObjectIdOrHexString(bankId) ||
            !mongoose.isObjectIdOrHexString(questionVersionId)
        ) {
            return res.status(400).json({
                success: false,
                message: "题库ID或题目版本ID无效"
            });
        }

        const bank = await QuestionBank.findOne({
            _id: bankId,
            ownerId: req.user._id
        });

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "题库不存在或无权管理"
            });
        }

        const accessibleBankVersionIds = await QuestionBank.distinct(
            "questionVersionIds",
            accessibleBanks(req.user._id)
        );

        const questionVersion = await QuestionVersion.findOne({
            _id: questionVersionId,
            $or: [
                { ownerId: req.user._id },
                { sharedWith: req.user._id },
                { _id: { $in: accessibleBankVersionIds } }
            ]
        });

        if (!questionVersion) {
            return res.status(404).json({
                success: false,
                message: "题目版本不存在或无权使用"
            });
        }

        const updatedBank = await QuestionBank.findOneAndUpdate(
            {
                _id: bankId,
                ownerId: req.user._id
            },
            {
                $addToSet: {
                    questionVersionIds: questionVersion._id
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!updatedBank) {
            return res.status(404).json({
                success: false,
                message: "题库不存在或无权管理"
            });
        }

        return res.json({
            success: true,
            message: "题目版本已加入题库",
            data: updatedBank
        });
    } catch (error) {
        console.error("加入题库失败：", error);

        return res.status(500).json({
            success: false,
            message: "加入题库失败"
        });
    }
});

// 将整个题库共享给指定用户，包含题库内当前和后续加入的题目。
router.post("/:id/share", async (req, res) => {
    try {
        const bankId = req.params.id;
        const username = req.body?.username;

        if (!mongoose.isObjectIdOrHexString(bankId)) {
            return res.status(400).json({
                success: false,
                message: "题库ID无效"
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

        const bank = await QuestionBank.findOne({
            _id: bankId,
            ownerId: req.user._id
        }).select("_id");

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "题库不存在或无权共享"
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
                message: "无需将自己的题库共享给自己"
            });
        }

        const updated = await QuestionBank.findOneAndUpdate(
            {
                _id: bankId,
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
                message: "题库不存在或无权共享"
            });
        }

        return res.json({
            success: true,
            message: "题库共享成功",
            data: {
                bankId: updated._id,
                sharedWithUser: {
                    id: targetUser._id,
                    username: targetUser.username
                }
            }
        });
    } catch (error) {
        console.error("共享题库失败：", error);

        return res.status(500).json({
            success: false,
            message: "共享题库失败"
        });
    }
});

// 将题库中的旧版本替换为同一题目家族的另一个版本。
// 不修改任何问卷中已经保存的题目。
router.patch("/:id/questions/:versionId", async (req, res) => {
    try {
        const { id: bankId, versionId } = req.params;
        const newVersionId = req.body?.newVersionId;

        if (
            !mongoose.isObjectIdOrHexString(bankId) ||
            !mongoose.isObjectIdOrHexString(versionId) ||
            !mongoose.isObjectIdOrHexString(newVersionId)
        ) {
            return res.status(400).json({
                success: false,
                message: "题库ID或题目版本ID无效"
            });
        }

        if (versionId === newVersionId) {
            return res.status(400).json({
                success: false,
                message: "请选择不同的题目版本"
            });
        }

        const bank = await QuestionBank.findOne({
            _id: bankId,
            ownerId: req.user._id,
            questionVersionIds: versionId
        });

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "题库不存在、无权管理或题库中没有该版本"
            });
        }

        const oldVersion = await QuestionVersion.findById(versionId);

        if (!oldVersion) {
            return res.status(404).json({
                success: false,
                message: "原题目版本不存在"
            });
        }

        const accessibleBankVersionIds = await QuestionBank.distinct(
            "questionVersionIds",
            accessibleBanks(req.user._id)
        );

        const newVersion = await QuestionVersion.findOne({
            _id: newVersionId,
            familyId: oldVersion.familyId,
            $or: [
                { ownerId: req.user._id },
                { sharedWith: req.user._id },
                { _id: { $in: accessibleBankVersionIds } }
            ]
        });

        if (!newVersion) {
            return res.status(404).json({
                success: false,
                message: "目标版本不存在、不属于同一题目家族或无权使用"
            });
        }

        const updated = await QuestionBank.findOneAndUpdate(
            {
                _id: bankId,
                ownerId: req.user._id,
                questionVersionIds: {
                    $all: [oldVersion._id],
                    $ne: newVersion._id
                }
            },
            {
                $set: {
                    "questionVersionIds.$[entry]": newVersion._id
                }
            },
            {
                arrayFilters: [
                    { entry: oldVersion._id }
                ],
                new: true,
                runValidators: true
            }
        );

        if (!updated) {
            return res.status(409).json({
                success: false,
                message: "题库内容已变化或目标版本已在题库中，请刷新后重试"
            });
        }

        return res.json({
            success: true,
            message: "题库版本已更新，已选题的问卷保持不变",
            data: updated
        });
    } catch (error) {
        console.error("更新题库题目版本失败：", error);

        return res.status(500).json({
            success: false,
            message: "更新题库题目版本失败"
        });
    }
});

// 修改题库名称和说明，仅所有者可以操作。
router.patch("/:id", async (req, res) => {
    try {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "题库ID无效"
            });
        }

        const body = req.body || {};
        const updates = {};

        if (body.name !== undefined) {
            if (
                typeof body.name !== "string" ||
                !body.name.trim() ||
                body.name.trim().length > 200
            ) {
                return res.status(400).json({
                    success: false,
                    message: "题库名称必须为1到200个字符"
                });
            }

            updates.name = body.name.trim();
        }

        if (body.description !== undefined) {
            if (
                typeof body.description !== "string" ||
                body.description.length > 2000
            ) {
                return res.status(400).json({
                    success: false,
                    message: "题库说明必须是字符串且不能超过2000个字符"
                });
            }

            updates.description = body.description.trim();
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "请提供题库名称或说明"
            });
        }

        const bank = await QuestionBank.findOneAndUpdate(
            {
                _id: req.params.id,
                ownerId: req.user._id
            },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "题库不存在或无权管理"
            });
        }

        return res.json({
            success: true,
            message: "题库信息已更新",
            data: bank
        });
    } catch (error) {
        console.error("修改题库失败：", error);

        return res.status(500).json({
            success: false,
            message: "修改题库失败"
        });
    }
});

// 从题库移除题目引用，不删除题目版本或问卷内容。
router.delete("/:id/questions/:versionId", async (req, res) => {
    try {
        const { id: bankId, versionId } = req.params;

        if (
            !mongoose.isObjectIdOrHexString(bankId) ||
            !mongoose.isObjectIdOrHexString(versionId)
        ) {
            return res.status(400).json({
                success: false,
                message: "题库ID或题目版本ID无效"
            });
        }

        const bank = await QuestionBank.findOneAndUpdate(
            {
                _id: bankId,
                ownerId: req.user._id,
                questionVersionIds: versionId
            },
            {
                $pull: {
                    questionVersionIds: new mongoose.Types.ObjectId(versionId)
                }
            },
            { new: true, runValidators: true }
        );

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "题库不存在、无权管理或题库中没有该版本"
            });
        }

        return res.json({
            success: true,
            message: "题目已移出题库，历史版本和问卷保持不变",
            data: bank
        });
    } catch (error) {
        console.error("移出题库失败：", error);

        return res.status(500).json({
            success: false,
            message: "移出题库失败"
        });
    }
});

module.exports = router;