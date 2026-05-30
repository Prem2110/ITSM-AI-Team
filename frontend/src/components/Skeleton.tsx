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

export function FourSquareLoader({ size: _size, color }: { size?: number; color?: string }) {
  const customStyle = color ? { '--dot': color } as React.CSSProperties : undefined
  return (
    <div className="geometric-loader-container" style={customStyle}>
      {/* Circle */}
      <div className="geom-loader">
        <svg viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32"></circle>
        </svg>
      </div>

      {/* Triangle */}
      <div className="geom-loader triangle">
        <svg viewBox="0 0 86 80">
          <polygon points="43 8, 79 72, 7 72"></polygon>
        </svg>
      </div>

      {/* Square */}
      <div className="geom-loader">
        <svg viewBox="0 0 80 80">
          <rect x="8" y="8" width="64" height="64"></rect>
        </svg>
      </div>
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
