import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import {
  BarChart3,
  BookOpen,
  Brain,
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
  type GraphData,
  type ResourceVersion,
  type SessionResponse,
  type ThinkingStep,
} from '@/services/api'
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
}

interface HeatmapItem {
  concept: string
  mastery_probability: number
  observation_count?: number
  is_mastered?: boolean
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

const DEFAULT_HEATMAP = [
  [90, 85, 80, 75, 70, 60, 40, 50],
  [85, 78, 72, 70, 65, 55, 35, 45],
  [80, 75, 70, 68, 60, 50, 30, 40],
  [70, 65, 60, 55, 50, 45, 25, 35],
  [60, 55, 50, 48, 40, 35, 20, 30],
  [50, 45, 40, 38, 30, 25, 15, 25],
]

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

function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('graph')
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapItem[]>([])
  const [health, setHealth] = useState<HealthDetail | null>(null)
  const [selectedConcept, setSelectedConcept] = useState('文件读写')
  const [selectedNodeId, setSelectedNodeId] = useState('文件读写')
  const [resourceConcept, setResourceConcept] = useState('文件读写')
  const [plannedPath, setPlannedPath] = useState<string[]>(['变量基础', '条件判断', '循环结构', '函数封装', '文件读写'])
  const [showGraphDetail, setShowGraphDetail] = useState(true)
  const [graphFocusNonce, setGraphFocusNonce] = useState(0)
  const [selectedHeatCell, setSelectedHeatCell] = useState<{ row: string; column: string; value: number } | null>(null)
  const [workspaceNote, setWorkspaceNote] = useState('点击知识节点、Agent 或工具按钮开始联动。')
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])
  const [versions, setVersions] = useState<ResourceVersion[]>([])
  const [conceptDetail, setConceptDetail] = useState<any | null>(null)
  const [styleMode, setStyleMode] = useState<'visual' | 'auditory' | 'kinesthetic'>('visual')
  const [chatInput, setChatInput] = useState('我想学习 Python 文件操作')
  const [chatReply, setChatReply] = useState('你已经掌握了函数封装相关知识，接下来我们学习 Python 文件操作，这是非常重要的技能。建议先了解文件的打开模式和基本读写操作，我们可以通过示例练习来巩固理解。要开始学习吗？')
  const [chatLoading, setChatLoading] = useState(false)
  const [code, setCode] = useState(SAMPLE_CODE)
  const [codeOutput, setCodeOutput] = useState(SAMPLE_OUTPUT)
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
    let cancelled = false

    async function bootstrap() {
      try {
        const [sessionRes, graphRes, healthRes] = await Promise.all([
          sessionApi.create('Python 文件操作'),
          graphApi.getGraph(),
          fetch('/health/detail').then((res) => res.json()).catch(() => null),
        ])

        if (cancelled) return
        setSession(sessionRes.data)
        setGraph(graphRes.data)
        setHealth(healthRes)
        await behaviorApi.log(sessionRes.data.session_id, 'command_center_opened', 'Python 文件操作', {
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
  }, [])

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
    if (!session) return
    navigateTo('progress', 'Evaluator 正在重算 BKT 掌握度...')
    try {
      const res = await evaluationApi.analyze(session.session_id)
      setWorkspaceNote(res.data.recommendation || '掌握度分析完成。')
      const heatmapRes = await evaluationApi.getHeatmap(session.session_id)
      setHeatmap(heatmapRes.data.data || [])
    } catch {
      setWorkspaceNote('评估接口暂不可用，当前展示最近一次掌握度。')
    }
  }

  const runCode = async () => {
    setCodeLoading(true)
    try {
      const res = await codeApi.execute(code)
      const stdout = res.data.stdout || ''
      const stderr = res.data.stderr || ''
      setCodeOutput((stdout + (stderr ? `\n${stderr}` : '')).trim() || '代码执行完成，无输出。')
      if (session) {
        await behaviorApi.log(session.session_id, 'code_executed', '文件读写', {
          source: 'command-center',
        }).catch(() => undefined)
      }
    } catch (err) {
      setCodeOutput(err instanceof Error ? err.message : '代码执行失败，请检查后端服务。')
    } finally {
      setCodeLoading(false)
    }
  }

  const sendChat = async () => {
    if (!session || !chatInput.trim()) return
    setChatLoading(true)
    setChatReply('Agent 正在协同分析...')
    try {
      const response = await sessionApi.chatStream(session.session_id, chatInput.trim())
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法建立 SSE 流')

      const decoder = new TextDecoder()
      let buffer = ''
      let finalText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))
          if (event.type === 'thinking' || event.type === 'progress') {
            setChatReply(event.message || '多智能体正在协作...')
          }
          if (event.type === 'complete') {
            finalText = event.agent_response?.content?.message || JSON.stringify(event.agent_response?.content)
          }
        }
      }
      setChatReply(finalText || '对话完成，但未收到完整内容。')
    } catch {
      setChatReply('后端对话接口暂不可用。演示时可继续使用知识图谱、代码沙箱与热力图模块。')
    } finally {
      setChatLoading(false)
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
          if (event.type === 'complete') setResourceStatus('资源生成与辩论审核完成')
        }
      }
      const [thinkingRes, versionRes] = await Promise.allSettled([
        resourceApi.getThinkingPath(concept),
        resourceApi.getVersions(concept),
      ])
      if (thinkingRes.status === 'fulfilled') setThinkingSteps(thinkingRes.value.data.steps || [])
      if (versionRes.status === 'fulfilled') setVersions(versionRes.value.data.versions || [])
      navigateTo('resources', `「${concept}」学习资源已生成，可查看讲义、练习与审核记录。`)
    } catch {
      setResourceStatus('资源生成流未连接，当前展示本地演示状态')
      setWorkspaceNote('资源生成接口未连接；你仍可调试前端交互和其他接口。')
    } finally {
      setResourceLoading(false)
    }
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

  const selectHeatCell = (row: string, column: string, value: number) => {
    setSelectedHeatCell({ row, column, value })
    navigateTo('progress', `已选中「${column}/${row}」能力格，当前掌握度 ${value}%。`)
    if (session) {
      behaviorApi.log(session.session_id, 'heatmap_cell_selected', column, { row, value }).catch(() => undefined)
    }
  }

  const changeStyleMode = (mode: 'visual' | 'auditory' | 'kinesthetic') => {
    setStyleMode(mode)
    setWorkspaceNote(`认知风格渲染切换为：${mode === 'visual' ? '视觉型' : mode === 'auditory' ? '听觉型' : '动觉型'}。`)
    if (session) {
      behaviorApi.log(session.session_id, 'cognitive_style_preview', selectedConcept, { mode }).catch(() => undefined)
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
          <LearningMeter value={70} />
          <StreakCard />
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
                <ProfilePanel session={session} masteredCount={masteredCount} />
                <AgentPanel onAgentAction={runAgentAction} />
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
                  resourceStatus={resourceStatus}
                  versions={versions}
                  thinkingSteps={thinkingSteps}
                  onGenerateResource={() => generateResource(resourceConcept, 'resource')}
                  onPlanPath={planPath}
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
                  reply={chatReply}
                  loading={chatLoading}
                  onSend={sendChat}
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
                  loading={codeLoading}
                  onRun={runCode}
                />
              </div>
            )}

            {activeNav === 'progress' && (
              <div className="module-grid progress-page">
                <HeatmapPanel items={heatmap} stats={stats} selectedCell={selectedHeatCell} onSelectCell={selectHeatCell} onAnalyze={analyzeMastery} />
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
  reply,
  loading,
  onSend,
}: {
  input: string
  setInput: (value: string) => void
  reply: string
  loading: boolean
  onSend: () => void
}) {
  return (
    <Panel className="min-h-[300px]">
      <PanelHeader title="AI 学习对话" icon={MessageSquare} meta={<span className="flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />AI 助教</span>} />
      <div className="flex h-[calc(100%-54px)] flex-col gap-3">
        <div className="flex gap-3">
          <HexAvatar icon={Brain} tone="amber" />
          <div className="dialogue-bubble">
            <p>{reply}</p>
            <span>10:24</span>
          </div>
        </div>
        <div className="ml-auto flex max-w-[82%] gap-3">
          <div className="dialogue-bubble user">
            <p>好的，我想先看一个读取文件的例子。</p>
            <span>10:25</span>
          </div>
          <HexAvatar icon={UserRound} tone="mint" />
        </div>
        <div className="mt-auto flex items-center gap-2 rounded-md border border-white/10 bg-black/25 p-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSend()
            }}
            className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
            placeholder="输入你的问题..."
          />
          <Mic className="h-4 w-4 text-slate-500" />
          <button onClick={onSend} disabled={loading} className="send-button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 fill-current" />}
          </button>
        </div>
      </div>
    </Panel>
  )
}

