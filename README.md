# 基于 MongoDB 的在线问卷系统

这是一个基于 MongoDB、Node.js 和 Express 开发的在线问卷系统，支持用户注册登录、问卷创建、题目配置、条件跳转、问卷填写和统计分析。

第二阶段在保留原有问卷功能的基础上，增加了独立题目、题库、题目版本、共享复用、问卷快照和跨问卷统计功能。

第二阶段仓库：

https://github.com/shixuhui-ops/2026-ECNU-PJ1-2-questionnaire-system

## 一、项目功能

### 1. 用户功能

- 用户注册和登录
- JWT 身份认证
- bcrypt 密码哈希
- 用户只能查看和管理自己创建的问卷
- 题库和题目版本按照所有权及共享关系访问

### 2. 问卷功能

- 创建问卷
- 修改问卷标题、说明和截止时间
- 设置是否允许匿名填写
- 设置是否允许同一用户重复填写
- 添加题目
- 配置条件跳转
- 发布和关闭问卷
- 生成问卷访问码
- 查看个人问卷列表

### 3. 题目类型

系统支持以下题型：

- 单选题
- 多选题
- 文本填空题
- 数字填空题

### 4. 题目校验

- 必答题校验
- 单选题选项校验
- 多选题最少、最多和固定选择数量校验
- 多选题重复答案校验
- 文本最小和最大长度校验
- 数字最小值、最大值和整数校验
- 选项值重复校验
- 无效配置校验

### 5. 条件跳转

支持以下跳转规则：

- 单选题等于判断
- 多选题包含判断
- 数字题大小比较
- 大于、小于、大于等于、小于等于
- 禁止跳转到当前题目
- 禁止添加重复跳转规则

### 6. 第二阶段题库与题目版本

- 创建和管理题库
- 创建可独立复用的题目
- 创建多个题目版本
- 查看题目版本历史
- 根据旧版本创建恢复版本
- 将题目版本加入题库
- 从题库移除题目版本
- 使用同一题目族的新版本替换旧版本
- 将题目版本共享给其他用户
- 将整个题库共享给其他用户
- 共享用户可以查看和复用题目，但不能修改所有者的题目
- 将题目版本选入自己的草稿问卷
- 查询题目版本或题目族的问卷使用情况
- 按题目版本进行跨问卷统计

题库页面：

`frontend/question-bank.html`

## 二、技术栈

- Node.js
- Express
- MongoDB
- Mongoose
- JWT
- bcryptjs
- HTML
- CSS
- JavaScript
- Playwright
- Chromium

## 三、项目结构

```text
.
├── backend
│   ├── src
│   │   ├── middleware
│   │   ├── models
│   │   │   ├── question-bank.model.js
│   │   │   ├── question-version.model.js
│   │   │   ├── response.model.js
│   │   │   ├── survey.model.js
│   │   │   └── user.model.js
│   │   ├── routes
│   │   │   ├── question-bank.routes.js
│   │   │   ├── question-version.routes.js
│   │   │   ├── survey.routes.js
│   │   │   └── ...
│   │   ├── utils
│   │   │   ├── question-statistics.js
│   │   │   └── question-validation.js
│   │   ├── app.js
│   │   └── server.js
│   ├── tests
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── frontend
│   ├── index.html
│   ├── manage.html
│   ├── fill.html
│   ├── stats.html
│   ├── question-bank.html
│   └── question-bank.js
├── API.md
├── AI_LOG.md
├── PROJECT_REPORT.md
├── README.md
└── TEST_CASES.md
```

## 四、数据库设计

系统使用 MongoDB 保存用户、问卷、回答、题库和题目版本。

### 1. users 集合

保存用户信息：

- `_id`
- `username`
- `passwordHash`
- `createdAt`
- `updatedAt`

### 2. surveys 集合

保存问卷信息：

- `ownerId`
- `title`
- `description`
- `accessCode`
- `allowAnonymous`
- `allowMultipleSubmissions`
- `status`
- `deadline`
- `questions`
- `jumpRules`

问卷题目继续嵌入问卷文档。题目从题库选入问卷时，系统复制题目内容，并保存 `sourceQuestionVersionId`，表示该题目来自哪个题目版本。

因此，题库后续创建新版本、替换版本或修改题库，都不会改写已经保存到问卷中的题目快照。

旧问卷中的题目没有 `sourceQuestionVersionId` 时，该字段保持为空，旧数据仍然可以正常读取和使用。

### 3. responses 集合

保存问卷提交记录：

- `surveyId`
- `respondentId`
- `anonymous`
- `answers`
- `submittedAt`

回答记录单独存储，便于多人提交和统计查询。

### 4. question_banks 集合

保存题库信息：

- `ownerId`：题库所有者
- `name`：题库名称
- `description`：题库说明
- `sharedWith`：被共享用户
- `questionVersionIds`：题库中的题目版本

### 5. question_versions 集合

保存可复用题目的版本：

- `familyId`：题目族编号
- `ownerId`：题目所有者
- `version`：版本号
- `parentVersionId`：父版本
- `restoredFromVersionId`：恢复来源版本
- `content`：题目内容
- `changeNote`：版本变更说明
- `sharedWith`：直接共享用户

每个版本都是独立文档。创建新版本和恢复旧版本都会生成新记录，不会覆盖历史版本。

### 6. 重复填写控制

问卷使用 `allowMultipleSubmissions` 字段控制重复提交：

- `true`：允许同一登录用户重复提交
- `false`：同一登录用户只能提交一次
- 默认值为 `true`
- 匿名用户不执行重复提交限制

## 五、环境配置

进入后端目录：

```powershell
Set-Location .\backend
```

复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

