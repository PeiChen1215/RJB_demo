# 2026-07-08 成员 C 前端更新报告

> 分支：`feature/frontend-command-center-polish`  
> 角色：成员 C（前端 / 产品）  
> 范围：课程入口页、课程工作台、知识图谱、学习资源、学习画像、工作区、后端接口对齐  
> 验证：`frontend` 目录执行 `npm run build` 通过

---

## 一、今日更新概览

今天主要围绕“评委可演示的课程学习平台”进行前端打磨：在不破坏主链路的前提下，继续优化课程入口、课程工作台、知识图谱动态效果、学习资源页真实接口接入，并将更多后端已存在的学生端接口接到前端展示层。

本次更新重点解决以下问题：

1. 起始页与课程工作台更像真实教学平台，不再像单页 Demo 展示。
2. Python 课程名称改为正常课程名，避免“功能堆砌式命名”。
3. 知识图谱路径节点金色动态波纹重新增强，保证路径高亮足够醒目。
4. 知识图谱路径判断改为 `Set / Map` 缓存，减少路径生成后的重复计算。
5. 学习资源页接入更多后端真实数据：资源演进、反馈统计、学习规划、学习行为事件。
6. 课程工作台顶部信息区统一优化，减少突兀的 Command Center 文案。
7. 明确哪些后端接口已接入，哪些接口不适合放到学生端。

---

## 二、课程入口与课程工作台优化

### 2.1 课程名称调整

原课程名：

```text
Python 文件读写与智能学习路径
```

已修改为：

```text
Python 程序设计基础
```

调整原因：

- 原名称更像项目功能描述，不像真实课程名称。
- 新名称更符合选课平台与高校课程语境。
- 课程简介同步改为“从基础语法、控制流到文件操作，配合练习、代码运行和个性化辅导完成入门训练。”

### 2.2 登录 / 注册逻辑文案调整

已将：

- `登录并继续学习`
- `注册并继续学习`

改为：

- `登录`
- `注册`

原因：

- 登录或注册不应自动跳转 Python 课程，用户应先选择课程。
- 更符合真实平台的用户路径。

### 2.3 继续学习按钮调整

已将首页账户卡中的：

```text
继续学习 Python
```

改为：

```text
继续学习
```

原因：

- 入口页后续会承载多个课程，不应在账户按钮中写死 Python。

### 2.4 课程工作台头部重构

课程进入页顶部新增/优化：

- 当前课程标题更突出。
- 显示课程分类、等级、教师、模块数量、课程标签。
- 显示当前学习空间、当前目标知识点、知识节点数、已掌握数量、平均掌握度。
- 六个学习模块标签统一为课程内导航，不再像散乱功能堆叠。

相关文件：

- `frontend/src/App.tsx`
- `frontend/src/index.css`

---

## 三、顶部栏与浅色主题继续统一

### 3.1 TopBar 统一优化

顶部栏从原先偏“指挥中心调试台”的视觉，调整为课程工作台顶部状态区：

- 标题改为课程学习语境。
- 保留当前页面标题、资源状态、服务状态、Session ID。
- 生成目标资源按钮继续保留，但样式与浅色主题统一。

相关文件：

- `frontend/src/components/command-center/TopBar.tsx`
- `frontend/src/index.css`

### 3.2 浅色主题延续

继续根据 `eduhive-light-theme-reference.png` 做浅色主题统一：

- 减少深色底板残留。
- 调整资源页、知识图谱、工作区、按钮、状态卡配色。
- 新增资源演进与反馈统计 chip 样式。

---

## 四、知识图谱更新

### 4.1 地图背景接入新素材

已将用户生成的：

```text
eduhive-knowledge-map-underlay.png
```

复制并用于：

```text
frontend/public/assets/eduhive-knowledge-map-underlay.png
```

知识图谱地图背景现在直接使用该图：

```css
url('/assets/eduhive-knowledge-map-underlay.png') center / cover no-repeat
```

