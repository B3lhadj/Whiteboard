import { DocumentFile, useDocumentStore } from '../store'
import { ZoomOut, ZoomIn, MessageCircle } from 'lucide-react'

interface StatusBarProps {
  file: DocumentFile
}

export default function StatusBar({ file }: StatusBarProps) {
  const zoom = useDocumentStore((state) => state.zoom)
  const setZoom = useDocumentStore((state) => state.setZoom)
  const wordCount = useDocumentStore((state) => state.wordCount)
  const charCount = useDocumentStore((state) => state.charCount)
  const currentPage = useDocumentStore((state) => state.currentPage)

  // Get the actual file type (originalType for converted files, otherwise type)
  const actualType = file.originalType || file.type

  const getThemeColor = () => {
    switch (actualType) {
      case 'docx':
        return 'text-[#2b579a] accent-[#2b579a]'
      case 'xlsx':
        return 'text-[#217346] accent-[#217346]'
      case 'pptx':
        return 'text-[#b7472a] accent-[#b7472a]'
      case 'pdf':
        return 'text-[#e02b20] accent-[#e02b20]'
      case 'image':
        return 'text-[#0ea5a4] accent-[#0ea5a4]'
      case 'whiteboard':
        return 'text-[#7c3aed] accent-[#7c3aed]'
      default:
        return 'text-[#217346] accent-[#217346]'
    }
  }

  const theme = getThemeColor()

  return (
    <div
      className="
        h-16
        px-8
        flex
        items-center
        justify-between
        border-t
        border-[#d7d2a7]
        bg-[#ece8b9]
        shadow-inner
      "
    >
      {/* LEFT - Document Info */}
      <div className={`flex items-center gap-5 text-sm font-medium ${theme} min-w-[200px]`}>
        {actualType === 'image' ? (
          <>
            <span className="text-base">🖼️ Image Viewer</span>
            <span className="border-l border-current pl-5">
              {wordCount} × {charCount} px
            </span>
          </>
        ) : (
          <>
            <span className="text-base">📄 Page {currentPage}</span>
            <span className="border-l border-current pl-5">
              {wordCount.toLocaleString()} words · {charCount.toLocaleString()} characters
            </span>
          </>
        )}
      </div>

      {/* CENTER - Zoom Controls - WIDER */}
      <div className={`flex items-center gap-4 ${theme} flex-1 justify-center max-w-[500px]`}>
        <button
          onClick={() => setZoom(Math.max(50, zoom - 10))}
          className="
            w-8 h-8
            rounded-full
            border-2 border-current
            flex items-center justify-center
            hover:bg-black/10
            hover:scale-110
            transition-all
            duration-200
          "
        >
          <ZoomOut size={16} />
        </button>

        <input
          type="range"
          min="50"
          max="200"
          step="10"
          value={zoom}
          onChange={(e) => setZoom(parseInt(e.target.value))}
          className={`
            w-80 h-2
            rounded-lg
            appearance-none
            cursor-pointer
            ${theme}
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-current
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:hover:scale-125
            [&::-webkit-slider-thumb]:transition-transform
          `}
          style={{
            background: `linear-gradient(to right, currentColor 0%, currentColor ${((zoom - 50) / 150) * 100}%, #e5e7eb ${((zoom - 50) / 150) * 100}%, #e5e7eb 100%)`
          }}
        />

        <button
          onClick={() => setZoom(Math.min(200, zoom + 10))}
          className="
            w-8 h-8
            rounded-full
            border-2 border-current
            flex items-center justify-center
            hover:bg-black/10
            hover:scale-110
            transition-all
            duration-200
          "
        >
          <ZoomIn size={16} />
        </button>

        <span className="text-base font-bold min-w-[60px] text-center">
          {zoom}%
        </span>
      </div>

      {/* RIGHT - Room Info & Actions */}
      <div className={`flex items-center gap-6 text-sm font-medium ${theme} min-w-[220px]`}>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Room ID: 14263135
        </span>

        <button
          className="
            px-6 py-2.5
            rounded-full
            border-2 border-current
            flex items-center gap-2
            hover:bg-black/10
            hover:scale-105
            transition-all
            duration-200
            font-semibold
          "
        >
          <MessageCircle size={16} />
          Messages
        </button>
      </div>
    </div>
  )
}