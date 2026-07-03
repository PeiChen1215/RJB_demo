import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={cn('command-panel', className)}>{children}</section>
}

export function PanelHeader({
  title,
  subtitle,
  icon: Icon,
  meta,
}: {
  title: string
  subtitle?: string
  icon: ComponentType<{ className?: string }>
  meta?: ReactNode
}) {
  return (
    <div className="panel-header">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-amber-300" />
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {meta}
    </div>
  )
}

export function HexAvatar({
  icon: Icon,
  tone,
  small,
}: {
  icon: ComponentType<{ className?: string }>
  tone: 'amber' | 'mint'
  small?: boolean
}) {
  return (
    <div className={cn('hex-avatar', tone, small && 'small')}>
      <Icon className={small ? 'h-4 w-4' : 'h-5 w-5'} />
    </div>
  )
}
