"""用户认证测试

验证注册、登录与密码错误等认证相关接口的基础行为。

TODO:
- [已完成] 测试用户注册与登录成功流程
- [已完成] 验证错误密码返回 401
- [待完成] 补充用户名重复注册冲突测试
- [待完成] 补充 Token 过期与刷新机制测试
- [待完成] 补充权限受保护接口访问测试
"""
import os
import uuid

os.environ.setdefault("DEEPSEEK_API_KEY", os.getenv("DEEPSEEK_API_KEY", "sk-PLACEHOLDER"))
os.environ.setdefault("LLM_PROVIDER", "mock")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_register_and_login():
    username = f"auth_test_user_{uuid.uuid4().hex[:8]}"

    # 注册
    r1 = client.post(
        "/api/auth/register",
        json={"username": username, "password": "123456"},
    )
    assert r1.status_code == 200, r1.text
    data1 = r1.json()
    assert data1["token_type"] == "bearer"
    assert data1["username"] == username
    assert "access_token" in data1

    # 登录
    r2 = client.post(
        "/api/auth/login",
        data={"username": username, "password": "123456"},
    )
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert data2["username"] == username
    assert "access_token" in data2

    # 错误密码
    r3 = client.post(
        "/api/auth/login",
        data={"username": username, "password": "wrong"},
    )
    assert r3.status_code == 401
    print("[OK] 注册/登录测试通过")


if __name__ == "__main__":
    test_register_and_login()
