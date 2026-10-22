"use strict";

const apiHost = window.location.hostname || "localhost";
const apiBase = `http://${apiHost}:3000/api`;
const token = localStorage.getItem("questionnaire_token") || "";

const messageElement = document.querySelector("#message");
const workspace = document.querySelector("#workspace");
const loginNotice = document.querySelector("#loginNotice");
const bankList = document.querySelector("#bankList");
const createBankForm = document.querySelector("#createBankForm");
const refreshBanksButton = document.querySelector("#refreshBanksButton");

let accessibleBanks = [];
let accessibleVersions = [];
let selectedBank = null;

function parseJwtPayload(jwt) {
    try {
        const payload = jwt.split(".")[1];
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(normalized));
    } catch {
        return {};
    }
}

function showMessage(message, isError = false) {
    messageElement.textContent = message;
    messageElement.className = isError ? "error" : "success";
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        workspace.hidden = true;
        loginNotice.hidden = false;
        throw new Error("登录已失效，请返回首页重新登录。");
    }

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error(`服务器返回了无法解析的数据（${response.status}）。`);
    }

    if (!response.ok || result.success === false) {
        throw new Error(result.message || `请求失败（${response.status}）。`);
    }

    return result.data;
}

function appendCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = String(value ?? "");
    row.appendChild(cell);
    return cell;
}

