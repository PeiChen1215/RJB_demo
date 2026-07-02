# 2026-07-03 成员 C 前端指挥舱更新报告

## 1. 提交分支

- 当前分支：`feature/frontend-command-center`
- 对应分工：成员 C，负责前端界面、交互可视化、Demo 素材、系统展示体验。
- 本次提交目标：补齐评委演示视角下的前端主链路体验，明确仍需后端配合的数据逻辑与接口问题。

## 2. 今日主要更新内容

### 2.1 全局前端指挥舱体验

- 将首页从静态概念图式展示改为可操作的多页面指挥舱。
- 左侧导航改为模块化页面切换，避免五个模块堆在同一页导致评委观感混乱。
- 去掉显眼的 Demo 路径文案，将演示逻辑收敛到页面交互内部。
- 接入并统一使用视觉素材：
  - `frontend/public/assets/eduhive-command-bg.png`
  - `frontend/public/assets/eduhive-logo-mark.png`
  - `frontend/public/assets/student-avatar-visual.png`
- 补充全局背景、蜂巢视觉、金色/绿色高亮、按钮反馈、加载态和动态流效果。

### 2.2 知识图谱 / 学习路径页面

- 将知识图谱改为可拖动的小地图式路径界面。
- 六边形节点改为更松散的关系布局，减少节点重叠和拥挤。
- 路径节点增加金色动态波纹，当前路径节点与目标节点都能形成明显高亮。
- 路线改为穿过六边形节点中心，避免穿过掌握度标签。
- 点击左侧导航进入知识图谱时，地图自动聚焦到当前路径终点并展示终点详情。
- 点击普通节点时只展示该节点详情，不再自动移动地图。
- 点击空白处隐藏节点详情并恢复概要窗口。
- 明确两个生成资源按钮逻辑：
  - 右上角按钮：生成当前路径终点/当前学习目标的资源。
  - 节点详情按钮：生成当前点击节点的资源。

### 2.3 学习资源页面

- 将学习资源页改为更重视阅读区的布局，避免资源包信息喧宾夺主。
- 将讲义、导图、练习题、代码案例、讲解、审核报告等入口与后端资源接口对接。
- 修复审核报告切换时左侧按钮被拉长的问题。
- 优化资源阅读区字体、背景、段落间距和卡片层级，减少大面积纯黑底造成的疲劳感。
- 将资源内容改为页面内滚动式阅读，避免滚到底部后左侧资源入口消失。
- 修复练习题显示答案而不是题目的问题，区分题干、作答区、参考答案和判题结果。

### 2.4 学习对话页面

- 对接后端聊天接口和流式聊天接口。
- 修复发送按钮不可用的问题，支持按钮发送与回车发送。
- 优化右侧工作区占比，减少空面板。
- 将“规划路径 / 分析掌握度”和其他辅助按钮分组，降低功能语义混乱。
- 修复后端返回 JSON 时前端直接展示原始 JSON 的问题，改为提取可读回复与画像更新摘要。
- 修复发送消息后认知风格被错误重置为视觉型的问题。
- 接入苏格拉底式辅导面板：
  - 展示阶段、提示、参考思路、继续引导按钮。
  - 查看提示后能展示提示内容。
  - 继续引导会携带上一轮上下文继续请求后端。
- 修复麦克风按钮无法关闭的问题，第二次点击可停止语音监听。

### 2.5 代码沙箱页面

- 对接后端代码运行接口。
- 修复运行结果可以显示但变量快照长期停留在“等待运行”的问题。
- 增强变量解析兼容性，支持后端返回数组或对象形式的 `variables`。
- 变量面板展示变量名、类型和值，并保留无变量时的说明状态。

### 2.6 掌握进度页面

- 压缩下方工作区高度，减少空白。
- 优化热力图视觉表现，增强颜色、节点卡片和选中状态的可读性。
- 修复“重新分析”按钮点击无效果的问题。
- 将 BKT、guess、slip 等术语改为用户可理解的中文：
  - BKT：知识掌握度模型。
  - guess：猜对概率。
  - slip：失误概率。
