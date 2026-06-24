/**
 * Progress 进度条组件
 *
 * 基于 Radix UI Progress 的可访问进度指示器。
 *
 * TODO:
 * - [已完成] 基于 @radix-ui/react-progress 实现
 * - [已完成] 支持 value 与 className
 * - [待完成] 支持缓冲/不确定进度状态
 * - [待完成] 支持多种尺寸与颜色变体
 * - [待完成] 补充单元测试
 */
import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
