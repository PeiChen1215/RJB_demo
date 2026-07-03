import { Copy, Loader2, Sparkles } from 'lucide-react'
import type { HealthDetail } from './types'

export function TopBar({
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
