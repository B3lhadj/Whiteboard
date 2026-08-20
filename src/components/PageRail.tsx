import type { ReactNode } from 'react'
import { useState, useEffect, useRef } from 'react'
import {
  Plus,
  PanelLeftOpen,
  X
} from 'lucide-react'

const UndoIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
  </svg>
)

const DeleteIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="5" rx="1" />
    <path d="M5 9.5v9.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5H5zm5 4.5h4v2h-4v-2z" />
  </svg>
)

export interface PageRailItem {
  id: string
  label: string
  subtitle?: string
  thumbnail?: string | null
  preview?: ReactNode
  fileType?: 'pdf' | 'word' | 'powerpoint' | 'image' | 'other'
  pageType?: 'portrait' | 'landscape' | 'auto'
  onClick: () => void
  onDelete?: () => void
  onUndo?: () => void
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
  accentColor = '#3da355',
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

  const renderPreviewContent = (item: PageRailItem) => {
    if (item.preview) {
      return item.preview
    }

    if (item.thumbnail) {
      return (
        <img
          src={item.thumbnail}
          alt={item.label}
          className="absolute inset-0 h-full w-full object-contain bg-white"
        />
      )
    }

    return (
      <div className="absolute inset-0 flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-slate-400 bg-white">
        No preview
      </div>
    )
  }

  const sidebarContent = (
    <>
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[22px] text-gray-500 font-normal">
            {title === "SCREENS" ? "Document Pages" : title}
          </h2>
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
        <div className="h-px w-full bg-gray-200" />
      </div>

      <div ref={scrollContainerRef} className="screen-rail-scroll flex-1 overflow-y-auto px-3 py-5 flex flex-col gap-6 items-center" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
        {onAddStep && (
          <button
            onClick={onAddStep}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-all font-medium text-sm"
          >
            <Plus size={18} />
            Add Page
          </button>
        )}

        {items.length === 0 ? (
          <div className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500 w-full">
            {emptyMessage}
          </div>
        ) : (
          items.map((item, index) => {
            const isActive = item.id === activeId
            const inactiveColor = '#bebebe'
            const inactiveBorder = '#d1d5db'

            return (
              <div 
                key={item.id} 
                data-active-page={isActive ? 'true' : undefined}
                className="w-full flex flex-col cursor-pointer"
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                draggable={!!onReorder && !isMobile}
                onDragStart={(e) => {
                  if (onReorder && !isMobile) {
                     handleDragStart(e, index)
                  }
                }}
                onClick={() => handlePageClick(item)}
                style={{
                  opacity: draggedIndex === index ? 0.5 : 1,
                  transform: dragOverIndex === index && draggedIndex !== null ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: '0 3px 14px rgba(0,0,0,0.18)',
                  transition: 'all 200ms ease-out',
                }}
              >
                {/* Thumbnail Container — A4 aspect ratio (297/210 = 1.414) */}
                <div
                  className={`relative w-full border-2 border-b-0 overflow-hidden bg-white transition-colors`}
                  style={{ 
                    paddingBottom: '141.4%',
                    borderColor: isActive ? accentColor : inactiveBorder 
                  }}
                >
                  {renderPreviewContent(item)}
                </div>
                
                {/* Bottom Label/Actions Bar */}
                <div 
                  className={`h-11 px-3 flex items-center justify-between text-white transition-colors`}
                  style={{ backgroundColor: isActive ? accentColor : inactiveColor }}
                >
                  <span className="font-bold text-sm tracking-wide">{item.label}</span>
                  <div className="flex items-center gap-2">
                     <button 
                       onClick={(e) => {
                         e.stopPropagation()
                         if (item.onUndo) {
                           item.onUndo()
                         } else {
                           window.dispatchEvent(new CustomEvent('editor-trigger-undo'))
                         }
                       }}
                       className="hover:opacity-80 transition-opacity flex items-center justify-center"
                       title="Undo"
                     >
                       <UndoIcon size={20} />
                     </button>
                     {item.onDelete && (
                       <button
                         onClick={(e) => {
                           e.stopPropagation()
                           item.onDelete!()
                         }}
                         className="hover:opacity-80 transition-opacity flex items-center justify-center"
                         title="Delete Page"
                       >
                         <DeleteIcon size={20} />
                       </button>
                     )}
                  </div>
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
      {/* Mobile toggle button */}
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
            ? `fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full z-50 w-[300px] transition-transform duration-300 ease-out ${
                isOpen ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'
              }`
            : 'w-[300px] shrink-0 relative'
          }
          ${side === 'right' ? 'border-l' : 'border-r'} min-h-0 border-gray-200 bg-[#f8f9fa] flex flex-col overflow-hidden shadow-sm
        `}
        style={isMobile ? { boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.15)' : 'none' } : {}}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
