"""端到端主链路集成测试

覆盖：会话创建 → 对话 → 资源生成 → 多次错误判题触发知识熔炉 → 行为埋点 → 掌握度热力图。
该测试不依赖真实 LLM，使用 memory 图存储与 mock LLM 提供商。

TODO:
- [已完成] 主链路各接口串联验证
- [已完成] 错误率阈值触发知识熔炉断言
- [待完成] 增加 SSE 流式生成链路断言
- [待完成] 增加 10 次连续运行稳定性脚本
"""
import os

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "mock"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


CONCEPT = "变量与赋值"


def test_main_chain():
    """跑通一条完整的端到端学习链路"""
    # 1. 创建会话
    r = client.post("/api/sessions/", json={"target_concept": CONCEPT})
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    # 2. 学生发起学习意图
    r = client.post(
        f"/api/sessions/{session_id}/chat",
        json={"message": f"我想学习{CONCEPT}", "message_type": "text"},
    )
    assert r.status_code == 200
    chat_data = r.json()
    assert chat_data.get("agent_name") is not None

    # 3. 生成资源
    r = client.post(f"/api/resources/generate-for-session/{session_id}?concept={CONCEPT}")
    assert r.status_code == 200
    resource_data = r.json()
    assert resource_data["concept"] == CONCEPT
    assert "package" in resource_data
    assert "debate_report" in resource_data

    # 4. 连续提交错误代码，使错误率达到知识熔炉触发阈值
    for i in range(5):
        r = client.post(
            "/api/code/judge",
            json={
                "code": "print(1)",
                "expected_output": "42",
                "session_id": session_id,
                "concept": CONCEPT,
            },
        )
        assert r.status_code == 200
        judge_data = r.json()
        assert judge_data["passed"] is False
        if i == 4:
            assert judge_data.get("knowledge_furnace_triggered") is True

    # 5. 行为埋点
    r = client.post(
        f"/api/sessions/{session_id}/behavior",
        json={
            "event_type": "hint_expanded",
            "session_id": session_id,
            "concept": CONCEPT,
            "payload": {},
        },
    )
    assert r.status_code == 200

    # 6. 掌握度热力图
    r = client.get(f"/api/evaluation/heatmap?session_id={session_id}")
    assert r.status_code == 200
    heatmap_data = r.json()
    assert "data" in heatmap_data
    assert "summary" in heatmap_data


if __name__ == "__main__":
    test_main_chain()
    print("\n[OK] 主链路集成测试通过")
