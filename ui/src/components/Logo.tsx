import { cn } from '@/lib/utils'

/** The screen-face mark with its filament curl. Ink features are cut from the orange body. */
export function KlippyfaceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Klippyface">
      <path
        d="M50 25 C49 14 54 7 62 7 C70 7 72 17 65 20 C60 22 56 17 60 13"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="10" y="25" width="80" height="67" rx="20" fill="var(--primary)" />
      <rect x="30" y="42" width="12" height="20" rx="6" fill="#18181b" />
      <rect x="58" y="42" width="12" height="20" rx="6" fill="#18181b" />
      <path
        d="M37 74 Q50 82 62 74 Q66 71 68 67"
        fill="none"
        stroke="#18181b"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const WORDMARK =
  'M0 0h1v1h-1zM5 0h1v1h-1zM26 0h2v1h-2zM0 1h1v1h-1zM5 1h1v1h-1zM25 1h1v1h-1zM0 2h1v1h-1zM3 2h1v1h-1zM5 2h1v1h-1zM8 2h1v1h-1zM10 2h3v1h-3zM15 2h3v1h-3zM20 2h1v1h-1zM23 2h1v1h-1zM25 2h3v1h-3zM30 2h2v1h-2zM35 2h3v1h-3zM40 2h2v1h-2zM0 3h1v1h-1zM2 3h1v1h-1zM5 3h1v1h-1zM8 3h1v1h-1zM10 3h1v1h-1zM13 3h1v1h-1zM15 3h1v1h-1zM18 3h1v1h-1zM20 3h1v1h-1zM23 3h1v1h-1zM25 3h1v1h-1zM32 3h1v1h-1zM34 3h1v1h-1zM39 3h1v1h-1zM42 3h1v1h-1zM0 4h2v1h-2zM5 4h1v1h-1zM8 4h1v1h-1zM10 4h1v1h-1zM13 4h1v1h-1zM15 4h1v1h-1zM18 4h1v1h-1zM20 4h1v1h-1zM23 4h1v1h-1zM25 4h1v1h-1zM30 4h3v1h-3zM34 4h1v1h-1zM39 4h4v1h-4zM0 5h1v1h-1zM2 5h1v1h-1zM5 5h1v1h-1zM8 5h1v1h-1zM10 5h1v1h-1zM13 5h1v1h-1zM15 5h1v1h-1zM18 5h1v1h-1zM20 5h1v1h-1zM23 5h1v1h-1zM25 5h1v1h-1zM29 5h1v1h-1zM32 5h1v1h-1zM34 5h1v1h-1zM39 5h1v1h-1zM0 6h1v1h-1zM3 6h1v1h-1zM6 6h1v1h-1zM8 6h1v1h-1zM10 6h3v1h-3zM15 6h3v1h-3zM21 6h3v1h-3zM25 6h1v1h-1zM30 6h3v1h-3zM35 6h3v1h-3zM40 6h3v1h-3zM10 7h1v1h-1zM15 7h1v1h-1zM23 7h1v1h-1zM10 8h1v1h-1zM15 8h1v1h-1zM20 8h3v1h-3z'

/** Pixel "klippyface" lettering, 43x9 px - scale by whole multiples. The i's dot is lit orange. */
export function KlippyfaceWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 43 9" shapeRendering="crispEdges" className={cn('fill-current', className)} role="img" aria-label="klippyface">
      <path d={WORDMARK} />
      <path d="M8 0h1v1h-1z" fill="var(--primary)" />
    </svg>
  )
}
