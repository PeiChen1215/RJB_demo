import { Zap } from 'lucide-react'
import type { SessionStats } from './types'

export function StreakCard({ stats }: { stats: SessionStats | null }) {
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