`.env` 示例：

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/questionnaire_system
JWT_SECRET=please_replace_with_a_secure_secret
```

不要将包含真实密钥的 `.env` 文件提交到公开仓库。

## 六、启动系统

### Windows

启动 MongoDB：

```powershell
mongod --dbpath .\backend\data\db
```

如果 `mongod` 不在 PATH 中：

```powershell
& "D:\MongoDB\bin\mongod.exe" --dbpath .\backend\data\db
```

启动后端：

```powershell
Set-Location .\backend
npm start
```

后端默认地址：

```text
http://localhost:3000
```

健康检查：

```text
GET /api/health
```

启动前端静态服务器：

```powershell
Set-Location .\frontend
python -m http.server 5500
```

浏览器访问：

```text
http://localhost:5500
```

题库页面：

```text
http://localhost:5500/question-bank.html
```

也可以使用 VS Code Live Server 打开 `frontend/index.html`。

### Linux/macOS

启动 MongoDB：

```bash
mongod --dbpath ./backend/data/db
```

启动后端：

```bash
cd backend
npm start
```

启动前端：

```bash
cd frontend
python3 -m http.server 5500
```

浏览器访问：

```text
http://localhost:5500
```

## 七、自动化测试

### 1. 一键测试

在项目根目录执行：

```powershell
npm --prefix .\backend run test:all
```

如果 MongoDB 不在 PATH 中：

```powershell
$env:MONGOD_BIN="D:\MongoDB\bin\mongod.exe"
npm --prefix .\backend run test:all
```

一键测试会自动：

1. 启动测试 MongoDB
2. 启动测试后端
3. 等待健康检查通过
4. 依次执行 API 自动化测试：
   - `backend/tests/api.test.js`
   - `backend/tests/question-version.test.js`
   - `backend/tests/question-bank.test.js`
5. 输出测试结果
6. 清理测试进程

测试环境与正常运行环境隔离：

| 项目 | 正常环境 | 测试环境 |
|---|---|---|
| MongoDB 数据目录 | `backend/data/db` | `backend/data/test-db` |
| MongoDB 端口 | `27017` | `27018` |
| 后端端口 | `3000` | `3100` |
| 数据库名称 | `questionnaire_system` | `questionnaire_system_test` |

### 2. 普通 API 测试

如果 MongoDB 和后端已经手动启动，可以执行：

```powershell
Set-Location .\backend
npm test
```

### 3. 浏览器测试

安装浏览器测试依赖：

```powershell
Set-Location .\backend
npm install
npx playwright install chromium
```

启动前端静态服务器后执行：

```powershell
$env:FRONTEND_BASE_URL="http://127.0.0.1:5500/frontend"
npm run test:browser
```

端到端测试：

```powershell
$env:FRONTEND_BASE_URL="http://127.0.0.1:5500/frontend"
npm run test:e2e
```

### 4. 第二阶段功能检查

第二阶段已完成并验证以下功能：

- 题库创建和查询
- 独立题目创建
- 题目版本创建
- 多版本共存
- 版本历史查看
- 旧版本恢复
- 版本共享
- 题库共享
- 接收者只读权限
- 题目选入草稿问卷
- 问卷题目快照保护
- 题目使用情况查询
- 跨问卷统计
- 题库题目替换
- 题库题目移除
- 旧问卷历史数据保护
- 第一、第二阶段 API 自动化测试回归

测试成功输出：

```text
所有自动化测试通过
```

## 八、主要 API

### 用户认证

```text
POST /api/auth/register
POST /api/auth/login
```

### 问卷管理

```text
POST /api/surveys
GET /api/surveys/mine
GET /api/surveys/:id
PATCH /api/surveys/:id
POST /api/surveys/:id/questions
POST /api/surveys/:id/jump-rules
POST /api/surveys/:id/publish
POST /api/surveys/:id/close
```

### 问卷填写和统计

```text
GET /api/surveys/public/:accessCode
POST /api/surveys/public/:accessCode/next-question
POST /api/responses/:accessCode
GET /api/stats/:surveyId
```

### 题库管理

```text
POST /api/question-banks
GET /api/question-banks
GET /api/question-banks/:id
PATCH /api/question-banks/:id
POST /api/question-banks/:id/questions
PATCH /api/question-banks/:id/questions/:versionId
DELETE /api/question-banks/:id/questions/:versionId
POST /api/question-banks/:id/share
```

### 题目版本管理

```text
POST /api/question-versions
GET /api/question-versions
POST /api/question-versions/:id/versions
GET /api/question-versions/:id/history
POST /api/question-versions/:id/restore
POST /api/question-versions/:id/share
POST /api/question-versions/:id/use
GET /api/question-versions/:id/usages
GET /api/question-versions/:id/statistics
```

需要身份认证的接口使用：

```http
Authorization: Bearer <JWT_TOKEN>
```

## 九、项目文档

- `API.md`：API 接口文档
- `TEST_CASES.md`：测试用例
- `AI_LOG.md`：AI 使用日志
- `PROJECT_REPORT.md`：项目报告
- `README.md`：项目说明

第二阶段仓库：

```text
https://github.com/shixuhui-ops/2026-ECNU-PJ1-2-questionnaire-system
```

## 十、兼容性和安全说明

- 原有问卷接口和题目结构继续保留
- 旧问卷数据无需迁移即可读取
- 已发布问卷不会被题库新版本修改
- 共享用户不能修改题目所有者的版本
- 所有需要身份认证的接口都使用 JWT
- 题库和题目版本接口检查所有权或共享关系
- 后端统一进行题目内容校验
- 前端动态文本使用 DOM API 写入，避免直接执行用户输入
- `.env` 文件不应提交到公开仓库
- 生产环境应使用安全的 JWT 密钥
- 不要重复启动同一个 MongoDB 实例