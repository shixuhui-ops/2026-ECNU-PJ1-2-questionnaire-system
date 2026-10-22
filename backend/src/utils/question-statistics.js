function summarizeQuestionAnswers(question, answers) {
    const result = {
        title: question.title,
        type: question.type,
        totalAnswers: answers.length
    };

    if (question.type === "single") {
        result.options = question.options.map((option) => ({
            value: option.value,
            label: option.label,
            count: answers.filter(
                (answer) => answer === option.value
            ).length
        }));

        return result;
    }

    if (question.type === "multiple") {
        result.options = question.options.map((option) => ({
            value: option.value,
            label: option.label,
            count: answers.filter(
                (answer) =>
                    Array.isArray(answer) &&
                    answer.includes(option.value)
            ).length
        }));

        return result;
    }

    if (question.type === "number") {
        const numbers = answers
            .filter(
                (answer) =>
                    typeof answer === "number" ||
                    (
                        typeof answer === "string" &&
                        answer.trim() !== ""
                    )
            )
            .map(Number)
            .filter(Number.isFinite);

        const counts = new Map();

        for (const number of numbers) {
            counts.set(number, (counts.get(number) || 0) + 1);
        }

        result.totalAnswers = numbers.length;
        result.values = numbers;
        result.average = numbers.length
            ? numbers.reduce((sum, value) => sum + value, 0) /
            numbers.length
            : null;
        result.min = null;
        result.max = null;

        for (const number of numbers) {
            result.min = result.min === null
                ? number
                : Math.min(result.min, number);
            result.max = result.max === null
                ? number
                : Math.max(result.max, number);
        }

        result.distribution = [...counts.entries()]
            .sort((left, right) => left[0] - right[0])
            .map(([value, count]) => ({ value, count }));

        return result;
    }

    result.values = answers;
    return result;
}

module.exports = summarizeQuestionAnswers;