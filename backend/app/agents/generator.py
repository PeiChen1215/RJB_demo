"""Generator Agent：多模态学习资源生成

对应需求/功能：
- 根据学生画像与知识图谱约束，生成个性化 Python 教学资源包。
- 资源类型包括：概念讲解文档（Markdown）、思维导图（Mermaid）、编程练习题、
  可运行代码案例、语音讲解文本。
- 由 BuilderAgent 演进而来，职责更清晰：只负责生成教学资源，不参与审核。

主要类/函数：
- GeneratorAgent.run(message)：统一入口，从 AgentMessage 中提取 concept 和 profile，
  返回包含 ResourcePackage 的 AgentMessage。
- GeneratorAgent.generate(concept, profile)：核心生成逻辑，调用 LLM 并解析 JSON。
- GeneratorAgent.revise(...)：根据 Reviewer/DebateCouncil 的反馈修订资源包。
- _build_prompt / _build_revision_prompt：构造生成/修订 Prompt。
- _extract_json / _fallback_parse：LLM 输出解析与兜底拆分。
- _generate_mindmap：基于前置依赖和关联知识点生成简单 Mermaid 图。
- BuilderAgent = GeneratorAgent：为兼容旧导入保留别名。

TODO:
- [已完成] 5 类教学资源生成已实现
- [已完成] JSON 解析失败兜底与 Mermaid 思维导图回退已实现
- [已完成] 根据反馈修订资源 revise() 已实现
- [待完成] 接入真正的 TTS 服务生成音频文件 URL
- [待完成] 接入代码执行器自动验证生成的代码案例可运行性
- [待完成] 使用 JSON Schema / function calling 强制结构化输出，减少解析失败
"""
import json
import re
from typing import Any, Dict, List, Optional

from app.agents.base import AgentMessage, BaseAgent
from app.models.schemas import ResourcePackage
from app.services.code_executor import CodeExecutor
from app.services.graph_factory import get_graph_store


