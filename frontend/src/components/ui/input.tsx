/**
 * Input 输入框组件
 *
 * 基础表单输入框，统一圆角、聚焦态与禁用态样式。
 *
 * TODO:
 * - [已完成] 实现基础文本输入样式
 * - [已完成] 支持 ref 转发与 className 覆盖
 * - [待完成] 集成 Label、ErrorMessage、Hint 等表单辅助组件
 * - [待完成] 支持前缀/后缀图标
 * - [待完成] 补充单元测试
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
