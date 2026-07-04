"""代码执行与判题 API

对应需求/功能：
- 提供 Python 代码在线执行与判题能力，供前端练习/调试使用。
- 将学生每次代码提交、运行结果与错误模式持久化到数据库，作为学习行为数据。

主要接口：
- POST /api/code/execute：执行任意 Python 代码并返回输出/错误。
- POST /api/code/judge：执行代码并对比期望输出，返回是否通过。
- POST /api/code/judge-exercise：判题并更新会话中的练习记录（当前实现与 judge 相同）。

主要类：
- ExecuteRequest：代码执行请求体。
- JudgeRequest：判题请求体。

TODO:
- [已完成] Python 代码执行与结果返回已实现
- [已完成] 代码提交历史与错误模式持久化已实现
- [已完成] 学习行为日志记录已实现
- [已完成] 错误率超阈值自动触发知识熔炉资源重审
- [待完成] 接入 Docker 沙箱，支持第三方库并增强隔离性
- [待完成] 接入 Pyodide 后端执行选项
- [待完成] judge-exercise 接口需真正与会话练习记录联动
"""
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, Field

import uuid

from app.services.code_executor import CodeExecutor
from app.services.database import (
    create_code_submission,
    log_event,
)
from app.services.knowledge_furnace import trigger_resource_review

router = APIRouter()


def _missing_expected_output_result() -> dict:
    return {
        "success": False,
        "stdout": "",
        "stderr": "",
        "passed": False,
        "actual_output": "",
        "expected_output": "",
        "execution_time": 0.0,
        "violations": [],
        "reason": "缺少期望输出，无法自动判题",
    }


class ExecuteRequest(BaseModel):
    code: str


class JudgeRequest(BaseModel):
    code: str
    expected_output: str
    session_id: str | None = None
    concept: str | None = None


class SeedFailedSubmissionsRequest(BaseModel):
    session_id: str
    concept: str
    count: int = Field(default=5, ge=1, le=100)


class RunnabilityCheckRequest(BaseModel):
    """代码案例可运行性校验请求

    支持批量校验教学资源包中的代码案例。
    """
    code_cases: List[Dict[str, Any]] = Field(default_factory=list, description="代码案例列表")
    timeout: float = Field(default=5.0, ge=1.0, le=30.0, description="单段代码执行超时（秒）")


class RunnabilityCheckResponse(BaseModel):
    total: int
    runnable_count: int
    failed_count: int
    results: List[Dict[str, Any]]


@router.post("/execute")
async def execute_code(payload: ExecuteRequest, request: Request):
    """执行 Python 代码并返回输出"""
    executor = CodeExecutor()
    result = executor.execute(payload.code)

    # 持久化代码提交记录，失败时记录错误类型
    error_type = ""
    if not result.get("success"):
        error_type = result.get("error_type", "runtime")
    create_code_submission(
        submission_id=str(uuid.uuid4()),
        session_id="anonymous",
        concept="",
        code=payload.code,
        output=result.get("stdout", "") + "\n" + result.get("stderr", ""),
        passed=result.get("success", False),
        error_type=error_type,
        execution_time=result.get("execution_time", 0.0),
    )

    # 记录代码执行事件，供后续学习分析使用
    log_event("anonymous", "code_executed", {
        "code": payload.code,
        "success": result.get("success"),
        "violations": result.get("violations"),
    })

    return result


