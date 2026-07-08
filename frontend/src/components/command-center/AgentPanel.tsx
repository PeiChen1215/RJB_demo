import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Brain, ShieldCheck, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HexAvatar, Panel, PanelHeader } from './Panel'

const AGENTS = [
  { name: 'Profiler', job: '画像分析就绪', status: 'online', accent: 'mint', time: '00:12' },
  { name: 'Navigator', job: '路径规划就绪', status: 'online', accent: 'mint', time: '00:08' },
  { name: 'Builder', job: '资源生成就绪', status: 'online', accent: 'mint', time: '00:15' },
  { name: 'Reviewer', job: '资源审核就绪', status: 'online', accent: 'amber', time: '00:10' },
  { name: 'Socrates', job: '辅导提问就绪', status: 'online', accent: 'mint', time: '00:14' },
]

function normalizeAgentName(name?: string): string {
  if (!name) return ''
  const base = name.split('/')[0].trim()
  if (base === 'Generator') return 'Builder'
  return base
}

const STAGE_LABELS: Record<string, string> = {
  profiler: '分析画像',
  navigator: '规划路径',
  generator: '生成资源',
  builder: '生成资源',
  reviewer: '辩论审核',
  tutor: '苏格拉底辅导',
  evaluator: '学习评估',
  debate: '辩论审核',
  socrates: '苏格拉底辅导',
  path: '路径规划',
}

function formatStage(stage: string | undefined, defaultJob: string) {
  if (!stage) return defaultJob
  return STAGE_LABELS[stage.toLowerCase()] || stage
}

function getAgentTone(status: string): 'mint' | 'amber' | 'error' {
  if (status === 'working') return 'amber'
  if (status === 'error') return 'error'
  return 'mint'
}

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
      const name = normalizeAgentName(trace.agent_name)
      if (!name) continue
      if (!map[name] || (trace.created_at && trace.created_at > map[name].created_at)) {
        map[name] = trace
      }
    }
    return map
  }, [traces])

  const runningCount = useMemo(() => traces.filter((t) => t.status === 'running').length, [traces])
  const failedCount = useMemo(() => traces.filter((t) => t.status === 'failed').length, [traces])
  const tracedAgentCount = Object.keys(latestByAgent).length

  return (
    <Panel className="agent-panel min-h-[230px]">
      <PanelHeader
        title="Agent 协作"
        icon={Sparkles}
        meta={<span className="flex items-center gap-2 text-xs text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />{traces.length ? `${tracedAgentCount}/5 有调用记录` : '等待后端 trace'}</span>}
      />
      <div className="agent-list">
        {AGENTS.map((agent, index) => {
          const trace = latestByAgent[agent.name]
          const finishedStatus = trace?.status === 'running' ? 'working' : trace?.status === 'failed' ? 'error' : 'online'
          const status = trace ? finishedStatus : agent.status
          const tone = getAgentTone(status)
          const timeText = trace ? `${trace.duration_ms}ms` : '空闲'
          const label = trace
            ? trace.status === 'failed'
              ? `${agent.job} · 异常`
              : trace.status === 'running'
                ? `${agent.job} · 执行中`
                : `${agent.job} · 完成`
            : `${agent.job} · 暂无记录`

          return (
            <motion.button
              type="button"
              onClick={() => onAgentAction(agent.name)}
              key={agent.name}
              className={cn('agent-row text-left', tone)}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <HexAvatar icon={index === 3 ? ShieldCheck : Brain} tone={tone} small />
              <strong>{agent.name}</strong>
              <span>{trace ? formatStage(trace.stage, agent.job) : label}</span>
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
            const tone = getAgentTone(status)
            return (
              <span
                key={agent.name}
                className={cn(tone, status === 'working' && 'working', status === 'error' && 'error')}
                style={{ '--agent-index': index } as Record<string, number>}
              />
            )
          })}
          <strong>协作中枢</strong>
        </div>
        <div className="agent-metrics">
          <p><span>活跃任务</span><strong>{runningCount || 0}</strong></p>
          <p><span>链路状态</span><strong>{failedCount ? `异常 ${failedCount}` : traces.length ? '稳定' : '待触发'}</strong></p>
          <p><span>Trace 覆盖</span><strong>{tracedAgentCount}/5</strong></p>
        </div>
      </div>
    </Panel>
  )
}
