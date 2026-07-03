"""BKT（贝叶斯知识追踪）简化版

基于标准 BKT 模型，追踪每个知识点的掌握概率。
每次练习后根据结果（正确/错误）更新掌握度。

公式：
  1. 学习前概率: P(Lₙ) = P(Lₙ₋₁) + (1 - P(Lₙ₋₁)) × P(T)
  2. 正确时更新: P(Lₙ|correct) = P(Lₙ)×(1-P(S)) / [P(Lₙ)×(1-P(S)) + (1-P(Lₙ))×P(G)]
  3. 错误时更新: P(Lₙ|incorrect) = P(Lₙ)×P(S) / [P(Lₙ)×P(S) + (1-P(Lₙ))×(1-P(G))]

参数说明：
  P(L₀)   - 初始掌握概率
  P(T)    - 每次机会中学到的概率（学习率）
  P(G)    - 猜对概率（不会时碰对）
  P(S)    - 失误概率（会时做错）

TODO:
- [待完成] 接入 learning_event 数据来自动拟合参数
- [待完成] 支持知识点间的转移矩阵（更精确）
- [待完成] 添加参数组合搜索，找到最优拟合
"""
import json
from typing import Dict, Optional

from app.services.database import (
    get_session_events,
    get_mastery_state,
    update_mastery_state,
    get_mastery_heatmap,
    list_code_submissions,
)


# 默认 BKT 参数（根据教育数据研究的标准值）
DEFAULT_PARAMS = {
    "p_init": 0.15,     # 初始掌握概率 15%
    "p_transit": 0.10,  # 学习率 10%
    "p_guess": 0.20,    # 猜对概率 20%
    "p_slip": 0.10,     # 失误概率 10%
}

# 已掌握阈值：概率超过此值视为"已掌握"
MASTERY_THRESHOLD = 0.85


class BKTModel:
    """单个知识点的 BKT 模型"""

    def __init__(
        self,
        concept: str,
        p_init: float = DEFAULT_PARAMS["p_init"],
        p_transit: float = DEFAULT_PARAMS["p_transit"],
        p_guess: float = DEFAULT_PARAMS["p_guess"],
        p_slip: float = DEFAULT_PARAMS["p_slip"],
    ):
        self.concept = concept
        self.p_init = p_init
        self.p_transit = p_transit
        self.p_guess = p_guess
        self.p_slip = p_slip
        self.probability = p_init  # 当前掌握概率
        self.observation_count = 0

    def update(self, is_correct: bool) -> float:
        """根据一次观察（练习结果）更新掌握概率

        Args:
            is_correct: 本次练习是否正确

        Returns:
            更新后的掌握概率
        """
        # Step 1: 学习前概率（考虑本次机会的学习效应）
        prob_before = self.probability + (1 - self.probability) * self.p_transit

        # Step 2: 根据观察结果更新
        if is_correct:
            # 答对了：可能真的会，也可能是猜对的
            numerator = prob_before * (1 - self.p_slip)
            denominator = numerator + (1 - prob_before) * self.p_guess
        else:
            # 答错了：可能不会，也可能是会但失误了
            numerator = prob_before * self.p_slip
            denominator = numerator + (1 - prob_before) * (1 - self.p_guess)

        self.probability = numerator / denominator if denominator > 0 else 0.0
        self.observation_count += 1

        return self.probability

    def is_mastered(self) -> bool:
        """是否已掌握（概率超过阈值）"""
        return self.probability >= MASTERY_THRESHOLD

    def to_dict(self) -> dict:
        return {
            "concept": self.concept,
            "probability": round(self.probability, 4),
            "p_init": self.p_init,
            "p_transit": self.p_transit,
            "p_guess": self.p_guess,
            "p_slip": self.p_slip,
            "observation_count": self.observation_count,
            "is_mastered": self.is_mastered(),
        }


