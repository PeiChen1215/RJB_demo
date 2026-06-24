"""测试资源生成 SSE 流式接口

运行方式：
    cd backend
    .\\venv\\Scripts\\python.exe test_sse.py

TODO:
- [已完成] 创建会话并订阅资源生成 SSE 流
- [已完成] 解析 progress/complete/error 三类事件
- [待完成] 验证事件顺序与字段完整性
- [待完成] 增加客户端断连后服务端处理测试
- [待完成] 补充并发订阅与压力测试
"""
import json
import os
import sys

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "deepseek"

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_sse():
    # 先创建会话
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    session_id = r.json()["session_id"]
    print(f"session_id: {session_id}")

    print("\n--- SSE 流式生成资源 ---")
    with client.stream(
        "GET",
        f"/api/resources/stream-generate?session_id={session_id}&concept=文件操作",
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line.startswith("data: "):
                continue
            data = json.loads(line[6:])
            event_type = data.get("type", "progress")

            if event_type == "progress":
                print(f"[{data.get('stage', '-')}] {data.get('message', '')}")
            elif event_type == "complete":
                print("\n[COMPLETE]")
                print(f"concept: {data.get('concept')}")
                print(f"debate_status: {data.get('debate_report', {}).get('status')}")
                print(f"package_keys: {list(data.get('package', {}).keys())}")
                print(f"validation: {data.get('validation')}")
            elif event_type == "error":
                print(f"[ERROR] {data.get('message')}")


if __name__ == "__main__":
    test_sse()
