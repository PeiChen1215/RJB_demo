"""测试 chat SSE 流式接口

验证会话聊天 SSE 流式返回事件能够正常连接、解析与输出。

TODO:
- [已完成] 创建会话并通过 SSE 发送消息
- [已完成] 解析流式 data: 事件并打印
- [待完成] 验证流式事件类型与字段完整性
- [待完成] 增加流式中断/超时异常测试
- [待完成] 补充多轮对话上下文一致性测试
"""
import json
import os
import sys

import pytest

if not os.environ.get("DEEPSEEK_API_KEY"):
    pytest.skip("DEEPSEEK_API_KEY not configured", allow_module_level=True)

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "deepseek"

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_stream():
    r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
    session_id = r.json()["session_id"]
    print(f"session_id: {session_id}")

    print("\n--- SSE chat stream ---")
    with client.stream(
        "GET",
        f"/api/sessions/{session_id}/chat-stream?message={encode('我想学习文件操作')}&message_type=text",
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line.startswith("data: "):
                continue
            data = json.loads(line[6:])
            print(data)


def encode(s: str) -> str:
    import urllib.parse
    return urllib.parse.quote(s)


if __name__ == "__main__":
    test_chat_stream()
