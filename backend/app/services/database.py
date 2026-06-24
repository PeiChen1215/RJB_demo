"""SQLite 持久化与学习行为日志

对应需求：
- 为系统提供轻量级持久化层，保存学习会话、画像、生成任务、资源、
  辩论记录、代码提交、掌握度、认知风格证据与资源反馈。
- 记录学习行为事件，支撑后续画像更新与知识熔炉优化。

主要类/函数/接口：
- _db_path / get_db / init_db：数据库路径解析、连接获取与表结构初始化。
- create_user / get_user：用户账号持久化（供认证模块使用）。
- create_session / get_session / update_session：学习会话 CRUD。
- log_event / get_session_events / get_session_stats：事件记录与统计。
- 资源生成：create_generation_task、update_generation_task、get/list。
- 资源：create_resource、get_resource、find_resource_by_concept。
- 版本演进：create_resource_version、get_resource_versions（知识熔炉）。
- 辩论与提交：create_debate_record、create_code_submission 等。
- 掌握度与画像：update_mastery_state、add_cognitive_evidence、
  add_resource_feedback 及对应统计接口。

TODO:
- [已完成] 会话、用户、事件、资源生成任务、资源、版本、辩论记录、代码提交、
  掌握度、认知证据、资源反馈等表的初始化与 CRUD。
- [已完成] 基于 sqlite_utils 的索引创建。
- [已完成] 跨会话查找最新资源，支持知识熔炉自动重审。
- [待完成] 迁移到 PostgreSQL，以支持高并发与复杂查询。
- [待完成] 增加用户表与认证流程的完整集成（当前 user 表仅做基础存储）。
- [待完成] 增加更多复合索引优化高频查询（session+concept、event_type+created_at 等）。
"""
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlite_utils import Database

from app.core.config import get_settings


def _db_path() -> str:
    settings = get_settings()
    db_url = settings.DATABASE_URL
    if db_url.startswith("sqlite:///"):
        db_path = db_url[10:]
    else:
        db_path = db_url
    db_path = os.path.abspath(db_path)
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    return db_path


def get_db() -> Database:
    """获取新的 SQLite 数据库实例（每个线程独立连接，避免跨线程问题）"""
    conn = sqlite3.connect(_db_path(), check_same_thread=False)
    db = Database(conn)
    init_db(db)
    return db


