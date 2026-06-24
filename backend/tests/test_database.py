"""数据库表结构与 CRUD 操作测试

在临时 SQLite 数据库中验证各表结构、CRUD 与查询统计能力。

TODO:
- [已完成] 使用临时数据库隔离各测试用例
- [已完成] 覆盖生成任务、资源、版本、辩论记录、代码提交、掌握度、认知证据、反馈统计
- [待完成] 补充事务回滚与并发写入测试
- [待完成] 补充外键/索引约束与迁移兼容性测试
- [待完成] 补充大数据量分页查询性能测试
"""
import json
import os
import tempfile
import uuid

import pytest

os.environ.setdefault("DEEPSEEK_API_KEY", "sk-test")
os.environ.setdefault("LLM_PROVIDER", "mock")

from app.services import database as db


@pytest.fixture(autouse=True)
def clean_test_db():
    """每个测试用例前在临时文件创建独立数据库"""
    # 使用临时文件，避免与开发数据库 eduhive.db 冲突
    fd, temp_path = tempfile.mkstemp(suffix=".db", prefix="test_eduhive_")
    os.close(fd)

    # 更新配置（需要清除 lru_cache 才能重新读取环境变量）
    os.environ["DATABASE_URL"] = f"sqlite:///{temp_path}"
    db.get_settings.cache_clear()

    # 触发建表
    _db = db.get_db()
    _db.conn.close()

    yield

    # 测试结束后再清理
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except PermissionError:
            pass


class TestGenerationTask:
    def test_create_and_get_task(self):
        task_id = str(uuid.uuid4())
        db.create_generation_task(task_id, "session-1", "变量与赋值", status="pending")

        task = db.get_generation_task(task_id)
        assert task is not None
        assert task["session_id"] == "session-1"
        assert task["concept"] == "变量与赋值"
        assert task["status"] == "pending"

    def test_update_task(self):
        task_id = str(uuid.uuid4())
        db.create_generation_task(task_id, "session-1", "for循环")

        db.update_generation_task(
            task_id,
            status="generating",
            progress=50,
            stage_message="正在生成文档...",
            result={"resource_id": "res-1"},
        )

        task = db.get_generation_task(task_id)
        assert task["status"] == "generating"
        assert task["progress"] == 50
        assert task["result"]["resource_id"] == "res-1"


class TestResource:
    def test_create_and_get_resource(self):
        rid = str(uuid.uuid4())
        db.create_resource(
            resource_id=rid,
            session_id="session-1",
            concept="列表推导式",
            document="# 列表推导式",
            exercises=[{"question": "Q1"}],
            status="approved",
        )

        resource = db.get_resource(rid)
        assert resource["concept"] == "列表推导式"
        assert resource["document"] == "# 列表推导式"
        assert len(resource["exercises"]) == 1
        assert resource["status"] == "approved"

    def test_find_resource_by_concept(self):
        rid = str(uuid.uuid4())
        db.create_resource(
            resource_id=rid,
            session_id="session-2",
            concept="字典操作",
            document="# 字典",
            status="approved",
        )

        found = db.find_resource_by_concept("session-2", "字典操作")
        assert found is not None
        assert found["concept"] == "字典操作"

        not_found = db.find_resource_by_concept("session-2", "不存在")
        assert not_found is None


class TestResourceVersion:
    def test_version_evolution(self):
        rid = str(uuid.uuid4())
        db.create_resource_version(
            resource_id=rid,
            concept="文件操作",
            version=1,
            change_reason="初始版本",
            triggered_by="Builder",
            content_snapshot={"document": "v1"},
        )
        db.create_resource_version(
            resource_id=rid,
            concept="文件操作",
            version=2,
            change_reason="根据学生反馈增加 with 语句示例",
            triggered_by="知识熔炉：群体错误率 45%",
            content_snapshot={"document": "v2"},
        )

        versions = db.get_resource_versions("文件操作")
        assert len(versions) == 2
        assert versions[0]["version"] == 1
        assert versions[1]["version"] == 2
        assert "知识熔炉" in versions[1]["triggered_by"]


class TestDebateRecord:
    def test_create_and_get_debate(self):
        did = str(uuid.uuid4())
        db.create_debate_record(
            debate_id=did,
            concept="异常处理",
            status="PASSED",
            rounds=[{"round": 1, "agent": "Expert", "verdict": "PASS"}],
            final_votes={"Expert": "PASS", "Teacher": "PASS"},
            summary="全票通过",
        )

        record = db.get_debate_record(did)
        assert record["status"] == "PASSED"
        assert len(record["rounds"]) == 1
        assert record["final_votes"]["Expert"] == "PASS"


class TestCodeSubmission:
    def test_create_and_list_submissions(self):
        sid = "session-3"
        db.create_code_submission(
            submission_id=str(uuid.uuid4()),
            session_id=sid,
            concept="函数定义",
            code="def f(): return 1",
            output="1",
            passed=True,
            error_type="passed",
            execution_time=0.5,
        )
        db.create_code_submission(
            submission_id=str(uuid.uuid4()),
            session_id=sid,
            concept="函数定义",
            code="def f(): return 2",
            output="2",
            passed=False,
            error_type="logic",
            execution_time=0.3,
        )

        subs = db.list_code_submissions(sid)
        assert len(subs) == 2

        passed = db.list_code_submissions(sid, concept="函数定义")
        assert len(passed) == 2


class TestMasteryState:
    def test_update_and_get_mastery(self):
        db.update_mastery_state("session-4", "for循环", 0.6)
        db.update_mastery_state("session-4", "for循环", 0.85)

        states = db.get_mastery_state("session-4")
        assert len(states) == 1
        assert states[0]["p_known"] == 0.85
        assert states[0]["evidence_count"] == 2

        heatmap = db.get_mastery_heatmap("session-4")
        assert heatmap["for循环"] == 0.85


class TestCognitiveEvidence:
    def test_add_and_get_evidence(self):
        db.add_cognitive_evidence(
            session_id="session-5",
            dimension="cognitive_modality",
            evidence_type="click_mindmap",
            weight=0.7,
            description="多次点击思维导图节点",
        )

        evidence = db.get_cognitive_evidence("session-5", "cognitive_modality")
        assert len(evidence) == 1
        assert evidence[0]["evidence_type"] == "click_mindmap"
        assert evidence[0]["weight"] == 0.7


class TestResourceFeedback:
    def test_feedback_stats(self):
        concept = "with语句"
        for i in range(5):
            db.add_resource_feedback(
                session_id=f"session-{i}",
                resource_id="res-with",
                concept=concept,
                rating=3 if i < 2 else 4,
                confusion_marked=(i >= 3),
                error_report="不理解上下文管理器" if i == 4 else "",
            )

        stats = db.get_resource_feedback_stats(concept)
        assert stats["total_feedback"] == 5
        assert stats["confusion_count"] == 2
        assert stats["confusion_rate"] == 0.4
        assert stats["average_rating"] == (3 + 3 + 4 + 4 + 4) / 5
        assert len(stats["error_reports"]) == 1
