/**
 * 需求：认知风格差异化渲染组件（C5）。
 * 功能：
 *   - 文字型：标准 Markdown 讲义 + 思维导图；
 *   - 视觉型：嵌入讲解视频，适合通过观看学习的学生；
 *   - 听觉型：浏览器 TTS 朗读 + 音频文本展示。
 *
 * TODO:
 * - [已完成] 三种认知风格切换与渲染
 * - [已完成] 浏览器 TTS 朗读支持
 * - [已完成] 视觉型讲解视频播放
 * - [待完成] 接入讯飞 TTS 替代浏览器 TTS
 */
import { useEffect, useState } from 'react'
import { Eye, Ear, FileText, Volume2, VolumeX, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CognitiveStyle = 'readwrite' | 'visual' | 'auditory'

interface Props {
  currentStyle?: CognitiveStyle
  onStyleChange?: (style: CognitiveStyle) => void
  audioText?: string
  concept?: string
  children: React.ReactNode
}

const STYLES: { key: CognitiveStyle; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'readwrite', label: '文字型', icon: FileText, desc: '讲义 + 导图' },
  { key: 'visual', label: '视觉型', icon: Eye, desc: '视频 + 图文' },
  { key: 'auditory', label: '听觉型', icon: Ear, desc: '朗读 + 讲解' },
]

export function CognitiveStyleToggle({
  currentStyle = 'readwrite',
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

// 知识点 → B站视频 BV号 映射
const CONCEPT_VIDEO_MAP: Record<string, { bvid: string; title: string }> = {
  '变量与赋值': { bvid: 'BV17F4m1F77E', title: '变量和赋值详解' },
  '基本数据类型': { bvid: 'BV1hnwaeiE5D', title: '变量与数据类型' },
  '条件判断': { bvid: 'BV17341197Wp', title: 'if 多条件判断' },
  '循环结构': { bvid: 'BV17341197Wp', title: 'while / for 循环' },
  'Python简介': { bvid: 'BV1kW411M77N', title: 'Python语言程序设计（嵩天）' },
}
const DEFAULT_VIDEO = { bvid: 'BV1kW411M77N', title: '北京理工大学 嵩天《Python语言程序设计》' }

function VisualVideoPanel({ concept }: { concept?: string }) {
  const [loadVideo, setLoadVideo] = useState(false)
  const video = (concept && CONCEPT_VIDEO_MAP[concept]) || DEFAULT_VIDEO

  useEffect(() => {
    // 延迟加载 B站播放器，避免首屏卡顿
    const timer = setTimeout(() => setLoadVideo(true), 300)
    return () => clearTimeout(timer)
  }, [concept])

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-blue-100 bg-white/80 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-blue-50 px-4 py-3">
        <Play className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-bold text-slate-800">
          {concept ? `「${concept}」讲解视频` : '知识点讲解视频'}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">视觉型 · B站</span>
      </div>
      <div className="aspect-video bg-black flex items-center justify-center">
        {loadVideo ? (
          <iframe
            src={`//player.bilibili.com/player.html?bvid=${video.bvid}&page=1&high_quality=1&autoplay=0`}
            scrolling="no"
            frameBorder="no"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <button
            onClick={() => setLoadVideo(true)}
            className="flex flex-col items-center gap-2 text-white/60 hover:text-white transition"
          >
            <Play className="h-12 w-12 rounded-full bg-white/10 p-2" />
            <span className="text-xs">{video.title}</span>
          </button>
        )}
      </div>
      <div className="px-4 py-2 text-[11px] text-slate-500 bg-blue-50/50">
        {video.title}
      </div>
    </div>
  )
}

export function CognitiveStylePanel({
  currentStyle = 'readwrite',
  onStyleChange,
  audioText,
  concept,
  children,
}: Props) {
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    const synth = window.speechSynthesis
    return () => {
      synth?.cancel()
    }
  }, [])

  const toggleSpeak = () => {
    const synth = window.speechSynthesis
    if (!synth) return
    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    const text = audioText || (typeof children === 'string' ? children : '')
    if (!text) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    utter.rate = 0.9
    utter.onend = () => setSpeaking(false)
    synth.speak(utter)
    setSpeaking(true)
  }

  return (
    <div
      className={cn(
        'relative rounded-2xl transition-colors',
        currentStyle === 'visual' && 'border border-blue-100 bg-blue-50/20',
        currentStyle === 'auditory' && 'border border-amber-100 bg-amber-50/30'
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CognitiveStyleToggle currentStyle={currentStyle} onStyleChange={onStyleChange} />
        {currentStyle === 'auditory' && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 rounded-lg text-xs"
            onClick={toggleSpeak}
          >
            {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {speaking ? '停止朗读' : '朗读讲解'}
          </Button>
        )}
      </div>

      {currentStyle === 'visual' && (
        <VisualVideoPanel concept={concept} />
      )}

      {currentStyle === 'auditory' && audioText && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-white/70 p-4 text-sm leading-relaxed text-slate-700 backdrop-blur-sm">
          <span className="mb-1 block text-xs font-bold text-amber-700">音频版讲解稿</span>
          {audioText}
        </div>
      )}

      {currentStyle === 'readwrite' && (
        <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] font-medium text-slate-500">
          📖 文字型学习模式：适合通过阅读和笔记学习，下方为完整讲义内容。
        </div>
      )}

      <div
        className={cn(
          'transition-opacity',
          currentStyle === 'auditory' ? 'opacity-90' : 'opacity-100'
        )}
      >
        {children}
      </div>
    </div>
  )
}
