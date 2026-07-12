"""讯飞在线语音合成客户端

使用 REST API (api.xfyun.cn/v1/service/v1/tts)
鉴权：X-Appid + X-CurTime + X-Param + X-CheckSum(MD5)
"""
import base64
import hashlib
import json
import time
from typing import Optional

import requests

from app.core.config import get_settings


class SparkTTSClient:
    """讯飞 TTS — REST API"""

    DEFAULT_VCN = "xiaoyan"

    def __init__(self):
        s = get_settings()
        self.app_id = s.SPARK_TTS_APP_ID
        self.api_key = s.SPARK_TTS_API_KEY
        self.api_secret = s.SPARK_TTS_API_SECRET  # 未使用，保留兼容

    @property
    def available(self) -> bool:
        return bool(self.app_id and self.api_key)

    def synthesize(self, text: str, vcn: str = DEFAULT_VCN, speed: int = 50) -> Optional[bytes]:
        if not self.available or not text.strip():
            return None

        param = {
            "auf": "audio/L16;rate=16000",
            "aue": "lame",
            "voice_name": vcn,
            "speed": str(speed),
            "volume": "50",
            "pitch": "50",
            "engine_type": "intp65",
            "text_type": "text",
        }
        x_param = base64.b64encode(json.dumps(param).encode()).decode()
        cur_time = str(int(time.time()))
        x_checksum = hashlib.md5((self.api_key + cur_time + x_param).encode()).hexdigest()

        try:
            r = requests.post(
                "https://api.xfyun.cn/v1/service/v1/tts",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                    "X-Appid": self.app_id,
                    "X-CurTime": cur_time,
                    "X-Param": x_param,
                    "X-CheckSum": x_checksum,
                },
                data=text.encode("utf-8"),
                timeout=30,
            )
            if r.status_code != 200:
                print(f"[SparkTTS] HTTP {r.status_code}: {r.text[:200]}")
                return None
            ct = r.headers.get("Content-Type", "")
            if "audio" in ct and len(r.content) > 500:
                return r.content
            if r.content and r.content[0:1] == b"{" and len(r.content) < 500:
                try:
                    err = r.json()
                    print(f"[SparkTTS] error: {err}")
                except Exception:
                    pass
                return None
            if len(r.content) > 500:
                return r.content
            print(f"[SparkTTS] unexpected ({len(r.content)}B): {r.text[:200]}")
            return None
        except Exception as e:
            print(f"[SparkTTS] failed: {e}")
            return None


_tts_client: Optional[SparkTTSClient] = None


def get_tts_client() -> SparkTTSClient:
    global _tts_client
    if _tts_client is None:
        _tts_client = SparkTTSClient()
    return _tts_client
