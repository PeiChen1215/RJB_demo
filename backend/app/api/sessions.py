"""学习会话 API

对应需求/功能：
- 管理学生学习会话，包括创建、查询、列表、画像、学习事件记录、聊天与评估。
- 会话数据使用 SQLite 持久化，并通过内存缓存加速读取。
- 聊天接口支持同步返回和 SSE 流式输出，调用 AgentOrchestrator 编排多智能体流程。
- 输入消息经过安全过滤，防止不当内容进入后续 Agent 流程。

主要接口：
- POST /api/sessions/：创建新会话。
- GET /api/sessions/：列出当前登录用户的会话。
- GET /api/sessions/{session_id}：获取会话详情。
- GET /api/sessions/{session_id}/profile：获取会话画像。
- GET /api/sessions/{session_id}/stats：获取会话学习统计。
- GET /api/sessions/{session_id}/events：获取学习事件列表。
- POST /api/sessions/{session_id}/events：记录学习事件。
- POST /api/sessions/{session_id}/chat：同步聊天。
- GET /api/sessions/{session_id}/chat-stream：SSE 流式聊天。
- POST /api/sessions/{session_id}/evaluate：基于学习事件评估学生。

主要函数：
- get_default_profile：返回默认学生画像。
- get_sessions_db / _load_session / _save_session：内存缓存与 SQLite 读写工具。

TODO:
- [已完成] 使用 SQLite 持久化会话与画像
- [已完成] 接入 JWT 认证（会话创建与列表已支持可选登录）
- [已完成] chat 接口支持 SSE 流式输出
- [已完成] 记录学习行为日志到数据库
- [已完成] 增加输入安全过滤与敏感词检测
- [待完成] 完全迁移到数据库后，可移除内存缓存
- [待完成] 评估接口的画像更新规则可进一步科学化
"""
import json
import uuid
from typing import Dict, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.agents.reviewer import ReviewerAgent
from app.agents.orchestrator import AgentOrchestrator
from app.models.schemas import (
    AgentResponse,
    BehaviorEventRequest,
    ChatRequest,
    EventLogRequest,
    SessionCreate,
    SessionResponse,
    StudentProfile,
)
from app.services.database import (
    create_session,
    get_db,
    get_session,
    get_session_events,
    get_session_stats,
    log_event,
    update_session,
)
from app.services.auth import get_current_user
from app.services.graph_factory import get_graph_store
from app.services.safety_filter import get_safety_filter

router = APIRouter()


def get_default_profile() -> StudentProfile:
    """默认学生画像：初学者、视觉型、依赖型、应用导向"""
    return StudentProfile(
        knowledge_level=1.0,
        cognitive_field="dependent",
        cognitive_modality="visual",
        learning_pace="normal",
        goal_orientation="application",
        error_patterns=[],
        mastered_concepts=["Python简介"],
    )


def get_sessions_db(app) -> Dict[str, dict]:
    """获取会话内存存储（作为 SQLite 的高速缓存）

    TODO: [待完成] 完全迁移到数据库后，可移除内存缓存
    """
    if not hasattr(app.state, "sessions_db"):
        app.state.sessions_db = {}
    return app.state.sessions_db


def _load_session(app, session_id: str) -> dict | None:
    """从内存缓存或 SQLite 加载会话"""
    sessions_db = get_sessions_db(app)
    # 优先命中内存缓存
    if session_id in sessions_db:
        return sessions_db[session_id]

    # 未命中则从 SQLite 加载并回填缓存
    row = get_session(session_id)
    if row:
        sessions_db[session_id] = row
        return row
    return None


def _save_session(app, session: dict):
    """同步保存会活到内存缓存和 SQLite"""
    sessions_db = get_sessions_db(app)
    session_id = session["session_id"]
    sessions_db[session_id] = session
    update_session(
        session_id,
        session["profile"],
        session.get("dialogue_history", []),
        session.get("target_concept"),
    )


