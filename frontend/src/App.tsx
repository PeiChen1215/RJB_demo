import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import {
  BarChart3,
  BookOpen,
  Brain,
  Braces,
  Code2,
  Copy,
  FlaskConical,
  Gauge,
  Hexagon,
  Layers3,
  Loader2,
  MessageSquare,
  Mic,
  Network,
  Play,
  RefreshCw,
  Route,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserRound,
  Zap,
} from 'lucide-react'

import {
  behaviorApi,
  codeApi,
  evaluationApi,
  graphApi,
  resourceApi,
  sessionApi,
  type AgentResponse,
  type CodeVariable,
  type EvidenceItem,
  type GraphData,
  type ResourceDetail,
  type ResourceVersion,
  type SessionResponse,
  type ThinkingStep,
} from '@/services/api'
import { SocraticPanel } from '@/components/socratic/SocraticPanel'
import { cn } from '@/lib/utils'

type NavKey = 'profile' | 'graph' | 'resources' | 'chat' | 'code' | 'progress'

interface SessionStats {
  total_events: number
  chat_count: number
  resource_generated_count: number
  exercise_submitted_count: number
  code_executed_count: number
  exercise_passed_count: number
  exercise_failed_count: number
  daily_learning_minutes?: number
  streak_days?: number
}

interface HeatmapItem {
  concept: string
  mastery_probability: number
  observation_count?: number
  is_mastered?: boolean
}

interface SelectedHeatCell {
  row: string
  column: string
  value: number
  concept?: string
  observations?: number
  mastered?: boolean
}

interface MasteryAnalysisResult {
  weakPoints: string[]
  reviewPoints: string[]
  recommendation: string
  analyzedAt: string
}

interface HealthDetail {
  status: string
  llm_provider?: string
  graph_backend?: string
  database_stats?: Record<string, number>
}

interface PathNode {
  id: string
  title: string
  mastery: number
  x: number
  y: number
  module: string
  difficulty: number
  state: 'mastered' | 'learning' | 'waiting'
  icon: ComponentType<{ className?: string }>
}

type KnowledgeEdge = GraphData['edges'][number]

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agentName?: string
  isStreaming?: boolean
  timestamp: string
  tutorPayload?: TutorPayload
}

type TutorPayload = {
  question: string
  hint?: string
  answer?: string
  canProvideAnswer?: boolean
  stage?: string
}

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: 'profile', label: '学习画像', icon: UserRound },
  { key: 'graph', label: '知识图谱', icon: Hexagon },
  { key: 'resources', label: '学习资源', icon: BookOpen },
  { key: 'chat', label: '学习对话', icon: MessageSquare },
  { key: 'code', label: '代码沙箱', icon: Code2 },
  { key: 'progress', label: '掌握进度', icon: BarChart3 },
]

const AGENTS = [
  { name: 'Profiler', job: '正在分析画像', status: 'online', accent: 'mint', time: '00:12' },
  { name: 'Navigator', job: '规划学习路径', status: 'online', accent: 'mint', time: '00:08' },
  { name: 'Builder', job: '生成学习资源', status: 'online', accent: 'mint', time: '00:15' },
  { name: 'Reviewer', job: '辩论审核中', status: 'working', accent: 'amber', time: '00:10' },
  { name: 'Socrates', job: '引导提问中', status: 'online', accent: 'mint', time: '00:14' },
]

const FALLBACK_TARGET_CONCEPT = '文件读写'

function getInitialTargetConcept() {
  if (typeof window === 'undefined') return FALLBACK_TARGET_CONCEPT
  const params = new URLSearchParams(window.location.search)
  return (
    params.get('target_concept') ||
    params.get('target') ||
    window.localStorage.getItem('eduhive.target_concept') ||
    FALLBACK_TARGET_CONCEPT
  ).trim()
}

const SAMPLE_CODE = `# 读取文件示例
file_path = 'sample.txt'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()
    print('文件内容:')
    print(content)

# 按行读取
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    print('\\n按行读取:')
    for i, line in enumerate(lines, 1):
        print(f'{i}: {line.strip()}')`

const SAMPLE_OUTPUT = `文件内容:
Hello, EduHive!
今天学习 Python 文件操作。
继续加油!

按行读取:
1: Hello, EduHive!
2: 今天学习 Python 文件操作。
3: 继续加油!`

const SAMPLE_VARIABLES: CodeVariable[] = [
  { name: 'file_path', type: 'str', value: "'sample.txt'", size: 10 },
  { name: 'content', type: 'str', value: "'Hello, EduHive!\\n今天学习 Python 文件操作。\\n继续加油!'", size: 39 },
  { name: 'lines', type: 'list', value: "['Hello, EduHive!\\n', '今天学习 Python 文件操作。\\n', '继续加油!']", size: 3 },
  { name: 'i', type: 'int', value: '3' },
  { name: 'line', type: 'str', value: "'继续加油!'", size: 5 },
]

function iconForConcept(name: string, module?: string): ComponentType<{ className?: string }> {
  const text = `${name}${module ?? ''}`
  if (/文件|IO|输入|输出/.test(text)) return TerminalSquare
  if (/函数|方法/.test(text)) return Network
  if (/循环|迭代/.test(text)) return RefreshCw
  if (/条件|判断|分支/.test(text)) return Route
  if (/异常|错误/.test(text)) return ShieldCheck
  if (/模块|包|库/.test(text)) return Server
  if (/列表|字典|数据|变量|类型/.test(text)) return Layers3
  if (/代码|语法|基础/.test(text)) return BookOpen
  return FlaskConical
}

function buildPathNodes(graph: GraphData | null, heatmap: HeatmapItem[]): PathNode[] {
  const mastery = new Map(heatmap.map((item) => [item.concept, Math.round(item.mastery_probability * 100)]))
  const fallbackNodes = [
    { id: 'Python 基础语法', name: 'Python 基础语法', module: '基础', difficulty: 1 },
    { id: '数据类型与变量', name: '数据类型与变量', module: '基础', difficulty: 1 },
    { id: '输入与输出', name: '输入与输出', module: '基础', difficulty: 2 },
    { id: '变量基础', name: '变量基础', module: '基础', difficulty: 2 },
    { id: '条件判断', name: '条件判断', module: '控制流', difficulty: 3 },
    { id: '循环结构', name: '循环结构', module: '控制流', difficulty: 3 },
    { id: '函数封装', name: '函数封装', module: '函数', difficulty: 4 },
    { id: '文件读写', name: '文件读写', module: '文件', difficulty: 4 },
    { id: '异常处理', name: '异常处理', module: '工程化', difficulty: 5 },
    { id: '模块与包', name: '模块与包', module: '工程化', difficulty: 5 },
    { id: '列表与字典', name: '列表与字典', module: '数据结构', difficulty: 3 },
  ]
  const fallbackEdges: KnowledgeEdge[] = [
    { source: 'Python 基础语法', target: '变量基础', strength: 0.8 },
    { source: '数据类型与变量', target: '变量基础', strength: 0.8 },
    { source: '输入与输出', target: '文件读写', strength: 0.8 },
    { source: '变量基础', target: '条件判断', strength: 0.8 },
    { source: '条件判断', target: '循环结构', strength: 0.8 },
    { source: '循环结构', target: '函数封装', strength: 0.8 },
    { source: '函数封装', target: '文件读写', strength: 0.8 },
    { source: '异常处理', target: '文件读写', strength: 0.8 },
    { source: '模块与包', target: '文件读写', strength: 0.8 },
  ]

  const sourceNodes = graph?.nodes.length ? graph.nodes : fallbackNodes
  const sourceEdges = graph?.edges.length ? graph.edges : fallbackEdges
  const names = sourceNodes.map((node) => node.name)
  const nameSet = new Set(names)
  const indegree = new Map(names.map((name) => [name, 0]))
  const outgoing = new Map<string, string[]>()

  sourceEdges.forEach((edge) => {
    if (!nameSet.has(edge.source) || !nameSet.has(edge.target)) return
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  })

  const levels = new Map<string, number>()
  const queue = names.filter((name) => (indegree.get(name) ?? 0) === 0)
  queue.forEach((name) => levels.set(name, 0))

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    const currentLevel = levels.get(current) ?? 0
    for (const next of outgoing.get(current) ?? []) {
      levels.set(next, Math.max(levels.get(next) ?? 0, currentLevel + 1))
      indegree.set(next, (indegree.get(next) ?? 1) - 1)
      if ((indegree.get(next) ?? 0) === 0) queue.push(next)
    }
  }

  sourceNodes.forEach((node, index) => {
    if (!levels.has(node.name)) {
      levels.set(node.name, Math.max(0, (node.difficulty ?? 3) - 1) + (index % 2))
    }
  })

  const grouped = new Map<number, typeof sourceNodes>()
  sourceNodes.forEach((node) => {
    const level = levels.get(node.name) ?? 0
    grouped.set(level, [...(grouped.get(level) ?? []), node])
  })
  const sortedLevels = [...grouped.keys()].sort((a, b) => a - b)
  const levelIndex = new Map(sortedLevels.map((level, index) => [level, index]))
  const levelStartColumn = new Map<number, number>()
  let totalColumns = 0
  sortedLevels.forEach((level) => {
    const columnCount = Math.max(1, Math.ceil((grouped.get(level)?.length ?? 1) / 3))
    levelStartColumn.set(level, totalColumns)
    totalColumns += columnCount + 1
  })
  const maxColumn = Math.max(1, totalColumns - 1)

  return sourceNodes.map((node) => {
    const rawLevel = levels.get(node.name) ?? 0
    const level = levelIndex.get(rawLevel) ?? 0
    const siblings = [...(grouped.get(rawLevel) ?? [node])].sort((a, b) => {
      const moduleCompare = (a.module ?? '').localeCompare(b.module ?? '')
      return moduleCompare || a.name.localeCompare(b.name)
    })
    const siblingIndex = siblings.findIndex((item) => item.name === node.name)
    const localColumn = Math.floor(Math.max(0, siblingIndex) / 3)
    const rowInColumn = Math.max(0, siblingIndex) % 3
    const rowsInColumn = Math.min(3, siblings.length - localColumn * 3)
    const rowSlots = rowsInColumn === 1 ? [50] : rowsInColumn === 2 ? [28, 72] : [16, 50, 84]
    const y = Math.min(90, Math.max(10, rowSlots[rowInColumn] + (level % 2 === 0 ? -2 : 2)))
    const column = (levelStartColumn.get(rawLevel) ?? level) + localColumn
    const x = 4 + column * (92 / maxColumn)
    const value = mastery.get(node.name) ?? Math.max(30, 94 - (node.difficulty ?? 3) * 8)
    return {
      id: node.id || node.name,
      title: node.name,
      module: node.module,
      difficulty: node.difficulty,
      mastery: value,
      x,
      y,
      state: value >= 80 ? 'mastered' : value >= 58 ? 'learning' : 'waiting',
      icon: iconForConcept(node.name, node.module),
    }
  })
}

