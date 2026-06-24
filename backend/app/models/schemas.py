"""Pydantic 数据模型

对应需求：
- 定义智学蜂巢前后端交互的请求体、响应体与内部数据结构。
- 通过 Pydantic 提供校验、序列化与 OpenAPI 文档生成能力。

主要模型分类：
1. 对话与会话：ChatMessage、StudentProfile、SessionCreate/Response、ChatRequest、
   EventLogRequest。
2. 资源生成：ResourceType、ResourcePackage、GenerationTask、Resource、ResourceVersion。
3. 辩论议会：DebateRound、DebateReport、AgentResponse。
4. 知识图谱：GraphNode、GraphEdge、GraphData。
5. 代码与掌握度：CodeSubmission、MasteryState、HeatmapData。
6. 画像与反馈：CognitiveEvidence、ResourceFeedback、ResourceFeedbackStats。

TODO:
- [已完成] 核心业务模型的字段定义与基础校验规则。
- [已完成] 资源生成任务、版本演进、辩论、提交、掌握度、反馈等扩展模型。
- [待完成] 为复杂字段补充更严格的校验（如 concept 命名规则、JSON 字段结构）。
- [待完成] 增加共享的自定义校验器与错误提示信息。
- [待完成] 拆分单文件为按业务模块组织的多个 schema 文件，提升可维护性。
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════
#  行为事件类型枚举
# ═══════════════════════════════════════════════════════════════

class BehaviorEventType(str, Enum):
    """前端埋点行为事件类型"""
    CHAT = "chat"
    RESOURCE_GENERATED = "resource_generated"
    EXERCISE_SUBMITTED = "exercise_submitted"
    CODE_EXECUTED = "code_executed"
    MINDMAP_CLICKED = "mindmap_clicked"           # 点击导图节点
    HINT_EXPANDED = "hint_expanded"               # 展开提示
    RESOURCE_SWITCHED = "resource_switched"       # 切换资源类型
    PAGE_STAY = "page_stay"                       # 页面停留
    PROFILE_VIEWED = "profile_viewed"              # 查看画像
    PATH_VIEWED = "path_viewed"                    # 查看学习路径
    DEBATE_VIEWED = "debate_viewed"                # 查看辩论报告
    EXERCISE_ATTEMPT = "exercise_attempt"          # 尝试答题
    CODE_CASE_VIEWED = "code_case_viewed"          # 查看代码案例
    AUDIO_PLAYED = "audio_played"                  # 播放音频
    HELP_REQUESTED = "help_requested"              # 请求帮助


# ═══════════════════════════════════════════════════════════════
#  基础模型
# ═══════════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    role: str = Field(..., description="消息角色: user/assistant/system")
    content: str = Field(..., description="消息内容")


class StudentProfile(BaseModel):
    """学生画像"""
    knowledge_level: float = Field(1.0, ge=1.0, le=5.0, description="知识水平 1-5")
    cognitive_field: str = Field("dependent", description="场依存/场独立: dependent/independent")
    cognitive_modality: str = Field("visual", description="视觉/听觉/动觉: visual/auditory/kinesthetic")
    learning_pace: str = Field("normal", description="学习节奏: slow/normal/fast")
    goal_orientation: str = Field("application", description="目标导向: exam/application/exploration")
    error_patterns: List[str] = Field(default_factory=list, description="常见错误模式")
    mastered_concepts: List[str] = Field(default_factory=list, description="已掌握知识点")


class SessionCreate(BaseModel):
    user_id: Optional[str] = None
    target_concept: Optional[str] = None


class SessionResponse(BaseModel):
    session_id: str
    profile: StudentProfile
    target_concept: Optional[str] = None
    suggested_path: List[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str
    message_type: str = "text"  # text / code / help / skip


class EventLogRequest(BaseModel):
    event_type: str  # exercise_submitted / code_executed / resource_generated / chat
    concept: Optional[str] = Field(None, description="关联知识点")
    payload: Dict[str, Any] = Field(default_factory=dict)


class BehaviorEventRequest(BaseModel):
    """前端行为埋点请求"""
    event_type: BehaviorEventType
    concept: Optional[str] = Field(None, description="关联知识点")
    session_id: str = Field(..., description="会话 ID")
    payload: Dict[str, Any] = Field(
        default_factory=dict,
        description="事件载荷，不同事件类型包含不同字段",
    )


# ═══════════════════════════════════════════════════════════════
#  资源与辩论模型
# ═══════════════════════════════════════════════════════════════

class ResourceType(BaseModel):
    type: str  # document / mindmap / exercise / code_case / audio
    content: Any


class ResourcePackage(BaseModel):
    concept: str
    document: Optional[str] = None
    mindmap: Optional[str] = None
    exercises: Optional[List[Dict]] = None
    code_cases: Optional[List[Dict]] = None
    audio_text: Optional[str] = None


class DebateRound(BaseModel):
    round: int
    agent: str
    verdict: str  # PASS / WARN / REJECT
    message: str
    suggestion: Optional[str] = None


class DebateReport(BaseModel):
    status: str  # PASSED / MODIFIED / REJECTED
    rounds: List[DebateRound]
    final_votes: Dict[str, str]


class AgentResponse(BaseModel):
    agent_name: str
    response_type: str
    content: Any
    profile_update: Optional[Dict] = None
    debate_report: Optional[DebateReport] = None


# ═══════════════════════════════════════════════════════════════
#  图谱模型
# ═══════════════════════════════════════════════════════════════

class GraphNode(BaseModel):
    id: str
    name: str
    module: str
    difficulty: int


class GraphEdge(BaseModel):
    source: str
    target: str
    strength: float


class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


# 资源生成任务与资源模型（知识熔炉输出）

class GenerationTask(BaseModel):
    task_id: str
    session_id: str
    concept: str
    status: str = Field("pending", description="pending / planning / generating / debating / rendering / completed / failed")
    progress: int = Field(0, ge=0, le=100)
    stage_message: str = ""
    result: Dict[str, Any] = Field(default_factory=dict)
    error_message: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class Resource(BaseModel):
    resource_id: str
    task_id: Optional[str] = None
    session_id: str
    concept: str
    version: int = 1
    document: Optional[str] = None
    mindmap: Optional[str] = None
    exercises: Optional[List[Dict[str, Any]]] = None
    code_cases: Optional[List[Dict[str, Any]]] = None
    audio_text: Optional[str] = None
    debate_report: Optional[DebateReport] = None
    status: str = Field("approved", description="approved / rejected / cached / draft")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ResourceVersion(BaseModel):
    version_id: Optional[int] = None
    resource_id: str
    concept: str
    version: int
    change_reason: str
    triggered_by: str
    content_snapshot: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


# 代码提交与掌握度模型（学习行为评估）

class CodeSubmission(BaseModel):
    submission_id: str
    session_id: str
    exercise_id: Optional[str] = None
    concept: str
    code: str
    output: Optional[str] = None
    passed: bool = False
    error_type: str = Field("", description="syntax / runtime / logic / passed")
    execution_time: Optional[float] = None
    created_at: Optional[str] = None


class MasteryState(BaseModel):
    id: Optional[int] = None
    session_id: str
    concept: str
    p_known: float = Field(0.0, ge=0.0, le=1.0, description="BKT 掌握概率 0-1")
    evidence_count: int = 0
    last_updated: Optional[str] = None


class HeatmapData(BaseModel):
    concept: str
    p_known: float


# 认知风格证据与资源反馈模型（画像迭代与知识熔炉数据来源）

class CognitiveEvidence(BaseModel):
    id: Optional[int] = None
    session_id: str
    dimension: str = Field(..., description="cognitive_field / cognitive_modality / learning_pace / etc")
    evidence_type: str = Field(..., description="click_mindmap / run_code / stay_audio / expand_hint / etc")
    weight: float = Field(..., ge=0.0, le=1.0)
    description: Optional[str] = None
    source_event_id: Optional[int] = None
    created_at: Optional[str] = None


class ResourceFeedback(BaseModel):
    feedback_id: Optional[int] = None
    session_id: str
    resource_id: str
    concept: str
    rating: Optional[int] = Field(None, ge=1, le=5)
    error_report: Optional[str] = None
    confusion_marked: bool = False
    created_at: Optional[str] = None


class ResourceFeedbackStats(BaseModel):
    concept: str
    total_feedback: int
    confusion_count: int
    confusion_rate: float
    average_rating: Optional[float]
    error_reports: List[str]
