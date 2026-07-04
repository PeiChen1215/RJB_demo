"""Knowledge Furnace：知识熔炉自动触发与版本演进服务

对应需求/功能：
- 根据群体代码提交错误率自动触发资源重审，持续改进某知识点的教学资源。
- 记录资源版本演进历史（v1.0 → v1.1 → v1.2），供前端知识熔炉展示。

主要函数：
- should_trigger_resource_review(concept)：判断某知识点是否满足重审条件。
- trigger_resource_review(...)：执行重审、生成新版本、持久化到 resource / resource_version。

触发策略：
- 错误率阈值：ERROR_RATE_THRESHOLD = 0.6
- 最小样本数：MIN_SUBMISSIONS = 5（避免少量样本误触发）

TODO:
- [已完成] 基于全局错误率判断是否需要重审
- [已完成] 调用 Orchestrator 重新生成资源并保存版本演进
- [已完成] 与代码判题接口联动，后台触发
- [待完成] 接入资源反馈（confusion_marked、rating）作为辅助触发信号
- [待完成] 增加重审任务队列，避免多个提交同时触发多次重审
"""
import os
import uuid
from typing import Any, Dict, Optional, Tuple

from app.agents.orchestrator import AgentOrchestrator
from app.services.database import (
    create_generation_task,
    create_resource,
    find_latest_resource_by_concept,
    get_global_error_stats,
    save_resource_version,
    update_generation_task,
)

ERROR_RATE_THRESHOLD = float(os.environ.get("FURNACE_ERROR_RATE_THRESHOLD", "0.6"))
MIN_SUBMISSIONS = int(os.environ.get("FURNACE_MIN_SUBMISSIONS", "5"))


def should_trigger_resource_review(concept: str) -> Tuple[bool, Dict[str, Any]]:
    """判断某知识点是否需要触发资源重审"""
    stats = get_global_error_stats(concept)
    total = stats.get("total_submissions", 0)
    error_rate = stats.get("error_rate", 0.0)
    should = total >= MIN_SUBMISSIONS and error_rate >= ERROR_RATE_THRESHOLD
    return should, stats


def trigger_resource_review(
    concept: str,
    triggered_by: str = "error_rate",
    reason: str = "知识点代码提交错误率超过阈值，自动触发资源重审",
    force: bool = False,
) -> Optional[Dict[str, Any]]:
    """触发资源重审并保存新版本。

    返回 None 表示未满足触发条件（force=True 时不做阈值判断）；
    否则返回重审任务元信息。
    """
    stats = {"total_submissions": 0, "error_rate": 0.0}
    if not force:
        should, stats = should_trigger_resource_review(concept)
        if not should:
            return None

    latest = find_latest_resource_by_concept(concept)
    if not latest:
        next_version = 1
        resource_id = str(uuid.uuid4())
    else:
        resource_id = latest["resource_id"]
        next_version = latest.get("version", 1) + 1

    task_id = str(uuid.uuid4())
    create_generation_task(
        task_id=task_id,
        session_id="system",
        concept=concept,
        status="pending",
        stage_message="知识熔炉：错误率过高，触发资源重审",
    )

    try:
        session = {
            "session_id": "system",
            "user_id": "system",
            "profile": {},
            "dialogue_history": [],
            "target_concept": concept,
        }
        orchestrator = AgentOrchestrator()
        result = orchestrator.generate_resource(session, concept)

        package = result.get("package", {})
        debate_report = result.get("debate_report", {})

        create_resource(
            resource_id=resource_id,
            task_id=task_id,
            session_id="system",
            concept=concept,
            version=next_version,
            document=package.get("document", ""),
            mindmap=package.get("mindmap", ""),
            exercises=package.get("exercises", []),
            code_cases=package.get("code_cases", []),
            audio_text=package.get("audio_text", ""),
            debate_report=debate_report,
            status="approved"
            if debate_report.get("status") in ("PASSED", "MODIFIED")
            else "rejected",
        )

        save_resource_version(
            resource_id=resource_id,
            version=next_version,
            document=package.get("document", ""),
            mindmap=package.get("mindmap", ""),
            exercises=package.get("exercises", []),
            code_cases=package.get("code_cases", []),
            change_reason=reason,
            concept=concept,
            triggered_by=triggered_by,
        )

        update_generation_task(
            task_id,
            status="completed",
            progress=100,
            stage_message="知识熔炉：资源重审完成",
            result={"resource_id": resource_id, "version": next_version},
        )

        return {
            "task_id": task_id,
            "resource_id": resource_id,
            "version": next_version,
            "concept": concept,
            "error_rate": stats["error_rate"],
            "total_submissions": stats["total_submissions"],
            "triggered_by": triggered_by,
        }
    except Exception as e:
        update_generation_task(
            task_id,
            status="failed",
            progress=0,
            stage_message="知识熔炉：资源重审失败",
            error_message=str(e),
        )
        return {
            "task_id": task_id,
            "concept": concept,
            "error_rate": stats["error_rate"],
            "triggered_by": triggered_by,
            "error": str(e),
        }