function edgePath(source: PathNode, target: PathNode) {
  const midX = (source.x + target.x) / 2
  const lift = source.y > target.y ? -8 : 8
  return `M${source.x} ${source.y} C${midX} ${source.y + lift}, ${midX} ${target.y - lift}, ${target.x} ${target.y}`
}

function isPathEdge(edge: KnowledgeEdge, plannedPath: string[]) {
  return plannedPath.some((name, index) => {
    const next = plannedPath[index + 1]
    return next && edge.source === name && edge.target === next
  })
}

function inferCodeVariables(code: string, output: string): CodeVariable[] {
  const variables = new Map<string, CodeVariable>()
  const setVariable = (name: string, type: string, value: string, size?: number | null) => {
    if (!/^[A-Za-z_]\w*$/.test(name)) return
    variables.set(name, { name, type, value, size })
  }
  const inferType = (value: string) => {
    if (/^(['"]).*\1$/.test(value)) return 'str'
    if (/^-?\d+$/.test(value)) return 'int'
    if (/^-?\d+\.\d+$/.test(value)) return 'float'
    if (/^(True|False)$/.test(value)) return 'bool'
    if (/^\[.*\]$/.test(value)) return 'list'
    if (/^\{.*\}$/.test(value)) return 'dict'
    if (/^\(.*\)$/.test(value)) return 'tuple'
    return 'expr'
  }

  code.split('\n').forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) return
    const match = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/)
    if (!match) return
    const value = match[2].replace(/\s+#.*$/, '').trim()
    if (!value || value.includes('==')) return
    setVariable(match[1], inferType(value), value)
  })

  const contentMatch = output.match(/文件内容:\s*\n([\s\S]*?)(?:\n\s*按行读取:|$)/)
  if (contentMatch?.[1]) {
    const content = contentMatch[1].trimEnd()
    const lines = content.split(/\r?\n/)
    setVariable('content', 'str', JSON.stringify(content), content.length)
    setVariable('lines', 'list', JSON.stringify(lines), lines.length)
  }

  const numberedLines = [...output.matchAll(/^\s*(\d+):\s*(.+)$/gm)]
  if (numberedLines.length) {
    const last = numberedLines[numberedLines.length - 1]
    setVariable('i', 'int', last[1])
    setVariable('line', 'str', JSON.stringify(last[2]), last[2].length)
  }

  return [...variables.values()]
}

function normalizeCodeVariables(input: unknown): CodeVariable[] {
  if (!input) return []
  const source = Array.isArray(input)
    ? input
    : typeof input === 'object'
      ? Object.entries(input as Record<string, unknown>).map(([name, value]) => {
          if (value && typeof value === 'object' && ('name' in value || 'value' in value || 'type' in value)) {
            return { name, ...(value as Record<string, unknown>) }
          }
          return { name, value, type: typeof value }
        })
      : []
  const normalized: CodeVariable[] = []
  source.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const raw = item as Record<string, unknown>
    const name = String(raw.name ?? raw.variable ?? raw.key ?? '').trim()
    if (!name) return
    const rawValue = raw.value ?? raw.preview ?? raw.repr ?? ''
    const sizeValue = raw.size ?? raw.length
    normalized.push({
      name,
      type: String(raw.type ?? raw.kind ?? typeof rawValue),
      value: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue),
      size: typeof sizeValue === 'number' ? sizeValue : null,
    })
  })
  return normalized
}

function extractCodeVariables(payload: unknown): CodeVariable[] {
  if (!payload || typeof payload !== 'object') return []
  const data = payload as Record<string, unknown>
  const candidates = [
    data.variables,
    data.locals,
    data.variable_snapshot,
    data.variable_snapshots,
    data.result && typeof data.result === 'object' ? (data.result as Record<string, unknown>).variables : undefined,
    data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>).variables : undefined,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeCodeVariables(candidate)
    if (normalized.length) return normalized
  }
  return []
}

function createChatMessage(role: ChatMessage['role'], content: string, agentName?: string, isStreaming = false): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    agentName,
    isStreaming,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  }
}

function extractAgentText(response?: AgentResponse | null, preferredModality?: 'visual' | 'auditory' | 'kinesthetic') {
  const content = response?.content
  if (!content) return ''
  if (typeof content === 'string') return content
  const directText = content.message || content.response_message || content.question || content.answer || content.text
  if (directText) {
    const profile = content.profile || response?.profile_update
    if (!profile) return String(directText)
    const mastered = Array.isArray(profile.mastered_concepts) && profile.mastered_concepts.length
      ? `已掌握：${profile.mastered_concepts.join('、')}`
      : ''
    const modalityValue = preferredModality || profile.cognitive_modality
    const modality = modalityValue === 'auditory' ? '听觉型' : modalityValue === 'kinesthetic' ? '动觉型' : modalityValue === 'visual' ? '视觉型' : ''
    const profileLine = [
      modality && `认知风格：${modality}`,
      profile.learning_pace && `节奏：${profile.learning_pace}`,
      mastered,
    ].filter(Boolean).join('；')
    return profileLine ? `${directText}\n\n画像更新：${profileLine}` : String(directText)
  }
  if (content.profile) return '学习画像已更新，我会根据你的知识水平和认知风格调整后续讲解。'
  return '后端已返回结构化结果，当前没有可直接展示的自然语言回复。'
}

function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? value as Record<string, any> : null
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function extractTutorPayload(response?: AgentResponse | null): TutorPayload | undefined {
  const baseContent = asObject(response?.content)
  const content = asObject(baseContent?.socratic) || asObject(baseContent?.payload) || asObject(baseContent?.data) || baseContent
  if (!content) return undefined

  const looksLikeTutor =
    response?.response_type === 'tutor' ||
    response?.agent_name === 'Socrates' ||
    Boolean(content.question || content.hint || content.can_provide_answer || content.canProvideAnswer || content.stage)
  if (!looksLikeTutor) return undefined

  const question = optionalText(content.question) || optionalText(content.message) || optionalText(content.response_message)
  if (!question) return undefined

  return {
    question,
    hint: optionalText(content.hint),
    answer: optionalText(content.answer),
    canProvideAnswer: Boolean(content.can_provide_answer || content.canProvideAnswer),
    stage: optionalText(content.stage) || response?.response_type,
  }
}

function extractProfileFromResponse(response?: AgentResponse | null) {
  const profile = response?.content?.profile || response?.profile_update
  return profile && typeof profile === 'object' ? profile as Partial<SessionResponse['profile']> : null
}

