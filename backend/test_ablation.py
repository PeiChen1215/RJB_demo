"""消融实验：对比不同 LLM 和图存储配置下的系统表现

配置组合：
- LLM: mock / deepseek
- Graph: memory（neo4j 需 Docker，本机未安装，跳过）

指标：
- 响应时间
- 资源包完整性（document/mindmap/exercises/code_cases/audio_text）
- 辩论议会结果
- 神经符号校验结果

运行方式：
    cd backend
    .\\venv\\Scripts\\python.exe test_ablation.py

TODO:
- [已完成] 对比 mock 与 deepseek 两种 LLM provider
- [已完成] 收集 health/chat/generate/debate/validation 多维指标
- [已完成] 输出表格化消融结果并保存 JSON 报告
- [待完成] 增加 Neo4j 图存储配置的消融对比
- [待完成] 引入统计显著性分析与多次采样平均
- [待完成] 将消融结果可视化并生成图表
"""
import os
import sqlite3
import sys
import time
from typing import Any, Dict

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# 必须在导入 app 前设置环境变量
os.environ["GRAPH_BACKEND"] = "memory"


def _clear_resource_cache():
    """消融实验前清空资源缓存，避免旧校验结果干扰当前代码版本评估"""
    db_path = os.path.join(os.path.dirname(__file__), "eduhive.db")
    if not os.path.exists(db_path):
        return
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("DELETE FROM resource_cache")
        conn.commit()
        conn.close()
    except Exception:
        pass

from fastapi.testclient import TestClient


class AblationRunner:
    def __init__(self, llm_provider: str):
        self.llm_provider = llm_provider
        # 每个配置独立一个进程内子模块，避免单例污染
        os.environ["LLM_PROVIDER"] = llm_provider

        # 清空资源缓存，确保每次消融都走完整生成与校验流程
        _clear_resource_cache()

        # 清空单例缓存
        from app.services.graph_factory import GRAPH_STORE_INSTANCE
        import app.services.graph_factory as gf

        gf.GRAPH_STORE_INSTANCE = None

        from app.main import app

        self.client = TestClient(app)

    def run(self) -> Dict[str, Any]:
        print(f"\n{'='*70}")
        print(f"[CONFIG] LLM={self.llm_provider}, Graph=memory")
        print("=" * 70)

        result = {
            "llm_provider": self.llm_provider,
            "graph_backend": "memory",
            "health_ok": False,
            "graph_nodes": 0,
            "graph_edges": 0,
            "chat_ok": False,
            "generate_elapsed": 0.0,
            "generate_ok": False,
            "debate_status": None,
            "debate_rounds": 0,
            "package_keys": [],
            "validation": {},
            "error": None,
        }

        try:
            # health
            r = self.client.get("/health")
            result["health_ok"] = r.status_code == 200
            print(f"health: {r.status_code}")

            # graph
            r = self.client.get("/api/graph/")
            if r.status_code == 200:
                data = r.json()
                result["graph_nodes"] = len(data.get("nodes", []))
                result["graph_edges"] = len(data.get("edges", []))
            print(f"graph: {r.status_code}, {result['graph_nodes']} nodes, {result['graph_edges']} edges")

            # session
            r = self.client.post("/api/sessions/", json={"target_concept": "文件操作"})
            if r.status_code != 200:
                raise RuntimeError(f"创建会话失败: {r.status_code}")
            session_id = r.json()["session_id"]
            print(f"session: {session_id}")

            # chat
            r = self.client.post(
                f"/api/sessions/{session_id}/chat",
                json={"message": "我想学习文件操作", "message_type": "text"},
            )
            result["chat_ok"] = r.status_code == 200
            print(f"chat: {r.status_code}, agent={r.json().get('agent_name')}")

            # generate resource
            start = time.time()
            r = self.client.post(f"/api/resources/generate-for-session/{session_id}?concept=文件操作")
            result["generate_elapsed"] = time.time() - start

            if r.status_code != 200:
                raise RuntimeError(f"生成资源失败: {r.status_code} {r.text}")

            data = r.json()
            result["generate_ok"] = True
            result["debate_status"] = data.get("debate_report", {}).get("status")
            result["debate_rounds"] = len(data.get("debate_report", {}).get("rounds", []))
            result["package_keys"] = list(data.get("package", {}).keys())
            result["validation"] = data.get("validation", {})

            print(f"generate: {r.status_code}, elapsed={result['generate_elapsed']:.2f}s")
            print(f"debate_status: {result['debate_status']}, rounds={result['debate_rounds']}")
            print(f"package_keys: {result['package_keys']}")
            print(f"validation: {result['validation']}")

        except Exception as e:
            result["error"] = str(e)
            print(f"[ERROR] {e}")

        return result


def print_summary(results: list):
    print("\n" + "=" * 70)
    print("[ABLATION SUMMARY]")
    print("=" * 70)
    print(f"{'LLM':<12}{'Health':<10}{'Chat':<10}{'Generate':<12}{'Debate':<12}{'Package Keys'}")
    print("-" * 70)
    for r in results:
        print(
            f"{r['llm_provider']:<12}"
            f"{'OK' if r['health_ok'] else 'FAIL':<10}"
            f"{'OK' if r['chat_ok'] else 'FAIL':<10}"
            f"{r['generate_elapsed']:.2f}s{'':<5}"
            f"{r['debate_status'] or 'N/A':<12}"
            f"{', '.join(r['package_keys']) or 'N/A'}"
        )


if __name__ == "__main__":
    configs = ["mock", "deepseek"]
    results = []

    for cfg in configs:
        runner = AblationRunner(cfg)
        results.append(runner.run())

    print_summary(results)

    # 保存报告
    import json

    report_path = os.path.join(os.path.dirname(__file__), "ablation_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n报告已保存: {report_path}")
