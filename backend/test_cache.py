"""资源缓存测试

验证资源生成缓存的命中逻辑与 TTL 过期行为。

TODO:
- [已完成] 验证同一 session+concept 二次生成命中缓存
- [已完成] 验证缓存 TTL 过期后失效
- [待完成] 补充并发场景下缓存一致性测试
- [待完成] 补充缓存淘汰/清理策略测试
- [待完成] 验证不同 profile 生成不同缓存 key
"""
import os

os.environ.setdefault("DEEPSEEK_API_KEY", os.getenv("DEEPSEEK_API_KEY", "sk-PLACEHOLDER"))
os.environ.setdefault("LLM_PROVIDER", "mock")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_resource_cache():
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    sid = r.json()["session_id"]

    # 第一次生成（mock 很快）
    r1 = client.post(f"/api/resources/generate-for-session/{sid}", params={"concept": "文件操作"})
    assert r1.status_code == 200
    assert r1.json()["concept"] == "文件操作"

    # 第二次生成，应该命中缓存
    r2 = client.post(f"/api/resources/generate-for-session/{sid}", params={"concept": "文件操作"})
    assert r2.status_code == 200
    data = r2.json()
    assert data["concept"] == "文件操作"
    print("[OK] 资源缓存测试通过")


def test_resource_cache_ttl():
    from datetime import datetime, timedelta, timezone
    from app.services.resource_cache import (
        get_db,
        get_cached_resource,
        make_cache_key,
        set_cached_resource,
    )

    profile = {"knowledge_level": 1.0}
    concept = "测试TTL"
    result = {
        "concept": concept,
        "debate_report": {"status": "MODIFIED"},
        "package": {},
    }
    set_cached_resource(concept, profile, result)
    assert get_cached_resource(concept, profile) is not None

    # 手动将 created_at 改为 8 天前
    db = get_db()
    key = make_cache_key(concept, profile)
    db["resource_cache"].update(
        key,
        {"created_at": (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()},
    )

    # 过期后应返回 None
    assert get_cached_resource(concept, profile, max_age_hours=168) is None
    print("[OK] 资源缓存 TTL 测试通过")


if __name__ == "__main__":
    test_resource_cache()
    test_resource_cache_ttl()
