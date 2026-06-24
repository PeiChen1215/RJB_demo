"""一键运行所有后端测试

本脚本集中维护后端测试文件清单，串行调用每个测试脚本并收集失败结果，
最后输出汇总报告，方便本地一键回归。

TODO:
- [已完成] 集中维护后端测试文件清单并串行执行
- [已完成] 收集失败用例并输出汇总报告
- [待完成] 支持 pytest 方式运行并生成覆盖率报告
- [待完成] 支持并行/并发执行以缩短测试总耗时
- [待完成] 与 CI/CD 流水线集成并在失败时自动输出日志
"""
import subprocess
import sys

TESTS = [
    "test_auth.py",
    "test_session_auth.py",
    "test_cache.py",
    "test_chat_stream.py",
    "test_code_executor.py",
    "test_evaluator.py",
    "test_full_chain.py",
    "test_safety_filter.py",
    "test_sse.py",
    "test_ablation.py",
    "test_backslash_sanitize.py",
]


def main():
    failures = []
    for test in TESTS:
        print(f"\n{'='*60}")
        print(f"Running {test}")
        print('=' * 60)
        result = subprocess.run(
            [sys.executable, test],
            cwd=".",
        )
        if result.returncode != 0:
            failures.append(test)

    print("\n" + "=" * 60)
    if failures:
        print(f"[FAIL] 以下测试未通过：{', '.join(failures)}")
        sys.exit(1)
    else:
        print(f"[OK] 全部 {len(TESTS)} 个测试通过")


if __name__ == "__main__":
    main()
