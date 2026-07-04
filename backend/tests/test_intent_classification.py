# -*- coding: utf-8 -*-
"""意图分类单元测试

验证 Orchestrator._classify_intent 对常见学生消息的识别，
LLM 不可用时允许回退到关键词匹配。
"""
import os

os.environ["LLM_PROVIDER"] = "mock"

from app.agents.orchestrator import AgentOrchestrator


def test_classify_code_help():
    orch = AgentOrchestrator()
    assert orch._classify_intent("我代码报错了") == "CODE_HELP"
    assert orch._classify_intent("运行不了，报错 NameError") == "CODE_HELP"


def test_classify_knowledge_request():
    orch = AgentOrchestrator()
    assert orch._classify_intent("什么是变量与赋值") == "KNOWLEDGE_REQUEST"
    assert orch._classify_intent("讲一下 for 循环") == "KNOWLEDGE_REQUEST"


def test_classify_progress_check():
    orch = AgentOrchestrator()
    assert orch._classify_intent("我学得怎么样了") == "PROGRESS_CHECK"
    assert orch._classify_intent("测试一下我的掌握度") == "PROGRESS_CHECK"


def test_classify_path_adjust():
    orch = AgentOrchestrator()
    assert orch._classify_intent("不想学这个了") == "PATH_ADJUST"
    assert orch._classify_intent("跳过这个知识点") == "PATH_ADJUST"


def test_classify_chat_fallback():
    orch = AgentOrchestrator()
    assert orch._classify_intent("你好") == "CHAT"
    assert orch._classify_intent("ok") == "CHAT"
