"""应用配置

对应需求：
- 集中管理智学蜂巢后端的所有环境变量与运行时配置。
- 通过 pydantic-settings 从 .env 文件加载，并提供类型安全访问。

主要类/函数/接口：
- Settings：应用配置模型，覆盖 LLM、图存储、数据库、缓存、安全、CORS 等。
  - DeepSeek / 讯飞星火 API 配置。
  - LLM_PROVIDER：模型提供者选择（deepseek / spark / mock / auto）。
  - GRAPH_BACKEND：图存储后端选择（auto / neo4j / memory）。
  - Neo4j / SQLite 配置。
  - SECRET_KEY / DEBUG / CORS_ORIGINS 等应用级配置。
  - cors_origin_list：将 CORS_ORIGINS 字符串解析为列表。
- get_settings：带 lru_cache 的配置获取函数，避免重复解析 .env。

TODO:
- [已完成] 基于 pydantic-settings 的 .env 加载与配置项定义。
- [已完成] LLM 提供者、图后端、数据库、缓存等核心配置项。
- [待完成] 生产环境需更换 SECRET_KEY 与强密码，禁止使用默认弱密钥。
- [待完成] 补充讯飞 API 额度监控告警配置。
- [待完成] 增加日志级别、请求限流、超时熔断等运行时配置项。
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # DeepSeek 配置
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"

    # LLM 提供者：deepseek / spark / mock / auto
    LLM_PROVIDER: str = "auto"

    # 讯飞星火配置
    SPARK_APP_ID: str = ""
    SPARK_API_KEY: str = ""
    SPARK_API_SECRET: str = ""
    SPARK_API_URL: str = "wss://spark-api.xf-yun.com/v4.0/chat"
    SPARK_DOMAIN: str = "4.0"

    # TTS 配置
    SPARK_TTS_APP_ID: str = ""
    SPARK_TTS_API_KEY: str = ""
    SPARK_TTS_API_SECRET: str = ""

    # 图存储后端: auto / neo4j / memory
    GRAPH_BACKEND: str = "auto"

    # Neo4j 配置
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "eduhive123"

    # SQLite 配置
    DATABASE_URL: str = "sqlite:///./eduhive.db"

    # 资源缓存 TTL（小时）
    RESOURCE_CACHE_TTL_HOURS: int = 168

    # 应用配置
    SECRET_KEY: str = "eduhive-secret-key-change-in-production"
    DEBUG: bool = True
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
