"""LLM 提供层

对应需求/功能：
- 为所有 Agent 提供统一的大模型调用抽象，屏蔽底层不同 LLM 提供商的差异。
- 支持 DeepSeek、讯飞星火真实 API 调用，以及本地 MockLLM 用于无 API 时的开发与测试。
- 通过环境变量 LLM_PROVIDER 或配置项切换 provider，默认 auto 按优先级选择。

主要类/函数：
- BaseLLM：LLM 抽象基类，定义 chat / achat / achat_stream 接口。
- DeepSeekLLMProvider：DeepSeek（OpenAI 兼容协议）实现，支持同步、异步与流式。
- SparkLLMProvider：讯飞星火实现，当前仅支持同步调用。
- MockLLMProvider：本地模拟 LLM，根据 system prompt 关键词返回结构化占位内容。
- get_llm_provider()：工厂函数，按环境变量/配置自动选择 LLM 实现。

TODO:
- [已完成] DeepSeek 同步/异步/流式调用已实现
- [已完成] 讯飞星火同步调用已实现
- [已完成] MockLLM 按任务类型返回占位内容已实现
- [已完成] auto 模式按 DeepSeek → 讯飞星火 → Mock 的优先级选择已实现
- [待完成] 接入讯飞星火 4.5 Max / Spark Pro 双模型策略
- [待完成] 实现真正的流式 chunk 返回（当前 Spark/Mock 为一次性返回）
- [待完成] 添加 LLM 调用日志、重试、降级机制
- [待完成] 接入讯飞 iFlyCode 辅助代码生成
- [待完成] 使用 function calling / JSON Schema 强制结构化输出
"""
import os
from abc import ABC, abstractmethod
from typing import AsyncIterator, List

from app.core.config import get_settings
from app.services.deepseek_llm import DeepSeekLLM, DeepSeekMessage
from app.services.spark_llm import SparkLLM, SparkMessage


