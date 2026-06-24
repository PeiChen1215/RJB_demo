"""完整链路测试（DeepSeek + Memory Graph）

无需 Docker，使用内存图存储和真实 DeepSeek API，验证从会话创建到资源生成的完整流程。

运行方式：
    cd backend
    .\\venv\\Scripts\\python.exe test_full_chain.py

TODO:
- [已完成] 覆盖 health/graph/session/chat/generate-resource 全流程
- [已完成] 使用 DeepSeek + memory graph 组合运行
- [待完成] 增加资源包内容质量断言
- [待完成] 补充异常分支与超时处理验证
- [待完成] 将完整链路接入 CI 夜间回归
"""
import os
import sys
import time

import pytest

# 使用内存图（无需 Docker Neo4j）
os.environ["GRAPH_BACKEND"] = "memory"
# 使用已接入的 DeepSeek
os.environ["LLM_PROVIDER"] = "deepseek"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def session_id():
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    data = r.json()
    assert r.status_code == 200
    return data["session_id"]


def log_step(name: str):
    print(f"\n{'='*60}")
    print(f"[STEP] {name}")
    print("=" * 60)


def test_health():
    log_step("健康检查")
    r = client.get("/health")
    print(f"/health: {r.status_code} {r.json()}")
    assert r.status_code == 200


def test_graph():
    log_step("知识图谱（内存图）")
    r = client.get("/api/graph/")
    data = r.json()
    print(f"/api/graph/: {r.status_code}, {len(data.get('nodes', []))} nodes, {len(data.get('edges', []))} edges")
    assert r.status_code == 200
    assert len(data["nodes"]) > 0


def test_session():
    log_step("创建学习会话")
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    data = r.json()
    print(f"/api/sessions/: {r.status_code}")
    print(f"session_id: {data['session_id']}")
    print(f"target_concept: {data.get('target_concept')}")
    assert r.status_code == 200


def test_chat(session_id):
    log_step("对话：学生说'我想学习文件操作'")
    r = client.post(
        f"/api/sessions/{session_id}/chat",
        json={"message": "我想学习文件操作", "message_type": "text"},
    )
    data = r.json()
    print(f"/chat status: {r.status_code}")
    print(f"agent_name: {data.get('agent_name')}")
    print(f"response_type: {data.get('response_type')}")
    print(f"next_action: {data.get('content', {}).get('next_action')}")
    print(f"profile snippet: {data.get('content', {}).get('profile', {})}")
    assert r.status_code == 200


def test_generate_resource(session_id):
    log_step("资源生成：为'文件操作'生成个性化资源")
    start = time.time()
    r = client.post(f"/api/resources/generate-for-session/{session_id}?concept=文件操作")
    elapsed = time.time() - start
    data = r.json()
    print(f"/resources/generate status: {r.status_code}, elapsed: {elapsed:.2f}s")
    print(f"concept: {data.get('concept')}")
    print(f"debate_status: {data.get('debate_report', {}).get('status')}")
    print(f"debate rounds: {len(data.get('debate_report', {}).get('rounds', []))}")
    print(f"validation: {data.get('validation')}")
    print(f"package keys: {list(data.get('package', {}).keys())}")

    package = data.get("package", {})
    if "lecture" in package:
        lecture = package["lecture"]
        print(f"\n讲座文档长度: {len(lecture) if isinstance(lecture, str) else 'N/A'}")
        print("讲座前 300 字:")
        print(str(lecture)[:300] + "...")

    if "exercises" in package:
        exercises = package["exercises"]
        print(f"\n练习题数量: {len(exercises) if isinstance(exercises, list) else 'N/A'}")

    assert r.status_code == 200
    assert data.get("concept") == "文件操作"
    assert "package" in data
    assert "debate_report" in data


if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")

    try:
        test_health()
        test_graph()
        sid = test_session()
        test_chat(sid)
        test_generate_resource(sid)
        print("\n" + "=" * 60)
        print("[OK] 完整链路测试通过（DeepSeek + Memory Graph）")
        print("=" * 60)
    except Exception as e:
        print(f"\n[FAIL] 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
