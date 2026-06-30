/**
 * C11 — 知识熔炉版本时间线
 *
 * 展示某个知识点的资源版本演进历史：
 * - 首次加载时调用 resourceApi.getVersions(concept)
 * - 以垂直时间线渲染每个版本的版本号、创建时间、变更原因与触发来源
 * - 仅有一个版本时提示“当前为初版资源”
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { History, Flame, Package } from 'lucide-react'

import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { resourceApi, type ResourceVersion } from '@/services/api'
import { cn } from '@/lib/utils'

interface Props {
  concept: string
}

export function FurnaceTimeline({ concept }: Props) {
  const [versions, setVersions] = useState<ResourceVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const fetchVersions = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await resourceApi.getVersions(concept)
        if (!cancelled) {
          setVersions(res.data.versions || [])
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || '加载版本历史失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchVersions()
    return () => {
      cancelled = true
    }
  }, [concept])

  if (loading) {
    return (
      <GlassCard hover={false} className="p-6">
        <div className="space-y-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </GlassCard>
    )
  }

  if (error) {
    return (
      <GlassCard hover={false} className="p-5">
        <div className="text-sm font-semibold text-red-600">{error}</div>
      </GlassCard>
    )
  }

  if (versions.length === 0) {
    return (
      <GlassCard hover={false} className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <History className="h-4 w-4" />
          暂无版本历史
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard hover={false} className="overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-rose-50/30 to-orange-50/30 px-5 py-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Flame className="h-4 w-4 text-rose-500" />
          知识熔炉 · 版本演进
        </h4>
      </div>

      <div className="p-5">
        {versions.length === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700"
          >
            当前为初版资源
          </motion.div>
        )}

        <div className="relative space-y-5 pl-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-gradient-to-b before:from-rose-200 before:to-indigo-200">
          {versions.map((v, idx) => (
            <motion.div
              key={v.version_id || v.version}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="relative"
            >
              <span
                className={cn(
                  'absolute -left-[21px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white',
                  idx === versions.length - 1
                    ? 'bg-indigo-500 text-[9px] font-bold text-white'
                    : 'bg-rose-300'
                )}
              >
                {idx === versions.length - 1 ? <Package className="h-2.5 w-2.5" /> : null}
              </span>

              <GlassCard hover={false} className="p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">版本 {v.version}</span>
                    {idx === versions.length - 1 && (
                      <Badge className="rounded-md bg-indigo-100 px-2 text-[10px] font-bold text-indigo-700">
                        当前
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{v.created_at}</span>
                </div>

                <p className="mb-2 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-700">变更原因：</span>
                  {v.change_reason || '—'}
                </p>

                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Flame className="h-3 w-3 text-rose-400" />
                  触发来源：
                  <Badge variant="secondary" className="rounded-md bg-rose-50 text-rose-700">
                    {v.triggered_by || '系统生成'}
                  </Badge>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
