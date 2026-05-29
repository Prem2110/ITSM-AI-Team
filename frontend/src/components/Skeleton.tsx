import type { CSSProperties, ReactNode } from 'react'

interface SkeletonProps {
  height?: number | string
  width?: number | string
  className?: string
  style?: CSSProperties
  rounded?: boolean
}

export function Skeleton({ height = 14, width = '100%', className = '', style, rounded }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        height,
        width,
        borderRadius: rounded ? 9999 : 3,
        flexShrink: 0,
        background: 'linear-gradient(90deg, var(--shimmer-base) 25%, var(--shimmer-highlight) 50%, var(--shimmer-base) 75%)',
        backgroundSize: '300% 100%',
        animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

export function SkeletonText({ lines = 3, lastWidth = '60%' }: { lines?: number; lastWidth?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </div>
  )
}

export function FourSquareLoader({
  size = 56,
  color = '#64748b',
}: {
  size?: number
  color?: string
}) {
  const sq = Math.round(size * 0.38)
  const mid = Math.round((size - sq) / 2)

  const base: CSSProperties = {
    position: 'absolute',
    width: sq,
    height: sq,
    backgroundColor: color,
    borderRadius: 2,
    animationName: 'fsq-pulse',
    animationDuration: '1.4s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{ ...base, top: 0,   left: mid,  animationDelay: '0s'    }} />
      <div style={{ ...base, top: mid, left: 0,    animationDelay: '0.35s' }} />
      <div style={{ ...base, top: mid, right: 0,   animationDelay: '0.7s'  }} />
      <div style={{ ...base, bottom: 0, left: mid, animationDelay: '1.05s' }} />
    </div>
  )
}

export function PageSpinner({ children }: { children?: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <FourSquareLoader />
      {children && <p className="text-xs text-surface-400">{children}</p>}
    </div>
  )
}
