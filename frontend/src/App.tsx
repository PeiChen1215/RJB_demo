/**
 * 需求：智学蜂巢 EduHive 主应用外壳。
 * 功能：
 *   - 初始化学习会话并轮询学习统计；
 *   - 提供桌面端/移动端导航，切换「AI 学习对话」「知识图谱」「代码沙箱」三大模块；
 *   - 渲染学习画像、迷你统计、资源入口等全局视图。
 * 主要 hooks/函数：
 *   - loadStats：拉取当前会话统计；
 *   - renderMainPanel：根据 activeTab 懒加载对应主面板；
 *   - NavItem/MiniStat/ProfileCard/ResourceCard/PanelSkeleton：布局原子组件。
 * TODO:
 *  - [已完成] 会话创建与统计轮询
 *  - [已完成] 三栏主布局与响应式导航
 *  - [已完成] 主面板懒加载（KnowledgeGraph / PyodideSandbox）
 *  - [待完成] 学习画像持久化与历史会话切换
 *  - [待完成] 错误边界与全局加载状态
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  Code2,
  MessageCircle,
  Network,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react'

import { GlassCard } from '@/components/ui/glass-card'
import { GradientText } from '@/components/ui/gradient-text'
import { IconBox } from '@/components/ui/icon-box'
import { Skeleton } from '@/components/ui/skeleton'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MasteryHeatmap } from '@/components/evaluation/MasteryHeatmap'
import { ResourceViewer } from '@/components/resources/ResourceViewer'
import { sessionApi, type SessionResponse, type EvidenceItem } from '@/services/api'
import { cn } from '@/lib/utils'

const KnowledgeGraph = lazy(() =>
  import('@/components/graph/KnowledgeGraph').then((m) => ({ default: m.KnowledgeGraph }))
)
const PyodideSandbox = lazy(() =>
  import('@/components/code/PyodideSandbox').then((m) => ({ default: m.PyodideSandbox }))
)

interface SessionStats {
  total_events: number
  chat_count: number
  resource_generated_count: number
  exercise_submitted_count: number
  code_executed_count: number
  exercise_passed_count: number
  exercise_failed_count: number
}

type TabKey = 'chat' | 'graph' | 'sandbox' | 'progress'

const NAV_ITEMS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'chat', label: '学习对话', icon: MessageCircle },
  { key: 'graph', label: '知识图谱', icon: Network },
  { key: 'sandbox', label: '代码沙箱', icon: Code2 },
  { key: 'progress', label: '掌握进度', icon: Activity },
]

function App() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('chat')
  const [stats, setStats] = useState<SessionStats | null>(null)

  // 拉取并保存当前会话的学习统计数据
  const loadStats = async (sessionId: string) => {
    try {
      const res = await sessionApi.getStats(sessionId)
      setStats(res.data)
    } catch {
      setStats(null)
    }
  }

  // 初始化会话：创建后立即拉取一次统计
  useEffect(() => {
    sessionApi.create().then((res) => {
      setSession(res.data)
      loadStats(res.data.session_id)
    })
  }, [])

  // 监听全局事件，支持从 ChatPanel / ResourceViewer 一键跳转到代码沙箱
  useEffect(() => {
    const handler = () => setActiveTab('sandbox')
    window.addEventListener('eduhive:open-sandbox', handler)
    return () => window.removeEventListener('eduhive:open-sandbox', handler)
  }, [])

  // 每 5 秒轮询会话统计，实时更新顶部 MiniStat 与学习画像
  useEffect(() => {
    if (!session) return
    const interval = setInterval(() => loadStats(session.session_id), 5000)
    return () => clearInterval(interval)
  }, [session])

  const pageTitle = useMemo(() => {
    switch (activeTab) {
      case 'graph':
        return '知识图谱'
      case 'sandbox':
        return '代码沙箱'
      case 'progress':
        return '掌握进度'
      default:
        return 'AI 学习对话'
    }
  }, [activeTab])

  // 根据当前标签懒加载主面板，降低首屏资源体积
  const renderMainPanel = () => {
    if (activeTab === 'chat') {
      return session ? <ChatPanel session={session} /> : <PanelSkeleton />
    }
    if (activeTab === 'progress') {
      return <MasteryHeatmap sessionId={session?.session_id} />
    }
    return (
      <Suspense fallback={<PanelSkeleton />}>
        {activeTab === 'graph' && <KnowledgeGraph />}
        {activeTab === 'sandbox' && <PyodideSandbox />}
      </Suspense>
    )
  }

  return (
    <div className="app-bg relative min-h-screen overflow-x-hidden text-slate-900">
      {/* Decorative blobs */}
      <div className="blob -left-32 top-0 h-96 w-96 bg-indigo-400/30" />
      <div className="blob -right-32 top-32 h-80 w-80 bg-violet-400/30" />
      <div className="blob bottom-0 left-1/4 h-80 w-80 bg-amber-300/20" />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col lg:flex">
        <div className="flex h-full flex-col border-r border-white/40 bg-white/70 p-5 backdrop-blur-2xl">
          <div className="flex items-center gap-3 px-2 py-3">
            <IconBox icon={Brain} variant="indigo" size="lg" />
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight">智学蜂巢</h1>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">EduHive</p>
            </div>
          </div>

          <nav className="mt-8 flex-1 space-y-2">
            {NAV_ITEMS.map((item, idx) => (
              <NavItem
                key={item.key}
                item={item}
                active={activeTab === item.key}
                onClick={() => setActiveTab(item.key)}
                delay={idx * 0.05}
              />
            ))}
          </nav>

          <GlassCard delay={0.3} className="p-4" hover={false}>
            <p className="text-xs font-semibold text-slate-500">学习状态</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-sm font-semibold text-slate-700">在线学习中</span>
            </div>
          </GlassCard>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-white/40 bg-white/60 backdrop-blur-2xl">
          <div className="flex h-16 items-center justify-between px-4 lg:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <IconBox icon={Brain} variant="indigo" size="sm" />
              <div>
                <h1 className="text-base font-bold leading-tight">智学蜂巢</h1>
                <p className="text-[10px] text-slate-500">Python 个性化学习</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-semibold text-slate-800">{pageTitle}</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline">多智能体 · 个性化 · 实时反馈</span>
              <div className="hidden h-4 w-px bg-slate-200 sm:block" />
              <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur-sm">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-slate-700">服务正常</span>
              </div>
            </div>
          </div>

          {/* Mobile nav */}
          <div className="px-4 pb-3 lg:hidden">
            <div className="flex gap-1 rounded-xl bg-white/70 p-1 shadow-sm backdrop-blur-sm">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                    activeTab === item.key
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md'
                      : 'text-slate-500 hover:bg-white hover:text-slate-800'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {/* Welcome banner */}
            <GlassCard className="relative mb-6 overflow-hidden p-6 lg:p-8" delay={0}>
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-indigo-400/20 blur-3xl" />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                      欢迎回到 <GradientText>智学蜂巢</GradientText>
                    </h2>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                      选择下方模块，继续你的 Python 个性化学习之旅。AI 会实时调整路径与资源。
                    </p>
                  </motion.div>
                </div>
                <div className="flex gap-3">
                  <MiniStat icon={Trophy} value={stats?.chat_count ?? 0} label="对话" />
                  <MiniStat icon={Zap} value={stats?.resource_generated_count ?? 0} label="资源" />
                  <MiniStat icon={CheckCircle2} value={stats?.exercise_submitted_count ?? 0} label="练习" />
                </div>
              </div>
            </GlassCard>

            {/* Bento grid */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <motion.div
                className="xl:col-span-2"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                {renderMainPanel()}
              </motion.div>

              <div className="space-y-6">
                <ProfileCard session={session} stats={stats} delay={0.2} />
                <ResourceCard sessionId={session?.session_id} delay={0.3} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function NavItem({
  item,
  active,
  onClick,
  delay,
}: {
  item: { key: TabKey; label: string; icon: React.ElementType }
  active: boolean
  onClick: () => void
  delay: number
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200',
        active
          ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25'
          : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
      )}
    >
      <item.icon
        className={cn(
          'h-5 w-5 transition-colors',
          active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'
        )}
      />
      {item.label}
      {active && (
        <motion.span
          layoutId="nav-indicator"
          className="absolute right-2 h-2 w-2 rounded-full bg-white"
        />
      )}
    </motion.button>
  )
}

function MiniStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType
  value: number | string
  label: string
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-center shadow-sm backdrop-blur-sm">
      <Icon className="mb-1 h-4 w-4 text-indigo-500" />
      <span className="text-lg font-bold leading-none text-slate-900">{value}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  )
}

function ProfileCard({
  session,
  stats,
  delay,
}: {
  session: SessionResponse | null
  stats: SessionStats | null
  delay: number
}) {
  const [evidence, setEvidence] = useState<Record<string, EvidenceItem[]>>({})
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  useEffect(() => {
    if (!session?.session_id) return
    sessionApi
      .getProfileEvidence(session.session_id)
      .then((res) => setEvidence(res.data.evidence || {}))
      .catch(() => setEvidence({}))
  }, [session?.session_id, stats?.chat_count])

  return (
    <GlassCard className="overflow-hidden" delay={delay}>
      <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 p-5">
        <div className="flex items-center gap-3">
          <IconBox icon={Brain} variant="indigo" />
          <div>
            <h3 className="text-base font-bold text-slate-900">学习画像</h3>
            <p className="text-xs text-slate-500">基于对话动态构建</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {!session ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <BentoStat
                label="知识水平"
                value={`${session.profile.knowledge_level}/5`}
                accent="text-indigo-600"
                bg="bg-indigo-50"
              />
              <BentoStat
                label="已掌握"
                value={session.profile.mastered_concepts.length}
                suffix="个"
                accent="text-emerald-600"
                bg="bg-emerald-50"
              />
            </div>

            <div className="space-y-3">
              {/* 将后端认知风格枚举转换为中文展示 */}
              <ProfileRow
                label="认知风格"
                value={`${session.profile.cognitive_field === 'dependent' ? '场依存' : '场独立'} · ${
                  session.profile.cognitive_modality === 'visual'
                    ? '视觉'
                    : session.profile.cognitive_modality === 'auditory'
                    ? '听觉'
                    : '动觉'
                }`}
              />
              <ProfileRow label="学习节奏" value={session.profile.learning_pace} />
              <ProfileRow label="目标导向" value={session.profile.goal_orientation} />
            </div>

            {/* 画像证据：展示动态构建画像的行为依据 */}
            {Object.keys(evidence).length > 0 && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                <button
                  onClick={() => setEvidenceOpen(!evidenceOpen)}
                  className="flex w-full items-center justify-between text-xs font-bold text-indigo-700"
                >
                  <span>画像证据 ({Object.keys(evidence).length} 个维度)</span>
                  <span>{evidenceOpen ? '收起' : '展开'}</span>
                </button>
                {evidenceOpen && (
                  <div className="mt-2 space-y-2">
                    {Object.entries(evidence).map(([dim, items]) => (
                      <div key={dim}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{dim}</p>
                        <ul className="mt-1 space-y-1">
                          {items.slice(0, 3).map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-600">
                              · {item.evidence_type}
                              {item.description && <span className="text-slate-400"> — {item.description}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 汇总对话、资源、练习、正确率等核心统计 */}
            {stats && (
              <>
                <div className="h-px bg-slate-100" />
                <div className="grid grid-cols-2 gap-3">
                  <TinyStat icon={MessageCircle} label="对话" value={stats.chat_count} />
                  <TinyStat icon={BookOpen} label="资源" value={stats.resource_generated_count} />
                  <TinyStat icon={CheckCircle2} label="练习" value={stats.exercise_submitted_count} />
                  <TinyStat
                    icon={Trophy}
                    label="正确率"
                    value={
                      stats.exercise_submitted_count > 0
                        ? `${Math.round((stats.exercise_passed_count / stats.exercise_submitted_count) * 100)}%`
                        : 'N/A'
                    }
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </GlassCard>
  )
}

function BentoStat({
  label,
  value,
  suffix,
  accent,
  bg,
}: {
  label: string
  value: string | number
  suffix?: string
  accent: string
  bg: string
}) {
  return (
    <div className={cn('rounded-2xl p-4', bg)}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-extrabold tracking-tight', accent)}>
        {value}
        {suffix && <span className="ml-0.5 text-sm font-semibold text-slate-500">{suffix}</span>}
      </p>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800">{value}</span>
    </div>
  )
}

function TinyStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string | number
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
        <Icon className="h-4 w-4 text-indigo-500" />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  )
}

function ResourceCard({ sessionId, delay }: { sessionId?: string; delay: number }) {
  return (
    <GlassCard className="overflow-hidden" delay={delay}>
      <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 p-5">
        <div className="flex items-center gap-3">
          <IconBox icon={BookOpen} variant="emerald" />
          <div>
            <h3 className="text-base font-bold text-slate-900">学习资源</h3>
            <p className="text-xs text-slate-500">多模态个性化生成</p>
          </div>
        </div>
      </div>
      <div className="p-5">
        <ResourceViewer sessionId={sessionId} />
      </div>
    </GlassCard>
  )
}

function PanelSkeleton() {
  return (
    <GlassCard className="flex h-[calc(100vh-12rem)] min-h-[520px] flex-col" hover={false}>
      <div className="border-b border-slate-100 p-5">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex-1 space-y-4">
          <Skeleton className="h-24 w-3/4" />
          <Skeleton className="ml-auto h-20 w-2/3" />
          <Skeleton className="h-24 w-4/5" />
          <Skeleton className="ml-auto h-20 w-1/2" />
        </div>
        <Skeleton className="h-14 w-full" />
      </div>
    </GlassCard>
  )
}

export default App
