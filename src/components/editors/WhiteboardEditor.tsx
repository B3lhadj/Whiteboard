import { useEffect, useRef, useState } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { getPageDimensions, calculateWordCount, calculateCharCount } from '../../utils'
import PageRail, { type PageRailItem } from '../PageRail'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils'

interface WhiteboardEditorProps {
  file: DocumentFile
}

export default function WhiteboardEditor({ file }: WhiteboardEditorProps) {
  const [pageContent, setPageContent] = useState<Record<number, string>>({})
  const editorRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const themeColor = getThemeForFileType(file.type)

  const zoom = useDocumentStore((state) => state.zoom)
  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const setEditorHtml = useDocumentStore((state) => state.setEditorHtml)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const addPage = useDocumentStore((state) => state.addPage)
  const deletePage = useDocumentStore((state) => state.deletePage)
  const movePage = useDocumentStore((state) => state.movePage)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const pageDimensions = getPageDimensions('docx', pageOrientation)

  // Initialize with one blank page
  useEffect(() => {
    if (!file.wordPages) {
      file.wordPages = [{ id: '1', content: '' }]
      setPageContent({ 1: '' })
    }
  }, [file])

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      const text = editorRef.current.innerText || ''

      // Update page content
      const newContent = { ...pageContent, [currentPage]: html }
      setPageContent(newContent)

      // Update counts
      setWordCount(calculateWordCount(text))
      setCharCount(text.length)
      setEditorHtml(html)
    }
  }

  const handleAddPage = () => {
    const newPage = { id: String(Date.now()), content: '' }
    const newContent = { ...pageContent, [Object.keys(pageContent).length + 1]: '' }
    setPageContent(newContent)
    addPage()
  }

  const handleDeletePage = (index: number) => {
    const newContent = { ...pageContent }
    delete newContent[index + 1]
    setPageContent(newContent)
    deletePage(index)
  }

  // Fixed: Added explicit type for 'direction' parameter
  const handleMovePage = (index: number, direction: 'up' | 'down') => {
    movePage(index, direction)
  }

  const pageCount = file.wordPages?.length || 1
  const totalPages = Object.keys(pageContent).length || 1
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages))

  useEffect(() => {
    if (editorRef.current && pageContent[safeCurrentPage]) {
      editorRef.current.innerHTML = pageContent[safeCurrentPage]
    } else if (editorRef.current) {
      editorRef.current.innerHTML = ''
    }
  }, [safeCurrentPage, pageContent])

  const pageItems: PageRailItem[] = Array.from({ length: totalPages }).map((_, i) => ({
    id: String(i + 1),
    label: `Page ${i + 1}`,
    subtitle: '',
    onClick: () => setCurrentPage(i + 1),
    onDelete: () => handleDeletePage(i),
    onMove: (direction: 'up' | 'down') => handleMovePage(i, direction), // Also fixed here
    canDelete: totalPages > 1,
    canMoveUp: i > 0,
    canMoveDown: i < totalPages - 1,
  }))

  return (
    <div data-print-editor="whiteboard" className="flex-1 min-h-0 bg-white flex overflow-hidden">
      <div data-print-editor-main="true" ref={viewportRef} className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white p-0 sm:p-1 md:p-2">
        <div data-print-scroll="true" ref={contentScrollRef} className="relative mx-auto flex min-h-0 w-full max-w-none flex-1 justify-center overflow-auto bg-white">
          <div
            data-print-document="true"
            ref={editorRef}
            contentEditable
            spellCheck={false}
            suppressContentEditableWarning
            className={`whiteboard-editor-root relative bg-white p-8 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${activeTool === 'text'
                ? 'cursor-text'
                : 'cursor-text'
              }`}
            style={{
              transform: `scale(${(zoom * 1.12) / 100})`,
              transformOrigin: 'top center',
              color: '#333',
              width: `${pageDimensions.width}px`,
              minWidth: 'unset',
              maxWidth: '100%',
              minHeight: `${pageDimensions.height}px`,
              transition: 'width 250ms ease, min-height 250ms ease, transform 250ms ease',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
            onInput={handleInput}
          />
        </div>

        <EditorNavigation
          current={safeCurrentPage}
          total={totalPages}
          onPrevious={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
          onNext={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
          className="shrink-0 border-t border-gray-200 bg-white"
          themeColor={themeColor}
        />
      </div>

      <PageRail
        title="PAGES"
        items={pageItems}
        activeId={String(safeCurrentPage)}
        accentColor="#7c3aed"
        side="right"
        onAddStep={handleAddPage}
      />
    </div>
  )
}