"""辩论议会诊断脚本：打印每个 Agent 的原始回复

用于本地调试辩论议会各审核视角的原始输出，帮助定位 prompt 与解析问题。

TODO:
- [已完成] 调用 GeneratorAgent 生成资源包
- [已完成] 分别打印 Expert/Teacher/Student/Guardian 原始回复
- [已完成] 输出 DebateCouncil 汇总投票与轮次
- [待完成] 支持命令行参数指定 concept 与 profile
- [待完成] 将诊断结果导出为结构化 JSON/日志文件
- [待完成] 增加 prompt 版本对比与 token 消耗统计
"""
import os
import sys

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "deepseek"

from app.agents.generator import GeneratorAgent
from app.agents.reviewer.debate_council import (
    DebateCouncil,
    ExpertReviewer,
    GuardianReviewer,
    StudentReviewer,
    TeacherReviewer,
)
from app.services.graph_factory import get_graph_store
from app.services.neuro_symbolic import NeuroSymbolicValidator

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")


def main():
    concept = "文件操作"
    profile = {
        "knowledge_level": 2.0,
        "cognitive_field": "dependent",
        "cognitive_modality": "visual",
        "learning_pace": "normal",
        "goal_orientation": "application",
    }

    print("=" * 70)
    print("[1/3] Generator 生成资源")
    print("=" * 70)
    generator = GeneratorAgent()
    package = generator.generate(concept, profile)
    print(f"概念: {package.concept}")
    print(f"文档长度: {len(package.document)}")
    print(f"文档前 500 字:\n{package.document[:500]}...")
    print()

    graph = get_graph_store()
    concept_info = graph.get_concept(concept) or {}
    validator = NeuroSymbolicValidator()
    constraints = validator.get_concept_constraints(concept)
    forbidden = constraints.get("forbidden_concepts", [])

    print("=" * 70)
    print("[2/3] 各审核视角独立输出（打印原始回复）")
    print("=" * 70)

    expert = ExpertReviewer()
    teacher = TeacherReviewer()
    student = StudentReviewer()
    guardian = GuardianReviewer()

    agents = [
        ("Expert", expert, lambda a: a.review(package, concept_info)),
        ("Teacher", teacher, lambda a: a.review(package, concept_info)),
        ("Student-Sim", student, lambda a: a.review(package, concept_info)),
        ("Guardian", guardian, lambda a: a.review(package, concept_info, forbidden)),
    ]

    for name, agent, review_fn in agents:
        print(f"\n--- {name} 原始回复 ---")
        result = review_fn(agent)
        print(result.get("raw", "N/A"))
        print(f"解析结果: {result.get('verdict')}")

    print("\n" + "=" * 70)
    print("[3/3] 辩论议会汇总")
    print("=" * 70)
    council = DebateCouncil()
    report = council.debate(package, concept_info, forbidden)
    print(f"最终状态: {report.status}")
    print(f"投票: {report.final_votes}")
    print(f"轮数: {len(report.rounds)}")
    for r in report.rounds:
        print(f"  Round {r.round} {r.agent}: {r.verdict}")


if __name__ == "__main__":
    main()