class BKTTracker:
    """BKT 追踪器：管理所有知识点的 BKT 模型"""

    def __init__(self):
        self.models: Dict[str, BKTModel] = {}
        self.last_updated: Dict[str, Optional[str]] = {}

    def get_or_create_model(
        self,
        concept: str,
        p_init: Optional[float] = None,
        p_transit: Optional[float] = None,
        p_guess: Optional[float] = None,
        p_slip: Optional[float] = None,
    ) -> BKTModel:
        """获取或创建某个知识点的 BKT 模型"""
        if concept not in self.models:
            self.models[concept] = BKTModel(
                concept=concept,
                p_init=p_init or DEFAULT_PARAMS["p_init"],
                p_transit=p_transit or DEFAULT_PARAMS["p_transit"],
                p_guess=p_guess or DEFAULT_PARAMS["p_guess"],
                p_slip=p_slip or DEFAULT_PARAMS["p_slip"],
            )
        return self.models[concept]

    def record_observation(self, concept: str, is_correct: bool) -> float:
        """记录一次练习观察并更新掌握概率"""
        model = self.get_or_create_model(concept)
        return model.update(is_correct)

    def get_mastery_probability(self, concept: str) -> float:
        """获取某知识点的当前掌握概率"""
        if concept not in self.models:
            return DEFAULT_PARAMS["p_init"]
        return self.models[concept].probability

    def get_all_mastery(self) -> Dict[str, float]:
        """获取所有知识点的掌握概率"""
        return {
            concept: model.probability
            for concept, model in self.models.items()
        }

    def _is_default_params(self, model: BKTModel) -> bool:
        """判断模型是否仍在使用默认 BKT 参数"""
        return (
            model.observation_count == 0
            and model.p_init == DEFAULT_PARAMS["p_init"]
            and model.p_transit == DEFAULT_PARAMS["p_transit"]
            and model.p_guess == DEFAULT_PARAMS["p_guess"]
            and model.p_slip == DEFAULT_PARAMS["p_slip"]
        )

    def _model_explanation(self, model: BKTModel) -> str:
        if self._is_default_params(model):
            return "默认参数，尚未有足够练习记录进行校准"
        return f"基于 {model.observation_count} 次练习记录更新"

    def get_heatmap_data(self) -> list:
        """获取热力图数据格式"""
        return [
            {
                "concept": concept,
                "mastery_probability": round(model.probability, 4),
                "observation_count": model.observation_count,
                "sample_count": model.observation_count,
                "is_mastered": model.is_mastered(),
                "is_default": self._is_default_params(model),
                "last_updated": self.last_updated.get(concept),
                "explanation": self._model_explanation(model),
            }
            for concept, model in sorted(
                self.models.items(), key=lambda x: x[1].probability
            )
        ]

    def load_from_session(self, session_id: str):
        """从会话历史记录中恢复 BKT 状态

        优先从 mastery_state 表读取已持久化的掌握度，
        再读取 learning_events 中的 exercise_submitted 事件作为补充。
        每次加载前清空当前模型，避免不同会话之间状态串扰。
        """
        self.models.clear()
        self.last_updated.clear()

        # 优先从 mastery_state 恢复
        states = get_mastery_state(session_id)
        states_concepts = {s["concept"] for s in states}
        for s in states:
            model = self.get_or_create_model(s["concept"])
            model.probability = s["p_known"]
            model.observation_count = s["evidence_count"]
            self.last_updated[s["concept"]] = s.get("last_updated")

        # 从 learning_events 事件补充（处理 mastery_state 未覆盖的情况）
        events = get_session_events(session_id, event_type="exercise_submitted")
        for event in events:
            payload = event.get("payload", {})
            if isinstance(payload, str):
                payload = json.loads(payload)
            concept = event.get("concept") or payload.get("_concept") or payload.get("concept")
            passed = payload.get("passed") if payload.get("passed") is not None else payload.get("is_correct")
            if concept and passed is not None and concept not in states_concepts:
                self.record_observation(concept, bool(passed))

        # 从 code_submissions 中加载
        submissions = list_code_submissions(session_id)
        for sub in submissions:
            concept = sub.get("concept")
            if sub.get("passed") is not None:
                passed = sub["passed"]
            else:
                passed = sub.get("output") == sub.get("expected_output")
            if concept and passed is not None and concept not in states_concepts:
                self.record_observation(concept, bool(passed))

    def persist_to_session(self, session_id: str):
        """将当前 BKT 状态持久化到 mastery_state 表"""
        for concept, model in self.models.items():
            update_mastery_state(
                session_id=session_id,
                concept=concept,
                p_known=model.probability,
                evidence_count=model.observation_count,
            )

    def to_dict(self) -> dict:
        return {
            "models": [
                {
                    **m.to_dict(),
                    "is_default": self._is_default_params(m),
                    "last_updated": self.last_updated.get(m.concept),
                    "explanation": self._model_explanation(m),
                }
                for m in self.models.values()
            ],
            "summary": {
                "total_concepts": len(self.models),
                "mastered": sum(1 for m in self.models.values() if m.is_mastered()),
                "default_count": sum(1 for m in self.models.values() if self._is_default_params(m)),
                "average_probability": (
                    round(
                        sum(m.probability for m in self.models.values())
                        / len(self.models),
                        4,
                    )
                    if self.models
                    else 0.0
                ),
            },
        }


def get_bkt_tracker() -> BKTTracker:
    """创建一个新的 BKT 追踪器实例

    每个请求/会话独立实例，避免跨会话状态串扰。
    如需按 session_id 缓存，可在此加入 LRU 缓存逻辑。
    """
    return BKTTracker()


def reset_bkt_tracker():
    """重置 BKT 追踪器（保留以兼容旧调用，当前无全局单例可重置）"""
    pass
