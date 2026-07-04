"""认证与授权服务（AuthN / AuthZ）

对应需求：
- 为智学蜂巢提供用户登录鉴权能力，包括密码安全校验与会话 token 管理。
- 为 FastAPI 路由提供可复用的可选/强制登录依赖。

主要类/函数/接口：
- verify_password / get_password_hash：基于 bcrypt 的密码校验与哈希生成。
- create_access_token / decode_access_token：JWT 的生成与解析（HS256）。
- get_current_user：可选登录依赖，返回当前 username，未登录返回 None。
- require_user：强制登录依赖，token 缺失/过期/无效时抛出 401。

TODO:
- [已完成] 密码哈希与校验（bcrypt）。
- [已完成] JWT 生成、解析与 FastAPI 依赖注入（python-jose）。
- [待完成] 接入 refresh token 机制，降低长期 access token 泄露风险。
- [待完成] 增加 token 黑名单/登出功能，支持服务端失效会话。
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import get_settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# 内存级 Token 黑名单（生产环境应替换为 Redis/数据库）
_blacklisted_tokens: set[str] = set()


def blacklist_token(token: str) -> None:
    """将 token 加入黑名单"""
    _blacklisted_tokens.add(token)


def is_token_blacklisted(token: str) -> bool:
    """判断 token 是否已被拉黑"""
    return token in _blacklisted_tokens


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    settings = get_settings()
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[str]:
    """获取当前用户 username

    当接口需要登录时，使用 `get_current_user` 并判断返回值是否为 None。
    """
    if token is None:
        return None
    if is_token_blacklisted(token):
        return None
    payload = decode_access_token(token)
    if payload is None:
        return None
    username: Optional[str] = payload.get("sub")
    return username


async def require_user(token: Optional[str] = Depends(oauth2_scheme)) -> str:
    """强制要求登录的依赖"""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 已登出",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期或 token 无效",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username: Optional[str] = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效",
        )
    return username
