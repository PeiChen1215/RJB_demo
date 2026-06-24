"""临时检查脚本：验证生成资源中 Python 代码块的语法正确性

从 /api/resources/generate-for-session 获取资源包，提取 Markdown 中的 Python
代码块，使用 ast.parse 逐块检查是否存在 SyntaxError。

TODO:
- [已完成] 调用接口生成资源并提取 Python 代码块
- [已完成] 使用 ast.parse 检查每段代码语法
- [待完成] 改造为可复用的 CLI 工具，支持指定 concept
- [待完成] 支持检查其他语言代码块（如 JavaScript、SQL）
- [待完成] 将语法错误报告写入文件并标注来源资源
"""
import os
os.environ.setdefault("DEEPSEEK_API_KEY", os.getenv("DEEPSEEK_API_KEY", "sk-PLACEHOLDER"))
os.environ.setdefault("LLM_PROVIDER", "deepseek")

import ast
import re
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
r = client.post("/api/sessions/", json={"target_concept": "文件操作"})
sid = r.json()["session_id"]
r2 = client.post(f"/api/resources/generate-for-session/{sid}", params={"concept": "文件操作"})
data = r2.json()
content = data["package"]["document"]
for i, code in enumerate(re.findall(r"```python\s*(.*?)\s*```", content, re.DOTALL)):
    try:
        ast.parse(code)
        print(f"[OK] block {i}")
    except SyntaxError as e:
        print(f"[ERR] block {i}: {e}")
        print(code[:500])
        print("-" * 40)
