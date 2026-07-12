# 数字人助教功能更新报告

> 分支：`feature/digital-human` | 日期：2026-07-12 | 基于：`feature/frontend-command-center-polish`

---

## 一、概述

本次更新为智学蜂巢 EduHive 新增了完整的数字人助教系统，包括全局浮动助教、智能对话问答、语音输入/输出、表情系统、全屏模式等功能。同时完善了三种认知风格的差异化资源展示（文字型/视觉型/听觉型）。

---

## 二、新增文件

| 文件 | 说明 |
|------|------|
| `frontend/src/components/digital-human/FloatingAssistant.tsx` | 全局浮动数字人助教（主组件） |
| `frontend/src/components/digital-human/DigitalHuman.tsx` | 内嵌式数字人教师（资源面板内） |
| `frontend/src/components/digital-human/useSparkTTS.ts` | 讯飞 TTS Hook（自动检测+回退） |
| `frontend/src/components/digital-human/useSpeechRecognition.ts` | 浏览器语音识别 Hook |
| `backend/app/api/assistant.py` | `/api/assistant/ask` 智能问答接口 |
| `backend/app/api/tts.py` | `/api/tts/synthesize` 语音合成接口 |
| `backend/app/services/spark_tts.py` | 讯飞在线语音合成客户端 |

## 三、修改文件

| 文件 | 改动 |
|------|------|
| `frontend/src/App.tsx` | 挂载 FloatingAssistant + styleMode 改为 text/visual/auditory |
| `frontend/src/components/command-center/WorkspaceDock.tsx` | 全局风格切换改为📖文字型/👁视觉型/👂听觉型 |
| `frontend/src/components/command-center/ProfilePanel.tsx` | 认知风格映射支持 text 类型 |
| `frontend/src/components/command-center/ResourceLibraryPanel.tsx` | 接入风格切换 + B站视频 + 数字人 |
| `frontend/src/components/resources/CognitiveStyleRenderer.tsx` | 新增 BilibiliVideoPlayer + TTSReader 组件 |
| `frontend/src/components/resources/ResourceViewer.tsx` | 默认风格改为 text |
| `frontend/src/services/api.ts` | 新增 assistantApi + ttsApi |
| `frontend/vite.config.ts` | 代理端口改为 8001 |
| `backend/app/main.py` | 注册 assistant + tts 路由 |
| `backend/app/api/sessions.py` | cognitive_modality 校验增加 "text" |
| `backend/app/models/schemas.py` | cognitive_modality 描述更新 |
| `backend/app/core/config.py` | 新增 SPARK_TTS_* 配置项 |

---

## 四、功能详解

### 4.1 全局浮动数字人助教 (FloatingAssistant)

- **位置**：右下角固定，可自由拖动到屏幕任意位置
- **收起态**：64px 圆形头像 + 呼吸动画 + 旋转光环
- **展开态**：320px 面板，包含引导介绍 + 对话问答 + TTS 朗读 + 语音输入
- **全屏模式**：420×600px 居中显示，毛玻璃背景遮罩，沉浸式交互
- **自动弹出**：首次进入 3 秒后自动展开欢迎

### 4.2 智能问答

- 用户可通过**文字输入**或**语音输入**提问
- 问题发送至 `/api/assistant/ask`，由后端 LLM 生成回答
- 支持 Mock 模式（无 API Key 时返回占位回答）
- 快捷提问按钮：常用问题一键发送

### 4.3 语音交互

| 功能 | 实现方式 | 状态 |
|------|---------|------|
| 语音合成 (TTS) | 讯飞在线语音合成 → 浏览器 SpeechSynthesis 回退 | ✅ |
| 语音识别 (ASR) | 浏览器 SpeechRecognition API（Chrome/Edge） | ✅ |
| 自动朗读 | AI 回答后自动 TTS 朗读 | ✅ |

> 注：讯飞 TTS 需在 `.env` 中配置 `SPARK_TTS_APP_ID` + `SPARK_TTS_API_KEY` + `SPARK_TTS_API_SECRET`。未配置时自动使用浏览器内置语音。

### 4.4 表情系统

数字人根据 AI 回答内容自动切换表情：

| 表情 | Emoji | 触发关键词 |
|------|-------|-----------|
| 开心 | 😊 | 恭喜、正确、通过、很好、太棒 |
| 思考 | 🤔 | 思考、分析、等等、让我想 |
| 疑惑 | 😅 | 抱歉、不确定、无法、可惜 |
| 鼓励 | 💪 | 加油、试试、练习、坚持、你能行 |
| 默认 | 👩‍🏫 | 其他情况 |

### 4.5 认知风格三模式

| 模式 | 图标 | 展示方式 |
|------|------|---------|
| 📖 文字型 | FileText | 纯讲义文本，干净无干扰 |
| 👁 视觉型 | Eye | 讲义上方嵌入 B站教学视频播放器 |
| 👂 听觉型 | Ear | 数字人教师朗读 + 讲解稿展示 |

- 视频通过知识点名映射 B站 BV 号（一期覆盖"变量与赋值"）
- 风格切换在 WorkspaceDock（全局）和 ResourceLibraryPanel（资源页内）两处同步

### 4.6 定时提醒 & 气泡提示

- **学习提醒**：每 30 分钟弹出休息提示
- **气泡提示**：收起状态下每 60 秒自动弹出操作建议（语音输入/视觉型/听觉型等）

---

## 五、架构图

```
┌─────────────────────────────────────────────────┐
│                    App.tsx                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │Workspace │  │Resource  │  │Floating       │  │
│  │Dock      │  │Library   │  │Assistant      │  │
│  │          │  │Panel     │  │               │  │
│  │文字/视觉  │  │┌───────┐│  │ 👩‍🏫 小蜂      │  │
│  │/听觉切换  │  ││视频    ││  │ 💬 对话问答   │  │
│  │          │  ││TTS     ││  │ 🎤 语音输入   │  │
│  │          │  ││数字人   ││  │ 🔊 TTS朗读   │  │
│  │          │  │└───────┘│  │ 😊 表情系统   │  │
│  └──────────┘  └──────────┘  └───────┬───────┘  │
│                                       │          │
└───────────────────────────────────────┼──────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │               Backend                  │
                    │  /api/assistant/ask     /api/tts/...   │
                    │        │                     │         │
                    │   LLM Provider          Spark TTS      │
                    │  (DeepSeek/Mock)      (讯飞/Browser)    │
                    └────────────────────────────────────────┘
```

---

## 六、部署说明

1. 后端启动：`cd backend && uvicorn app.main:app --port 8001`
2. 前端启动：`cd frontend && npm run dev`（需 Node.js ≥ 18）
3. 讯飞 TTS 可选——不填凭证时自动回退浏览器语音
4. Chrome/Edge 浏览器可获得完整语音交互体验

---

## 七、待完成

- [ ] 讯飞 TTS API 鉴权调试（当前 REST 端点返回 10106）
- [ ] 知识点→B站视频映射扩充
- [ ] 数字人形象更换（支持上传自定义图片）
- [ ] 学习提醒可自定义间隔
- [ ] 对话历史持久化

---

> 🤖 本报告由 Claude Code 辅助生成 | 分支 `feature/digital-human` | 2026-07-12
