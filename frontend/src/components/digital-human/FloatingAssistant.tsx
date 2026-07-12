/**
 * 全局浮动数字人助教
 * - 始终浮在右下角，可拖动，所有页面可见
 * - 收起：圆形头像 + 呼吸动画
 * - 展开：引导面板 + 对话问答 + TTS 朗读 + 语音输入
 * - 表情系统：根据 AI 回答内容自动切换开心/思考/疑惑/鼓励
 * - 全屏模式：点击放大到屏幕中央沉浸式交互
 * - 定时提醒：每 30 分钟弹出休息提示
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Expand, Loader2, Maximize2, Mic, MicOff, Minimize2, Send, Volume2, VolumeX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { assistantApi } from '@/services/api'
import { useSparkTTS } from '@/components/digital-human/useSparkTTS'
import { useSpeechRecognition } from '@/components/digital-human/useSpeechRecognition'
import type { NavKey } from '@/components/command-center/types'

interface Props { activeNav: NavKey; selectedConcept: string }
interface ChatMsg { role: 'user' | 'assistant'; text: string }

type Expression = 'idle' | 'happy' | 'thinking' | 'confused' | 'encourage'

const GUIDANCE: Record<NavKey, { title: string; text: string }> = {
  profile: { title: '学习画像', text: '这里展示你的专属学习画像，包括知识水平、认知风格、学习节奏和目标导向。' },
  graph: { title: '知识图谱', text: '这是Python知识图谱，每个六边形节点代表一个知识点。节点之间的连线代表前置依赖关系。' },
  resources: { title: '学习资源', text: '在这里你可以生成和查看个性化学习资源。支持文字型、视觉型、听觉型三种模式。' },
  chat: { title: '对话辅导', text: '这是苏格拉底式对话区，你可以随时向AI导师提问。' },
  code: { title: '代码沙箱', text: '代码沙箱让你可以直接在浏览器里编写和运行Python代码。' },
  progress: { title: '学习评估', text: '掌握度热力图直观展示你对各个知识点的掌握情况。颜色越绿表示掌握越好。' },
}

/** 根据文本内容检测表情 */
function detectExpression(text: string): Expression {
  const t = text.toLowerCase()
  if (/恭喜|正确|通过|很好|太棒|厉害|优秀|完美|不错/.test(t)) return 'happy'
  if (/思考|分析|等等|让我想|考虑/.test(t)) return 'thinking'
  if (/抱歉|不确定|不清楚|无法|可惜|遗憾|暂时/.test(t)) return 'confused'
  if (/加油|试试|练习|努力|坚持|相信|你能|别担心/.test(t)) return 'encourage'
  return 'idle'
}

/** 表情对应的 SVG 嘴部路径 */
const MOUTH_PATHS: Record<Expression, { d: string; eyeR?: number }> = {
  idle: { d: 'M28 30 Q32 34 36 30' },
  happy: { d: 'M26 28 Q32 36 38 28' },
  thinking: { d: 'M30 31 L34 31', eyeR: 1.2 },
  confused: { d: 'M29 32 Q32 29 35 32' },
  encourage: { d: 'M27 31 Q32 35 37 28' },
}

/** 气泡提示池 */
const TIPS = [
  '💡 试试点击麦克风用语音提问',
  '📖 切换到视觉型可以看B站教学视频',
  '👂 切换到听觉型让数字人为你朗读',
  '🗺️ 在知识图谱里点击节点规划学习路径',
  '💻 把练习题代码发送到沙箱调试',
  '📊 看看掌握度热力图找到薄弱知识点',
]

