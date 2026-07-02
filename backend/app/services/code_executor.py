"""Python 代码执行器。

提供轻量级本地沙箱能力：
- 使用 AST 做基础安全检查；
- 在临时工作目录中执行用户代码；
- 将 open() 限制在临时目录内，避免访问项目或用户磁盘；
- 返回 stdout、stderr、执行状态和顶层变量快照。
"""
import ast
import json
import os
import subprocess
import tempfile
import textwrap
import time
from typing import Any, Dict, List


class CodeExecutionError(Exception):
    pass


class CodeExecutor:
    """本地 Python 代码执行器。"""

    ALLOWED_MODULES = {
        "os", "sys", "json", "csv", "math", "random", "datetime",
        "time", "collections", "itertools", "functools", "re",
        "string", "pathlib", "io", "tempfile", "shutil", "statistics",
        "decimal", "fractions", "typing", "inspect", "hashlib",
    }

    FORBIDDEN_NODES = (
        ast.Delete,
    )

    FORBIDDEN_CALLS = {
        "exec", "eval", "compile", "__import__",
        "os.remove", "os.unlink", "os.rmdir", "os.removedirs",
        "os.rename", "os.replace", "os.chmod", "os.chown",
        "os.system", "os.popen", "subprocess.call", "subprocess.run",
        "subprocess.Popen", "shutil.rmtree", "shutil.move", "input",
    }

    def __init__(self, timeout: float = 5.0):
        self.timeout = timeout

    def validate(self, code: str) -> List[str]:
        """静态检查代码安全性，返回违规列表。"""
        violations = []

        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return [f"语法错误: {e.msg}"]

        for node in ast.walk(tree):
            if isinstance(node, self.FORBIDDEN_NODES):
                violations.append(f"禁止的语法: {type(node).__name__}")

            if isinstance(node, ast.Import):
                for alias in node.names:
                    module = alias.name.split(".")[0]
                    if module not in self.ALLOWED_MODULES:
                        violations.append(f"未授权导入模块: {module}")

            if isinstance(node, ast.ImportFrom):
                module = (node.module or "").split(".")[0]
                if module and module not in self.ALLOWED_MODULES:
                    violations.append(f"未授权导入模块: {module}")

            if isinstance(node, ast.Call):
                call_name = self._get_call_name(node.func)
                if call_name in self.FORBIDDEN_CALLS:
                    violations.append(f"禁止调用函数: {call_name}")

        return violations

    def _get_call_name(self, node) -> str:
        """获取函数调用名称。"""
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return f"{self._get_call_name(node.value)}.{node.attr}"
        return ""

    def execute(self, code: str) -> Dict[str, Any]:
        """执行代码并返回输出、错误和变量快照。"""
        violations = self.validate(code)
        if violations:
            return {
                "success": False,
                "stdout": "",
                "stderr": "",
                "violations": violations,
                "variables": [],
                "execution_time": 0.0,
            }

        started_at = time.perf_counter()
        variables = []

        with tempfile.TemporaryDirectory(prefix="eduhive_code_") as workdir:
            runner_path = os.path.join(workdir, "runner.py")
            variables_path = os.path.join(workdir, "__eduhive_variables.json")
            sample_path = os.path.join(workdir, "sample.txt")

            with open(sample_path, "w", encoding="utf-8") as sample_file:
                sample_file.write("Hello, EduHive!\n今天学习 Python 文件操作。\n继续加油!")

            with open(runner_path, "w", encoding="utf-8") as runner_file:
                runner_file.write(self._build_runner(code, variables_path))

            try:
                result = subprocess.run(
                    ["python", runner_path],
                    cwd=workdir,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                )
                if os.path.exists(variables_path):
                    with open(variables_path, "r", encoding="utf-8") as var_file:
                        variables = json.load(var_file)

                return {
                    "success": result.returncode == 0,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "violations": [],
                    "variables": variables,
                    "execution_time": round(time.perf_counter() - started_at, 4),
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": f"执行超时（{self.timeout}秒）",
                    "violations": [],
                    "variables": variables,
                    "execution_time": round(time.perf_counter() - started_at, 4),
                }
            except Exception as e:
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": str(e),
                    "violations": [],
                    "variables": variables,
                    "execution_time": round(time.perf_counter() - started_at, 4),
                }

    def _build_runner(self, code: str, variables_path: str) -> str:
        """构建受控执行脚本，并在运行结束时写出变量快照。"""
        return textwrap.dedent(f"""
            import builtins
            import io
            import json
            import os
            import reprlib
            import traceback

            _EDUHIVE_SOURCE = {repr(code)}
            _EDUHIVE_VARIABLES_PATH = {repr(variables_path)}
            _EDUHIVE_ROOT = os.path.abspath(os.getcwd())
            _EDUHIVE_REAL_OPEN = builtins.open

            def _eduhive_safe_open(file, mode='r', buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None):
                path = os.fspath(file)
                target = os.path.abspath(path if os.path.isabs(path) else os.path.join(_EDUHIVE_ROOT, path))
                if os.path.commonpath([_EDUHIVE_ROOT, target]) != _EDUHIVE_ROOT:
                    raise PermissionError('代码沙箱只允许访问临时工作目录内的文件')
                return _EDUHIVE_REAL_OPEN(target, mode, buffering, encoding, errors, newline, closefd, opener)

            def _eduhive_preview(value):
                try:
                    if isinstance(value, str):
                        return reprlib.repr(value)
                    if isinstance(value, (int, float, bool)) or value is None:
                        return repr(value)
                    if isinstance(value, (list, tuple, set, dict)):
                        return reprlib.repr(value)
                    return f"<{{type(value).__name__}}>"
                except Exception:
                    return '<unrepresentable>'

            def _eduhive_size(value):
                try:
                    if isinstance(value, (str, list, tuple, set, dict)):
                        return len(value)
                except Exception:
                    return None
                return None

            def _eduhive_collect(scope):
                snapshots = []
                for name, value in scope.items():
                    if name.startswith('_') or name in {{'__builtins__', '__name__', '__file__'}}:
                        continue
                    if isinstance(value, io.IOBase):
                        continue
                    if callable(value) or getattr(value, '__spec__', None) is not None:
                        continue
                    snapshots.append({{
                        'name': name,
                        'type': type(value).__name__,
                        'value': _eduhive_preview(value),
                        'size': _eduhive_size(value),
                    }})
                return snapshots[:24]

            builtins.open = _eduhive_safe_open
            _eduhive_globals = {{
                '__name__': '__main__',
                '__file__': os.path.join(_EDUHIVE_ROOT, 'student_code.py'),
            }}
            _eduhive_success = True

            try:
                exec(compile(_EDUHIVE_SOURCE, 'student_code.py', 'exec'), _eduhive_globals)
            except BaseException:
                _eduhive_success = False
                traceback.print_exc()
            finally:
                with _EDUHIVE_REAL_OPEN(_EDUHIVE_VARIABLES_PATH, 'w', encoding='utf-8') as _eduhive_file:
                    json.dump(_eduhive_collect(_eduhive_globals), _eduhive_file, ensure_ascii=False)
                if not _eduhive_success:
                    raise SystemExit(1)
        """).lstrip()

    def judge(self, code: str, expected_output: str) -> Dict[str, Any]:
        """判题：执行代码并对比期望输出。"""
        exec_result = self.execute(code)
        if not exec_result["success"]:
            return {
                **exec_result,
                "passed": False,
                "reason": "代码执行失败",
            }

        actual = exec_result["stdout"].strip()
        expected = expected_output.strip()

        passed = actual == expected
        if not passed:
            actual_lines = [line.strip() for line in actual.splitlines() if line.strip()]
            expected_lines = [line.strip() for line in expected.splitlines() if line.strip()]
            passed = actual_lines == expected_lines

        return {
            **exec_result,
            "passed": passed,
            "actual_output": actual,
            "expected_output": expected,
            "reason": "通过" if passed else "输出不匹配",
        }
