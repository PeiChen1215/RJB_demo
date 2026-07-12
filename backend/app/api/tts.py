"""TTS 语音合成接口

POST /api/tts/synthesize  — 文本转语音，返回 MP3 音频
GET  /api/tts/status      — 查询 TTS 服务是否可用
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.spark_tts import get_tts_client

router = APIRouter()


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=800, description="待合成文本（最长 800 字）")
    speed: int = Field(50, ge=0, le=100, description="语速 0-100")


@router.post("/synthesize")
async def synthesize(payload: TTSRequest):
    """文本 → 语音 MP3"""
    client = get_tts_client()

    if not client.available:
        raise HTTPException(status_code=503, detail="TTS 服务未配置，请在 .env 中填写 SPARK_TTS_* 凭证")

    audio = client.synthesize(payload.text.strip(), speed=payload.speed)
    if audio is None:
        raise HTTPException(status_code=500, detail="语音合成失败，请稍后重试")

    return Response(content=audio, media_type="audio/mpeg")


@router.get("/status")
async def tts_status():
    """查询 TTS 服务可用状态"""
    client = get_tts_client()
    return {"tts_available": client.available}