class GeneratorAgent(BaseAgent):
    """根据画像和知识约束生成 5 种资源类型"""

    name = "Generator"
    system_prompt = """你是一位资深的 Python 教学资源设计师。
你的任务是根据学生的画像和知识图谱约束，生成高质量的教学资源。

输出格式必须是 JSON：
{
  "document": "Markdown 格式的概念讲解文档",
  "mindmap": "Mermaid 思维导图语法",
  "exercises": [
    {"question": "题目描述", "starter_code": "初始代码", "expected_output": "期望输出", "hints": ["提示1"], "solution": "参考答案"}
  ],
  "code_cases": [
    {"title": "案例标题", "code": "可运行代码", "explanation": "案例说明"}
  ],
  "audio_text": "用于语音讲解的文本"
}

注意：
1. 所有代码必须可在 Python 3.10+ 运行
2. 不要引入未授权的外部库
3. 练习题要有难度梯度
4. 代码中的反斜杠请使用原始字符串 r'...' 或正斜杠路径，避免转义导致语法错误
5. 只输出 JSON，不要 markdown 代码块外的内容"""

    def run(self, message: AgentMessage) -> AgentMessage:
        """统一入口：从 AgentMessage 中提取 concept 和 profile，生成资源"""
        # 优先从 payload 取 concept，其次从上下文中取目标知识点
        concept = message.payload.get("concept") or message.context.get("target_concept")
        profile = message.context.get("profile", {})
        if not concept:
            return message.reply({"error": "未指定知识点"}, stage="generator", from_agent=self.name)

        package = self.generate(concept, profile)
        return message.reply({"package": package.model_dump()}, stage="generator", from_agent=self.name)

    def generate(self, concept: str, profile: Dict[str, Any]) -> ResourcePackage:
        """生成资源包（保持与旧 BuilderAgent 兼容）"""
        graph = get_graph_store()
        concept_info = graph.get_concept(concept) or {}

        prompt = self._build_prompt(concept, concept_info, profile)
        raw = self.think(prompt)

        # 尝试从 LLM 输出中解析 JSON；失败则使用兜底拆分
        parsed = self._extract_json(raw)
        if not parsed:
            parsed = self._fallback_parse(concept, raw)

        # 用解析结果构造 ResourcePackage，缺失字段提供合理默认值
        exercises = self._normalize_exercises(parsed.get("exercises", []), concept)
        package = ResourcePackage(
            concept=concept,
            document=parsed.get("document", raw),
            mindmap=parsed.get("mindmap", self._generate_mindmap(concept, concept_info)),
            exercises=exercises,
            code_cases=parsed.get("code_cases", []),
            audio_text=parsed.get(
                "audio_text",
                f"欢迎来到智学蜂巢。本节我们学习「{concept}」。{concept_info.get('description', '')}",
            ),
        )

        return package

    def revise(self, concept: str, profile: Dict[str, Any],
               current_package: Dict[str, Any], feedback: str) -> ResourcePackage:
        """根据反馈修订资源包"""
        prompt = self._build_revision_prompt(concept, profile, current_package, feedback)
        raw = self.think(prompt)

        parsed = self._extract_json(raw)
        if not parsed:
            parsed = self._fallback_parse(concept, raw)

        return ResourcePackage(
            concept=concept,
            document=parsed.get("document", current_package.get("document", raw)),
            mindmap=parsed.get("mindmap", current_package.get("mindmap", "")),
            exercises=parsed.get("exercises", current_package.get("exercises", [])),
            code_cases=parsed.get("code_cases", current_package.get("code_cases", [])),
            audio_text=parsed.get("audio_text", current_package.get("audio_text", "")),
        )

    def _build_prompt(self, concept: str, concept_info: dict, profile: Dict[str, Any]) -> str:
        prerequisites = concept_info.get("prerequisites", [])
        pitfalls = concept_info.get("pitfalls", [])
        difficulty = concept_info.get("difficulty", 3)
        student_level = profile.get("knowledge_level", 2.0)

        scaffolding = (
            "请提供更多代码示例和逐步解释，确保基础薄弱的学生也能理解。"
            if student_level < difficulty - 1
            else "可以适当增加挑战性的内容和拓展知识。"
        )

        return f"""请为知识点「{concept}」生成一份 Python 教学资源。

【知识约束 - 必须遵守】
- 前置知识：学生已掌握 {', '.join(prerequisites) if prerequisites else 'Python基础'}
- 难度等级：{difficulty}/5
- 预计学习时长：{concept_info.get('estimated_time', 30)} 分钟
- 常见易错点：{', '.join([p.get('description', '') for p in pitfalls]) if pitfalls else '无'}

【学生画像 - 个性化调整】
- 知识水平：{student_level}/5
- 认知风格：{profile.get('cognitive_field', 'dependent')} · {profile.get('cognitive_modality', 'visual')}
- 学习节奏：{profile.get('learning_pace', 'normal')}
- 目标导向：{profile.get('goal_orientation', 'application')}
{scaffolding}

【输出要求】
1. 概念讲解（Markdown 格式，含 2-3 个代码示例）
2. 思维导图（Mermaid 语法）
3. 3 道渐进式编程练习题，每题必须给出明确的 expected_output（通过运行 solution 代码能得到的确切输出）
4. 1-2 个可运行代码实操案例
5. 常见错误警示
6. 语音讲解文本（200 字以内）

所有代码必须可在 Python 3.10+ 中运行，不要引入未授权的外部库。
代码中若涉及 Windows 路径或反斜杠，请使用原始字符串 r'...' 或正斜杠，避免转义错误。"""

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """从 LLM 输出中提取 JSON：先直接解析，再尝试 markdown 代码块，最后匹配任意 {}"""
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

    def _fallback_parse(self, concept: str, raw: str) -> Dict[str, Any]:
        """JSON 解析失败时，按规则拆分内容"""
        # 兜底：提取所有 Python 代码块，前两个作为案例，其余作为练习题
        code_blocks = re.findall(r"```python\s*(.*?)\s*```", raw, re.DOTALL)

        exercises = []
        code_cases = []
        for i, code in enumerate(code_blocks):
            if i < 2:
                code_cases.append({
                    "title": f"代码案例 {i + 1}",
                    "code": code.strip(),
                    "explanation": "",
                })
            else:
                exercises.append({
                    "question": f"练习 {i - 1}",
                    "starter_code": f"# TODO: 完成「{concept}」练习 {i - 1}\n",
                    "expected_output": "",
                    "hints": [],
                    "solution": code.strip(),
                })

        return {
            "document": raw,
            "exercises": exercises,
            "code_cases": code_cases,
        }

    def _normalize_exercises(self, exercises: List[Dict[str, Any]], concept: str) -> List[Dict[str, Any]]:
        """补齐练习题字段，缺失 expected_output 时尝试执行 solution 推导。"""
        normalized = []
        executor = CodeExecutor(timeout=5.0)
        for ex in exercises:
            question = ex.get("question") or f"练习：{concept}"
            starter = ex.get("starter_code") or ""
            solution = ex.get("solution") or ""
            hints = ex.get("hints") or []
            expected = (ex.get("expected_output") or "").strip()
            if not expected:
                code_to_run = solution.strip() or starter.strip()
                if code_to_run:
                    try:
                        result = executor.execute(code_to_run)
                        if result.get("success") and result.get("stdout") is not None:
                            expected = result["stdout"].strip()
                    except Exception:
                        expected = ""
            normalized.append({
                "question": question,
                "starter_code": starter,
                "expected_output": expected,
                "hints": hints if isinstance(hints, list) else [hints] if hints else [],
                "solution": solution,
            })
        return normalized

    def _generate_mindmap(self, concept: str, concept_info: dict) -> str:
        """基于前置依赖和关联知识点生成简单 Mermaid 思维导图"""
        prerequisites = concept_info.get("prerequisites", [])
        related = concept_info.get("related", [])
        lines = ["graph TD"]
        if prerequisites:
            for p in prerequisites:
                lines.append(f"    {p} --> {concept}")
        if related:
            for r in related:
                lines.append(f"    {concept} --> {r}")
        if len(lines) == 1:
            lines.append(f"    {concept}")
        return "\n".join(lines)

    def _build_revision_prompt(
        self,
        concept: str,
        profile: Dict[str, Any],
        current_package: Dict[str, Any],
        feedback: str,
    ) -> str:
        return f"""请根据辩论议会的反馈，修订以下 Python 教学资源。

知识点：{concept}
学生画像：{json.dumps(profile, ensure_ascii=False)}

当前资源：
{json.dumps(current_package, ensure_ascii=False, indent=2)}

修订意见：
{feedback}

请输出修订后的完整资源，格式与生成时一致（JSON）。"""


# 为兼容旧导入保留别名
BuilderAgent = GeneratorAgent
