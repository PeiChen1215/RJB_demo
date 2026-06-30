/**
 * C9 — 可解释思维路径回放
 *
 * 展示多智能体生成某个知识点资源时的思维路径：
 * - 首次加载时调用 resourceApi.getThinkingPath(concept)
 * - 以步骤条形式渲染每一步的 agent、stage、message
 * - 支持“播放回放”按钮，按 setInterval 逐步高亮每一步
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Bot, MessageSquare, Workflow } from 'lucide-react'

import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { resourceApi, type ThinkingStep } from '@/services/api'
import { cn } from '@/lib/utils'

interface Props {
  concept: string
}

const STAGE_COLORS: Record<string, string> = {
  builder: 'bg-indigo-100 text-indigo-700',
  validation: 'bg-emerald-100 text-emerald-700',
  debate: 'bg-amber-100 text-amber-700',
  revision: 'bg-violet-100 text-violet-700',
  complete: 'bg-rose-100 text-rose-700',
}

function stageColor(stage: string) {
  return STAGE_COLORS[stage] || 'bg-slate-100 text-slate-700'
}

export function ThinkingPathReplay({ concept }: Props) {
  const [steps, setSteps] = useState<ThinkingStep[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchPath = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await resourceApi.getThinkingPath(concept)
        if (!cancelled) {
          setSteps(res.data.steps || [])
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || '加载思维路径失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPath()
    return () => {
      cancelled = true
    }
  }, [concept])

  // 清理播放定时器
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const startReplay = () => {
    if (steps.length === 0) return
    setActiveIndex(-1)
    setPlaying(true)
    let idx = 0

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setActiveIndex(idx)
      idx += 1
      if (idx >= steps.length) {
        setPlaying(false)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }, 900)
  }

  const pauseReplay = () => {
    setPlaying(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const resetReplay = () => {
    pauseReplay()
    setActiveIndex(-1)
  }

  if (loading) {
    return (
      <GlassCard hover={false} className="p-6">
        <div className="space-y-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </GlassCard>
    )
  }

  if (error) {
    return (
      <GlassCard hover={false} className="p-5">
        <div className="text-sm font-semibold text-red-600">{error}</div>
      </GlassCard>
    )
  }

  if (steps.length === 0) {
    return (
      <GlassCard hover={false} className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Workflow className="h-4 w-4" />
          暂无思维路径记录
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard hover={false} className="overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50/30 to-indigo-50/30 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Workflow className="h-4 w-4 text-violet-500" />
            思维路径回放
          </h4>
          <div className="flex gap-2">
            {!playing ? (
              <Button
                size="sm"
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-xs shadow-lg shadow-violet-500/25"
                onClick={startReplay}
              >
                <Play className="mr-1 h-3.5 w-3.5" /> 播放回放
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg text-xs"
                onClick={pauseReplay}
              >
                <Pause className="mr-1 h-3.5 w-3.5" /> 暂停
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg text-xs"
              onClick={resetReplay}
              disabled={playing}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> 重置
            </Button>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="relative space-y-4 pl-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-slate-200">
          {steps.map((step, idx) => {
            const active = idx <= activeIndex
            const isCurrent = idx === activeIndex

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="relative"
              >
                <motion.span
                  animate={{
                    scale: isCurrent ? 1.2 : 1,
                    backgroundColor: active ? '#6366f1' : '#e2e8f0',
                  }}
                  className={cn(
                    'absolute -left-[21px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white transition-colors',
                    active ? 'text-white' : 'text-slate-400'
                  )}
                >
                  <Bot className="h-2.5 w-2.5" />
                </motion.span>

                <GlassCard
                  hover={false}
                  className={cn(
                    'p-3 transition-all',
                    isCurrent && 'ring-1 ring-violet-300 shadow-md'
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{step.agent}</span>
                      <Badge variant="secondary" className={cn('rounded-md text-[10px] font-bold', stageColor(step.stage))}>
                        {step.stage}
                      </Badge>
                    </div>
                    {step.timestamp && (
                      <span className="text-[10px] text-slate-400">{step.timestamp}</span>
                    )}
                  </div>

                  <div className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <p
                      className={cn(
                        'text-xs leading-relaxed transition-colors',
                        active ? 'text-slate-700' : 'text-slate-500'
                      )}
                    >
                      {step.message}
                    </p>
                  </div>
                </GlassCard>
              </motion.div>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {activeIndex >= 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-slate-100 bg-slate-50/50 px-5 py-3"
          >
            <div className="text-xs font-semibold text-slate-600">
              当前步骤：{activeIndex + 1} / {steps.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
