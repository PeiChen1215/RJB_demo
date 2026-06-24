/**
 * IconBox 图标盒子组件
 *
 * 带有渐变背景与统一尺寸的图标容器，用于卡片、列表、空状态等场景。
 *
 * TODO:
 * - [已完成] 实现 indigo/violet/emerald/amber/rose/cyan 六种主题
 * - [已完成] 支持 sm/md/lg 三种尺寸
 * - [已完成] 支持 ref 转发与 className 覆盖
 * - [待完成] 支持透明/outlined 等轻量变体
 * - [待完成] 补充单元测试
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

type Variant = 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan'

const variantStyles: Record<Variant, string> = {
  indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-indigo-500/25',
  violet: 'bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-violet-500/25',
  emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/25',
  amber: 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-amber-500/25',
  rose: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/25',
  cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-cyan-500/25',
}

interface IconBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ElementType
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles = {
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-9 w-9 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
}

const iconSizes = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4.5 w-4.5',
  lg: 'h-6 w-6',
}

const IconBox = React.forwardRef<HTMLDivElement, IconBoxProps>(
  ({ icon: Icon, variant = 'indigo', size = 'md', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center shadow-lg',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        <Icon className={iconSizes[size]} />
      </div>
    )
  }
)
IconBox.displayName = 'IconBox'

export { IconBox, type Variant }