function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('graph')
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [agentTraces, setAgentTraces] = useState<any[]>([])
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapItem[]>([])
  const [health, setHealth] = useState<HealthDetail | null>(null)
  const [targetConcept, setTargetConcept] = useState(getInitialTargetConcept)
  const [selectedConcept, setSelectedConcept] = useState(targetConcept)
  const [selectedNodeId, setSelectedNodeId] = useState(targetConcept)
  const [resourceConcept, setResourceConcept] = useState(targetConcept)
  const [plannedPath, setPlannedPath] = useState<string[]>(['变量基础', '条件判断', '循环结构', '函数封装', targetConcept])
  const [showGraphDetail, setShowGraphDetail] = useState(true)
  const [graphFocusNonce, setGraphFocusNonce] = useState(0)
  const [selectedHeatCell, setSelectedHeatCell] = useState<SelectedHeatCell | null>(null)
  const [bktDetail, setBktDetail] = useState<any | null>(null)
  const [bktLoading, setBktLoading] = useState(false)
  const [masteryAnalyzing, setMasteryAnalyzing] = useState(false)
  const [masteryAnalysis, setMasteryAnalysis] = useState<MasteryAnalysisResult | null>(null)
  const [workspaceNote, setWorkspaceNote] = useState('点击知识节点、Agent 或工具按钮开始联动。')
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])
  const [versions, setVersions] = useState<ResourceVersion[]>([])
  const [resourcePackage, setResourcePackage] = useState<ResourceDetail | null>(null)
  const [resourcePanelLoading, setResourcePanelLoading] = useState(false)
  const [conceptDetail, setConceptDetail] = useState<any | null>(null)
  const [styleMode, setStyleMode] = useState<'visual' | 'auditory' | 'kinesthetic'>('visual')
  const [chatInput, setChatInput] = useState(() => `我想学习 ${targetConcept}`)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    createChatMessage('assistant', `你已经掌握了前置知识，接下来我们学习「${targetConcept}」。你可以直接提问，我会结合学习画像、知识图谱和练习记录进行辅导。`, 'Socrates'),
  ])
  const [chatLoading, setChatLoading] = useState(false)
  const [code, setCode] = useState(SAMPLE_CODE)
  const [codeOutput, setCodeOutput] = useState(SAMPLE_OUTPUT)
  const [codeVariables, setCodeVariables] = useState<CodeVariable[]>(SAMPLE_VARIABLES)
  const [codeLoading, setCodeLoading] = useState(false)
  const [resourceStatus, setResourceStatus] = useState('资源生成接口待命')
  const [resourceLoading, setResourceLoading] = useState(false)

  useEffect(() => {
    const syncRoute = () => {
      const key = window.location.hash.replace('#/', '') as NavKey
      if (NAV_ITEMS.some((item) => item.key === key)) {
        setActiveNav(key)
      }
    }
    syncRoute()
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  const navigateTo = (nav: NavKey, note?: string) => {
    const wasGraph = activeNav === 'graph'
    setActiveNav(nav)
    if (nav === 'graph') {
      setShowGraphDetail(true)
      if (!wasGraph) setGraphFocusNonce((value) => value + 1)
    }
    if (window.location.hash !== `#/${nav}`) {
      window.location.hash = `/${nav}`
    }
    setWorkspaceNote(note ?? `已切换到「${NAV_ITEMS.find((item) => item.key === nav)?.label ?? '工作台'}」。`)
  }

  useEffect(() => {
    if (activeNav !== 'code' || codeVariables.length) return
    const inferred = inferCodeVariables(code, codeOutput)
    if (inferred.length) setCodeVariables(inferred)
  }, [activeNav, code, codeOutput, codeVariables.length])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const [sessionRes, graphRes, healthRes] = await Promise.all([
          sessionApi.create(targetConcept),
          graphApi.getGraph(),
          fetch('/health/detail').then((res) => res.json()).catch(() => null),
        ])

        if (cancelled) return
        const nextTarget = sessionRes.data.target_concept || targetConcept
        window.localStorage.setItem('eduhive.target_concept', nextTarget)
        setTargetConcept(nextTarget)
        setSelectedConcept(nextTarget)
        setSelectedNodeId(nextTarget)
        setResourceConcept(nextTarget)
        if (sessionRes.data.suggested_path?.length) {
          setPlannedPath(sessionRes.data.suggested_path)
        }
        setSession(sessionRes.data)
        if (['visual', 'auditory', 'kinesthetic'].includes(sessionRes.data.profile.cognitive_modality)) {
          setStyleMode(sessionRes.data.profile.cognitive_modality as 'visual' | 'auditory' | 'kinesthetic')
        }
        setGraph(graphRes.data)
        setHealth(healthRes)
        await behaviorApi.log(sessionRes.data.session_id, 'command_center_opened', nextTarget, {
          surface: 'command-center',
        }).catch(() => undefined)
      } catch {
        if (!cancelled) {
          setResourceStatus('后端连接中断，已切换为演示数据')
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [targetConcept])

  useEffect(() => {
    if (!session) return
    const sessionId = session.session_id

    async function loadLearningSignals() {
      const [statsRes, heatmapRes] = await Promise.allSettled([
        sessionApi.getStats(sessionId),
        evaluationApi.getHeatmap(sessionId),
      ])

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
      if (heatmapRes.status === 'fulfilled') setHeatmap(heatmapRes.value.data.data || [])
    }

    loadLearningSignals()
    const timer = window.setInterval(loadLearningSignals, 6000)
    return () => window.clearInterval(timer)
  }, [session])

  useEffect(() => {
    if (!session) return
    const sessionId = session.session_id
    async function loadAgentTraces() {
      try {
        const res = await sessionApi.getAgentTrace(sessionId)
        setAgentTraces(res.data.traces || [])
      } catch {
        setAgentTraces([])
      }
    }
    loadAgentTraces()
    const timer = window.setInterval(loadAgentTraces, 6000)
    return () => window.clearInterval(timer)
  }, [session])

  const graphConcepts = useMemo(() => new Set(graph?.nodes.map((node) => node.name) ?? []), [graph])
  const pageTitle = NAV_ITEMS.find((item) => item.key === activeNav)?.label ?? '知识图谱'

  const pathNodes = useMemo<PathNode[]>(() => buildPathNodes(graph, heatmap), [graph, heatmap])
  const graphEdges = useMemo<KnowledgeEdge[]>(() => graph?.edges.length ? graph.edges : [
    { source: 'Python 基础语法', target: '变量基础', strength: 0.8 },
    { source: '数据类型与变量', target: '变量基础', strength: 0.8 },
    { source: '输入与输出', target: '文件读写', strength: 0.8 },
    { source: '变量基础', target: '条件判断', strength: 0.8 },
    { source: '条件判断', target: '循环结构', strength: 0.8 },
    { source: '循环结构', target: '函数封装', strength: 0.8 },
    { source: '函数封装', target: '文件读写', strength: 0.8 },
  ], [graph])

  const masteredCount = pathNodes.filter((node) => node.mastery >= 80).length
  const selectedNode = pathNodes.find((node) => node.id === selectedNodeId || node.title === selectedConcept) ?? pathNodes[pathNodes.length - 1]
  const learningGoalConcept = plannedPath[plannedPath.length - 1] || selectedConcept
  const averageMastery = selectedNode?.mastery ?? Math.round(
    pathNodes.reduce((sum, node) => sum + node.mastery, 0) / pathNodes.length
  )

  useEffect(() => {
    if (pathNodes.length === 0) return
    if (pathNodes.some((node) => node.id === selectedNodeId || node.title === selectedConcept)) return
    const nextNode = pathNodes.find((node) => /文件|操作|读写/.test(node.title)) ?? pathNodes[0]
    setSelectedNodeId(nextNode.id)
    setSelectedConcept(nextNode.title)
  }, [pathNodes, selectedConcept, selectedNodeId])

  useEffect(() => {
    if (activeNav !== 'resources') return
    loadResource(resourceConcept, 'open')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav, resourceConcept])

  const selectNode = async (node: PathNode) => {
    setSelectedNodeId(node.id)
    setSelectedConcept(node.title)
    setShowGraphDetail(true)
    setWorkspaceNote(`已选中知识点「${node.title}」，掌握度 ${node.mastery}%。`)
    if (session) {
      behaviorApi.log(session.session_id, 'graph_node_selected', node.title, {
        mastery: node.mastery,
        state: node.state,
      }).catch(() => undefined)
    }
    try {
      const res = await graphApi.getConcept(node.title)
      setConceptDetail(res.data)
    } catch {
      setConceptDetail(null)
    }
  }

  const planPath = async () => {
    navigateTo('graph', `Navigator 正在为「${selectedConcept}」规划路径...`)
    try {
      const mastered = session?.profile.mastered_concepts?.length
        ? session.profile.mastered_concepts
        : pathNodes.filter((node) => node.state === 'mastered').map((node) => node.title)
      const fromConcepts = mastered.length ? mastered : [pathNodes[0]?.title || selectedConcept]
      const res = await graphApi.getPath(fromConcepts, selectedConcept)
      const nextPath = Array.isArray(res.data.path) && res.data.path.length > 0
        ? res.data.path
        : [...fromConcepts.slice(0, 1), selectedConcept]
      setPlannedPath(nextPath)
      setWorkspaceNote(`后端知识图谱已生成路径：${nextPath.join(' → ')}`)
    } catch {
      setWorkspaceNote('路径接口暂不可用，已保留当前可视化路径。')
    }
  }

  const analyzeMastery = async () => {
    if (!session) {
      setWorkspaceNote('会话尚未初始化完成，请稍后再分析掌握度。')
      return
    }
    navigateTo('progress', 'Evaluator 正在重算 BKT 掌握度...')
    setMasteryAnalyzing(true)
    try {
      const res = await evaluationApi.analyze(session.session_id)
      const recommendation = res.data.recommendation || '掌握度分析完成。'
      const weakPoints = Array.isArray(res.data.weak_points) ? res.data.weak_points : []
      const reviewPoints = Array.isArray(res.data.review_points) ? res.data.review_points : []
      const analyzedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setWorkspaceNote(recommendation)
      setMasteryAnalysis({ weakPoints, reviewPoints, recommendation, analyzedAt })
      if (Array.isArray(res.data.heatmap_data)) {
        setHeatmap(res.data.heatmap_data)
      }
      const [heatmapRes, statsRes] = await Promise.allSettled([
        evaluationApi.getHeatmap(session.session_id),
        sessionApi.getStats(session.session_id),
      ])
      if (heatmapRes.status === 'fulfilled') setHeatmap(heatmapRes.value.data.data || [])
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
    } catch {
      setWorkspaceNote('评估接口暂不可用，当前展示最近一次掌握度。')
    } finally {
      setMasteryAnalyzing(false)
    }
  }

  const runCode = async () => {
    setCodeLoading(true)
    try {
      const res = await codeApi.execute(code)
      const stdout = res.data.stdout || ''
      const stderr = res.data.stderr || ''
      const violations = res.data.violations?.length ? `安全检查未通过:\n${res.data.violations.join('\n')}` : ''
      const nextOutput = (stdout + (stderr ? `\n${stderr}` : '') + (violations ? `\n${violations}` : '')).trim()
      setCodeOutput(nextOutput || '代码执行完成，无输出。')
      ;(window as any).__eduhiveLastCodeResult = res.data
      const responseVariables = extractCodeVariables(res.data)
      const nextVariables = responseVariables.length
        ? responseVariables
        : inferCodeVariables(code, nextOutput)
      setCodeVariables(nextVariables)
      if (session) {
        await behaviorApi.log(session.session_id, 'code_executed', selectedConcept, {
          source: 'command-center',
          success: res.data.success,
          variables: nextVariables.map((item) => item.name),
        }).catch(() => undefined)
      }
    } catch {
      setCodeOutput('代码执行接口暂不可用，请检查后端服务。')
      setCodeVariables([])
    } finally {
      setCodeLoading(false)
    }
  }

  const sendChat = async (messageOverride?: string) => {
    const messageText = (typeof messageOverride === 'string' ? messageOverride : chatInput).trim()
    if (!messageText || chatLoading) return
    setChatInput('')
    const assistantId = `assistant-${Date.now()}`
    setChatMessages((prev) => [
      ...prev,
      createChatMessage('user', messageText),
      {
        ...createChatMessage('assistant', '正在连接 Socrates 辅导链路...', 'Socrates', true),
        id: assistantId,
      },
    ])

    if (!session) {
      setChatMessages((prev) => prev.map((message) => message.id === assistantId
        ? { ...message, role: 'system', agentName: 'System', isStreaming: false, content: '后端会话还未创建完成，请稍后再发送。' }
        : message))
      return
    }

    setChatLoading(true)
    let finalResponse: AgentResponse | null = null

    const applyAssistantMessage = (content: string, agentName = 'Agent', isStreaming = true, tutorPayload?: TutorPayload) => {
      setChatMessages((prev) => prev.map((message) => message.id === assistantId
        ? { ...message, content, agentName, isStreaming, tutorPayload }
        : message))
    }
    const syncProfileFromResponse = (response: AgentResponse | null) => {
      const profile = extractProfileFromResponse(response)
      if (!profile) return
      setSession((current) => current ? {
        ...current,
        profile: {
          ...current.profile,
          ...profile,
          cognitive_modality: styleMode,
        },
      } : current)
    }
    const applyAssistantResponse = (response: AgentResponse | null, fallbackText: string) => {
      const tutorPayload = extractTutorPayload(response)
      const content = tutorPayload?.question || extractAgentText(response, styleMode) || fallbackText
      applyAssistantMessage(content, response?.agent_name || (tutorPayload ? 'Socrates' : 'Agent'), false, tutorPayload)
    }

    try {
      const response = await sessionApi.chatStream(session.session_id, messageText)
      if (!response.ok) throw new Error(`chat-stream ${response.status}`)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法建立 SSE 流')

      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''
        for (const chunk of chunks) {
          const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '))
          if (!dataLine) continue
          const event = JSON.parse(dataLine.slice(6))
          if (event.type === 'thinking' || event.type === 'progress') {
            applyAssistantMessage(event.message || '多智能体正在协作...', event.agent || 'Agent', true)
          }
          if (event.type === 'complete') {
            finalResponse = event.agent_response as AgentResponse
            syncProfileFromResponse(finalResponse)
            applyAssistantResponse(finalResponse, '对话完成，但后端没有返回可展示文本。')
          }
          if (event.type === 'error') {
            throw new Error(event.message || 'chat-stream error')
          }
        }
      }

      if (!finalResponse) {
        const fallback = await sessionApi.chat(session.session_id, { message: messageText, message_type: 'text' })
        finalResponse = fallback.data
        syncProfileFromResponse(finalResponse)
        applyAssistantResponse(finalResponse, '同步对话完成，但没有可展示文本。')
      }
    } catch (error) {
      try {
        const fallback = await sessionApi.chat(session.session_id, { message: messageText, message_type: 'text' })
        finalResponse = fallback.data
        syncProfileFromResponse(finalResponse)
        applyAssistantResponse(finalResponse, '同步对话完成，但没有可展示文本。')
      } catch {
        applyAssistantMessage('后端对话接口暂不可用，请确认服务已启动。知识图谱、学习资源和代码沙箱仍可继续调试。', 'System', false)
      }
    } finally {
      setChatLoading(false)
    }
  }

  const loadResource = async (concept = resourceConcept, surface: 'open' | 'refresh' | 'switch' = 'open') => {
    setResourceConcept(concept)
    setResourcePanelLoading(true)
    setWorkspaceNote(`正在读取「${concept}」的学习资源包...`)
    try {
      const [latestRes, thinkingRes, versionRes] = await Promise.allSettled([
        resourceApi.getLatest(concept),
        resourceApi.getThinkingPath(concept),
        resourceApi.getVersions(concept),
      ])
      if (latestRes.status === 'fulfilled') {
        const resource = latestRes.value.data.resource
        setResourcePackage(resource)
        setResourceStatus(resource ? `已载入「${concept}」资源包` : `「${concept}」暂无已生成资源，请先生成。`)
      }
      if (thinkingRes.status === 'fulfilled') setThinkingSteps(thinkingRes.value.data.steps || [])
      if (versionRes.status === 'fulfilled') setVersions(versionRes.value.data.versions || [])
      if (session) {
        behaviorApi.log(session.session_id, 'resource_switched', concept, { surface }).catch(() => undefined)
      }
    } catch {
      setResourceStatus('资源详情接口暂不可用')
      setWorkspaceNote('未能读取资源详情，请确认后端服务已启动。')
    } finally {
      setResourcePanelLoading(false)
    }
  }

  const generateResource = async (concept = selectedConcept, source: 'goal' | 'node' | 'resource' = 'node') => {
    if (!session) {
      setResourceStatus('会话尚未创建完成，请稍后再试。')
      setWorkspaceNote('后端会话还在初始化，资源生成需要有效 session_id。')
      return
    }
    setResourceConcept(concept)
    const sourceCopy = source === 'goal' ? '当前学习目标' : source === 'resource' ? '资源页当前知识点' : '当前节点'
    setWorkspaceNote(`正在为${sourceCopy}「${concept}」生成学习资源。`)
    setResourceLoading(true)
    setResourceStatus(`Navigator 正在规划「${concept}」资源...`)
    try {
      const response = await resourceApi.generateStream(session.session_id, concept)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法建立资源生成流')
      const decoder = new TextDecoder()
      let buffer = ''
      let completedResource: ResourceDetail | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))
          if (event.message) {
            setResourceStatus(event.message)
            setWorkspaceNote(event.message)
          }
          if (event.type === 'complete') {
            completedResource = {
              concept,
              ...(event.package || {}),
              debate_report: event.debate_report || {},
              status: event.debate_report?.status === 'REJECTED' ? 'rejected' : 'approved',
            }
            setResourcePackage(completedResource)
            setResourceStatus('资源生成与辩论审核完成')
          }
        }
      }
      const [thinkingRes, versionRes] = await Promise.allSettled([
        resourceApi.getThinkingPath(concept),
        resourceApi.getVersions(concept),
      ])
      if (thinkingRes.status === 'fulfilled') setThinkingSteps(thinkingRes.value.data.steps || [])
      if (versionRes.status === 'fulfilled') setVersions(versionRes.value.data.versions || [])
      await loadResource(concept, 'refresh').catch(() => {
        if (completedResource) setResourcePackage(completedResource)
      })
      navigateTo('resources', `「${concept}」学习资源已生成，可查看讲义、练习与审核记录。`)
    } catch {
      setResourceStatus('资源生成流未连接，当前展示本地演示状态')
      setWorkspaceNote('资源生成接口未连接；你仍可调试前端交互和其他接口。')
    } finally {
      setResourceLoading(false)
    }
  }

  const sendCodeCaseToSandbox = (codeCase: Record<string, any>) => {
    const nextCode = String(codeCase.code || codeCase.starter_code || SAMPLE_CODE)
    setCode(nextCode)
    navigateTo('code', `已将「${codeCase.title || resourceConcept}」代码案例载入代码沙箱。`)
    if (session) {
      behaviorApi.log(session.session_id, 'code_case_viewed', resourceConcept, {
        title: codeCase.title,
        action: 'send_to_sandbox',
      }).catch(() => undefined)
    }
  }

  const runResourceCode = async (codeText: string) => {
    const res = await codeApi.execute(codeText)
    return res.data
  }

  const judgeResourceExercise = async (exercise: Record<string, any>, codeText: string) => {
    const res = await codeApi.judgeExercise({
      code: codeText,
      expected_output: String(exercise.expected_output || ''),
      session_id: session?.session_id,
      concept: resourceConcept,
    })
    if (session) {
      behaviorApi.log(session.session_id, 'exercise_attempt', resourceConcept, {
        question: exercise.question,
      }).catch(() => undefined)
    }
    return res.data
  }

  const runAgentAction = async (agentName: string) => {
    if (agentName === 'Profiler') {
      navigateTo('profile', 'Profiler 已准备更新学习画像。')
      setChatInput('请根据我的学习行为更新学习画像')
      return
    }
    if (agentName === 'Navigator') {
      await planPath()
      return
    }
    if (agentName === 'Builder') {
      await generateResource(learningGoalConcept, 'goal')
      return
    }
    if (agentName === 'Reviewer') {
      navigateTo('profile', `Reviewer 正在读取「${selectedConcept}」的审核回放...`)
      setWorkspaceNote(`Reviewer 正在读取「${selectedConcept}」的审核回放...`)
      try {
        const [thinkingRes, versionRes] = await Promise.all([
          resourceApi.getThinkingPath(selectedConcept),
          resourceApi.getVersions(selectedConcept),
        ])
        setThinkingSteps(thinkingRes.data.steps || [])
        setVersions(versionRes.data.versions || [])
        setWorkspaceNote('审核回放与版本演进已更新。')
      } catch {
        setWorkspaceNote('审核/版本接口暂无记录，先生成一次资源即可看到回放。')
      }
      return
    }
    navigateTo('chat', 'Socrates 已准备辅导问题，点击对话发送即可触发。')
    setChatInput(`我在学习「${selectedConcept}」时答错了，请用苏格拉底方式引导我`)
  }

  const selectHeatCell = async (cell: SelectedHeatCell) => {
    setSelectedHeatCell(cell)
    navigateTo('progress', `已选中「${cell.concept || `${cell.column}/${cell.row}`}」，当前掌握度 ${cell.value}%。`)
    if (session) {
      behaviorApi.log(session.session_id, 'heatmap_cell_selected', cell.concept || cell.column, {
        row: cell.row,
        column: cell.column,
        value: cell.value,
        observations: cell.observations,
      }).catch(() => undefined)
      if (cell.concept) {
        setBktLoading(true)
        try {
          const res = await evaluationApi.getBkt(session.session_id, cell.concept)
          setBktDetail(res.data)
        } catch {
          setBktDetail(null)
          setWorkspaceNote('已选中热力图单元，但 BKT 详情接口暂不可用。')
        } finally {
          setBktLoading(false)
        }
      }
    }
  }

  const changeStyleMode = async (mode: 'visual' | 'auditory' | 'kinesthetic') => {
    setStyleMode(mode)
    setSession((current) => current ? {
      ...current,
      profile: {
        ...current.profile,
        cognitive_modality: mode,
      },
    } : current)
    setWorkspaceNote(`认知风格画像已切换为：${mode === 'visual' ? '视觉型' : mode === 'auditory' ? '听觉型' : '动觉型'}。`)
    if (session) {
      sessionApi.updateProfile(session.session_id, { cognitive_modality: mode })
        .then((res) => {
          if (res.data.profile) {
            setSession((current) => current ? { ...current, profile: res.data.profile } : current)
          }
        })
        .catch(() => {
          setWorkspaceNote('认知风格已在前端切换，但后端画像同步失败，请确认服务状态。')
        })
      behaviorApi.log(session.session_id, 'cognitive_style_preview', selectedConcept, {
        mode,
        description: `用户手动切换认知风格为 ${mode}`,
      }).catch(() => undefined)
    }
  }

  return (
    <div className={cn('command-shell min-h-screen text-slate-100', `style-mode-${styleMode}`)}>
      <HexBackdrop />
      <aside className="command-sidebar">
        <BrandBlock />
        <nav className="mt-10 space-y-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => navigateTo(item.key)}
              className={cn('side-nav-item', activeNav === item.key && 'side-nav-item-active')}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <LearningMeter stats={stats} />
          <StreakCard stats={stats} />
        </div>
      </aside>

      <main className="relative min-h-screen pl-0 lg:pl-[250px]">
        <div className="mx-auto flex min-h-screen max-w-[1780px] flex-col gap-3 p-3 sm:p-5">
          <TopBar
            sessionId={session?.session_id}
            health={health}
            pageTitle={pageTitle}
            resourceStatus={resourceStatus}
            learningGoalConcept={learningGoalConcept}
            onGenerateResource={() => generateResource(learningGoalConcept, 'goal')}
            resourceLoading={resourceLoading}
          />

          <section className="module-page flex-1">
            {activeNav === 'profile' && (
              <div className="module-grid profile-page">
                <ProfilePanel session={session} masteredCount={masteredCount} targetConcept={targetConcept} stats={stats} totalConcepts={graphConcepts.size} />
                <AgentPanel onAgentAction={runAgentAction} traces={agentTraces} />
                <WorkspaceDock
                  activeNav={activeNav}
                  selectedConcept={selectedConcept}
                  styleMode={styleMode}
                  workspaceNote={workspaceNote}
                  thinkingSteps={thinkingSteps}
                  versions={versions}
                  onStyleChange={changeStyleMode}
                  onAnalyze={analyzeMastery}
                  onPlanPath={planPath}
                />
              </div>
            )}

            {activeNav === 'graph' && (
              <div className={cn('module-grid graph-page', showGraphDetail && 'graph-page-detailing')}>
                <KnowledgePanel
                  nodes={pathNodes}
                  edges={graphEdges}
                  plannedPath={plannedPath}
                  selectedNodeId={selectedNodeId}
                  selectedConcept={selectedConcept}
                  graphConcepts={graphConcepts}
                  averageMastery={averageMastery}
                  resourceStatus={resourceStatus}
                  conceptDetail={conceptDetail}
                  showDetail={showGraphDetail}
                  focusNonce={graphFocusNonce}
                  onNodeSelect={selectNode}
                  onCanvasBlankClick={() => setShowGraphDetail(false)}
                  onPlanPath={planPath}
                  onGenerateResource={(concept) => generateResource(concept, 'node')}
                />
                <WorkspaceDock
                  activeNav={activeNav}
                  selectedConcept={selectedConcept}
                  styleMode={styleMode}
                  workspaceNote={workspaceNote}
                  thinkingSteps={thinkingSteps}
                  versions={versions}
                  onStyleChange={changeStyleMode}
                  onAnalyze={analyzeMastery}
                  onPlanPath={planPath}
                />
              </div>
            )}

            {activeNav === 'resources' && (
              <div className="module-grid resource-page">
                <ResourceLibraryPanel
                  selectedConcept={resourceConcept}
                  resource={resourcePackage}
                  resourceStatus={resourceStatus}
                  loading={resourcePanelLoading}
                  versions={versions}
                  thinkingSteps={thinkingSteps}
                  onGenerateResource={() => generateResource(resourceConcept, 'resource')}
                  onRefresh={() => loadResource(resourceConcept, 'refresh')}
                  onPlanPath={planPath}
                  onSendCodeCase={sendCodeCaseToSandbox}
                  onRunCode={runResourceCode}
                  onJudgeExercise={judgeResourceExercise}
                  onSectionView={(section) => {
                    if (session) {
                      behaviorApi.log(session.session_id, section === 'mindmap' ? 'mindmap_clicked' : section === 'review' ? 'debate_viewed' : 'resource_switched', resourceConcept, {
                        section,
                      }).catch(() => undefined)
                    }
                  }}
                />
                <WorkspaceDock
                  activeNav={activeNav}
                  selectedConcept={selectedConcept}
                  styleMode={styleMode}
                  workspaceNote={workspaceNote}
                  thinkingSteps={thinkingSteps}
                  versions={versions}
                  onStyleChange={changeStyleMode}
                  onAnalyze={analyzeMastery}
                  onPlanPath={planPath}
                />
              </div>
            )}

            {activeNav === 'chat' && (
              <div className="module-grid chat-page">
                <ChatCommand
                  input={chatInput}
                  setInput={setChatInput}
                  messages={chatMessages}
                  loading={chatLoading}
                  targetConcept={targetConcept}
                  onSend={sendChat}
                  onContinueTutor={() => sendChat('请继续用苏格拉底式提问引导我，不要直接给答案。')}
                />
                <WorkspaceDock
                  activeNav={activeNav}
                  selectedConcept={selectedConcept}
                  styleMode={styleMode}
                  workspaceNote={workspaceNote}
                  thinkingSteps={thinkingSteps}
                  versions={versions}
                  onStyleChange={changeStyleMode}
                  onAnalyze={analyzeMastery}
                  onPlanPath={planPath}
                />
              </div>
            )}

            {activeNav === 'code' && (
              <div className="module-grid code-page">
                <CodeCommand
                  code={code}
                  setCode={setCode}
                  output={codeOutput}
                  variables={codeVariables}
                  loading={codeLoading}
                  onRun={runCode}
                  onReset={() => {
                    setCode(SAMPLE_CODE)
                    setCodeOutput(SAMPLE_OUTPUT)
                    setCodeVariables(SAMPLE_VARIABLES)
                  }}
                />
              </div>
            )}

            {activeNav === 'progress' && (
              <div className="module-grid progress-page">
                <HeatmapPanel
                  items={heatmap}
                  stats={stats}
                  selectedCell={selectedHeatCell}
                  bktDetail={bktDetail}
                  bktLoading={bktLoading}
                  analyzing={masteryAnalyzing}
                  analysis={masteryAnalysis}
                  onSelectCell={selectHeatCell}
                  onAnalyze={analyzeMastery}
                />
                <WorkspaceDock
                  activeNav={activeNav}
                  selectedConcept={selectedConcept}
                  styleMode={styleMode}
                  workspaceNote={workspaceNote}
                  thinkingSteps={thinkingSteps}
                  versions={versions}
                  onStyleChange={changeStyleMode}
                  onAnalyze={analyzeMastery}
                  onPlanPath={planPath}
                />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function HexBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="command-bg-layer absolute inset-0" />
      <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(30deg,rgba(255,190,82,.25)_12%,transparent_12.5%,transparent_87%,rgba(255,190,82,.25)_87.5%,rgba(255,190,82,.25)),linear-gradient(150deg,rgba(255,190,82,.25)_12%,transparent_12.5%,transparent_87%,rgba(255,190,82,.25)_87.5%,rgba(255,190,82,.25)),linear-gradient(30deg,rgba(255,190,82,.25)_12%,transparent_12.5%,transparent_87%,rgba(255,190,82,.25)_87.5%,rgba(255,190,82,.25)),linear-gradient(150deg,rgba(255,190,82,.25)_12%,transparent_12.5%,transparent_87%,rgba(255,190,82,.25)_87.5%,rgba(255,190,82,.25))] [background-position:0_0,0_0,18px_31px,18px_31px] [background-size:36px_62px]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:40px_40px]" />
    </div>
  )
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-4">
      <img className="brand-mark-image" src="/assets/eduhive-logo-mark.png" alt="智学蜂巢 EduHive 标志" />
      <div>
        <h1 className="text-xl font-black leading-tight text-amber-50">智学蜂巢</h1>
        <p className="font-mono text-lg font-bold tracking-[0.12em] text-white">EduHive</p>
      </div>
    </div>
  )
}

