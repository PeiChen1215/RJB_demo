/**
 * 需求：Python 知识图谱可视化。
 * 功能：
 *   - 从后端获取知识节点与边数据；
 *   - 使用 ECharts 力导向图展示模块、难度、依赖关系；
 *   - 支持缩放、拖拽、悬停提示。
 * 主要 hooks/函数：
 *   - 数据转换：将 GraphData 映射为 ECharts 节点/分类/连线；
 *   - useEffect：初始化/销毁图表并监听窗口尺寸变化。
 * TODO:
 *  - [已完成] 力导向图渲染
 *  - [已完成] 按模块着色与悬停提示
 *  - [待完成] 与当前学习路径高亮联动
 *  - [待完成] 节点点击跳转资源/练习
 *  - [待完成] 图谱缩放、搜索与筛选
 */
import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Share2 } from 'lucide-react'

import { GlassCard } from '@/components/ui/glass-card'
import { IconBox } from '@/components/ui/icon-box'
import { Skeleton } from '@/components/ui/skeleton'
import { graphApi, type GraphData } from '@/services/api'

// 模块配色与后端 _MODULE_COLORS 严格对齐
const MODULE_COLORS: Record<string, string> = {
  '基础语法': '#3b82f6',
  '数据结构': '#10b981',
  '控制流': '#f59e0b',
  '函数': '#8b5cf6',
  '文件IO': '#ef4444',
  '异常处理': '#f97316',
  '面向对象': '#ec4899',
  '高级语法': '#06b6d4',
  '标准库': '#14b8a6',
  '未分类': '#94a3b8',
}

const MODULE_FALLBACK = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#f97316', '#ec4899', '#06b6d4', '#14b8a6', '#94a3b8']

export function KnowledgeGraph() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

  // 首次加载时获取图谱布局数据（含后端预计算坐标/颜色）
  useEffect(() => {
    graphApi.getLayout().then((res) => {
      // 将 layout 数据转换为 GraphData 格式
      const layoutData = res.data as { nodes: any[]; edges: any[] };
      setGraphData({
        nodes: layoutData.nodes.map((n: any) => ({
          id: n.id,
          name: n.name,
          module: n.module,
          difficulty: n.difficulty,
          x: n.x,
          y: n.y,
          color: n.color,
        })),
        edges: layoutData.edges,
      })
      setLoading(false)
    }).catch(() => {
      // 降级：layout 不可用时回退到基础接口
      graphApi.getGraph().then((res) => {
        setGraphData(res.data)
        setLoading(false)
      })
    })
  }, [])

  // 将后端图谱数据转换为 ECharts 力导向图所需的分类、节点与连线
  useEffect(() => {
    if (!graphData || !chartRef.current) return

    // 提取所有模块作为图例分类，优先使用后端下发的颜色
    const moduleColorMap = new Map<string, string>()
    graphData.nodes.forEach((n: any) => {
      if (n.color && !moduleColorMap.has(n.module)) {
        moduleColorMap.set(n.module, n.color)
      }
    })
    const modules = Array.from(new Set(graphData.nodes.map((n) => n.module)))
    const categories = modules.map((name, index) => ({
      name,
      itemStyle: {
        color: moduleColorMap.get(name) || MODULE_COLORS[name] || MODULE_FALLBACK[index % MODULE_FALLBACK.length],
      },
    }))

    const categoryIndex = (module: string) => modules.indexOf(module)

    // 节点大小随难度递增，使用后端预计算坐标与颜色
    const hasLayout = (graphData.nodes[0] as any)?.x !== undefined;
    const nodes = graphData.nodes.map((n: any) => ({
      id: n.id,
      name: n.name,
      value: n.difficulty,
      category: categoryIndex(n.module),
      symbolSize: 28 + n.difficulty * 7,
      x: hasLayout ? n.x : undefined,
      y: hasLayout ? n.y : undefined,
      label: { show: true, formatter: '{b}', fontSize: 12, fontWeight: 600 },
      itemStyle: {
        color: n.color || moduleColorMap.get(n.module) || MODULE_COLORS[n.module] || MODULE_FALLBACK[categoryIndex(n.module) % MODULE_FALLBACK.length],
        borderColor: '#fff',
        borderWidth: 2,
        shadowBlur: 10,
        shadowColor: 'rgba(0,0,0,0.12)',
      },
    }))

    // 连线宽度随依赖强度递增
    const links = graphData.edges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.strength,
      lineStyle: { width: 1 + e.strength * 2, opacity: 0.5 },
    }))

    // 初始化力导向图并绑定数据
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })
    chartInstanceRef.current = chart

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#1e293b' },
        formatter: (params: any) => {
          if (params.dataType === 'edge') return `${params.data.source} → ${params.data.target}`
          const data = params.data as any
          return `<div class="font-sans">
            <div class="font-bold text-slate-900">${data.name}</div>
            <div class="text-xs text-slate-500">模块：${categories[data.category]?.name}</div>
            <div class="text-xs text-slate-500">难度：${data.value}/5</div>
          </div>`
        },
      },
      legend: {
        top: 0,
        left: 'center',
        itemGap: 18,
        textStyle: { color: '#64748b', fontSize: 12, fontWeight: 500 },
        data: categories.map((c) => c.name),
      },
      animationDuration: 1600,
      animationEasingUpdate: 'quinticInOut',
      series: [
        {
          name: 'Python 知识图谱',
          type: 'graph',
          layout: hasLayout ? 'none' : 'force',
          data: nodes,
          links,
          categories,
          roam: true,
          draggable: true,
          label: { show: true, position: 'bottom' },
          force: hasLayout ? undefined : {
            repulsion: 480,
            edgeLength: [80, 150],
            gravity: 0.08,
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 4, opacity: 1 },
            itemStyle: { shadowBlur: 18, shadowColor: 'rgba(0,0,0,0.2)' },
          },
          lineStyle: {
            color: 'source',
            curveness: 0.05,
          },
        },
      ],
    })

    // 窗口变化时自适应，组件卸载时释放图表实例
    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
      chartInstanceRef.current = null
    }
  }, [graphData])

  return (
    <GlassCard className="overflow-hidden" hover={false}>
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50/50 to-indigo-50/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <IconBox icon={Share2} variant="violet" size="sm" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Python 知识图谱</h3>
            <p className="text-xs text-slate-500">力导向图 · 按模块着色 · {graphData?.nodes.length || 0} 节点</p>
          </div>
        </div>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="flex h-[500px] flex-col items-center justify-center gap-3 text-slate-500">
            <Skeleton className="h-10 w-10 rounded-full" />
            <span className="text-sm">正在加载知识图谱...</span>
          </div>
        ) : (
          <div
            ref={chartRef}
            className="h-[500px] w-full rounded-2xl border border-slate-100 bg-slate-50/50"
          />
        )}
      </div>
    </GlassCard>
  )
}
