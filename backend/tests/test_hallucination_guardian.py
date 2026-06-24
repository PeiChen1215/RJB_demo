"""防幻觉 Guardian 三类测试用例

验证神经符号校验层能否识别教学资源中的三类幻觉/超纲问题：
1. 不存在 API：代码块导入未授权/不存在的第三方模块；
2. 语法错误：代码块存在 Python 语法错误；
3. 前置关系冲突：讲解内容涉及当前知识点的前置依赖未覆盖的后续概念。

对应三人分工.md 成员 A Week 1 任务 A4 的验收标准。

TODO:
- [已完成] 不存在 API 检测用例
- [已完成] 语法错误检测用例
- [已完成] 前置关系冲突检测用例
- [已完成] 正常资源通过用例
- [待完成] 接入辩论议会 Guardian 投票结果做端到端断言
- [待完成] 扩展更多幻觉场景（超纲库函数、错误前置知识点顺序）
"""
import os

os.environ["GRAPH_BACKEND"] = "memory"
os.environ["LLM_PROVIDER"] = "mock"

from app.services.neuro_symbolic import NeuroSymbolicValidator


def test_nonexistent_api_detected():
    """不存在 API：导入未授权模块应被识别"""
    validator = NeuroSymbolicValidator()
    content = """
# 变量与赋值

```python
import nonexistent_api
result = nonexistent_api.do_something()
```
"""
    result = validator.validate_resource(content, "变量与赋值")
    assert result["passed"] is False
    assert any("未授权导入模块" in v for v in result["ast_violations"])
    print("[OK] 不存在 API 被正确识别")


def test_syntax_error_detected():
    """语法错误：代码块语法错误应被识别"""
    validator = NeuroSymbolicValidator()
    content = """
# 变量与赋值

```python
x = 10
if x > 5
    print("big")
```
"""
    result = validator.validate_resource(content, "变量与赋值")
    assert result["passed"] is False
    assert any("代码语法错误" in v for v in result["ast_violations"])
    print("[OK] 语法错误被正确识别")


def test_prerequisite_conflict_detected():
    """前置关系冲突：讲解函数定义时涉及类与对象等后续概念"""
    validator = NeuroSymbolicValidator()
    content = """
# 函数定义与调用

在 Python 中，类与对象是非常重要的概念。下面是一个类的示例：

```python
class Student:
    def __init__(self, name):
        self.name = name
```

类里面可以定义函数，这些函数称为方法。
"""
    result = validator.validate_resource(content, "函数定义与调用")
    assert result["passed"] is False
    assert "类与对象" in result["forbidden_concepts"]
    print("[OK] 前置关系冲突被正确识别")


def test_valid_resource_passes():
    """正常资源：无违规代码、无超纲概念，应通过校验"""
    validator = NeuroSymbolicValidator()
    content = """
# 变量与赋值

变量是存储数据的容器。

```python
x = 10
name = "Python"
print(x, name)
```

上面的代码把整数 10 赋值给变量 x，把字符串赋值给 name。
"""
    result = validator.validate_resource(content, "变量与赋值")
    assert result["passed"] is True
    assert len(result["ast_violations"]) == 0
    assert len(result["forbidden_concepts"]) == 0
    print("[OK] 正常资源通过校验")


if __name__ == "__main__":
    test_nonexistent_api_detected()
    test_syntax_error_detected()
    test_prerequisite_conflict_detected()
    test_valid_resource_passes()
    print("\n[OK] 防幻觉 Guardian 三类测试全部通过")
