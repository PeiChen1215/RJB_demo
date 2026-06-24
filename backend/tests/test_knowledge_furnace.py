"""知识熔炉自动触发与版本演进测试

验证：当某知识点错误率超过阈值时，系统自动触发资源重审并保存新版本。

TODO:
- [已完成] 错误率阈值判断测试
- [已完成] 触发重审并保存 resource_version 测试
- [待完成] 测试资源反馈作为辅助触发信号
"""
import os
import uuid
from unittest.mock import patch

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "mock"

from app.services.database import create_code_submission, get_db, get_resource_versions, init_db
from app.services.knowledge_furnace import (
    MIN_SUBMISSIONS,
    should_trigger_resource_review,
    trigger_resource_review,
)

init_db(get_db())

CONCEPT = "知识熔炉测试_循环结构"


def _seed_failed_submissions(concept: str, count: int):
    """构造指定数量的失败提交"""
    for _ in range(count):
        create_code_submission(
            submission_id=str(uuid.uuid4()),
            session_id="test",
            concept=concept,
            code="print(1)",
            output="wrong",
            passed=False,
            error_type="logic",
        )


def test_should_trigger_when_error_rate_high():
    _seed_failed_submissions(CONCEPT, MIN_SUBMISSIONS)
    should, stats = should_trigger_resource_review(CONCEPT)
    assert should is True
    assert stats["error_rate"] >= 0.6
    assert stats["total_submissions"] >= MIN_SUBMISSIONS


def test_should_not_trigger_when_error_rate_low():
    low_concept = "知识熔炉测试_低风险"
    # 4 失败 1 通过，错误率 0.8？为了低错误率，需要 5 次里 1 失败
    for i in range(5):
        create_code_submission(
            submission_id=str(uuid.uuid4()),
            session_id="test",
            concept=low_concept,
            code="print(1)",
            output="ok",
            passed=(i != 0),
            error_type="passed" if i != 0 else "logic",
        )
    should, stats = should_trigger_resource_review(low_concept)
    assert should is False
    assert stats["error_rate"] < 0.6


def test_trigger_resource_review_creates_version():
    """触发重审后应生成新版本并记录演进"""
    # 使用新概念，避免受之前测试数据影响
    concept = "知识熔炉测试_版本演进"
    _seed_failed_submissions(concept, MIN_SUBMISSIONS)

    mock_package = {
        "document": "改进后的讲解",
        "mindmap": "改进后的导图",
        "exercises": [],
        "code_cases": [],
    }
    mock_report = {"status": "PASSED", "rounds": []}

    with patch("app.services.knowledge_furnace.AgentOrchestrator") as MockOrchestrator:
        MockOrchestrator.return_value.generate_resource.return_value = {
            "package": mock_package,
            "debate_report": mock_report,
        }
        result = trigger_resource_review(concept)

    assert result is not None
    assert result["version"] == 1
    assert result["concept"] == concept

    versions = get_resource_versions(concept)
    assert len(versions) == 1
    assert versions[0]["version"] == 1
    assert "错误率" in versions[0]["change_reason"]

    # 再次触发应生成 v2
    _seed_failed_submissions(concept, MIN_SUBMISSIONS)
    with patch("app.services.knowledge_furnace.AgentOrchestrator") as MockOrchestrator:
        MockOrchestrator.return_value.generate_resource.return_value = {
            "package": mock_package,
            "debate_report": mock_report,
        }
        result2 = trigger_resource_review(concept)

    assert result2 is not None
    assert result2["version"] == 2


if __name__ == "__main__":
    test_should_trigger_when_error_rate_high()
    test_should_not_trigger_when_error_rate_low()
    test_trigger_resource_review_creates_version()
    print("\n[OK] 知识熔炉测试通过")
