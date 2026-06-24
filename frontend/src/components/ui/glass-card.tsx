/**
 * GlassCard 玻璃态卡片组件
 *
 * 带有毛玻璃、微动效与可选发光效果的展示型卡片。
 *
 * TODO:
 * - [已完成] 实现毛玻璃背景与入场动画
 * - [已完成] 支持 hover 上浮与 glow 光晕
 * - [已完成] 支持自定义 delay 与 className
 * - [待完成] 支持点击/链接形态
 * - [待完成] 适配深色模式
 * - [待完成] 补充单元测试
 */
import { motion } from 'framer-motion'
import * as React from 'react'

import { cn } from '@/lib/utils'

interface GlassCardProps extends React.ComponentPropsWithoutRef<typeof motion.div> {
  delay?: number
  hover?: boolean
  glow?: boolean
}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, children, delay = 0, hover = true, glow = false, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.45,
          delay,
          ease: [0.16, 1, 0.3, 1],
        }}
        className={cn(
          'rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-soft',
          hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-hover',
          glow && 'ring-1 ring-indigo-500/10',
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)
GlassCard.displayName = 'GlassCard'

export { GlassCard }