说明：

- 之前尝试过纹理叠加和动态背景，但视觉效果容易显脏或干扰节点。
- 当前版本改为轻量背景承托，不改变节点和气泡核心布局。

### 4.2 金色路径波纹增强

用户反馈路径上的金色动态波纹变得不明显后，已重新增强：

- 普通路径节点：由 1 层波纹恢复为 2 层波纹。
- 当前选中 / 目标节点：保留 3 层重点波纹。
- 加粗波纹边框。
- 提升金色 glow 与 drop-shadow。

这样生成路径后，路径节点能更明显地呈现金色动态流动感。

### 4.3 路径计算性能优化

保留前一轮性能优化：

- `plannedNodeSet`：用于快速判断某节点是否在规划路径上。
- `plannedEdgeSet`：用于快速判断某条边是否在规划路径上。
- `nodeByTitle`：缓存节点映射。
- `renderedEdges / activeEdges`：使用 `useMemo` 缓存 SVG 路径渲染数据。

原因：

- 原先每条边都通过数组扫描判断是否在路径上，路径和边多时会增加重复计算。
- 现在计算逻辑更稳定，视觉效果增强但不退回旧的低效判断方式。

相关文件：

- `frontend/src/App.tsx`
- `frontend/src/index.css`

---

## 五、学习资源页接口接入与展示优化

### 5.1 已接入资源演进接口

新增接入：

```http
GET /api/resources/evolution?concept=xxx
```

前端展示内容：

- 最新版本号。
- 资源改动原因。
- 触发来源。
- 讲义是否变化。
- 练习题数量变化。
- 代码案例数量变化。
- 当前知识点代码提交错误率。

用途：

- 支撑 C11“知识熔炉前端演进展示”。
- 不再只显示 `/resources/versions` 的简单版本列表。
- 可以体现后端“错误率驱动资源重审”的创新点。

### 5.2 已接入资源反馈统计接口

新增接入：

```http
GET /api/resources/feedback/stats?concept=xxx
```

前端展示内容：

- 反馈总数。
- 困惑率。
- 平均评分。

并且在用户提交反馈成功后，自动重新拉取反馈统计。

### 5.3 保留资源生成流式主链路

当前资源生成仍然使用：

```http
GET /api/resources/stream-generate
```

原因：

- 该接口能实时推送 Agent 阶段进度，更适合比赛演示。
- 同步接口 `/resources/generate` 与 `/resources/generate-for-session/{session_id}` 暂未作为主流程入口。

### 5.4 资源页用户体验延续

继续保留之前已修复的逻辑：

- 讲义、导图、练习题、代码案例、讲解、报告使用更易读的浅色排版。
- 练习题作答区保留用户输入，不因切换题目丢失。
- 参考答案按钮支持显示 / 隐藏。
- 判题结果不再直接向用户展示 JSON。
- 资源反馈文本框固定在资源反馈窗口内，不再点击后撑破布局。

相关文件：

- `frontend/src/components/command-center/ResourceLibraryPanel.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/index.css`

---

## 六、学习画像与学习工作区接口接入

### 6.1 学习画像同步后端 profile

新增周期性读取：

```http
GET /api/sessions/{session_id}/profile
```

用途：

- 创建 session 后，画像不再只停留在初始状态。
- 后端如果根据聊天、练习、行为更新画像，前端会同步刷新。

### 6.2 画像证据接口确认

已有组件 `ProfilePanel` 已接入：

```http
GET /api/sessions/{session_id}/profile/evidence
```

展示内容：

- 画像证据维度。
- 每个维度最近证据。
- 画像置信度。

今日确认该接口不是漏接状态。

### 6.3 学习规划接口接入

新增接入：

```http
GET /api/learning-plan/{session_id}
```

前端展示位置：

- 各页面右侧 / 下方 `WorkspaceDock` 工作区。

展示内容：

