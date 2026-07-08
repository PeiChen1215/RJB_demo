import type { SessionStats } from './types'

export function LearningMeter({ stats }: { stats: SessionStats | null }) {
  const minutes = typeof stats?.daily_learning_minutes === 'number' ? Math.max(0, Math.round(stats.daily_learning_minutes)) : null
  const progress = minutes === null ? 0 : Math.min(100, Math.round(minutes / 60 * 100))
  return (
    <div className="sidebar-card">
      <div>
        <p className="text-sm font-semibold text-slate-600">今日学习时长</p>
        <strong className="mt-1 block text-3xl text-slate-900">{minutes ?? '--'} <span className="text-base text-slate-600">分钟</span></strong>
        <p className="text-xs text-slate-500">{minutes === null ? '暂无真实时长数据' : '目标 60 分钟'}</p>
      </div>
      <div className="radial-meter" style={{ ['--value' as string]: `${progress * 3.6}deg` }}>
        <span>{minutes === null ? '--' : `${progress}%`}</span>
      </div>
    </div>
  )
}
