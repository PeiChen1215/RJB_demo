# `feature/frontend-command-center` 前端 Review 与返工清单

> **日期**：2026-07-02  
> **Review 人**：Kimi Code CLI（后端/联调侧）  
> **被 Review 分支**：`feature/frontend-command-center`  
> **原提交**：`38668e1 feat(frontend): build command center learning flow`  
> **目标**：在保留 Command Center 视觉外壳的前提下，修复功能回归，使其真正接死后端接口。

---

## 一、总体评价

### ✅ 做得好的地方

- 视觉风格从“原型组件集合”升级为“产品级指挥中心”，Demo 卖相提升明显。
- 多页导航符合 Demo 主线流程：`学习画像 → 知识图谱 → 学习资源 → 学习对话 → 代码沙箱 → 掌握进度`。
- 知识图谱小地图、Agent 协作面板、生成进度展示等交互有亮点。
- `environment.yml`、`scripts/run_backend.ps1`、`.gitignore` 补充了工程化支持。
- 前端构建通过。

### ⚠️ 核心问题

**功能层面存在明显回归**。新版 `App.tsx` 是一个 1700+ 行的 monolith，没有复用我们之前 Sprint 2/3 已经联调通过的功能组件，导致后端返回的真实数据没有被正确消费，部分页面只剩“壳”。

**当前不要合并到 `main`**，请在本分支上按以下清单修复后再提交 PR。

---

## 二、返工清单

### P0（阻塞级，必须先修）

#### 1. 苏格拉底辅导链退化成纯文本

**问题描述**：

当前 `sendChat` 只把后端返回的 `agent_response.content.message` 直接塞进 `chatReply` 文本框。当后端返回 `response_type === 'tutor'` 时，原本应该展示阶段标签、提示、查看思路、继续引导按钮，现在全部丢失。

**影响**：A9 苏格拉底辅导链前端联调成果被覆盖。

**修改要求**：

1. 在 `ChatCommand` 或 `sendChat` 的 complete 处理中，判断 `agent_response.response_type === 'tutor'`。
2. 如果命中 tutor，使用 `frontend/src/components/socratic/SocraticPanel.tsx` 渲染。
3. `SocraticPanel` 需要的字段：
   - `question`（已兼容：后端同时返回 `message` 和 `question`）
   - `hint`
   - `answer`
   - `can_provide_answer`
   - `stage`
4. “继续引导”按钮调用 `sessionApi.chatStream(session.session_id, '请继续引导我')`。

**验收标准**：

- 学生输入代码错误后，聊天区展示 `SocraticPanel`，显示当前阶段（澄清/探查/验证/反例/收敛）。
- 点击“查看提示”显示 hint，点击“继续引导”进入下一阶段，连续点击 5 次后到达收敛阶段。
- 后端 `socratic_depth` 已持久化，不会出现点击“继续引导”后回退到 Profiler 的情况。

**参考文件**：

- `frontend/src/components/socratic/SocraticPanel.tsx`
- `backend/app/agents/orchestrator.py`（`_tutor_flow` / `_is_continue_tutor`）
- 后端返回示例见 `logs/c4_demo_chain.py` 运行输出

---

#### 2. 掌握度热力图变成装饰性网格

**问题描述**：

`HeatmapPanel` 拿到后端真实 `heatmap` 数据后，用取模方式把数值硬塞进一个固定的 `6×8` 网格，没有按知识点展示。B10 联调时“变量与赋值 100% / 8 次练习 / 已掌握”的真实数据无法体现。

**影响**：B10 掌握度热力图联调成果被覆盖。

**修改要求**：

二选一：

- **方案 A（推荐）**：直接复用 `frontend/src/components/evaluation/MasteryHeatmap.tsx`，用真实 `items`（`concept` + `mastery_probability`）渲染。
- **方案 B**：改造 `HeatmapPanel`，按 `items` 数组渲染每个知识点的掌握度，颜色分级：已掌握（绿）、需巩固（黄）、薄弱（橙）、待学习（红）。

**验收标准**：

- 热力图每个格子对应一个真实知识点。
- 已掌握知识点显示绿色，未掌握显示红色/橙色。
- 点击格子可触发 `behaviorApi.log('heatmap_cell_selected', ...)`。

**参考文件**：

- `frontend/src/components/evaluation/MasteryHeatmap.tsx`
- 后端接口：`/api/evaluation/heatmap`

---

#### 3. 学习资源页面只有“壳”，没有渲染真实资源内容

**问题描述**：

`ResourceLibraryPanel` 显示生成状态、版本 chip、思维路径，但没有展示后端返回的 `package.document / mindmap / exercises / code_cases / debate_report`。

**影响**：C4 主链路中“资源生成 → 辩论审核”的结果对学生不可见。

**修改要求**：

1. 资源生成完成后，保存完整的 `agent_response.content`。
2. 在“学习资源”页面增加资源内容渲染区：
   - 讲义文档（Markdown）
   - 思维导图（可先用文本/Mermaid）
   - 练习题列表
   - 代码案例
   - 辩论审核结论
3. 可复用 `frontend/src/components/resources/ResourceViewer.tsx` 或参考其实现。

**验收标准**：

- 生成资源后，学生能在“学习资源”页看到该知识点的讲义、练习、代码案例。
- 辩论报告（状态/审核意见）可见。
- 支持认知风格切换（视觉/听觉/动觉）渲染资源文档。

**参考文件**：

- `frontend/src/components/resources/ResourceViewer.tsx`
- `frontend/src/components/resources/CognitiveStyleRenderer.tsx`
- 后端返回示例：`logs/c4_demo_chain.py` 输出中的 `package` / `debate_report`

