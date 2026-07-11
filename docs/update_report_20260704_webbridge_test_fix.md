# WebBridge 全流程测试修复报告

> 时间：2026-07-04  
> 测试视角：学生首次进入 Command Center 的全流程操作  
> 测试工具：Kimi WebBridge（端口 10086）+ 自定义 Python 测试脚本  
> 后端：`LLM_PROVIDER=mock`，端口 8001  
> 前端：Vite 5173

---

## 1. 测试目标

以学生视角，从首次进入页面开始，验证以下闭环是否打通：

1. 查看学习画像
2. 浏览知识图谱、选择知识点
3. 规划学习路径
4. 生成并查看学习资源
5. 与学习 Agent 对话
6. 在代码沙箱运行代码
7. 查看掌握进度
8. 返回画像/图谱，确认状态一致

---

## 2. 发现的问题与修复

| # | 问题 | 影响 | 修复文件 | 修复方式 |
|---|---|---|---|---|
| 1 | Mock 模式下资源审核报 `ast_violations` 未定义，导致资源生成失败 | 学生无法生成学习资源 | `backend/app/agents/reviewer/reviewer_agent.py` | Mock 路径下显式初始化 `ast_violations: List[str] = []` |
| 2 | 切换知识节点后，聊天页“当前学习目标”仍显示初始目标 `Python简介`，与图谱/资源页不同步 | 学生提问主题与当前学习点不一致 | `frontend/src/App.tsx` | ① `selectedConcept` 变化时同步更新首条 Socrates 欢迎语；② `ChatCommand` 接收 `selectedConcept` 作为当前目标 |
| 3 | 根目录堆积大量 WebBridge 测试截图，`git status` 杂乱 | 仓库状态混乱 | `.gitignore` | 新增 `docs/test-screenshots/` 忽略规则，并将 113 张截图移入该目录 |

> 说明：其余问题（Mock 生成提速、Reviewer 超时、画像置信度、已掌握节点数、路径规划视觉反馈、输入框修复等）已在更早的 commit 中完成，本次测试主要用于端到端验证。

---

## 3. 验证方式

使用 `webbridge_test_v3.py` 脚本完成学生视角自动化操作，共生成 19 张全流程截图：

```text
test_v3_01_profile.png       # 学习画像首页
test_v3_02_graph_initial.png # 知识图谱初始状态
test_v3_03_node_selected.png # 选中“文件操作”节点
test_v3_04_path_planned.png  # 规划路径后高亮路径
test_v3_05_resource_generating.png  # 资源生成中
test_v3_06_resource_generated.png   # 资源生成完成
test_v3_07_exercise_tab.png         # 练习题标签页
test_v3_08_chat_initial.png         # 聊天页初始状态
test_v3_09_chat_typed.png           # 学生输入问题
test_v3_10_chat_sent.png            # 消息已发送
test_v3_11_chat_reply.png           # Agent 回复
test_v3_12_code_sandbox.png         # 代码沙箱
test_v3_13_code_run.png             # 代码运行成功
test_v3_14_progress.png             # 掌握进度页
test_v3_15_progress_cell.png        # 热力图选中单元格
test_v3_16_profile.png              # 返回画像页
test_v3_17_profile_detail.png       # 画像详情
test_v3_18_profile_evidence.png     # 画像证据展开
test_v3_19_graph_final.png          # 最终图谱状态
```

截图存放位置：`docs/test-screenshots/`

---

## 4. 关键验证结果

- ✅ 知识图谱可正常渲染 33 节点 + 36 边
- ✅ 选中“文件操作”后，路径规划、资源生成均围绕该节点
- ✅ 资源生成后，学习资源页显示「文件操作」资源包，含练习题/代码案例
- ✅ 聊天页“当前学习目标”正确显示为 **文件操作**
- ✅ 学生提问后，Profiler 回复内容围绕 **文件操作**（`open()` / `with` 语句）
- ✅ 代码沙箱可运行 Python 代码
- ✅ 画像页“已掌握概念”与图谱状态一致

---

## 5. 仍存在的已知问题

| 问题 | 原因 | 是否 Bug |
|---|---|---|
| 掌握进度热力图显示“暂无真实掌握度数据” | BKT 模型需要真实练习提交/代码运行记录才会更新 | 否，产品特性 |
| 麦克风按钮无法真正录入 | 浏览器未授权麦克风，点击仅切换 UI 状态 | 否，环境限制 |
| 本地 8000 端口残留 TIME_WAIT | 之前后端启动在 8000，已切换至 8001，不影响运行 | 否 |

---

## 6. 合并说明

本次修复后，合并同学分支 `feature/neo4j-docker-verify`（Docker/Neo4j 验证 + 部署文档 + 知识熔炉去重锁），`main` 分支即包含：

- Command Center 交互打磨（前序已合）
- WebBridge 全流程测试修复（本次）
- Docker / Neo4j 部署验证与文档（同学分支）
