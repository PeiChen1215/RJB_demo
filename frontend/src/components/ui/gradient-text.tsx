/**
 * GradientText 渐变文字组件
 *
 * 使用 CSS 渐变实现的品牌强调文字组件。
 *
 * TODO:
 * - [已完成] 实现 indigo-violet 水平渐变文字
 * - [已完成] 支持 ref 转发与 className 覆盖
 * - [待完成] 支持多种渐变方向与主题色配置
 * - [待完成] 适配动态/动画渐变效果
 * - [待完成] 补充单元测试
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

interface GradientTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode
}

const GradientText = React.forwardRef<HTMLSpanElement, GradientTextProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-clip-text text-transparent',
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
GradientText.displayName = 'GradientText'

export { GradientText }
