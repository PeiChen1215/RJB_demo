import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import { KnowledgeGraph as EChartsKnowledgeGraph } from '@/components/graph/KnowledgeGraph'
import {
  BarChart3,
  BookOpen,
  Brain,
  Braces,
  ChevronRight,
  Code2,
  Clock3,
  FlaskConical,
  Hexagon,
  Home,
  Layers3,
  Loader2,
  LockKeyhole,
  Mail,
  MessageSquare,
  Mic,
  Network,
  Play,
  RefreshCw,
  Route,
  Search,
  Send,
  Server,
  ShieldCheck,
  Star,
  TerminalSquare,
  UserRound,
} from 'lucide-react'

import {
  behaviorApi,
  authApi,
  codeApi,
  evaluationApi,
  graphApi,
  resourceApi,
  sessionApi,
  type AgentResponse,
  type CodeVariable,
  type GraphData,
  type LearningEvent,
  type LearningPlanResponse,
  type ResourceDetail,
  type ResourceEvolutionResponse,
  type ResourceFeedbackStats,
  type ResourceVersion,
  type SessionResponse,
  type ThinkingStep,
} from '@/services/api'
import { SocraticPanel } from '@/components/socratic/SocraticPanel'
import { FloatingAssistant } from '@/components/digital-human/FloatingAssistant'
import { cn } from '@/lib/utils'
import {
  AgentPanel,
  HeatmapPanel,
  HexAvatar,
  LearningMeter,
  Panel,
  PanelHeader,
  ProfilePanel,
  ResourceLibraryPanel,
  StreakCard,
  TopBar,
  WorkspaceDock,
  type ChatMessage,
  type GraphLayoutData,
  type GraphLayoutNode,
  type HealthDetail,
  type HeatmapItem,
  type KnowledgeEdge,
  type MasteryAnalysisResult,
  type NavKey,
  type PathNode,
  type PersonalPathData,
  type PersonalPathNode,
  type SelectedHeatCell,
  type SessionStats,
  type TutorPayload,
} from '@/components/command-center'

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: 'profile', label: '学习画像', icon: UserRound },
  { key: 'graph', label: '知识图谱', icon: Hexagon },
  { key: 'resources', label: '学习资源', icon: BookOpen },
  { key: 'chat', label: '学习对话', icon: MessageSquare },
  { key: 'code', label: '代码沙箱', icon: Code2 },
  { key: 'progress', label: '掌握进度', icon: BarChart3 },
]

type CourseCard = {
  id: string
  title: string
  category: string
  level: string
  teacher: string
  duration: string
  status: 'ready' | 'empty'
  accent: 'teal' | 'orange' | 'blue' | 'green'
  summary: string
  tags: string[]
}

const COURSE_CATALOG: CourseCard[] = [
  {
    id: 'python',
    title: 'Python 程序设计基础',
    category: '程序设计',
    level: '入门到进阶',
    teacher: '智学蜂巢教研组',
    duration: '6 个模块',
    status: 'ready',
    accent: 'teal',
    summary: '从基础语法、控制流到文件操作，配合练习、代码运行和个性化辅导完成入门训练。',
    tags: ['知识图谱', '代码练习', 'AI 辅导'],
  },
  {
    id: 'data-structure',
    title: '数据结构可视化训练营',
    category: '计算机基础',
    level: '进阶',
    teacher: '算法教研组',
    duration: '8 个模块',
    status: 'empty',
    accent: 'blue',
    summary: '用动画和案例理解数组、链表、栈、队列、树与图。',
    tags: ['动画演示', '算法思维', '待开放'],
  },
  {
    id: 'ai-literacy',
    title: '人工智能通识与提示词实践',
    category: 'AI 通识',
    level: '零基础',
    teacher: 'AI 创新中心',
    duration: '5 个模块',
    status: 'empty',
    accent: 'orange',
    summary: '从大模型能力边界、提示词方法到学习场景应用，建立 AI 使用素养。',
    tags: ['大模型', '提示词', '待开放'],
  },
  {
    id: 'english-speaking',
    title: '英语口语情景对话',
    category: '语言学习',
    level: '日常交流',
    teacher: '语言训练实验室',
    duration: '12 个场景',
    status: 'empty',
    accent: 'green',
    summary: '围绕校园、面试、旅行和学术交流构建口语训练闭环。',
    tags: ['情景对话', '听说训练', '待开放'],
  },
  {
    id: 'math-modeling',
    title: '数学建模方法入门',
    category: '数理基础',
    level: '竞赛预备',
    teacher: '建模工作坊',
    duration: '7 个专题',
    status: 'empty',
    accent: 'teal',
    summary: '覆盖模型假设、数据处理、优化求解和论文表达。',
    tags: ['建模', '数据分析', '待开放'],
  },
  {
    id: 'web-design',
    title: '前端交互设计基础',
    category: '软件工程',
    level: '实践课',
    teacher: '交互设计教研组',
    duration: '9 个项目',
    status: 'empty',
    accent: 'blue',
    summary: '从布局、组件状态到可用性设计，完成一个真实 Web 应用。',
    tags: ['React', '交互设计', '待开放'],
  },
]

const FALLBACK_TARGET_CONCEPT = '变量与赋值'

