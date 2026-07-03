"""资源生成 API

对应需求/功能：
- 为前端提供教学资源生成接口，支持同步生成与 SSE 流式生成两种模式。
- 同步接口用于兼容旧代码和测试；流式接口用于生产环境，实时返回
  Navigator / Builder / Debate / Complete 等阶段进度。
- 生成结果会持久化到 resource 和 debate_record 表，并更新会话状态。

主要接口：
- POST /api/resources/generate：同步生成某个知识点的资源。
- POST /api/resources/generate-for-session/{session_id}：为指定会话同步生成资源（兼容旧接口）。
- GET /api/resources/stream-generate：SSE 流式生成资源并返回进度。

主要函数：
- _get_or_create_session：从内存缓存或 SQLite 获取/创建会话。
- _save_session：保存会话到内存和 SQLite。
- _stage_to_status：将 SSE stage 映射为任务状态。
- _model_to_dict：Pydantic 模型/列表转 dict。
- _persist_resource_and_debate：将生成结果持久化到数据库。

TODO:
- [已完成] 同步资源生成接口已实现
- [已完成] 资源生成改为异步任务 + SSE 流式返回进度
- [已完成] 生成结果持久化到 resource / debate_record 表已实现
- [待完成] 接入 Redis 缓存已辩论通过的资源，避免重复调用 LLM
- [待完成] 生成真正的 TTS 音频文件并返回 URL
- [已完成] 生成超时熔断与降级已由 Orchestrator 统一处理
- [待完成] 增加生成重试机制
- [待完成] 支持批量生成多个知识点的学习资源
"""
import json
import uuid
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import AgentOrchestrator
from app.models.schemas import StudentProfile
from app.services.database import (
    create_debate_record,
    create_generation_task,
    create_resource,
    create_session,
    find_latest_resource_by_concept,
    find_latest_generation_task_by_concept,
    get_global_error_stats,
    get_resource_versions,
    get_resource_versions_by_id,
    get_session,
    log_event,
    update_generation_task,
    update_session,
)

router = APIRouter()


def _get_or_create_session(request: Request, session_id: str | None = None):
    """获取或创建会话（内存 + SQLite）"""
    sessions_db = request.app.state.sessions_db

    if session_id:
        # 先查内存缓存，命中则直接返回
        if session_id in sessions_db:
            return sessions_db[session_id]
        # 再查 SQLite，命中后回填内存缓存
        row = get_session(session_id)
        if row:
            sessions_db[session_id] = row
            return row

    # 未找到则创建默认会话
    session = {
        "session_id": session_id or "default",
        "user_id": "default",
        "profile": StudentProfile().model_dump(),
        "dialogue_history": [],
        "target_concept": None,
    }
    if session_id:
        sessions_db[session_id] = session
        create_session(session_id, "default", session["profile"])
    else:
        sessions_db["default"] = session
    return session


def _save_session(request: Request, session: dict):
    """保存会活到内存和 SQLite"""
    request.app.state.sessions_db[session["session_id"]] = session
    update_session(
        session["session_id"],
        session["profile"],
        session.get("dialogue_history", []),
        session.get("target_concept"),
    )


def _stage_to_status(stage: str) -> str:
    """将 SSE stage 映射为任务状态，便于前端展示"""
    mapping = {
        "cache": "completed",
        "builder": "generating",
        "validation": "generating",
        "revision": "debating",
        "debate": "debating",
        "complete": "completed",
    }
    return mapping.get(stage, "generating")


def _model_to_dict(obj: Any) -> Any:
    """将 Pydantic 模型或模型列表转为 dict"""
    from pydantic import BaseModel
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    if isinstance(obj, list):
        return [_model_to_dict(item) for item in obj]
    return obj


def _persist_resource_and_debate(task_id: str, session_id: str, result: dict):
    """将生成结果持久化到 resource 和 debate_record 表"""
    concept = result.get("concept", "")
    package = _model_to_dict(result.get("package", {}))
    debate_report = _model_to_dict(result.get("debate_report", {}))

    resource_id = str(uuid.uuid4())
    debate_id = str(uuid.uuid4())

    # 辩论通过或修改通过则标记为 approved，否则 rejected
    create_resource(
        resource_id=resource_id,
        task_id=task_id,
        session_id=session_id,
        concept=concept,
        document=package.get("document"),
        mindmap=package.get("mindmap"),
        exercises=package.get("exercises"),
        code_cases=package.get("code_cases"),
        audio_text=package.get("audio_text"),
        debate_report=debate_report,
        status="approved" if debate_report.get("status") in ("PASSED", "MODIFIED") else "rejected",
    )

    create_debate_record(
        debate_id=debate_id,
        task_id=task_id,
        resource_id=resource_id,
        concept=concept,
        status=debate_report.get("status", "PASSED"),
        rounds=debate_report.get("rounds"),
        final_votes=debate_report.get("final_votes"),
        summary=f"辩论结果：{debate_report.get('status', 'UNKNOWN')}",
    )

    return resource_id, debate_id


