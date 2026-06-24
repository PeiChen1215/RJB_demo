/**
 * EmptyState 空状态组件
 *
 * 用于列表、页面等内容为空时展示友好提示，支持图标、标题、描述与操作区。
 *
 * TODO:
 * - [已完成] 支持图标、标题、描述与自定义操作
 * - [已完成] 提供 indigo/violet/emerald/amber 四种主题色
 * - [已完成] 集成 framer-motion 入场动画
 * - [待完成] 添加可访问性属性与语义化结构
 * - [待完成] 支持插画/图片作为空状态视觉
 * - [待完成] 补充单元测试
 */
import { motion } from 'framer-motion'
import * as React from 'react'

import { cn } from '@/lib/utils'
import { IconBox } from './icon-box'

interface EmptyStateProps extends React.ComponentPropsWithoutRef<typeof motion.div> {
  icon: React.ElementType
  title: string
  description: string
  action?: React.ReactNode
  variant?: 'indigo' | 'violet' | 'emerald' | 'amber'
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, variant = 'indigo', className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center backdrop-blur-sm',
          className
        )}
        {...props}
      >
        <IconBox icon={icon} variant={variant} size="lg" className="mb-4" />
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-slate-500">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </motion.div>
    )
  }
)
EmptyState.displayName = 'EmptyState'
