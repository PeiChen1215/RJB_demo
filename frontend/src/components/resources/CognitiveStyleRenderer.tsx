/**
 * 需求：认知风格差异化渲染组件（C5）。
 * 功能：
 *   - 根据文字型 / 视觉型 / 听觉型三种认知风格切换资源呈现方式；
 *   - 📖 文字型：纯讲义 Markdown 文本，干净无干扰；
 *   - 👁 视觉型：讲义上方嵌入 B站讲解视频，视频下方保留讲义文本；
 *   - 👂 听觉型：展示讲解稿 + 朗读按钮，使用浏览器 TTS 语音合成朗读；
 *   - 保留动觉型兼容（代码实操导向）。
 *
 * TODO:
 * - [已完成] 风格切换器与三种渲染模式
 * - [已完成] 浏览器 TTS 朗读支持（含语速/暂停/恢复）
 * - [已完成] 视觉型 B站视频嵌入播放器
 * - [待完成] 视频随知识点自动切换（目前先用变量与赋值一个知识点）
 * - [待完成] 与后端画像 cognitive_modality 自动联动
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Ear, FileText, Hand, Pause, Play, Volume2, VolumeX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CognitiveStyle = 'text' | 'visual' | 'auditory' | 'kinesthetic'

interface Props {
  currentStyle?: CognitiveStyle
  onStyleChange?: (style: CognitiveStyle) => void
  audioText?: string
  concept?: string
  children: React.ReactNode
}

// ─── 知识点 → B站视频映射 ───
const CONCEPT_VIDEOS: Record<string, { bvid: string; title: string; page?: number }> = {
  '变量与赋值': { bvid: 'BV1dGmMBAE6h', title: '变量与赋值·动画讲解（零基础）', page: 2 },
  '变量': { bvid: 'BV1dGmMBAE6h', title: '变量与赋值·动画讲解（零基础）', page: 2 },
}
const DEFAULT_VIDEO = { bvid: 'BV13UAwefEZS', title: 'Python 变量入门·新手小白课', page: 1 }

function resolveVideo(concept?: string) {
  if (concept && CONCEPT_VIDEOS[concept]) return CONCEPT_VIDEOS[concept]
  return DEFAULT_VIDEO
}

// ─── 风格切换按钮组 ───
const STYLES: { key: CognitiveStyle; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'text', label: '文字型', icon: FileText, desc: '纯讲义文本' },
  { key: 'visual', label: '视觉型', icon: Eye, desc: '视频 + 讲义' },
  { key: 'auditory', label: '听觉型', icon: Ear, desc: '朗读讲解' },
  { key: 'kinesthetic', label: '动觉型', icon: Hand, desc: '动手 + 代码' },
]

export function CognitiveStyleToggle({
  currentStyle = 'text',
  onStyleChange,
}: {
  currentStyle?: CognitiveStyle
  onStyleChange?: (style: CognitiveStyle) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur-sm">
      {STYLES.map((s) => {
        const Icon = s.icon
        const active = currentStyle === s.key
        return (
          <button
            key={s.key}
            onClick={() => onStyleChange?.(s.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
              active
                ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md'
                : 'text-slate-500 hover:bg-white hover:text-slate-800'
            )}
            title={s.desc}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── 视觉型：B站视频播放器 ───
export function BilibiliVideoPlayer({ concept }: { concept?: string }) {
  const video = resolveVideo(concept)
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/40 to-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-blue-100 px-4 py-2.5">
        <span className="text-lg">🎬</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-blue-800">{video.title}</p>
          <p className="text-[10px] text-slate-400">来源：Bilibili · {concept || 'Python 入门'}</p>
        </div>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600">讲解视频</span>
      </div>
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={`https://player.bilibili.com/player.html?bvid=${video.bvid}&page=${video.page || 1}&high_quality=1&autoplay=0`}
          scrolling="no"
          frameBorder="no"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
          title={video.title}
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        />
      </div>
      <div className="flex items-center gap-1.5 border-t border-blue-50 px-4 py-2">
        <span className="text-[10px] text-slate-400">💡 看完视频后，下方还有讲义文本可供复习</span>
      </div>
    </div>
  )
}

// ─── 听觉型：增强 TTS 朗读器 ───
export function TTSReader({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState(1)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    const synth = window.speechSynthesis
    return () => { synth?.cancel() }
  }, [])

  const stop = useCallback(() => {
    const synth = window.speechSynthesis
    synth?.cancel()
    setSpeaking(false)
    setPaused(false)
    utteranceRef.current = null
  }, [])

  const speak = useCallback(() => {
    const synth = window.speechSynthesis
    if (!synth) return
    if (paused) { synth.resume(); setPaused(false); setSpeaking(true); return }
    synth.cancel()
    if (!text) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'; utter.rate = rate; utter.pitch = 1; utter.volume = 1
    const voices = synth.getVoices()
    const zhVoice = voices.find((v) => v.lang.startsWith('zh'))
    if (zhVoice) utter.voice = zhVoice
    utter.onend = () => { setSpeaking(false); setPaused(false); utteranceRef.current = null }
    utter.onerror = () => { setSpeaking(false); setPaused(false); utteranceRef.current = null }
    utteranceRef.current = utter
    synth.speak(utter)
    setSpeaking(true); setPaused(false)
  }, [text, paused, rate])

  const pause = useCallback(() => {
    const synth = window.speechSynthesis
    if (synth && speaking) { synth.pause(); setPaused(true); setSpeaking(false) }
  }, [speaking])

  if (!text) {
    return <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/50 p-4 text-center text-xs text-slate-400">当前资源暂无讲解稿，请先生成资源或切换到其他知识点。</div>
  }

  return (
    <div className="mb-4 rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/50 to-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className={cn('h-8 gap-1.5 rounded-lg text-xs font-bold transition-all', speaking ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100')} onClick={speaking ? stop : speak}>
          {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {speaking ? '停止朗读' : paused ? '继续朗读' : '🔊 朗读讲解'}
        </Button>
        {speaking && <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg text-xs text-slate-500 hover:bg-amber-50 hover:text-amber-700" onClick={pause}><Pause className="h-3.5 w-3.5" />暂停</Button>}
        {paused && <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg text-xs text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" onClick={speak}><Play className="h-3.5 w-3.5" />继续</Button>}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
          {[0.5, 1, 2].map((r) => (
            <button key={r} onClick={() => { setRate(r); if (speaking) { const s = window.speechSynthesis; s?.cancel(); setSpeaking(false); setTimeout(() => { const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = r; u.pitch = 1; u.volume = 1; const v = s.getVoices(); const zv = v.find((x) => x.lang.startsWith('zh')); if (zv) u.voice = zv; u.onend = () => { setSpeaking(false); setPaused(false) }; s.speak(u); setSpeaking(true) }, 50) } }} className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all', rate === r ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>{r}x</button>
          ))}
        </div>
      </div>
      {speaking && <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><span className="flex h-2 w-2"><span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>正在朗读中 · 语速 {rate}x · <span className="text-emerald-500">可直接阅读下方讲稿跟读</span></div>}
      {paused && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">⏸ 已暂停 · 点击「继续」恢复朗读</div>}
      <div className="rounded-xl border border-amber-100 bg-white/80 p-4">
        <p className="mb-2 text-xs font-bold text-amber-700">📝 讲解稿</p>
        <div className="max-h-64 overflow-y-auto text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  )
}

// ─── 认知风格面板 ───
export function CognitiveStylePanel({
  currentStyle = 'text',
  onStyleChange,
  audioText,
  concept,
  children,
}: Props) {
  return (
    <div className={cn('relative rounded-2xl transition-colors',
      currentStyle === 'visual' && 'border border-blue-100 bg-blue-50/20',
      currentStyle === 'auditory' && 'border border-amber-100 bg-amber-50/20',
      currentStyle === 'kinesthetic' && 'border border-emerald-100 bg-emerald-50/20'
    )}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CognitiveStyleToggle currentStyle={currentStyle} onStyleChange={onStyleChange} />
      </div>
      {currentStyle === 'visual' && <BilibiliVideoPlayer concept={concept} />}
      {currentStyle === 'auditory' && <TTSReader text={audioText || ''} />}
      {currentStyle === 'kinesthetic' && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-semibold text-emerald-800">
          💡 动觉学习模式：建议先阅读代码案例，然后自己动手修改并运行，最后再回看讲解。
        </div>
      )}
      <div className={cn('transition-opacity', currentStyle === 'auditory' ? 'opacity-90' : 'opacity-100')}>
        {children}
      </div>
    </div>
  )
}
