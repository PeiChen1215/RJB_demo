"""FastAPI 应用入口

对应需求：
- 初始化智学蜂巢后端应用，注册路由、中间件、CORS 与生命周期管理。
- 在启动时完成图存储、内存缓存与数据库的初始化。

主要类/函数/接口：
- lifespan：应用生命周期上下文管理器。
  - 启动：初始化图存储（单例）、内存会话缓存、触发 SQLite 建表。
  - 关闭：释放图存储连接。
- app：FastAPI 实例，配置标题/描述/版本/lifespan。
- 路由注册：/api/auth、/api/sessions、/api/resources、/api/graph、/api/code。
- health_check / health_detail：健康检查端点（基础与详细统计）。

TODO:
- [已完成] 接入真实 LLM API（当前默认 DeepSeek，保留讯飞 Spark 作为备选）。
- [已完成] 使用 SQLite 持久化会话与画像。
- [已完成] 注册请求日志中间件与 CORS。
- [已完成] 基础 /health 与 /health/detail 端点。
- [待完成] 启动 Neo4j Docker 后切换 GRAPH_BACKEND=neo4j。
- [待完成] 添加请求日志、错误监控、Agent 超时熔断（部分日志已完成，监控/熔断待补齐）。
- [待完成] 接入 Redis 缓存会话与资源生成结果。
- [待完成] 补充 OpenAPI 文档说明与接口测试。
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, assistant, auth, code, evaluation, graph, learning_plan, resources, sessions, tts
from app.core.config import get_settings
from app.middleware.logging import RequestLoggingMiddleware, setup_logging
from app.services.database import get_db
from app.services.graph_factory import get_graph_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化图存储
    graph_store = get_graph_store()
    graph_store.init_schema()
    app.state.graph = graph_store

    # 初始化内存会话缓存
    app.state.sessions_db = {}

    # 初始化 SQLite 数据库（懒加载，这里触发建表）
    _ = get_db()

    yield
    # 关闭时释放资源
    graph_store.close()


setup_logging()

settings = get_settings()
app = FastAPI(
    title="智学蜂巢 EduHive API",
    description="基于多智能体协同的 Python 个性化学习系统",
    version="1.0.0",
    lifespan=lifespan,
)

# 请求日志中间件
app.add_middleware(RequestLoggingMiddleware)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["用户认证"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["学习会话"])
app.include_router(resources.router, prefix="/api/resources", tags=["资源生成"])
app.include_router(graph.router, prefix="/api/graph", tags=["知识图谱"])
app.include_router(code.router, prefix="/api/code", tags=["代码执行与判题"])
app.include_router(evaluation.router, prefix="/api/evaluation", tags=["学习评估"])
app.include_router(learning_plan.router, prefix="/api/learning-plan", tags=["学习规划"])
app.include_router(admin.router, prefix="/api/admin", tags=["管理后台"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["数字人助教"])
app.include_router(tts.router, prefix="/api/tts", tags=["语音合成"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "eduhive-backend"}


@app.get("/health/detail")
async def health_detail():
    """详细健康检查：包含配置与数据库统计"""
    from app.services.database import get_db
    from app.services.graph_factory import get_graph_store
    from app.services.resource_cache import get_cache_stats

    db = get_db()
    try:
        session_count = len(list(db["sessions"].rows))
        user_count = len(list(db["users"].rows))
        event_count = len(list(db["learning_events"].rows))
        resource_count = len(list(db["resource"].rows)) if "resource" in db.table_names() else 0
        task_count = len(list(db["generation_task"].rows)) if "generation_task" in db.table_names() else 0
        debate_count = len(list(db["debate_record"].rows)) if "debate_record" in db.table_names() else 0
        submission_count = len(list(db["code_submission"].rows)) if "code_submission" in db.table_names() else 0
        version_count = len(list(db["resource_version"].rows)) if "resource_version" in db.table_names() else 0
        cache_count = get_cache_stats()["total"]
    finally:
        db.conn.close()

    graph = get_graph_store()
    concepts = len(graph.get_all_concepts())

    return {
        "status": "ok",
        "service": "eduhive-backend",
        "llm_provider": settings.LLM_PROVIDER,
        "graph_backend": settings.GRAPH_BACKEND,
        "database_stats": {
            "sessions": session_count,
            "users": user_count,
            "events": event_count,
            "resources": resource_count,
            "generation_tasks": task_count,
            "debate_records": debate_count,
            "code_submissions": submission_count,
            "resource_versions": version_count,
            "cache_entries": cache_count,
            "graph_concepts": concepts,
        },
        "database": {
            "sessions": session_count,
            "users": user_count,
            "events": event_count,
            "resource_cache": cache_count,
        },
        "graph": {"concepts": concepts},
    }
