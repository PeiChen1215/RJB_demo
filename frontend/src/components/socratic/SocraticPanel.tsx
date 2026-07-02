import { useMemo, useState } from 'react'
import { ChevronRight, Eye, HelpCircle, Lightbulb, MessageCircleQuestion } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

const STAGE_NAMES: Record<string, string> = {
  clarification: '澄清问题',
  assumption_probe: '探查假设',
  evidence_check: '验证证据',
  counter_example: '反例思考',
  convergence: '收敛答案',
  tutor: '引导中',
}

const STAGE_HINTS: Record<string, string> = {
  clarification: '先只看报错类型、行号和你刚才期望程序做什么，不急着改代码。',
  assumption_probe: '想一想：你默认认为哪个文件、变量或函数一定存在？这个假设可能成立吗？',
  evidence_check: '回到代码里找证据：相关变量的值、文件路径、打开模式、缩进和异常位置分别是什么？',
  counter_example: '换一个输入、换一个路径，或者让文件不存在，程序会发生什么？',
  convergence: '把原因压缩成一句话，再说出你准备修改的第一行代码。',
  tutor: '先描述你观察到的现象，再尝试解释它为什么发生。',
}

interface SocraticPanelProps {
  question: string
  hint?: string
  answer?: string
  canProvideAnswer?: boolean
  stage?: string
  onNext?: () => void
  onReveal?: () => void
  className?: string
}

export function SocraticPanel({
  question,
  hint,
  answer,
  canProvideAnswer,
  stage,
  onNext,
  onReveal,
  className,
}: SocraticPanelProps) {
  const [showHint, setShowHint] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const displayHint = useMemo(() => {
    const trimmed = hint?.trim()
    if (trimmed) return trimmed
    return STAGE_HINTS[stage || 'tutor'] || STAGE_HINTS.tutor
  }, [hint, stage])
  const canRevealAnswer = Boolean(answer?.trim() && canProvideAnswer)

  const toggleHint = () => {
    setShowHint((value) => !value)
    onReveal?.()
  }

  return (
    <GlassCard
      hover={false}
      className={cn(
        'socratic-card border-amber-300/35 bg-slate-950/82 p-4 text-slate-100 shadow-[0_18px_50px_rgba(251,191,36,.16)]',
        className
      )}
    >
      <div className="socratic-card-header">
        <span className="socratic-orbit">
          <MessageCircleQuestion className="h-4 w-4" />
        </span>
        <div>
          <p>苏格拉底式引导</p>
          <span>按阶段追问，帮助你自己定位原因。</span>
        </div>
        <Badge variant="secondary" className="socratic-stage-badge">
          {STAGE_NAMES[stage || 'tutor'] || stage || '引导中'}
        </Badge>
      </div>

      <div className="socratic-question">
        <HelpCircle className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
        <p>{question}</p>
      </div>

      {showHint && (
        <div className="socratic-hint">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <span>{displayHint}</span>
        </div>
      )}

      {answer && showAnswer && (
        <div className="socratic-answer">
          <strong>参考思路</strong>
          <p>{answer}</p>
        </div>
      )}

      <div className="socratic-actions">
        <Button type="button" variant="outline" size="sm" className="socratic-outline-button" onClick={toggleHint}>
          <Eye className="h-3.5 w-3.5" />
          {showHint ? '收起提示' : '查看提示'}
        </Button>
        {canRevealAnswer && !showAnswer && (
          <Button type="button" variant="outline" size="sm" className="socratic-outline-button" onClick={() => setShowAnswer(true)}>
            <Eye className="h-3.5 w-3.5" />
            参考思路
          </Button>
        )}
        <Button type="button" size="sm" className="socratic-primary-button" onClick={onNext}>
          <ChevronRight className="h-3.5 w-3.5" />
          继续引导
        </Button>
      </div>
    </GlassCard>
  )
}
