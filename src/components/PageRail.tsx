import type { ReactNode } from 'react'

export interface PageRailItem {
  id: string
  label: string
  subtitle?: string
  thumbnail?: string | null
  onClick: () => void
}

interface PageRailProps {
  title: string
  items: PageRailItem[]
  activeId?: string | null
  accentColor?: string
  emptyMessage?: string
  footer?: ReactNode
}

export default function PageRail({
  title,
  items,
  activeId,
  accentColor = '#2563eb',
  emptyMessage = 'No pages available',
  footer,
}: PageRailProps) {
  return (
    <aside className="w-48 shrink-0 border-r border-gray-200 bg-white flex flex-col shadow-sm">
      <div className="px-3 pt-3 pb-2 text-[11px] font-bold tracking-[0.18em] text-gray-600">
        {title}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
            {emptyMessage}
          </div>
        ) : (
          items.map((item, index) => {
            const isActive = item.id === activeId

            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`mb-2 w-full rounded-xl border-2 p-2 text-left transition-all ${
                  isActive
                    ? 'bg-blue-50 shadow-sm'
                    : 'bg-white hover:bg-gray-50 hover:shadow-sm'
                }`}
                style={{
                  borderColor: isActive ? accentColor : '#e5e7eb',
                }}
              >
                <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
                  <span className="text-[11px] font-semibold text-gray-700 truncate">
                    {item.label}
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">{index + 1}</span>
                </div>

                <div className="h-24 overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100 p-2 flex flex-col justify-start">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.label}
                      className="h-full w-full rounded-md object-cover"
                    />
                  ) : (
                    <>
                      <div className="mb-1 h-1.5 w-10 rounded-full bg-gray-300" />
                      <div className="space-y-1.5">
                        <div className="h-2 rounded bg-gray-200" />
                        <div className="h-2 rounded bg-gray-200 w-5/6" />
                        <div className="h-2 rounded bg-gray-200 w-2/3" />
                      </div>
                    </>
                  )}
                </div>

                {item.subtitle && (
                  <div className="mt-2 truncate text-[11px] text-gray-500">
                    {item.subtitle}
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {footer && <div className="border-t border-gray-200 p-2">{footer}</div>}
    </aside>
  )
}