class BaseLLM(ABC):
    """LLM 抽象"""

    @abstractmethod
    def chat(self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
        ...

    async def achat(
        self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096
    ) -> str:
        return self.chat(messages, temperature, max_tokens)

    async def achat_stream(
        self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096
    ) -> AsyncIterator[str]:
        """默认流式：当前为兼容实现，一次性返回全部内容

        TODO: [待完成] 实现真正的流式 chunk 返回
        """
        content = self.chat(messages, temperature, max_tokens)
        yield content


class DeepSeekLLMProvider(BaseLLM):
    """DeepSeek 实现（OpenAI 兼容协议）"""

    def __init__(self):
        self.llm = DeepSeekLLM()

    def chat(self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
        deepseek_messages = [DeepSeekMessage(m["role"], m["content"]) for m in messages]
        return self.llm.chat(deepseek_messages, temperature, max_tokens)

    async def achat(
        self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096
    ) -> str:
        deepseek_messages = [DeepSeekMessage(m["role"], m["content"]) for m in messages]
        return await self.llm.achat(deepseek_messages, temperature, max_tokens)

    async def achat_stream(
        self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096
    ) -> AsyncIterator[str]:
        deepseek_messages = [DeepSeekMessage(m["role"], m["content"]) for m in messages]
        async for chunk in self.llm.achat_stream(deepseek_messages, temperature, max_tokens):
            yield chunk


class SparkLLMProvider(BaseLLM):
    """讯飞星火实现"""

    def __init__(self):
        self.llm = SparkLLM()

    def chat(self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
        spark_messages = [SparkMessage(m["role"], m["content"]) for m in messages]
        return self.llm.chat(spark_messages, temperature, max_tokens)


class MockLLMProvider(BaseLLM):
    """Mock LLM：根据 prompt 关键词返回结构化占位内容

    TODO: [待完成] Mock 返回应更接近真实 LLM 输出格式，便于前端联调
    """

    def __init__(self):
        self.call_count = 0

    def chat(self, messages: List[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
        self.call_count += 1
        prompt = messages[-1]["content"] if messages else ""

        # 从 prompt 中尝试提取当前知识点，用于生成占位内容
        concept = "Python 知识点"
        for line in prompt.split("\n"):
            if "知识点" in line and "「" in line and "」" in line:
                concept = line.split("「")[1].split("」")[0]
                break

        # 根据 system prompt 判断任务类型，返回对应占位数据
        system = messages[0]["content"].lower() if messages else ""

        # 辩论/审核视角的 system prompt 更具体，优先判断
        if "技术专家" in system:
            return self._expert_review(concept, prompt)
        if "教育学专家" in system or "教学法" in system:
            return self._teacher_review(concept, prompt)
        if "初学者" in system or "学生模拟" in system or "可理解性" in system:
            return self._student_review(concept, prompt)
        if "内容安全官" in system or "guardian" in system:
            return self._guardian_review(concept, prompt)
        # 核心教学 Agent
        if "路径规划" in system or "教学序列" in system:
            return self._path_planning(concept, prompt)
        if "教育心理学" in system or "心理学专家" in system:
            return self._profile_inference(prompt)
        if "资源设计师" in system:
            return self._resource_generation(concept, prompt)
        if "苏格拉底" in system or "socrates" in system:
            return self._socratic_guidance(concept, prompt)
        if "学习数据分析" in system or "评估" in system:
            return self._evaluation(concept, prompt)

        return f"这是对「{concept}」的通用回复。当前为 Mock 模式，未识别具体任务类型。"

    def _resource_generation(self, concept: str, prompt: str) -> str:
        return f"""# {concept}

## 概念讲解

{concept}是 Python 学习中的重要基础。下面通过代码示例来理解：

```python
# 示例 1：基础用法
print("Hello, {concept}!")
```

```python
# 示例 2：常见场景
x = 10
print(f"x = {{x}}")
```

```python
# 示例 3：综合练习
def demo():
    return "{concept} 示例"

print(demo())
```

## 常见错误

- 拼写错误
- 缩进错误
- 混淆相似概念

## 实操案例

```python
# 请补全以下代码
def practice():
    # 你的代码
    pass

practice()
```

## 练习题

1. 请写出 {concept} 的最基本用法。
2. 如何避免 {concept} 中的常见错误？
3. 请结合实际场景编写一段代码。
"""

    def _profile_inference(self, prompt: str) -> str:
        return """{
  "knowledge_level": 2.0,
  "cognitive_field": "dependent",
  "cognitive_modality": "visual",
  "learning_pace": "normal",
  "goal_orientation": "application",
  "error_patterns": ["syntax"],
  "mastered_concepts": ["Python简介", "变量与赋值"],
  " inferred_from": "mock"
}"""

    def _path_planning(self, concept: str, prompt: str) -> str:
        return f"""{{
  "path": ["Python简介", "变量与赋值", "基本数据类型", "{concept}"],
  "estimated_minutes": 60,
  "reason": "按前置依赖顺序学习"
}}"""

    def _expert_review(self, concept: str, prompt: str) -> str:
        return "PASS\n技术审查：代码语法正确，示例可在 Python 3.10+ 运行，无已知的版本兼容性问题。"

    def _teacher_review(self, concept: str, prompt: str) -> str:
        return "PASS\n教学审查：概念引入顺序合理，示例由浅入深，适合目标学生水平。"

    def _student_review(self, concept: str, prompt: str) -> str:
        return "WARN\n可理解性审查：整体可读，但建议为第三个示例增加一行注释说明关键步骤。"

    def _guardian_review(self, concept: str, prompt: str) -> str:
        return "PASS\n安全审查：未发现敏感内容、幻觉信息或超纲知识点。"

    def _socratic_guidance(self, concept: str, prompt: str) -> str:
        return f"""{{
  "stage": "clarification",
  "question": "你觉得这个错误和{concept}的哪个特性有关？",
  "hint": "仔细看看报错信息中提到的行号和类型。",
  "can_provide_answer": true
}}"""

    def _evaluation(self, concept: str, prompt: str) -> str:
        return """{
  "mastery_delta": {"变量与赋值": 0.15},
  "weak_points": ["基本数据类型"],
  "summary": "本次练习表现良好，建议巩固基础类型转换。"
}"""


def get_llm_provider() -> BaseLLM:
    """获取 LLM 提供者

    优先级：
    1. 环境变量 LLM_PROVIDER 显式指定
    2. auto 模式：优先 DeepSeek，其次讯飞星火，最后 Mock
    """
    settings = get_settings()
    provider = os.environ.get("LLM_PROVIDER", settings.LLM_PROVIDER or "auto").strip().lower()

    # 显式指定 provider
    if provider == "deepseek":
        return DeepSeekLLMProvider()
    if provider == "spark":
        return SparkLLMProvider()
    if provider == "mock":
        return MockLLMProvider()

    # auto 模式：按 API Key 可用性自动选择
    if provider == "auto":
        if settings.DEEPSEEK_API_KEY:
            return DeepSeekLLMProvider()
        if all([settings.SPARK_APP_ID, settings.SPARK_API_KEY, settings.SPARK_API_SECRET]):
            return SparkLLMProvider()
        return MockLLMProvider()

    raise ValueError(f"未知的 LLM 提供者: {provider}")
