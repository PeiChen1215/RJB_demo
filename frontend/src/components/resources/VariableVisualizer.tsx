/**
 * C10 — 变量可视化
 *
 * 对 Python 代码中的顶层变量赋值进行简单解析与可视化：
 * - 使用正则匹配 `name = value` 形式的单行赋值
 * - 忽略注释、空行与多行语句
 * - 以变量卡片网格展示变量名与赋值内容
 */
import { useMemo } from 'react'
import { Braces, Equal } from 'lucide-react'

import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  code: string
}

interface Variable {
  name: string
  value: string
}

function parseVariables(code: string): Variable[] {
  const variables: Variable[] = []
  const seen = new Set<string>()
  const lines = code.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // 忽略空行、注释、导入语句、函数/类定义、缩进行（非顶层）
    if (!line) continue
    if (line.startsWith('#')) continue
    if (/^(import|from|def|class|if|elif|else|for|while|try|except|finally|with|return|print)\b/.test(line)) continue
    if (line.startsWith(' ') || line.startsWith('\t')) continue

    // 简单匹配：name = value
    const match = line.match(/^(\w+)\s*=\s*(.+)$/)
    if (!match) continue

    const name = match[1]
    let value = match[2].trim()

    // 去掉行内注释
    const hashIdx = value.indexOf('#')
    if (hashIdx >= 0) {
      value = value.slice(0, hashIdx).trim()
    }

    if (!seen.has(name)) {
      seen.add(name)
      variables.push({ name, value })
    }
  }

  return variables
}

export function VariableVisualizer({ code }: Props) {
  const variables = useMemo(() => parseVariables(code), [code])

  if (variables.length === 0) {
    return (
      <GlassCard hover={false} className="mt-2 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Braces className="h-3.5 w-3.5" />
          未检测到可展示的顶层变量赋值
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard hover={false} className="mt-2 overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-cyan-50/30 to-blue-50/30 px-3 py-2">
        <h5 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Braces className="h-3.5 w-3.5 text-cyan-500" />
          变量可视化
          <Badge variant="secondary" className="rounded-md bg-cyan-50 text-[10px] font-bold text-cyan-700">
            {variables.length} 个
          </Badge>
        </h5>
      </div>
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
        {variables.map((v, idx) => (
          <div
            key={v.name + idx}
            className={cn(
              'flex items-center gap-2 rounded-xl border border-slate-100 bg-white/60 p-2 transition-colors hover:border-cyan-200 hover:bg-cyan-50/30'
            )}
          >
            <code className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">
              {v.name}
            </code>
            <Equal className="h-3 w-3 text-slate-300" />
            <code className="flex-1 truncate text-xs text-slate-700" title={v.value}>
              {v.value}
            </code>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
