"""测试 LLM 生成代码中的 Windows 路径反斜杠不会导致 AST 误报"""
import os
import sys

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "mock"

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from app.services.neuro_symbolic import NeuroSymbolicValidator


def test_windows_path_in_string():
    content = '''```python
path = "C:\\Users\\student\\data.txt"
with open(path) as f:
    print(f.read())
```'''
    validator = NeuroSymbolicValidator()
    result = validator.validate_resource(content, "文件操作")
    print("Windows 路径字符串:", result["ast_violations"])
    assert len(result["ast_violations"]) == 0


def test_relative_path_in_string():
    content = '''```python
f = open(".\\data\\file.txt")
print(f.read())
```'''
    validator = NeuroSymbolicValidator()
    result = validator.validate_resource(content, "文件操作")
    print("相对路径字符串:", result["ast_violations"])
    assert len(result["ast_violations"]) == 0


def test_raw_string_path():
    content = '''```python
path = r"C:\\Users\\student\\data.txt"
print(path)
```'''
    validator = NeuroSymbolicValidator()
    result = validator.validate_resource(content, "文件操作")
    print("Raw 字符串路径:", result["ast_violations"])
    assert len(result["ast_violations"]) == 0


def test_real_syntax_error_still_detected():
    content = '''```python
def broken(
    print("missing parenthesis")
```'''
    validator = NeuroSymbolicValidator()
    result = validator.validate_resource(content, "文件操作")
    print("真实语法错误:", result["ast_violations"])
    assert any("语法错误" in v for v in result["ast_violations"])


if __name__ == "__main__":
    test_windows_path_in_string()
    test_relative_path_in_string()
    test_raw_string_path()
    test_real_syntax_error_still_detected()
    print("\n[OK] 反斜杠清理与 AST 校验测试通过")