function TopBar({
  sessionId,
  health,
  pageTitle,
  resourceStatus,
  learningGoalConcept,
  onGenerateResource,
  resourceLoading,
}: {
  sessionId?: string
  health: HealthDetail | null
  pageTitle: string
  resourceStatus: string
  learningGoalConcept: string
  onGenerateResource: () => void
  resourceLoading: boolean
}) {
  return (
    <header className="command-topbar">
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">EduHive Command Center</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-amber-50 sm:text-3xl">{pageTitle}</h2>
          <p className="mt-1 max-w-[560px] truncate text-xs font-semibold text-slate-500">{resourceStatus}</p>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-400">
          <div className="hidden items-center gap-2 sm:flex">
            <span>服务状态</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" />
            <span className="font-semibold text-emerald-300">{health?.status === 'ok' ? '全部在线' : '连接中'}</span>
          </div>
          <div className="hidden h-8 w-px bg-white/12 md:block" />
          <div className="hidden md:block">
            <span>会话 ID</span>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-slate-200">
              <span>{sessionId ? `EH-${sessionId.slice(0, 12).toUpperCase()}` : 'EH-BOOTING'}</span>
              <Copy className="h-3.5 w-3.5 text-slate-500" />
            </div>
          </div>
          <button onClick={onGenerateResource} className="primary-action" title={`生成当前学习目标「${learningGoalConcept}」的资源`}>
            {resourceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span>生成目标资源</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function KnowledgePanel({
  nodes,
  edges,
  plannedPath,
  selectedNodeId,
  selectedConcept,
  graphConcepts,
  averageMastery,
  resourceStatus,
  conceptDetail,
  showDetail,
  focusNonce,
  onNodeSelect,
  onCanvasBlankClick,
  onPlanPath,
  onGenerateResource,
}: {
  nodes: PathNode[]
  edges: KnowledgeEdge[]
  plannedPath: string[]
  selectedNodeId: string
  selectedConcept: string
  graphConcepts: Set<string>
  averageMastery: number
  resourceStatus: string
  conceptDetail: any | null
  showDetail: boolean
  focusNonce: number
  onNodeSelect: (node: PathNode) => void
  onCanvasBlankClick: () => void
  onPlanPath: () => void
  onGenerateResource: (concept: string) => void
}) {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[nodes.length - 1]
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const mapX = useMotionValue(0)
  const [canvasSize, setCanvasSize] = useState({ width: 920, height: 355 })
  const nodeByTitle = new Map(nodes.map((node) => [node.title, node]))
  const renderedEdges = edges
    .map((edge) => {
      const source = nodeByTitle.get(edge.source)
      const target = nodeByTitle.get(edge.target)
      if (!source || !target) return null
      return { edge, source, target, d: edgePath(source, target), active: isPathEdge(edge, plannedPath) }
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
  const activeEdges = renderedEdges.filter((item) => item.active)
  const mapPixelWidth = Math.max(1900, nodes.length * 260)
  const dragLeft = -Math.max(820, mapPixelWidth - 920)
  const nodeX = selectedNode ? (selectedNode.x / 100) * mapPixelWidth : 0
  const nodeY = selectedNode ? (selectedNode.y / 100) * canvasSize.height : 0
  const detailLeft = selectedNode
    ? Math.min(mapPixelWidth - 270, Math.max(12, nodeX + (selectedNode.x > 72 ? -292 : 82)))
    : 12
  const detailTop = selectedNode
    ? Math.min(Math.max(12, canvasSize.height - 220), Math.max(12, nodeY - 96))
    : 12

  useEffect(() => {
    const updateCanvasSize = () => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      setCanvasSize({ width: rect.width, height: rect.height })
    }
    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
    return () => window.removeEventListener('resize', updateCanvasSize)
  }, [])

  useEffect(() => {
    if (!selectedNode) return
    const centeredOffset = canvasSize.width / 2 - nodeX
    mapX.set(Math.min(0, Math.max(dragLeft, centeredOffset)))
  }, [canvasSize.width, dragLeft, focusNonce, mapX])

  return (
    <Panel className="graph-panel relative min-h-[420px] overflow-hidden">
      <PanelHeader
        title="知识图谱 / 学习路径"
        icon={Network}
        meta={
          <div className="flex flex-wrap gap-4 text-xs">
            <LegendDot color="mint" label="已掌握" />
            <LegendDot color="amber" label="学习中" />
            <LegendDot color="gray" label="待学习" />
            <span className="text-slate-500">--- 前置依赖</span>
          </div>
        }
      />

      <div
        ref={canvasRef}
        className="knowledge-canvas relative h-[calc(100%-54px)] min-h-[355px] overflow-hidden rounded-md border border-white/6 bg-black/12"
        onClick={(event) => {
          if (event.target === event.currentTarget) onCanvasBlankClick()
        }}
      >
        <motion.div
          className="dungeon-map absolute inset-y-0 left-0"
          style={{ width: mapPixelWidth, x: mapX }}
          drag="x"
          dragConstraints={{ left: dragLeft, right: 0 }}
          dragElastic={0.08}
          onClick={(event) => {
            if (event.target === event.currentTarget) onCanvasBlankClick()
          }}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onClick={onCanvasBlankClick}
          >
            {renderedEdges.map(({ edge, d }) => (
              <path key={`${edge.source}-${edge.target}-dependency`} d={d} className="dependency-path" />
            ))}
            {activeEdges.map(({ edge, d }) => (
              <path key={`${edge.source}-${edge.target}-halo`} d={d} className="route-path route-path-halo" />
            ))}
            {activeEdges.map(({ edge, d }) => (
              <path key={`${edge.source}-${edge.target}-glow`} d={d} className="route-path route-path-glow" />
            ))}
          </svg>

          {nodes.map((node, index) => (
            <GraphNode
              key={node.id}
              node={node}
              index={index}
              selected={node.id === selectedNodeId || node.title === selectedConcept}
              detailOpen={showDetail && (node.id === selectedNodeId || node.title === selectedConcept)}
              onPlannedPath={plannedPath.includes(node.title)}
              known={graphConcepts.size === 0 || graphConcepts.has(node.title)}
              onSelect={() => onNodeSelect(node)}
            />
          ))}

          {showDetail && selectedNode && (
            <motion.div
              key={selectedNodeId}
              className={cn('target-card', selectedNode.x > 72 && 'target-card-left')}
              style={{ left: detailLeft, top: detailTop }}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              onClick={(event) => event.stopPropagation()}
            >
              <p className="font-bold text-amber-300">当前目标：{selectedConcept}</p>
              <p className="mt-2 text-slate-400">前置依赖：{conceptDetail?.prerequisites?.join('、') || plannedPath.slice(0, -1).join('、') || '等待后端路径'}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-slate-400">掌握度：</span>
                <strong className="text-amber-200">{averageMastery}%</strong>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-300" style={{ width: `${averageMastery}%` }} />
                </span>
              </div>
              <p className="mt-2 leading-relaxed text-slate-300">易错点：{conceptDetail?.common_errors?.join('、') || '文件路径、编码格式、读写模式、异常处理'}</p>
              <p className="mt-2 font-mono text-[11px] text-emerald-300">{resourceStatus}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={onPlanPath} className="mini-action">规划路径</button>
                <button onClick={() => onGenerateResource(selectedNode.title)} className="mini-action amber">生成该节点资源</button>
              </div>
            </motion.div>
          )}
        </motion.div>

        <div className="map-hint">拖动地图探索后续副本</div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_83%_74%,rgba(245,176,65,.16),transparent_18%)]" />
    </Panel>
  )
}

function GraphNode({
  node,
  index,
  known,
  selected,
  detailOpen,
  onPlannedPath,
  onSelect,
}: {
  node: PathNode
  index: number
  known: boolean
  selected: boolean
  detailOpen: boolean
  onPlannedPath: boolean
  onSelect: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className={cn('graph-node text-left', node.state, selected && 'selected', detailOpen && 'detail-open', onPlannedPath && 'on-path', !known && 'opacity-70')}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
    >
      {(selected || onPlannedPath) && (
        <div className="node-wave-field" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <div className="graph-node-icon">
        <node.icon className="h-5 w-5" />
      </div>
      <div className="graph-node-label">
        <strong>{node.title}</strong>
        <span>掌握度 {node.mastery}%</span>
      </div>
    </motion.button>
  )
}

function ChatCommand({
  input,
  setInput,
  messages,
  loading,
  targetConcept,
  onSend,
  onContinueTutor,
}: {
  input: string
  setInput: (value: string) => void
  messages: ChatMessage[]
  loading: boolean
  targetConcept: string
  onSend: () => void
  onContinueTutor: () => void
}) {
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const voiceRecognitionRef = useRef<any | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'unsupported'>('idle')

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.stop?.()
      voiceRecognitionRef.current = null
    }
  }, [])

  const toggleVoiceInput = () => {
    if (voiceStatus === 'listening' && voiceRecognitionRef.current) {
      voiceRecognitionRef.current.stop()
      voiceRecognitionRef.current = null
      setVoiceStatus('idle')
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceStatus('unsupported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setVoiceStatus('listening')
    recognition.onend = () => {
      voiceRecognitionRef.current = null
      setVoiceStatus('idle')
    }
    recognition.onerror = () => {
      voiceRecognitionRef.current = null
      setVoiceStatus('idle')
    }
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim()
      if (transcript) {
        setInput(input.trim() ? `${input.trim()} ${transcript}` : transcript)
      }
    }
    voiceRecognitionRef.current = recognition
    recognition.start()
  }

  return (
    <Panel className="chat-command-panel">
      <PanelHeader
        title="AI 学习对话"
        subtitle="Socrates / Navigator / Profiler"
        icon={MessageSquare}
        meta={<span className="flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />后端对话接口</span>}
      />
      <div className="chat-shell">
        <div className="chat-context-strip">
          <span>当前学习目标</span>
          <strong>{targetConcept}</strong>
          <em>提问后会调用后端 Agent 编排链路，并记录到学习画像。</em>
        </div>

        <div ref={messagesRef} className="chat-message-list">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              className={cn('chat-message-row', message.role === 'user' && 'user', message.role === 'system' && 'system')}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {message.role !== 'user' && <HexAvatar icon={message.role === 'system' ? Server : Brain} tone={message.role === 'system' ? 'amber' : 'mint'} />}
              <div className="dialogue-bubble">
                <div className="chat-message-meta">
                  <strong>{message.role === 'user' ? '你' : message.agentName || 'AI 助教'}</strong>
                  <span>{message.timestamp}</span>
                </div>
                {message.tutorPayload ? (
                  <SocraticPanel
                    question={message.tutorPayload.question}
                    hint={message.tutorPayload.hint}
                    answer={message.tutorPayload.answer}
                    canProvideAnswer={message.tutorPayload.canProvideAnswer}
                    stage={message.tutorPayload.stage}
                    onNext={onContinueTutor}
                  />
                ) : (
                  <p>{message.content}</p>
                )}
                {message.isStreaming && (
                  <span className="chat-streaming">
                    <i className="typing-dot" />
                    <i className="typing-dot" />
                    <i className="typing-dot" />
                    正在思考
                  </span>
                )}
              </div>
              {message.role === 'user' && <HexAvatar icon={UserRound} tone="amber" />}
            </motion.div>
          ))}
        </div>

        <div className="chat-composer">
          <div className="chat-suggestions">
            {['解释当前知识点', '给我一道练习', '我哪里没掌握'].map((text) => (
              <button
                type="button"
                key={text}
                onClick={() => setInput(text)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="chat-input-frame">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) onSend()
              }}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
              placeholder="输入你的问题，例如：为什么 open 要写 encoding？"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={cn('voice-button', voiceStatus === 'listening' && 'listening', voiceStatus === 'unsupported' && 'unsupported')}
              title={voiceStatus === 'unsupported' ? '当前浏览器不支持语音输入' : voiceStatus === 'listening' ? '正在听，点击停止' : '语音输入'}
              aria-label={voiceStatus === 'listening' ? '停止语音输入' : '语音输入'}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => onSend()} disabled={loading || !input.trim()} className="send-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 fill-current" />}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

type ExerciseView = {
  question: string
  starter_code: string
  expected_output: string
  hints: string[]
  solution: string
  raw: Record<string, any>
  answerLeaked: boolean
}

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
    ? exercise.hints.map((hint) => textFrom(hint)).filter(Boolean)
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

function ResourceLibraryPanel({
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
  onRunCode: (codeText: string) => Promise<any>
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
        <div className="resource-control-rail">
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
      </div>
    </Panel>
  )
}

function CodeCommand({
  code,
  setCode,
  output,
  variables,
  loading,
  onRun,
  onReset,
}: {
  code: string
  setCode: (value: string) => void
  output: string
  variables: CodeVariable[]
  loading: boolean
  onRun: () => void
  onReset: () => void
}) {
  const hasRunOutput = output.trim().length > 0 && output !== SAMPLE_OUTPUT
  const displayVariables = useMemo(() => {
    const normalized = normalizeCodeVariables(variables)
    return normalized.length ? normalized : inferCodeVariables(code, output)
  }, [code, output, variables])

  return (
    <Panel className="min-h-[300px]">
      <PanelHeader
        title="代码沙箱"
        subtitle="后端受控执行 / 变量快照"
        icon={Code2}
        meta={
          <div className="flex gap-2">
            <button onClick={onRun} disabled={loading} className="run-button">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
              运行
            </button>
            <button onClick={onReset} className="tool-button"><RefreshCw className="h-3.5 w-3.5" />重置</button>
          </div>
        }
      />
      <div className="grid h-[calc(100%-54px)] min-h-[230px] gap-3 lg:grid-cols-[1fr_0.82fr]">
        <div className="code-editor">
          <div className="code-lines">
            {code.split('\n').map((line, index) => (
              <div key={`${line}-${index}`}>
                <span>{index + 1}</span>
                <code>{line}</code>
              </div>
            ))}
          </div>
          <textarea value={code} onChange={(event) => setCode(event.target.value)} aria-label="Python code editor" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="console-box">
            <p className="console-title">输出</p>
            <pre>{output}</pre>
          </div>
          <div className="console-box">
            <p className="console-title">
              变量快照
              <span>{displayVariables.length ? `${displayVariables.length} 个` : '等待运行'}</span>
            </p>
            {displayVariables.length ? (
              <div className="variable-stack">
                {displayVariables.map((item) => (
                  <div className="variable-row" key={`${item.name}-${item.type}`}>
                    <div className="variable-head">
                      <code>{item.name}</code>
                      <span>{item.type}</span>
                    </div>
                    <pre>{item.value}</pre>
                    {typeof item.size === 'number' && <small>len = {item.size}</small>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="variable-empty">
                <Braces className="h-4 w-4" />
                <span>{hasRunOutput ? '本次运行没有检测到可展示的顶层变量。请确认代码中存在变量赋值。' : '运行代码后，这里会显示后端返回的变量名、类型和值。'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}

function ProfilePanel({ session, masteredCount, targetConcept, stats, totalConcepts }: { session: SessionResponse | null; masteredCount: number; targetConcept: string; stats: SessionStats | null; totalConcepts: number }) {
  const profile = session?.profile
  const [expanded, setExpanded] = useState(false)
  const [evidence, setEvidence] = useState<Record<string, EvidenceItem[]>>({})
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const modality = profile?.cognitive_modality === 'auditory' ? '听觉型' : profile?.cognitive_modality === 'kinesthetic' ? '动觉型' : '视觉型'
  const field = profile?.cognitive_field === 'independent' ? '场独立' : '场依存'

  useEffect(() => {
    if (!session?.session_id) return
    sessionApi
      .getProfileEvidence(session.session_id)
      .then((res) => {
        setEvidence(res.data.evidence || {})
        setConfidence(res.data.confidence ?? 0)
      })
      .catch(() => {
        setEvidence({})
        setConfidence(0)
      })
  }, [session?.session_id, stats?.chat_count])

  return (
    <Panel className="profile-panel min-h-[278px]">
      <PanelHeader
        title="学习画像"
        icon={UserRound}
        meta={
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="profile-detail-toggle"
            aria-expanded={expanded}
          >
            {expanded ? '收起画像' : '详细画像'}
          </button>
        }
      />
      <div className="profile-layout">
        <div className="profile-avatar">
          <img src="/assets/student-avatar-visual.png" alt="当前学习者画像" />
          <p>当前学习者</p>
          <span>目标：{session?.target_concept || targetConcept}</span>
        </div>
        <div className="profile-summary">
          <ProfileLine label="知识水平" value={`${profile?.knowledge_level ?? 3}/5`} blocks={profile?.knowledge_level ?? 3} />
          <ProfileLine label="认知风格" value={`${modality} · ${field}`} />
          <ProfileLine label="学习节奏" value={profile?.learning_pace || '稳步推进'} spark />
          <ProfileLine label="学习目标" value={`通过「${session?.target_concept || targetConcept}」练习`} />
          <p className="profile-mastered">已掌握 {masteredCount} 个关键节点</p>
        </div>
      </div>
      {expanded && (
        <motion.div
          className="profile-detail-grid"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div>
            <strong>学习偏好</strong>
            <span>{modality}学习者，适合图示、路径图和代码运行反馈联动。</span>
          </div>
          <div>
            <strong>易错模式</strong>
            <span>{profile?.error_patterns?.slice(0, 2).join('、') || '文件路径、编码格式、异常处理'}</span>
          </div>
          <div>
            <strong>已掌握概念</strong>
            <span>{profile?.mastered_concepts?.slice(0, 3).join('、') || '变量基础、条件判断、循环结构'}</span>
          </div>
        </motion.div>
      )}
      {Object.keys(evidence).length > 0 && (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
          <button
            type="button"
            onClick={() => setEvidenceOpen((value) => !value)}
            className="flex w-full items-center justify-between text-xs font-bold text-indigo-200"
            aria-expanded={evidenceOpen}
          >
            <span>画像证据（{Object.keys(evidence).length} 个维度）</span>
            <span>{evidenceOpen ? '收起' : '展开'}</span>
          </button>
          {evidenceOpen && (
            <motion.div
              className="mt-2 space-y-2"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {Object.entries(evidence).map(([dim, items]) => (
                <div key={dim}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{dim}</p>
                  <ul className="mt-1 space-y-1">
                    {items.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="text-xs text-slate-300">
                        · {item.evidence_type}
                        {item.description && <span className="text-slate-500"> — {item.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      )}
      <div className="profile-insight-strip">
        <div>
          <span>画像置信度</span>
          <strong>{session ? `${Math.round(confidence * 100)}%` : '待同步'}</strong>
        </div>
        <div>
          <span>学习轨迹</span>
          <strong>{masteredCount} / {totalConcepts > 0 ? totalConcepts : '--'}</strong>
        </div>
        <div>
          <span>推荐干预</span>
          <strong>{profile?.learning_pace === 'fast' ? '挑战题' : profile?.learning_pace === 'slow' ? '分步讲解' : '路径巩固'}</strong>
        </div>
      </div>
    </Panel>
  )
}

function AgentPanel({ onAgentAction, traces }: { onAgentAction: (agentName: string) => void; traces: any[] }) {
  const latestByAgent = useMemo(() => {
    const map: Record<string, any> = {}
    for (const trace of traces) {
      const name = trace.agent_name
      if (!map[name] || (trace.created_at && trace.created_at > map[name].created_at)) {
        map[name] = trace
      }
    }
    return map
  }, [traces])

  const runningCount = useMemo(() => traces.filter((t) => t.status === 'running').length, [traces])

  return (
    <Panel className="agent-panel min-h-[230px]">
      <PanelHeader title="Agent 协作" icon={Sparkles} meta={<span className="flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />5/5 在线</span>} />
      <div className="agent-list">
        {AGENTS.map((agent, index) => {
          const trace = latestByAgent[agent.name]
          const status = trace?.status === 'running' ? 'working' : trace?.status === 'failed' ? 'error' : trace ? 'online' : 'online'
          const timeText = trace ? `${trace.duration_ms}ms` : '空闲'
          return (
            <motion.button
              type="button"
              onClick={() => onAgentAction(agent.name)}
              key={agent.name}
              className={cn('agent-row text-left', agent.accent)}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <HexAvatar icon={index === 3 ? ShieldCheck : Brain} tone={agent.accent === 'amber' ? 'amber' : 'mint'} small />
              <strong>{agent.name}</strong>
              <span>{trace ? `${trace.stage || agent.job}` : agent.job}</span>
              <div className="agent-pulses">
                {Array.from({ length: 5 }).map((_, pulseIndex) => (
                  <i key={pulseIndex} className={pulseIndex < (status === 'working' ? 2 : status === 'error' ? 1 : 4) ? 'on' : ''} />
                ))}
              </div>
              <em title="最近调用耗时">{timeText}</em>
            </motion.button>
          )
        })}
      </div>
      <div className="agent-insight-board">
        <div className="agent-orbit">
          {AGENTS.map((agent, index) => {
            const trace = latestByAgent[agent.name]
            const status = trace?.status === 'running' ? 'working' : trace?.status === 'failed' ? 'error' : trace ? 'online' : 'online'
            return (
              <span key={agent.name} className={cn(agent.accent, status === 'working' && 'working', status === 'error' && 'error')} style={{ '--agent-index': index } as Record<string, number>} />
            )
          })}
          <strong>协作中枢</strong>
        </div>
        <div className="agent-metrics">
          <p><span>活跃任务</span><strong>{runningCount || 0}</strong></p>
          <p><span>链路状态</span><strong>{traces.some((t) => t.status === 'failed') ? '存在降级' : '稳定'}</strong></p>
          <p><span>本轮策略</span><strong>画像-路径-反馈</strong></p>
        </div>
      </div>
    </Panel>
  )
}

function HeatmapPanel({
  items,
  stats,
  selectedCell,
  bktDetail,
  bktLoading,
  analyzing,
  analysis,
  onSelectCell,
  onAnalyze,
}: {
  items: HeatmapItem[]
  stats: SessionStats | null
  selectedCell: SelectedHeatCell | null
  bktDetail: any | null
  bktLoading: boolean
  analyzing: boolean
  analysis: MasteryAnalysisResult | null
  onSelectCell: (cell: SelectedHeatCell) => void
  onAnalyze: () => void
}) {
  const cells = useMemo(() => {
    return items.map((item) => {
      const value = Math.round(item.mastery_probability * 100)
      const band = value >= 78 ? '已掌握' : value >= 62 ? '需巩固' : value >= 45 ? '薄弱' : '待学习'
      return {
        row: band,
        column: '真实知识点',
        concept: item.concept,
        value,
        observations: item.observation_count ?? 0,
        mastered: item.is_mastered || value >= 78,
      }
    })
  }, [items])
  const summary = useMemo(() => {
    const average = items.length
      ? Math.round(items.reduce((sum, item) => sum + item.mastery_probability, 0) / items.length * 100)
      : null
    const mastered = items.filter((item) => item.is_mastered || item.mastery_probability >= 0.78).length
    const weak = items.filter((item) => item.mastery_probability < 0.6).length
    return { average, mastered, weak, total: items.length }
  }, [items])
  const bktParams = bktDetail?.bkt_params || {}
  const observationCount = Number(bktParams.observation_count ?? 0)
  const modelEvidenceText = bktDetail?.concept
    ? observationCount > 0
      ? `基于 ${observationCount} 次练习记录判断`
      : '暂无该知识点练习记录，当前为初始估计'
    : '点击热力格后查看模型证据'

  return (
    <Panel className="heatmap-panel min-h-[300px]">
      <PanelHeader
        title="掌握度热力图"
        subtitle="BKT 驱动的知识点诊断"
        icon={Gauge}
        meta={
          <button onClick={onAnalyze} disabled={analyzing} className="heatmap-analyze-button">
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
            {analyzing ? '分析中' : '重新分析'}
          </button>
        }
      />
      <div className="heatmap-overview">
        <div>
          <span>平均掌握</span>
          <strong>{summary.average === null ? '--' : `${summary.average}%`}</strong>
        </div>
        <div>
          <span>稳定掌握</span>
          <strong>{summary.mastered}/{summary.total}</strong>
        </div>
        <div>
          <span>薄弱预警</span>
          <strong>{summary.weak}</strong>
        </div>
        <div>
          <span>练习提交</span>
          <strong>{stats?.exercise_submitted_count ?? 0}</strong>
        </div>
      </div>
      {cells.length > 0 ? (
        <div className="heatmap-grid real-knowledge-grid">
          {cells.map((cell) => (
            <button
              key={cell.concept}
              onClick={() => onSelectCell(cell)}
              className={cn(selectedCell?.concept === cell.concept && 'selected', cell.mastered && 'mastered')}
              style={{ ['--heat-bg' as string]: heatColor(cell.value), ['--heat-strength' as string]: `${Math.max(0.18, cell.value / 100)}` }}
            >
              <span className="heatmap-band">{cell.row}</span>
              <strong>{cell.value}%</strong>
              <span>{cell.concept}</span>
              <em>{cell.observations} 次练习记录</em>
            </button>
          ))}
        </div>
      ) : (
        <div className="heatmap-empty">
          <Gauge className="h-6 w-6" />
          <strong>暂无真实掌握度数据</strong>
          <span>完成练习、判题或点击“重新分析”后，这里会按后端知识点逐项生成热力卡片。</span>
        </div>
      )}
      <div className="heatmap-footer">
        <div className="heatmap-selected">
          <span>{analysis ? `最近分析 ${analysis.analyzedAt}` : '当前诊断'}</span>
          <strong>{selectedCell ? `${selectedCell.concept || selectedCell.column} · ${selectedCell.row}` : analysis ? `薄弱 ${analysis.weakPoints.length} · 巩固 ${analysis.reviewPoints.length}` : '选择任意热力格'}</strong>
          <em>{selectedCell ? `掌握度 ${selectedCell.value}% · 观测 ${selectedCell.observations ?? 0} 次` : analysis ? (analysis.weakPoints[0] ? `优先补强：${analysis.weakPoints.slice(0, 2).join('、')}` : '暂无薄弱点，建议保持练习节奏。') : '点击格子后读取 BKT 详情'}</em>
        </div>
        <div className="heatmap-bkt-strip">
          <span>{bktLoading ? '模型诊断读取中...' : bktDetail?.concept ? `掌握度模型：${bktDetail.concept}` : '掌握度模型待选中'}</span>
          <strong>{bktDetail?.mastery_probability !== undefined ? `${Math.round(bktDetail.mastery_probability * 100)}%` : '--'}</strong>
          <em>{modelEvidenceText}</em>
        </div>
        <div className="heatmap-scale" aria-hidden="true">
          <span>低掌握</span>
          <span>需巩固</span>
          <span>已掌握</span>
        </div>
      </div>
    </Panel>
  )
}

function WorkspaceDock({
  activeNav,
  selectedConcept,
  styleMode,
  workspaceNote,
  thinkingSteps,
  versions,
  onStyleChange,
  onAnalyze,
  onPlanPath,
}: {
  activeNav: NavKey
  selectedConcept: string
  styleMode: 'visual' | 'auditory' | 'kinesthetic'
  workspaceNote: string
  thinkingSteps: ThinkingStep[]
  versions: ResourceVersion[]
  onStyleChange: (mode: 'visual' | 'auditory' | 'kinesthetic') => void
  onAnalyze: () => void
  onPlanPath: () => void
}) {
  const styleCopy = {
    visual: '视觉型：强化图谱、高亮路径和结构化卡片。',
    auditory: '听觉型：突出对话引导和口语化讲解节奏。',
    kinesthetic: '动觉型：强调代码练习、即时运行和操作反馈。',
  }
  const titleByNav: Record<NavKey, string> = {
    profile: '学习画像工作区',
    graph: '路径规划工作区',
    resources: '学习资源工作区',
    chat: '对话与辅导工作区',
    code: '代码沙箱工作区',
    progress: '评估分析工作区',
  }

  return (
    <div className="workspace-dock">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">{titleByNav[activeNav]}</p>
        <h3>{selectedConcept}</h3>
        <span>{workspaceNote}</span>
      </div>
      <div className="style-switcher">
        {(['visual', 'auditory', 'kinesthetic'] as const).map((mode) => (
          <button key={mode} onClick={() => onStyleChange(mode)} className={cn(styleMode === mode && 'active')}>
            {mode === 'visual' ? '视觉型' : mode === 'auditory' ? '听觉型' : '动觉型'}
          </button>
        ))}
        <span>{styleCopy[styleMode]}</span>
      </div>
      <div className="dock-actions">
        <button onClick={onPlanPath}>规划路径</button>
        <button onClick={onAnalyze}>分析掌握度</button>
      </div>
      <div className="dock-feed">
        {(thinkingSteps.length > 0 ? thinkingSteps : [
          { agent: 'Navigator', stage: 'path', message: '选择知识节点后可规划路径。' },
          { agent: 'Builder', stage: 'resource', message: '顶部或节点详情可生成当前知识点资源。' },
          { agent: 'Evaluator', stage: 'analysis', message: '热力图点击会记录行为并联动评估。' },
        ]).slice(0, 3).map((step, index) => (
          <p key={`${step.agent}-${index}`}>
            <strong>{step.agent}</strong>
            <span>{step.message}</span>
          </p>
        ))}
        {versions.length > 0 && (
          <p>
            <strong>Furnace</strong>
            <span>已读取 {versions.length} 个资源版本演进记录。</span>
          </p>
        )}
      </div>
    </div>
  )
}

function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={cn('command-panel', className)}>{children}</section>
}

function PanelHeader({
  title,
  subtitle,
  icon: Icon,
  meta,
}: {
  title: string
  subtitle?: string
  icon: ComponentType<{ className?: string }>
  meta?: ReactNode
}) {
  return (
    <div className="panel-header">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-amber-300" />
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {meta}
    </div>
  )
}

function heatColor(value: number) {
  if (value >= 78) return 'linear-gradient(135deg, rgba(22,163,74,.88), rgba(52,211,153,.62))'
  if (value >= 62) return 'linear-gradient(135deg, rgba(132,204,22,.74), rgba(245,158,11,.52))'
  if (value >= 45) return 'linear-gradient(135deg, rgba(245,158,11,.78), rgba(180,83,9,.62))'
  return 'linear-gradient(135deg, rgba(185,28,28,.82), rgba(124,45,18,.68))'
}

function LegendDot({ color, label }: { color: 'mint' | 'amber' | 'gray'; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <i className={cn('h-2.5 w-2.5 rounded-full', color === 'mint' && 'bg-emerald-300', color === 'amber' && 'bg-amber-300', color === 'gray' && 'bg-slate-500')} />
      {label}
    </span>
  )
}

function HexAvatar({
  icon: Icon,
  tone,
  small,
}: {
  icon: ComponentType<{ className?: string }>
  tone: 'amber' | 'mint'
  small?: boolean
}) {
  return (
    <div className={cn('hex-avatar', tone, small && 'small')}>
      <Icon className={small ? 'h-4 w-4' : 'h-5 w-5'} />
    </div>
  )
}

function ProfileLine({
  label,
  value,
  blocks,
  spark,
}: {
  label: string
  value: string
  blocks?: number
  spark?: boolean
}) {
  return (
    <div className="profile-line">
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        {blocks && (
          <span className="flex gap-1">
            {Array.from({ length: 8 }).map((_, index) => (
              <i key={index} className={cn('h-2.5 w-3 rounded-sm bg-white/12', index < blocks + 2 && 'bg-emerald-300')} />
            ))}
          </span>
        )}
        {spark && <span className="spark-line" />}
      </div>
    </div>
  )
}

function LearningMeter({ stats }: { stats: SessionStats | null }) {
  const minutes = typeof stats?.daily_learning_minutes === 'number' ? Math.max(0, Math.round(stats.daily_learning_minutes)) : null
  const progress = minutes === null ? 0 : Math.min(100, Math.round(minutes / 60 * 100))
  return (
    <div className="sidebar-card">
      <div>
        <p className="text-sm text-slate-400">今日学习时长</p>
        <strong className="mt-1 block text-3xl text-white">{minutes ?? '--'} <span className="text-base text-slate-400">分钟</span></strong>
        <p className="text-xs text-slate-500">{minutes === null ? '暂无真实时长数据' : '目标 60 分钟'}</p>
      </div>
      <div className="radial-meter" style={{ ['--value' as string]: `${progress * 3.6}deg` }}>
        <span>{minutes === null ? '--' : `${progress}%`}</span>
      </div>
    </div>
  )
}

function StreakCard({ stats }: { stats: SessionStats | null }) {
  const streakDays = typeof stats?.streak_days === 'number' ? Math.max(0, Math.round(stats.streak_days)) : null
  return (
    <div className="sidebar-card">
      <Zap className="h-9 w-9 fill-amber-400 text-amber-400" />
      <div>
        <p className="text-sm text-slate-400">连续学习</p>
        <strong className="text-3xl text-amber-300">{streakDays ?? '--'} <span className="text-base text-slate-400">天</span></strong>
        {streakDays === null && <p className="text-xs text-slate-500">暂无真实连续天数</p>}
      </div>
    </div>
  )
}

export default App


