import { useState, useEffect } from 'react'
import { DocumentFile, useDocumentStore } from '../store'
import { ChevronLeft, Save, Download, Printer } from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import Ribbon, { type RibbonActions } from './Ribbon'
import StatusBar from './StatusBar'
import WordEditor from './editors/WordEditor'
import PowerPointEditor from './editors/PowerPointEditor'
import PDFEditor from './editors/PDFEditor'
import ExcelEditor from './editors/ExcelEditor'

interface EditorViewProps {
  file: DocumentFile
}

export default function EditorView({ file }: EditorViewProps) {
  const [isSaving, setIsSaving] = useState(false)
  const clearCurrentFile = useDocumentStore((state) => state.clearCurrentFile)
  const editorHtml = useDocumentStore((state) => state.editorHtml)
  const zoom = useDocumentStore((state) => state.zoom)
  const setZoom = useDocumentStore((state) => state.setZoom)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const displayType = (file.originalType || file.type) as DocumentFile['type']

  const handleSave = async () => {
    setIsSaving(true)
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 800))
    setIsSaving(false)
    alert(`✓ ${file.name} saved successfully!`)
  }

  const handleExport = async () => {
    if (file.workflow === 'pdf-to-word' && file.type === 'docx') {
      try {
        const doc = await PDFDocument.create()
        const font = await doc.embedFont(StandardFonts.Helvetica)
        let currentPdfPage = doc.addPage([595.28, 841.89]) // A4 in points
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
        alert('Could not export edited PDF.')
      }
      return
    }

    alert('Export feature coming soon!')
  }

  const handlePrint = () => {
    window.print()
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
    const searchText = window.prompt('Find text:')?.trim()
    if (!searchText) return
    const browserWindow = window as Window & { find?: (query: string) => boolean }
    if (!browserWindow.find?.(searchText)) {
      alert(`Could not find "${searchText}" in the active document.`)
    }
  }

  const handleReplace = () => {
    const searchText = window.prompt('Find text to replace:')?.trim()
    if (!searchText) return
    const replacementText = window.prompt('Replace with:', '')
    if (replacementText === null) return

    const replaced = replaceTextInEditable(searchText, replacementText)
    if (!replaced) {
      alert('Select a document area with editable text before replacing.')
    }
  }

  const toolbarActions: RibbonActions = {
    onSave: handleSave,
    onOpen: clearCurrentFile,
    onExport: handleExport,
    onPrint: handlePrint,
    onZoomIn: () => setZoom(zoom + 10),
    onZoomOut: () => setZoom(zoom - 10),
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
    onLogout: clearCurrentFile,
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
          onClick={clearCurrentFile}
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

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            title="Save (Ctrl+S)"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-green-700"
            title="Export"
          >
            <Download size={16} />
            Export
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded bg-gray-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-gray-700"
            title="Print (Ctrl+P)"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {file.type === 'docx' && <WordEditor file={file} />}
        {file.type === 'pptx' && <PowerPointEditor file={file} />}
        {file.type === 'pdf' && <PDFEditor file={file} />}
        {file.type === 'xlsx' && <ExcelEditor file={file} />}
      </div>

      <StatusBar file={file} />
    </div>
  )
}
