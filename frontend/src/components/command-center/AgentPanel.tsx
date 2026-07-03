import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Brain, ShieldCheck, Sparkles } from 'lucide-react'
import { HexAvatar, Panel, PanelHeader } from './Panel'
import { cn } from '@/lib/utils'

const AGENTS = [
  { name: 'Profiler', job: '正在分析画像', status: 'online', accent: 'mint', time: '00:12' },
  { name: 'Navigator', job: '规划学习路径', status: 'online', accent: 'mint', time: '00:08' },
  { name: 'Builder', job: '生成学习资源', status: 'online', accent: 'mint', time: '00:15' },
  { name: 'Reviewer', job: '辩论审核中', status: 'working', accent: 'amber', time: '00:10' },
  { name: 'Socrates', job: '引导提问中', status: 'online', accent: 'mint', time: '00:14' },
]

export function AgentPanel({
  onAgentAction,
  traces,
}: {
  onAgentAction: (agentName: string) => void
  traces: any[]
}) {
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
