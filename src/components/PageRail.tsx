import type { ReactNode } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Trash2, Plus, GripVertical, PanelLeftOpen, X, Maximize2, Minimize2 } from 'lucide-react'

export interface PageRailItem {
  id: string
  label: string
  subtitle?: string
  thumbnail?: string | null
  preview?: ReactNode
  onClick: () => void
  onDelete?: () => void
  onDragStart?: (index: number) => void
  onDragEnd?: () => void
}

interface PageRailProps {
  title: string
  items: PageRailItem[]
  activeId?: string | null
  accentColor?: string
  emptyMessage?: string
  footer?: ReactNode
  onAddStep?: () => void
  onReorder?: (fromIndex: number, toIndex: number) => void
  side?: 'left' | 'right'
}

export default function PageRail({
  title,
  items,
  activeId,
  accentColor = '#2563eb',
  emptyMessage = 'No pages available',
  footer,
  onAddStep,
  onReorder,
  side = 'left',
}: PageRailProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [expandedTextIds, setExpandedTextIds] = useState<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  // Detect mobile/small screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const activeItem = scrollContainerRef.current?.querySelector('[data-active-page="true"]') as HTMLElement | null
    activeItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId, items.length])

  // Close drawer when clicking a page on mobile
  const handlePageClick = (item: PageRailItem) => {
    item.onClick()
    if (isMobile) {
      setIsOpen(false)
    }
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    if (e.dataTransfer.setDragImage) {
      const dragImage = new Image()
      e.dataTransfer.setDragImage(dragImage, 0, 0)
    }
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== toIndex && onReorder) {
      onReorder(draggedIndex, toIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const toggleExpandedText = (itemId: string) => {
    setExpandedTextIds((previous) => {
      const next = new Set(previous)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const sidebarContent = (
    <>
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-[11px] font-bold tracking-[0.18em] text-gray-500 uppercase">
            {title}
          </span>
          {/* Close button on mobile */}
          {isMobile && (
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close panel"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {onAddStep && (
          <button
            onClick={onAddStep}
            className="w-full mb-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all font-bold text-xs"
          >
            <Plus size={18} />
            ADD NEW PAGE
          </button>
        )}
      </div>

      <div ref={scrollContainerRef} className="screen-rail-scroll flex-1 overflow-y-auto overscroll-contain px-2 pb-3" style={{ scrollbarGutter: 'stable' }}>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
            {emptyMessage}
          </div>
        ) : (
          items.map((item, index) => {
            const isActive = item.id === activeId
            const isTextExpanded = expandedTextIds.has(item.id)

            return (
              <div key={item.id} data-active-page={isActive ? 'true' : undefined}>
                {/* Page separator line between pages */}
                {index > 0 && (
                  <div className="flex items-center gap-2 my-2 px-1">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                  </div>
                )}

                <div
                  className="group/item relative w-full"
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  style={{
                    opacity: draggedIndex === index ? 0.5 : 1,
                    transform: dragOverIndex === index && draggedIndex !== null ? 'scale(1.02)' : 'scale(1)',
                    transition: 'all 200ms ease-out',
                  }}
                >
                  <button
                    onClick={() => handlePageClick(item)}
                    className={`w-full rounded-xl border-2 bg-white p-3 text-left transition-all shadow-sm ${
                      isActive
                        ? 'shadow-md border-blue-300'
                        : 'hover:bg-gray-50 hover:shadow-md hover:border-gray-300'
                    } cursor-pointer`}
                    style={{
                      borderColor: isActive ? accentColor : dragOverIndex === index ? accentColor : '#e5e7eb',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {onReorder && !isMobile && (
                          <span
                            draggable
                            onClick={(e) => e.stopPropagation()}
                            onDragStart={(e) => {
                              e.stopPropagation()
                              handleDragStart(e, index)
                            }}
                            className="cursor-move text-gray-400 opacity-0 transition-opacity group-hover/item:opacity-100"
                            title="Move page"
                          >
                            <GripVertical size={14} />
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-gray-700 truncate">
                          {item.label}
                        </span>
                      </div>
                      {/* Page number badge */}
                      <span
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold"
                        style={{
                          backgroundColor: isActive ? accentColor : '#e5e7eb',
                          color: isActive ? '#ffffff' : '#6b7280',
                        }}
                      >
                        {index + 1}
                      </span>
                    </div>

                    <div className="screen-preview-scroll h-56 overflow-auto rounded-lg border-2 border-gray-300 bg-white shadow-sm">
                      {item.preview ? (
                        item.preview
                      ) : item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.label}
                          className="h-full w-full rounded-md object-contain"
                        />
                      ) : (
                        <div className="p-2">
                          <div className="mb-1 h-1.5 w-10 rounded-full bg-gray-300" />
                          <div className="space-y-1.5">
                            <div className="h-2 rounded bg-gray-200" />
                            <div className="h-2 rounded bg-gray-200 w-5/6" />
                            <div className="h-2 rounded bg-gray-200 w-2/3" />
                          </div>
                        </div>
                      )}
                    </div>

                    {item.subtitle && (
                      <div className="mt-2 flex items-start gap-1 text-[11px] text-gray-500">
                        <span className={isTextExpanded ? 'whitespace-normal break-words leading-snug' : 'min-w-0 flex-1 truncate'}>
                          {item.subtitle}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleExpandedText(item.id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.stopPropagation()
                              toggleExpandedText(item.id)
                            }
                          }}
                          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          title={isTextExpanded ? 'Fermer' : 'Ouvrir'}
                        >
                          {isTextExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Delete button — always visible for touch/small screens */}
                  {item.onDelete && (
                    <div className="absolute top-2 right-2 z-30">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          item.onDelete!()
                        }}
                        className="p-2 bg-red-600 shadow-lg rounded-lg text-white hover:bg-red-700 transition-all transform hover:scale-110 active:scale-95"
                        title="Delete Page"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {footer && <div className="border-t border-gray-200 p-2">{footer}</div>}
    </>
  )

  return (
    <>
      {/* Mobile toggle button — floats on top-left when sidebar is closed */}
      {isMobile && !isOpen && (
        <button
          data-print-hidden="true"
          onClick={() => setIsOpen(true)}
          className={`fixed top-20 z-50 flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-gray-200 shadow-lg text-gray-700 hover:bg-gray-50 transition-all active:scale-95 ${
            side === 'right' ? 'right-2' : 'left-2'
          }`}
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
          title="Show pages"
        >
          <PanelLeftOpen size={18} />
          <span className="text-xs font-semibold">{items.length}</span>
        </button>
      )}

      {/* Mobile: Overlay backdrop */}
      {isMobile && isOpen && (
        <div
          data-print-hidden="true"
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        data-print-hidden="true"
        className={`
          ${isMobile
            ? `fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full z-50 w-64 transition-transform duration-300 ease-out ${
                isOpen ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'
              }`
            : 'w-80 shrink-0 relative'
          }
          ${side === 'right' ? 'border-l' : 'border-r'} min-h-0 border-gray-200 bg-white flex flex-col overflow-hidden shadow-sm
        `}
        style={isMobile ? { boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.15)' : 'none' } : {}}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