@router.post("/generate")
async def generate_resource(request: Request, concept: str | None = None):
    """生成某个知识点的学习资源并执行辩论议会（同步版本）。

    兼容两种调用方式：
    1. 旧 query 参数：`POST /generate?concept=变量与赋值`
    2. JSON body：`POST /generate` body={"concept": "...", "session_id": "...", "profile": {...}}
    """
    body_profile = None
    body_session_id = None
    if not concept:
        try:
            body = await request.json()
        except Exception:
            body = {}
        concept = body.get("concept")
        body_session_id = body.get("session_id")
        body_profile = body.get("profile")

    if not concept:
        return {"error": "未指定知识点"}

    session = _get_or_create_session(request, body_session_id)
    session_id = session["session_id"]

    if body_profile and isinstance(body_profile, dict):
        session.setdefault("profile", {})
        session["profile"].update(body_profile)

    task_id = str(uuid.uuid4())

    # 创建生成任务记录
    create_generation_task(task_id, session_id, concept, status="pending")

    orchestrator = AgentOrchestrator()
    result = orchestrator.generate_resource(session, concept)

    # 持久化生成结果并更新任务状态
    resource_id, debate_id = _persist_resource_and_debate(task_id, session_id, result)
    update_generation_task(
        task_id,
        status="completed",
        progress=100,
        stage_message="资源生成与辩论审核完成",
        result={"resource_id": resource_id, "debate_id": debate_id},
    )

    session["target_concept"] = concept
    _save_session(request, session)
    log_event(session_id, "resource_generated", {
        "concept": concept,
        "debate_status": result.get("debate_report", {}).get("status"),
        "task_id": task_id,
        "resource_id": resource_id,
    })

    return result


@router.post("/generate-for-session/{session_id}")
async def generate_resource_for_session(
    session_id: str,
    request: Request,
    concept: str | None = None,
):
    """为指定会话生成资源（同步版本）。

    兼容两种调用方式：
    1. 旧 query 参数：`POST /generate-for-session/{session_id}?concept=变量与赋值`
    2. JSON body：`POST /generate-for-session/{session_id}` body={"concept": "...", "profile": {...}}
    """
    session = _get_or_create_session(request, session_id)
    if not session:
        return {"error": "会话不存在"}

    body_profile = None
    if not concept:
        try:
            body = await request.json()
        except Exception:
            body = {}
        concept = body.get("concept") or session.get("target_concept")
        body_profile = body.get("profile")

    if not concept:
        return {"error": "未指定知识点"}

    # 如果请求传入了 profile，临时合并到 session profile 中用于本次生成
    if body_profile and isinstance(body_profile, dict):
        session.setdefault("profile", {})
        session["profile"].update(body_profile)

    task_id = str(uuid.uuid4())
    create_generation_task(task_id, session_id, concept, status="pending")

    orchestrator = AgentOrchestrator()
    result = orchestrator.generate_resource(session, concept)

    # 持久化生成结果
    resource_id, debate_id = _persist_resource_and_debate(task_id, session_id, result)
    update_generation_task(
        task_id,
        status="completed",
        progress=100,
        stage_message="资源生成与辩论审核完成",
        result={"resource_id": resource_id, "debate_id": debate_id},
    )

    session["target_concept"] = concept
    _save_session(request, session)
    log_event(session_id, "resource_generated", {
        "concept": concept,
        "debate_status": result.get("debate_report", {}).get("status"),
        "task_id": task_id,
        "resource_id": resource_id,
    })

    return result


