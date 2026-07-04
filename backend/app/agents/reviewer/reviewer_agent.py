"""ReviewerAgent：审核 + 辅导 + 评估三位一体

对应需求/功能：
- 对外呈现为单一 Agent，内部聚合三种能力：
  1. 资源审核：通过 DebateCouncil 执行 4 视角辩论或 Guardian 快速审核。
  2. 苏格拉底辅导：通过 SocratesTutor 对代码错误进行引导式提问。
  3. 学习评估：通过 LearningEvaluator 基于练习/代码运行数据生成学习报告。
- 同时负责辩论缓存（SQLite）与审核降级策略，避免重复调用 LLM。

主要类/函数：
- ReviewerAgent.run(message)：统一入口，按 stage/action 分发到 review / tutor / evaluate。
- ReviewerAgent.review(message, mode)：资源审核，支持 fast/full 模式，含缓存与修订。
- ReviewerAgent.tutor(message)：苏格拉底辅导入口。
- ReviewerAgent.evaluate(message)：学习评估入口。
- _select_review_mode：根据代码案例数量与超纲/AST 问题选择审核模式。
- _revise_and_re_debate：辩论被拒绝时，调用 Generator 修订后重新审核。
- _ensure_cache_table / _make_debate_cache_key / _get_cached_debate / _set_cached_debate：
  辩论结果缓存管理。

TODO:
- [已完成] 4 视角辩论审核与快速审核已实现
- [已完成] 神经符号校验（前置依赖、AST）前置过滤已实现
- [已完成] 辩论结果 SQLite 缓存与过期清理已实现
- [已完成] 审核拒绝后自动修订并重新辩论已实现
- [待完成] 缓存键未包含完整 profile，可能导致相似画像命中偏差
- [待完成] 超时熔断与重试机制待补充
"""
import hashlib
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.agents.base import AgentMessage, BaseAgent
from app.agents.llm import MockLLMProvider
from app.agents.reviewer.debate_council import DebateCouncil
from app.agents.reviewer.evaluator import LearningEvaluator
from app.agents.reviewer.socrates import SocratesTutor
from app.models.schemas import DebateReport, ResourcePackage
from app.services.database import create_agent_trace, get_db


