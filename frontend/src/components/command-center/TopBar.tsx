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
      <div className="topbar-shell">
        <div className="topbar-title-block">
          <div className="topbar-kicker">
            <span>智学蜂巢课程工作台</span>
            <em>EduHive</em>
          </div>
          <div className="topbar-heading-row">
            <h2>{pageTitle}</h2>
            <p className="topbar-resource-status">{resourceStatus}</p>
          </div>
        </div>

        <div className="topbar-meta">
          <div className="topbar-service-state">
            <span>服务状态</span>
            <i />
            <strong>{health?.status === 'ok' ? '全部在线' : '连接中'}</strong>
          </div>
          <div className="topbar-session">
            <span>会话 ID</span>
            <div>
              <span>{sessionId ? `EH-${sessionId.slice(0, 12).toUpperCase()}` : 'EH-BOOTING'}</span>
              <Copy className="h-3.5 w-3.5" />
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
