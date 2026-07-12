import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Ear, Eye, FileText, Loader2, Play, RefreshCw, Route, Send, Sparkles } from 'lucide-react'
import type {
  ResourceDetail,
  ResourceEvolutionResponse,
  ResourceFeedbackStats,
  ResourceVersion,
  ThinkingStep,
} from '@/services/api'
import { Panel, PanelHeader } from './Panel'
import { cn } from '@/lib/utils'
import { FurnaceTimeline } from '@/components/resources/FurnaceTimeline'
import type { CodeRunResult, ExerciseView } from './types'
import { BilibiliVideoPlayer } from '@/components/resources/CognitiveStyleRenderer'
import type { CognitiveStyle } from '@/components/resources/CognitiveStyleRenderer'
import { DigitalHuman } from '@/components/digital-human/DigitalHuman'

function textFrom(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function looksLikePythonCode(value: string) {
  return /(^|\n)\s*(def |class |for |while |if |with |import |from |print\(|[a-zA-Z_]\w*\s*=)/.test(value)
}

function makeStarterFromExercise(concept: string, expectedOutput: string) {
  const expectedLine = expectedOutput ? `# 目标输出：${expectedOutput}` : '# 目标输出：请根据题目要求补全'
  return `# TODO: 完成「${concept}」练习\n${expectedLine}\n# 在下面开始作答\n`
}

function formatStarterCode(value: string, concept: string, expectedOutput: string) {
  const starter = value.trimEnd() || makeStarterFromExercise(concept, expectedOutput)
  return `${starter}\n`
}

function getExerciseKey(concept: string, exercise: ExerciseView | undefined, index: number) {
  return `${concept}-${index}-${exercise?.question || 'exercise'}`
}

function formatCodeOutput(result: CodeRunResult, missingExpected = false) {
  const stdout = textFrom(result.stdout || result.output || result.actual_output)
  const stderr = textFrom(result.stderr || result.error)
  const sections = [
    missingExpected ? '本题后端暂未提供标准输出，所以这里只运行代码并展示结果，暂不自动判断对错。' : '代码运行完成。',
    stdout ? `程序输出：\n${stdout}` : '程序没有输出。可以检查是否需要使用 print(...) 输出结果。',
    stderr ? `错误信息：\n${stderr}` : '',
  ].filter(Boolean)
  return sections.join('\n\n')
}

function formatJudgeResult(result: any) {
  if (typeof result === 'string') return result
  const correct = Boolean(result?.correct ?? result?.passed ?? result?.success ?? result?.is_correct)
  const hasVerdict = ['correct', 'passed', 'success', 'is_correct'].some((key) => key in (result || {}))
  const stdout = textFrom(result?.stdout || result?.actual_output || result?.output)
  const stderr = textFrom(result?.stderr || result?.error)
  const expected = textFrom(result?.expected_output || result?.expected)
  const message = textFrom(result?.feedback || result?.message || result?.detail)
  const lines = [
    hasVerdict ? (correct ? '判题通过：输出结果符合题目要求。' : '还差一点：输出结果暂未匹配题目要求。') : '判题完成。',
    expected ? `标准输出：\n${expected}` : '',
    stdout ? `你的输出：\n${stdout}` : '',
    stderr ? `错误信息：\n${stderr}` : '',
    message && !/^\{/.test(message) ? message : '',
  ].filter(Boolean)
  return lines.join('\n\n') || '判题完成，但后端没有返回可展示的反馈。'
}

function normalizeExercise(exercise: Record<string, any>, index: number, concept: string): ExerciseView {
  const rawQuestion = textFrom(exercise.question || exercise.prompt || exercise.title || exercise.description)
  const rawStarter = textFrom(exercise.starter_code || exercise.template || exercise.code)
  const rawSolution = textFrom(exercise.solution || exercise.answer || exercise.reference_answer)
  const expectedOutput = textFrom(exercise.expected_output || exercise.expected || exercise.output)
  const answerLeaked =
    Boolean(rawSolution && rawQuestion && rawQuestion === rawSolution) ||
    Boolean(rawSolution && rawStarter && rawStarter === rawSolution) ||
    looksLikePythonCode(rawQuestion)
  const question = answerLeaked || !rawQuestion
    ? `请完成「${concept}」第 ${index + 1} 道编程练习，修改下方作答区代码，使程序输出指定结果。`
    : rawQuestion
  const hints = Array.isArray(exercise.hints)
    ? exercise.hints.map((hint: unknown) => textFrom(hint)).filter(Boolean)
    : []

  return {
    question,
    starter_code: answerLeaked
      ? makeStarterFromExercise(concept, expectedOutput)
      : formatStarterCode(rawStarter, concept, expectedOutput),
    expected_output: expectedOutput,
    hints,
    solution: rawSolution,
    raw: exercise,
    answerLeaked,
  }
}

function RichLearningText({ title, content, tone = 'paper' }: { title?: string; content?: string; tone?: 'paper' | 'audio' | 'map' }) {
  const blocks: ReactNode[] = []
  const lines = String(content || '').split('\n')
  let paragraph: string[] = []
  let code: string[] = []
  let inCode = false

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(<p key={`p-${blocks.length}`}>{paragraph.join(' ')}</p>)
    paragraph = []
  }

  const flushCode = () => {
    if (!code.length) return
    blocks.push(<pre className="readable-code" key={`code-${blocks.length}`}>{code.join('\n')}</pre>)
    code = []
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      if (inCode) {
        flushCode()
        inCode = false
      } else {
        flushParagraph()
        inCode = true
      }
      return
    }

    if (inCode) {
      code.push(line)
      return
    }

    if (!trimmed) {
      flushParagraph()
      return
    }

    if (/^#{1,4}\s+/.test(trimmed)) {
      flushParagraph()
      const level = Math.min((trimmed.match(/^#+/)?.[0].length || 2), 4)
      const text = trimmed.replace(/^#{1,4}\s+/, '')
      blocks.push(level <= 2
        ? <h3 key={`h-${blocks.length}`}>{text}</h3>
        : <h4 key={`h-${blocks.length}`}>{text}</h4>)
      return
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      flushParagraph()
      blocks.push(<div className="readable-list-line" key={`li-${blocks.length}`}>{trimmed.replace(/^([-*]|\d+[.)])\s+/, '')}</div>)
      return
    }

    paragraph.push(trimmed)
  })

  flushParagraph()
  flushCode()

  return (
    <article className={cn('resource-readable', `resource-readable-${tone}`)}>
      {title && <p className="resource-readable-kicker">{title}</p>}
      {blocks.length ? blocks : <p>后端暂未返回内容。</p>}
    </article>
  )
}

function MindmapReadable({ content }: { content?: string }) {
  const lines = String(content || '').split('\n').map((line) => line.trim()).filter(Boolean)
  const nodes = lines
    .filter((line) => !/^graph|^mindmap/i.test(line))
    .map((line) => line.replace(/-->|---|:::.+$/g, ' -> ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 10)

  return (
    <div className="mindmap-reader">
      <div className="mindmap-node-cloud">
        {(nodes.length ? nodes : ['暂无导图节点']).map((line, index) => (
          <span key={`${line}-${index}`}>{line}</span>
        ))}
      </div>
      <details className="resource-raw-details">
        <summary>查看 Mermaid 原始导图</summary>
        <pre className="readable-code">{content || '后端未返回导图内容。'}</pre>
      </details>
    </div>
  )
}

export function ResourceLibraryPanel({
  selectedConcept,
  resource,
  resourceStatus,
  loading,
  versions,
  evolution,
  feedbackStats,
  thinkingSteps,
  onGenerateResource,
  onRefresh,
  onPlanPath,
  onSendCodeCase,
  onRunCode,
  onJudgeExercise,
  onSectionView,
  onSubmitFeedback,
  styleMode = 'text',
  onStyleChange,
}: {
  selectedConcept: string
  resource: ResourceDetail | null
  resourceStatus: string
  loading: boolean
  versions: ResourceVersion[]
  evolution?: ResourceEvolutionResponse | null
  feedbackStats?: ResourceFeedbackStats | null
  thinkingSteps: ThinkingStep[]
  onGenerateResource: () => void
  onRefresh: () => void
  onPlanPath: () => void
  onSendCodeCase: (codeCase: Record<string, any>) => void
  onRunCode: (codeText: string) => Promise<CodeRunResult>
  onJudgeExercise: (exercise: Record<string, any>, codeText: string) => Promise<any>
  onSectionView: (section: string) => void
  onSubmitFeedback?: (data: { rating?: number; confusion_marked?: boolean; error_report?: string }) => Promise<void>
  styleMode?: CognitiveStyle
  onStyleChange?: (mode: CognitiveStyle) => void
}) {
  type ResourceSection = 'document' | 'mindmap' | 'exercise' | 'code' | 'audio' | 'review' | 'versions'
  const [activeSection, setActiveSection] = useState<ResourceSection>('document')
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0)
  const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, string>>({})
  const [solutionVisible, setSolutionVisible] = useState<Record<string, boolean>>({})
  const [resultText, setResultText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [confusionMarked, setConfusionMarked] = useState(false)
  const [errorReport, setErrorReport] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const latestVersion = versions[0]
  const latestEvolution = evolution?.versions?.[0]
  const errorRate = evolution?.error_stats?.error_rate
  const snapshot = latestVersion?.content_snapshot || {}
  const activeResource: ResourceDetail | null = resource || (Object.keys(snapshot).length ? {
    concept: selectedConcept,
    document: snapshot.document,
    mindmap: snapshot.mindmap,
    exercises: snapshot.exercises || [],
    code_cases: snapshot.code_cases || [],
    audio_text: snapshot.audio_text,
    debate_report: snapshot.debate_report,
  } : null)
  const rawExercises = activeResource?.exercises || []
  const exercises = useMemo(
    () => rawExercises.map((exercise, index) => normalizeExercise(exercise, index, selectedConcept)),
    [rawExercises, selectedConcept],
  )
  const exerciseSignature = useMemo(
    () => exercises.map((exercise, index) => `${index}:${exercise.question}:${exercise.starter_code}`).join('|'),
    [exercises],
  )
  const codeCases = activeResource?.code_cases || []
  const currentExercise = exercises[activeExerciseIndex] || exercises[0]
  const currentExerciseKey = getExerciseKey(selectedConcept, currentExercise, activeExerciseIndex)
  const exerciseCode = exerciseDrafts[currentExerciseKey] ?? String(currentExercise?.starter_code || '')
  const hasResource = Boolean(activeResource && (
    activeResource.document ||
    activeResource.mindmap ||
    exercises.length ||
    codeCases.length ||
    activeResource.audio_text ||
    activeResource.debate_report
  ))
  const resourceSections = [
    ['智能讲义', '根据知识图谱与学习画像生成知识讲解。', 'document', Boolean(activeResource?.document)],
    ['思维导图', '把概念、前置依赖和易错点组织成结构图。', 'mindmap', Boolean(activeResource?.mindmap)],
    ['练习题', '围绕当前掌握度生成巩固题与迁移题。', 'exercise', exercises.length > 0],
    ['代码案例', '可发送到代码沙箱继续运行和调试。', 'code', codeCases.length > 0],
    ['听觉讲解', '读取后端生成的 audio_text 讲解稿。', 'audio', Boolean(activeResource?.audio_text)],
    ['审核报告', '展示 Reviewer 辩论审核结论和修改理由。', 'review', Boolean(activeResource?.debate_report)],
    ['版本演进', '知识熔炉驱动的资源版本历史。', 'versions', true],
  ] as const

  useEffect(() => {
    setActiveExerciseIndex(0)
    setExerciseDrafts((current) => {
      const next: Record<string, string> = {}
      exercises.forEach((exercise, index) => {
        const key = getExerciseKey(selectedConcept, exercise, index)
        next[key] = current[key] ?? String(exercise.starter_code || '')
      })
      return next
    })
    setSolutionVisible({})
    setResultText('')
  }, [selectedConcept, exerciseSignature])

  const selectSection = (section: ResourceSection) => {
    setActiveSection(section)
    setResultText('')
    onSectionView(section)
  }

  const runCurrentExercise = async () => {
    if (!currentExercise) return
    setActionLoading(true)
    try {
      if (currentExercise.expected_output) {
        const result = await onJudgeExercise(currentExercise, exerciseCode)
        setResultText(formatJudgeResult(result))
      } else {
        const result = await onRunCode(exerciseCode)
        setResultText(formatCodeOutput(result, true))
      }
    } catch {
      setResultText(currentExercise.expected_output
        ? '练习判题接口暂不可用，请确认后端服务。'
        : '代码运行接口暂不可用，请确认后端服务。')
    } finally {
      setActionLoading(false)
    }
  }

  const runCodeCase = async (codeCase: Record<string, any>) => {
    setActionLoading(true)
    try {
      const result = await onRunCode(String(codeCase.code || ''))
      setResultText(`${result.stdout || ''}${result.stderr ? `\n${result.stderr}` : ''}`.trim() || '代码执行完成，无输出。')
    } catch {
      setResultText('代码执行接口暂不可用，请确认后端服务。')
    } finally {
      setActionLoading(false)
    }
  }

  const submitFeedback = async () => {
    if (!onSubmitFeedback) return
    if (!rating && !confusionMarked && !errorReport.trim()) {
      setFeedbackMessage('请先选择评分、标记困惑或填写错误报告。')
      return
    }
    setFeedbackSubmitting(true)
    setFeedbackMessage('')
    try {
      await onSubmitFeedback({
        rating: rating ?? undefined,
        confusion_marked: confusionMarked,
        error_report: errorReport.trim() || undefined,
      })
      setFeedbackMessage('反馈已提交，感谢你的建议！')
      setRating(null)
      setConfusionMarked(false)
      setErrorReport('')
    } catch {
      setFeedbackMessage('反馈提交失败，请稍后重试。')
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  return (
    <Panel className="resource-library-panel">
      <PanelHeader
        title="学习资源舱"
        subtitle={selectedConcept}
        icon={BookOpen}
        meta={
          <div className="flex gap-2">
            <button onClick={onPlanPath} className="tool-button"><Route className="h-3.5 w-3.5" />路径</button>
            <button onClick={onRefresh} className="tool-button"><RefreshCw className="h-3.5 w-3.5" />刷新</button>
            <button onClick={onGenerateResource} className="run-button"><Sparkles className="h-3.5 w-3.5" />重新生成</button>
          </div>
        }
      />

      <div className="resource-stage">
        <div className="resource-hero">
          <p>当前资源包</p>
          <button type="button" onClick={onRefresh} className="resource-title-button">
            <h3>{selectedConcept}</h3>
          </button>
          <span>{resourceStatus}</span>
          <div className="resource-hero-stats">
            <strong>{hasResource ? '已载入' : '待生成'}</strong>
            <em>{activeResource?.status || 'resource/latest'}</em>
          </div>
          <div className="resource-scanline" />
        </div>

        <div className="resource-section-grid">
          {resourceSections.map(([title, desc, key, available], index) => (
            <motion.button
              type="button"
              key={key}
              onClick={() => selectSection(key)}
              className={cn('resource-chip text-left', activeSection === key && 'active', available && 'available')}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
            >
              <strong>{title}</strong>
              <span>{desc}</span>
              <em>{available ? '后端数据已就绪' : '等待生成数据'}</em>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="resource-main-view">
        {loading && (
          <div className="resource-empty-state">
            <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
            <span>正在从后端读取资源包...</span>
          </div>
        )}

        {!loading && !hasResource && (
          <div className="resource-empty-state flex flex-col items-center gap-4">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <strong>当前知识点还没有资源包</strong>
            <span>点击「重新生成」会调用后端资源生成流，并在完成后自动展示。</span>
            {/* 数字人预览：即使没资源也能看到 */}
            <div className="mt-4 w-full max-w-sm rounded-2xl border border-amber-200/60 bg-amber-50/30 p-4">
              <p className="mb-3 text-center text-xs font-bold text-amber-700">数字人教师预览</p>
              <DigitalHuman text="你好！我是智学蜂巢的数字人教师。生成学习资源后，我会为你朗读讲解内容。" concept={selectedConcept} />
            </div>
          </div>
        )}

        {!loading && hasResource && activeSection === 'document' && (
          <div className="resource-document">
            {/* 认知风格切换器 */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-slate-600/40 bg-slate-800/60 p-1 backdrop-blur-sm">
                {([
                  { key: 'text' as CognitiveStyle, label: '文字型', icon: FileText, emoji: '📖' },
                  { key: 'visual' as CognitiveStyle, label: '视觉型', icon: Eye, emoji: '👁' },
                  { key: 'auditory' as CognitiveStyle, label: '听觉型', icon: Ear, emoji: '👂' },
                ]).map((s) => {
                  const Icon = s.icon
                  const active = styleMode === s.key
                  return (
                    <button key={s.key} onClick={() => onStyleChange?.(s.key)}
                      className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
                        active ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-200')}
                      title={s.label}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{s.emoji} {s.label}</span>
                    </button>
                  )
                })}
              </div>
              <span className="rounded-full border border-slate-600/40 px-2.5 py-0.5 text-[11px] font-semibold text-slate-400">
                {styleMode === 'text' && '📖 纯文本阅读模式'}
                {styleMode === 'visual' && '👁 视频讲解模式'}
                {styleMode === 'auditory' && '👂 语音朗读模式'}
              </span>
            </div>

            {/* 👁 视觉型：视频播放器 */}
            {styleMode === 'visual' && <BilibiliVideoPlayer concept={selectedConcept} />}

            {/* 👂 听觉型：数字人朗读 */}
            {styleMode === 'auditory' && (
              <DigitalHuman text={activeResource?.audio_text || activeResource?.document || ''} concept={selectedConcept} />
            )}

            <RichLearningText title="智能讲义" content={activeResource?.document || '后端未返回讲义内容。'} />
          </div>
        )}

        {!loading && hasResource && activeSection === 'mindmap' && (
          <div className="resource-document">
            <p className="resource-inspector-title">思维导图</p>
            <MindmapReadable content={activeResource?.mindmap || '后端未返回导图内容。'} />
          </div>
        )}

        {!loading && hasResource && activeSection === 'exercise' && (
          <div className="resource-exercise">
            <p className="resource-inspector-title">练习题</p>
            <div className="exercise-tabs">
              {exercises.map((exercise, index) => (
                <button
                  key={`${exercise.question}-${index}`}
                  onClick={() => {
                    setActiveExerciseIndex(index)
                    setResultText('')
                  }}
                  className={cn(index === activeExerciseIndex && 'active')}
                >
                  练习 {index + 1}
                </button>
              ))}
            </div>
            {currentExercise ? (
              <>
                <div className="exercise-prompt-card">
                  <span>题目</span>
                  <h4>{currentExercise.question}</h4>
                  {currentExercise.expected_output ? (
                    <p>期望输出：<code>{currentExercise.expected_output}</code></p>
                  ) : (
                    <p className="warning">后端暂未提供标准输出，本题会先运行代码并展示程序输出；如需自动判题，需要后端补充 expected_output。</p>
                  )}
                  {currentExercise.answerLeaked && (
                    <p className="warning">已检测到生成结果中答案混入题干/初始代码，页面已自动隐藏答案并重置作答区。</p>
                  )}
                  {currentExercise.hints.length > 0 && (
                    <div className="exercise-hints">
                      {currentExercise.hints.map((hint, hintIndex) => <em key={`${hint}-${hintIndex}`}>{hint}</em>)}
                    </div>
                  )}
                </div>
                <textarea
                  value={exerciseCode}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setExerciseDrafts((current) => ({ ...current, [currentExerciseKey]: nextValue }))
                  }}
                  spellCheck={false}
                />
                <div className="resource-actions">
                  <button onClick={runCurrentExercise} disabled={actionLoading} className="run-button">
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {currentExercise.expected_output ? '提交判题' : '运行查看输出'}
                  </button>
                  <button
                    onClick={() => setSolutionVisible((current) => ({
                      ...current,
                      [currentExerciseKey]: !current[currentExerciseKey],
                    }))}
                    className="tool-button"
                  >
                    {solutionVisible[currentExerciseKey] ? '隐藏参考答案' : '查看参考答案'}
                  </button>
                </div>
                {solutionVisible[currentExerciseKey] && (
                  <div className="exercise-solution-card">
                    <strong>参考答案</strong>
                    <pre>{currentExercise.solution || '后端暂未返回参考答案。'}</pre>
                  </div>
                )}
              </>
            ) : <span className="resource-muted">后端未返回练习题。</span>}
          </div>
        )}

        {!loading && hasResource && activeSection === 'code' && (
          <div className="resource-code-list">
            <p className="resource-inspector-title">代码案例</p>
            {codeCases.length ? codeCases.map((codeCase, index) => (
              <div className="resource-code-card" key={`${codeCase.title || 'case'}-${index}`}>
                <strong>{codeCase.title || `代码案例 ${index + 1}`}</strong>
                <span>{codeCase.explanation || '后端生成的可运行代码案例。'}</span>
                <pre className="readable-code">{codeCase.code || ''}</pre>
                <div className="resource-actions">
                  <button onClick={() => runCodeCase(codeCase)} disabled={actionLoading} className="run-button">
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    运行
                  </button>
                  <button onClick={() => onSendCodeCase(codeCase)} className="tool-button"><Send className="h-3.5 w-3.5" />发送到沙箱</button>
                </div>
              </div>
            )) : <span className="resource-muted">后端未返回代码案例。</span>}
          </div>
        )}

        {!loading && hasResource && activeSection === 'audio' && (
          <div className="resource-document">
            <DigitalHuman
              text={activeResource?.audio_text || activeResource?.document || '请先生成学习资源，即可听取数字人讲解。'}
              concept={selectedConcept}
            />
          </div>
        )}

        {!loading && hasResource && activeSection === 'review' && (
          <div className="resource-review">
            <p className="resource-inspector-title">审核报告</p>
            <strong>{String(activeResource?.debate_report?.status || 'UNKNOWN')}</strong>
            {(activeResource?.debate_report?.rounds || []).map((round: any, index: number) => (
              <div className="review-round" key={`${round.agent || 'review'}-${index}`}>
                <em>{round.agent || `Reviewer ${index + 1}`}</em>
                <span>{round.verdict || 'PASS'}</span>
                <p>{round.message || round.suggestion || '审核通过。'}</p>
              </div>
            ))}
            <details className="resource-raw-details">
              <summary>查看完整审核数据</summary>
              <pre className="readable-code">{JSON.stringify(activeResource?.debate_report || {}, null, 2)}</pre>
            </details>
          </div>
        )}

        {activeSection === 'versions' && (
          <div className="resource-review">
            <FurnaceTimeline concept={selectedConcept} />
          </div>
        )}

        {resultText && (
          <div className="resource-result">
            <p className="resource-inspector-title">练习反馈</p>
            <pre>{resultText}</pre>
          </div>
        )}
      </div>

      <div className="resource-inspector">
        <div>
          <p className="resource-inspector-title">Agent 生成过程</p>
          {(thinkingSteps.length > 0 ? thinkingSteps : [
            { agent: 'Navigator', stage: 'path', message: `读取「${selectedConcept}」在知识图谱中的前置依赖。` },
            { agent: 'Builder', stage: 'resource', message: '等待生成学习资源包。' },
            { agent: 'Reviewer', stage: 'review', message: '生成完成后将展示辩论审核结论。' },
          ]).slice(0, 4).map((step, index) => (
            <div className="resource-step" key={`${step.agent}-${index}`}>
              <i>{index + 1}</i>
              <div>
                <strong>{step.agent}</strong>
                <span>{step.message}</span>
              </div>
            </div>
          ))}
        </div>

        <FurnaceTimeline concept={selectedConcept} />

        <div>
          <p className="resource-inspector-title">版本演进</p>
          {latestVersion || latestEvolution ? (
            <div className="version-card">
              <strong>v{latestEvolution?.version ?? latestVersion?.version}</strong>
              <span>{latestEvolution?.change_reason || latestVersion?.change_reason || '资源已生成并写入版本记录。'}</span>
              <em>{latestEvolution?.triggered_by || latestVersion?.triggered_by || 'Agent pipeline'}</em>
              {latestEvolution?.diff && (
                <div className="version-diff-list">
                  <small>{latestEvolution.diff.document_changed ? '讲义已更新' : '讲义无变化'}</small>
                  <small>练习 {latestEvolution.diff.exercises_diff && latestEvolution.diff.exercises_diff > 0 ? '+' : ''}{latestEvolution.diff.exercises_diff ?? 0}</small>
                  <small>案例 {latestEvolution.diff.code_cases_diff && latestEvolution.diff.code_cases_diff > 0 ? '+' : ''}{latestEvolution.diff.code_cases_diff ?? 0}</small>
                </div>
              )}
              {typeof errorRate === 'number' && (
                <span>代码提交错误率：{Math.round(errorRate * 100)}%</span>
              )}
            </div>
          ) : (
            <div className="version-card muted">
              <strong>待生成</strong>
              <span>点击"重新生成"后，这里会显示最新资源版本。</span>
              <em>resources/versions</em>
            </div>
          )}
        </div>

        {hasResource && (
          <div className="resource-feedback">
            <p className="resource-inspector-title">资源反馈</p>
            {feedbackStats && (
              <div className="resource-feedback-stats">
                <span>反馈 {feedbackStats.total_feedback} 条</span>
                <span>困惑率 {Math.round((feedbackStats.confusion_rate || 0) * 100)}%</span>
                <span>均分 {feedbackStats.average_rating == null ? '--' : feedbackStats.average_rating.toFixed(1)}</span>
              </div>
            )}
            <div className="resource-feedback-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={cn('feedback-star', rating && star <= rating && 'active')}
                  aria-label={`${star} 星`}
                >
                  ★
                </button>
              ))}
              <span>{rating ? `${rating} 星` : '点击评分'}</span>
            </div>
            <label className="resource-feedback-check">
              <input
                type="checkbox"
                checked={confusionMarked}
                onChange={(e) => setConfusionMarked(e.target.checked)}
              />
              我对这部分内容感到困惑
            </label>
            <div className="resource-feedback-field">
              <span>文字反馈</span>
              <textarea
                placeholder="如有错误、不清晰或希望补充的地方，请在这里描述..."
                value={errorReport}
                onChange={(e) => setErrorReport(e.target.value)}
                rows={3}
              />
            </div>
            <button
              onClick={submitFeedback}
              disabled={feedbackSubmitting}
              className="tool-button w-full"
            >
              {feedbackSubmitting ? '提交中...' : '提交反馈'}
            </button>
            {feedbackMessage && <span className="resource-feedback-message">{feedbackMessage}</span>}
          </div>
        )}
      </div>
    </Panel>
  )
}
