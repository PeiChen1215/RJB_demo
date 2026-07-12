"""知识图谱存储工厂

对应需求：
- 根据运行环境（开发/测试/生产）自动选择合适的知识图谱后端。
- 统一提供 GraphStore 单例，供业务模块无感知切换 Neo4j 或内存实现。

主要类/函数/接口：
- GRAPH_STORE_INSTANCE：全局单例缓存。
- get_graph_store：工厂函数，按 GRAPH_BACKEND 环境变量选择后端。
  - neo4j：直接实例化 Neo4jClient。
  - memory：直接实例化 MemoryGraph。
  - auto：先尝试连接 Neo4j，失败后回退到内存图，便于本地开发。

TODO:
- [已完成] 基于环境变量自动选择 Neo4j / 内存图后端。
- [已完成] auto 模式下的 Neo4j 探测与内存图回退。
- [待完成] 生产环境默认使用 Neo4j，确保 Docker Compose 中 Neo4j 服务正常启动（需 Docker Desktop 运行中）。
- [待完成] 增加图存储健康检查与自动重连。
- [待完成] 支持同时写 Neo4j 和内存图（用于测试对比与数据校验）。
"""
import os
from typing import Optional

from app.core.config import get_settings
from app.services.graph_store import GraphStore
from app.services.memory_graph import MemoryGraph


GRAPH_STORE_INSTANCE: Optional[GraphStore] = None


def get_graph_store() -> GraphStore:
    """获取图存储实例（单例）"""
    global GRAPH_STORE_INSTANCE
    if GRAPH_STORE_INSTANCE is not None:
        return GRAPH_STORE_INSTANCE

    settings = get_settings()
    backend = os.environ.get("GRAPH_BACKEND", "auto").lower()

    # 显式配置为 neo4j 时尝试连接
    if backend == "neo4j":
        from app.services.neo4j_client import Neo4jClient

        GRAPH_STORE_INSTANCE = Neo4jClient()
        return GRAPH_STORE_INSTANCE

    # 显式配置为 memory 时直接使用内存图
    if backend == "memory":
        GRAPH_STORE_INSTANCE = MemoryGraph()
        return GRAPH_STORE_INSTANCE

    # auto 模式：先尝试 Neo4j，失败则回退到内存图，保证本地无 Docker 也能启动
    if backend == "auto":
        try:
            from app.services.neo4j_client import Neo4jClient

            client = Neo4jClient()
            # 通过简单查询验证连接可用，避免拿到不可用的驱动
            with client.driver.session() as session:
                session.run("RETURN 1")
            GRAPH_STORE_INSTANCE = client
            return GRAPH_STORE_INSTANCE
        except Exception:
            GRAPH_STORE_INSTANCE = MemoryGraph()
            return GRAPH_STORE_INSTANCE

    raise ValueError(f"未知的图存储后端: {backend}")
