"""学习效果评估 API

提供：
1. GET /api/evaluation/heatmap?session_id=xxx — 掌握度热力图数据
2. GET /api/evaluation/bkt?session_id=xxx — BKT 详细状态
3. POST /api/evaluation/analyze?session_id=xxx — 触发同步分析

TODO:
- [待完成] 支持按时间范围筛选热力图
- [待完成] 增加趋势预测：预测未来 3 次练习后的掌握度
- [待完成] 增加知识点间影响矩阵
"""
from fastapi import APIRouter, Query, Request

from app.services.bkt import BKTTracker, get_bkt_tracker

router = APIRouter()


@router.get("/heatmap")
async def get_heatmap(
    session_id: str = Query(..., description="会话 ID"),
    request: Request = None,
):
    """获取掌握度热力图数据

    基于 BKT 模型计算每个知识点的掌握概率，返回热力图所需数据。
    如果会话有学习历史，会自动从数据库中恢复 BKT 状态。

    返回格式：
    {
        "data": [
            {"concept": "变量与赋值", "mastery_probability": 0.85, "observation_count": 5, "is_mastered": true},
            ...
        ],
        "summary": {
            "total_concepts": 10,
            "mastered": 3,
            "average_probability": 0.45
        }
    }
    """
    tracker = get_bkt_tracker()
    if session_id:
        tracker.load_from_session(session_id)

    return {
        "session_id": session_id,
        "data": tracker.get_heatmap_data(),
        "summary": tracker.to_dict()["summary"],
    }


@router.get("/bkt")
async def get_bkt_status(
    session_id: str = Query(..., description="会话 ID"),
    concept: str = Query(None, description="知识点名称（可选，不传则返回全部）"),
    request: Request = None,
):
    """获取 BKT 模型详细状态"""
    tracker = get_bkt_tracker()
    if session_id:
        tracker.load_from_session(session_id)

    if concept:
        # 只返回指定知识点
        mastery = tracker.get_mastery_probability(concept)
        return {
            "session_id": session_id,
            "concept": concept,
            "mastery_probability": round(mastery, 4),
            "bkt_params": tracker.get_or_create_model(concept).to_dict(),
        }

    return {
        "session_id": session_id,
        "data": tracker.to_dict(),
    }


@router.post("/analyze")
async def analyze_mastery(
    session_id: str = Query(..., description="会话 ID"),
    request: Request = None,
):
    """触发完整的掌握度分析

    从 learning_events 和 code_submissions 中读取历史数据，
    重建 BKT 状态并返回分析结果。
    """
    tracker = get_bkt_tracker()
    tracker.load_from_session(session_id)

    # 将重新计算后的 BKT 状态持久化到 mastery_state 表
    tracker.persist_to_session(session_id)

    heatmap_data = tracker.get_heatmap_data()

    # 找出薄弱知识点（掌握概率 < 0.6）
    weak_points = [
        item["concept"]
        for item in heatmap_data
        if item["mastery_probability"] < 0.6
    ]

    # 找出推荐复习的知识点（掌握概率在 0.6-0.85 之间，需要巩固）
    review_points = [
        item["concept"]
        for item in heatmap_data
        if 0.6 <= item["mastery_probability"] < 0.85
    ]

    return {
        "session_id": session_id,
        "summary": tracker.to_dict()["summary"],
        "weak_points": weak_points,
        "review_points": review_points,
        "heatmap_data": heatmap_data,
        "recommendation": (
            f"共追踪 {len(heatmap_data)} 个知识点，"
            f"已掌握 {len(heatmap_data) - len(weak_points) - len(review_points)} 个，"
            f"需巩固 {len(review_points)} 个，"
            f"薄弱 {len(weak_points)} 个。"
        ),
    }