function createButton(text, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;

    button.addEventListener("click", async () => {
        button.disabled = true;

        try {
            await handler();
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    return button;
}

function renderBankList() {
    bankList.replaceChildren();

    if (accessibleBanks.length === 0) {
        const row = document.createElement("tr");
        const cell = appendCell(row, "暂无可访问的题库。");
        cell.colSpan = 4;
        bankList.appendChild(row);
        return;
    }

    for (const bank of accessibleBanks) {
        const row = document.createElement("tr");

        appendCell(row, bank.name);
        appendCell(row, bank.description || "暂无说明");
        appendCell(row, bank.questionVersionIds.length);

        const actions = document.createElement("td");
        actions.appendChild(
            createButton("查看题库", () => selectBank(bank._id))
        );
        row.appendChild(actions);
        bankList.appendChild(row);
    }
}

function renderBankDetail() {
    const section = document.querySelector("#bankDetailSection");
    section.hidden = !selectedBank;

    if (!selectedBank) {
        return;
    }

    document.querySelector("#selectedBankTitle").textContent =
        selectedBank.name;
    document.querySelector("#selectedBankDescription").textContent =
        selectedBank.description || "暂无说明";
    const actions = document.querySelector("#bankActions");
    actions.replaceChildren();

    const shareForm = document.createElement("form");
    shareForm.innerHTML = `
        <h3>共享整个题库</h3>
        <label>
            接收者用户名
            <input id="bankShareUsername"
                   minlength="3"
                   maxlength="30"
                   required>
        </label>
        <button type="submit">共享题库</button>
    `;

    shareForm.addEventListener("submit", async event => {
        event.preventDefault();

        const username = shareForm.querySelector(
            "#bankShareUsername"
        ).value.trim();

        try {
            await apiRequest(
                `/question-banks/${encodeURIComponent(selectedBank._id)}/share`,
                {
                    method: "POST",
                    body: JSON.stringify({ username })
                }
            );

            shareForm.reset();
            showMessage(`题库已共享给用户“${username}”。`);
        } catch (error) {
            showMessage(`共享题库失败：${error.message}`, true);
        }
    });

    actions.appendChild(shareForm);
    const container = document.querySelector("#bankQuestions");
    container.replaceChildren();

    const versionIds = selectedBank.questionVersionIds.map(String);
    const versionsById = new Map(
        accessibleVersions.map(version => [String(version._id), version])
    );

    if (versionIds.length === 0) {
        const paragraph = document.createElement("p");
        paragraph.textContent = "这个题库暂时没有题目。";
        container.appendChild(paragraph);
        return;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");

    for (const title of ["题目标题", "题型", "版本"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = title;
        headRow.appendChild(cell);
    }

    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    const typeNames = {
        single: "单选题",
        multiple: "多选题",
        text: "文本题",
        number: "数字题"
    };

    for (const versionId of versionIds) {
        const row = document.createElement("tr");
        const version = versionsById.get(versionId);

        if (version) {
            appendCell(row, version.content.title);
            appendCell(
                row,
                typeNames[version.content.type] || version.content.type
            );
            appendCell(row, `v${version.version}`);

            const actionCell = document.createElement("td");

            const familyVersions = accessibleVersions.filter(
                candidate =>
                    String(candidate.familyId) === String(version.familyId)
                    && String(candidate._id) !== String(version._id)
            );

            if (
                String(selectedBank.ownerId) ===
                String(parseJwtPayload(token).userId)
                && familyVersions.length > 0
            ) {
                const replaceButton = createButton("替换为新版本", async () => {
                    const newest = familyVersions
                        .slice()
                        .sort((a, b) => b.version - a.version)[0];

                    await apiRequest(
                        `/question-banks/${encodeURIComponent(
                            selectedBank._id
                        )}/questions/${encodeURIComponent(version._id)}`,
                        {
                            method: "PATCH",
                            body: JSON.stringify({
                                newVersionId: newest._id
                            })
                        }
                    );

                    await loadBanksAndVersions();
                    showMessage(
                        `已将 v${version.version} 替换为 v${newest.version}。`
                    );
                });

                actionCell.appendChild(replaceButton);
            }

            const removeButton = createButton("移除", async () => {
                await apiRequest(
                    `/question-banks/${encodeURIComponent(
                        selectedBank._id
                    )}/questions/${encodeURIComponent(version._id)}`,
                    { method: "DELETE" }
                );

                await loadBanksAndVersions();
                showMessage(`已从题库移除 v${version.version}。`);
            });

            actionCell.appendChild(removeButton);
            row.appendChild(actionCell);
        } else {
            const cell = appendCell(
                row,
                "该题目暂不可访问，请刷新列表后重试。"
            );
            cell.colSpan = 4;
        }

        body.appendChild(row);
    }

    table.appendChild(body);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
}

async function selectBank(bankId) {
    const bank = await apiRequest(
        `/question-banks/${encodeURIComponent(bankId)}`
    );

    selectedBank = bank;
    renderBankDetail();
    renderQuestionList();
    showMessage(`已打开题库：${bank.name}`);
}

function showVersionDetail(version) {
    const section = document.querySelector("#versionDetailSection");
    const container = document.querySelector("#versionDetail");

    section.hidden = false;
    container.replaceChildren();

    const title = document.createElement("h3");
    title.textContent =
        `${version.content.title}（v${version.version}）`;
    container.appendChild(title);

    const info = document.createElement("p");
    info.textContent =
        `题型：${version.content.type}；题目族：${version.familyId}`;
    container.appendChild(info);
    const historyButton = createButton("查看版本历史", async () => {
        const history = await apiRequest(
            `/question-versions/${encodeURIComponent(version._id)}/history`
        );

        const historyList = document.createElement("div");
        const heading = document.createElement("h4");
        heading.textContent = "版本历史";
        historyList.appendChild(heading);

        for (const item of history.versions) {
            const row = document.createElement("p");
            row.textContent =
                `v${item.version}：${item.content.title}` +
                (item.changeNote ? `（${item.changeNote}）` : "");

            if (
                item._id !== version._id &&
                item.version < version.version &&
                item.ownerId === version.ownerId
            ) {
                const restoreButton = createButton("恢复此版本", async () => {
                    await apiRequest(
                        `/question-versions/${encodeURIComponent(version._id)}/restore`,
                        {
                            method: "POST",
                            body: JSON.stringify({
                                targetVersionId: item._id,
                                changeNote: `从 v${item.version} 恢复`
                            })
                        }
                    );

                    await loadBanksAndVersions();
                    showMessage(`已根据 v${item.version} 创建恢复版本。`);
                });

                row.appendChild(document.createTextNode(" "));
                row.appendChild(restoreButton);
            }

            historyList.appendChild(row);
        }

        container.appendChild(historyList);
        historyButton.disabled = true;
    });

    container.appendChild(historyButton);

    const usageButton = createButton("查看使用情况", async () => {
        const result = await apiRequest(
            `/question-versions/${encodeURIComponent(version._id)}/usages`
        );

        const usageBox = document.createElement("pre");
        usageBox.textContent = JSON.stringify(result, null, 2);
        usageBox.style.whiteSpace = "pre-wrap";
        usageBox.style.background = "#f5f7fb";
        usageBox.style.padding = "12px";
        usageBox.style.overflowX = "auto";

        container.appendChild(usageBox);
        usageButton.disabled = true;
    });

    const statisticsButton = createButton("查看跨问卷统计", async () => {
        const result = await apiRequest(
            `/question-versions/${encodeURIComponent(
                version._id
            )}/statistics?scope=family`
        );

        const statisticsBox = document.createElement("pre");
        statisticsBox.textContent = JSON.stringify(result, null, 2);
        statisticsBox.style.whiteSpace = "pre-wrap";
        statisticsBox.style.background = "#f5f7fb";
        statisticsBox.style.padding = "12px";
        statisticsBox.style.overflowX = "auto";

        container.appendChild(statisticsBox);
        statisticsButton.disabled = true;
    });

    container.appendChild(usageButton);
    container.appendChild(statisticsButton);

    const shareForm = document.createElement("form");
    shareForm.innerHTML = `
        <h4>共享此题目版本</h4>
        <label>
            接收者用户名
            <input id="shareUsername" minlength="3" maxlength="30" required>
        </label>
        <button type="submit">共享题目</button>
    `;

    shareForm.addEventListener("submit", async event => {
        event.preventDefault();

        const username = shareForm.querySelector(
            "#shareUsername"
        ).value.trim();

        try {
            await apiRequest(
                `/question-versions/${encodeURIComponent(version._id)}/share`,
                {
                    method: "POST",
                    body: JSON.stringify({ username })
                }
            );

            shareForm.reset();
            showMessage(`题目版本已共享给用户“${username}”。`);
        } catch (error) {
            showMessage(`共享失败：${error.message}`, true);
        }
    });

    container.appendChild(shareForm);
    const useForm = document.createElement("form");
    useForm.innerHTML = `
        <h4>选入草稿问卷</h4>
        <label>
            问卷 ID
            <input id="useSurveyId"
                   value="6ad9d7505334ffe65a40d4c0"
                   required>
        </label>
        <button type="submit">加入问卷</button>
    `;

    useForm.addEventListener("submit", async event => {
        event.preventDefault();

        const surveyId = useForm.querySelector(
            "#useSurveyId"
        ).value.trim();

        try {
            const result = await apiRequest(
                `/question-versions/${encodeURIComponent(version._id)}/use`,
                {
                    method: "POST",
                    body: JSON.stringify({ surveyId })
                }
            );

            const addedQuestionId =
                result?._id ||
                result?.question?._id ||
                result?.questionId ||
                "已生成题目快照";

            showMessage(
                `题目已加入问卷，题目 ID：${addedQuestionId}`
            );
        } catch (error) {
            showMessage(`加入问卷失败：${error.message}`, true);
        }
    });

    container.appendChild(useForm);

    const form = document.createElement("form");
    form.innerHTML = `
        <label>
            新版本内容 JSON
            <textarea id="versionContentJson" rows="12"
                style="font-family: monospace;"></textarea>
        </label>
        <label>
            修改说明
            <input id="versionChangeNote" maxlength="1000">
        </label>
        <button type="submit">创建新版本</button>
    `;

    const jsonInput = form.querySelector("#versionContentJson");
    jsonInput.value = JSON.stringify(version.content, null, 2);

    form.addEventListener("submit", async event => {
        event.preventDefault();

        try {
            const content = JSON.parse(jsonInput.value);
            const changeNote = form.querySelector(
                "#versionChangeNote"
            ).value.trim();

            await apiRequest(
                `/question-versions/${encodeURIComponent(version._id)}/versions`,
                {
                    method: "POST",
                    body: JSON.stringify({ content, changeNote })
                }
            );

            await loadBanksAndVersions();
            section.hidden = true;
            showMessage("新题目版本创建成功。");
        } catch (error) {
            showMessage(`版本创建失败：${error.message}`, true);
        }
    });

    container.appendChild(form);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderQuestionList() {
    const container = document.querySelector("#questionList");
    container.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = "可访问的题目版本";
    container.appendChild(title);

    if (accessibleVersions.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "暂无可访问的题目版本。";
        container.appendChild(empty);
        return;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");

    for (const text of ["题目标题", "题型", "版本", "操作"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = text;
        headRow.appendChild(cell);
    }

    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    const typeNames = {
        single: "单选题",
        multiple: "多选题",
        text: "文本题",
        number: "数字题"
    };

    for (const version of accessibleVersions) {
        const row = document.createElement("tr");

        appendCell(row, version.content.title);
        appendCell(row, typeNames[version.content.type] || version.content.type);
        appendCell(row, `v${version.version}`);

        const actionCell = document.createElement("td");
        const detailButton = createButton("管理版本", () => {
            showVersionDetail(version);
        });
        actionCell.appendChild(detailButton);
        const addButton = createButton("加入当前题库", async () => {
            if (!selectedBank) {
                throw new Error("请先点击某个题库的“查看题库”。");
            }

            await apiRequest(
                `/question-banks/${encodeURIComponent(selectedBank._id)}/questions`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        questionVersionId: version._id
                    })
                }
            );

            await loadBanksAndVersions();
            showMessage(`题目“${version.content.title}”已加入当前题库。`);
        });

        if (!selectedBank) {
            addButton.disabled = true;
            addButton.title = "请先选择题库";
        }

        actionCell.appendChild(addButton);
        row.appendChild(actionCell);
        body.appendChild(row);
    }

    table.appendChild(body);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
}

async function loadBanksAndVersions() {
    const [banks, versions] = await Promise.all([
        apiRequest("/question-banks"),
        apiRequest("/question-versions")
    ]);

    accessibleBanks = banks;
    accessibleVersions = versions;

    if (selectedBank) {
        selectedBank = accessibleBanks.find(
            bank => bank._id === selectedBank._id
        ) || null;
    }

    renderBankList();
    renderBankDetail();
    renderQuestionList();
}

createBankForm.addEventListener("submit", async event => {
    event.preventDefault();

    const nameInput = document.querySelector("#bankName");
    const descriptionInput = document.querySelector("#bankDescription");
    const name = nameInput.value.trim();

    if (!name) {
        showMessage("请输入题库名称。", true);
        nameInput.focus();
        return;
    }

    const submitButton = createBankForm.querySelector(
        'button[type="submit"]'
    );
    submitButton.disabled = true;

    try {
        const bank = await apiRequest("/question-banks", {
            method: "POST",
            body: JSON.stringify({
                name,
                description: descriptionInput.value.trim()
            })
        });

        createBankForm.reset();
        selectedBank = bank;
        await loadBanksAndVersions();
        showMessage("题库创建成功。");
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        submitButton.disabled = false;
    }
});

refreshBanksButton.addEventListener("click", async () => {
    refreshBanksButton.disabled = true;

    try {
        await loadBanksAndVersions();
        showMessage("列表已刷新。");
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        refreshBanksButton.disabled = false;
    }
});

async function initializePage() {
    workspace.hidden = !token;
    loginNotice.hidden = Boolean(token);

    if (!token) {
        return;
    }

    try {
        await loadBanksAndVersions();
        showMessage("题库列表已加载。");
    } catch (error) {
        showMessage(error.message, true);
    }
}

function setupQuestionEditor() {
    const container = document.querySelector("#questionEditor");

    // 此处只包含固定页面结构；用户输入通过表单读取。
    container.innerHTML = `
        <h3>创建独立题目</h3>
        <form id="createQuestionForm">
            <label>
                题目标题
                <input id="questionTitle" maxlength="500" required>
            </label>
            <label>
                题目说明
                <textarea id="questionDescription"
                          maxlength="1000" rows="2"></textarea>
            </label>
            <label>
                题型
                <select id="questionType">
                    <option value="single">单选题</option>
                    <option value="multiple">多选题</option>
                    <option value="text">文本题</option>
                    <option value="number">数字题</option>
                </select>
            </label>
            <label>
                是否必答
                <select id="questionRequired">
                    <option value="true">必答</option>
                    <option value="false">选答</option>
                </select>
            </label>

            <div id="choiceFields">
                <label>
                    选项：每行一个，格式为“显示文字|选项值”
                    <textarea id="questionOptions" rows="4"
                        placeholder="满意|satisfied&#10;一般|neutral"></textarea>
                </label>
                <p class="muted">
                    至少两个选项，选项值不能重复。
                </p>
            </div>

            <div id="multipleFields" hidden>
                <label>
                    最少选择数量（可留空）
                    <input id="minSelections" type="number" min="0" step="1">
                </label>
                <label>
                    最多选择数量（可留空）
                    <input id="maxSelections" type="number" min="0" step="1">
                </label>
                <label>
                    必须选择数量（可留空）
                    <input id="exactSelections" type="number" min="0" step="1">
                </label>
            </div>

            <div id="textFields" hidden>
                <label>
                    最短文本长度（可留空）
                    <input id="minLength" type="number" min="0" step="1">
                </label>
                <label>
                    最长文本长度（可留空）
                    <input id="maxLength" type="number" min="0" step="1">
                </label>
            </div>

            <div id="numberFields" hidden>
                <label>
                    数字最小值（可留空）
                    <input id="minValue" type="number" step="any">
                </label>
                <label>
                    数字最大值（可留空）
                    <input id="maxValue" type="number" step="any">
                </label>
                <label>
                    是否只允许整数
                    <select id="integerOnly">
                        <option value="false">允许小数</option>
                        <option value="true">只允许整数</option>
                    </select>
                </label>
            </div>

            <button type="submit">保存为新题目 v1</button>
        </form>
    `;

    const form = document.querySelector("#createQuestionForm");
    const typeSelect = document.querySelector("#questionType");

    function updateTypeFields() {
        const type = typeSelect.value;
        const groups = {
            choiceFields: type === "single" || type === "multiple",
            multipleFields: type === "multiple",
            textFields: type === "text",
            numberFields: type === "number"
        };

        for (const [id, visible] of Object.entries(groups)) {
            const group = document.getElementById(id);
            group.hidden = !visible;

            // 隐藏题型的字段不参与浏览器表单校验。
            for (const input of group.querySelectorAll(
                "input, textarea, select"
            )) {
                input.disabled = !visible;
            }
        }
    }

    function readContent() {
        const type = typeSelect.value;
        const title = document.querySelector("#questionTitle").value.trim();

        if (!title) {
            throw new Error("题目标题不能为空。");
        }

        const content = {
            type,
            title,
            description: document.querySelector(
                "#questionDescription"
            ).value.trim(),
            required: document.querySelector(
                "#questionRequired"
            ).value === "true",
            validation: {}
        };

        if (type === "single" || type === "multiple") {
            const lines = document.querySelector("#questionOptions")
                .value.split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean);

            content.options = lines.map((line, index) => {
                const parts = line.split("|");

                if (
                    parts.length !== 2 ||
                    !parts[0].trim() ||
                    !parts[1].trim()
                ) {
                    throw new Error(
                        `第 ${index + 1} 行选项格式错误，请使用“显示文字|选项值”。`
                    );
                }

                return {
                    label: parts[0].trim(),
                    value: parts[1].trim()
                };
            });

            if (content.options.length < 2) {
                throw new Error("请至少填写两个选项。");
            }

            const values = content.options.map(option => option.value);

            if (new Set(values).size !== values.length) {
                throw new Error("选项值不能重复。");
            }
        }

        const fieldsByType = {
            single: [],
            multiple: [
                "minSelections", "maxSelections", "exactSelections"
            ],
            text: ["minLength", "maxLength"],
            number: ["minValue", "maxValue"]
        };

        for (const field of fieldsByType[type]) {
            const rawValue = document.getElementById(field).value.trim();

            if (rawValue !== "") {
                const value = Number(rawValue);

                if (!Number.isFinite(value)) {
                    throw new Error("校验规则中的数字必须是有限数值。");
                }

                content.validation[field] = value;
            }
        }

        if (type === "number") {
            content.validation.integerOnly =
                document.querySelector("#integerOnly").value === "true";
        }

        return content;
    }

    typeSelect.addEventListener("change", updateTypeFields);

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        let created = false;

        try {
            const content = readContent();

            await apiRequest("/question-versions", {
                method: "POST",
                body: JSON.stringify({ content })
            });

            created = true;
            form.reset();
            updateTypeFields();

            await loadBanksAndVersions();
            showMessage(`独立题目“${content.title}”创建成功，版本为 v1。`);
        } catch (error) {
            showMessage(
                created
                    ? `题目已创建，但列表刷新失败：${error.message} 请点击刷新列表。`
                    : error.message,
                true
            );
        } finally {
            button.disabled = false;
        }
    });

    updateTypeFields();
}

setupQuestionEditor();
initializePage();