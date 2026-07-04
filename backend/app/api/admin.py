"""管理后台 API

提供系统运营统计与手动触发资源重审能力。
"""
from fastapi import APIRouter, Query

from app.services.database import get_db
from app.services.knowledge_furnace import trigger_resource_review

router = APIRouter()


@router.get("/stats")
async def get_admin_stats():
    """获取系统运营统计"""
    db = get_db()
    try:
        stats = {
            "sessions": len(list(db["sessions"].rows)),
            "users": len(list(db["users"].rows)),
            "learning_events": len(list(db["learning_events"].rows)),
            "resources": len(list(db["resource"].rows)) if "resource" in db.table_names() else 0,
            "generation_tasks": len(list(db["generation_task"].rows)) if "generation_task" in db.table_names() else 0,
            "debate_records": len(list(db["debate_record"].rows)) if "debate_record" in db.table_names() else 0,
            "code_submissions": len(list(db["code_submission"].rows)) if "code_submission" in db.table_names() else 0,
            "resource_versions": len(list(db["resource_version"].rows)) if "resource_version" in db.table_names() else 0,
            "resource_feedback": len(list(db["resource_feedback"].rows)) if "resource_feedback" in db.table_names() else 0,
        }

        # 计算整体代码提交通过率
        submissions = list(db["code_submission"].rows_where("passed IS NOT NULL"))
        total = len(submissions)
        passed = sum(1 for r in submissions if r["passed"])
        stats["code_pass_rate"] = round(passed / total, 4) if total else 0.0
        stats["total_submissions"] = total

        return {"status": "ok", "stats": stats}
    finally:
        db.conn.close()


@router.post("/resource-review")
async def trigger_manual_resource_review(
    concept: str = Query(..., description="需要重审的知识点"),
    reason: str = Query("manual", description="触发原因，如 manual / error_rate / feedback"),
):
    """管理员手动触发某知识点的资源重审"""
    result = trigger_resource_review(concept, triggered_by=reason, force=True)
    if not result:
        return {"success": False, "concept": concept, "reason": reason, "message": "重审未执行"}
    return {
        "success": True,
        "concept": concept,
        "reason": reason,
        "task_id": result["task_id"],
        "resource_id": result["resource_id"],
        "version": result["version"],
    }
