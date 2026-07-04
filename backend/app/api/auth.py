"""用户认证 API

对应需求/功能：
- 提供智学蜂巢用户注册与登录接口，采用 JWT Token（OAuth2 Password Bearer）机制。
- 注册成功后自动返回 access_token，登录成功后校验密码并签发 token。

主要接口：
- POST /api/auth/register：用户注册，校验用户名密码后创建用户并返回 Token。
- POST /api/auth/login：用户登录，使用 OAuth2PasswordRequestForm 接收表单数据。

主要类：
- RegisterRequest：注册请求体。
- TokenResponse：Token 响应体。

TODO:
- [已完成] 用户注册与密码哈希存储已实现
- [已完成] 用户登录与 JWT Token 签发已实现
- [已完成] 基本参数校验已实现
- [待完成] 增加邮箱/手机验证与验证码机制
- [待完成] 增加密码强度策略与登录失败锁定
- [待完成] 支持 token 刷新与登出黑名单
"""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.services.auth import (
    blacklist_token,
    create_access_token,
    decode_access_token,
    get_current_user,
    get_password_hash,
    is_token_blacklisted,
    oauth2_scheme,
    verify_password,
)
from app.services.database import create_user, get_user

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str


@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest):
    """用户注册"""
    # 基础参数校验
    if not payload.username or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名和密码不能为空",
        )
    if len(payload.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码长度至少 6 位",
        )

    # 检查用户名是否已存在
    existing = get_user(payload.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在",
        )

    # 密码哈希后写入数据库，并签发 24 小时有效期的 JWT
    hashed = get_password_hash(payload.password)
    create_user(payload.username, hashed)

    access_token = create_access_token(
        data={"sub": payload.username},
        expires_delta=timedelta(hours=24),
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        username=payload.username,
    )


@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """用户登录"""
    user = get_user(form_data.username)
    # 校验用户存在且密码正确
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user["username"]},
        expires_delta=timedelta(hours=24),
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        username=user["username"],
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(current_user: str = Depends(get_current_user)):
    """使用有效的 access_token 换取新的 access_token（延长登录态）"""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": current_user},
        expires_delta=timedelta(hours=24),
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        username=current_user,
    )


@router.post("/logout")
async def logout(token: Optional[str] = Depends(oauth2_scheme)):
    """登出：将当前 token 加入黑名单，使其立即失效。

    注意：生产环境应使用 Redis/数据库存储黑名单，当前为内存实现。
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供 Token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if is_token_blacklisted(token):
        return {"success": True, "message": "Token 已登出"}
    blacklist_token(token)
    return {"success": True, "message": "登出成功"}