@router.get("/stream-generate")
async def stream_generate_resource(session_id: str, concept: str, request: Request):
    """流式生成资源（SSE）

    前端通过 EventSource 连接后，会收到以下事件：
    - event: progress -> data: {"stage": "builder", "message": "..."}
    - event: progress -> data: {"stage": "validation", "message": "..."}
    - event: progress -> data: {"stage": "debate", "message": "..."}
    - event: complete -> data: {"concept": ..., "package": ..., ...}
    - event: error -> data: {"message": "..."}
    """
    session = _get_or_create_session(request, session_id)
    orchestrator = AgentOrchestrator()
    task_id = str(uuid.uuid4())

    create_generation_task(task_id, session_id, concept, status="pending",
                           stage_message="等待开始生成...")

    async def event_generator():
        final_result = None
        try:
            async for event in orchestrator.generate_resource_stream(
                session, concept
            ):
                # 根据事件类型更新生成任务状态
                event_type = event.get("type")
                if event_type == "progress":
                    stage = event.get("stage", "generating")
                    progress = {"builder": 30, "validation": 50, "debate": 70,
                                "revision": 80, "complete": 100, "cache": 100}.get(stage, 30)
                    update_generation_task(
                        task_id,
                        status=_stage_to_status(stage),
                        progress=progress,
                        stage_message=event.get("message", ""),
                    )

                # SSE 格式：每个事件以 data: 开头，以两个换行结束
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                # 记录完整结果，用于 finally 中持久化
                if event_type == "complete":
                    final_result = event
        except Exception as e:
            update_generation_task(
                task_id,
                status="failed",
                progress=0,
                stage_message="生成失败",
                error_message=str(e),
            )
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            # 生成结束后持久化结果到 resource / debate_record
            if final_result:
                try:
                    resource_id, debate_id = _persist_resource_and_debate(
                        task_id, session_id, final_result
                    )
                    update_generation_task(
                        task_id,
                        status="completed",
                        progress=100,
                        stage_message="资源生成与辩论审核完成",
                        result={"resource_id": resource_id, "debate_id": debate_id},
                    )
                except Exception as e:
                    update_generation_task(
                        task_id,
                        status="failed",
                        error_message=f"持久化失败: {e}",
                    )

            # 无论成功与否，都保存会话并记录日志
            session["target_concept"] = concept
            _save_session(request, session)
            log_event(session_id, "resource_generated", {
                "concept": concept,
                "debate_status": final_result.get("debate_report", {}).get("status") if final_result else "ERROR",
                "success": final_result is not None,
                "task_id": task_id,
            })

            # 如果流程因 Agent 降级/超时中断，把任务标记为失败
            if final_result is None:
                update_generation_task(
                    task_id,
                    status="failed",
                    progress=0,
                    stage_message="生成中断：Agent 超时或降级",
                    error_message="Agent 调用超时/熔断，未拿到完整结果",
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/versions")
async def get_resource_version_history(concept: str):
    """获取某知识点的资源版本演进历史（知识熔炉展示用）"""
    versions = get_resource_versions(concept)
    return {"concept": concept, "versions": versions}


@router.get("/latest")
async def get_latest_resource(concept: str):
    resource = find_latest_resource_by_concept(concept)
    return {
        "concept": concept,
        "has_resource": resource is not None,
        "resource": resource,
    }


@router.get("/evolution")
async def get_resource_evolution(concept: str):
    """获取某知识点的资源版本演进（含错误率、版本差异、改进原因）"""
    error_stats = get_global_error_stats(concept)
    versions = get_resource_versions(concept)

    # 计算相邻版本差异
    enriched = []
    for i, v in enumerate(versions):
        snapshot = v.get("content_snapshot", {})
        prev = versions[i - 1] if i > 0 else None
        prev_snapshot = prev.get("content_snapshot", {}) if prev else {}
        diff = {
            "document_changed": snapshot.get("document", "") != prev_snapshot.get("document", ""),
            "exercises_diff": len(snapshot.get("exercises", [])) - len(prev_snapshot.get("exercises", [])),
            "code_cases_diff": len(snapshot.get("code_cases", [])) - len(prev_snapshot.get("code_cases", [])),
        }
        enriched.append({
            "version": v.get("version"),
            "resource_id": v.get("resource_id"),
            "created_at": v.get("created_at"),
            "triggered_by": v.get("triggered_by"),
            "change_reason": v.get("change_reason"),
            "exercises_count": len(snapshot.get("exercises", [])),
            "code_cases_count": len(snapshot.get("code_cases", [])),
            "diff": diff,
        })

    return {
        "concept": concept,
        "error_stats": error_stats,
        "versions": enriched,
    }


_DEFAULT_THINKING_STEPS = [
    {"agent": "Navigator", "stage": "navigator", "message": "正在规划「{concept}」的学习路径...", "icon": "map"},
    {"agent": "Generator", "stage": "builder", "message": "正在为「{concept}」生成个性化教学资源...", "icon": "sparkles"},
    {"agent": "Reviewer", "stage": "debate", "message": "正在提交辩论议会审核...", "icon": "scale"},
    {"agent": "System", "stage": "complete", "message": "资源生成流程全部完成。", "icon": "check"},
]


@router.get("/thinking-path")
async def get_thinking_path(concept: str):
    """获取某知识点的生成过程回放步骤（思考路径）"""
    task = find_latest_generation_task_by_concept(concept)
    if task:
        status = task.get("status") or "pending"
        steps = [
            {"agent": "Navigator", "stage": "navigator", "message": f"正在规划「{concept}」的学习路径...", "icon": "map"},
            {"agent": "Generator", "stage": "builder", "message": f"正在为「{concept}」生成个性化教学资源...", "icon": "sparkles"},
            {"agent": "Reviewer", "stage": "debate", "message": task.get("stage_message") or "正在提交辩论议会审核...", "icon": "scale"},
            {"agent": "System", "stage": "complete", "message": "资源生成流程全部完成。" if status == "completed" else f"当前状态：{status}", "icon": "check"},
        ]
    else:
        steps = [
            {**step, "message": step["message"].format(concept=concept)}
            for step in _DEFAULT_THINKING_STEPS
        ]
    return {"concept": concept, "steps": steps}