function getInitialTargetConcept() {
  if (typeof window === 'undefined') return FALLBACK_TARGET_CONCEPT
  // hash 路由下参数位于 # 之后，需从 hash 中解析
  const hashQuery = window.location.hash.includes('?')
    ? window.location.hash.split('?')[1]
    : ''
  const params = new URLSearchParams(window.location.search || hashQuery)
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

function normalizePathState(node: PersonalPathNode | undefined, mastery: number): PathNode['state'] {
  if (node?.is_current || node?.state === 'current') return 'current'
  if (node?.is_mastered || node?.state === 'mastered' || mastery >= 80) return 'mastered'
  if (node?.state === 'waiting') return 'waiting'
  return mastery >= 58 ? 'learning' : 'waiting'
}

function buildBackendPathNodes(layout: GraphLayoutData | null, personalPath: PersonalPathData | null, heatmap: HeatmapItem[]): PathNode[] {
  if (!layout?.nodes?.length) return []
  const visualGraph: GraphData = {
    nodes: layout.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      module: node.module,
      difficulty: node.difficulty,
    })),
    edges: layout.edges,
  }
  const visualNodes = buildPathNodes(visualGraph, heatmap)
  const visualByName = new Map(visualNodes.map((node) => [node.title, node]))
  const masteryFromHeatmap = new Map(heatmap.map((item) => [item.concept, Math.round(item.mastery_probability * 100)]))
  const pathByName = new Map<string, PersonalPathNode>()
  for (const node of personalPath?.path_nodes ?? []) {
    pathByName.set(node.name || node.id, node)
  }

  return layout.nodes.map((node: GraphLayoutNode) => {
    const visualNode = visualByName.get(node.name)
    const pathNode = pathByName.get(node.name) || pathByName.get(node.id)
    const mastery = pathNode?.mastery_probability !== undefined
      ? Math.round(pathNode.mastery_probability * 100)
      : masteryFromHeatmap.get(node.name) ?? Math.max(30, 94 - (node.difficulty ?? 3) * 8)
    return {
      id: node.id || node.name,
      title: node.name,
      module: node.module,
      difficulty: node.difficulty,
      mastery,
      x: visualNode?.x ?? 50,
      y: visualNode?.y ?? 50,
      state: normalizePathState(pathNode, mastery),
      icon: iconForConcept(node.name, node.module),
    }
  })
}

function edgePath(source: PathNode, target: PathNode) {
  const midX = (source.x + target.x) / 2
  const lift = source.y > target.y ? -8 : 8
  return `M${source.x} ${source.y} C${midX} ${source.y + lift}, ${midX} ${target.y - lift}, ${target.x} ${target.y}`
}

