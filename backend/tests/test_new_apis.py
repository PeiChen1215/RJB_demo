# -*- coding: utf-8 -*-
"""高/中优先级新增接口冒烟测试"""
import os

os.environ["LLM_PROVIDER"] = "mock"
os.environ["GRAPH_BACKEND"] = "memory"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _register_user():
    import uuid
    username = f"user_{uuid.uuid4().hex[:8]}"
    r = client.post("/api/auth/register", json={"username": username, "password": "123456"})
    assert r.status_code == 200
    return r.json()["access_token"], username


def test_auth_refresh_and_logout():
    token, _ = _register_user()

    # refresh
    r = client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    new_token = r.json()["access_token"]

    # logout
    r = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {new_token}"})
    assert r.status_code == 200

    # logout 后再用该 token 刷新应失败
    r = client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {new_token}"})
    assert r.status_code == 401


def test_learning_plan():
    r = client.post("/api/sessions/", json={"target_concept": "变量与赋值"})
    sid = r.json()["session_id"]
    r = client.get(f"/api/learning-plan/{sid}")
    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == sid
    assert data["target_concept"] == "变量与赋值"
    assert "plan" in data
    assert data["total_minutes"] >= 0


def test_admin_stats():
    r = client.get("/api/admin/stats")
    assert r.status_code == 200
    stats = r.json()["stats"]
    assert "sessions" in stats
    assert "code_pass_rate" in stats


def test_resource_feedback_and_stats():
    r = client.post("/api/sessions/", json={"target_concept": "变量与赋值"})
    sid = r.json()["session_id"]

    r = client.post(
        "/api/resources/feedback",
        json={
            "session_id": sid,
            "resource_id": "res-001",
            "concept": "变量与赋值",
            "rating": 4,
            "error_report": "",
            "confusion_marked": False,
        },
    )
    assert r.status_code == 200
    assert r.json()["success"] is True

    r = client.get("/api/resources/feedback/stats?concept=变量与赋值")
    assert r.status_code == 200
    data = r.json()
    assert data["total_feedback"] >= 1
    assert data["average_rating"] == 4.0