---

### P1（重要，建议本 Sprint 内修完）

#### 4. 大量硬编码 Demo 数据

**问题描述**：

多处写死“Python 文件操作”作为学习目标和默认输入，导致系统无法根据学生实际会话动态变化。

**影响**：Demo 看起来是“演”的，不能体现“个性化”卖点。

**修改要求**：

把以下硬编码全部改为从 `session` 或 `session.target_concept` 读取：

```tsx
// 当前写死
sessionApi.create('Python 文件操作')
const [chatInput, setChatInput] = useState('我想学习 Python 文件操作')
<span>目标：Python 文件操作</span>
<ProfileLine label="学习目标" value="通过 Python 文件操作练习" />
```

改为：

```tsx
const targetConcept = session?.target_concept || 'Python 基础'
sessionApi.create(targetConcept)
const [chatInput, setChatInput] = useState(targetConcept ? `我想学习 ${targetConcept}` : '你好')
<span>目标：{targetConcept}</span>
```

**验收标准**：

- 创建会话时传入不同 `target_concept`，首页显示对应目标。
- 初始聊天输入根据目标动态生成。

---

#### 5. 侧边栏学习时长/连续学习数据写死

**问题描述**：

`LearningMeter` 和 `StreakCard` 分别写死“今日 42 分钟/目标 60 分钟”和“连续学习 7 天”。

**影响**：数据不可信，决赛评委可能会质疑。

**修改要求**：

- 短期：从 `stats` 计算今日学习时长，没有数据时显示“--”或隐藏。
- 长期：后端增加 `daily_learning_minutes` / `streak_days` 接口。

**验收标准**：

- 没有真实数据时不显示虚假数字。
- 或者至少说明“演示数据”。

---

#### 6. `App.tsx` 过于臃肿（1700+ 行）

**问题描述**：

所有子组件（`ProfilePanel / KnowledgePanel / ResourceLibraryPanel / ChatCommand / CodeCommand / HeatmapPanel / WorkspaceDock` 等）全写在一个文件里，可维护性差。

**影响**：后续三人联调、Bug 修复、合并冲突都会非常困难。

**修改要求**：

把 `App.tsx` 中的子组件拆到独立文件，建议目录结构：

```
frontend/src/components/command-center/
  App.tsx                    # 只负责导航和全局状态
  ProfilePanel.tsx
  KnowledgePanel.tsx
  ResourceLibraryPanel.tsx
  ChatCommand.tsx
  CodeCommand.tsx
  HeatmapPanel.tsx
  WorkspaceDock.tsx
  TopBar.tsx
  SideNav.tsx
  HexBackdrop.tsx
  ...
```

**验收标准**：

- `App.tsx` 行数控制在 400 行以内。
- 每个子组件可独立查看和修改。

---

### P2（建议优化，可放到下一阶段）

#### 7. 代码沙箱从 Pyodide 改为后端执行

**问题描述**：

当前 `CodeCommand` 调用 `codeApi.execute` 把代码发到后端执行，依赖后端服务，且失去了浏览器本地运行的能力。

**影响**：

- 后端挂了代码沙箱就不能用。
- 之前 `PyodideSandbox` 实现的本地执行、变量可视化等优点丢失。

**修改要求**：

评估是否保留 `PyodideSandbox` 作为前端执行选项，后端 `/code/execute` 作为备选。或者至少在后端不可用时给出友好提示。

**参考文件**：

- `frontend/src/components/code/PyodideSandbox.tsx`

---

## 三、分工建议

| 负责人 | 任务 |
|---|---|
| **C 同学** | 负责上述 P0/P1 前端修改；继续打磨视觉和动画；拆分 `App.tsx` 组件 |
| **后端/联调侧** | 提供接口返回示例；确认字段格式；验收 P0 功能；协助调试后端相关问题 |

**建议工作流**：

1. C 同学在本分支 `feature/frontend-command-center` 上修改。
2. 每修完一个 P0/P1 项，本地 `npm run build` 通过后提交。
3. 后端侧用 `logs/c4_demo_chain.py` 和真实 DeepSeek 模式跑一遍完整链路验收。
4. 全部 P0 修完后再考虑合并到 `main`。

---

## 四、验收 Checklist

- [ ] 输入代码错误后，聊天区出现 `SocraticPanel`，含阶段/提示/继续引导。
- [ ] 连续点击“继续引导”5 次，阶段从 clarification 推进到 convergence。
- [ ] 热力图按真实知识点展示掌握度，颜色和数值正确。
- [ ] “学习资源”页展示真实生成的讲义、练习、代码案例、辩论报告。
- [ ] 首页学习目标从 `session.target_concept` 读取，不再写死“Python 文件操作”。
- [ ] 侧边栏没有虚假写死数据（或明确标注为演示数据）。
- [ ] `npm run build` 通过。
- [ ] `App.tsx` 已拆分，行数 ≤ 400 行。
- [ ] 后端 `logs/c4_demo_chain.py` 全链路跑通。

---

## 五、注意事项

1. **不要直接合并到 `main`**：当前分支功能不完整，合并会导致 A9/B10 已经联调通过的功能在 `main` 上不可用。
2. **优先复用已有组件**：`frontend/src/components/` 下已经有很多联调过的组件，尽量不要重新造轮子。
3. **后端接口字段已稳定**：如有疑问，先看 `logs/c4_demo_chain.py` 的运行输出，或直接问后端侧。
4. **编码问题**：所有涉及中文数据库写入/HTTP 请求的脚本，请用 Python UTF-8 执行，避免 PowerShell 终端编码导致 `?????` 乱码。
