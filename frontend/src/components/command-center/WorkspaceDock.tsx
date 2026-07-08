import { cn } from '@/lib/utils'
import type { LearningEvent, LearningPlanResponse, ResourceVersion, ThinkingStep } from '@/services/api'
import type { NavKey } from './types'

export function WorkspaceDock({
  activeNav,
  selectedConcept,
  styleMode,
  workspaceNote,
  thinkingSteps,
  versions,
  learningPlan,
  learningEvents,
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
  learningPlan?: LearningPlanResponse | null
  learningEvents?: LearningEvent[]
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

  const fallbackSteps: ThinkingStep[] = [
    { agent: 'Navigator', stage: 'path', message: '选择知识节点后可规划路径。' },
    { agent: 'Builder', stage: 'resource', message: '顶部或节点详情可生成当前知识点资源。' },
    { agent: 'Evaluator', stage: 'analysis', message: '热力图点击会记录行为并联动评估。' },
  ]

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
        {(thinkingSteps.length > 0 ? thinkingSteps : fallbackSteps).slice(0, 3).map((step, index) => (
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
        {learningPlan?.plan?.length ? (
          <p>
            <strong>Plan</strong>
            <span>
              后端规划 {learningPlan.plan.length} 个节点，预计 {learningPlan.total_minutes} 分钟：
              {learningPlan.plan.slice(0, 3).map((item) => item.concept).join(' → ')}
            </span>
          </p>
        ) : null}
        {learningEvents?.[0] ? (
          <p>
            <strong>Event</strong>
            <span>
              最近行为：{learningEvents[0].event_type}
              {learningEvents[0].concept ? ` · ${learningEvents[0].concept}` : ''}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
