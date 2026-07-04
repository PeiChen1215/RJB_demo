"""Neo4j 数据备份脚本

将当前 Neo4j 中的所有节点、关系导出为 JSON 文件，便于验证前备份。
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# 让脚本能导入 backend/app 下的模块
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.services.neo4j_client import Neo4jClient  # noqa: E402


def backup_neo4j(output_dir: str = "backups") -> str:
    settings = get_settings()
    client = Neo4jClient()

    # 导出节点
    with client.driver.session() as session:
        nodes = [
            {
                "labels": list(record["labels"]),
                "internal_id": record["id"],
                "properties": dict(record["props"]),
            }
            for record in session.run(
                "MATCH (n) RETURN labels(n) AS labels, id(n) AS id, properties(n) AS props"
            )
        ]

    # 导出关系
    with client.driver.session() as session:
        rels = [
            {
                "type": record["type"],
                "start_id": record["start_id"],
                "end_id": record["end_id"],
                "properties": dict(record["props"]),
            }
            for record in session.run(
                """
                MATCH ()-[r]->()
                RETURN type(r) AS type,
                       id(startNode(r)) AS start_id,
                       id(endNode(r)) AS end_id,
                       properties(r) AS props
                """
            )
        ]

    client.close()

    backup = {
        "uri": settings.NEO4J_URI,
        "user": settings.NEO4J_USER,
        "exported_at": datetime.now().isoformat(),
        "node_count": len(nodes),
        "relationship_count": len(rels),
        "nodes": nodes,
        "relationships": rels,
    }

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    filename = out_path / f"neo4j_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)

    print(f"备份完成: {filename}")
    print(f"  节点数: {len(nodes)}")
    print(f"  关系数: {len(rels)}")
    return str(filename)


if __name__ == "__main__":
    backup_neo4j()
