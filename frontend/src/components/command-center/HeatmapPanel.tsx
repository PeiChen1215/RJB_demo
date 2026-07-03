import { useMemo } from 'react'
import { Gauge, Loader2 } from 'lucide-react'
import { Panel, PanelHeader } from './Panel'
import { cn } from '@/lib/utils'
import type { HeatmapItem, MasteryAnalysisResult, SelectedHeatCell, SessionStats } from './types'

function heatColor(value: number) {
  if (value >= 78) return 'linear-gradient(135deg, rgba(22,163,74,.88), rgba(52,211,153,.62))'
  if (value >= 62) return 'linear-gradient(135deg, rgba(132,204,22,.74), rgba(245,158,11,.52))'
  if (value >= 45) return 'linear-gradient(135deg, rgba(245,158,11,.78), rgba(180,83,9,.62))'
  return 'linear-gradient(135deg, rgba(185,28,28,.82), rgba(124,45,18,.68))'
}

export function HeatmapPanel({
  items,
  stats,
  selectedCell,
  bktDetail,
  bktLoading,
  analyzing,
  analysis,
  onSelectCell,
  onAnalyze,
}: {
  items: HeatmapItem[]
  stats: SessionStats | null
  selectedCell: SelectedHeatCell | null
  bktDetail: any | null
  bktLoading: boolean
  analyzing: boolean
  analysis: MasteryAnalysisResult | null
  onSelectCell: (cell: SelectedHeatCell) => void
  onAnalyze: () => void
}) {
  const cells = useMemo(() => {
    return items.map((item) => {
      const value = Math.round(item.mastery_probability * 100)
      const band = value >= 78 ? '已掌握' : value >= 62 ? '需巩固' : value >= 45 ? '薄弱' : '待学习'
      return {
        row: band,
        column: '真实知识点',
        concept: item.concept,
        value,
        observations: item.observation_count ?? 0,
        mastered: item.is_mastered || value >= 78,
      }
    })
  }, [items])
  const summary = useMemo(() => {
    const average = items.length
      ? Math.round(items.reduce((sum, item) => sum + item.mastery_probability, 0) / items.length * 100)
      : null
    const mastered = items.filter((item) => item.is_mastered || item.mastery_probability >= 0.78).length
    const weak = items.filter((item) => item.mastery_probability < 0.6).length
    return { average, mastered, weak, total: items.length }
  }, [items])
  const bktParams = bktDetail?.bkt_params || {}
  const observationCount = Number(bktParams.observation_count ?? 0)
  const modelEvidenceText = bktDetail?.concept
    ? observationCount > 0
      ? `基于 ${observationCount} 次练习记录判断`
      : '暂无该知识点练习记录，当前为初始估计'
    : '点击热力格后查看模型证据'

  return (
    <Panel className="heatmap-panel min-h-[300px]">
      <PanelHeader
        title="掌握度热力图"
        subtitle="BKT 驱动的知识点诊断"
        icon={Gauge}
        meta={
          <button onClick={onAnalyze} disabled={analyzing} className="heatmap-analyze-button">
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
            {analyzing ? '分析中' : '重新分析'}
          </button>
        }
      />
      <div className="heatmap-overview">
        <div>
          <span>平均掌握</span>
          <strong>{summary.average === null ? '--' : `${summary.average}%`}</strong>
        </div>
        <div>
          <span>稳定掌握</span>
          <strong>{summary.mastered}/{summary.total}</strong>
        </div>
        <div>
          <span>薄弱预警</span>
          <strong>{summary.weak}</strong>
        </div>
        <div>
          <span>练习提交</span>
          <strong>{stats?.exercise_submitted_count ?? 0}</strong>
        </div>
      </div>
      {cells.length > 0 ? (
        <div className="heatmap-grid real-knowledge-grid">
          {cells.map((cell) => (
            <button
              key={cell.concept}
              onClick={() => onSelectCell(cell)}
              className={cn(selectedCell?.concept === cell.concept && 'selected', cell.mastered && 'mastered')}
              style={{ ['--heat-bg' as string]: heatColor(cell.value), ['--heat-strength' as string]: `${Math.max(0.18, cell.value / 100)}` }}
            >
              <span className="heatmap-band">{cell.row}</span>
              <strong>{cell.value}%</strong>
              <span>{cell.concept}</span>
              <em>{cell.observations} 次练习记录</em>
            </button>
          ))}
        </div>
      ) : (
        <div className="heatmap-empty">
          <Gauge className="h-6 w-6" />
          <strong>暂无真实掌握度数据</strong>
          <span>完成练习、判题或点击“重新分析”后，这里会按后端知识点逐项生成热力卡片。</span>
        </div>
      )}
      <div className="heatmap-footer">
        <div className="heatmap-selected">
          <span>{analysis ? `最近分析 ${analysis.analyzedAt}` : '当前诊断'}</span>
          <strong>{selectedCell ? `${selectedCell.concept || selectedCell.column} · ${selectedCell.row}` : analysis ? `薄弱 ${analysis.weakPoints.length} · 巩固 ${analysis.reviewPoints.length}` : '选择任意热力格'}</strong>
          <em>{selectedCell ? `掌握度 ${selectedCell.value}% · 观测 ${selectedCell.observations ?? 0} 次` : analysis ? (analysis.weakPoints[0] ? `优先补强：${analysis.weakPoints.slice(0, 2).join('、')}` : '暂无薄弱点，建议保持练习节奏。') : '点击格子后读取 BKT 详情'}</em>
        </div>
        <div className="heatmap-bkt-strip">
          <span>{bktLoading ? '模型诊断读取中...' : bktDetail?.concept ? `掌握度模型：${bktDetail.concept}` : '掌握度模型待选中'}</span>
          <strong>{bktDetail?.mastery_probability !== undefined ? `${Math.round(bktDetail.mastery_probability * 100)}%` : '--'}</strong>
          <em>{modelEvidenceText}</em>
        </div>
        <div className="heatmap-scale" aria-hidden="true">
          <span>低掌握</span>
          <span>需巩固</span>
          <span>已掌握</span>
        </div>
      </div>
    </Panel>
  )
}
