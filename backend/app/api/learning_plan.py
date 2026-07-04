"""学习规划 API

根据学生当前画像、已掌握知识点与目标知识点，生成个性化学习规划。
"""
from fastapi import APIRouter, HTTPException

from app.services.bkt import get_bkt_tracker
from app.services.database import get_session
from app.services.graph_factory import get_graph_store

router = APIRouter()


@router.get("/{session_id}")
async def get_learning_plan(session_id: str):
    """生成当前会话的个性化学习规划。

    规划逻辑：
    1. 从画像中获取已掌握知识点与目标知识点；
    2. 利用知识图谱计算从已掌握到目标的学习路径；
    3. 结合 BKT 掌握度为每个知识点估算所需学习时长；
    4. 返回按路径排序的学习计划与总时长估计。
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    profile = session.get("profile", {})
    mastered = set(profile.get("mastered_concepts", []))
    target = session.get("target_concept")
    if not target:
        raise HTTPException(status_code=400, detail="会话未设置目标知识点")

    graph = get_graph_store()
    path = graph.get_learning_path(list(mastered), target)

    tracker = get_bkt_tracker()
    tracker.load_from_session(session_id)

    plan = []
    total_minutes = 0
    for concept in path:
        concept_info = graph.get_concept(concept) or {}
        difficulty = concept_info.get("difficulty", 3)
        mastery = tracker.get_mastery_probability(concept)
        is_mastered = concept in mastered or mastery >= 0.85

        # 已掌握：复习时间少；未掌握：基础难度低则快，难度高则慢
        if is_mastered:
            minutes = 5
        else:
            minutes = max(10, difficulty * 12 - int(mastery * 20))

        total_minutes += minutes
        plan.append({
            "concept": concept,
            "difficulty": difficulty,
            "mastery_probability": round(mastery, 4),
            "is_mastered": is_mastered,
            "estimated_minutes": minutes,
            "reason": (
                "已掌握，快速复习" if is_mastered
                else f"掌握度 {mastery:.0%}，建议投入 {minutes} 分钟学习"
            ),
        })

    return {
        "session_id": session_id,
        "target_concept": target,
        "mastered_concepts": list(mastered),
        "total_minutes": total_minutes,
        "plan": plan,
    }
