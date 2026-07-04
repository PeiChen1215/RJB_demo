r"""30 分钟稳定性测试脚本

在本地模拟连续使用场景，循环调用核心接口，记录失败次数与响应时间。
运行方式：
    cd backend
    ..\venv\Scripts\python.exe ..\scripts\stability_test.py
"""
import os
import random
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

os.environ["LLM_PROVIDER"] = "mock"
os.environ["GRAPH_BACKEND"] = "memory"

# 脚本位于 scripts/，需要切换到 backend/ 目录以便正确导入 app 和定位 SQLite
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = (SCRIPT_DIR.parent / "backend").resolve()
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CONCEPTS = ["变量与赋值", "基本数据类型", "for循环", "函数定义", "文件操作"]


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _create_session() -> str:
    r = client.post(
        "/api/sessions/",
        json={"target_concept": random.choice(CONCEPTS)},
    )
    r.raise_for_status()
    return r.json()["session_id"]


def _generate_resource(session_id: str, concept: str) -> None:
    r = client.post(
        "/api/resources/generate",
        json={"concept": concept, "session_id": session_id},
    )
    r.raise_for_status()


def _chat(session_id: str) -> None:
    r = client.post(
        f"/api/sessions/{session_id}/chat",
        json={"message": f"什么是{random.choice(CONCEPTS)}", "message_type": "text"},
    )
    r.raise_for_status()


def _judge() -> None:
    r = client.post(
        "/api/code/judge",
        json={
            "code": "print(2)",
            "expected_output": "2",
            "concept": random.choice(CONCEPTS),
        },
    )
    r.raise_for_status()


def _health() -> None:
    r = client.get("/health")
    r.raise_for_status()


SCENARIOS = [
    ("health", _health),
    ("create_session", _create_session),
    ("generate_resource", _generate_resource),
    ("chat", _chat),
    ("judge", _judge),
]


def run(duration_minutes: int = 30) -> dict:
    end_at = datetime.now() + timedelta(minutes=duration_minutes)
    total = 0
    failures = 0
    scenario_counts = {name: {"total": 0, "failures": 0} for name, _ in SCENARIOS}
    session_id = None
    session_created_at = 0

    print(f"[{_now()}] 启动 {duration_minutes} 分钟稳定性测试...")
    while datetime.now() < end_at:
        name, fn = random.choice(SCENARIOS)
        total += 1
        scenario_counts[name]["total"] += 1
        started = time.perf_counter()
        try:
            if name == "create_session":
                session_id = fn()
                session_created_at = time.perf_counter()
            elif name in ("generate_resource", "chat"):
                if session_id is None or time.perf_counter() - session_created_at > 60:
                    session_id = _create_session()
                    session_created_at = time.perf_counter()
                if name == "generate_resource":
                    fn(session_id, random.choice(CONCEPTS))
                else:
                    fn(session_id)
            else:
                fn()
            elapsed_ms = (time.perf_counter() - started) * 1000
            if total % 10 == 0:
                remaining = (end_at - datetime.now()).total_seconds()
                print(
                    f"[{_now()}] 已执行 {total} 次，最近 [{name}] {elapsed_ms:.1f}ms，"
                    f"失败 {failures} 次，剩余 {remaining / 60:.1f} 分钟"
                )
        except Exception as e:
            failures += 1
            scenario_counts[name]["failures"] += 1
            print(f"[{_now()}] ❌ [{name}] 失败: {e}")

    result = {
        "duration_minutes": duration_minutes,
        "total_requests": total,
        "failures": failures,
        "success_rate": round((total - failures) / total, 4) if total else 0.0,
        "scenario_breakdown": scenario_counts,
    }
    return result


def main() -> int:
    duration = int(os.environ.get("STABILITY_DURATION_MINUTES", "30"))
    result = run(duration)
    print(f"\n[{_now()}] 稳定性测试结束")
    print(f"总请求数: {result['total_requests']}")
    print(f"失败数: {result['failures']}")
    print(f"成功率: {result['success_rate']:.2%}")
    print("各接口详情:")
    for name, stats in result["scenario_breakdown"].items():
        print(f"  {name}: {stats['total']} 次, 失败 {stats['failures']} 次")
    return 0 if result["failures"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
