const mongoose = require("mongoose");
const Survey = require("./survey.model");

// 复用第一阶段题目的结构和字段约束。
// order 属于题目在某份问卷中的位置，不属于题库题目。
const contentSchema = Survey.schema.path("questions").schema.clone();

// 排除仅属于问卷内题目的位置和来源信息。
contentSchema.remove("order");
contentSchema.remove("sourceQuestionVersionId");

const questionVersionSchema = new mongoose.Schema(
    {
        familyId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            immutable: true
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            immutable: true,
            index: true
        },
        version: {
            type: Number,
            required: true,
            min: 1,
            immutable: true,
            validate: {
                validator: Number.isInteger,
                message: "版本号必须是整数"
            }
        },
        parentVersionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "QuestionVersion",
            default: null,
            immutable: true
        },
        restoredFromVersionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "QuestionVersion",
            default: null,
            immutable: true
        },
        content: {
            type: contentSchema,
            required: true,
            immutable: true
        },
        changeNote: {
            type: String,
            default: "",
            trim: true,
            maxlength: 1000,
            immutable: true
        },
        sharedWith: {
            type: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }],
            default: []
        }
    },
    {
        timestamps: true,
        collection: "question_versions"
    }
);

questionVersionSchema.index(
    { familyId: 1, version: 1 },
    { unique: true }
);

questionVersionSchema.index({ parentVersionId: 1 });
questionVersionSchema.index({ sharedWith: 1 });

module.exports = mongoose.model(
    "QuestionVersion",
    questionVersionSchema
);