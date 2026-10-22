# API 接口文档

## 1. 基本信息

后端默认地址：

```text
http://localhost:3000
```

API 基础地址：

```text
http://localhost:3000/api
```

请求 JSON 数据时使用：

```http
Content-Type: application/json
```

需要登录的接口使用 JWT：

```http
Authorization: Bearer <JWT_TOKEN>
```

成功响应通常采用：

```json
{
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

失败响应采用：

```json
{
  "success": false,
  "message": "错误原因"
}
```

常见状态码：

| 状态码 | 含义 |
|---:|---|
| `200` | 请求成功 |
| `201` | 创建成功 |
| `400` | 请求参数或业务状态错误 |
| `401` | 未登录、Token 无效或已过期 |
| `404` | 资源不存在或当前用户无权访问 |
| `409` | 数据冲突 |
| `500` | 服务器内部错误 |

---

## 2. 健康检查

### 2.1 检查服务状态

```http
GET /api/health
```

无需登录。

成功响应：

```json
{
  "success": true,
  "message": "问卷系统服务运行正常"
}
```

---

## 3. 用户认证

### 3.1 用户注册

```http
POST /api/auth/register
```

请求：

```json
{
  "username": "testuser",
  "password": "123456"
}
```

字段规则：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `username` | String | 是 | 长度为 3～30 个字符 |
| `password` | String | 是 | 长度不少于 6 个字符 |

成功响应：

```json
{
  "success": true,
  "message": "注册成功",
  "data": {
    "user": {
      "id": "用户ID",
      "username": "testuser"
    },
    "token": "JWT_TOKEN"
  }
}
```

状态码：

| 状态码 | 说明 |
|---:|---|
| `201` | 注册成功 |
| `400` | 用户名或密码格式错误 |
| `409` | 用户名已存在 |

### 3.2 用户登录

```http
POST /api/auth/login
```

请求：

```json
{
  "username": "testuser",
  "password": "123456"
}
```

成功响应：

```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "user": {
      "id": "用户ID",
      "username": "testuser"
    },
    "token": "JWT_TOKEN"
  }
}
```

状态码：

| 状态码 | 说明 |
|---:|---|
| `200` | 登录成功 |
| `401` | 用户名或密码错误 |

---

## 4. 问卷管理

除公开访问接口外，本节接口均需要 JWT。

### 4.1 创建问卷

```http
POST /api/surveys
```

请求：

```json
{
  "title": "学生信息调查",
  "description": "课程调查问卷",
  "allowAnonymous": true,
  "allowMultipleSubmissions": false,
  "deadline": "2026-12-31T23:59:00.000Z"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `title` | String | 是 | 问卷标题 |
| `description` | String | 否 | 问卷说明 |
| `allowAnonymous` | Boolean | 否 | 是否允许匿名填写 |
| `allowMultipleSubmissions` | Boolean | 否 | 是否允许同一用户重复填写，默认 `true` |
| `deadline` | Date/null | 否 | 截止时间 |

成功后问卷状态为 `draft`，系统自动生成访问码。

### 4.2 查看我的问卷

```http
GET /api/surveys/mine
```

只返回当前用户创建的问卷。

### 4.3 查看问卷详情

```http
GET /api/surveys/:id
```

只能查看自己创建的问卷。

### 4.4 修改问卷

```http
PATCH /api/surveys/:id
```

请求示例：

```json
{
  "title": "修改后的标题",
  "description": "修改后的说明",
  "allowAnonymous": false,
  "allowMultipleSubmissions": true,
  "deadline": null
}
```

只有问卷所有者可以修改。

### 4.5 添加题目

```http
POST /api/surveys/:id/questions
```

只有草稿问卷可以添加题目。

#### 单选题示例

```json
{
  "type": "single",
  "title": "你的年级",
  "description": "请选择一个选项",
  "required": true,
  "options": [
    {
      "label": "大一",
      "value": "freshman"
    },
    {
      "label": "大二",
      "value": "sophomore"
    }
  ]
}
```

#### 多选题示例

```json
{
  "type": "multiple",
  "title": "你使用过哪些数据库",
  "required": true,
  "options": [
    {
      "label": "MySQL",
      "value": "mysql"
    },
    {
      "label": "MongoDB",
      "value": "mongodb"
    },
    {
      "label": "PostgreSQL",
      "value": "postgresql"
    }
  ],
  "validation": {
    "minSelections": 1,
    "maxSelections": 2
  }
}
```

#### 文本题示例

```json
{
  "type": "text",
  "title": "请填写建议",
  "required": false,
  "validation": {
    "minLength": 2,
    "maxLength": 200
  }
}
```

#### 数字题示例

```json
{
  "type": "number",
  "title": "你的年龄",
  "required": true,
  "validation": {
    "minValue": 0,
    "maxValue": 120,
    "integerOnly": true
  }
}
```

支持的题型：

| 类型 | 说明 |
|---|---|
| `single` | 单选题 |
| `multiple` | 多选题 |
| `text` | 文本题 |
| `number` | 数字题 |

第二阶段增加的来源字段：

```json
{
  "sourceQuestionVersionId": "来源题目版本ID或null"
}
```

直接在问卷中创建的题目，其来源字段为 `null`；从题目版本选入的题目会保存对应版本 ID。

### 4.6 添加跳转规则

```http
POST /api/surveys/:id/jump-rules
```

请求：

```json
{
  "sourceQuestionId": "源题目ID",
  "targetQuestionId": "目标题目ID",
  "operator": "equals",
  "expectedValue": "freshman"
}
```

支持的运算符：

| 运算符 | 适用场景 |
|---|---|
| `equals` | 单选或普通相等判断 |
| `contains` | 多选题包含判断 |
| `gt` | 数字大于 |
| `gte` | 数字大于等于 |
| `lt` | 数字小于 |
| `lte` | 数字小于等于 |

系统拒绝自跳转、重复规则和与题型不匹配的规则。

### 4.7 发布问卷

```http
POST /api/surveys/:id/publish
```

问卷至少包含一道题目后才能发布。问卷发布后不能继续添加题目。

### 4.8 关闭问卷

```http
POST /api/surveys/:id/close
```

关闭后不能继续提交回答。

---

## 5. 公开访问问卷

### 5.1 根据访问码获取公开问卷

```http
GET /api/surveys/public/:accessCode
```

公开问卷必须处于 `published` 状态，且未超过截止时间。

### 5.2 获取下一道题目

```http
POST /api/surveys/public/:accessCode/next-question
```

请求示例：

```json
{
  "questionId": "当前题目ID",
  "value": "freshman"
}
```

后端根据题目答案和跳转规则返回下一道题。

---

## 6. 回答提交

### 6.1 提交问卷

```http
POST /api/responses/:accessCode
```

请求：

```json
{
  "answers": [
    {
      "questionId": "题目ID",
      "value": "freshman"
    },
    {
      "questionId": "数字题ID",
      "value": 20
    }
  ]
}
```

校验内容包括：

- 问卷必须已发布
- 问卷不能已关闭
- 不能超过截止时间
- 非匿名问卷必须登录
- 题目 ID 必须存在于问卷中
- 同一道题不能重复提交答案
- 实际回答路径上的必答题必须填写
- 答案必须符合题型和校验规则
- 禁止重复填写时，同一登录用户只能提交一次

可能返回：

| 状态码 | 说明 |
|---:|---|
| `201` | 提交成功 |
| `400` | 答案格式或校验失败 |
| `401` | 问卷不允许匿名且用户未登录 |
| `404` | 访问码无效 |
| `409` | 当前用户已经提交过该问卷 |

---

## 7. 单份问卷统计

### 7.1 查询问卷统计

```http
GET /api/stats/:surveyId
```

需要 JWT，且只有问卷所有者可以查看。

统计内容包括：

- 回答总数
- 单选题各选项数量
- 多选题各选项选择次数
- 文本题回答内容
- 数字题回答值和平均值

---

## 8. 题库管理

本节所有接口均需要 JWT。

题库访问规则：

- 题库所有者可以查看和管理题库。
- 被共享用户可以查看题库和使用其中的题目。
- 被共享用户不能修改题库。
- 题库共享同时允许接收者访问题库当前和以后包含的题目版本。

### 8.1 创建题库

```http
POST /api/question-banks
```

请求：

```json
{
  "name": "学生信息题库",
  "description": "保存可复用的学生信息题目"
}
```

字段规则：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `name` | String | 是 | 题库名称，最长 200 个字符 |
| `description` | String | 否 | 题库说明，最长 2000 个字符 |

成功返回 HTTP `201`。

### 8.2 查询可访问的题库

```http
GET /api/question-banks
```

返回：

- 当前用户创建的题库
- 其他用户共享给当前用户的题库

### 8.3 查看题库详情

```http
GET /api/question-banks/:id
```

只有题库所有者或被共享用户可以查看。

### 8.4 修改题库信息

```http
PATCH /api/question-banks/:id
```

请求：

```json
{
  "name": "更新后的题库名称",
  "description": "更新后的题库说明"
}
```

只允许修改 `name` 和 `description`，且只有题库所有者可以操作。

### 8.5 将题目版本加入题库

```http
POST /api/question-banks/:id/questions
```

请求：

```json
{
  "questionVersionId": "题目版本ID"
}
```

要求：

- 当前用户必须是题库所有者。
- 当前用户必须有权访问该题目版本。
- 重复加入同一个版本不会产生重复引用。

### 8.6 替换题库中的题目版本

```http
PATCH /api/question-banks/:id/questions/:versionId
```

其中 `versionId` 是题库中现有的旧版本 ID。

请求：

```json
{
  "newVersionId": "新版本ID"
}
```

要求：

- 只有题库所有者可以操作。
- 旧版本必须存在于题库中。
- 新旧版本必须属于同一 `familyId`。
- 新版本必须是当前用户可访问的版本。
- 新版本不能已经存在于该题库。

该操作只更新题库引用，不会修改已经保存到问卷中的题目快照。

### 8.7 从题库移除题目版本

```http
DELETE /api/question-banks/:id/questions/:versionId
```

要求：

- 只有题库所有者可以操作。
- 指定版本必须存在于题库中。

该操作只移除题库引用，不会删除题目版本、版本历史、问卷题目或历史回答。

### 8.8 共享题库

```http
POST /api/question-banks/:id/share
```

请求：

```json
{
  "username": "receiver"
}
```

要求：

- 只有题库所有者可以共享。
- 接收者必须是已注册用户。
- 不能将题库共享给自己。

共享用户可以查看和复用题库中的题目，但不能修改题库。

---

## 9. 题目版本管理

本节所有接口均需要 JWT。

### 9.1 创建独立题目

```http
POST /api/question-versions
```

请求：

```json
{
  "content": {
    "type": "number",
    "title": "你的年龄",
    "description": "",
    "required": true,
    "validation": {
      "minValue": 0,
      "maxValue": 120,
      "integerOnly": true
    }
  }
}
```

创建结果：

- 系统生成新的 `familyId`
- 首次版本号为 `1`
- `parentVersionId` 为 `null`
- `restoredFromVersionId` 为 `null`
- 题目所有者为当前用户

成功返回 HTTP `201`。

题目内容与问卷题目使用相同的题型和校验规则，但独立版本不保存问卷内的 `order` 和 `sourceQuestionVersionId`。

### 9.2 查询可访问的题目版本

```http
GET /api/question-versions
```

返回：

- 当前用户创建的版本
- 直接共享给当前用户的版本
- 当前用户可访问题库中包含的版本

### 9.3 创建新版本

```http
POST /api/question-versions/:id/versions
```

请求：

```json
{
  "content": {
    "type": "number",
    "title": "你的年龄（更新版）",
    "description": "",
    "required": true,
    "validation": {
      "minValue": 0,
      "maxValue": 150,
      "integerOnly": true
    }
  },
  "changeNote": "扩大年龄范围"
}
```

规则：

- 只有题目所有者可以创建新版本。
- 新版本沿用原题目的 `familyId`。
- 系统按题目族自动生成递增版本号。
- `parentVersionId` 指向创建新版本时使用的来源版本。
- 新版本不会覆盖旧版本。

成功返回 HTTP `201`。

### 9.4 查看版本历史

```http
GET /api/question-versions/:id/history
```

返回同一 `familyId` 下当前用户有权访问的版本，并按版本号排序。

所有者可以查看完整历史；共享用户只能看到获得访问权限的版本。

### 9.5 恢复历史版本

```http
POST /api/question-versions/:id/restore
```

请求：

```json
{
  "targetVersionId": "历史版本ID",
  "changeNote": "恢复到历史版本"
}
```

规则：

- `:id` 表示当前版本。
- 只有题目所有者可以恢复。
- 目标版本必须与当前版本属于同一题目族。
- 目标版本必须早于当前版本。
- 恢复不会覆盖当前版本，而是创建一个新版本。
- 新版本的 `restoredFromVersionId` 记录目标历史版本。

成功返回 HTTP `201`。

### 9.6 共享题目版本

```http
POST /api/question-versions/:id/share
```

请求：

```json
{
  "username": "receiver"
}
```

规则：

- 只有题目所有者可以共享。
- 接收者必须是已注册用户。
- 不能共享给自己。
- 接收者只能查看和复用该版本，不能创建原题目的新版本。

### 9.7 将题目版本选入草稿问卷

```http
POST /api/question-versions/:id/use
```

请求：

```json
{
  "surveyId": "草稿问卷ID"
}
```

要求：

- 当前用户必须有权访问该题目版本。
- 问卷必须属于当前用户。
- 问卷必须处于 `draft` 状态。
- 题目内容必须通过统一校验。

系统会：

1. 为问卷中的嵌入题目生成新的题目 ID。
2. 复制该版本的题型、标题、说明、必答设置、选项和校验规则。
3. 按问卷现有题目数量设置顺序。
4. 保存来源字段：

```json
{
  "sourceQuestionVersionId": "被选入的题目版本ID"
}
```

题目选入问卷后成为问卷快照。题库替换版本、移除版本或创建新版本，都不会修改该快照。

已发布问卷不能继续选入题目。

### 9.8 查询题目使用情况

查询单个版本：

```http
GET /api/question-versions/:id/usages
```

显式指定单版本范围：

```http
GET /api/question-versions/:id/usages?scope=version
```

查询整个题目族：

```http
GET /api/question-versions/:id/usages?scope=family
```

只有题目所有者可以查询。

响应包含：

- `familyId`
- 查询范围
- 总使用次数
- 使用该版本的问卷
- 问卷标题和状态
- 问卷中的题目 ID 和顺序
- 来源版本 ID 和版本号
- 问卷创建及更新时间

### 9.9 查询跨问卷统计

查询单个版本：

```http
GET /api/question-versions/:id/statistics
```

显式指定单版本范围：

```http
GET /api/question-versions/:id/statistics?scope=version
```

查询整个题目族：

```http
GET /api/question-versions/:id/statistics?scope=family
```

只有题目所有者可以查询。

统计结果按版本分组，不会将不同版本的回答混合计算。

响应结构示例：

```json
{
  "familyId": "题目族ID",
  "scope": "family",
  "totalSurveys": 3,
  "totalSurveyResponses": 3,
  "totalResponses": 3,
  "versionStatistics": [
    {
      "questionVersionId": "版本ID",
      "version": 1,
      "totalSurveys": 2,
      "totalResponses": 2,
      "statistics": {
        "title": "你的年龄",
        "type": "number",
        "totalAnswers": 2,
        "values": [
          20,
          40
        ],
        "average": 30,
        "min": 20,
        "max": 40,
        "distribution": [
          {
            "value": 20,
            "count": 1
          },
          {
            "value": 40,
            "count": 1
          }
        ]
      }
    }
  ]
}
```

不同题型的统计内容：

| 题型 | 统计内容 |
|---|---|
| `single` | 各选项数量 |
| `multiple` | 各选项被选择次数 |
| `text` | 文本回答列表 |
| `number` | 数值列表、平均值、最小值、最大值和分布 |

---

## 10. 共享与权限规则

### 10.1 题目版本所有者

可以：

- 创建新版本
- 查看版本历史
- 恢复历史版本
- 共享题目版本
- 查询使用情况
- 查询跨问卷统计
- 将版本加入自己拥有的题库
- 将版本选入自己的草稿问卷

### 10.2 题目版本共享用户

可以：

- 查看被共享的版本
- 将版本选入自己的草稿问卷
- 在拥有权限的情况下加入自己的题库

不能：

- 修改原版本
- 创建原题目的新版本
- 恢复原题目的历史版本
- 代替所有者共享该版本
- 查询所有者专属的使用统计

### 10.3 题库所有者

可以：

- 修改题库名称和说明
- 加入题目版本
- 替换题目版本
- 移除题目版本
- 共享题库

### 10.4 题库共享用户

可以：

- 查看共享题库
- 查看题库中可访问的版本
- 将题目选入自己的草稿问卷

不能：

- 修改题库
- 替换或移除题库中的版本
- 修改题目所有者的版本

---

## 11. 数据兼容和快照规则

### 11.1 第一阶段问卷兼容

第二阶段只在问卷嵌入题目中增加可空字段：

```json
{
  "sourceQuestionVersionId": null
}
```

第一阶段创建的旧题目没有该字段时仍然可以正常：

- 查看
- 修改草稿问卷
- 发布
- 填写
- 提交
- 统计

不需要迁移旧数据。

### 11.2 问卷快照保护

从题库选入问卷时复制题目内容，不在问卷运行时动态读取题库。因此：

- 创建题目新版本不会修改旧问卷。
- 恢复历史版本不会修改旧问卷。
- 替换题库版本不会修改旧问卷。
- 从题库移除版本不会修改旧问卷。
- 已发布问卷结构保持不变。
- 已提交回答仍然能够按问卷原题目 ID 统计。

### 11.3 版本不可覆盖

题目版本采用追加式设计：

- 内容更新创建新版本。
- 恢复操作创建新版本。
- 历史版本不会被覆盖。
- 同一题目族通过 `familyId` 关联。
- 父子关系通过 `parentVersionId` 保存。
- 恢复来源通过 `restoredFromVersionId` 保存。

---

## 12. 安全说明

- 密码使用 bcrypt 哈希保存。
- 需要登录的接口使用 JWT。
- 所有题库、题目版本、问卷和统计接口均进行权限检查。
- 共享权限为只读和复用权限，不授予修改权。
- 后端统一校验题目结构，不能依赖前端校验。
- 不应将 `.env` 或真实 JWT 密钥提交到公开仓库。
- 无效或过期 Token 不会自动降级为匿名用户。
- 客户端不应根据 `404` 区分资源不存在和无权访问，以减少资源枚举风险。

---

## 13. 第二阶段主要接口汇总

```text
POST   /api/question-banks
GET    /api/question-banks
GET    /api/question-banks/:id
PATCH  /api/question-banks/:id
POST   /api/question-banks/:id/questions
PATCH  /api/question-banks/:id/questions/:versionId
DELETE /api/question-banks/:id/questions/:versionId
POST   /api/question-banks/:id/share

POST   /api/question-versions
GET    /api/question-versions
POST   /api/question-versions/:id/versions
GET    /api/question-versions/:id/history
POST   /api/question-versions/:id/restore
POST   /api/question-versions/:id/share
POST   /api/question-versions/:id/use
GET    /api/question-versions/:id/usages
GET    /api/question-versions/:id/statistics
```