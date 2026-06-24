"""资源生成结果持久化缓存

对应需求：
- 避免对同一知识点/相似画像重复调用 LLM，降低调用成本与响应延迟。
- 保证进程重启后缓存不丢失，提升系统启动后的首次响应速度。

主要类/函数/接口：
- _ensure_table：懒加载创建 resource_cache 表与索引。
- make_cache_key：基于知识点与画像关键字段生成稳定缓存 key。
- get_cached_resource：读取缓存并执行 TTL 过期清理。
- set_cached_resource：仅对辩论通过（PASSED/MODIFIED）的结果写入缓存。
- clear_cache / get_cache_stats：缓存清空与统计。

实现说明：
- 使用与会话相同的 SQLite 数据库，新增 `resource_cache` 表。
- key = 知识点 + 画像关键字段哈希。
- 仅缓存辩论状态为 PASSED/MODIFIED 的资源。

TODO:
- [已完成] 基于知识点与画像关键字段的缓存 key 生成。
- [已完成] 缓存读写、TTL 过期清理与统计接口。
- [已完成] 仅缓存辩论通过/修改后的资源，避免缓存低质量结果。
- [待完成] 增加更细粒度的 TTL/过期策略（按知识点热度、版本号变化失效）。
- [待完成] 未来可迁移到 Redis，以支持分布式部署与更高并发。
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.services.database import get_db


def _db():
    return get_db()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_table():
    db = _db()
    if "resource_cache" not in db.table_names():
        db["resource_cache"].create(
            {
                "cache_key": str,
                "concept": str,
                "profile_hash": str,
                "result": str,  # JSON
                "status": str,
                "created_at": str,
            },
            pk="cache_key",
        )
        db["resource_cache"].create_index(["concept"], if_not_exists=True)


def make_cache_key(concept: str, profile: Dict[str, Any]) -> str:
    """生成缓存 key"""
    profile_key = json.dumps(
        {
            "knowledge_level": profile.get("knowledge_level", 1.0),
            "cognitive_field": profile.get("cognitive_field", "dependent"),
            "cognitive_modality": profile.get("cognitive_modality", "visual"),
            "learning_pace": profile.get("learning_pace", "normal"),
            "goal_orientation": profile.get("goal_orientation", "application"),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    profile_hash = hashlib.md5(profile_key.encode()).hexdigest()[:12]
    return f"{concept}:{profile_hash}"


def get_cached_resource(
    concept: str,
    profile: Dict[str, Any],
    max_age_hours: int = 168,  # 默认 7 天
) -> Optional[Dict[str, Any]]:
    """获取缓存的资源生成结果

    若缓存超过 max_age_hours 小时，则视为过期并删除。
    """
    _ensure_table()
    db = _db()
    key = make_cache_key(concept, profile)
    try:
        row = db["resource_cache"].get(key)
    except Exception:
        return None
    if not row:
        return None

    # TTL 检查
    try:
        created = datetime.fromisoformat(row["created_at"])
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - created > timedelta(hours=max_age_hours):
            db["resource_cache"].delete(key)
            return None
    except Exception:
        pass

    try:
        return json.loads(row["result"])
    except json.JSONDecodeError:
        return None


def set_cached_resource(concept: str, profile: Dict[str, Any], result: Dict[str, Any]):
    """设置资源缓存"""
    _ensure_table()
    status = result.get("debate_report", {}).get("status")
    if status not in ("PASSED", "MODIFIED"):
        return

    db = _db()
    db["resource_cache"].upsert(
        {
            "cache_key": make_cache_key(concept, profile),
            "concept": concept,
            "profile_hash": make_cache_key(concept, profile).split(":", 1)[1],
            "result": json.dumps(result, ensure_ascii=False),
            "status": status,
            "created_at": _now(),
        },
        ["cache_key"],
    )


def clear_cache(concept: Optional[str] = None):
    """清空缓存，可指定知识点"""
    _ensure_table()
    db = _db()
    if concept:
        db["resource_cache"].delete_where("concept = ?", [concept])
    else:
        db["resource_cache"].delete_where("1=1")


def get_cache_stats(concept: Optional[str] = None) -> Dict[str, int]:
    """获取缓存统计"""
    _ensure_table()
    db = _db()
    table = db["resource_cache"]
    if concept:
        total = len(list(table.rows_where("concept = ?", [concept])))
    else:
        total = len(list(table.rows))
    return {"total": total}
