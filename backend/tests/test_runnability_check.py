"""代码案例可运行性校验接口测试"""
import os

os.environ["LLM_PROVIDER"] = "mock"
os.environ["GRAPH_BACKEND"] = "memory"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_runnability_check_all_runnable():
    payload = {
        "code_cases": [
            {"title": "print", "code": "print('hello')"},
            {"title": "assign", "code": "x = 1 + 2\nprint(x)"},
        ]
    }
    r = client.post("/api/code/runnability-check", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    assert data["runnable_count"] == 2
    assert data["failed_count"] == 0
    for res in data["results"]:
        assert res["runnable"] is True


def test_runnability_check_with_failure():
    payload = {
        "code_cases": [
            {"title": "ok", "code": "print('ok')"},
            {"title": "bad", "code": "print(undefined_var)"},
        ]
    }
    r = client.post("/api/code/runnability-check", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    assert data["runnable_count"] == 1
    assert data["failed_count"] == 1
    statuses = {res["title"]: res["runnable"] for res in data["results"]}
    assert statuses["ok"] is True
    assert statuses["bad"] is False


def test_runnability_check_empty():
    r = client.post("/api/code/runnability-check", json={"code_cases": []})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["runnable_count"] == 0
