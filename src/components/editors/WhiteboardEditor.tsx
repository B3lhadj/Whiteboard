import { useEffect, useRef, useState } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { getPageDimensions, calculateWordCount } from '../../utils'
import PageRail, { type PageRailItem } from '../PageRail'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils'
import { getShapeSize, getShapeSvg, type ShapeKind } from '../../shapes'

interface WhiteboardEditorProps {
  file: DocumentFile
}

export default function WhiteboardEditor({ file }: WhiteboardEditorProps) {
  const [pageContent, setPageContent] = useState<Record<number, string>>({})
  const editorRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const selectedToolObjectRef = useRef<HTMLElement | null>(null)
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
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const selectedShape = useDocumentStore((state) => state.selectedShape)
  const textColor = useDocumentStore((state) => state.textColor)
  const shapeFillColor = useDocumentStore((state) => state.shapeFillColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
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

  const syncWhiteboardState = () => {
    if (!editorRef.current) return

    const html = editorRef.current.innerHTML
    const text = editorRef.current.innerText || ''
    const newContent = { ...pageContent, [currentPage]: html }
    setPageContent(newContent)
    setWordCount(calculateWordCount(text))
    setCharCount(text.length)
    setEditorHtml(html)
  }

  const pushToolHistory = (label: string, beforeHtml: string, root: HTMLElement | null = editorRef.current) => {
    if (!root) return
    const afterHtml = root.innerHTML
    window.dispatchEvent(
      new CustomEvent('editor-history-snapshot', {
        detail: { root, beforeHtml, afterHtml, label },
      })
    )
  }

  const getEditorPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = editorRef.current
    if (!container) return { x: 24, y: 24 }
    const rect = container.getBoundingClientRect()
    const scale = (zoom * 1.12) / 100 || 1
    return {
      x: Math.max(0, (event.clientX - rect.left) / scale),
      y: Math.max(0, (event.clientY - rect.top) / scale),
    }
  }

  const createWhiteboardObject = (
    className: string,
    x: number,
    y: number,
    html = '',
    size?: { width: number; height: number }
  ) => {
    const container = editorRef.current
    if (!container) return null
    const beforeHtml = container.innerHTML

    const element = document.createElement('div')
    element.className = `word-tool-object ${className}`
    element.style.left = `${x}px`
    element.style.top = `${y}px`
    if (size) {
      element.style.width = `${size.width}px`
      element.style.height = `${size.height}px`
    }
    element.innerHTML = html
    container.appendChild(element)
    syncWhiteboardState()
    pushToolHistory('Insertion de forme', beforeHtml, container)
    return element
  }

  const selectToolObject = (object: HTMLElement | null) => {
    selectedToolObjectRef.current?.classList.remove('is-selected')
    selectedToolObjectRef.current = object
    if (object?.classList.contains('word-shape-object')) {
      object.style.setProperty('--word-shape-control-color', object.dataset.shapeStroke || textColor)
    }
    object?.classList.add('is-selected')
  }

  const shapeMarkup = (svg: string) =>
    `${svg}<span class="word-rotate-handle" contenteditable="false"></span><span class="word-resize-handle" contenteditable="false"></span>`

  const setShapeMarkup = (object: HTMLElement, shape: ShapeKind, color: string, fill: string) => {
    object.dataset.shapeStroke = color
    object.dataset.shapeFill = fill
    object.style.setProperty('--word-shape-control-color', color)
    object.innerHTML = shapeMarkup(
      getShapeSvg(shape, {
        width: Math.max(1, object.offsetWidth),
        height: Math.max(1, object.offsetHeight),
        stroke: color,
        fill,
      })
    )
  }

  const beginResizeObject = (event: React.PointerEvent<HTMLDivElement>, object: HTMLElement) => {
    event.preventDefault()
    event.stopPropagation()
    selectToolObject(object)

    const startX = event.clientX
    const startY = event.clientY
    const initialWidth = object.offsetWidth
    const initialHeight = object.offsetHeight
    const scale = (zoom * 1.12) / 100 || 1
    const root = editorRef.current
    const beforeHtml = root?.innerHTML || ''

    const resize = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(36, initialWidth + (moveEvent.clientX - startX) / scale)
      const nextHeight = Math.max(24, initialHeight + (moveEvent.clientY - startY) / scale)
      object.style.width = `${nextWidth}px`
      object.style.height = `${nextHeight}px`
    }

    const stop = () => {
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
      syncWhiteboardState()
      pushToolHistory('Redimensionnement de forme', beforeHtml, root)
    }

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop)
  }

  const beginMoveObject = (event: React.PointerEvent<HTMLDivElement>, object: HTMLElement) => {
    selectToolObject(object)

    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const initialLeft = parseFloat(object.style.left || '0')
    const initialTop = parseFloat(object.style.top || '0')
    const scale = (zoom * 1.12) / 100 || 1
    const root = editorRef.current
    const beforeHtml = root?.innerHTML || ''

    const move = (moveEvent: PointerEvent) => {
      object.style.left = `${initialLeft + (moveEvent.clientX - startX) / scale}px`
      object.style.top = `${initialTop + (moveEvent.clientY - startY) / scale}px`
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      syncWhiteboardState()
      pushToolHistory('Deplacement de forme', beforeHtml, root)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const beginRotateObject = (event: React.PointerEvent<HTMLDivElement>, object: HTMLElement) => {
    event.preventDefault()
    event.stopPropagation()
    selectToolObject(object)

    const rect = object.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const initialRotation = parseFloat(object.dataset.rotation || '0')
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX)
    const root = editorRef.current
    const beforeHtml = root?.innerHTML || ''

    const rotate = (moveEvent: PointerEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX)
      const delta = ((currentAngle - startAngle) * 180) / Math.PI
      const nextRotation = Math.round(initialRotation + delta)
      object.dataset.rotation = String(nextRotation)
      object.style.transform = `rotate(${nextRotation}deg)`
    }

    const stop = () => {
      window.removeEventListener('pointermove', rotate)
      window.removeEventListener('pointerup', stop)
      syncWhiteboardState()
      pushToolHistory('Rotation de forme', beforeHtml, root)
    }

    window.addEventListener('pointermove', rotate)
    window.addEventListener('pointerup', stop)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const selectedObject = target.closest('.word-tool-object') as HTMLElement | null
    const rotateObject = target.closest('.word-rotate-handle')?.closest('.word-tool-object') as HTMLElement | null
    const resizeObject = target.closest('.word-resize-handle')?.closest('.word-tool-object') as HTMLElement | null

    if (rotateObject) {
      beginRotateObject(event, rotateObject)
      return
    }

    if (resizeObject) {
      beginResizeObject(event, resizeObject)
      return
    }

    if (activeTool === 'select') {
      if (selectedObject) {
        beginMoveObject(event, selectedObject)
      } else {
        selectToolObject(null)
      }
      return
    }

    if (selectedObject && activeTool !== 'erase') {
      beginMoveObject(event, selectedObject)
      return
    }

    if (activeTool === 'erase') {
      event.preventDefault()
      const root = editorRef.current
      const beforeHtml = root?.innerHTML || ''
      selectedObject?.remove()
      syncWhiteboardState()
      pushToolHistory('Suppression de forme', beforeHtml, root)
      return
    }

    if (activeTool === 'shape') {
      event.preventDefault()
      const point = getEditorPoint(event)
      const shapeSize = getShapeSize(selectedShape)
      const fill = shapeFillColor
      const shapeObject = createWhiteboardObject(
        'word-shape-object',
        point.x,
        point.y,
        shapeMarkup(getShapeSvg(selectedShape, { stroke: textColor, fill })),
        shapeSize
      )
      if (shapeObject) {
        shapeObject.dataset.shapeKind = selectedShape
        shapeObject.dataset.shapeStroke = textColor
        shapeObject.dataset.shapeFill = fill
        shapeObject.style.setProperty('--word-shape-control-color', textColor)
        selectToolObject(shapeObject)
      }
      setActiveTool('select')
      return
    }

    if (activeTool === 'text' && !target.closest('.word-textbox-object')) {
      event.preventDefault()
      const point = getEditorPoint(event)
      const textBox = createWhiteboardObject(
        'word-textbox-object',
        point.x,
        point.y,
        `<div contenteditable="true" spellcheck="true" style="color: ${textColor}; font-family: ${textFontFamily}; font-size: ${textFontSize}px;">Text box</div>`
      )
      const editable = textBox?.querySelector('[contenteditable="true"]') as HTMLElement | null
      editable?.focus()
    }
  }

  const handleAddPage = () => {
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

  useEffect(() => {
    const handleConfirmShape = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return

      const object = selectedToolObjectRef.current
      if (!object || !document.contains(object) || !object.classList.contains('word-shape-object')) return

      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('.word-textbox-object')) return

      event.preventDefault()
      selectToolObject(null)
      syncWhiteboardState()
    }

    window.addEventListener('keydown', handleConfirmShape)
    return () => window.removeEventListener('keydown', handleConfirmShape)
  }, [pageContent, currentPage])

  useEffect(() => {
    const handleShapeColorChange = (event: Event) => {
      const color = (event as CustomEvent<{ color?: string }>).detail?.color
      const object = selectedToolObjectRef.current
      if (!color || !object || !document.contains(object) || !object.classList.contains('word-shape-object')) return

      const shape = (object.dataset.shapeKind || 'rectangle') as ShapeKind
      const beforeHtml = editorRef.current?.innerHTML || ''
      setShapeMarkup(object, shape, color, object.dataset.shapeFill || shapeFillColor)
      syncWhiteboardState()
      pushToolHistory('Couleur de forme', beforeHtml)
    }

    const handleShapeFillChange = (event: Event) => {
      const fill = (event as CustomEvent<{ color?: string }>).detail?.color
      const object = selectedToolObjectRef.current
      if (!fill || !object || !document.contains(object) || !object.classList.contains('word-shape-object')) return

      const shape = (object.dataset.shapeKind || 'rectangle') as ShapeKind
      const beforeHtml = editorRef.current?.innerHTML || ''
      setShapeMarkup(object, shape, object.dataset.shapeStroke || textColor, fill)
      syncWhiteboardState()
      pushToolHistory('Remplissage de forme', beforeHtml)
    }

    window.addEventListener('editor-shape-color-change', handleShapeColorChange)
    window.addEventListener('editor-shape-fill-change', handleShapeFillChange)
    return () => {
      window.removeEventListener('editor-shape-color-change', handleShapeColorChange)
      window.removeEventListener('editor-shape-fill-change', handleShapeFillChange)
    }
  }, [pageContent, currentPage, shapeFillColor, textColor])

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
                : activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image'
                  ? 'cursor-crosshair'
                  : activeTool === 'erase'
                    ? 'cursor-not-allowed'
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
            onPointerDown={handlePointerDown}
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
        accentColor={themeColor}
        side="right"
        onAddStep={handleAddPage}
      />
    </div>
  )
}
