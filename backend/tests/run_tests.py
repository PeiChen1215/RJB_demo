"""一键运行所有后端测试

本脚本调用 pytest 自动发现 backend/tests/ 目录下的全部测试，
输出汇总报告，方便本地一键回归。

使用方式：
    cd backend
    .\venv\Scripts\python.exe tests\run_tests.py

TODO:
- [已完成] 调用 pytest 自动发现并运行 tests/ 目录下全部测试
- [已完成] 输出汇总报告
- [待完成] 生成覆盖率报告（pytest --cov）
- [待完成] 支持并行/并发执行以缩短测试总耗时（pytest-xdist）
- [待完成] 与 CI/CD 流水线集成并在失败时自动输出日志
"""
import subprocess
import sys
from pathlib import Path


def main():
    """运行 backend/tests/ 下的全部测试"""
    # 定位到 backend 目录（tests 的父目录）作为工作目录
    tests_dir = Path(__file__).parent
    backend_dir = tests_dir.parent

    print("=" * 60)
    print("Running backend tests via pytest")
    print("=" * 60)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", "tests", "-q"],
        cwd=backend_dir,
    )

    print("\n" + "=" * 60)
    if result.returncode != 0:
        print("[FAIL] 部分测试未通过")
        sys.exit(result.returncode)
    else:
        print("[OK] 全部测试通过")


if __name__ == "__main__":
    main()