@router.post("/", response_model=SessionResponse, operation_id="create_session")
async def create_session_endpoint(
    payload: SessionCreate,
    request: Request,
    current_user: Optional[str] = Depends(get_current_user),
):
    session_id = str(uuid.uuid4())
    profile = get_default_profile()
    user_id = current_user or payload.user_id or "anonymous"

    session = {
        "session_id": session_id,
        "user_id": user_id,
        "profile": profile.model_dump(),
        "dialogue_history": [],
        "target_concept": payload.target_concept,
    }

    # 持久化到 SQLite
    create_session(
        session_id=session_id,
        user_id=user_id,
        profile=profile.model_dump(),
        target_concept=payload.target_concept,
    )

    # 同时放入内存缓存，加速后续访问
    get_sessions_db(request.app)[session_id] = session

    # 如果创建时指定了目标知识点，返回推荐学习路径
    suggested_path = []
    if payload.target_concept:
        graph = get_graph_store()
        suggested_path = graph.get_learning_path(
            profile.mastered_concepts, payload.target_concept
        )

    return SessionResponse(
        session_id=session_id,
        profile=profile,
        target_concept=payload.target_concept,
        suggested_path=suggested_path,
    )


@router.get("/", operation_id="list_sessions")
async def list_sessions(
    request: Request,
    current_user: str = Depends(get_current_user),
    limit: int = 50,
):
    """列出当前登录用户的会话（未登录返回空列表）"""
    if not current_user:
        return {"sessions": [], "total": 0}

    # 从 SQLite 查询当前用户的会话列表
    db = get_db()
    try:
        rows = list(db["sessions"].rows_where("user_id = ?", [current_user]))
        sessions = [
            {
                "session_id": r["session_id"],
                "target_concept": r["target_concept"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]
        return {"sessions": sessions[:limit], "total": len(sessions)}
    finally:
        db.conn.close()


@router.get("/{session_id}")
async def get_session_endpoint(session_id: str, request: Request):
    """获取会话详情"""
    session = _load_session(request.app, session_id)
    if not session:
        return {"error": "会话不存在"}
    return {
        "session_id": session["session_id"],
        "user_id": session["user_id"],
        "target_concept": session.get("target_concept"),
        "profile": session["profile"],
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at"),
    }


@router.get("/{session_id}/profile")
async def get_profile(session_id: str, request: Request):
    session = _load_session(request.app, session_id)
    if not session:
        return {"error": "会话不存在"}
    return session["profile"]


@router.get("/{session_id}/stats")
async def get_session_stats_endpoint(session_id: str, request: Request):
    """获取会话学习行为统计"""
    session = _load_session(request.app, session_id)
    if not session:
        return {"error": "会话不存在"}
    return get_session_stats(session_id)


@router.get("/{session_id}/events")
async def get_session_events_endpoint(
    session_id: str,
    request: Request,
    event_type: str | None = None,
    limit: int = 100,
):
    """获取会话学习行为事件列表"""
    session = _load_session(request.app, session_id)
    if not session:
        return {"error": "会话不存在"}
    events = get_session_events(session_id, event_type)
    return {"events": events[:limit], "total": len(events)}


@router.post("/{session_id}/events")
async def log_session_event(
    session_id: str,
    payload: EventLogRequest,
    request: Request,
):
    """记录学习行为事件（练习提交、代码运行等）"""
    session = _load_session(request.app, session_id)
    if not session:
        return {"success": False, "error": "会话不存在"}

    log_event(session_id, payload.event_type, payload.payload, concept=payload.concept)

    # 如果是练习提交或代码运行且结果正确，实时更新画像中的掌握知识点
    profile = session.get("profile", get_default_profile().model_dump())
    mastered = set(profile.get("mastered_concepts", []))
    if payload.event_type == "exercise_submitted" and payload.payload.get("is_correct"):
        concept = payload.concept or payload.payload.get("concept")
        if concept:
            mastered.add(concept)
    elif payload.event_type == "code_executed" and payload.payload.get("passed"):
        concept = payload.concept or payload.payload.get("concept")
        if concept:
            mastered.add(concept)
    profile["mastered_concepts"] = list(mastered)
    session["profile"] = profile
    _save_session(request.app, session)

    return {"success": True, "event_type": payload.event_type}


@router.post("/{session_id}/behavior")
async def log_behavior_event(
    session_id: str,
    payload: BehaviorEventRequest,
    request: Request,
):
    """记录前端行为埋点事件（点击导图、停留时长、展开提示等）

    用于认知风格证据收集，前端只需在交互点调用此接口即可。
    """
    session = _load_session(request.app, session_id)
    if not session:
        return {"success": False, "error": "会话不存在"}

    log_event(
        session_id,
        payload.event_type.value,
        payload.payload,
        concept=payload.concept,
    )

    return {"success": True, "event_type": payload.event_type.value}


@router.post("/{session_id}/chat", response_model=AgentResponse)
async def chat(session_id: str, payload: ChatRequest, request: Request):
    session = _load_session(request.app, session_id)
    if not session:
        return AgentResponse(
            agent_name="System",
            response_type="error",
            content={"message": "会话不存在，请先创建会话"},
        )

    # 输入安全过滤：拦截敏感/不当内容
    safety = get_safety_filter()
    is_unsafe, keywords = safety.check(payload.message)
    if is_unsafe:
        log_event(session_id, "safety_violation", {
            "message": payload.message,
            "keywords": keywords,
        })
        return AgentResponse(
            agent_name="Guardian",
            response_type="safety_warning",
            content={
                "message": "你的消息包含不合适的内容，请使用文明、与学习相关的语言。",
                "keywords": keywords,
            },
        )

    # 记录用户消息到对话历史
    session["dialogue_history"].append({
        "role": "user",
        "content": payload.message,
        "type": payload.message_type,
    })

    # 调用 Agent 编排器处理学生消息
    orchestrator = AgentOrchestrator()
    response = orchestrator.handle_chat(session, payload.message, payload.message_type)

    # 记录助手消息到对话历史
    session["dialogue_history"].append({
        "role": "assistant",
        "content": response.content.get("message", ""),
    })

    # 持久化会话并记录聊天日志
    _save_session(request.app, session)
    log_event(session_id, "chat", {
        "message": payload.message,
        "agent_name": response.agent_name,
        "response_type": response.response_type,
    })

    return response


@router.get("/{session_id}/chat-stream")
async def chat_stream(
    session_id: str,
    message: str,
    request: Request,
    message_type: str = "text",
):
    """SSE 流式对话

    事件：
    - data: {"type": "thinking", "agent": "Profiler", "message": "..."}
    - data: {"type": "progress", "agent": "Navigator", "message": "..."}
    - data: {"type": "complete", "agent_response": {...}}
    - data: {"type": "error", "message": "..."}
    """
    session = _load_session(request.app, session_id)

    if not session:
        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': '会话不存在'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(
            error_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    # 输入安全过滤
    safety = get_safety_filter()
    is_unsafe, keywords = safety.check(message)
    if is_unsafe:
        log_event(session_id, "safety_violation", {
            "message": message,
            "keywords": keywords,
        })

        async def warning_stream():
            yield f"data: {json.dumps({'type': 'error', 'agent': 'Guardian', 'message': '你的消息包含不合适的内容，请使用文明、与学习相关的语言。'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(
            warning_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    # 记录用户消息
    session["dialogue_history"].append({
        "role": "user",
        "content": message,
        "type": message_type,
    })

    orchestrator = AgentOrchestrator()

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'thinking', 'agent': 'Profiler', 'message': '正在理解你的意图...'}, ensure_ascii=False)}\n\n"

            response = await orchestrator.handle_chat_stream(
                session, message, message_type
            )

            # 记录助手消息到对话历史
            session["dialogue_history"].append({
                "role": "assistant",
                "content": response.content.get("message", ""),
            })

            # 持久化会话并记录聊天日志
            _save_session(request.app, session)
            log_event(session_id, "chat", {
                "message": message,
                "agent_name": response.agent_name,
                "response_type": response.response_type,
            })

            yield f"data: {json.dumps({'type': 'complete', 'agent_response': response.model_dump()}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/{session_id}/evaluate")