@router.post("/judge")
async def judge_code(
    payload: JudgeRequest,
    request: Request,
    background_tasks: BackgroundTasks = None,
):
    """判题：执行代码并对比期望输出"""
    result = _missing_expected_output_result() if not payload.expected_output.strip() else CodeExecutor().judge(payload.code, payload.expected_output)

    session_id = payload.session_id or "anonymous"
    concept = payload.concept or ""
    error_type = "passed" if result.get("passed") else result.get("error_type", "logic")

    # 持久化判题提交记录
    create_code_submission(
        submission_id=str(uuid.uuid4()),
        session_id=session_id,
        exercise_id="",
        concept=concept,
        code=payload.code,
        output=result.get("actual_output", ""),
        passed=result.get("passed", False),
        error_type=error_type,
        execution_time=result.get("execution_time", 0.0),
    )

    # 记录练习提交事件
    log_event(session_id, "exercise_submitted", {
        "concept": concept,
        "code": payload.code,
        "expected_output": payload.expected_output,
        "passed": result.get("passed"),
        "actual_output": result.get("actual_output"),
    })

    # 错误率过高时后台触发知识熔炉资源重审
    triggered = False
    if concept and result.get("passed") is False:
        if background_tasks is not None:
            background_tasks.add_task(trigger_resource_review, concept, "error_rate")
            triggered = True

    return {
        **result,
        "knowledge_furnace_triggered": triggered,
        "concept": concept,
    }


@router.post("/runnability-check")
async def runnability_check(payload: RunnabilityCheckRequest):
    """批量校验代码案例是否可运行。

    用于资源生成阶段自动校验 `code_cases`，或前端批量检查练习题/案例代码。
    """
    executor = CodeExecutor(timeout=payload.timeout)
    results = []
    runnable_count = 0

    for case in payload.code_cases:
        title = case.get("title", "代码案例")
        code = case.get("code", "")
        explanation = case.get("explanation", "")
        item = {
            "title": title,
            "code": code,
            "explanation": explanation,
            "runnable": False,
            "stdout": "",
            "stderr": "",
            "execution_time": 0.0,
        }
        if code.strip():
            try:
                result = executor.execute(code)
                item["runnable"] = result.get("success", False)
                item["stdout"] = result.get("stdout", "")
                item["stderr"] = result.get("stderr", "")
                item["execution_time"] = result.get("execution_time", 0.0)
            except Exception as e:
                item["stderr"] = str(e)
        if item["runnable"]:
            runnable_count += 1
        results.append(item)

    return RunnabilityCheckResponse(
        total=len(payload.code_cases),
        runnable_count=runnable_count,
        failed_count=len(payload.code_cases) - runnable_count,
        results=results,
    )


@router.post("/seed-failed-submissions")
async def seed_failed_submissions(payload: SeedFailedSubmissionsRequest):
    """快速插入指定数量的失败代码提交（演示/测试用）"""
    for _ in range(payload.count):
        create_code_submission(
            submission_id=str(uuid.uuid4()),
            session_id=payload.session_id,
            exercise_id="",
            concept=payload.concept,
            code="# seed failed submission",
            output="",
            passed=False,
            error_type="logic",
            execution_time=0.0,
        )
    return {"created": payload.count}


@router.post("/judge-exercise")
async def judge_exercise(
    payload: JudgeRequest,
    request: Request,
    background_tasks: BackgroundTasks = None,
):
    """判题并更新会话中的练习记录"""
    result = _missing_expected_output_result() if not payload.expected_output.strip() else CodeExecutor().judge(payload.code, payload.expected_output)

    session_id = payload.session_id or "anonymous"
    concept = payload.concept or ""
    error_type = "passed" if result.get("passed") else result.get("error_type", "logic")

    # 持久化代码提交记录
    create_code_submission(
        submission_id=str(uuid.uuid4()),
        session_id=session_id,
        exercise_id="",
        concept=concept,
        code=payload.code,
        output=result.get("actual_output", ""),
        passed=result.get("passed", False),
        error_type=error_type,
        execution_time=result.get("execution_time", 0.0),
    )

    # 记录练习提交事件
    log_event(session_id, "exercise_submitted", {
        "concept": concept,
        "code": payload.code,
        "expected_output": payload.expected_output,
        "passed": result.get("passed"),
        "actual_output": result.get("actual_output"),
    })

    # 错误率过高时后台触发知识熔炉资源重审
    triggered = False
    if concept and result.get("passed") is False:
        if background_tasks is not None:
            background_tasks.add_task(trigger_resource_review, concept, "error_rate")
            triggered = True

    return {
        **result,
        "knowledge_furnace_triggered": triggered,
        "concept": concept,
    }
