import { useState, useEffect, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../store'
import { ChevronLeft} from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { showSuccessToast, showErrorToast } from '../utils/toast'
import Ribbon, { type RibbonActions } from './Ribbon'
import StatusBar from './StatusBar'
import WordEditor from './editors/WordEditor'
import PowerPointEditor from './editors/PowerPointEditor'
import PDFEditor from './editors/PDFEditor'
import ExcelEditor from './editors/ExcelEditor'
import ImageEditor from './editors/ImageEditor'

interface EditorViewProps {
  file: DocumentFile
}

export default function EditorView({ file }: EditorViewProps) {
  const [, setIsSaving] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const imageContainerRef = useRef<HTMLDivElement>(null)
  
  const clearCurrentFile = useDocumentStore((state) => state.clearCurrentFile)
  const editorHtml = useDocumentStore((state) => state.editorHtml)
  const zoom = useDocumentStore((state) => state.zoom)
  const setZoom = useDocumentStore((state) => state.setZoom)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const displayType = (file.originalType || file.type) as DocumentFile['type']

  const handleBack = () => {
    showSuccessToast('✅ File closed', displayType)
    clearCurrentFile()
  }

  const handleSave = async () => {
    setIsSaving(true)
    // For images, save the current state if edited
    if (file.type === 'image') {
      // You could implement image saving here if needed
      await new Promise((resolve) => setTimeout(resolve, 800))
    } else {
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    setIsSaving(false)
    showSuccessToast(`✅ ${file.name} saved successfully!`, file.type)
  }

  const handleExport = async () => {
    if (file.workflow === 'pdf-to-word' && file.type === 'docx') {
      try {
        const doc = await PDFDocument.create()
        const font = await doc.embedFont(StandardFonts.Helvetica)
        let currentPdfPage = doc.addPage([595.28, 841.89])
        const margin = 40
        const fontSize = 11
        const lineHeight = 15

        const plainText = (editorHtml || '')
          .replace(/<br\s*\/?>(\n)?/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')

        let y = currentPdfPage.getHeight() - margin
        const maxWidth = currentPdfPage.getWidth() - margin * 2

        const lines = plainText.split(/\r?\n/)
        for (const rawLine of lines) {
          let line = rawLine || ' '
          while (line.length > 0) {
            let fit = line
            while (font.widthOfTextAtSize(fit, fontSize) > maxWidth && fit.length > 1) {
              fit = fit.slice(0, -1)
            }

            if (y < margin) {
              currentPdfPage = doc.addPage([595.28, 841.89])
              y = currentPdfPage.getHeight() - margin
            }

            currentPdfPage.drawText(fit, { x: margin, y, size: fontSize, font })
            y -= lineHeight
            line = line.slice(fit.length)
          }
        }

        const pdfBytes = await doc.save()
        const pdfBuffer = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name.replace(/\.(docx|pdf)$/i, '') + '-edited.pdf'
        a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Export failed:', err)
        showErrorToast('Could not export edited PDF.')
      }
      return
    }

    // Handle image export
    if (file.type === 'image') {
      try {
        const blob = new Blob([file.content], { type: getImageMimeType(file.name) })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
        showSuccessToast(`✅ ${file.name} exported successfully!`, file.type)
      } catch (err) {
        console.error('Export failed:', err)
        showErrorToast('Could not export image.')
      }
      return
    }

    showErrorToast('Export feature coming soon!')
  }

  const getImageMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml'
    }
    return mimeTypes[ext || ''] || 'image/png'
  }

  const handlePrint = () => {
    if (file.type === 'image') {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        const imageUrl = URL.createObjectURL(new Blob([file.content], { type: getImageMimeType(file.name) }))
        printWindow.document.write(`
          <html>
            <head>
              <title>${file.name}</title>
              <style>
                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              </style>
            </head>
            <body>
              <img src="${imageUrl}" alt="${file.name}" />
              <script>
                window.onload = () => {
                  window.print();
                  window.onafterprint = () => window.close();
                }
              <\/script>
            </body>
          </html>
        `)
        printWindow.document.close()
      }
      return
    }
    window.print()
  }

  // Image-specific handlers
  const handleRotateLeft = () => {
    setRotation(prev => prev - 90)
    applyImageTransform()
  }

  const handleRotateRight = () => {
    setRotation(prev => prev + 90)
    applyImageTransform()
  }

  const handleResetRotation = () => {
    setRotation(0)
    applyImageTransform()
  }

  const handleResetPosition = () => {
    setPosition({ x: 0, y: 0 })
    applyImageTransform()
  }

  const applyImageTransform = () => {
    const container = imageContainerRef.current
    if (container) {
      container.style.transform = `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg)`
    }
  }

  const handleTogglePan = () => {
    setIsDragging(!isDragging)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDragging) return
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const newPosition = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }
      setPosition(newPosition)
      applyImageTransform()
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const getEditableRoot = () => {
    const selection = window.getSelection()
    const anchorNode = selection?.anchorNode
    const anchorElement = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement
    return anchorElement?.closest('[contenteditable="true"]') as HTMLElement | null
  }

  const applySelectionStyle = (style: Partial<CSSStyleDeclaration>) => {
    const root = getEditableRoot()
    if (!root) return

    root.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return

    if (range.collapsed) {
      const span = document.createElement('span')
      Object.assign(span.style, style)
      const marker = document.createTextNode('\u200b')
      span.appendChild(marker)
      range.insertNode(span)
      const nextRange = document.createRange()
      nextRange.setStart(marker, 1)
      nextRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(nextRange)
    } else {
      const span = document.createElement('span')
      Object.assign(span.style, style)
      try {
        range.surroundContents(span)
      } catch {
        const contents = range.extractContents()
        span.appendChild(contents)
        range.insertNode(span)
      }

      const nextRange = document.createRange()
      nextRange.selectNodeContents(span)
      selection.removeAllRanges()
      selection.addRange(nextRange)
    }

    root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
  }

  const applyParagraphCommand = (command: 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull') => {
    const root = getEditableRoot()
    if (root) {
      root.focus()
    }
    document.execCommand(command, false)
  }

  const replaceTextInEditable = (searchText: string, replacementText: string) => {
    const root = getEditableRoot()
    if (!root) return false

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let currentNode = walker.nextNode()
    while (currentNode) {
      textNodes.push(currentNode as Text)
      currentNode = walker.nextNode()
    }

    let replaced = false
    for (const textNode of textNodes) {
      if (!textNode.nodeValue || !textNode.nodeValue.includes(searchText)) continue
      textNode.nodeValue = textNode.nodeValue.split(searchText).join(replacementText)
      replaced = true
    }

    if (replaced) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }

    return replaced
  }

  const handleFind = () => {
    if (file.type === 'image') {
      showErrorToast('Find is not available for images')
      return
    }
    const searchText = window.prompt('Find text:')?.trim()
    if (!searchText) return
    const browserWindow = window as Window & { find?: (query: string) => boolean }
    if (!browserWindow.find?.(searchText)) {
      showErrorToast(`Could not find "${searchText}" in the active document.`)
    }
  }

  const handleReplace = () => {
    if (file.type === 'image') {
      showErrorToast('Replace is not available for images')
      return
    }
    const searchText = window.prompt('Find text to replace:')?.trim()
    if (!searchText) return
    const replacementText = window.prompt('Replace with:', '')
    if (replacementText === null) return

    const replaced = replaceTextInEditable(searchText, replacementText)
    if (!replaced) {
      showErrorToast('Select a document area with editable text before replacing.')
    }
  }

  const toolbarActions: RibbonActions = {
    onSave: handleSave,
    onOpen: handleBack,
    onExport: handleExport,
    onPrint: handlePrint,
    onZoomIn: () => setZoom(Math.min(300, zoom + 10)),
    onZoomOut: () => setZoom(Math.max(10, zoom - 10)),
    onToggleBold: () => applySelectionStyle({ fontWeight: 'bold' }),
    onToggleItalic: () => applySelectionStyle({ fontStyle: 'italic' }),
    onToggleUnderline: () => applySelectionStyle({ textDecoration: 'underline' }),
    onAlignLeft: () => applyParagraphCommand('justifyLeft'),
    onAlignCenter: () => applyParagraphCommand('justifyCenter'),
    onAlignRight: () => applyParagraphCommand('justifyRight'),
    onAlignJustify: () => applyParagraphCommand('justifyFull'),
    onSetFontFamily: (font) => applySelectionStyle({ fontFamily: font }),
    onSetFontSize: (size) => applySelectionStyle({ fontSize: `${size}px` }),
    onSetColor: (color) => applySelectionStyle({ color }),
    onFind: handleFind,
    onReplace: handleReplace,
    onSetTool: setActiveTool,
    onSetLanguage: (language) => console.log('Language changed to', language),
    onBack: handleBack,
    // Image-specific actions
    onRotateLeft: file.type === 'image' ? handleRotateLeft : undefined,
    onRotateRight: file.type === 'image' ? handleRotateRight : undefined,
    onResetRotation: file.type === 'image' ? handleResetRotation : undefined,
    onTogglePan: file.type === 'image' ? handleTogglePan : undefined,
    onResetPosition: file.type === 'image' ? handleResetPosition : undefined,
    isPanActive: isDragging,
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        handlePrint()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        clearCurrentFile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearCurrentFile])

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <Ribbon fileType={displayType} actions={toolbarActions} />

      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600 shadow-sm">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 rounded px-3 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          title="Back (Ctrl+O)"
        >
          <ChevronLeft size={18} />
          Back
        </button>

        <div className="flex-1 px-2">
          <div className="font-semibold text-gray-800">{file.name}</div>
          <div className="text-[11px] text-gray-500">{displayType?.toUpperCase()}</div>
        </div>
      </div>

      {/* Editor content */}
      <div 
        className="flex-1 overflow-hidden flex flex-col"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {file.type === 'docx' && <WordEditor file={file} />}
        {file.type === 'pptx' && <PowerPointEditor file={file} />}
        {file.type === 'pdf' && <PDFEditor file={file} />}
        {file.type === 'xlsx' && <ExcelEditor file={file} />}
        {file.type === 'image' && (
          <div 
            ref={imageContainerRef}
            style={{
              cursor: isDragging ? 'grabbing' : 'default',
              transition: 'transform 0.2s ease',
              width: '100%',
              height: '100%'
            }}
            onMouseDown={handleMouseDown}
          >
            <ImageEditor file={file} />
          </div>
        )}
      </div>

      <StatusBar file={file} />
    </div>
  )
}