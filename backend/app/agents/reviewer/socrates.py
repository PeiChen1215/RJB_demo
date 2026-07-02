"""苏格拉底式辅导模块（Reviewer 内部子能力）

对应需求/功能：
- 当学生遇到代码错误时，不直接给出答案，而是通过引导式提问帮助学生自主发现问题。
- 根据学生代码、错误信息、当前知识点和画像生成苏格拉底式问题。

主要类/函数：
- SocratesTutor.run(message)：统一入口，提取必要信息并返回提问结果。
- SocratesTutor.generate_question(...)：根据当前提问阶段生成引导性问题。
- _extract_json：解析 LLM 返回的 JSON。
- _fallback_question：LLM 解析失败时的模板化兜底问题。

TODO:
- [已完成] 5 阶段提问链（clarification → assumption_probe → evidence_check →
  counter_example → convergence）已实现
- [已完成] 根据提问深度控制 can_provide_answer 已实现
- [已完成] JSON 解析失败模板兜底已实现
- [待完成] 记录学生回答以推进下一轮提问深度
- [待完成] 结合画像调整提问风格与难度
"""
import json
import re
from typing import Any, Dict, Optional

from app.agents.base import AgentMessage, BaseAgent


class SocratesTutor(BaseAgent):
    """引导学生自主发现答案"""

    name = "Socrates"
    system_prompt = """你是苏格拉底，古希腊哲学家和教育家。
你的辅导风格是引导学生自主发现答案，而不是直接给出解答。
通过精心设计的提问链，帮助学生建构知识。

输出 JSON：
{
  "stage": "clarification | assumption_probe | evidence_check | counter_example | convergence",
  "question": "引导性问题",
  "hint": "可选提示",
  "can_provide_answer": true,
  "answer": "如果学生要求直接答案，给出简洁答案"
}
只输出 JSON。"""

    def run(self, message: AgentMessage) -> AgentMessage:
        """统一入口"""
        payload = message.payload
        concept = payload.get("concept") or message.context.get("target_concept", "当前知识点")
        error_message = payload.get("error_message", "")
        code = payload.get("code", "")
        previous_question = payload.get("previous_question", "")
        profile = message.context.get("profile", {})
        depth = message.metadata.get("socratic_depth", 0)

        result = self.generate_question(error_message, code, concept, profile, depth, previous_question)
        return message.reply(result, stage="tutor", from_agent=self.name)

    def generate_question(self, error_message: str, code: str, concept: str,
                          profile: Dict[str, Any], depth: int = 0,
                          previous_question: str = "") -> Dict[str, Any]:
        # 提问阶段随深度递进，最大到 convergence
        stages = [
            "clarification",
            "assumption_probe",
            "evidence_check",
            "counter_example",
            "convergence",
        ]
        stage = stages[min(depth, len(stages) - 1)]

        prompt = f"""学生当前知识点：{concept}
学生代码：
```python
{code}
```
错误信息：{error_message}
学生画像：{json.dumps(profile, ensure_ascii=False)}

当前提问阶段：{stage}
请输出一个引导性提问 JSON。"""

        raw = self.think(prompt)
        result = self._extract_json(raw)

        # 解析失败则使用模板兜底
        if not result:
            result = self._fallback_question(stage, concept, error_message)
        if previous_question and result.get("question") == previous_question:
            result = self._fallback_question(stage, concept, error_message)

        # 确保必要字段存在：阶段、是否允许直接给答案
        result.setdefault("stage", stage)
        if not result.get("hint"):
            result["hint"] = self._fallback_question(stage, concept, error_message).get("hint")
        result.setdefault("can_provide_answer", depth >= 3)
        result["raw"] = raw
        return result

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        return None

    def _fallback_question(self, stage: str, concept: str, error_message: str) -> Dict[str, Any]:
        templates = {
            "clarification": {
                "question": "这个错误提示你注意到了什么关键信息？",
                "hint": "仔细看报错中的类型和行号。",
            },
            "assumption_probe": {
                "question": f"你觉得{concept}的哪个特性可能导致这个错误？",
                "hint": f"回忆一下{concept}的基本规则。",
            },
            "evidence_check": {
                "question": "你能从代码中找到支持或反驳你判断的线索吗？",
                "hint": "逐行检查变量的值和类型。",
            },
            "counter_example": {
                "question": "如果换一个输入，你的代码还能正确运行吗？",
                "hint": "考虑边界情况。",
            },
            "convergence": {
                "question": "所以本质上，这个问题应该怎么解决？",
                "hint": "总结一下核心要点。",
                "answer": "请参考文档中的常见错误部分。",
            },
        }
        return dict(templates.get(stage, templates["clarification"]))
