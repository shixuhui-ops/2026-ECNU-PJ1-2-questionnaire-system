const mongoose = require("mongoose");

const questionBankSchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            immutable: true,
            index: true
        },
        name: {
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
        sharedWith: {
            type: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }],
            default: []
        },
        questionVersionIds: {
            type: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "QuestionVersion"
            }],
            default: []
        }
    },
    {
        timestamps: true,
        collection: "question_banks"
    }
);

questionBankSchema.index({ sharedWith: 1 });

module.exports = mongoose.model("QuestionBank", questionBankSchema);