class ReviewerAgent(BaseAgent):
    """Reviewer：资源审核、辅导、评估"""

    name = "Reviewer"
    system_prompt = "你是教学资源质量管理员，负责审核资源、辅导学生和评估学习效果。"

    def __init__(self, llm=None):
        super().__init__(llm)
        self.debate_council = DebateCouncil()
        self.socrates = SocratesTutor()
        self.evaluator = LearningEvaluator()
        # 初始化时确保缓存表存在
        self._ensure_cache_table()

    def _trace_sub_stage(self, session_id: str, sub_agent: str, stage: str,
                         intent: str, status: str, started_at: str,
                         duration_ms: int, error_message: str = ""):
        """记录 Reviewer 内部子阶段（Debate/Socrates/Evaluator）到 agent_traces"""
        if not session_id:
            return
        try:
            create_agent_trace(
                session_id=session_id,
                trace_id=str(uuid.uuid4()),
                agent_name=f"Reviewer/{sub_agent}",
                stage=stage,
                intent=intent,
                status=status,
                started_at=started_at,
                finished_at=datetime.now(timezone.utc).isoformat(),
                duration_ms=duration_ms,
                error_message=error_message,
            )
        except Exception:
            pass

    # ------------------------------------------------------------------
    # 统一入口
    # ------------------------------------------------------------------
    def run(self, message: AgentMessage) -> AgentMessage:
        """根据 stage 分发到 review / tutor / evaluate"""
        stage = message.stage
        if stage == "reviewer":
            return self.review(message)
        if stage == "tutor":
            return self.tutor(message)
        if stage == "evaluator":
            return self.evaluate(message)
        # 若 stage 未命中，则按 payload 中的 action 字段兜底分发
        action = message.payload.get("action", "review")
        if action == "review":
            return self.review(message)
        if action == "tutor":
            return self.tutor(message)
        if action == "evaluate":
            return self.evaluate(message)
        return message.reply({"error": f"未知的 Reviewer action: {action}"}, from_agent=self.name)

    # ------------------------------------------------------------------
    # 资源审核
    # ------------------------------------------------------------------
    def review(self, message: AgentMessage, mode: Optional[str] = None) -> AgentMessage:
        """审核生成的资源

        mode 决策：
        - fast：只走 Guardian 快速审核
        - full：完整 4-Agent 辩论
        """
        package_dict = message.payload.get("package")
        if not package_dict:
            return message.reply({"error": "缺少 package"}, stage="reviewer", from_agent=self.name)

        package = ResourcePackage(**package_dict)
        concept = package.concept
        profile = message.context.get("profile", {})

        # 1. 检查缓存：相同知识点+相似画像的审核结果可直接复用
        cached = self._get_cached_debate(concept, profile)
        if cached:
            return message.reply(
                {
                    "debate_report": cached.model_dump(),
                    "validation": {"forbidden_concepts": [], "ast_violations": []},
                    "review_mode": "fast",
                    "from_cache": True,
                },
                stage="reviewer",
                from_agent=self.name,
            )

        concept_info: Dict[str, Any] = {}

        # 2. 神经符号校验：检测超纲概念与代码块 AST 问题
        # Mock 模式下跳过较重的符号校验，直接走 Guardian 快速审核，避免超时降级
        if isinstance(self.llm, MockLLMProvider):
            all_forbidden: List[str] = []
            mode = 'fast'
        else:
            from app.services.graph_factory import get_graph_store
            from app.services.neuro_symbolic import NeuroSymbolicValidator

            graph = get_graph_store()
            concept_info = graph.get_concept(concept) or {}
            forbidden = graph.check_forbidden_concepts(package.document, concept)
            ast_violations = NeuroSymbolicValidator().validate_code_blocks(package.document, concept)
            all_forbidden = list(set(forbidden + ast_violations))

        # 3. 根据风险选择审核模式：高风险/含代码走 full，否则走 fast
        if mode is None:
            mode = self._select_review_mode(package, concept, all_forbidden)
        # Mock 模式下完整辩论容易超时，强制使用快速审核保证演示可用
        if isinstance(self.llm, MockLLMProvider) and mode != 'fast':
            mode = 'fast'

        session_id = message.context.get("session_id", "")
        sub_started = datetime.now(timezone.utc).isoformat()
        sub_start_ts = time.monotonic()
        sub_status = "success"
        sub_error = ""
        try:
            if mode == "fast":
                report = self.debate_council.fast_review(package, concept_info, all_forbidden)
            else:
                report = self.debate_council.debate(package, concept_info, all_forbidden)
                # 如果被拒绝，尝试调用 Generator 修订后重新审核一次
                if report.status == "REJECTED":
                    report = self._revise_and_re_debate(package, concept_info, all_forbidden, profile)
        except Exception as e:
            sub_status = "failed"
            sub_error = str(e)
            raise
        finally:
            self._trace_sub_stage(
                session_id=session_id,
                sub_agent="Debate" if mode == "full" else "Guardian",
                stage="reviewer",
                intent=message.intent,
                status=sub_status,
                started_at=sub_started,
                duration_ms=int((time.monotonic() - sub_start_ts) * 1000),
                error_message=sub_error,
            )

        # 4. 缓存通过的审核结果，减少重复 LLM 调用
        if report.status in ("PASSED", "MODIFIED"):
            self._set_cached_debate(concept, profile, report)

        return message.reply(
            {
                "debate_report": report.model_dump(),
                "validation": {
                    "forbidden_concepts": all_forbidden,
                    "ast_violations": ast_violations,
                },
                "review_mode": mode,
            },
            stage="reviewer",
            from_agent=self.name,
        )

    def _select_review_mode(self, package: ResourcePackage, concept: str,
                            forbidden_concepts: List[str]) -> str:
        """选择审核模式：代码题、新知识点、高风险 → full；普通讲解 → fast"""
        code_case_count = len(package.code_cases or [])
        # 存在 AST 或超纲问题，或包含代码案例时，走完整 4-Agent 辩论
        if forbidden_concepts or code_case_count > 0:
            return "full"
        # 普通讲解走 Guardian 快速审核
        return "fast"

    def _revise_and_re_debate(self, package: ResourcePackage, concept_info: dict,
                              forbidden_concepts: List[str],
                              profile: Dict[str, Any]) -> DebateReport:
        """辩论被拒绝后，汇总各审核 Agent 的建议，调用 Generator 修订并重新审核一次"""
        from app.agents.generator import GeneratorAgent

        # 收集所有 WARN/REJECT/VETO 意见作为修订反馈
        feedback_lines = []
        for r in self.debate_council.debate(package, concept_info, forbidden_concepts).rounds:
            if r.verdict in ("WARN", "REJECT", "VETO") and r.suggestion:
                feedback_lines.append(f"- {r.agent}：{r.suggestion}")
        feedback = "\n".join(feedback_lines) or "请整体提升教学资源质量。"

        generator = GeneratorAgent()
        revised_package = generator.revise(package.concept, profile, package.model_dump(), feedback)
        return self.debate_council.debate(revised_package, concept_info, forbidden_concepts)

    # ------------------------------------------------------------------
    # 苏格拉底辅导
    # ------------------------------------------------------------------
    def tutor(self, message: AgentMessage) -> AgentMessage:
        """苏格拉底式辅导"""
        session_id = message.context.get("session_id", "")
        sub_started = datetime.now(timezone.utc).isoformat()
        sub_start_ts = time.monotonic()
        sub_status = "success"
        sub_error = ""
        try:
            return self.socrates.run(message)
        except Exception as e:
            sub_status = "failed"
            sub_error = str(e)
            raise
        finally:
            self._trace_sub_stage(
                session_id=session_id,
                sub_agent="Socrates",
                stage="tutor",
                intent=message.intent,
                status=sub_status,
                started_at=sub_started,
                duration_ms=int((time.monotonic() - sub_start_ts) * 1000),
                error_message=sub_error,
            )

    # ------------------------------------------------------------------
    # 学习评估
    # ------------------------------------------------------------------
    def evaluate(self, message: AgentMessage) -> AgentMessage:
        """学习效果评估"""
        session_id = message.context.get("session_id", "")
        sub_started = datetime.now(timezone.utc).isoformat()
        sub_start_ts = time.monotonic()
        sub_status = "success"
        sub_error = ""
        try:
            return self.evaluator.run(message)
        except Exception as e:
            sub_status = "failed"
            sub_error = str(e)
            raise
        finally:
            self._trace_sub_stage(
                session_id=session_id,
                sub_agent="Evaluator",
                stage="evaluator",
                intent=message.intent,
                status=sub_status,
                started_at=sub_started,
                duration_ms=int((time.monotonic() - sub_start_ts) * 1000),
                error_message=sub_error,
            )

    # ------------------------------------------------------------------
    # 辩论缓存（SQLite 内）
    # ------------------------------------------------------------------
    def _ensure_cache_table(self):
        db = get_db()
        try:
            if "debate_cache" not in db.table_names():
                db["debate_cache"].create({
                    "cache_key": str,
                    "concept": str,
                    "profile_hash": str,
                    "report": str,      # JSON
                    "created_at": str,
                }, pk="cache_key", if_not_exists=True)
                db["debate_cache"].create_index(["concept"], if_not_exists=True)
        finally:
            db.conn.close()

    def _make_debate_cache_key(self, concept: str, profile: Dict[str, Any]) -> str:
        profile_key = json.dumps({
            "knowledge_level": profile.get("knowledge_level", 1.0),
            "cognitive_field": profile.get("cognitive_field", "dependent"),
            "cognitive_modality": profile.get("cognitive_modality", "visual"),
            "learning_pace": profile.get("learning_pace", "normal"),
            "goal_orientation": profile.get("goal_orientation", "application"),
        }, sort_keys=True, ensure_ascii=False)
        profile_hash = hashlib.md5(profile_key.encode()).hexdigest()[:12]
        return f"{concept}:{profile_hash}"

    def _get_cached_debate(self, concept: str, profile: Dict[str, Any],
                           max_age_hours: int = 168) -> Optional[DebateReport]:
        db = get_db()
        try:
            key = self._make_debate_cache_key(concept, profile)
            try:
                row = db["debate_cache"].get(key)
            except Exception:
                return None
            if not row:
                return None
            created = datetime.fromisoformat(row["created_at"])
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - created > timedelta(hours=max_age_hours):
                db["debate_cache"].delete(key)
                return None
            return DebateReport(**json.loads(row["report"]))
        finally:
            db.conn.close()

    def _set_cached_debate(self, concept: str, profile: Dict[str, Any], report: DebateReport):
        db = get_db()
        try:
            db["debate_cache"].upsert({
                "cache_key": self._make_debate_cache_key(concept, profile),
                "concept": concept,
                "profile_hash": self._make_debate_cache_key(concept, profile).split(":", 1)[1],
                "report": report.model_dump_json(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }, ["cache_key"])
        finally:
            db.conn.close()
