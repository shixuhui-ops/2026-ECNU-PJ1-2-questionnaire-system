function validateQuestion(question) {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
        return "题目必须是对象";
    }

    const types = ["single", "multiple", "text", "number"];

    if (!types.includes(question.type)) {
        return "题目类型无效";
    }

    if (
        typeof question.title !== "string" ||
        !question.title.trim() ||
        question.title.trim().length > 500
    ) {
        return "题目标题必须为1到500个字符";
    }

    if (
        question.description !== undefined &&
        (
            typeof question.description !== "string" ||
            question.description.length > 1000
        )
    ) {
        return "题目说明必须是字符串且不能超过1000个字符";
    }

    if (
        question.required !== undefined &&
        typeof question.required !== "boolean"
    ) {
        return "required 必须是布尔值";
    }

    const validation = question.validation ?? {};

    if (
        typeof validation !== "object" ||
        Array.isArray(validation)
    ) {
        return "校验规则必须是对象";
    }

    const integerFields = [
        "minSelections",
        "maxSelections",
        "exactSelections",
        "minLength",
        "maxLength"
    ];

    for (const field of integerFields) {
        const value = validation[field];

        if (
            value != null &&
            (!Number.isInteger(value) || value < 0)
        ) {
            return `${field} 必须是非负整数`;
        }
    }

    for (const field of ["minValue", "maxValue"]) {
        const value = validation[field];

        if (
            value != null &&
            (typeof value !== "number" || !Number.isFinite(value))
        ) {
            return `${field} 必须是有限数字`;
        }
    }

    if (
        validation.integerOnly !== undefined &&
        typeof validation.integerOnly !== "boolean"
    ) {
        return "integerOnly 必须是布尔值";
    }

    if (["single", "multiple"].includes(question.type)) {
        if (!Array.isArray(question.options) || question.options.length < 2) {
            return "单选题和多选题至少需要两个选项";
        }

        const values = new Set();

        for (const option of question.options) {
            if (
                !option ||
                typeof option.label !== "string" ||
                !option.label.trim() ||
                option.label.trim().length > 200
            ) {
                return "选项内容必须为1到200个字符";
            }

            if (
                typeof option.value !== "string" ||
                !option.value.trim() ||
                option.value.trim().length > 100
            ) {
                return "选项值必须为1到100个字符";
            }

            const value = option.value.trim();

            if (values.has(value)) {
                return "选项值不能重复";
            }

            values.add(value);
        }
    }

    if (question.type === "multiple") {
        const { minSelections, maxSelections, exactSelections } = validation;

        for (const field of ["minSelections", "maxSelections", "exactSelections"]) {
            if (
                validation[field] != null &&
                validation[field] > question.options.length
            ) {
                return `${field} 不能大于选项总数`;
            }
        }

        if (minSelections != null && maxSelections != null &&
            minSelections > maxSelections) {
            return "最少选择数不能大于最多选择数";
        }

        if (exactSelections != null && minSelections != null &&
            exactSelections < minSelections) {
            return "固定选择数不能小于最少选择数";
        }

        if (exactSelections != null && maxSelections != null &&
            exactSelections > maxSelections) {
            return "固定选择数不能大于最多选择数";
        }
    }

    if (
        question.type === "text" &&
        validation.minLength != null &&
        validation.maxLength != null &&
        validation.minLength > validation.maxLength
    ) {
        return "最小文本长度不能大于最大文本长度";
    }

    if (
        question.type === "number" &&
        validation.minValue != null &&
        validation.maxValue != null &&
        validation.minValue > validation.maxValue
    ) {
        return "最小值不能大于最大值";
    }

    return null;
}

module.exports = validateQuestion;