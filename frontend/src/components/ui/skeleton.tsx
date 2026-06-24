/**
 * Skeleton 骨架屏组件
 *
 * 用于内容加载占位，提供脉冲动画效果。
 *
 * TODO:
 * - [已完成] 实现基础 pulse 动画骨架屏
 * - [已完成] 支持 className 覆盖
 * - [待完成] 支持圆角/圆形/文本行等多种预设形态
 * - [待完成] 适配深色模式
 * - [待完成] 补充单元测试
 */
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800', className)}
      {...props}
    />
  )
}

export { Skeleton }