function ResourceLibraryPanel({
  selectedConcept,
  resourceStatus,
  versions,
  thinkingSteps,
  onGenerateResource,
  onPlanPath,
}: {
  selectedConcept: string
  resourceStatus: string
  versions: ResourceVersion[]
  thinkingSteps: ThinkingStep[]
  onGenerateResource: () => void
  onPlanPath: () => void
}) {
  const latestVersion = versions[0]
  const resourceSections = [
    ['智能讲义', '根据知识图谱与学习画像生成知识讲解。', 'document'],
    ['思维导图', '把概念、前置依赖和易错点组织成结构图。', 'mindmap'],
    ['练习题', '围绕当前掌握度生成巩固题与迁移题。', 'exercise'],
    ['代码案例', '可发送到代码沙箱继续运行和调试。', 'code'],
    ['审核报告', '展示 Reviewer 辩论审核结论和修改理由。', 'review'],
  ]

  return (
    <Panel className="resource-library-panel">
      <PanelHeader
        title="学习资源舱"
        subtitle={selectedConcept}
        icon={BookOpen}
        meta={
          <div className="flex gap-2">
            <button onClick={onPlanPath} className="tool-button"><Route className="h-3.5 w-3.5" />路径</button>
            <button onClick={onGenerateResource} className="run-button"><Sparkles className="h-3.5 w-3.5" />重新生成</button>
          </div>
        }
      />

      <div className="resource-stage">
        <div className="resource-hero">
          <p>当前资源包</p>
          <h3>{selectedConcept}</h3>
          <span>{resourceStatus}</span>
          <div className="resource-scanline" />
        </div>

        <div className="resource-section-grid">
          {resourceSections.map(([title, desc, key], index) => (
            <motion.button
              type="button"
              key={key}
              className="resource-chip text-left"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
            >
              <strong>{title}</strong>
              <span>{desc}</span>
            </motion.button>
          ))}
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
  loading,
  onRun,
}: {
  code: string
  setCode: (value: string) => void
  output: string
  loading: boolean
  onRun: () => void
}) {
  const variables = [
    ['file_path', 'str', "'sample.txt'"],
    ['content', 'str', "'Hello, Edu...'"],
    ['lines', 'list', "['Hello,...']"],
    ['len(lines)', 'int', '3'],
    ['i', 'int', '3'],
    ['line', 'str', "'继续加油！'"],
  ]

  return (
    <Panel className="min-h-[300px]">
      <PanelHeader
        title="代码沙箱"
        subtitle="Pyodide / 后端执行"
        icon={Code2}
        meta={
          <div className="flex gap-2">
            <button onClick={onRun} disabled={loading} className="run-button">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
              运行
            </button>
            <button onClick={() => setCode(SAMPLE_CODE)} className="tool-button"><RefreshCw className="h-3.5 w-3.5" />重置</button>
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
            <p className="console-title">变量</p>
            <table>
              <tbody>
                {variables.map(([name, type, value]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{type}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function ProfilePanel({ session, masteredCount }: { session: SessionResponse | null; masteredCount: number }) {
  const profile = session?.profile
  const [expanded, setExpanded] = useState(false)
  const modality = profile?.cognitive_modality === 'auditory' ? '听觉型' : profile?.cognitive_modality === 'kinesthetic' ? '动觉型' : '视觉型'
  const field = profile?.cognitive_field === 'independent' ? '场独立' : '场依存'

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
          <span>目标：Python 文件操作</span>
        </div>
        <div className="profile-summary">
          <ProfileLine label="知识水平" value={`${profile?.knowledge_level ?? 3}/5`} blocks={profile?.knowledge_level ?? 3} />
          <ProfileLine label="认知风格" value={`${modality} · ${field}`} />
          <ProfileLine label="学习节奏" value={profile?.learning_pace || '稳步推进'} spark />
          <ProfileLine label="学习目标" value="通过 Python 文件操作练习" />
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
    </Panel>
  )
}

function AgentPanel({ onAgentAction }: { onAgentAction: (agentName: string) => void }) {
  return (
    <Panel className="min-h-[230px]">
      <PanelHeader title="Agent 协作" icon={Sparkles} meta={<span className="flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />5/5 在线</span>} />
      <div className="agent-list">
        {AGENTS.map((agent, index) => (
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
            <span>{agent.job}</span>
            <div className="agent-pulses">
              {Array.from({ length: 5 }).map((_, pulseIndex) => (
                <i key={pulseIndex} className={pulseIndex < (agent.status === 'working' ? 2 : 4) ? 'on' : ''} />
              ))}
            </div>
            <em title="本轮协作响应耗时">{agent.time}</em>
          </motion.button>
        ))}
      </div>
    </Panel>
  )
}

function HeatmapPanel({
  items,
  stats,
  selectedCell,
  onSelectCell,
  onAnalyze,
}: {
  items: HeatmapItem[]
  stats: SessionStats | null
  selectedCell: { row: string; column: string; value: number } | null
  onSelectCell: (row: string, column: string, value: number) => void
  onAnalyze: () => void
}) {
  const values = useMemo(() => {
    if (items.length === 0) return DEFAULT_HEATMAP
    const percentages = items.map((item) => Math.round(item.mastery_probability * 100))
    return DEFAULT_HEATMAP.map((row, rowIndex) =>
      row.map((value, cellIndex) => percentages[(rowIndex + cellIndex) % percentages.length] ?? value)
    )
  }, [items])

  const columns = ['基础', '语法', '控制流', '函数', '文件', '模块', '面向对象', '综合']
  const rows = ['记忆', '理解', '应用', '分析', '评价', '创造']

  return (
    <Panel className="min-h-[300px]">
      <PanelHeader title="掌握度热力图" icon={Gauge} meta={<button onClick={onAnalyze} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 hover:border-amber-300/40 hover:text-amber-200">重新分析</button>} />
      <div className="heatmap-grid">
        <span />
        {columns.map((column) => <b key={column}>{column}</b>)}
        {rows.map((row, rowIndex) => (
          <div className="contents" key={row}>
            <b>{row}</b>
            {values[rowIndex].map((value, cellIndex) => (
              <button
                key={`${row}-${cellIndex}`}
                onClick={() => onSelectCell(row, columns[cellIndex], value)}
                className={cn(selectedCell?.row === row && selectedCell.column === columns[cellIndex] && 'selected')}
                style={{ ['--heat-bg' as string]: heatColor(value) }}
              >
                {value}%
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{selectedCell ? `${selectedCell.column}/${selectedCell.row}: ${selectedCell.value}%` : `练习提交：${stats?.exercise_submitted_count ?? 0}`}</span>
          <span>掌握度：0% 25% 50% 75% 100%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-red-600 via-amber-500 to-emerald-400" />
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

function LearningMeter({ value }: { value: number }) {
  return (
    <div className="sidebar-card">
      <div>
        <p className="text-sm text-slate-400">今日学习时长</p>
        <strong className="mt-1 block text-3xl text-white">42 <span className="text-base text-slate-400">分钟</span></strong>
        <p className="text-xs text-slate-500">目标 60 分钟</p>
      </div>
      <div className="radial-meter" style={{ ['--value' as string]: `${value * 3.6}deg` }}>
        <span>{value}%</span>
      </div>
    </div>
  )
}

function StreakCard() {
  return (
    <div className="sidebar-card">
      <Zap className="h-9 w-9 fill-amber-400 text-amber-400" />
      <div>
        <p className="text-sm text-slate-400">连续学习</p>
        <strong className="text-3xl text-amber-300">7 <span className="text-base text-slate-400">天</span></strong>
      </div>
    </div>
  )
}

export default App