def init_db(db: Database):
    """初始化数据库表"""
    if "sessions" not in db.table_names():
        db["sessions"].create({
            "session_id": str,
            "user_id": str,
            "profile": str,  # JSON
            "dialogue_history": str,  # JSON
            "target_concept": str,
            "created_at": str,
            "updated_at": str,
        }, pk="session_id")

    if "learning_events" not in db.table_names():
        db["learning_events"].create({
            "id": int,
            "session_id": str,
            "event_type": str,
            "payload": str,  # JSON
            "created_at": str,
        }, pk="id", if_not_exists=True)
        db["learning_events"].create_index(["session_id"], if_not_exists=True)
        db["learning_events"].create_index(["event_type"], if_not_exists=True)

    if "users" not in db.table_names():
        db["users"].create({
            "username": str,
            "hashed_password": str,
            "created_at": str,
        }, pk="username")

    # === 资源生成任务 ===
    if "generation_task" not in db.table_names():
        db["generation_task"].create({
            "task_id": str,
            "session_id": str,
            "concept": str,
            "status": str,          # pending / planning / generating / debating / rendering / completed / failed
            "progress": int,
            "stage_message": str,
            "result": str,          # JSON: {"resource_id": ...}
            "error_message": str,
            "created_at": str,
            "updated_at": str,
        }, pk="task_id", if_not_exists=True)
        db["generation_task"].create_index(["session_id"], if_not_exists=True)
        db["generation_task"].create_index(["concept"], if_not_exists=True)

    # === 生成资源 ===
    if "resource" not in db.table_names():
        db["resource"].create({
            "resource_id": str,
            "task_id": str,
            "session_id": str,
            "concept": str,
            "version": int,
            "document": str,
            "mindmap": str,
            "exercises": str,       # JSON
            "code_cases": str,      # JSON
            "audio_text": str,
            "debate_report": str,   # JSON
            "status": str,          # approved / rejected / cached / draft
            "created_at": str,
            "updated_at": str,
        }, pk="resource_id", if_not_exists=True)
        db["resource"].create_index(["session_id"], if_not_exists=True)
        db["resource"].create_index(["concept"], if_not_exists=True)
        db["resource"].create_index(["task_id"], if_not_exists=True)

    # === 资源版本演进（知识熔炉） ===
    if "resource_version" not in db.table_names():
        db["resource_version"].create({
            "version_id": int,
            "resource_id": str,
            "concept": str,
            "version": int,
            "change_reason": str,
            "triggered_by": str,
            "content_snapshot": str,  # JSON
            "created_at": str,
        }, pk="version_id", if_not_exists=True)
        db["resource_version"].create_index(["resource_id"], if_not_exists=True)
        db["resource_version"].create_index(["concept"], if_not_exists=True)

    # === 辩论记录 ===
    if "debate_record" not in db.table_names():
        db["debate_record"].create({
            "debate_id": str,
            "task_id": str,
            "resource_id": str,
            "concept": str,
            "status": str,          # PASSED / MODIFIED / REJECTED
            "rounds": str,          # JSON
            "final_votes": str,     # JSON
            "summary": str,
            "created_at": str,
        }, pk="debate_id", if_not_exists=True)
        db["debate_record"].create_index(["task_id"], if_not_exists=True)
        db["debate_record"].create_index(["resource_id"], if_not_exists=True)
        db["debate_record"].create_index(["concept"], if_not_exists=True)

    # === 代码提交 ===
    if "code_submission" not in db.table_names():
        db["code_submission"].create({
            "submission_id": str,
            "session_id": str,
            "exercise_id": str,
            "concept": str,
            "code": str,
            "output": str,
            "passed": bool,
            "error_type": str,      # syntax / runtime / logic / passed
            "execution_time": float,
            "created_at": str,
        }, pk="submission_id", if_not_exists=True)
        db["code_submission"].create_index(["session_id"], if_not_exists=True)
        db["code_submission"].create_index(["concept"], if_not_exists=True)

    # === 知识点掌握度（BKT） ===
    if "mastery_state" not in db.table_names():
        db["mastery_state"].create({
            "id": int,
            "session_id": str,
            "concept": str,
            "p_known": float,
            "evidence_count": int,
            "last_updated": str,
        }, pk="id", if_not_exists=True)
        db["mastery_state"].create_index(["session_id"], if_not_exists=True)
        db["mastery_state"].create_index(["concept"], if_not_exists=True)
        db["mastery_state"].create_index(["session_id", "concept"], unique=True, if_not_exists=True)

    # === 认知风格证据 ===
    if "cognitive_profile_evidence" not in db.table_names():
        db["cognitive_profile_evidence"].create({
            "id": int,
            "session_id": str,
            "dimension": str,       # cognitive_field / cognitive_modality / learning_pace / etc
            "evidence_type": str,   # click_mindmap / run_code / stay_audio / expand_hint / etc
            "weight": float,
            "description": str,
            "source_event_id": int,
            "created_at": str,
        }, pk="id", if_not_exists=True)
        db["cognitive_profile_evidence"].create_index(["session_id"], if_not_exists=True)
        db["cognitive_profile_evidence"].create_index(["dimension"], if_not_exists=True)

    # === 资源反馈（知识熔炉数据来源） ===
    if "resource_feedback" not in db.table_names():
        db["resource_feedback"].create({
            "feedback_id": int,
            "session_id": str,
            "resource_id": str,
            "concept": str,
            "rating": int,
            "error_report": str,
            "confusion_marked": bool,
            "created_at": str,
        }, pk="feedback_id", if_not_exists=True)
        db["resource_feedback"].create_index(["session_id"], if_not_exists=True)
        db["resource_feedback"].create_index(["resource_id"], if_not_exists=True)
        db["resource_feedback"].create_index(["concept"], if_not_exists=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_user(username: str, hashed_password: str):
    db = get_db()
    try:
        db["users"].insert({
            "username": username,
            "hashed_password": hashed_password,
            "created_at": _now(),
        })
    finally:
        db.conn.close()


def get_user(username: str) -> Optional[dict]:
    db = get_db()
    try:
        row = db["users"].get(username)
        if not row:
            return None
        return {
            "username": row["username"],
            "hashed_password": row["hashed_password"],
            "created_at": row["created_at"],
        }
    except Exception:
        return None
    finally:
        db.conn.close()


def create_session(session_id: str, user_id: str, profile: dict, target_concept: Optional[str] = None):
    db = get_db()
    try:
        db["sessions"].insert({
            "session_id": session_id,
            "user_id": user_id,
            "profile": json.dumps(profile, ensure_ascii=False),
            "dialogue_history": json.dumps([], ensure_ascii=False),
            "target_concept": target_concept,
            "created_at": _now(),
            "updated_at": _now(),
        }, replace=True)
    finally:
        db.conn.close()


def get_session(session_id: str) -> Optional[dict]:
    db = get_db()
    try:
        row = db["sessions"].get(session_id)
        if not row:
            return None
        return {
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "profile": json.loads(row["profile"]),
            "dialogue_history": json.loads(row["dialogue_history"]),
            "target_concept": row["target_concept"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
    finally:
        db.conn.close()


def update_session(session_id: str, profile: dict, dialogue_history: list, target_concept: Optional[str] = None):
    db = get_db()
    try:
        updates = {
            "profile": json.dumps(profile, ensure_ascii=False),
            "dialogue_history": json.dumps(dialogue_history, ensure_ascii=False),
            "updated_at": _now(),
        }
        if target_concept is not None:
            updates["target_concept"] = target_concept
        db["sessions"].update(session_id, updates)
    finally:
        db.conn.close()


def log_event(session_id: str, event_type: str, payload: Dict[str, Any], concept: Optional[str] = None):
    """记录学习行为事件

    Args:
        session_id: 会话 ID
        event_type: 事件类型
        payload: 事件载荷
        concept: 关联知识点（存入 payload 中，向后兼容）
    """
    full_payload = dict(payload)
    if concept:
        full_payload["_concept"] = concept
    db = get_db()
    try:
        db["learning_events"].insert({
            "session_id": session_id,
            "event_type": event_type,
            "payload": json.dumps(full_payload, ensure_ascii=False),
            "created_at": _now(),
        })
    finally:
        db.conn.close()


def get_session_events(session_id: str, event_type: Optional[str] = None, concept: Optional[str] = None) -> List[dict]:
    db = get_db()
    try:
        table = db["learning_events"]
        conditions = ["session_id = ?"]
        params = [session_id]
        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        rows = table.rows_where(" AND ".join(conditions), params)
        results = []
        for r in rows:
            payload = json.loads(r["payload"])
            if concept:
                # concept 存在 payload._concept 中，这里做过滤
                if payload.get("_concept") != concept:
                    continue
            results.append({
                "id": r["id"],
                "session_id": r["session_id"],
                "event_type": r["event_type"],
                "concept": payload.get("_concept", ""),
                "payload": payload,
                "created_at": r["created_at"],
            })
        return results
    finally:
        db.conn.close()


def get_session_stats(session_id: str) -> dict:
    """获取会话学习统计"""
    db = get_db()
    try:
        events = list(db["learning_events"].rows_where("session_id = ?", [session_id]))

        stats = {
            "total_events": len(events),
            "chat_count": 0,
            "resource_generated_count": 0,
            "exercise_submitted_count": 0,
            "code_executed_count": 0,
            "exercise_passed_count": 0,
            "exercise_failed_count": 0,
        }

        for e in events:
            et = e["event_type"]
            if et == "chat":
                stats["chat_count"] += 1
            elif et == "resource_generated":
                stats["resource_generated_count"] += 1
            elif et == "exercise_submitted":
                stats["exercise_submitted_count"] += 1
                payload = json.loads(e["payload"])
                if payload.get("passed"):
                    stats["exercise_passed_count"] += 1
                else:
                    stats["exercise_failed_count"] += 1
            elif et == "code_executed":
                stats["code_executed_count"] += 1

        return stats
    finally:
        db.conn.close()


# =============================================================================
# 新增：资源生成任务相关操作
# =============================================================================

def create_generation_task(task_id: str, session_id: str, concept: str, status: str = "pending",
                           progress: int = 0, stage_message: str = ""):
    """创建资源生成任务"""
    db = get_db()
    try:
        db["generation_task"].insert({
            "task_id": task_id,
            "session_id": session_id,
            "concept": concept,
            "status": status,
            "progress": progress,
            "stage_message": stage_message,
            "result": json.dumps({}, ensure_ascii=False),
            "error_message": "",
            "created_at": _now(),
            "updated_at": _now(),
        }, replace=True)
    finally:
        db.conn.close()


def update_generation_task(task_id: str, **kwargs):
    """更新生成任务状态和进度"""
    db = get_db()
    try:
        updates = {"updated_at": _now()}
        for k, v in kwargs.items():
            if k in {"status", "progress", "stage_message", "error_message"}:
                updates[k] = v
            elif k == "result":
                updates[k] = json.dumps(v, ensure_ascii=False)
        db["generation_task"].update(task_id, updates)
    finally:
        db.conn.close()


def get_generation_task(task_id: str) -> Optional[dict]:
    """获取生成任务详情"""
    db = get_db()
    try:
        row = db["generation_task"].get(task_id)
        if not row:
            return None
        return {
            "task_id": row["task_id"],
            "session_id": row["session_id"],
            "concept": row["concept"],
            "status": row["status"],
            "progress": row["progress"],
            "stage_message": row["stage_message"],
            "result": json.loads(row["result"]) if row["result"] else {},
            "error_message": row["error_message"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
    except Exception:
        return None
    finally:
        db.conn.close()


def list_generation_tasks(session_id: str, concept: Optional[str] = None, limit: int = 50) -> List[dict]:
    """列出会话的资源生成任务"""
    db = get_db()
    try:
        where = {"session_id": session_id}
        if concept:
            where["concept"] = concept
        rows = db["generation_task"].rows_where(
            " AND ".join(f"{k} = ?" for k in where),
            list(where.values())
        )
        return [
            {
                "task_id": r["task_id"],
                "session_id": r["session_id"],
                "concept": r["concept"],
                "status": r["status"],
                "progress": r["progress"],
                "stage_message": r["stage_message"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ][:limit]
    finally:
        db.conn.close()


# =============================================================================
# 新增：资源相关操作
# =============================================================================

def create_resource(resource_id: str, session_id: str, concept: str, task_id: Optional[str] = None,
                    version: int = 1, document: Optional[str] = None, mindmap: Optional[str] = None,
                    exercises: Optional[List[Dict]] = None, code_cases: Optional[List[Dict]] = None,
                    audio_text: Optional[str] = None, debate_report: Optional[Dict] = None,
                    status: str = "approved"):
    """创建生成的学习资源"""
    db = get_db()
    try:
        db["resource"].insert({
            "resource_id": resource_id,
            "task_id": task_id or "",
            "session_id": session_id,
            "concept": concept,
            "version": version,
            "document": document or "",
            "mindmap": mindmap or "",
            "exercises": json.dumps(exercises or [], ensure_ascii=False),
            "code_cases": json.dumps(code_cases or [], ensure_ascii=False),
            "audio_text": audio_text or "",
            "debate_report": json.dumps(debate_report or {}, ensure_ascii=False),
            "status": status,
            "created_at": _now(),
            "updated_at": _now(),
        }, replace=True)
    finally:
        db.conn.close()


def get_resource(resource_id: str) -> Optional[dict]:
    """获取资源详情"""
    db = get_db()
    try:
        row = db["resource"].get(resource_id)
        if not row:
            return None
        return {
            "resource_id": row["resource_id"],
            "task_id": row["task_id"],
            "session_id": row["session_id"],
            "concept": row["concept"],
            "version": row["version"],
            "document": row["document"],
            "mindmap": row["mindmap"],
            "exercises": json.loads(row["exercises"]) if row["exercises"] else [],
            "code_cases": json.loads(row["code_cases"]) if row["code_cases"] else [],
            "audio_text": row["audio_text"],
            "debate_report": json.loads(row["debate_report"]) if row["debate_report"] else {},
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
    except Exception:
        return None
    finally:
        db.conn.close()


def find_resource_by_concept(session_id: str, concept: str, status: Optional[str] = None) -> Optional[dict]:
    """按知识点查找最新资源"""
    db = get_db()
    try:
        where = {"session_id": session_id, "concept": concept}
        if status:
            where["status"] = status
        rows = list(db["resource"].rows_where(
            " AND ".join(f"{k} = ?" for k in where),
            list(where.values())
        ))
        if not rows:
            return None
        latest = max(rows, key=lambda r: r["version"])
        return get_resource(latest["resource_id"])
    finally:
        db.conn.close()


def find_latest_resource_by_concept(concept: str) -> Optional[dict]:
    """跨会话按知识点查找最新资源（知识熔炉用）"""
    db = get_db()
    try:
        rows = list(db["resource"].rows_where("concept = ?", [concept]))
        if not rows:
            return None
        latest = max(rows, key=lambda r: r["version"])
        return get_resource(latest["resource_id"])
    finally:
        db.conn.close()


# =============================================================================
# 新增：资源版本演进（知识熔炉）
# =============================================================================

def create_resource_version(resource_id: str, concept: str, version: int,
                            change_reason: str, triggered_by: str,
                            content_snapshot: Dict[str, Any]):
    """记录资源版本演进"""
    db = get_db()
    try:
        db["resource_version"].insert({
            "resource_id": resource_id,
            "concept": concept,
            "version": version,
            "change_reason": change_reason,
            "triggered_by": triggered_by,
            "content_snapshot": json.dumps(content_snapshot, ensure_ascii=False),
            "created_at": _now(),
        })
    finally:
        db.conn.close()


def get_resource_versions(concept: str, limit: int = 10) -> List[dict]:
    """获取某知识点的资源版本演进历史"""
    db = get_db()
    try:
        rows = db["resource_version"].rows_where("concept = ?", [concept])
        return sorted([
            {
                "version_id": r["version_id"],
                "resource_id": r["resource_id"],
                "concept": r["concept"],
                "version": r["version"],
                "change_reason": r["change_reason"],
                "triggered_by": r["triggered_by"],
                "content_snapshot": json.loads(r["content_snapshot"]) if r["content_snapshot"] else {},
                "created_at": r["created_at"],
            }
            for r in rows
        ], key=lambda x: x["version"])[:limit]
    finally:
        db.conn.close()


# =============================================================================
# 新增：辩论记录
# =============================================================================

def create_debate_record(debate_id: str, concept: str, task_id: Optional[str] = None,
                         resource_id: Optional[str] = None, status: str = "PASSED",
                         rounds: Optional[List[Dict]] = None, final_votes: Optional[Dict[str, str]] = None,
                         summary: str = ""):
    """保存辩论议会记录"""
    db = get_db()
    try:
        db["debate_record"].insert({
            "debate_id": debate_id,
            "task_id": task_id or "",
            "resource_id": resource_id or "",
            "concept": concept,
            "status": status,
            "rounds": json.dumps(rounds or [], ensure_ascii=False),
            "final_votes": json.dumps(final_votes or {}, ensure_ascii=False),
            "summary": summary,
            "created_at": _now(),
        }, replace=True)
    finally:
        db.conn.close()


def get_debate_record(debate_id: str) -> Optional[dict]:
    """获取辩论记录详情"""
    db = get_db()
    try:
        row = db["debate_record"].get(debate_id)
        if not row:
            return None
        return {
            "debate_id": row["debate_id"],
            "task_id": row["task_id"],
            "resource_id": row["resource_id"],
            "concept": row["concept"],
            "status": row["status"],
            "rounds": json.loads(row["rounds"]) if row["rounds"] else [],
            "final_votes": json.loads(row["final_votes"]) if row["final_votes"] else {},
            "summary": row["summary"],
            "created_at": row["created_at"],
        }
    except Exception:
        return None
    finally:
        db.conn.close()


def list_debate_records(concept: Optional[str] = None, status: Optional[str] = None, limit: int = 50) -> List[dict]:
    """列出辩论记录"""
    db = get_db()
    try:
        where = {}
        if concept:
            where["concept"] = concept
        if status:
            where["status"] = status
        if where:
            rows = db["debate_record"].rows_where(
                " AND ".join(f"{k} = ?" for k in where),
                list(where.values())
            )
        else:
            rows = db["debate_record"].rows
        return [
            {
                "debate_id": r["debate_id"],
                "concept": r["concept"],
                "status": r["status"],
                "created_at": r["created_at"],
            }
            for r in rows
        ][:limit]
    finally:
        db.conn.close()


# =============================================================================
# 新增：代码提交
# =============================================================================

def create_code_submission(submission_id: str, session_id: str, concept: str, code: str,
                           output: str = "", passed: bool = False, error_type: str = "",
                           execution_time: float = 0.0, exercise_id: Optional[str] = None):
    """保存代码提交记录"""
    db = get_db()
    try:
        db["code_submission"].insert({
            "submission_id": submission_id,
            "session_id": session_id,
            "exercise_id": exercise_id or "",
            "concept": concept,
            "code": code,
            "output": output,
            "passed": passed,
            "error_type": error_type,
            "execution_time": execution_time,
            "created_at": _now(),
        }, replace=True)
    finally:
        db.conn.close()


def get_code_submission(submission_id: str) -> Optional[dict]:
    """获取代码提交详情"""
    db = get_db()
    try:
        row = db["code_submission"].get(submission_id)
        if not row:
            return None
        return dict(row)
    except Exception:
        return None
    finally:
        db.conn.close()


def list_code_submissions(session_id: str, concept: Optional[str] = None, limit: int = 100) -> List[dict]:
    """列出代码提交记录"""
    db = get_db()
    try:
        where = {"session_id": session_id}
        if concept:
            where["concept"] = concept
        rows = db["code_submission"].rows_where(
            " AND ".join(f"{k} = ?" for k in where),
            list(where.values())
        )
        return [dict(r) for r in rows][-limit:]
    finally:
        db.conn.close()


# =============================================================================
# 新增：掌握度（BKT）
# =============================================================================

def update_mastery_state(session_id: str, concept: str, p_known: float,
                         evidence_count: Optional[int] = None):
    """更新知识点掌握度"""
    db = get_db()
    try:
        table = db["mastery_state"]
        rows = list(table.rows_where("session_id = ? AND concept = ?", [session_id, concept]))
        if rows:
            row = rows[0]
            updates = {
                "p_known": p_known,
                "evidence_count": evidence_count if evidence_count is not None else row["evidence_count"] + 1,
                "last_updated": _now(),
            }
            table.update(row["id"], updates)
        else:
            table.insert({
                "session_id": session_id,
                "concept": concept,
                "p_known": p_known,
                "evidence_count": evidence_count or 1,
                "last_updated": _now(),
            })
    finally:
        db.conn.close()


def get_mastery_state(session_id: str, concept: Optional[str] = None) -> List[dict]:
    """获取掌握度状态"""
    db = get_db()
    try:
        if concept:
            rows = db["mastery_state"].rows_where("session_id = ? AND concept = ?", [session_id, concept])
        else:
            rows = db["mastery_state"].rows_where("session_id = ?", [session_id])
        return [dict(r) for r in rows]
    finally:
        db.conn.close()


def get_mastery_heatmap(session_id: str) -> Dict[str, float]:
    """获取掌握度热力图数据 {concept: p_known}"""
    states = get_mastery_state(session_id)
    return {s["concept"]: s["p_known"] for s in states}


# =============================================================================
# 新增：认知风格证据
# =============================================================================

def add_cognitive_evidence(session_id: str, dimension: str, evidence_type: str,
                           weight: float, description: str = "",
                           source_event_id: Optional[int] = None):
    """添加认知风格证据"""
    db = get_db()
    try:
        db["cognitive_profile_evidence"].insert({
            "session_id": session_id,
            "dimension": dimension,
            "evidence_type": evidence_type,
            "weight": weight,
            "description": description,
            "source_event_id": source_event_id,
            "created_at": _now(),
        })
    finally:
        db.conn.close()


def get_cognitive_evidence(session_id: str, dimension: Optional[str] = None) -> List[dict]:
    """获取认知风格证据"""
    db = get_db()
    try:
        if dimension:
            rows = db["cognitive_profile_evidence"].rows_where(
                "session_id = ? AND dimension = ?", [session_id, dimension]
            )
        else:
            rows = db["cognitive_profile_evidence"].rows_where("session_id = ?", [session_id])
        return [dict(r) for r in rows]
    finally:
        db.conn.close()


# =============================================================================
# 新增：资源反馈（知识熔炉数据来源）
# =============================================================================

def add_resource_feedback(session_id: str, resource_id: str, concept: str,
                          rating: Optional[int] = None, error_report: str = "",
                          confusion_marked: bool = False):
    """添加资源反馈"""
    db = get_db()
    try:
        db["resource_feedback"].insert({
            "session_id": session_id,
            "resource_id": resource_id,
            "concept": concept,
            "rating": rating,
            "error_report": error_report,
            "confusion_marked": confusion_marked,
            "created_at": _now(),
        })
    finally:
        db.conn.close()


def get_resource_feedback_stats(concept: str) -> Dict[str, Any]:
    """获取某知识点的资源反馈统计（知识熔炉用）"""
    db = get_db()
    try:
        rows = list(db["resource_feedback"].rows_where("concept = ?", [concept]))
        total = len(rows)
        confusion_count = sum(1 for r in rows if r["confusion_marked"])
        error_reports = [r["error_report"] for r in rows if r["error_report"]]
        avg_rating = None
        ratings = [r["rating"] for r in rows if r["rating"] is not None]
        if ratings:
            avg_rating = sum(ratings) / len(ratings)
        return {
            "concept": concept,
            "total_feedback": total,
            "confusion_count": confusion_count,
            "confusion_rate": confusion_count / total if total else 0.0,
            "average_rating": avg_rating,
            "error_reports": error_reports,
        }
    finally:
        db.conn.close()


# =============================================================================
# 新增：资源版本操作（知识熔炉）
# =============================================================================

def save_resource_version(resource_id: str, version: int, document: str, mindmap: str,
                          exercises: list, code_cases: list, change_reason: Optional[str] = None,
                          concept: Optional[str] = None, triggered_by: Optional[str] = None) -> int:
    """保存资源的新版本"""
    db = get_db()
    try:
        table = db["resource_version"]
        table.insert({
            "resource_id": resource_id,
            "concept": concept or "",
            "version": version,
            "change_reason": change_reason or "",
            "triggered_by": triggered_by or "",
            "content_snapshot": json.dumps({
                "document": document,
                "mindmap": mindmap,
                "exercises": exercises,
                "code_cases": code_cases,
            }, ensure_ascii=False),
            "created_at": _now(),
        })
        return table.last_pk
    finally:
        db.conn.close()


def get_resource_versions_by_id(resource_id: str) -> List[dict]:
    """获取某个资源 ID 的所有版本（按 resource_id 查询）"""
    db = get_db()
    try:
        rows = list(db["resource_version"].rows_where(
            "resource_id = ?", [resource_id], order_by="version ASC"
        ))
        result = []
        for r in rows:
            snapshot = json.loads(r["content_snapshot"]) if r["content_snapshot"] else {}
            result.append({
                "version_id": r["version_id"],
                "resource_id": r["resource_id"],
                "concept": r["concept"],
                "version": r["version"],
                "change_reason": r["change_reason"],
                "triggered_by": r["triggered_by"],
                "document": snapshot.get("document", ""),
                "mindmap": snapshot.get("mindmap", ""),
                "exercises": snapshot.get("exercises", []),
                "code_cases": snapshot.get("code_cases", []),
                "created_at": r["created_at"],
            })
        return result
    finally:
        db.conn.close()


# =============================================================================
# 新增：全局错误统计（知识熔炉用）
# =============================================================================

def get_global_error_stats(concept: Optional[str] = None) -> Dict[str, Any]:
    """获取全局提交错误率统计"""
    db = get_db()
    try:
        if concept:
            rows = list(db["code_submission"].rows_where(
                "concept = ? AND passed IS NOT NULL", [concept]
            ))
        else:
            rows = list(db["code_submission"].rows_where("passed IS NOT NULL"))

        total = len(rows)
        passed = sum(1 for r in rows if r["passed"])
        return {
            "total_submissions": total,
            "passed": passed,
            "failed": total - passed,
            "error_rate": (total - passed) / total if total > 0 else 0.0,
        }
    finally:
        db.conn.close()


# =============================================================================
# 新增：前端行为埋点 - cognitive_profile_evidence 快捷操作
# =============================================================================

def log_behavior_event(session_id: str, event_type: str, dimension: Optional[str] = None,
                       concept: Optional[str] = None, weight: float = 1.0,
                       description: Optional[str] = None):
    """记录前端行为事件到 learning_events 并自动生成认知风格证据

    前端只需调用 POST /{session_id}/behavior 接口，此函数负责：
    1. 记录原始事件到 learning_events
    2. 根据事件类型自动推断认知维度并写入 cognitive_profile_evidence
    """
    # 1. 记录原始事件
    log_event(session_id, event_type, {
        "concept": concept or "",
        "weight": weight,
        "description": description or "",
    }, concept=concept)

    # 2. 映射事件类型到认知维度
    dimension_map = {
        "mindmap_clicked": "cognitive_modality",
        "code_executed": "cognitive_modality",
        "hint_expanded": "cognitive_field",
        "page_stay": "learning_pace",
        "resource_switched": "cognitive_modality",
        "profile_viewed": "goal_orientation",
        "path_viewed": "goal_orientation",
        "audio_played": "cognitive_modality",
        "exercise_attempt": "cognitive_field",
    }
    dim = dimension or dimension_map.get(event_type)
    if dim:
        add_cognitive_evidence(
            session_id=session_id,
            dimension=dim,
            evidence_type=event_type,
            weight=weight,
            description=description or f"用户触发了 {event_type} 事件",
        )
