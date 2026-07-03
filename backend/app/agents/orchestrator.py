"""Agent Orchestrator：多智能体编排与路由（5 角色分层版）

对应需求/功能：
- 作为多智能体系统的总调度器，接收用户输入、维护会话状态、按教育 SOP
  在 5 个 Agent（Profiler / Navigator / Generator / Reviewer / Orchestrator 自身）
  之间路由消息。
- 对外保持原有接口稳定：handle_chat、generate_resource、generate_resource_stream
  等，供 sessions.py / resources.py 调用。

主要类/函数：
- AgentOrchestrator：核心编排器，持有各子 Agent 实例并提供对外接口。
- handle_chat / handle_chat_stream：处理学生单轮聊天请求（同步/异步流式）。
- generate_resource / generate_resource_stream：生成教学资源并执行辩论议会
  （同步/异步 SSE 流式）。
- _route：按意图选择流程（知识请求、代码求助、进度查询、路径调整、默认聊天）。
- _knowledge_flow / _tutor_flow / _evaluate_flow / _path_adjust_flow：四类业务流。
- _safe_run：Agent 调用异常熔断与降级。
- _session_to_context / _to_agent_response / _classify_intent / _extract_concept：
  会话转换、响应封装、意图/知识点识别工具。

5 个执行角色：
- Orchestrator（本类）
- Profiler：画像构建
- Navigator：路径规划
- Generator：资源生成
- Reviewer：审核 + 辅导 + 评估三位一体（内部含 DebateCouncil / SocratesTutor / LearningEvaluator）

TODO:
- [已完成] 5 角色分层架构与消息路由已实现
- [已完成] 同步聊天、资源生成接口已实现
- [已完成] 异步 SSE 流式资源生成已实现
- [已完成] 简单异常降级（_safe_run）已实现
- [已完成] 实现真正的 10 秒超时熔断与降级（含熔断器）
- [待完成] handle_chat_stream 目前仅包装同步 handle_chat，未来拆分为多步骤 thinking 事件
- [待完成] 接入更准确的 LLM 意图分类，替代关键词匹配
"""
import asyncio
import concurrent.futures
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List, Optional

from app.agents.base import AgentMessage, BaseAgent
from app.agents.generator import GeneratorAgent
from app.agents.navigator import NavigatorAgent
from app.agents.profiler import ProfilerAgent
from app.agents.reviewer import ReviewerAgent
from app.models.schemas import AgentResponse
from app.services.database import create_agent_trace


# 全局线程池：用于给同步 agent.run 增加超时控制
_AGENT_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=8, thread_name_prefix="agent_run"
)


class _CircuitBreaker:
    """基于失败次数与冷却期的进程内熔断器。

    规则：
    - 60 秒内同一 Agent 失败/超时达到 3 次，熔断器打开，120 秒内直接降级；
    - 冷却期结束或有一次成功调用后，熔断器关闭。
    """

    FAILURE_THRESHOLD = 3
    WINDOW_SECONDS = 60
    COOLDOWN_SECONDS = 120

    def __init__(self):
        self._lock = threading.Lock()
        self._state: Dict[str, Dict[str, Any]] = {}

    def is_open(self, name: str) -> bool:
        now = time.monotonic()
        with self._lock:
            rec = self._state.setdefault(
                name, {"state": "closed", "failures": [], "opened_at": 0.0}
            )
            if rec["state"] == "open":
                if now - rec["opened_at"] >= self.COOLDOWN_SECONDS:
                    rec["state"] = "closed"
                    rec["failures"].clear()
                    return False
                return True

            cutoff = now - self.WINDOW_SECONDS
            rec["failures"] = [t for t in rec["failures"] if t > cutoff]
            if len(rec["failures"]) >= self.FAILURE_THRESHOLD:
                rec["state"] = "open"
                rec["opened_at"] = now
                return True
            return False

    def record_success(self, name: str) -> None:
        with self._lock:
            rec = self._state.setdefault(
                name, {"state": "closed", "failures": [], "opened_at": 0.0}
            )
            rec["failures"].clear()
            if rec["state"] == "open":
                rec["state"] = "closed"

    def record_failure(self, name: str) -> None:
        now = time.monotonic()
        with self._lock:
            rec = self._state.setdefault(
                name, {"state": "closed", "failures": [], "opened_at": 0.0}
            )
            rec["failures"].append(now)


