"""数字人助教问答接口

POST /api/assistant/ask  — 用户提问系统功能，LLM 返回引导回答
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agents.llm import get_llm_provider

router = APIRouter()

SYSTEM_PROMPT = """你是「智学蜂巢 EduHive」的虚拟数字人助教，名字叫小蜂。你的职责是帮助用户了解和使用这个 Python 个性化学习系统。

系统功能模块：
1. 学习画像（profile）— 展示用户的知识水平、认知风格（文字型/视觉型/听觉型/动觉型）、学习节奏、目标导向
2. 知识图谱（graph）— 六边形节点展示Python知识点依赖关系，点击可规划学习路径
3. 学习资源（resources）— 生成个性化讲义/导图/练习，支持文字型（纯文本）、视觉型（B站视频+讲义）、听觉型（数字人TTS朗读）
4. 对话辅导（chat）— 苏格拉底式AI导师一对一问答
5. 代码沙箱（code）— 浏览器内编写运行Python代码，支持判题和变量可视化
6. 学习评估（progress）— BKT掌握度热力图，红色薄弱绿色掌握

回答规则：
- 用友好、热情的语气，像真人助教一样
- 回答简洁，控制在 150 字以内
- 如果用户问的功能你不太确定，引导他们去具体页面尝试
- 可以建议用户切换认知风格来获得不同的学习体验
"""


class AskRequest(BaseModel):
    question: str = Field(..., description="用户提问内容")


class AskResponse(BaseModel):
    answer: str = Field(..., description="助教回答")


@router.post("/ask", response_model=AskResponse)
async def ask_assistant(payload: AskRequest):
    llm = get_llm_provider()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": payload.question},
    ]
    answer = llm.chat(messages, temperature=0.7, max_tokens=300)
    return AskResponse(answer=answer.strip())