- 后端规划节点数量。
- 总预计学习时长。
- 前三个学习节点路径。

用途：

- 让“学习动作 / 工作区”不只是静态提示，而是能体现后端根据画像、掌握度、目标概念生成的学习计划。

### 6.4 学习行为事件接口接入

新增接入：

```http
GET /api/sessions/{session_id}/events?limit=8
```

前端展示位置：

- `WorkspaceDock` 中展示最近一次学习行为。

处理逻辑：

- 前端按 `created_at` 倒序排序。
- 显示最近行为的 `event_type` 和关联 concept。

用途：

- 让工作区显示真实学习轨迹。
- 证明前端已有行为埋点数据闭环。

---

## 七、今日已接入 / 已确认使用的接口清单

### 7.1 认证

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

暂未接入：

- `POST /api/auth/refresh`

说明：

- 当前演示可正常登录 / 注册 / 退出。
- token 自动刷新属于长期登录体验优化，建议后续补。

### 7.2 会话与画像

- `POST /api/sessions/`
- `GET /api/sessions/{session_id}/profile`
- `PATCH /api/sessions/{session_id}/profile`
- `GET /api/sessions/{session_id}/profile/evidence`
- `GET /api/sessions/{session_id}/stats`
- `GET /api/sessions/{session_id}/agent-trace`
- `GET /api/sessions/{session_id}/events`
- `POST /api/sessions/{session_id}/behavior`
- `POST /api/sessions/{session_id}/chat`
- `GET /api/sessions/{session_id}/chat-stream`

暂未接入：

- `GET /api/sessions/`
- `GET /api/sessions/{session_id}`
- `POST /api/sessions/{session_id}/events`
- `POST /api/sessions/{session_id}/evaluate`

说明：

- `POST /events` 与当前 `POST /behavior` 存在用途重叠，学生端已有行为写入入口。
- `/evaluate` 与 `/api/evaluation/analyze` 存在功能重叠，建议后端统一主推荐接口。

### 7.3 知识图谱

- `GET /api/graph/`
- `GET /api/graph/layout`
- `GET /api/graph/path`
- `GET /api/graph/concept/{name}`

说明：

- 图谱布局、路径节点、路径边、概念详情均已参与知识图谱页面渲染。

### 7.4 学习资源

- `GET /api/resources/latest`
- `GET /api/resources/stream-generate`
- `GET /api/resources/versions`
- `GET /api/resources/evolution`
- `GET /api/resources/thinking-path`
- `POST /api/resources/feedback`
- `GET /api/resources/feedback/stats`

暂未作为主流程使用：

- `POST /api/resources/generate`
- `POST /api/resources/generate-for-session/{session_id}`

说明：

- 当前主流程使用流式生成接口，展示效果更适合 Demo。

### 7.5 代码与掌握度

- `POST /api/code/execute`
- `POST /api/code/judge`
- `POST /api/code/judge-exercise`
- `GET /api/evaluation/heatmap`
- `GET /api/evaluation/bkt`
- `POST /api/evaluation/analyze`
- `GET /api/learning-plan/{session_id}`

暂未接入学生端：

- `POST /api/code/runnability-check`
- `POST /api/code/seed-failed-submissions`

说明：

- `runnability-check` 更适合后台批量校验生成案例。
- `seed-failed-submissions` 是演示 / 测试造数据接口，不建议放到学生端。

### 7.6 管理端接口

暂未接入学生端：

- `GET /api/admin/stats`
- `POST /api/admin/resource-review`

说明：

- 这两个接口属于管理后台 / 人工运维操作，不适合在学生学习端暴露给评委。

---

## 八、仍需后端队友注意的问题

### 8.1 token refresh 后续可补

后端已有：

```http
POST /api/auth/refresh
```

前端暂未接入。

建议：

- 后续如果演示时间较长或需要真实登录态保持，可加 axios 响应拦截器。
- 当前短时 Demo 不影响主链路。

