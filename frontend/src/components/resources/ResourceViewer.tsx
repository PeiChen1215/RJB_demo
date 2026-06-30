/**
 * 需求：个性化学习资源生成与展示。
 * 功能：
 *   - 接收知识点，调用后端多智能体流式生成资源包（讲义/导图/练习/代码案例）；
 *   - 分阶段展示生成进度（构建/校验/辩论/完成）；
 *   - 以标签页形式展示文档、思维导图、练习题、辩论审核报告、思维路径与版本历史；
 *   - 支持代码案例与练习题一键运行到沙箱、自动判题、变量可视化。
 * 主要 props：
 *   - sessionId：当前会话 ID，资源生成需要绑定会话。
 * 主要 hooks/函数：
 *   - generate：发起 SSE 流式资源生成，并在失败时回退到同步接口；
 *   - runJudge：将练习题代码提交后端判题；
 *   - runInSandbox：将代码写入沙箱 store 并打开沙箱标签；
 *   - mermaid 渲染：将后端返回的导图文本渲染为 SVG。
 * TODO:
 *  - [已完成] 流式资源生成与进度展示
 *  - [已完成] 文档/导图/练习/审核/思维路径/版本六标签页
 *  - [已完成] 练习自动判题与沙箱运行
 *  - [已完成] 认知风格（视觉/听觉/动觉）差异化渲染
 *  - [已完成] 变量可视化（C10）
 *  - [已完成] 可解释思维路径回放（C9）
 *  - [已完成] 知识熔炉版本时间线（C11）
 *  - [待完成] 辩论报告可视化增强（投票分布/修改对比）
 *  - [待完成] 资源收藏、历史记录与分享
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  BookOpen,
  CheckCircle,
  AlertCircle,
  XCircle,
  Lightbulb,
  Play,
  Code2,
  FileText,
  Map,
  ListChecks,
  Loader2,
  Sparkles,
  Copy,
  Check,
  History,
  Workflow,
  Eye,
  EyeOff,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Stepper } from '@/components/ui/stepper'
import { EmptyState } from '@/components/ui/empty-state'
import { CognitiveStylePanel, type CognitiveStyle } from '@/components/resources/CognitiveStyleRenderer'
import { FurnaceTimeline } from '@/components/resources/FurnaceTimeline'
import { ThinkingPathReplay } from '@/components/resources/ThinkingPathReplay'
import { VariableVisualizer } from '@/components/resources/VariableVisualizer'
import api, { behaviorApi, codeApi, resourceApi } from '@/services/api'
import { useSandboxStore } from '@/stores/sandboxStore'
import { cn } from '@/lib/utils'

interface Props {
  sessionId?: string
}

interface DebateRound {
  round: number
  agent: string
  verdict: 'PASS' | 'WARN' | 'REJECT' | 'VETO'
  message: string
  suggestion?: string
}

interface Exercise {
  question: string
  starter_code?: string
  expected_output?: string
  hints?: string[]
  solution?: string
}

interface CodeCase {
  title: string
  code: string
  explanation?: string
}

interface ResourcePackage {
  concept: string
  document: string
  mindmap: string
  exercises: Exercise[]
  code_cases: CodeCase[]
  audio_text: string
}

interface DebateReport {
  status: 'PASSED' | 'MODIFIED' | 'REJECTED'
  rounds: DebateRound[]
  final_votes: Record<string, string>
}

interface ResourceResult {
  concept: string
  package: ResourcePackage
  debate_report: DebateReport
  validation: {
    forbidden_concepts: string[]
    ast_violations: string[]
  }
}

// 资源生成的四个阶段，用于 Stepper 与进度展示
const STAGES = [
  { key: 'builder', label: '构建资源', icon: Sparkles },
  { key: 'validation', label: '校验内容', icon: CheckCircle },
  { key: 'debate', label: '辩论审核', icon: AlertCircle },
  { key: 'complete', label: '生成完成', icon: BookOpen },
]

// 各阶段对应的粗略进度值
const STAGE_PROGRESS: Record<string, number> = {
  builder: 20,
  validation: 60,
  debate: 85,
  complete: 100,
}

// 解析 SSE data: {...} 行，失败或非 data 行返回 null
function parseSSE(line: string): any | null {
  if (!line.startsWith('data: ')) return null
  try {
    return JSON.parse(line.slice(6))
  } catch {
    return null
  }
}

export function ResourceViewer({ sessionId }: Props) {
  const [concept, setConcept] = useState('变量与赋值')
  const [resource, setResource] = useState<ResourceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressValue, setProgressValue] = useState(0)
  const [currentStage, setCurrentStage] = useState('builder')
  const [cognitiveStyle, setCognitiveStyle] = useState<CognitiveStyle>('visual')
  const mindmapRef = useRef<HTMLDivElement>(null)
  const setSandboxCode = useSandboxStore((s) => s.setCode)

  const [judgeResults, setJudgeResults] = useState<Record<number, { loading: boolean; result?: any }>>({})
  const [exerciseCodes, setExerciseCodes] = useState<Record<number, string>>({})
  const [showVariableViz, setShowVariableViz] = useState<Record<string, boolean>>({})

  const activeStageIndex = STAGES.findIndex((s) => s.key === currentStage)

  // 发起 SSE 流式资源生成；若流式未返回完整结果，回退到同步接口
  const generate = async (targetConcept?: string) => {
    if (!sessionId) {
      alert('会话尚未初始化，请稍后再试')
      return
    }

    const conceptToGenerate = targetConcept || concept
    if (targetConcept) setConcept(targetConcept)

    setLoading(true)
    setProgressValue(5)
    setProgressMessage('准备生成资源...')
    setCurrentStage('builder')
    setResource(null)

    try {
      const response = await resourceApi.generateStream(sessionId, conceptToGenerate)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法建立流式连接')

      const decoder = new TextDecoder()
      let buffer = ''
      let finalResource: ResourceResult | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const event = parseSSE(line.trim())
          if (!event) continue

          // 更新进度消息、阶段与进度条
          if (event.type === 'progress') {
            setProgressMessage(event.message || '')
            setCurrentStage(event.stage || currentStage)
            setProgressValue(STAGE_PROGRESS[event.stage] || 50)
          // 资源生成完成，保存结果
          } else if (event.type === 'complete') {
            finalResource = event as ResourceResult
            setResource(finalResource)
            setProgressValue(100)
          } else if (event.type === 'error') {
            setProgressMessage(`流式生成遇到问题：${event.message || '未知错误'}，尝试同步兜底...`)
            break
          }
        }
      }

      // 流式接口未返回完整结果时的兜底同步请求
      if (!finalResource) {
        const res = await api.post(`/resources/generate-for-session/${sessionId}`, null, {
          params: { concept: conceptToGenerate },
        })
        setResource(res.data as ResourceResult)
        setProgressValue(100)
      }
    } catch (err: any) {
      setProgressMessage(`生成失败：${err.message || '未知错误'}，正在尝试同步兜底...`)
      try {
        const res = await api.post(`/resources/generate-for-session/${sessionId}`, null, {
          params: { concept: conceptToGenerate },
        })
        setResource(res.data as ResourceResult)
        setProgressMessage('')
        setProgressValue(100)
      } catch (fallbackErr: any) {
        setProgressMessage(`生成失败：${fallbackErr.message || '未知错误'}`)
        setProgressValue(0)
      }
    } finally {
      setLoading(false)
    }
  }

  // 监听 eduhive:generate-resource 全局事件，支持从 ChatPanel 触发资源生成
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { concept?: string } | undefined
      if (detail?.concept) generate(detail.concept)
    }
    window.addEventListener('eduhive:generate-resource', handler)
    return () => window.removeEventListener('eduhive:generate-resource', handler)
  }, [sessionId])

  // 使用 mermaid 将后端返回的导图文本渲染为 SVG
  useEffect(() => {
    if (!mindmapRef.current || !resource?.package.mindmap) return

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'default' })
        const id = `mermaid-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, resource.package.mindmap)
        mindmapRef.current!.innerHTML = svg
      } catch (err) {
        mindmapRef.current!.innerHTML = `<pre class="text-xs text-red-500">${String(err)}</pre>`
      }
    }
    render()
  }, [resource?.package.mindmap])

  // 将代码写入沙箱 store 并切换至沙箱标签
  const runInSandbox = (code: string) => {
    setSandboxCode(code)
    window.dispatchEvent(new CustomEvent('eduhive:open-sandbox'))
  }

  // 提交练习题代码到后端进行判题
  const runJudge = async (idx: number, exercise: Exercise) => {
    const code = exerciseCodes[idx] ?? exercise.starter_code ?? ''
    if (!code) return

    setJudgeResults((prev) => ({ ...prev, [idx]: { loading: true } }))
    try {
      const res = await codeApi.judge({
        code,
        expected_output: exercise.expected_output || '',
        session_id: sessionId,
        concept: resource?.concept,
      })
      setJudgeResults((prev) => ({ ...prev, [idx]: { loading: false, result: res.data } }))
      if (res.data.knowledge_furnace_triggered) {
        // 可在此弹出提示或刷新版本时间线
        console.log('知识熔炉已触发资源重审')
      }
    } catch (err: any) {
      setJudgeResults((prev) => ({
        ...prev,
        [idx]: { loading: false, result: { passed: false, reason: err.message || '判题请求失败' } },
      }))
    }
  }

  // 根据辩论报告最终状态返回对应图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASSED':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />
      case 'MODIFIED':
        return <AlertCircle className="h-5 w-5 text-amber-500" />
      case 'REJECTED':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return null
    }
  }

  // 根据单轮投票结果返回 Badge 配色
  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'PASS':
        return 'bg-emerald-100 text-emerald-700'
      case 'WARN':
        return 'bg-amber-100 text-amber-700'
      case 'REJECT':
      case 'VETO':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="space-y-4">
      {/* 知识点输入与生成按钮 */}
      <GlassCard delay={0} hover={false} className="p-1">
        <div className="flex gap-2 rounded-xl bg-gradient-to-r from-indigo-500/5 to-violet-500/5 p-2">
          <input
            className="flex-1 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm font-medium outline-none transition-all placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="输入知识点"
          />
          <Button
            onClick={() => generate()}
            disabled={loading}
            size="sm"
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 shadow-lg shadow-indigo-500/25 transition-transform active:scale-95"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">生成</span>
          </Button>
        </div>
      </GlassCard>

      {/* 生成中进度条与阶段指示器 */}
      {loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"
        >
          <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>{progressMessage || '生成中...'}</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="mb-4 h-2" />
          <Stepper steps={STAGES} activeIndex={activeStageIndex} progress={progressValue} />
        </motion.div>
      )}

      {/* 资源内容标签页：文档/导图/练习/审核 */}
      {resource && (
        <Tabs defaultValue="document" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1 sm:grid-cols-6">
            <TabTrigger value="document" icon={FileText} label="文档" />
            <TabTrigger value="mindmap" icon={Map} label="导图" />
            <TabTrigger value="exercises" icon={ListChecks} label="练习" />
            <TabTrigger value="debate" icon={BookOpen} label="审核" />
            <TabTrigger value="thinking" icon={Workflow} label="思维路径" />
            <TabTrigger value="versions" icon={History} label="版本" />
          </TabsList>

          <TabsContent value="document" className="mt-3">
            <GlassCard hover={false} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50/30 to-violet-50/30 px-5 py-4">
                <h4 className="text-sm font-bold text-slate-800">
                  <FileText className="mr-1.5 inline h-4 w-4 text-indigo-500" />
                  {resource.concept} · 讲解文档
                </h4>
              </div>
              <div className="p-5">
                <CognitiveStylePanel
                  currentStyle={cognitiveStyle}
                  onStyleChange={(style) => {
                    setCognitiveStyle(style)
                    behaviorApi.log(sessionId || 'anonymous', 'resource_switched', resource.concept, { style })
                  }}
                  audioText={resource.package.audio_text}
                >
                  <article className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {resource.package.document}
                    </ReactMarkdown>
                  </article>
                </CognitiveStylePanel>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="mindmap" className="mt-3">
            <GlassCard hover={false} className="overflow-hidden">
              <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50/30 to-indigo-50/30 px-5 py-4">
                <h4 className="text-sm font-bold text-slate-800">
                  <Map className="mr-1.5 inline h-4 w-4 text-violet-500" />
                  思维导图
                </h4>
              </div>
              <div className="p-5">
                <div
                  ref={mindmapRef}
                  className="flex justify-center overflow-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-4"
                />
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="exercises" className="mt-3 space-y-4">
            {resource.package.code_cases?.length > 0 && (
              <GlassCard hover={false} className="overflow-hidden">
                <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/30 to-blue-50/30 px-5 py-4">
                  <h4 className="text-sm font-bold text-slate-800">
                    <Code2 className="mr-1.5 inline h-4 w-4 text-indigo-500" />
                    实操案例
                  </h4>
                </div>
                <div className="space-y-4 p-5">
                  {resource.package.code_cases.map((c, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-bold text-slate-800">{c.title}</h5>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-slate-500 hover:bg-cyan-50 hover:text-cyan-700"
                          onClick={() =>
                            setShowVariableViz((prev) => ({ ...prev, [`code-${i}`]: !prev[`code-${i}`] }))
                          }
                        >
                          {showVariableViz[`code-${i}`] ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          可视化变量
                        </Button>
                      </div>
                      <CodeBlock code={c.code} onRun={() => runInSandbox(c.code)} />
                      {showVariableViz[`code-${i}`] && <VariableVisualizer code={c.code} />}
                      {c.explanation && (
                        <p className="text-xs leading-relaxed text-slate-500">{c.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {resource.package.exercises?.map((ex, i) => (
              <GlassCard key={i} hover={false} className="overflow-hidden">
                <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50/30 to-teal-50/30 px-5 py-4">
                  <h4 className="text-sm font-bold text-slate-800">
                    <ListChecks className="mr-1.5 inline h-4 w-4 text-emerald-500" />
                    练习 {i + 1}
                  </h4>
                </div>
                <div className="space-y-3 p-5">
                  <p className="text-sm font-semibold text-slate-700">{ex.question}</p>
                  {ex.starter_code && (
                    <textarea
                      className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-50 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                      defaultValue={ex.starter_code}
                      onChange={(e) => setExerciseCodes((prev) => ({ ...prev, [i]: e.target.value }))}
                    />
                  )}
                  {ex.hints && ex.hints.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ex.hints.map((hint, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-amber-50 text-amber-700">
                          <Lightbulb className="mr-1 h-3 w-3" />
                          {hint}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {ex.expected_output && (
                    <div className="text-xs text-slate-500">
                      期望输出：
                      <code className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-800">
                        {ex.expected_output}
                      </code>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {ex.starter_code && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => runInSandbox(exerciseCodes[i] ?? ex.starter_code)}
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5" /> 在沙箱运行
                      </Button>
                    )}
                    {ex.starter_code && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg text-xs text-slate-500 hover:bg-cyan-50 hover:text-cyan-700"
                        onClick={() =>
                          setShowVariableViz((prev) => ({ ...prev, [`ex-${i}`]: !prev[`ex-${i}`] }))
                        }
                      >
                        {showVariableViz[`ex-${i}`] ? (
                          <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        可视化变量
                      </Button>
                    )}
                    {ex.expected_output && (
                      <Button
                        size="sm"
                        className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-500/25"
                        onClick={() => runJudge(i, ex)}
                        disabled={judgeResults[i]?.loading}
                      >
                        {judgeResults[i]?.loading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        提交判题
                      </Button>
                    )}
                  </div>
                  {judgeResults[i]?.result && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'rounded-xl p-3 text-xs',
                        judgeResults[i].result.passed
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-red-50 text-red-800'
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5 font-bold">
                        {judgeResults[i].result.passed ? (
                          <CheckCircle className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {judgeResults[i].result.passed ? '通过' : '未通过'}
                      </div>
                      <p>{judgeResults[i].result.reason}</p>
                      {judgeResults[i].result.actual_output && (
                        <p className="mt-1">
                          实际输出：
                          <code className="rounded bg-white/60 px-1">{judgeResults[i].result.actual_output}</code>
                        </p>
                      )}
                    </motion.div>
                  )}

                  {showVariableViz[`ex-${i}`] && (
                    <VariableVisualizer code={exerciseCodes[i] ?? ex.starter_code ?? ''} />
                  )}
                </div>
              </GlassCard>
            ))}
          </TabsContent>

          <TabsContent value="debate" className="mt-3">
            <GlassCard hover={false} className="overflow-hidden">
              <div className="border-b border-slate-100 bg-gradient-to-r from-amber-50/30 to-orange-50/30 px-5 py-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  {getStatusIcon(resource.debate_report.status)}
                  辩论议会报告 · {resource.debate_report.status}
                </h4>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(resource.debate_report.final_votes).map(([agent, verdict]) => (
                    <Badge key={agent} variant="secondary" className={cn(getVerdictColor(verdict), 'rounded-md text-xs font-bold')}>
                      {agent}: {verdict}
                    </Badge>
                  ))}
                </div>

                {resource.validation.forbidden_concepts.length > 0 && (
                  <div className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">
                    <span>检测到疑似超纲概念：</span>
                    {resource.validation.forbidden_concepts.join('、')}
                  </div>
                )}
                {resource.validation.ast_violations.length > 0 && (
                  <div className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">
                    <span>AST 校验问题：</span>
                    {resource.validation.ast_violations.join('、')}
                  </div>
                )}

                <div className="relative space-y-4 pl-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-slate-200">
                  {resource.debate_report.rounds.map((r) => (
                    <div key={r.round} className="relative text-sm">
                      <span
                        className={cn(
                          'absolute -left-[21px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white',
                          r.verdict === 'PASS'
                            ? 'bg-emerald-500'
                            : r.verdict === 'WARN'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        )}
                      />
                      <GlassCard hover={false} className="p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            Round {r.round} · {r.agent}
                          </span>
                          <Badge variant="secondary" className={cn(getVerdictColor(r.verdict), 'rounded-md text-[10px] font-bold')}>
                            {r.verdict}
                          </Badge>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-600">{r.message}</p>
                        {r.suggestion && (
                          <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                            建议：{r.suggestion}
                          </p>
                        )}
                      </GlassCard>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="thinking" className="mt-3">
            <ThinkingPathReplay concept={resource.concept} />
          </TabsContent>

          <TabsContent value="versions" className="mt-3">
            <FurnaceTimeline concept={resource.concept} />
          </TabsContent>
        </Tabs>
      )}

      {!resource && !loading && (
        <EmptyState
          icon={BookOpen}
          title="还没有生成资源"
          description="输入知识点并点击生成，系统将自动调用多智能体生成个性化学习资源。"
          action={
            <Button
              size="sm"
              onClick={() => generate()}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25"
            >
              <Sparkles className="mr-1.5 h-4 w-4" /> 立即生成
            </Button>
          }
        />
      )}
    </div>
  )
}

function TabTrigger({
  value,
  icon: Icon,
  label,
}: {
  value: string
  icon: React.ElementType
  label: string
}) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-xl py-2 text-xs font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-indigo-100"
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </TabsTrigger>
  )
}

function CodeBlock({ code, onRun }: { code: string; onRun?: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={copy}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? '已复制' : '复制'}
          </Button>
          {onRun && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={onRun}
            >
              <Play className="h-3 w-3" /> 运行
            </Button>
          )}
        </div>
      </div>
      <pre className="max-h-64 overflow-auto p-4">
        <code className="font-mono text-xs leading-relaxed text-slate-50">{code}</code>
      </pre>
    </div>
  )
}