export function FloatingAssistant({ activeNav, selectedConcept }: Props) {
  const { speaking, speak: ttsSpeak, stop: ttsStop } = useSparkTTS()
  const { listening, supported: micSupported, start: startListen, stop: stopListen } = useSpeechRecognition('zh-CN')
  const [expanded, setExpanded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [dragged, setDragged] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // 表情
  const lastAssistantMsg = [...chatMessages].reverse().find((m) => m.role === 'assistant')
  const expression = lastAssistantMsg ? detectExpression(lastAssistantMsg.text) : 'idle'

  // 定时提醒
  const [sessionMinutes, setSessionMinutes] = useState(0)
  const [showReminder, setShowReminder] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setSessionMinutes((m) => m + 1), 60000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (sessionMinutes > 0 && sessionMinutes % 30 === 0) setShowReminder(true)
  }, [sessionMinutes])

  // 气泡提示
  const [tipIndex, setTipIndex] = useState(0)
  const [showTip, setShowTip] = useState(false)
  useEffect(() => {
    const t = setInterval(() => {
      if (!expanded) { setShowTip(true); setTipIndex((i) => (i + 1) % TIPS.length) }
      setTimeout(() => setShowTip(false), 5000)
    }, 60000)
    return () => clearInterval(t)
  }, [expanded])

  const guidance = GUIDANCE[activeNav] || GUIDANCE.resources
  const guidanceText = `你现在在${guidance.title}页面。${guidance.text}`

  useEffect(() => {
    const t = setTimeout(() => { if (!hasInteracted) { setExpanded(true); setHasInteracted(true) } }, 3000)
    return () => clearTimeout(t)
  }, [hasInteracted])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const handleSpeak = useCallback((text: string) => {
    if (speaking) { ttsStop(); return }
    ttsSpeak(text, 50)
  }, [speaking, ttsSpeak, ttsStop])

  const handleVoiceResult = useCallback((voiceText: string) => {
    setInput(voiceText)
    setTimeout(async () => {
      setChatMessages((prev) => [...prev, { role: 'user', text: voiceText }]); setLoading(true)
      try {
        const res = await assistantApi.ask(voiceText)
        const answer = res.data?.answer || '抱歉，我暂时无法回答这个问题。'
        setChatMessages((prev) => [...prev, { role: 'assistant', text: answer }])
        ttsSpeak(answer, 50)
      } catch { setChatMessages((prev) => [...prev, { role: 'assistant', text: '抱歉，助教服务暂时不可用。' }]) }
      finally { setLoading(false) }
    }, 100)
  }, [ttsSpeak])

  const toggleMic = () => { if (listening) { stopListen(); return }; startListen(handleVoiceResult) }

  const sendQuestion = async () => {
    const q = input.trim(); if (!q || loading) return
    setInput(''); setChatMessages((prev) => [...prev, { role: 'user', text: q }]); setLoading(true)
    try {
      const res = await assistantApi.ask(q)
      const answer = res.data?.answer || '抱歉，我暂时无法回答这个问题。'
      setChatMessages((prev) => [...prev, { role: 'assistant', text: answer }])
    } catch { setChatMessages((prev) => [...prev, { role: 'assistant', text: '抱歉，助教服务暂时不可用。' }]) }
    finally { setLoading(false) }
  }

  const handlePointerDown = (e: React.PointerEvent) => { dragStartRef.current = { x: e.clientX, y: e.clientY }; setDragged(false) }
  const handlePointerUp = (e: React.PointerEvent) => {
    if (Math.abs(e.clientX - dragStartRef.current.x) < 4 && Math.abs(e.clientY - dragStartRef.current.y) < 4 && !dragged) {
      if (speaking) ttsStop()
      setExpanded((v) => !v)
    }
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (Math.abs(e.clientX - dragStartRef.current.x) > 3 || Math.abs(e.clientY - dragStartRef.current.y) > 3) setDragged(true)
  }

  const eyeR = MOUTH_PATHS[expression].eyeR || 1.8

  const panelContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 20 }}
      className={cn('rounded-2xl border border-amber-200/60 bg-white/95 shadow-2xl shadow-amber-500/10 backdrop-blur-md overflow-hidden flex flex-col',
        fullscreen ? 'w-[420px] h-[600px]' : 'w-80')}
      onPointerDown={(e) => e.stopPropagation()}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 border-b border-amber-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">{expression === 'happy' ? '😊' : expression === 'thinking' ? '🤔' : expression === 'confused' ? '😅' : expression === 'encourage' ? '💪' : '👩‍🏫'}</span>
          <div>
            <p className="text-xs font-bold text-amber-800">小蜂 · 数字人助教</p>
            <p className="text-[10px] text-amber-600">
              {expression === 'happy' ? '为你开心！' : expression === 'thinking' ? '正在思考...' : expression === 'confused' ? '嗯...' : expression === 'encourage' ? '加油！' : '有什么可以帮你的？'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setFullscreen((v) => !v)}
            className="rounded-lg p-1 text-amber-400 hover:bg-amber-100 hover:text-amber-600 transition-colors"
            title={fullscreen ? '退出全屏' : '全屏'}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={() => { setExpanded(false); setFullscreen(false) }}
            className="rounded-lg p-1 text-amber-400 hover:bg-amber-100 hover:text-amber-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 表情头像（全屏模式显示大号） */}
      {fullscreen && (
        <div className="flex justify-center py-4 shrink-0 bg-gradient-to-b from-amber-50/50 to-white">
          <motion.div className="relative flex h-28 w-28 items-center justify-center rounded-full"
            style={{ background: 'radial-gradient(circle at 40% 35%, #fef3c7 0%, #fde68a 40%, #fbbf24 100%)' }}
            animate={speaking ? { scale: [1, 1.06, 0.98, 1.04, 1], boxShadow: ['0 0 20px rgba(251,191,36,0.3)', '0 0 50px rgba(251,191,36,0.6)', '0 0 30px rgba(251,191,36,0.4)', '0 0 55px rgba(251,191,36,0.5)', '0 0 20px rgba(251,191,36,0.3)'] } : { scale: [1, 1.02, 1], boxShadow: '0 0 15px rgba(251,191,36,0.15)' }}
            transition={speaking ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
            <motion.div className="absolute rounded-full" style={{ width: 120, height: 120, border: '3px solid transparent', borderTopColor: 'rgba(251,191,36,0.5)', borderRightColor: 'rgba(245,158,11,0.3)' }}
              animate={{ rotate: 360 }} transition={{ duration: speaking ? 2 : 10, repeat: Infinity, ease: 'linear' }} />
            <svg viewBox="0 0 64 64" className="w-[72px] h-[72px] relative z-10" fill="none">
              <circle cx="32" cy="24" r="12" fill="#fef7ed" stroke="#d4a853" strokeWidth="1.2" />
              <path d="M20 24 Q20 12 32 12 Q44 12 44 24" fill="#5c4033" />
              <rect x="27" y="21" width="4" height="3" rx="1" fill="none" stroke="#4a3728" strokeWidth="0.8" />
              <rect x="33" y="21" width="4" height="3" rx="1" fill="none" stroke="#4a3728" strokeWidth="0.8" />
              <line x1="31" y1="22.5" x2="33" y2="22.5" stroke="#4a3728" strokeWidth="0.6" />
              <circle cx="29" cy="22.5" r={eyeR} fill="#1e293b" />
              <circle cx="37" cy="22.5" r={eyeR} fill="#1e293b" />
              <motion.path d={MOUTH_PATHS[expression].d} stroke="#c2410c" strokeWidth="1" fill="none" strokeLinecap="round"
                animate={{ d: MOUTH_PATHS[expression].d }} transition={{ duration: 0.3 }} />
              <path d="M24 40 L24 54 Q24 60 32 60 Q40 60 40 54 L40 40" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1" />
              <path d="M30 40 L32 46 L34 40" fill="#4f46e5" />
            </svg>
          </motion.div>
        </div>
      )}

      {/* 对话区 */}
      <div className={cn('overflow-y-auto px-4 py-3 space-y-3', fullscreen ? 'flex-1' : 'max-h-48')}>
        {chatMessages.length === 0 && (
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-xs leading-relaxed text-amber-800">{guidance.text}</p>
            <p className="mt-2 text-[10px] text-amber-500">当前页面：{guidance.title}</p>
            <button onClick={() => handleSpeak(guidanceText)}
              className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold bg-amber-200 text-amber-700 hover:bg-amber-300 transition-colors">
              <Volume2 className="h-3 w-3" />听引导语音
            </button>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
              msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-700')}>
              {msg.text}
              {msg.role === 'assistant' && (
                <button onClick={() => handleSpeak(msg.text)} className="ml-2 inline-flex align-middle text-amber-500 hover:text-amber-700">
                  {speaking ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-400 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />小蜂正在思考...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 定时提醒 */}
      {showReminder && (
        <div className="mx-4 mb-2 rounded-xl bg-amber-100 p-3 flex items-start gap-2">
          <span className="text-lg">⏰</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">学习提醒</p>
            <p className="text-[11px] text-amber-700">你已经学习 {sessionMinutes} 分钟了，休息一下眼睛吧！起来走走或者看看远处~</p>
          </div>
          <button onClick={() => setShowReminder(false)} className="text-amber-400 hover:text-amber-600"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* 输入区 */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 shrink-0">
        {listening ? (
          <div className="flex-1 flex items-center gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs text-red-600 font-medium">正在聆听...</span>
          </div>
        ) : (
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendQuestion()}
            placeholder={micSupported ? '打字或点麦克风说话...' : '问小蜂任何问题...'}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-amber-300 transition-colors" />
        )}
        {micSupported && (
          <button onClick={toggleMic}
            className={cn('rounded-lg p-1.5 text-white transition-all', listening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-indigo-400 hover:bg-indigo-500')}>
            {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>
        )}
        <button onClick={sendQuestion} disabled={loading || !input.trim()}
          className="rounded-lg bg-amber-500 p-1.5 text-white hover:bg-amber-600 disabled:opacity-40 transition-all">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 快捷提问 */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-3 shrink-0">
        {['怎么切换学习风格？', '代码沙箱怎么用？', '如何查看掌握度？'].map((q) => (
          <button key={q} onClick={() => { setInput(q); setTimeout(sendQuestion, 50) }}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:border-amber-300 hover:text-amber-700 transition-colors">{q}</button>
        ))}
      </div>
    </motion.div>
  )

  return (
    <>
      {/* 全屏遮罩 */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setFullscreen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="pointer-events-auto">
              {panelContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 正常浮动模式 */}
      {!fullscreen && (
        <motion.div drag dragMomentum={false} dragElastic={0}
          onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerMove={handlePointerMove}
          className="fixed right-5 bottom-5 z-[9997] flex flex-col items-end gap-2" style={{ touchAction: 'none' }}>
          {/* 气泡提示 */}
          <AnimatePresence>
            {showTip && !expanded && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="bg-white/95 backdrop-blur-sm rounded-2xl border border-amber-200/60 shadow-lg px-4 py-2.5 max-w-[220px]"
                onPointerDown={(e) => e.stopPropagation()}>
                <p className="text-[11px] leading-relaxed text-slate-600">{TIPS[tipIndex]}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 展开面板 */}
          <AnimatePresence>
            {expanded && (
              <div className="pointer-events-auto">{panelContent}</div>
            )}
          </AnimatePresence>

          {/* 浮动头像 */}
          <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-full shadow-xl border-2 cursor-grab active:cursor-grabbing',
            speaking ? 'border-emerald-400 shadow-emerald-400/30' : 'border-amber-300/60 shadow-amber-500/20')}
            style={{ background: 'radial-gradient(circle at 40% 35%, #fef3c7 0%, #fde68a 40%, #fbbf24 100%)' }}>
            <motion.div className="absolute inset-0 flex items-center justify-center rounded-full pointer-events-none"
              animate={speaking ? { scale: [1, 1.08, 0.96, 1.05, 1], boxShadow: ['0 0 20px rgba(251,191,36,0.3)', '0 0 40px rgba(16,185,129,0.5)', '0 0 25px rgba(251,191,36,0.4)', '0 0 45px rgba(16,185,129,0.4)', '0 0 20px rgba(251,191,36,0.3)'] } : { scale: [1, 1.03, 1], boxShadow: '0 0 18px rgba(251,191,36,0.2)' }}
              transition={speaking ? { duration: 1, repeat: Infinity } : { duration: 3, repeat: Infinity }} />
            <motion.div className="absolute inset-0 rounded-full pointer-events-none"
              style={{ border: '2px solid transparent', borderTopColor: 'rgba(251,191,36,0.4)', borderRightColor: 'rgba(245,158,11,0.25)' }}
              animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} />
            <svg viewBox="0 0 64 64" className="w-9 h-9 relative z-10 pointer-events-none" fill="none">
              <circle cx="32" cy="24" r="12" fill="#fef7ed" stroke="#d4a853" strokeWidth="1.2" />
              <path d="M20 24 Q20 12 32 12 Q44 12 44 24" fill="#5c4033" />
              <rect x="27" y="21" width="4" height="3" rx="1" fill="none" stroke="#4a3728" strokeWidth="0.8" />
              <rect x="33" y="21" width="4" height="3" rx="1" fill="none" stroke="#4a3728" strokeWidth="0.8" />
              <line x1="31" y1="22.5" x2="33" y2="22.5" stroke="#4a3728" strokeWidth="0.6" />
              <circle cx="29" cy="22.5" r={eyeR} fill="#1e293b" />
              <circle cx="37" cy="22.5" r={eyeR} fill="#1e293b" />
              <motion.path d={MOUTH_PATHS[expression].d} stroke="#c2410c" strokeWidth="1" fill="none" strokeLinecap="round"
                animate={{ d: MOUTH_PATHS[expression].d }} transition={{ duration: 0.3 }} />
              <path d="M24 40 L24 54 Q24 60 32 60 Q40 60 40 54 L40 40" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1" />
              <path d="M30 40 L32 46 L34 40" fill="#4f46e5" />
            </svg>
          </div>

          {!expanded && <span className="text-[10px] text-slate-400 bg-white/80 px-2 py-0.5 rounded-full shadow-sm pointer-events-none select-none">按住拖动 · 点我提问</span>}
        </motion.div>
      )}
    </>
  )
}
