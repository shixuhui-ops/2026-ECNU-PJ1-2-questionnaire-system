const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
const surveyRoutes = require("./routes/survey.routes");
const responseRoutes = require("./routes/response.routes");
const statsRoutes = require("./routes/stats.routes");
const questionBankRoutes = require("./routes/question-bank.routes");
const questionVersionRoutes = require("./routes/question-version.routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "问卷系统服务运行正常"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/surveys", surveyRoutes);
app.use("/api/responses", responseRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/question-banks", questionBankRoutes);
app.use("/api/question-versions", questionVersionRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "接口不存在"
    });
});

app.use((error, req, res, next) => {
    console.error("未处理的服务器错误：", error);

    res.status(500).json({
        success: false,
        message: "服务器内部错误"
    });
});

module.exports = app;