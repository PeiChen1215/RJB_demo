"""Neo4j 知识图谱服务

对应需求：
- 在生产环境中使用 Neo4j 持久化存储知识点、依赖关系与易错点。
- 提供与 MemoryGraph 一致的接口，供上层业务无感知调用。

主要类/函数/接口：
- Neo4jClient：GraphStore 的 Neo4j 实现。
  - __init__ / close：驱动创建与关闭。
  - init_schema：创建唯一约束（Concept.name、Pitfall.id）。
  - clear_all / run_cypher：数据清空与自定义查询（谨慎使用）。
  - get_concept / get_all_concepts / get_prerequisites：知识点查询。
  - get_learning_path：基于 shortestPath 计算学习路径。
  - check_forbidden_concepts：检测内容中是否包含超纲概念。
- get_neo4j_client：全局单例工厂。

TODO:
- [已完成] Neo4j 驱动封装与 GraphStore 接口实现。
- [已完成] 知识点、前置依赖、后续知识与易错点查询。
- [已完成] 基于 A* 的最优学习路径计算与超纲概念检测。
- [待完成] 在 Docker Compose 中确保 Neo4j 服务启动并导入种子数据。
- [待完成] 支持图嵌入计算与向量索引。
- [待完成] 增加 Neo4j 查询性能优化与连接池配置。
"""
from typing import List, Optional

from neo4j import GraphDatabase

from app.core.config import get_settings
from app.services.graph_store import GraphStore
from app.services.path_planner import astar_learning_path


class Neo4jClient(GraphStore):
    """Neo4j 客户端封装"""

    def __init__(self):
        settings = get_settings()
        self.driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )

    def close(self):
        self.driver.close()

    def init_schema(self):
        """初始化约束和索引"""
        with self.driver.session() as session:
            session.run(
                "CREATE CONSTRAINT concept_name IF NOT EXISTS FOR (c:Concept) REQUIRE c.name IS UNIQUE"
            )
            session.run(
                "CREATE CONSTRAINT pitfall_id IF NOT EXISTS FOR (p:Pitfall) REQUIRE p.id IS UNIQUE"
            )

    def clear_all(self):
        """清空所有数据（谨慎使用）"""
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

    def run_cypher(self, cypher: str, params: Optional[dict] = None):
        with self.driver.session() as session:
            return session.run(cypher, params or {})

    def get_concept(self, name: str) -> Optional[dict]:
        """获取知识点详情"""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (c:Concept {name: $name})
                OPTIONAL MATCH (c)-[:PREREQUISITE_OF]->(next:Concept)
                OPTIONAL MATCH (pre:Concept)-[:PREREQUISITE_OF]->(c)
                OPTIONAL MATCH (c)-[:HAS_PITFALL]->(p:Pitfall)
                RETURN c,
                       collect(DISTINCT next.name) as next_concepts,
                       collect(DISTINCT pre.name) as prerequisites,
                       collect(DISTINCT p) as pitfalls
                """,
                {"name": name},
            ).single()

            if not result:
                return None

            concept = dict(result["c"])
            concept["next_concepts"] = result["next_concepts"]
            concept["prerequisites"] = result["prerequisites"]
            concept["pitfalls"] = [dict(p) for p in result["pitfalls"]]
            return concept

    def get_prerequisites(self, name: str) -> List[str]:
        """获取某知识点的直接前置依赖"""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (pre:Concept)-[:PREREQUISITE_OF]->(c:Concept {name: $name})
                RETURN collect(pre.name) as prerequisites
                """,
                {"name": name},
            ).single()
            return result["prerequisites"] if result else []

    def get_all_concepts(self) -> List[dict]:
        """获取所有知识点"""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (c:Concept)
                OPTIONAL MATCH (c)-[:PREREQUISITE_OF]->(next:Concept)
                RETURN c.name as name,
                       c.module as module,
                       c.difficulty as difficulty,
                       c.description as description,
                       collect(next.name) as next_concepts
                """
            )
            return [dict(record) for record in result]

    def get_dependency_edges(self) -> List[dict]:
        """获取 Neo4j 中所有 PREREQUISITE_OF 边，附带 strength"""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (src:Concept)-[r:PREREQUISITE_OF]->(tgt:Concept)
                RETURN src.name AS source, tgt.name AS target,
                       coalesce(r.strength, 0.8) AS strength
                """
            )
            return [dict(record) for record in result]

    def get_learning_path(self, from_concepts: List[str], to_concept: str) -> List[str]:
        """基于 A* 算法计算最优学习路径"""
        edges = self.get_dependency_edges()
        difficulties = {}
        for c in self.get_all_concepts():
            name = c.get("name")
            if name:
                difficulties[name] = c.get("difficulty", 3)
        return astar_learning_path(edges, difficulties, from_concepts, to_concept)

    # 基础通用概念白名单，教学中顺带提及不应视为超纲
    _BASIC_WHITELIST = {
        "变量", "赋值", "数据类型", "字符串", "数字", "整数", "浮点数",
        "布尔值", "列表", "元组", "字典", "集合", "条件语句",
        "循环", "for", "while", "函数", "参数", "返回值", "模块",
        "导入", "异常", "错误", "输入输出", "注释",
    }

    def check_forbidden_concepts(
        self, content: str, target_concept: str
    ) -> List[str]:
        """检查内容中是否包含超纲概念

        策略：只允许提及当前知识点及其前置知识；
        如果内容中出现了当前知识点的后续知识（即学生还没学过的），则视为超纲。
        基础通用概念（如列表、字符串）会被过滤，避免误报。
        """
        allowed = set(self.get_prerequisites(target_concept))
        allowed.add(target_concept)

        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (c:Concept {name: $name})-[:PREREQUISITE_OF]->(next:Concept)
                RETURN collect(next.name) as next_concepts
                """,
                {"name": target_concept},
            ).single()
            future_concepts = set(result["next_concepts"] if result else [])

        forbidden = []
        for concept in future_concepts:
            if concept in self._BASIC_WHITELIST:
                continue
            if concept not in allowed and concept in content:
                forbidden.append(concept)
        return forbidden


# 全局单例
_neo4j_client: Optional[Neo4jClient] = None


def get_neo4j_client() -> Neo4jClient:
    global _neo4j_client
    if _neo4j_client is None:
        _neo4j_client = Neo4jClient()
    return _neo4j_client
