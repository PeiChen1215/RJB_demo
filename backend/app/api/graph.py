"""知识图谱 API

对应需求/功能：
- 向前端提供完整的 Python 知识图谱数据（节点、边）。
- 提供从已掌握知识点到目标知识点的学习路径查询。
- 提供单个知识点的详细信息查询。

主要接口：
- GET /api/graph/：获取完整知识图谱节点与前置依赖边。
- GET /api/graph/path：根据已掌握知识点和目标知识点计算学习路径。
- GET /api/graph/concept/{name}：获取指定知识点详情。

主要类：
- 直接使用 Pydantic 模型 GraphData / GraphNode / GraphEdge 序列化响应。

TODO:
- [已完成] 完整知识图谱节点与边返回已实现
- [已完成] 学习路径查询接口已实现
- [已完成] 知识点详情查询已实现
- [待完成] 返回节点坐标/模块颜色，便于前端美化渲染
- [待完成] 支持查询学生个人学习路径高亮（已掌握/当前目标/未学）
- [待完成] 支持 A* 算法路径规划（当前图存储层为 shortestPath/BFS）
- [待完成] 支持图嵌入向量计算与相似知识点推荐
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Query

from app.models.schemas import GraphData, GraphEdge, GraphNode
from app.services.bkt import get_bkt_tracker
from app.services.database import get_session
from app.services.graph_factory import get_graph_store

router = APIRouter()


@router.get("/", response_model=GraphData)
async def get_graph():
    """获取完整知识图谱"""
    graph = get_graph_store()
    concepts = graph.get_all_concepts()

    # 构造节点列表
    nodes = [
        GraphNode(
            id=c["name"],
            name=c["name"],
            module=c.get("module", "未分类"),
            difficulty=c.get("difficulty", 3),
        )
        for c in concepts
    ]

    # 构造边：基于前置依赖关系，避免重复边
    edges = []
    seen_edges = set()
    for c in concepts:
        concept = graph.get_concept(c["name"])
        if not concept:
            continue
        for pre in concept.get("prerequisites", []):
            key = (pre, c["name"])
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append(GraphEdge(source=pre, target=c["name"], strength=0.8))

    return GraphData(nodes=nodes, edges=edges)


@router.get("/path")
async def get_learning_path(
    from_concepts: str | None = None,
    to_concept: str | None = None,
    session_id: str | None = None,
    target_concept: str | None = None,
):
    """获取学习路径。

    支持两种调用方式：
    1. 旧接口：`?from_concepts=...&to_concept=...`
    2. 个人路径：`?session_id=...&target_concept=...`（默认使用会话目标）
    """
    graph = get_graph_store()

    # 优先使用 session 驱动个人路径
    if session_id:
        session = get_session(session_id)
        if not session:
            return {"error": "会话不存在"}
        profile = session.get("profile", {})
        mastered = set(profile.get("mastered_concepts", []))
        target = target_concept or session.get("target_concept") or ""
        if not target:
            return {"error": "未指定目标知识点"}
        path = graph.get_learning_path(list(mastered), target)

        # 加载 BKT 掌握度
        tracker = get_bkt_tracker()
        tracker.load_from_session(session_id)

        path_nodes = []
        for name in path:
            mastery = tracker.get_mastery_probability(name)
            is_mastered = name in mastered or mastery >= 0.85
            path_nodes.append({
                "id": name,
                "name": name,
                "mastery_probability": round(mastery, 4),
                "is_mastered": is_mastered,
                "is_current": name == target,
                "state": "mastered" if is_mastered else ("current" if name == target else "waiting"),
            })

        path_edges = []
        for i in range(1, len(path)):
            src, tgt = path[i - 1], path[i]
            concept_info = graph.get_concept(tgt) or {}
            reason = concept_info.get("reason", "") or f"{src} 是 {tgt} 的前置知识"
            path_edges.append({
                "source": src,
                "target": tgt,
                "reason": reason,
                "prerequisites": concept_info.get("prerequisites", []),
                "pitfalls": [p.get("description", "") for p in concept_info.get("pitfalls", [])],
            })

        return {
            "session_id": session_id,
            "target_concept": target,
            "path_nodes": path_nodes,
            "path_edges": path_edges,
            "mastered_concepts": list(mastered),
        }

    # 旧接口兼容
    if not from_concepts or not to_concept:
        return {"error": "请提供 from_concepts + to_concept，或 session_id + target_concept"}
    from_list = [c.strip() for c in from_concepts.split(",")]
    path = graph.get_learning_path(from_list, to_concept)
    return {"from": from_list, "to": to_concept, "path": path}


@router.get("/concept/{name}")
async def get_concept(name: str):
    """获取知识点详情"""
    graph = get_graph_store()
    concept = graph.get_concept(name)
    if not concept:
        return {"error": "知识点不存在"}
    return concept


# ---------------------------------------------------------------------------
# 后端驱动布局与个人路径（支持 Command Center 图谱渲染）
# ---------------------------------------------------------------------------

_MODULE_COLORS = {
    "基础语法": "#3b82f6",
    "数据类型": "#10b981",
    "控制流": "#f59e0b",
    "函数与模块": "#8b5cf6",
    "文件与异常": "#ef4444",
    "面向对象": "#ec4899",
    "高级特性": "#06b6d4",
    "未分类": "#94a3b8",
}


def _compute_layout(concepts: List[dict], edges: List[dict]) -> List[dict]:
    """基于拓扑层级与模块分组计算节点坐标"""
    # 计算每个节点的拓扑层级（最长前置链长度）
    prereq_map: Dict[str, List[str]] = {c["name"]: [] for c in concepts}
    for e in edges:
        prereq_map.setdefault(e["target"], []).append(e["source"])

    levels: Dict[str, int] = {}

    def get_level(name: str) -> int:
        if name in levels:
            return levels[name]
        if not prereq_map.get(name):
            levels[name] = 0
            return 0
        lvl = 1 + max(get_level(p) for p in prereq_map[name] if p in prereq_map)
        levels[name] = lvl
        return lvl

    for c in concepts:
        get_level(c["name"])

    # 按层级、模块分组，计算坐标
    by_level: Dict[int, List[dict]] = {}
    for c in concepts:
        by_level.setdefault(levels.get(c["name"], 0), []).append(c)

    x_step = 220
    y_step = 120
    nodes_layout = []
    for lvl, items in sorted(by_level.items()):
        # 按模块、名称排序，让同模块节点靠近
        items.sort(key=lambda c: (c.get("module", "未分类"), c["name"]))
        for idx, c in enumerate(items):
            module = c.get("module", "未分类")
            nodes_layout.append({
                "id": c["name"],
                "name": c["name"],
                "module": module,
                "difficulty": c.get("difficulty", 3),
                "x": lvl * x_step,
                "y": idx * y_step - (len(items) - 1) * y_step / 2,
                "color": _MODULE_COLORS.get(module, _MODULE_COLORS["未分类"]),
            })
    return nodes_layout


@router.get("/layout")
async def get_graph_layout():
    """获取带坐标与颜色的知识图谱布局，供前端直接渲染"""
    graph = get_graph_store()
    concepts = graph.get_all_concepts()

    edges = []
    seen = set()
    for c in concepts:
        info = graph.get_concept(c["name"]) or {}
        for pre in info.get("prerequisites", []):
            key = (pre, c["name"])
            if key not in seen:
                seen.add(key)
                edges.append({"source": pre, "target": c["name"], "strength": 0.8})

    nodes = _compute_layout(concepts, edges)
    return {"nodes": nodes, "edges": edges}



