const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        value: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        }
    },
    { _id: true }
);

const validationSchema = new mongoose.Schema(
    {
        minSelections: {
            type: Number,
            min: 0
        },
        maxSelections: {
            type: Number,
            min: 0
        },
        exactSelections: {
            type: Number,
            min: 0
        },
        minLength: {
            type: Number,
            min: 0
        },
        maxLength: {
            type: Number,
            min: 0
        },
        minValue: Number,
        maxValue: Number,
        integerOnly: Boolean
    },
    { _id: false }
);

const questionSchema = new mongoose.Schema(
    {
        sourceQuestionVersionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "QuestionVersion",
            default: null
        },
        type: {
            type: String,
            enum: ["single", "multiple", "text", "number"],
            required: true
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500
        },
        description: {
            type: String,
            trim: true,
            maxlength: 1000
        },
        required: {
            type: Boolean,
            default: false
        },
        order: {
            type: Number,
            required: true,
            min: 0
        },
        options: {
            type: [optionSchema],
            default: []
        },
        validation: {
            type: validationSchema,
            default: {}
        }
    },
    { _id: true }
);

const jumpRuleSchema = new mongoose.Schema(
    {
        sourceQuestionId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        operator: {
            type: String,
            enum: ["equals", "contains", "greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"],
            required: true
        },
        expectedValue: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        },
        targetQuestionId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        }
    },
    { _id: true }
);

const surveySchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        description: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2000
        },
        accessCode: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        allowAnonymous: {
            type: Boolean,
            default: false
        },
        allowMultipleSubmissions: {
            type: Boolean,
            default: true
        },
        status: {
            type: String,
            enum: ["draft", "published", "closed"],
            default: "draft",
            index: true
        },
        deadline: {
            type: Date,
            default: null
        },
        questions: {
            type: [questionSchema],
            default: []
        },
        jumpRules: {
            type: [jumpRuleSchema],
            default: []
        }
    },
    {
        timestamps: true,
        collection: "surveys"
    }
);

module.exports = mongoose.model("Survey", surveySchema);