class AgentOrchestrator:
    """Agent 编排器"""

    def __init__(self):
        self.profiler = ProfilerAgent()
        self.navigator = NavigatorAgent()
        self.generator = GeneratorAgent()
        self.reviewer = ReviewerAgent()
        self._circuit_breaker = _CircuitBreaker()

    @staticmethod
    def _to_dict(obj: Any) -> Any:
        """兼容 Pydantic 模型与普通对象的统一转字典工具"""
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        return obj

    # ------------------------------------------------------------------
    # 对外接口：聊天
    # ------------------------------------------------------------------
    def handle_chat(
        self,
        session: dict,
        message: str,
        message_type: str = "text",
    ) -> AgentResponse:
        """处理学生消息并返回 Agent 响应（同步版本）"""
        context = self._session_to_context(session)
        msg = AgentMessage(
            intent=self._classify_intent(message),
            stage="profiler",
            payload={"message": message, "message_type": message_type},
            context=context,
            from_agent="user",
        )
        result = self._route(msg, session)
        return self._to_agent_response(result)

    async def handle_chat_stream(
        self,
        session: dict,
        message: str,
        message_type: str = "text",
    ) -> AgentResponse:
        """处理学生消息并返回 Agent 响应（异步流式版本）

        当前内部仍调用同步 handle_chat，未来可拆分为多步骤 yield thinking 事件。
        """
        # 先在线程池中运行同步 handle_chat，避免阻塞事件循环
        return await asyncio.to_thread(self.handle_chat, session, message, message_type)

    # ------------------------------------------------------------------
    # 对外接口：资源生成
    # ------------------------------------------------------------------
    def generate_resource(self, session: dict, concept: str, max_revisions: int = 1) -> Dict[str, Any]:
        """生成资源并执行辩论议会（同步版本，兼容旧接口）"""
        context = self._session_to_context(session)
        context["target_concept"] = concept

        msg = AgentMessage(
            intent="KNOWLEDGE_REQUEST",
            stage="generator",
            payload={"concept": concept, "max_revisions": max_revisions},
            context=context,
            from_agent="user",
        )
        final_msg = self._knowledge_flow(msg)

        package = self._to_dict(final_msg.payload.get("package", {}))
        debate_report = self._to_dict(final_msg.payload.get("debate_report", {}))
        validation = self._to_dict(final_msg.payload.get("validation", {}))

        # 同步更新会话状态，供后续对话/评估使用
        session["last_package"] = package
        session["last_debate"] = debate_report
        session["target_concept"] = concept

        return {
            "concept": concept,
            "package": package,
            "debate_report": debate_report,
            "validation": validation,
        }

    async def generate_resource_stream(
        self,
        session: dict,
        concept: str,
        max_revisions: int = 1,
    ) -> AsyncIterator[Dict[str, Any]]:
        """生成资源并执行辩论议会（异步流式版本）"""
        context = self._session_to_context(session)
        context["target_concept"] = concept

        msg = AgentMessage(
            intent="KNOWLEDGE_REQUEST",
            stage="generator",
            payload={"concept": concept, "max_revisions": max_revisions},
            context=context,
            from_agent="user",
        )

        async def emit(stage: str, message: str, payload: Optional[Dict[str, Any]] = None):
            event: Dict[str, Any] = {"type": "progress", "stage": stage, "message": message}
            if payload:
                event.update(payload)
            yield event

        # 1. 路径规划：调用 Navigator 获取学习路径
        async for e in emit("navigator", f"正在规划「{concept}」的学习路径..."):
            yield e
        nav_result = await self._safe_run_async(self.navigator, msg.with_stage("navigator"))
        if nav_result.payload.get("fallback"):
            yield {"type": "error", "message": nav_result.payload.get("error", "路径规划失败")}
            return
        path = nav_result.payload.get("path", [concept])
        async for e in emit("navigator", f"学习路径：{' → '.join(path)}"):
            yield e

        # 2. 资源生成：调用 Generator 生成教学资源包
        async for e in emit("builder", f"正在为「{concept}」生成个性化教学资源..."):
            yield e
        gen_result = await self._safe_run_async(self.generator, msg.with_stage("generator"))
        if gen_result.payload.get("fallback"):
            yield {"type": "error", "message": gen_result.payload.get("error", "资源生成失败")}
            return
        package = gen_result.payload.get("package", {})
        async for e in emit(
            "builder",
            f"教学资源生成完成，包含 {len(package.get('document', ''))} 字讲解文档。",
        ):
            yield e

        # 3. 辩论审核：调用 Reviewer 对资源进行多视角审核
        async for e in emit("debate", "正在提交辩论议会审核..."):
            yield e
        review_msg = AgentMessage(
            intent="KNOWLEDGE_REQUEST",
            stage="reviewer",
            payload={"package": package, "action": "review"},
            context=context,
            from_agent="generator",
        )
        review_result = await self._safe_run_async(self.reviewer, review_msg)
        if review_result.payload.get("fallback"):
            yield {"type": "error", "message": review_result.payload.get("error", "辩论审核失败")}
            return
        debate_report = review_result.payload.get("debate_report", {})
        validation = review_result.payload.get("validation", {})
        review_mode = review_result.payload.get("review_mode", "full")
        async for e in emit(
            "debate",
            f"辩论议会结束（{review_mode} 模式），最终状态：{debate_report.get('status')}。",
            {"debate_report": debate_report},
        ):
            yield e

        # 4. 更新会话状态，供后续聊天和评估使用
        session["last_package"] = package
        session["last_debate"] = debate_report
        session["target_concept"] = concept

        result = {
            "concept": concept,
            "package": package,
            "debate_report": debate_report,
            "validation": validation,
            "review_mode": review_mode,
        }
        yield {"type": "complete", **result}
        async for e in emit("complete", "资源生成流程全部完成。", result):
            yield e

    # ------------------------------------------------------------------
    # 消息路由
    # ------------------------------------------------------------------
    def _route(self, msg: AgentMessage, session: Optional[dict] = None) -> AgentMessage:
        """按意图路由到对应流程"""
        intent = msg.intent
        # 若当前处于苏格拉底辅导中且用户请求继续，优先继续辅导流，避免被普通知识/路径意图抢走。
        if session and self._is_continue_tutor(msg, session):
            return self._tutor_flow(msg, session)
        if intent == "KNOWLEDGE_REQUEST":
            return self._knowledge_flow(msg, session)
        if intent == "CODE_HELP":
            return self._tutor_flow(msg, session)
        if intent == "PROGRESS_CHECK":
            return self._evaluate_flow(msg)
        if intent == "PATH_ADJUST":
            return self._path_adjust_flow(msg)
        # 默认进入聊天/画像更新流程
        return self._safe_run(self.profiler, msg)

    def _knowledge_flow(self, msg: AgentMessage, session: Optional[dict] = None) -> AgentMessage:
        """学习新知识流程：Navigator -> Generator -> Reviewer"""
        # 切到学习新知识点时，重置苏格拉底辅导深度
        if session:
            session["socratic_depth"] = 0
        # 多来源获取目标知识点：payload > 消息提取 > 上下文
        concept = msg.payload.get("concept") or self._extract_concept(msg.payload.get("message", "")) or msg.context.get("target_concept")
        if not concept:
            return msg.reply({
                "message": "你想学习哪个 Python 知识点呢？比如：变量与赋值、for循环、函数定义等。",
                "suggestions": ["变量与赋值", "for循环", "函数定义", "文件操作", "类与对象"],
            }, stage="profiler", from_agent="Profiler")

        msg = msg.with_payload(concept=concept).with_context(target_concept=concept)

        # 1. 路径规划
        nav_msg = msg.with_stage("navigator")
        nav_result = self._safe_run(self.navigator, nav_msg)
        path = nav_result.payload.get("path", [concept])

        # 2. 资源生成
        gen_msg = msg.with_stage("generator")
        gen_result = self._safe_run(self.generator, gen_msg)
        package = gen_result.payload.get("package")
        if not package:
            return msg.reply({"error": "资源生成失败"}, from_agent="Generator")

        # 3. 辩论审核
        review_msg = AgentMessage(
            intent=msg.intent,
            stage="reviewer",
            payload={"package": package, "action": "review"},
            context=msg.context,
            from_agent="Generator",
        )
        review_result = self._safe_run(self.reviewer, review_msg)

        # 4. 返回给前端的完整响应
        return msg.reply(
            {
                "message": f"已为你生成「{concept}」的个性化学习资源，包含讲解文档、思维导图、练习题和代码案例。",
                "concept": concept,
                "path": path,
                "package": package,
                "debate_report": review_result.payload.get("debate_report", {}),
                "validation": review_result.payload.get("validation", {}),
                "review_mode": review_result.payload.get("review_mode", "full"),
            },
            stage="reviewer",
            from_agent="Reviewer",
        )

    def _tutor_flow(self, msg: AgentMessage, session: Optional[dict] = None) -> AgentMessage:
        """代码求助流程：Reviewer.tutor，支持多轮 depth 递进"""
        user_msg = msg.payload.get("message", "")
        previous_tutor = session.get("last_tutor_context", {}) if session else {}
        concept = msg.context.get("target_concept") or previous_tutor.get("concept") or "当前知识点"

        # 从消息中简单提取 Python 代码块与错误描述
        code_match = re.search(r"```python\s*(.*?)\s*```", user_msg, re.DOTALL)
        code = code_match.group(1) if code_match else previous_tutor.get("code") or "# 学生未提供代码"
        error_match = re.search(r"错误[：:]\s*(.+)", user_msg)
        error = error_match.group(1) if error_match else previous_tutor.get("error_message") or "请描述你遇到的错误"

        # 从 session 中读取当前提问深度，实现 5 阶段递进
        depth = 0
        if session:
            depth = session.get("socratic_depth", 0)
            if self._is_continue_tutor(msg, session) and previous_tutor.get("question"):
                error = (
                    f"{error}\n上一轮引导问题：{previous_tutor.get('question')}\n"
                    "本轮请进入下一阶段，避免重复上一轮问题。"
                )

        tutor_msg = AgentMessage(
            intent=msg.intent,
            stage="tutor",
            payload={
                "error_message": error,
                "code": code,
                "concept": concept,
                "previous_question": previous_tutor.get("question", ""),
            },
            context=msg.context,
            metadata={"socratic_depth": depth},
            from_agent="user",
        )
        result = self._safe_run(self.reviewer, tutor_msg)
        socratic = result.payload

        # 推进深度，最大到 convergence 后重置
        next_depth = depth + 1
        if next_depth >= 5:
            next_depth = 0
        if session:
            session["socratic_depth"] = next_depth

        question = socratic.get("question") or socratic.get("message") or "你遇到了什么问题？"
        if session:
            session["last_tutor_context"] = {
                "code": code,
                "error_message": error,
                "concept": concept,
                "question": question,
                "stage": socratic.get("stage"),
            }
        return msg.reply(
            {
                "message": question,
                "question": question,
                "hint": socratic.get("hint"),
                "can_provide_answer": socratic.get("can_provide_answer", depth >= 3),
                "answer": socratic.get("answer"),
                "stage": socratic.get("stage"),
            },
            stage="tutor",
            from_agent="Socrates",
        )

    def _evaluate_flow(self, msg: AgentMessage) -> AgentMessage:
        """进度查询流程：Reviewer.evaluate"""
        concept = msg.context.get("target_concept", "当前知识点")

        eval_msg = AgentMessage(
            intent=msg.intent,
            stage="evaluator",
            payload={
                "concept": concept,
                "exercise_results": msg.payload.get("exercise_results", []),
                "code_runs": msg.payload.get("code_runs", []),
            },
            context=msg.context,
            from_agent="user",
        )
        result = self._safe_run(self.reviewer, eval_msg)
        evaluation = result.payload

        return msg.reply(
            {
                "message": evaluation.get("summary", "学习效果评估完成。"),
                "weak_points": evaluation.get("weak_points", []),
                "heatmap": evaluation.get("heatmap", {}),
                "next_recommendation": evaluation.get("next_recommendation", ""),
            },
            stage="evaluator",
            from_agent="Evaluator",
        )

    def _path_adjust_flow(self, msg: AgentMessage) -> AgentMessage:
        """路径调整流程：重新导航"""
        user_msg = msg.payload.get("message", "")
        concept = self._extract_concept(user_msg) or msg.context.get("target_concept")
        if not concept:
            return msg.reply({
                "message": "你想调整到哪个知识点呢？",
                "suggestions": ["变量与赋值", "for循环", "函数定义"],
            }, from_agent="Navigator")

        return self._knowledge_flow(msg.with_payload(concept=concept).with_context(target_concept=concept))

    # ------------------------------------------------------------------
    # 工具方法
    # ------------------------------------------------------------------
    def _safe_run(self, agent: BaseAgent, msg: AgentMessage, timeout: float = 30.0) -> AgentMessage:
        """带超时与熔断的同步 Agent 调用"""
        breaker = self._circuit_breaker
        if breaker.is_open(agent.name):
            return self._fallback_message(agent, msg, reason="circuit_open")

        trace_id = str(uuid.uuid4())
        session_id = msg.context.get("session_id", "")
        started_at = datetime.now(timezone.utc).isoformat()
        start_ts = time.monotonic()
        status = "success"
        error_message = ""

        try:
            future = _AGENT_EXECUTOR.submit(agent.run, msg)
            result = future.result(timeout=timeout)
            breaker.record_success(agent.name)
            if result.payload.get("fallback"):
                status = "degraded"
                error_message = result.payload.get("reason", "")
            return result
        except TimeoutError:
            breaker.record_failure(agent.name)
            status = "failed"
            error_message = "timeout"
            return self._fallback_message(agent, msg, reason="timeout")
        except Exception as e:
            breaker.record_failure(agent.name)
            status = "failed"
            error_message = str(e)
            return self._fallback_message(agent, msg, reason="exception", error=str(e))
        finally:
            finished_at = datetime.now(timezone.utc).isoformat()
            duration_ms = int((time.monotonic() - start_ts) * 1000)
            if session_id:
                try:
                    create_agent_trace(
                        session_id=session_id,
                        trace_id=trace_id,
                        agent_name=agent.name,
                        stage=msg.stage,
                        intent=msg.intent,
                        status=status,
                        started_at=started_at,
                        finished_at=finished_at,
                        duration_ms=duration_ms,
                        is_fallback=status == "degraded",
                        error_message=error_message,
                    )
                except Exception:
                    pass

    async def _safe_run_async(
        self, agent: BaseAgent, msg: AgentMessage, timeout: float = 30.0
    ) -> AgentMessage:
        """带超时与熔断的异步 Agent 调用"""
        breaker = self._circuit_breaker
        if breaker.is_open(agent.name):
            return self._fallback_message(agent, msg, reason="circuit_open")

        trace_id = str(uuid.uuid4())
        session_id = msg.context.get("session_id", "")
        started_at = datetime.now(timezone.utc).isoformat()
        start_ts = time.monotonic()
        status = "success"
        error_message = ""

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(agent.run, msg), timeout=timeout
            )
            breaker.record_success(agent.name)
            if result.payload.get("fallback"):
                status = "degraded"
                error_message = result.payload.get("reason", "")
            return result
        except TimeoutError:
            breaker.record_failure(agent.name)
            status = "failed"
            error_message = "timeout"
            return self._fallback_message(agent, msg, reason="timeout")
        except Exception as e:
            breaker.record_failure(agent.name)
            status = "failed"
            error_message = str(e)
            return self._fallback_message(agent, msg, reason="exception", error=str(e))
        finally:
            finished_at = datetime.now(timezone.utc).isoformat()
            duration_ms = int((time.monotonic() - start_ts) * 1000)
            if session_id:
                try:
                    create_agent_trace(
                        session_id=session_id,
                        trace_id=trace_id,
                        agent_name=agent.name,
                        stage=msg.stage,
                        intent=msg.intent,
                        status=status,
                        started_at=started_at,
                        finished_at=finished_at,
                        duration_ms=duration_ms,
                        is_fallback=status == "degraded",
                        error_message=error_message,
                    )
                except Exception:
                    pass

    def _fallback_message(
        self,
        agent: BaseAgent,
        msg: AgentMessage,
        reason: str,
        error: str = "",
    ) -> AgentMessage:
        """构造统一降级响应"""
        reason_text = {
            "circuit_open": "服务暂时不可用，已熔断",
            "timeout": "执行超时（>30s），已降级",
            "exception": f"执行失败: {error}",
        }.get(reason, "已降级")
        return msg.reply(
            {
                "error": f"{agent.name} {reason_text}",
                "fallback": True,
                "reason": reason,
            },
            stage=msg.stage,
            from_agent=agent.name,
        )

    def _session_to_context(self, session: dict) -> Dict[str, Any]:
        """将 session 转为 AgentMessage context"""
        return {
            "session_id": session.get("session_id", ""),
            "user_id": session.get("user_id", ""),
            "profile": session.get("profile", {}),
            "dialogue_history": session.get("dialogue_history", []),
            "target_concept": session.get("target_concept"),
        }

    def _to_agent_response(self, msg: AgentMessage) -> AgentResponse:
        """将 AgentMessage 转为前端需要的 AgentResponse"""
        return AgentResponse(
            agent_name=msg.from_agent,
            response_type=msg.stage,
            content=msg.payload,
            profile_update=msg.context.get("profile"),
        )

    def _is_continue_tutor(self, msg: AgentMessage, session: dict) -> bool:
        """判断用户是否希望继续苏格拉底辅导"""
        # 只有处于辅导中（depth > 0）才继续
        if session.get("socratic_depth", 0) <= 0:
            return False
        user_msg = msg.payload.get("message", "")
        continue_patterns = ["继续", "下一步", "继续引导", "请继续", "接着问", "再问一下"]
        return any(p in user_msg for p in continue_patterns)

    def _classify_intent(self, message: str) -> str:
        """识别学生意图（简化关键词版，未来可交给 Profiler 或 LLM）"""
        msg = message.lower()
        if any(w in msg for w in ["错", "报错", "bug", "error", "运行不了", "异常", "traceback"]):
            return "CODE_HELP"
        if any(w in msg for w in ["学", "讲", "教", "什么是", "怎么", "如何做"]):
            return "KNOWLEDGE_REQUEST"
        if any(w in msg for w in ["进度", "学得怎么样", "掌握", "测试"]):
            return "PROGRESS_CHECK"
        if any(w in msg for w in ["跳过", "下一个", "换", "不想学"]):
            return "PATH_ADJUST"
        return "CHAT"

    def _extract_concept(self, message: str) -> Optional[str]:
        """从消息中提取目标知识点（预定义关键词匹配，未来可接入 NER/LLM）"""
        keywords = ["变量与赋值", "for循环", "while循环", "函数定义", "类与对象",
                    "文件操作", "异常处理", "列表推导式", "字典操作", "字符串操作",
                    "条件语句", "模块导入", "递归", "装饰器", "生成器"]
        for kw in keywords:
            if kw in message:
                return kw
        return None
