import { DocumentFile, useDocumentStore } from '../store'
import { ZoomOut, ZoomIn } from 'lucide-react'

interface StatusBarProps {
  file: DocumentFile
}

export default function StatusBar(_: StatusBarProps) {
  const zoom = useDocumentStore((state) => state.zoom)
  const setZoom = useDocumentStore((state) => state.setZoom)
  const wordCount = useDocumentStore((state) => state.wordCount)
  const charCount = useDocumentStore((state) => state.charCount)
  const currentPage = useDocumentStore((state) => state.currentPage)

  return (
    <div className="bg-gray-200 border-t border-gray-300 px-4 py-2 flex items-center justify-between text-sm text-gray-700">
      <div className="flex items-center gap-4">
        <span>Page {currentPage}</span>
        <span className="border-l border-gray-400 pl-4">
          {wordCount} words · {charCount} characters
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setZoom(zoom - 10)}
          className="p-1 hover:bg-gray-300 rounded transition-colors"
          title="Zoom out"
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
          className="w-24 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer"
        />
        <button
          onClick={() => setZoom(zoom + 10)}
          className="p-1 hover:bg-gray-300 rounded transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <span className="ml-2 py-1 px-2 bg-gray-300 rounded min-w-12 text-center">
          {zoom}%
        </span>
      </div>
    </div>
  )
}
