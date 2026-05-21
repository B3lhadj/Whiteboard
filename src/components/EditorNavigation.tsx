import { ChevronLeft, ChevronRight } from 'lucide-react'

interface EditorNavigationProps {
  current: number
  total: number
  onPrevious: () => void
  onNext: () => void
  previousLabel?: string
  nextLabel?: string
  className?: string
  themeColor?: string
}

export default function EditorNavigation({
  current,
  total,
  onPrevious,
  onNext,
  previousLabel = 'Previous',
  nextLabel = 'Next',
  className = '',
  themeColor = '#dc2626',
}: EditorNavigationProps) {
  const safeTotal = Math.max(1, total)
  const safeCurrent = Math.min(Math.max(1, current), safeTotal)

  return (
    <div data-print-hidden="true" className={`flex items-center justify-center gap-4 py-3 ${className}`}>
      <button
        onClick={onPrevious}
        disabled={safeCurrent <= 1}
        className="flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-lg px-6 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-45"
        style={{ 
          backgroundColor: themeColor,
          transition: 'background-color 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (safeCurrent > 1) {
            e.currentTarget.style.backgroundColor = '#b91c1c'
          }
        }}
        onMouseLeave={(e) => {
          if (safeCurrent > 1) {
            e.currentTarget.style.backgroundColor = themeColor
          }
        }}
        title={previousLabel}
      >
        <ChevronLeft size={22} />
        {previousLabel}
      </button>
      <span className="flex h-12 min-w-[78px] items-center justify-center rounded-lg bg-gray-200 px-5 text-lg font-semibold text-gray-800 shadow-sm">
        {safeCurrent} / {safeTotal}
      </span>
      <button
        onClick={onNext}
        disabled={safeCurrent >= safeTotal}
        className="flex h-12 min-w-[112px] items-center justify-center gap-2 rounded-lg px-6 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-45"
        style={{ 
          backgroundColor: themeColor,
          transition: 'background-color 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (safeCurrent < safeTotal) {
            e.currentTarget.style.backgroundColor = '#b91c1c'
          }
        }}
        onMouseLeave={(e) => {
          if (safeCurrent < safeTotal) {
            e.currentTarget.style.backgroundColor = themeColor
          }
        }}
        title={nextLabel}
      >
        {nextLabel}
        <ChevronRight size={22} />
      </button>
    </div>
  )
}