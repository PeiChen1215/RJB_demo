"""苏格拉底辅导多轮与最终答案测试"""
import os

os.environ["LLM_PROVIDER"] = "mock"
os.environ["GRAPH_BACKEND"] = "memory"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_session(target_concept: str = "变量与赋值"):
    r = client.post("/api/sessions/", json={"target_concept": target_concept})
    assert r.status_code == 200
    return r.json()["session_id"]


def test_socratic_multi_round_and_answer_request():
    sid = _create_session()

    # 第一轮：以代码求助进入苏格拉底辅导
    r1 = client.post(
        f"/api/sessions/{sid}/chat",
        json={
            "message": "我代码报错了\n```python\nprint(x)\n```\n错误：NameError",
            "message_type": "text",
        },
    )
    assert r1.status_code == 200
    data1 = r1.json()
    assert data1["agent_name"] == "Socrates"
    assert "question" in data1["content"]

    # 第二轮：继续引导
    r2 = client.post(
        f"/api/sessions/{sid}/chat",
        json={"message": "继续引导", "message_type": "text"},
    )
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["agent_name"] == "Socrates"

    # 第三轮：直接要答案
    r3 = client.post(
        f"/api/sessions/{sid}/chat",
        json={"message": "直接告诉我答案", "message_type": "text"},
    )
    assert r3.status_code == 200
    data3 = r3.json()
    assert data3["agent_name"] == "Socrates"
    assert data3["content"].get("answer")
    # 给出答案后辅导深度应重置为 0，后续普通聊天不再进入辅导流
    r4 = client.post(
        f"/api/sessions/{sid}/chat",
        json={"message": "你好", "message_type": "text"},
    )
    assert r4.status_code == 200
    assert r4.json()["agent_name"] != "Socrates"
