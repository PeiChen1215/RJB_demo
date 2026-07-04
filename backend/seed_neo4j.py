"""Neo4j 知识图谱种子数据导入脚本

TODO:
- [待完成] 在 Docker Compose 启动时自动运行该脚本
- [待完成] 增加导入幂等性，避免重复创建
- [待完成] 支持从多个 Cypher 文件批量导入
"""
import os

from app.core.config import get_settings
from app.services.neo4j_client import Neo4jClient


def _split_cypher_statements(content: str) -> list:
    """按顶层分号分割 Cypher 语句，忽略字符串/括号/注释内部的分号。"""
    # 先移除行级注释 // ...
    lines = []
    for line in content.splitlines():
        # 注意不破坏字符串里的 //，这里简单处理：只在非字符串位置截断
        in_string = False
        string_char = None
        cleaned = []
        for ch in line:
            if in_string:
                cleaned.append(ch)
                if ch == string_char:
                    in_string = False
            else:
                if ch in ('"', "'"):
                    in_string = True
                    string_char = ch
                    cleaned.append(ch)
                elif ch == "/" and len(cleaned) > 0 and cleaned[-1] == "/":
                    cleaned.pop()
                    break
                else:
                    cleaned.append(ch)
        lines.append("".join(cleaned))

    text = "\n".join(lines)
    statements = []
    current = []
    in_string = False
    string_char = None
    depth = 0
    for ch in text:
        if in_string:
            current.append(ch)
            if ch == string_char:
                in_string = False
        else:
            if ch in ('"', "'"):
                in_string = True
                string_char = ch
                current.append(ch)
            elif ch == "(":
                depth += 1
                current.append(ch)
            elif ch == ")":
                depth -= 1
                current.append(ch)
            elif ch == "[":
                depth += 1
                current.append(ch)
            elif ch == "]":
                depth -= 1
                current.append(ch)
            elif ch == ";" and depth == 0:
                stmt = "".join(current).strip()
                if stmt:
                    statements.append(stmt)
                current = []
            else:
                current.append(ch)
    if current:
        stmt = "".join(current).strip()
        if stmt:
            statements.append(stmt)
    return statements


def seed_from_cypher(file_path: str):
    """从 Cypher 文件导入数据"""
    client = Neo4jClient()

    # 初始化 schema
    client.init_schema()

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    statements = _split_cypher_statements(content)

    with client.driver.session() as session:
        for statement in statements:
            try:
                session.run(statement)
            except Exception as e:
                print(f"执行语句失败: {statement[:80]}...\n错误: {e}")

    print("知识图谱种子数据导入完成")

    # 统计
    with client.driver.session() as session:
        result = session.run("MATCH (c:Concept) RETURN count(c) as count").single()
        print(f"知识点节点数: {result['count']}")


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cypher_file = os.path.join(base_dir, "data", "knowledge_graph.cypher")
    seed_from_cypher(cypher_file)
