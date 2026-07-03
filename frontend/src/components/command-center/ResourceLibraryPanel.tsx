import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Loader2, Play, RefreshCw, Route, Send, Sparkles } from 'lucide-react'
import type { ResourceDetail, ResourceVersion, ThinkingStep } from '@/services/api'
import { Panel, PanelHeader } from './Panel'
import { cn } from '@/lib/utils'
import type { CodeRunResult, ExerciseView } from './types'

function textFrom(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function looksLikePythonCode(value: string) {
  return /(^|\n)\s*(def |class |for |while |if |with |import |from |print\(|[a-zA-Z_]\w*\s*=)/.test(value)
}

function makeStarterFromExercise(concept: string, expectedOutput: string) {
  const expectedLine = expectedOutput ? `# 目标输出：${expectedOutput}` : '# 目标输出：请根据题目要求补全'
  return `# 请在这里完成「${concept}」练习\n${expectedLine}\n`
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
    starter_code: answerLeaked ? makeStarterFromExercise(concept, expectedOutput) : rawStarter || makeStarterFromExercise(concept, expectedOutput),
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
  thinkingSteps,
  onGenerateResource,
  onRefresh,
  onPlanPath,
  onSendCodeCase,
  onRunCode,
  onJudgeExercise,
  onSectionView,
}: {
  selectedConcept: string
  resource: ResourceDetail | null
  resourceStatus: string
  loading: boolean
  versions: ResourceVersion[]
  thinkingSteps: ThinkingStep[]
  onGenerateResource: () => void
  onRefresh: () => void
  onPlanPath: () => void
  onSendCodeCase: (codeCase: Record<string, any>) => void
  onRunCode: (codeText: string) => Promise<CodeRunResult>
  onJudgeExercise: (exercise: Record<string, any>, codeText: string) => Promise<any>
  onSectionView: (section: string) => void
}) {
  type ResourceSection = 'document' | 'mindmap' | 'exercise' | 'code' | 'audio' | 'review' | 'versions'
  const [activeSection, setActiveSection] = useState<ResourceSection>('document')
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0)
  const [exerciseCode, setExerciseCode] = useState('')
  const [resultText, setResultText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const latestVersion = versions[0]
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
  const codeCases = activeResource?.code_cases || []
  const currentExercise = exercises[activeExerciseIndex] || exercises[0]
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
  ] as const

  useEffect(() => {
    setActiveExerciseIndex(0)
    setExerciseCode(String(exercises[0]?.starter_code || ''))
    setResultText('')
  }, [selectedConcept, exercises[0]?.starter_code])

  const selectSection = (section: ResourceSection) => {
    setActiveSection(section)
    setResultText('')
    onSectionView(section)
  }

  const runCurrentExercise = async () => {
    if (!currentExercise) return
    if (!currentExercise.expected_output) {
      setResultText('当前练习缺少 expected_output，无法进行自动判题。请先重新生成资源，或查看参考答案后手动练习。')
      return
    }
    setActionLoading(true)
    try {
      const result = await onJudgeExercise(currentExercise, exerciseCode)
      setResultText(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
    } catch {
      setResultText('练习判题接口暂不可用，请确认后端服务。')
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
          <div className="resource-empty-state">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <strong>当前知识点还没有资源包</strong>
            <span>点击“重新生成”会调用后端资源生成流，并在完成后自动展示。</span>
          </div>
        )}

        {!loading && hasResource && activeSection === 'document' && (
          <div className="resource-document">
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
                    setExerciseCode(String(exercise.starter_code || ''))
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
                    <p className="warning">后端未返回 expected_output，本题暂不开放自动判题。</p>
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
                <textarea value={exerciseCode} onChange={(event) => setExerciseCode(event.target.value)} />
                <div className="resource-actions">
                  <button onClick={runCurrentExercise} disabled={actionLoading || !currentExercise.expected_output} className="run-button">
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    提交判题
                  </button>
                  <button onClick={() => setResultText(String(currentExercise.solution || '暂无参考答案'))} className="tool-button">参考答案</button>
                </div>
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
            <RichLearningText title="听觉讲解稿" content={activeResource?.audio_text || '后端未返回听觉讲解稿。'} tone="audio" />
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

        {resultText && (
          <div className="resource-result">
            <p className="resource-inspector-title">接口返回</p>
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

        <div>
          <p className="resource-inspector-title">版本演进</p>
          {latestVersion ? (
            <div className="version-card">
              <strong>v{latestVersion.version}</strong>
              <span>{latestVersion.change_reason || '资源已生成并写入版本记录。'}</span>
              <em>{latestVersion.triggered_by || 'Agent pipeline'}</em>
            </div>
          ) : (
            <div className="version-card muted">
              <strong>待生成</strong>
              <span>点击“重新生成”后，这里会显示最新资源版本。</span>
              <em>resources/versions</em>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
