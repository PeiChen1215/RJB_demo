"""快速验证后端 API

通过 FastAPI TestClient 对核心接口做冒烟测试，覆盖健康检查、知识图谱、
会话、对话与资源生成等关键路径。

TODO:
- [已完成] 验证 /health、/api/graph/、/api/sessions/、/chat、/resources/generate-for-session
- [已完成] 使用 memory 图存储与 mock LLM 保证测试稳定
- [待完成] 补充异常路径与参数校验用例
- [待完成] 增加资源包内容结构与字段断言
- [待完成] 接入 pytest fixture 实现数据库隔离
"""
import os

import pytest

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "mock"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def session_id():
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    data = r.json()
    assert r.status_code == 200
    return data["session_id"]


def test_health():
    r = client.get("/health")
    print("/health:", r.status_code, r.json())
    assert r.status_code == 200


def test_graph():
    r = client.get("/api/graph/")
    data = r.json()
    print("/api/graph/:", r.status_code, len(data.get("nodes", [])), "nodes")
    assert r.status_code == 200
    assert len(data["nodes"]) > 0


def test_session():
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    data = r.json()
    print("/api/sessions/:", r.status_code, data["session_id"])
    assert r.status_code == 200


def test_chat(session_id):
    r = client.post(
        f"/api/sessions/{session_id}/chat",
        json={"message": "我想学习文件操作", "message_type": "text"},
    )
    data = r.json()
    print("/chat agent:", data.get("agent_name"))
    print("/chat type:", data.get("response_type"))
    print("/chat next_action:", data.get("content", {}).get("next_action"))
    assert r.status_code == 200


def test_generate_resource(session_id):
    r = client.post(f"/api/resources/generate-for-session/{session_id}?concept=文件操作")
    data = r.json()
    print("/resources/generate status:", r.status_code)
    print("concept:", data.get("concept"))
    print("debate_status:", data.get("debate_report", {}).get("status"))
    print("debate rounds:", len(data.get("debate_report", {}).get("rounds", [])))
    print("validation:", data.get("validation"))
    print("package keys:", list(data.get("package", {}).keys()))
    assert r.status_code == 200
    assert data.get("concept") == "文件操作"
    assert "package" in data
    assert "debate_report" in data


if __name__ == "__main__":
    test_health()
    test_graph()
    sid = test_session()
    test_chat(sid)
    test_generate_resource(sid)
    print("\n[OK] 所有接口验证通过")