function buildPathEdgeKey(source: string, target: string) {
  return `${source}->${target}`
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
    if(/^\[.*\]$/.test(value)) return 'list'
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

function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function extractAgentText(response?: AgentResponse | null, preferredModality?: 'text' | 'visual' | 'auditory' | 'kinesthetic') {
  const rawContent = response?.content
  if (!rawContent) return ''
  const content = typeof rawContent === 'string' ? tryParseJsonString(rawContent) : rawContent
  if (typeof content === 'string') return content
  const directText = (content && (content as any).message) || (content as any).response_message || (content as any).question || (content as any).answer || (content as any).text
  if (directText) {
    const profile = content.profile || response?.profile_update
    if (!profile) return String(directText)
    const mastered = Array.isArray(profile.mastered_concepts) && profile.mastered_concepts.length
      ? `已掌握：${profile.mastered_concepts.join('、')}`
      : ''
    const modalityValue = preferredModality || profile.cognitive_modality
    const modalityLabel: Record<string, string> = { text: '文字型', visual: '视觉型', auditory: '听觉型', kinesthetic: '动觉型' }
    const modality = modalityLabel[modalityValue] || ''
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
  const rawContent = response?.content
  const parsed = typeof rawContent === 'string' ? tryParseJsonString(rawContent) : rawContent
  const baseContent = asObject(parsed)
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
  const [courseMode, setCourseMode] = useState<'portal' | 'python' | 'empty'>(() => {
    if (typeof window === 'undefined') return 'portal'
    if (window.location.hash.startsWith('#/course/python')) return 'python'
    if (window.location.hash.startsWith('#/course/')) return 'empty'
    return 'portal'
  })
  const [selectedCourseId, setSelectedCourseId] = useState(() => {
    if (typeof window === 'undefined') return 'python'
    const match = window.location.hash.match(/^#\/course\/([^/]+)/)
    return match?.[1] || 'python'
  })
  const [activeNav, setActiveNav] = useState<NavKey>('graph')
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [agentTraces, setAgentTraces] = useState<any[]>([])
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [graphLayout, setGraphLayout] = useState<GraphLayoutData | null>(null)
  const [personalPath, setPersonalPath] = useState<PersonalPathData | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapItem[]>([])
  const [health, setHealth] = useState<HealthDetail | null>(null)
  const [targetConcept, setTargetConcept] = useState(getInitialTargetConcept)
  const [selectedConcept, setSelectedConcept] = useState(targetConcept)
  const [selectedNodeId, setSelectedNodeId] = useState(targetConcept)
  const [resourceConcept, setResourceConcept] = useState(targetConcept)
  const [plannedPath, setPlannedPath] = useState<string[]>(['变量基础', '条件判断', '循环结构', '函数封装', targetConcept])
  const [showGraphDetail, setShowGraphDetail] = useState(true)
  const [graphView, setGraphView] = useState<'path' | 'structure'>('path')
  const [graphFocusNonce, setGraphFocusNonce] = useState(0)
  const [selectedHeatCell, setSelectedHeatCell] = useState<SelectedHeatCell | null>(null)
  const [bktDetail, setBktDetail] = useState<any | null>(null)
  const [bktLoading, setBktLoading] = useState(false)
  const [masteryAnalyzing, setMasteryAnalyzing] = useState(false)
  const [masteryAnalysis, setMasteryAnalysis] = useState<MasteryAnalysisResult | null>(null)
  const [workspaceNote, setWorkspaceNote] = useState('点击知识节点、Agent 或工具按钮开始联动。')
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])
  const [versions, setVersions] = useState<ResourceVersion[]>([])
  const [learningPlan, setLearningPlan] = useState<LearningPlanResponse | null>(null)
  const [learningEvents, setLearningEvents] = useState<LearningEvent[]>([])
  const [resourceEvolution, setResourceEvolution] = useState<ResourceEvolutionResponse | null>(null)
  const [feedbackStats, setFeedbackStats] = useState<ResourceFeedbackStats | null>(null)
  const [resourcePackage, setResourcePackage] = useState<ResourceDetail | null>(null)
  const [resourcePanelLoading, setResourcePanelLoading] = useState(false)
  const [conceptDetail, setConceptDetail] = useState<any | null>(null)
  const [styleMode, setStyleMode] = useState<'text' | 'visual' | 'auditory' | 'kinesthetic'>('text')
  const [chatInput, setChatInput] = useState(() => `我想学习 ${targetConcept}`)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    createChatMessage('assistant', `你已经掌握了前置知识，接下来我们学习「${targetConcept}」。你可以直接提问，我会结合学习画像、知识图谱和练习记录进行辅导。`, 'Socrates'),
  ])
  // 当学生切换知识点时，同步更新对话区的欢迎语与当前目标
  useEffect(() => {
    setChatMessages((prev) => {
      if (prev.length === 0) return prev
      const first = prev[0]
      if (first.role === 'assistant' && first.agentName === 'Socrates') {
        return [
          {
            ...first,
            content: `你已经掌握了前置知识，接下来我们学习「${selectedConcept}」。你可以直接提问，我会结合学习画像、知识图谱和练习记录进行辅导。`,
          },
          ...prev.slice(1),
        ]
      }
      return prev
    })
  }, [selectedConcept])

  const [chatLoading, setChatLoading] = useState(false)
  const [code, setCode] = useState(SAMPLE_CODE)
  const [codeOutput, setCodeOutput] = useState(SAMPLE_OUTPUT)
  const [codeVariables, setCodeVariables] = useState<CodeVariable[]>(SAMPLE_VARIABLES)
  const [codeLoading, setCodeLoading] = useState(false)
  const [resourceStatus, setResourceStatus] = useState('资源生成接口待命')
  const [resourceLoading, setResourceLoading] = useState(false)
  const [authUser, setAuthUser] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('eduhive.username') ?? ''
  })
  const [loginUsername, setLoginUsername] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('eduhive.username') ?? ''
  })
  const [loginPassword, setLoginPassword] = useState('')
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login')
  const [authLoading, setAuthLoading] = useState(false)
  const [loginStatus, setLoginStatus] = useState(() => {
    if (typeof window === 'undefined') return '请使用后端账号登录。'
    const savedUser = window.localStorage.getItem('eduhive.username')
    return savedUser ? `已登录：${savedUser}` : '请使用后端账号登录。'
  })

  useEffect(() => {
    const syncRoute = () => {
      const hash = window.location.hash || '#/portal'
      if (hash === '#/portal' || hash === '#/' || hash === '') {
        setCourseMode('portal')
        return
      }

      const courseMatch = hash.match(/^#\/course\/([^/]+)(?:\/([^?]+))?/)
      if (courseMatch) {
        const courseId = courseMatch[1]
        const navKey = courseMatch[2] as NavKey | undefined
        setSelectedCourseId(courseId)
        setCourseMode(courseId === 'python' ? 'python' : 'empty')
        if (navKey && NAV_ITEMS.some((item) => item.key === navKey)) setActiveNav(navKey)
        return
      }

      const key = hash.replace('#/', '') as NavKey
      if (NAV_ITEMS.some((item) => item.key === key)) {
        setCourseMode('python')
        setSelectedCourseId('python')
        setActiveNav(key)
      }
    }
    syncRoute()
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  const navigateTo = (nav: NavKey, note?: string) => {
    const wasGraph = activeNav === 'graph'
    setCourseMode('python')
    setSelectedCourseId('python')
    setActiveNav(nav)
    if (nav === 'graph') {
      setShowGraphDetail(true)
      if (!wasGraph) setGraphFocusNonce((value) => value + 1)
    }
    if (window.location.hash !== `#/course/python/${nav}`) {
      window.location.hash = `/course/python/${nav}`
    }
    setWorkspaceNote(note ?? `已切换到「${NAV_ITEMS.find((item) => item.key === nav)?.label ?? '工作台'}」。`)
  }

  const openPortal = () => {
    setCourseMode('portal')
    window.location.hash = '/portal'
  }

  const openCourse = (course: CourseCard) => {
    setSelectedCourseId(course.id)
    if (course.status === 'ready') {
      setCourseMode('python')
      setActiveNav('graph')
      setShowGraphDetail(true)
      setGraphFocusNonce((value) => value + 1)
      window.location.hash = '/course/python/graph'
      setWorkspaceNote('已进入 Python 课程，建议先查看知识图谱并规划学习路径。')
      return
    }

    setCourseMode('empty')
    window.location.hash = `/course/${course.id}`
  }

  const submitPortalAuth = async (continueCourse?: CourseCard) => {
    if (authUser) {
      setLoginStatus(`已登录：${authUser}`)
      if (continueCourse) openCourse(continueCourse)
      return
    }

    const username = loginUsername.trim()
    if (!username || !loginPassword.trim()) {
      setLoginStatus('请输入账号和密码。')
      return
    }

    setAuthLoading(true)
    setLoginStatus(loginMode === 'register' ? '正在注册账号...' : '正在登录...')
    try {
      const response = loginMode === 'register'
        ? await authApi.register(username, loginPassword)
        : await authApi.login(username, loginPassword)
      const { access_token, username: returnedUsername } = response.data
      window.localStorage.setItem('eduhive.auth_token', access_token)
      window.localStorage.setItem('eduhive.username', returnedUsername || username)
      setAuthUser(returnedUsername || username)
      setLoginUsername(returnedUsername || username)
      setLoginPassword('')
      setLoginStatus(loginMode === 'register' ? '注册成功，已自动登录。' : '登录成功。')
      if (continueCourse) openCourse(continueCourse)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      setLoginStatus(typeof detail === 'string' ? detail : '登录接口暂不可用，请先启动后端服务或检查账号密码。')
    } finally {
      setAuthLoading(false)
    }
  }

  const logoutPortal = async () => {
    setAuthLoading(true)
    try {
      if (window.localStorage.getItem('eduhive.auth_token')) await authApi.logout()
    } catch {
      // 本地退出优先，后端 token 黑名单失败时不阻断用户操作。
    } finally {
      window.localStorage.removeItem('eduhive.auth_token')
      window.localStorage.removeItem('eduhive.username')
      setAuthUser('')
      setLoginPassword('')
      setLoginStatus('已退出登录。')
      setAuthLoading(false)
    }
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
        // 复用已有会话或创建新会话
        const savedSessionId = window.localStorage.getItem('eduhive.session_id')
        let sessionRes
        if (savedSessionId) {
          try {
            sessionRes = await sessionApi.getSession(savedSessionId)
            if (!sessionRes.data?.session_id) throw new Error('stale')
          } catch {
            window.localStorage.removeItem('eduhive.session_id')
            sessionRes = await sessionApi.create(targetConcept)
          }
        } else {
          sessionRes = await sessionApi.create(targetConcept)
        }
        window.localStorage.setItem('eduhive.session_id', sessionRes.data.session_id)

        const [graphRes, layoutRes, healthRes] = await Promise.all([
          graphApi.getGraph(),
          graphApi.getLayout().catch(() => null),
          fetch('/health/detail').then((res) => res.json()).catch(() => null),
        ])

        if (cancelled) return
        const nextTarget = sessionRes.data.target_concept || targetConcept
        const validTargets = new Set(graphRes.data.nodes.map((n) => n.name))
        const fallbackTarget = (() => {
          const basics = graphRes.data.nodes.filter((n) => (n.module && n.module.includes('基础')) || (typeof n.difficulty === 'number' && n.difficulty <= 2))
          const sorted = basics.length ? [...basics].sort((a, b) => (a.difficulty ?? 99) - (b.difficulty ?? 99)) : [...graphRes.data.nodes].sort((a, b) => (a.difficulty ?? 99) - (b.difficulty ?? 99))
          return sorted[0]?.name || nextTarget
        })()
        const finalTarget = validTargets.has(nextTarget) ? nextTarget : fallbackTarget
        window.localStorage.setItem('eduhive.target_concept', finalTarget)
        setTargetConcept(finalTarget)
        setSelectedConcept(finalTarget)
        setSelectedNodeId(finalTarget)
        setResourceConcept(finalTarget)
        if (sessionRes.data.suggested_path?.length) setPlannedPath(sessionRes.data.suggested_path)
        setSession(sessionRes.data)
        if (['text', 'visual', 'auditory', 'kinesthetic'].includes(sessionRes.data.profile.cognitive_modality)) {
          setStyleMode(sessionRes.data.profile.cognitive_modality as 'text' | 'visual' | 'auditory' | 'kinesthetic')
        }
        setGraph(graphRes.data)
        if (layoutRes?.data) setGraphLayout(layoutRes.data)
        setHealth(healthRes)
        graphApi.getPersonalPath(sessionRes.data.session_id, finalTarget)
          .then((pathRes) => {
            if (cancelled || pathRes.data.error) return
            setPersonalPath(pathRes.data)
            const backendPath = pathRes.data.path_nodes?.map((node) => node.name || node.id).filter(Boolean)
            if (backendPath?.length) setPlannedPath(backendPath)
          })
          .catch(() => undefined)
        await behaviorApi.log(sessionRes.data.session_id, 'command_center_opened', finalTarget, {
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
      const [statsRes, heatmapRes, profileRes, planRes, eventsRes] = await Promise.allSettled([
        sessionApi.getStats(sessionId),
        evaluationApi.getHeatmap(sessionId),
        sessionApi.getProfile(sessionId),
        sessionApi.getLearningPlan(sessionId),
        sessionApi.getEvents(sessionId, 8),
      ])

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
      if (heatmapRes.status === 'fulfilled') setHeatmap(heatmapRes.value.data.data || [])
      if (profileRes.status === 'fulfilled' && !profileRes.value.data?.error) {
        setSession((current) => current && current.session_id === sessionId
          ? { ...current, profile: { ...current.profile, ...profileRes.value.data } }
          : current)
      }
      if (planRes.status === 'fulfilled') {
        setLearningPlan(planRes.value.data)
      } else {
        setLearningPlan(null)
      }
      if (eventsRes.status === 'fulfilled') {
        setLearningEvents([...(eventsRes.value.data.events || [])].sort((a, b) =>
          String(b.created_at || '').localeCompare(String(a.created_at || ''))
        ))
      }
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

  const pathNodes = useMemo<PathNode[]>(() => {
    const backendNodes = buildBackendPathNodes(graphLayout, personalPath, heatmap)
    return backendNodes.length ? backendNodes : buildPathNodes(graph, heatmap)
  }, [graphLayout, personalPath, graph, heatmap])
  const graphEdges = useMemo<KnowledgeEdge[]>(() => {
    const baseEdges = graphLayout?.edges?.length ? graphLayout.edges : graph?.edges.length ? graph.edges : [
    { source: 'Python 基础语法', target: '变量基础', strength: 0.8 },
    { source: '数据类型与变量', target: '变量基础', strength: 0.8 },
    { source: '输入与输出', target: '文件读写', strength: 0.8 },
    { source: '变量基础', target: '条件判断', strength: 0.8 },
    { source: '条件判断', target: '循环结构', strength: 0.8 },
    { source: '循环结构', target: '函数封装', strength: 0.8 },
    { source: '函数封装', target: '文件读写', strength: 0.8 },
    ]
    const pathMeta = new Map((personalPath?.path_edges ?? []).map((edge) => [`${edge.source}->${edge.target}`, edge]))
    const merged = baseEdges.map((edge) => ({
      ...edge,
      ...(pathMeta.get(`${edge.source}->${edge.target}`) ?? {}),
    } as KnowledgeEdge & Record<string, any>))
    for (const edge of personalPath?.path_edges ?? []) {
      if (!merged.some((item) => item.source === edge.source && item.target === edge.target)) {
        merged.push({ ...edge, strength: 1 } as KnowledgeEdge & Record<string, any>)
      }
    }
    return merged
  }, [personalPath, graphLayout, graph])

  const masteredCount = session?.profile.mastered_concepts?.length ?? pathNodes.filter((node) => node.mastery >= 80).length
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
      const res = session
        ? await graphApi.getPersonalPath(session.session_id, selectedConcept)
        : await graphApi.getPath(
          pathNodes.filter((node) => node.state === 'mastered').map((node) => node.title),
          selectedConcept
        )
      if (res.data.error) throw new Error(res.data.error)
      setPersonalPath(res.data)
      const nextPath = res.data.path_nodes?.map((node) => node.name || node.id).filter(Boolean)
        || (Array.isArray(res.data.path) ? res.data.path : [])
      if (!nextPath.length) throw new Error('empty path')
      setPlannedPath(nextPath)
      // 聚焦到目标节点，让路径高亮自动进入视图中心
      setSelectedNodeId(selectedConcept)
      setGraphFocusNonce((value) => value + 1)
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
    let loadedResource: ResourceDetail | null = null
    try {
      const [latestRes, thinkingRes, versionRes, evolutionRes, feedbackStatsRes] = await Promise.allSettled([
        resourceApi.getLatest(concept),
        resourceApi.getThinkingPath(concept),
        resourceApi.getVersions(concept),
        resourceApi.getEvolution(concept),
        resourceApi.getFeedbackStats(concept),
      ])
      if (latestRes.status === 'fulfilled') {
        const resource = latestRes.value.data.resource
        loadedResource = resource
        setResourcePackage(resource)
        setResourceStatus(resource ? `已载入「${concept}」资源包` : `「${concept}」暂无已生成资源，请先生成。`)
        setWorkspaceNote(resource ? `已载入「${concept}」资源包` : `「${concept}」暂无已生成资源，请先生成。`)
      }
      if (thinkingRes.status === 'fulfilled') setThinkingSteps(thinkingRes.value.data.steps || [])
      if (versionRes.status === 'fulfilled') setVersions(versionRes.value.data.versions || [])
      if (evolutionRes.status === 'fulfilled') setResourceEvolution(evolutionRes.value.data)
      if (feedbackStatsRes.status === 'fulfilled') setFeedbackStats(feedbackStatsRes.value.data)
      if (session) {
        behaviorApi.log(session.session_id, 'resource_switched', concept, { surface }).catch(() => undefined)
      }
    } catch {
      setResourceStatus('资源详情接口暂不可用')
      setWorkspaceNote('未能读取资源详情，请确认后端服务已启动。')
      setResourceEvolution(null)
      setFeedbackStats(null)
    } finally {
      setResourcePanelLoading(false)
    }
    return loadedResource
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
            setWorkspaceNote(`「${concept}」资源生成与辩论审核完成，可查看讲义、练习与审核记录。`)
          }
        }
      }
      const [thinkingRes, versionRes] = await Promise.allSettled([
        resourceApi.getThinkingPath(concept),
        resourceApi.getVersions(concept),
      ])
      if (thinkingRes.status === 'fulfilled') setThinkingSteps(thinkingRes.value.data.steps || [])
      if (versionRes.status === 'fulfilled') setVersions(versionRes.value.data.versions || [])
      const loadedResource = await loadResource(concept, 'refresh').catch(() => {
        if (completedResource) setResourcePackage(completedResource)
        return completedResource
      })
      const finalResource = loadedResource || completedResource
      if (finalResource) {
        navigateTo('resources', `「${concept}」学习资源已生成，可查看讲义、练习与审核记录。`)
      } else {
        setResourceStatus(`「${concept}」资源生成未完成，请稍后重试或切换知识点。`)
        setWorkspaceNote(`「${concept}」资源生成未完成，已展示最新可用资源（如有）。`)
      }
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

  const submitResourceFeedback = async (concept: string, data: { rating?: number; confusion_marked?: boolean; error_report?: string }) => {
    if (!session) throw new Error('会话未创建')
    const resourceId = resourcePackage?.resource_id || `feedback-${Date.now()}`
    await resourceApi.submitFeedback({
      session_id: session.session_id,
      resource_id: resourceId,
      concept,
      rating: data.rating,
      confusion_marked: data.confusion_marked,
      error_report: data.error_report,
    })
    resourceApi.getFeedbackStats(concept)
      .then((res) => setFeedbackStats(res.data))
      .catch(() => undefined)
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

  const changeStyleMode = async (mode: 'text' | 'visual' | 'auditory' | 'kinesthetic') => {
    setStyleMode(mode)
    setSession((current) => current ? {
      ...current,
      profile: {
        ...current.profile,
        cognitive_modality: mode,
      },
    } : current)
    const modeLabel = mode === 'text' ? '文字型' : mode === 'visual' ? '视觉型' : mode === 'auditory' ? '听觉型' : '动觉型'
    setWorkspaceNote(`认知风格画像已切换为：${modeLabel}。`)
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

  const selectedCourse = COURSE_CATALOG.find((course) => course.id === selectedCourseId) ?? COURSE_CATALOG[0]

  if (courseMode === 'portal') {
    return (
      <CoursePortal
        courses={COURSE_CATALOG}
        onOpenCourse={openCourse}
        authUser={authUser}
        loginUsername={loginUsername}
        loginPassword={loginPassword}
        loginMode={loginMode}
        loginStatus={loginStatus}
        authLoading={authLoading}
        onUsernameChange={setLoginUsername}
        onPasswordChange={setLoginPassword}
        onLoginModeChange={setLoginMode}
        onSubmitAuth={submitPortalAuth}
        onLogout={logoutPortal}
      />
    )
  }

  if (courseMode === 'empty') {
    return <EmptyCoursePage course={selectedCourse} onBack={openPortal} />
  }

  return (
    <div className={cn('command-shell min-h-screen', `style-mode-${styleMode}`)}>
      <aside className="command-sidebar">
        <BrandBlock />
        <button type="button" onClick={openPortal} className="course-back-link">
          <Home className="h-4 w-4" />
          课程广场
        </button>
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

          <CourseStudyHeader
            course={COURSE_CATALOG[0]}
            activeNav={activeNav}
            selectedConcept={selectedConcept}
            masteredCount={masteredCount}
            totalConcepts={graphConcepts.size}
            averageMastery={averageMastery}
            onBack={openPortal}
            onNavigate={navigateTo}
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
                  learningPlan={learningPlan}
                  learningEvents={learningEvents}
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
                  learningPlan={learningPlan}
                  learningEvents={learningEvents}
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
                  evolution={resourceEvolution}
                  feedbackStats={feedbackStats}
                  thinkingSteps={thinkingSteps}
                  styleMode={styleMode}
                  onStyleChange={changeStyleMode}
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
                  onSubmitFeedback={(data) => submitResourceFeedback(resourceConcept, data)}
                />
                <WorkspaceDock
                  activeNav={activeNav}
                  selectedConcept={selectedConcept}
                  styleMode={styleMode}
                  workspaceNote={workspaceNote}
                  thinkingSteps={thinkingSteps}
                  versions={versions}
                  learningPlan={learningPlan}
                  learningEvents={learningEvents}
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
                  targetConcept={selectedConcept}
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
                  learningPlan={learningPlan}
                  learningEvents={learningEvents}
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
                <WorkspaceDock
                  activeNav={activeNav}
                  selectedConcept={selectedConcept}
                  styleMode={styleMode}
                  workspaceNote={workspaceNote}
                  thinkingSteps={thinkingSteps}
                  versions={versions}
                  learningPlan={learningPlan}
                  learningEvents={learningEvents}
                  onStyleChange={changeStyleMode}
                  onAnalyze={analyzeMastery}
                  onPlanPath={planPath}
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
                  learningPlan={learningPlan}
                  learningEvents={learningEvents}
                  onStyleChange={changeStyleMode}
                  onAnalyze={analyzeMastery}
                  onPlanPath={planPath}
                />
              </div>
            )}
          </section>
        </div>
      </main>
      <FloatingAssistant activeNav={activeNav} selectedConcept={selectedConcept} />
    </div>
  )
}

type CoursePortalProps = {
  courses: CourseCard[]
  onOpenCourse: (course: CourseCard) => void
  authUser: string
  loginUsername: string
  loginPassword: string
  loginMode: 'login' | 'register'
  loginStatus: string
  authLoading: boolean
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLoginModeChange: (value: 'login' | 'register') => void
  onSubmitAuth: (continueCourse?: CourseCard) => void
  onLogout: () => void
}

function CoursePortal({
  courses,
  onOpenCourse,
  authUser,
  loginUsername,
  loginPassword,
  loginMode,
  loginStatus,
  authLoading,
  onUsernameChange,
  onPasswordChange,
  onLoginModeChange,
  onSubmitAuth,
  onLogout,
}: CoursePortalProps) {
  const featured = courses[0]
  const categories = ['全部课程', ...Array.from(new Set(courses.map((course) => course.category)))]
  const [activeCategory, setActiveCategory] = useState('全部课程')
  const [courseQuery, setCourseQuery] = useState('')
  const [loginCardPulse, setLoginCardPulse] = useState(false)
  const loginCardRef = useRef<HTMLFormElement | null>(null)
  const coursesRef = useRef<HTMLElement | null>(null)
  const filteredCourses = useMemo(() => {
    const keyword = courseQuery.trim().toLowerCase()
    return courses.filter((course) => {
      const matchesCategory = activeCategory === '全部课程' || course.category === activeCategory
      const searchPool = [course.title, course.category, course.level, course.teacher, course.summary, ...course.tags]
        .join(' ')
        .toLowerCase()
      return matchesCategory && (!keyword || searchPool.includes(keyword))
    })
  }, [activeCategory, courseQuery, courses])

  const focusLoginCard = () => {
    loginCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setLoginCardPulse(true)
    window.setTimeout(() => setLoginCardPulse(false), 900)
    if (!authUser) {
      window.setTimeout(() => {
        loginCardRef.current?.querySelector<HTMLInputElement>('input[name="portal-username"]')?.focus()
      }, 280)
    }
  }

  const showCourseResults = () => {
    coursesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="course-portal min-h-screen">
      <header className="portal-nav">
        <BrandBlock />
        <nav>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={activeCategory === category ? 'active' : ''}
              aria-pressed={activeCategory === category}
              onClick={() => {
                setActiveCategory(category)
                coursesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {category}
            </button>
          ))}
        </nav>
        <div className="portal-login">
          <button type="button" className="portal-login-status" onClick={focusLoginCard}>
            <Mail className="h-4 w-4" /> {authUser || '未登录'}
          </button>
          <button type="button" onClick={authUser ? onLogout : focusLoginCard} disabled={authLoading}>
            <LockKeyhole className="h-4 w-4" /> {authUser ? '退出' : '登录'}
          </button>
        </div>
      </header>

      <main className="portal-main">
        <section className="portal-hero">
          <div className="portal-hero-copy">
            <p className="portal-kicker">AI 驱动的个性化课程空间</p>
            <h1><span>选择课程</span><span>进入你的智学蜂巢</span></h1>
            <span>从目标出发，系统会结合你的学习记录与掌握情况，推荐更适合当前阶段的课程内容。</span>
            <div className="portal-search">
              <Search className="h-5 w-5" />
              <input
                value={courseQuery}
                onChange={(event) => setCourseQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') showCourseResults()
                }}
                placeholder="搜索 Python 文件读写、数据结构、AI 通识"
                aria-label="课程搜索"
              />
              <button type="button" onClick={showCourseResults}>搜索课程</button>
            </div>
            <div className="portal-hero-actions">
              <button type="button" className="portal-primary-action" onClick={() => onOpenCourse(featured)}>
                进入推荐课程 <ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" className="portal-ghost-action" onClick={focusLoginCard}>
                {authUser ? '查看学习账户' : '登录后同步学习记录'}
              </button>
            </div>
          </div>
          <form ref={loginCardRef} className={cn('portal-login-card', loginCardPulse && 'is-attention')} onSubmit={(event) => {
            event.preventDefault()
            onSubmitAuth()
          }}>
            <strong>{authUser ? '学习账户' : loginMode === 'register' ? '创建学习账户' : '登录学习账户'}</strong>
            {authUser ? (
              <>
                <div className="portal-account-panel">
                  <span>当前账号</span>
                  <b>{authUser}</b>
                </div>
                <button type="button" onClick={() => onOpenCourse(featured)}>继续学习</button>
                <button type="button" className="portal-secondary-button" onClick={onLogout} disabled={authLoading}>退出登录</button>
              </>
            ) : (
              <>
                <div className="portal-login-tabs" role="group" aria-label="登录模式">
                  <button type="button" className={loginMode === 'login' ? 'active' : ''} onClick={() => onLoginModeChange('login')}>登录</button>
                  <button type="button" className={loginMode === 'register' ? 'active' : ''} onClick={() => onLoginModeChange('register')}>注册</button>
                </div>
                <label>
                  <span>账号</span>
                  <input name="portal-username" value={loginUsername} onChange={(event) => onUsernameChange(event.target.value)} placeholder="请输入用户名或邮箱" autoComplete="username" />
                </label>
                <label>
                  <span>密码</span>
                  <input value={loginPassword} onChange={(event) => onPasswordChange(event.target.value)} placeholder="请输入密码" type="password" autoComplete={loginMode === 'register' ? 'new-password' : 'current-password'} />
                </label>
                <button type="submit" disabled={authLoading}>
                  {authLoading ? '处理中...' : loginMode === 'register' ? '注册' : '登录'}
                </button>
              </>
            )}
            <p>{loginStatus}</p>
          </form>
        </section>

        <section className="portal-section" ref={coursesRef}>
          <div className="portal-section-title">
            <div>
              <p>课程中心</p>
              <h2>{activeCategory === '全部课程' ? '推荐课程' : activeCategory}</h2>
            </div>
            <span>{filteredCourses.length ? `已为你筛选出 ${filteredCourses.length} 门课程。开放课程可直接进入学习，建设中的课程会持续更新。` : '没有找到匹配课程，可以切换分类或修改关键词。'}</span>
          </div>
          <div className="course-card-grid">
            {filteredCourses.map((course) => (
              <button key={course.id} type="button" onClick={() => onOpenCourse(course)} className={cn('course-card', `course-card-${course.accent}`)}>
                <div className="course-card-cover">
                  <BookOpen className="h-7 w-7" />
                  <span>{course.status === 'ready' ? '已开放' : '建设中'}</span>
                </div>
                <div className="course-card-body">
                  <p>{course.category} · {course.level}</p>
                  <h3>{course.title}</h3>
                  <span>{course.summary}</span>
                  <div className="course-card-meta">
                    <em><UserRound className="h-3.5 w-3.5" />{course.teacher}</em>
                    <em><Clock3 className="h-3.5 w-3.5" />{course.duration}</em>
                  </div>
                  <div className="course-card-tags">
                    {course.tags.map((tag) => <i key={tag}>{tag}</i>)}
                  </div>
                </div>
                <strong>{course.status === 'ready' ? '进入课程' : '查看状态'}<ChevronRight className="h-4 w-4" /></strong>
              </button>
            ))}
            {!filteredCourses.length && (
              <div className="course-empty-result">
                <Search className="h-6 w-6" />
                <strong>暂无匹配课程</strong>
                <span>试试“Python”“AI”或切换到全部课程。</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function EmptyCoursePage({ course, onBack }: { course: CourseCard; onBack: () => void }) {
  return (
    <div className="empty-course-page min-h-screen">
      <header className="portal-nav">
        <BrandBlock />
        <button type="button" onClick={onBack} className="portal-back-button"><Home className="h-4 w-4" /> 返回课程广场</button>
      </header>
      <main className="empty-course-main">
        <div className={cn('empty-course-card', `course-card-${course.accent}`)}>
          <div className="course-card-cover">
            <BookOpen className="h-8 w-8" />
            <span>建设中</span>
          </div>
          <p>{course.category} · {course.level}</p>
          <h1>{course.title}</h1>
          <span>{course.summary}</span>
          <strong>暂无课程内容哦~</strong>
          <button type="button" onClick={onBack}>去选择已开放课程</button>
        </div>
      </main>
    </div>
  )
}

function CourseStudyHeader({
  course,
  activeNav,
  selectedConcept,
  masteredCount,
  totalConcepts,
  averageMastery,
  onBack,
  onNavigate,
}: {
  course: CourseCard
  activeNav: NavKey
  selectedConcept: string
  masteredCount: number
  totalConcepts: number
  averageMastery: number
  onBack: () => void
  onNavigate: (nav: NavKey) => void
}) {
  const activeItem = NAV_ITEMS.find((item) => item.key === activeNav) ?? NAV_ITEMS[0]
  const moduleDescriptions: Record<NavKey, string> = {
    profile: '查看画像与协作状态',
    graph: '规划知识路径',
    resources: '学习讲义与练习',
    chat: '向 AI 助教提问',
    code: '运行 Python 代码',
    progress: '复盘掌握度变化',
  }
  const statCards = [
    { label: '学习模块', value: NAV_ITEMS.length, unit: '个', icon: Layers3 },
    { label: '知识节点', value: totalConcepts || '待载入', unit: totalConcepts ? '个' : '', icon: Network },
    { label: '已掌握', value: masteredCount, unit: '个', icon: Brain },
    { label: '平均掌握', value: `${averageMastery}%`, unit: '', icon: BarChart3 },
  ]

  return (
    <div className="course-study-header">
      <div className="course-cover-main">
        <button type="button" onClick={onBack} className="course-back-button"><Home className="h-4 w-4" /> 课程广场</button>
        <p>{course.category} · {course.level}</p>
        <div className="course-cover-title-row">
          <h2>{course.title}</h2>
          <em>智慧课程</em>
        </div>
        <span>{course.summary}</span>
        <div className="course-cover-tags">
          <strong>{course.teacher}</strong>
          <i>{course.duration}</i>
          {course.tags.map((tag) => <i key={tag}>{tag}</i>)}
        </div>
      </div>

      <div className="course-cover-system">
        <div className="course-system-title">
          <span>课程学习面板</span>
          <strong>当前模块和进度会随你的学习记录更新</strong>
        </div>
        <div className="course-current-goal">
          <activeItem.icon className="h-5 w-5" />
          <div>
            <span>当前学习空间</span>
            <strong>{activeItem.label}</strong>
          </div>
        </div>
        <div className="course-goal-pill">
          <Route className="h-4 w-4" />
          <span>目标：{selectedConcept}</span>
        </div>
        <div className="course-stat-stack">
          {statCards.map((item) => (
            <div key={item.label}>
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
              <strong>{item.value}<small>{item.unit}</small></strong>
            </div>
          ))}
        </div>
      </div>

      <nav className="course-cover-tabs">
        {NAV_ITEMS.map((item) => (
          <button key={item.key} type="button" onClick={() => onNavigate(item.key)} className={cn(activeNav === item.key && 'active')}>
            <item.icon className="h-4 w-4" />
            <span>
              <strong>{item.label}</strong>
              <small>{moduleDescriptions[item.key]}</small>
            </span>
          </button>
        ))}
      </nav>
      <span className="course-study-tip"><Star className="h-4 w-4" /> 当前正在学习「{selectedConcept}」，你可以在{activeItem.label}中继续推进。</span>
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
  onSwitchToStructure,
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
  onSwitchToStructure?: () => void
  onNodeSelect: (node: PathNode) => void
  onCanvasBlankClick: () => void
  onPlanPath: () => void
  onGenerateResource: (concept: string) => void
}) {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[nodes.length - 1]
  const selectedIncomingEdge = edges.find((edge) => edge.target === selectedNode?.title) as (KnowledgeEdge & Record<string, any>) | undefined
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const mapX = useMotionValue(0)
  const [canvasSize, setCanvasSize] = useState({ width: 920, height: 355 })
  const plannedNodeSet = useMemo(() => new Set(plannedPath), [plannedPath])
  const plannedEdgeSet = useMemo(() => {
    const edgeSet = new Set<string>()
    plannedPath.forEach((name, index) => {
      const next = plannedPath[index + 1]
      if (next) edgeSet.add(buildPathEdgeKey(name, next))
    })
    return edgeSet
  }, [plannedPath])
  const nodeByTitle = useMemo(() => new Map(nodes.map((node) => [node.title, node])), [nodes])
  const renderedEdges = useMemo(() => edges
    .map((edge) => {
      const source = nodeByTitle.get(edge.source)
      const target = nodeByTitle.get(edge.target)
      if (!source || !target) return null
      return {
        edge,
        source,
        target,
        d: edgePath(source, target),
        active: plannedEdgeSet.has(buildPathEdgeKey(edge.source, edge.target)),
      }
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge)), [edges, nodeByTitle, plannedEdgeSet])
  const activeEdges = useMemo(() => renderedEdges.filter((item) => item.active), [renderedEdges])
  const mapPixelWidth = Math.max(1900, nodes.length * 260)
  const dragLeft = -Math.max(820, mapPixelWidth - 920)
  const nodeX = selectedNode ? (selectedNode.x / 100) * mapPixelWidth : 0
  const nodeY = selectedNode ? (selectedNode.y / 100) * canvasSize.height : 0
  const detailLeft = selectedNode
    ? Math.min(mapPixelWidth - 270, Math.max(12, nodeX + 82))
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
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {onSwitchToStructure && <button type="button" onClick={onSwitchToStructure} className="rounded-full px-2 py-0.5 border border-white/10 text-slate-500 hover:text-amber-300 hover:border-amber-500/30 transition">力导向结构 →</button>}
            <span className="text-slate-600">|</span>
            <LegendDot color="mint" label="已掌握" />
            <LegendDot color="amber" label="学习中" />
            <LegendDot color="gray" label="待学习" />
          </div>
        }
      />

      {plannedPath.length > 1 && (
        <div className="absolute left-3 right-3 top-[54px] z-20 flex items-center gap-2 rounded-b-md border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 backdrop-blur-sm">
          <Route className="h-3.5 w-3.5" />
          <span className="font-medium">已规划路径：</span>
          <span className="truncate">{plannedPath.join(' → ')}</span>
        </div>
      )}

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
              onPlannedPath={plannedNodeSet.has(node.title)}
              known={graphConcepts.size === 0 || graphConcepts.has(node.title)}
              onSelect={() => onNodeSelect(node)}
            />
          ))}

          {showDetail && selectedNode && (
            <motion.div
              key={selectedNodeId}
              className="target-card"
              style={{ left: detailLeft, top: detailTop }}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              onClick={(event) => event.stopPropagation()}
            >
              <p className="font-bold text-amber-300">当前目标：{selectedConcept}</p>
              <p className="mt-2 text-slate-400">
                前置依赖：
                {(() => {
                  const prerequisites = conceptDetail?.prerequisites?.length
                    ? conceptDetail.prerequisites
                    : selectedIncomingEdge?.prerequisites?.length
                      ? selectedIncomingEdge.prerequisites
                    : edges.filter((e) => e.target === selectedNode.title).map((e) => e.source)
                  return prerequisites.length > 0
                    ? prerequisites.join('、')
                    : (plannedPath.slice(0, -1).join('、') || '无前置依赖')
                })()}
              </p>
              {selectedIncomingEdge?.reason && (
                <p className="mt-2 leading-relaxed text-amber-100/80">推荐理由：{selectedIncomingEdge.reason}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-slate-400">掌握度：</span>
                <strong className="text-amber-200">{averageMastery}%</strong>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-300" style={{ width: `${averageMastery}%` }} />
                </span>
              </div>
              <p className="mt-2 leading-relaxed text-slate-300">
                易错点：{conceptDetail?.common_errors?.join('、') || selectedIncomingEdge?.pitfalls?.filter(Boolean).join('、') || '后端暂未返回该节点易错点'}
              </p>
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
  const waveCount = selected ? 3 : onPlannedPath ? 2 : 0

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
      {waveCount > 0 && (
        <div className="node-wave-field" aria-hidden="true">
          {Array.from({ length: waveCount }).map((_, index) => <span key={index} />)}
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
  onSend: (messageOverride?: string) => void
  onContinueTutor: () => void
}) {
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const voiceRecognitionRef = useRef<any | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'unsupported'>('idle')
  const defaultPrompt = `我想学习 ${targetConcept}`

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.stop?.()
      voiceRecognitionRef.current = null
    }
  }, [])

  const handleInputFocus = () => {
    if (input.trim() === defaultPrompt) setInput('')
  }

  const handleInputBlur = () => {
    if (!input.trim()) setInput(defaultPrompt)
  }

  const handleSend = () => {
    if (loading) return
    onSend(input.trim() || defaultPrompt)
  }

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
        const current = input.trim() === defaultPrompt ? '' : input.trim()
        setInput(current ? `${current} ${transcript}` : transcript)
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
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) handleSend()
              }}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
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
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={handleSend} disabled={loading} className="send-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 fill-current" />}
            </button>
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

function LegendDot({ color, label }: { color: 'mint' | 'amber' | 'gray'; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <i className={cn('h-2.5 w-2.5 rounded-full', color === 'mint' && 'bg-emerald-300', color === 'amber' && 'bg-amber-300', color === 'gray' && 'bg-slate-500')} />
      {label}
    </span>
  )
}

export default App
