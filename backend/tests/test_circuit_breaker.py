"""Agent 超时熔断与降级测试

验证 Orchestrator 对单个 Agent 调用具备 10 秒超时控制，
以及失败/超时达到阈值后进入熔断状态。

TODO:
- [已完成] 超时返回降级响应
- [已完成] 连续失败触发熔断
- [已完成] 成功后熔断器关闭
"""
import os
import time

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "mock"

import pytest

from app.agents.base import AgentMessage
from app.agents.orchestrator import _CircuitBreaker, AgentOrchestrator


class FakeAgent:
    """测试用伪 Agent"""

    name = "FakeAgent"

    def __init__(self, behavior="ok"):
        self.behavior = behavior

    def run(self, msg: AgentMessage) -> AgentMessage:
        if self.behavior == "ok":
            return msg.reply({"result": "ok"}, stage=msg.stage, from_agent=self.name)
        if self.behavior == "sleep":
            time.sleep(20)
            return msg.reply({"result": "never"}, stage=msg.stage, from_agent=self.name)
        raise RuntimeError("boom")


def test_circuit_opens_after_three_failures():
    breaker = _CircuitBreaker()
    assert breaker.is_open("FakeAgent") is False

    breaker.record_failure("FakeAgent")
    breaker.record_failure("FakeAgent")
    breaker.record_failure("FakeAgent")

    assert breaker.is_open("FakeAgent") is True


def test_circuit_closes_after_success():
    breaker = _CircuitBreaker()
    breaker.record_failure("FakeAgent")
    breaker.record_failure("FakeAgent")
    breaker.record_failure("FakeAgent")
    assert breaker.is_open("FakeAgent") is True

    breaker.record_success("FakeAgent")
    assert breaker.is_open("FakeAgent") is False


def test_safe_run_returns_timeout_fallback():
    orch = AgentOrchestrator()
    agent = FakeAgent(behavior="sleep")
    msg = AgentMessage(
        intent="KNOWLEDGE_REQUEST",
        stage="test",
        payload={},
        context={},
        from_agent="user",
    )
    start = time.time()
    result = orch._safe_run(agent, msg, timeout=1.0)
    elapsed = time.time() - start

    assert result.payload.get("fallback") is True
    assert result.payload.get("reason") == "timeout"
    assert elapsed < 3.0  # 必须远小于 Agent 的 20 秒睡眠


def test_safe_run_records_failure_and_opens_circuit():
    orch = AgentOrchestrator()
    agent = FakeAgent(behavior="raise")
    msg = AgentMessage(
        intent="KNOWLEDGE_REQUEST",
        stage="test",
        payload={},
        context={},
        from_agent="user",
    )

    for _ in range(3):
        result = orch._safe_run(agent, msg)
        assert result.payload.get("fallback") is True
        assert result.payload.get("reason") == "exception"

    # 第四次应直接熔断，不再执行 Agent
    result = orch._safe_run(agent, msg)
    assert result.payload.get("fallback") is True
    assert result.payload.get("reason") == "circuit_open"


if __name__ == "__main__":
    test_circuit_opens_after_three_failures()
    test_circuit_closes_after_success()
    test_safe_run_returns_timeout_fallback()
    test_safe_run_records_failure_and_opens_circuit()
    print("\n[OK] 熔断器测试通过")
