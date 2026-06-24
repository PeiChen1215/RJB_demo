"""Evaluator Agent 与学习事件链路测试

验证学习事件提交后，Evaluator Agent 能否正确统计并更新学生画像。

TODO:
- [已完成] 提交 exercise_submitted 与 code_executed 事件
- [已完成] 调用 /evaluate 并验证统计与更新后画像
- [待完成] 补充错误/无效事件 payload 的容错测试
- [待完成] 验证画像更新公式与边界条件
- [待完成] 补充多事件聚合与历史回溯测试
"""
import os

os.environ.setdefault("DEEPSEEK_API_KEY", os.getenv("DEEPSEEK_API_KEY", "sk-PLACEHOLDER"))
os.environ.setdefault("LLM_PROVIDER", "mock")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_evaluate_with_events():
    # 创建会话
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]

    # 提交练习事件
    r1 = client.post(
        f"/api/sessions/{sid}/events",
        json={
            "event_type": "exercise_submitted",
            "payload": {"concept": "文件操作", "is_correct": True, "answer": "open"},
        },
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["success"] is True

    # 提交代码运行事件
    r2 = client.post(
        f"/api/sessions/{sid}/events",
        json={
            "event_type": "code_executed",
            "payload": {"concept": "文件操作", "passed": True, "stdout": "ok"},
        },
    )
    assert r2.status_code == 200, r2.text

    # 调用评估
    r3 = client.post(f"/api/sessions/{sid}/evaluate")
    assert r3.status_code == 200, r3.text
    data = r3.json()
    assert data["success"] is True
    assert data["stats"]["exercises"] == 1
    assert data["stats"]["code_runs"] == 1
    assert "evaluation" in data
    assert "updated_profile" in data
    print("[OK] Evaluator 评估链路测试通过")


if __name__ == "__main__":
    test_evaluate_with_events()