- 为默认参数增加说明，避免用户误以为 20%/10% 是真实学习结论。
- 优化红绿颜色条说明，明确它代表掌握度从低到高。

### 2.7 学习画像页面

- 将学习画像页从大空白工作区改为三列仪表盘布局。
- 画像主卡片、Agent 协作、右侧工作区重新分配宽度。
- 修复详细画像按钮视觉上像可点击但交互不明显的问题。
- 调整头像右侧文本框布局，避免内容挤在顶部。
- Agent 协作列表收紧列间距，避免图标和时间贴边或超出。
- 新增画像底部状态条：
  - 画像置信度
  - 学习轨迹
  - 推荐干预
- 新增 Agent 协作底部状态板：
  - 小型协作轨道
  - 活跃任务
  - 链路状态
  - 本轮策略
- 说明：上述底部增强项中部分仍为前端展示型数据，后端暂未提供真实字段，详见第 4 节。

## 3. 本次涉及的主要文件

- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/src/services/api.ts`
- `frontend/src/components/socratic/SocraticPanel.tsx`
- `frontend/public/assets/eduhive-command-bg.png`
- `frontend/public/assets/eduhive-logo-mark.png`
- `frontend/public/assets/student-avatar-visual.png`
- `backend/app/api/code.py`
- `backend/app/services/code_executor.py`
- `backend/app/api/resources.py`
- `backend/app/api/sessions.py`
- `backend/app/agents/orchestrator.py`
- `backend/app/agents/reviewer/socrates.py`
- `backend/app/agents/generator.py`

## 4. 希望后端后续增加的逻辑

### 4.1 学习画像真实数据闭环

当前前端画像主字段来自 `session.profile`，但初始画像是后端默认值。建议后端补充画像证据聚合逻辑：

- 返回每个画像维度的证据权重、来源事件和置信度。
- 将 `/api/sessions/{id}/profile/evidence` 聚合为前端可直接展示的结构。
- 增加 `profile_confidence` 字段，替代前端当前展示型“画像置信度 92%”。
- 根据真实行为更新：
  - `knowledge_level`
  - `cognitive_modality`
  - `learning_pace`
  - `error_patterns`
  - `mastered_concepts`

### 4.2 Agent 协作状态接口

当前 Agent 协作页的 Agent 名称、响应时间、在线状态仍是前端常量。建议后端提供：

- 当前 session 最近一次 Agent 编排链路。
- 每个 Agent 的执行状态：`idle / running / success / degraded / failed`。
- 每个 Agent 的真实耗时。
- 是否命中缓存、是否触发熔断、是否降级。
- Reviewer 内部 Debate / Socrates / Evaluator 的子阶段状态。

建议接口示例：

```text
GET /api/sessions/{session_id}/agent-trace
```

### 4.3 学习时长与连续学习天数

前端之前看到 `daily_learning_minutes / streak_days` 字段，但目前逻辑不够清晰。建议后端明确：

- `daily_learning_minutes`：按当天 session 行为事件的活跃时间窗口计算，而不是简单页面打开时间。
- `streak_days`：按自然日是否存在有效学习事件计算。
- 有效学习事件建议包括：
  - 发送学习对话
  - 查看/切换资源
  - 提交练习
  - 运行代码
  - 查看提示
  - 完成掌握度分析
- 页面空闲超过一定时间后不再累计学习时长。

### 4.4 知识图谱路径由后端驱动

前端已经实现六边形地图、路径高亮、节点详情和生成资源入口，但更合理的架构是由后端驱动整张地图：

- 后端返回节点坐标或布局层级。
- 后端返回当前学习路径节点列表。
- 后端返回路径边、推荐理由、前置依赖和掌握度。
- 点击任意节点生成路径时，后端根据知识图谱重新规划路径，前端只负责渲染金光路径。

建议接口补充：

```text
POST /api/graph/path
GET /api/graph/layout
```

### 4.5 学习资源生成与版本演进

当前资源生成已能在前端展示，但建议后端进一步明确：

- “路径终点资源”和“节点资源”生成逻辑是否共用同一接口。
- 资源生成是否必须带 session/profile。
- 资源版本是否按 `concept + profile_hash` 缓存。
- 资源审核报告是否返回结构化字段，而不是仅返回文本。
- 知识熔炉触发后是否返回 v1.0 -> v1.1 -> v1.2 的版本链路。

### 4.6 代码沙箱变量快照格式标准化

前端已兼容多种 `variables` 返回格式，但建议后端统一为数组：

```json
[
  {
    "name": "content",
    "type": "str",
    "value": "hello"
  }
]
```

这样前端可以减少兼容分支，也方便后续做变量变化时间线。

### 4.7 苏格拉底式辅导上下文连续性

前端已支持提示、参考思路、继续引导，但后端需要进一步保证：

- 每次继续引导不是重复上一轮问题。
- `socratic_depth` 按 session 持久化。
- 后端返回 `stage / question / hint / reasoning_prompt / answer / can_provide_answer`。
- 当用户点击查看提示或继续引导时，后端知道当前轮次和上一轮问题。

## 5. 后端目前发现的问题

### 5.1 初始画像仍是默认画像

创建 session 时默认画像固定为：

- 初学者
- 视觉型
- 场依存
- normal
- application
- 已掌握 Python 简介

这对 Demo 有帮助，但如果评委追问“画像如何得出”，需要说明当前初始值是冷启动默认，后续由对话和行为更新。

### 5.2 Mock LLM 会导致画像固定

如果后端未配置真实 DeepSeek API Key 或处于 mock 模式，Profiler 可能返回固定画像，例如：

- `knowledge_level = 2.0`
- `cognitive_modality = visual`
- `learning_pace = normal`
- `mastered_concepts = Python简介、变量与赋值`

这会导致用户切换听觉型或动觉型后，聊天返回又把画像覆盖成视觉型。前端已经规避了一部分覆盖问题，但根因仍在后端画像推断或 mock 返回。

### 5.3 画像证据没有形成前端可直接展示的聚合结果

后端已有行为事件和 cognitive evidence 记录能力，但当前前端仍需要自己解释和拼接。建议后端输出更明确的聚合字段。

### 5.4 Agent 状态没有真实追踪接口

目前前端展示的 Agent 响应时间和在线状态无法证明来自后端。建议后端增加 trace，供前端实时展示。

### 5.5 学习时长和连续天数逻辑未明确

如果 `daily_learning_minutes / streak_days` 要展示在画像或进度页，需要后端确认计算口径，否则容易被评委追问。

### 5.6 BKT 默认参数容易误导用户

当前 guess/slip 可能显示默认参数。如果没有真实练习数据，建议后端返回：

- `is_default = true`
- `sample_count`
- `last_updated`
- `explanation`

前端可据此展示“默认参数，等待更多练习数据校准”。

### 5.7 资源生成接口的 profile 参数形式需要统一

当前部分资源接口通过 query 参数传 profile，复杂对象不适合放 query。建议改为 POST JSON body：

```json
{
  "session_id": "...",
  "concept": "文件读写",
  "profile": {}
}
```

### 5.8 后端中文注释存在编码显示异常

部分后端文件在 PowerShell 中读取时出现中文乱码，建议统一确认文件编码为 UTF-8，避免评审或队友打开时影响可读性。

## 6. 已验证内容

- 前端构建命令已通过：

```powershell
npm run build
```

- 本次构建通过 TypeScript 检查和 Vite 打包。

## 7. 提交注意事项

- 本次提交不会包含根目录重复素材图：
  - `eduhive-command-bg.png`
  - `eduhive-logo-mark.png`
  - `eduhive-logo-mark-old.png`
  - `student-avatar-visual.png`
- 前端实际使用的素材位于 `frontend/public/assets/`。
- 根目录旧版分工和计划书副本也不纳入本次提交，避免重复文档污染。