async def evaluate_session(session_id: str, request: Request):
    """基于学习行为事件评估学生并返回建议"""
    session = _load_session(request.app, session_id)
    if not session:
        return {"success": False, "error": "会话不存在"}

    events = get_session_events(session_id)
    reviewer = ReviewerAgent()

    # 从学习事件中汇总练习、代码运行和聊天轮次
    exercise_results = []
    code_runs = []
    chat_turns = 0
    for event in events:
        event_type = event.get("event_type")
        payload = event.get("payload", {})
        if event_type == "exercise_submitted":
            exercise_results.append({
                "concept": payload.get("concept", ""),
                "correct": payload.get("is_correct", False),
                "answer": payload.get("answer", ""),
            })
        elif event_type == "code_executed":
            code_runs.append({
                "concept": payload.get("concept", ""),
                "passed": payload.get("passed", False),
                "stdout": payload.get("stdout", ""),
            })
        elif event_type == "chat":
            chat_turns += 1

    profile = session.get("profile", get_default_profile().model_dump())
    # 选择评估目标知识点：优先最近练习/代码运行的知识点，否则取最近掌握知识点
    concept = "当前知识点"
    if exercise_results:
        concept = exercise_results[-1].get("concept", concept)
    elif code_runs:
        concept = code_runs[-1].get("concept", concept)
    elif profile.get("mastered_concepts"):
        concept = profile["mastered_concepts"][-1]

    from app.agents.base import AgentMessage
    eval_msg = AgentMessage(
        intent="PROGRESS_CHECK",
        stage="evaluator",
        payload={
            "concept": concept,
            "exercise_results": exercise_results,
            "code_runs": code_runs,
        },
        context={
            "session_id": session_id,
            "profile": profile,
            "target_concept": concept,
        },
        from_agent="user",
    )
    eval_result = reviewer.evaluate(eval_msg)
    evaluation = eval_result.payload

    # 根据评估结果自动调整画像：知识水平与掌握知识点
    mastery_delta = evaluation.get("mastery_delta", {})
    deltas = [v for v in mastery_delta.values() if isinstance(v, (int, float))]
    if deltas:
        avg_delta = sum(deltas) / len(deltas)
        profile["knowledge_level"] = min(5.0, profile.get("knowledge_level", 1.0) + avg_delta)

    # 如果该知识点练习正确率达标或掌握度增量足够，则加入已掌握列表
    mastered = set(profile.get("mastered_concepts", []))
    if deltas and concept not in mastered:
        accuracy = 0.0
        concept_exercises = [r for r in exercise_results if r.get("concept") == concept]
        if concept_exercises:
            correct = sum(1 for r in concept_exercises if r.get("correct"))
            accuracy = correct / len(concept_exercises)
        if accuracy >= 0.5 or (deltas and max(deltas) >= 0.15):
            mastered.add(concept)
            profile["mastered_concepts"] = list(mastered)

    session["profile"] = profile
    _save_session(request.app, session)
    log_event(session_id, "evaluation_result", {
        "concept": concept,
        "summary": evaluation.get("summary", ""),
        "weak_points": evaluation.get("weak_points", []),
        "next_recommendation": evaluation.get("next_recommendation", ""),
    })

    return {
        "success": True,
        "session_id": session_id,
        "concept": concept,
        "evaluation": evaluation,
        "updated_profile": profile,
        "stats": {
            "exercises": len(exercise_results),
            "code_runs": len(code_runs),
            "chat_turns": chat_turns,
        },
    }
