import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
}

export function SpinButton({ isLoading, disabled, children, ...props }: Props) {
  return (
    <button disabled={disabled || isLoading} {...props}>
      {isLoading && (
        <Loader2 size={11} className="animate-spin inline-block mr-1.5 flex-none" style={{ verticalAlign: '-0.1em' }} />
      )}
      {children}
    </button>
  )
}
