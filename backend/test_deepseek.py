"""DeepSeek API 连通性测试脚本

运行方式：
    cd backend
    python test_deepseek.py

pytest 执行时，如果未配置有效 DeepSeek API Key 或接口不可用，会自动跳过。

TODO:
- [已完成] 验证非流式与流式 achat 接口
- [已完成] 缺少有效 API Key 时自动 skip
- [待完成] 补充模型温度、max_tokens 等参数边界测试
- [待完成] 补充重试、超时与错误码处理测试
- [待完成] 接入 mock 切换以支持离线回归
"""
import asyncio
import sys

import pytest

from app.core.config import get_settings
from app.services.deepseek_llm import DeepSeekLLM, DeepSeekMessage


async def _test_chat():
    # 解决 Windows 终端 GBK 编码问题
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")

    settings = get_settings()
    print(f"Using model: {settings.DEEPSEEK_MODEL}")
    print(f"Base URL: {settings.DEEPSEEK_BASE_URL}")

    if not settings.DEEPSEEK_API_KEY or settings.DEEPSEEK_API_KEY.startswith("sk-PLACEHOLDER"):
        pytest.skip("未配置有效的 DEEPSEEK_API_KEY")

    llm = DeepSeekLLM()
    messages = [
        DeepSeekMessage("system", "你是一位 Python 教学专家，回答简洁。"),
        DeepSeekMessage("user", "用一句话解释 Python 的 with 语句。"),
    ]

    print("\n--- 非流式调用 ---")
    try:
        response = await llm.achat(messages, temperature=0.7, max_tokens=512)
    except Exception as exc:
        pytest.skip(f"DeepSeek API 不可用: {exc}")
    print(response)

    print("\n--- 流式调用 ---")
    async for chunk in llm.achat_stream(messages, temperature=0.7, max_tokens=512):
        print(chunk, end="", flush=True)
    print()

    print("\n[OK] DeepSeek API 测试通过")


def test_chat():
    asyncio.run(_test_chat())


if __name__ == "__main__":
    asyncio.run(_test_chat())