### 8.2 `/sessions/{session_id}/evaluate` 与 `/evaluation/analyze` 功能边界需明确

当前前端使用：

```http
POST /api/evaluation/analyze
```

后端另有：

```http
POST /api/sessions/{session_id}/evaluate
```

建议：

- 后端确认哪个接口作为“掌握度分析 / 学习评估”的主入口。
- 前端后续只保留一个主入口，避免页面逻辑重复。

### 8.3 资源生成同步接口与流式接口需明确主次

当前前端主流程使用：

```http
GET /api/resources/stream-generate
```

后端仍提供：

```http
POST /api/resources/generate
POST /api/resources/generate-for-session/{session_id}
```

建议：

- 保留同步接口作为降级接口。
- 前端演示主流程继续使用流式接口。
- 后端文档中注明三者差异，避免队友误用。

### 8.4 学习规划接口可以继续增强解释字段

当前 `/api/learning-plan/{session_id}` 已返回：

- concept
- difficulty
- mastery_probability
- is_mastered
- estimated_minutes
- reason

建议后续可增强：

- 每个节点推荐资源类型。
- 每个节点推荐练习数量。
- 当前节点是否为“下一步最优学习点”。
- 与知识图谱路径边解释统一。

### 8.5 资源反馈统计可补最近典型反馈

当前 `/resources/feedback/stats` 返回：

- total_feedback
- confusion_count
- confusion_rate
- average_rating
- error_reports

建议：

- 可增加最近 3 条代表性反馈。
- 可增加是否触发知识熔炉重审的状态。
- 这样前端能更直观展示“学生反馈如何推动资源进化”。

---

## 九、验证情况

### 9.1 构建验证

已在：

```powershell
I:\project\rjb\RJB_demo\frontend
```

执行：

```powershell
npm run build
```

结果：

```text
tsc && vite build 通过
```

说明：

- TypeScript 类型检查通过。
- Vite 生产构建通过。
- 新增 API 类型、组件 props、样式未造成构建错误。

### 9.2 Git 差异检查

已执行：

```powershell
git diff --check
```

结果：

- 未发现空白错误。

---

## 十、与三人分工任务的对应关系

本次更新主要对应成员 C 的以下任务：

### C1：Command Center 多页面骨架

继续优化课程入口页与课程工作台，使登录、选课、进入课程、切换模块的体验更接近真实平台。

### C2：UI 响应式与细节收尾

继续统一浅色主题、顶部栏、工作区、资源页、知识图谱样式，并修复深色主题残留。

### C9：可解释思维路径回放时间线

保留并继续使用 `thinking-path` 生成过程数据，在工作区和资源页展示 Agent 生成过程。

### C10：全息代码沙箱变量可视化

今日未重点修改代码沙箱，但保留前序变量面板接入逻辑。

### C11：知识熔炉前端演进展示

今日重点推进：

- 接入 `/resources/evolution`。
- 接入 `/resources/feedback/stats`。
- 资源页展示版本 diff、错误率、反馈统计。

这部分已经从“只展示版本列表”升级为“展示资源为何变化、如何变化、学生反馈情况如何”。

---

## 十一、提交说明

本次提交计划使用提交信息：

```text
feat(frontend): 接入学习规划与资源演进接口并完善课程工作台
```

提交分支：

```text
feature/frontend-command-center-polish
```

---

## 十二、后续建议

1. 后端补充接口文档，尤其是 `/learning-plan`、`/resources/evolution`、`/feedback/stats` 的响应示例。
2. 前端后续可将资源演进做成更完整时间线，而不是只展示最新版本摘要。
3. 如果后端提供“触发知识熔炉重审状态”，前端可在资源反馈区域增加“已触发优化 / 暂未触发”提示。
4. 评委演示时建议重点展示：选课 → 进入 Python 课程 → 知识图谱生成路径 → 生成资源 → 查看资源演进与反馈统计 → 代码练习 → 掌握度分析。
