import { useEffect, useMemo, useState, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { AlertCircle, Type, Download, Trash2 } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { showErrorToast } from '../../utils/toast'
import PageRail, { type PageRailItem } from '../PageRail.tsx'
import EditorNavigation from '../EditorNavigation'
import { EDITOR_COLOR_PALETTE, EDITOR_FONT_FAMILIES, EDITOR_FONT_SIZES } from '../../editorOptions'
import { getThemeForFileType } from '../../utils'

interface PDFEditorProps {
  file: DocumentFile
}

interface PdfAnnotation {
  id: string
  page: number
  xRatio: number
  yRatio: number
  text: string
  fontSize: number
  fontFamily: string
  color: string
}

// Use local bundled worker to avoid CDN/network failures.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString()

export default function PDFEditor({ file }: PDFEditorProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfSourceBuffer, setPdfSourceBuffer] = useState<ArrayBuffer | null>(null)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [pageThumbnails, setPageThumbnails] = useState<string[]>([])
  const [isAddTextMode, setIsAddTextMode] = useState(false)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const lastToolbarFormatRef = useRef({ textColor: '', textFontFamily: '', textFontSize: 0 })
  const themeColor = getThemeForFileType(file.type)

  const currentFile = useDocumentStore((state) => state.currentFile)
  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const zoom = useDocumentStore((state) => state.zoom)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const textColor = useDocumentStore((state) => state.textColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
  const addPage = useDocumentStore((state) => state.addPage)
  const updatePageOrder = useDocumentStore((state) => state.updatePageOrder)
  const toggleViewMode = useDocumentStore((state) => state.toggleViewMode)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)

  const pageOrder = currentFile?.pageOrder || []
  const viewOnly = currentFile?.viewOnly || false

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.page === currentPage),
    [annotations, currentPage]
  )

  useEffect(() => {
    const loadPDF = async () => {
      try {
        setIsLoading(true)
        setError(null)

        if (!file.content || file.content.byteLength === 0) {
          throw new Error('This recent file does not include PDF data. Please re-upload the PDF file.')
        }

        // Clone once and keep a stable copy so worker transfers never detach the original source for export.
        const stableBuffer = file.content.slice(0)
        setPdfSourceBuffer(stableBuffer)

        // Send a cloned typed array to PDF.js worker.
        const pdfData = new Uint8Array(stableBuffer.slice(0))
        const doc = await pdfjsLib.getDocument({ data: pdfData }).promise
        setPdfDoc(doc)
        // Initialize page order in store if not already set
        if (!currentFile?.pageOrder || currentFile.pageOrder.length === 0) {
          updatePageOrder(Array.from({ length: doc.numPages }, (_, i) => i))
        }
        setPageThumbnails([])
        setCurrentPage(1)
      } catch (err: any) {
        console.error('Error loading PDF:', err)
        // Try alternative method if CORS issue
        try {
          const fallbackBuffer = file.content.slice(0)
          const blob = new Blob([fallbackBuffer], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          const doc = await pdfjsLib.getDocument(url).promise
          setPdfDoc(doc)
          setCurrentPage(1)
          setError(null)
          setPdfSourceBuffer(fallbackBuffer)
        } catch (altErr) {
          console.error('Alternative PDF loading failed:', altErr)
          const message = String(err?.message || '')
          if (message.includes('already detached')) {
            setError('PDF worker buffer transfer failed. Please re-upload the PDF.')
          } else {
            setError(err?.message || 'Failed to load PDF. This might be due to the file format or size.')
          }
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadPDF()
  }, [file.content, setCurrentPage])

  const getPdfRotation = async (page: any) => {
    const viewport = page.getViewport({ scale: 1 })
    const isLandscapePage = viewport.width > viewport.height
    const wantsLandscape = pageOrientation === 'landscape'
    return wantsLandscape !== isLandscapePage ? 90 : 0
  }

  useEffect(() => {
    const buildThumbnails = async () => {
      if (!pdfDoc || pageOrder.length === 0) return

      try {
        const thumbs: string[] = []
        for (let originalIndex of pageOrder) {
          if (originalIndex === -1) {
            thumbs.push('') // Blank page has no thumbnail
            continue
          }
          const page = await pdfDoc.getPage(originalIndex + 1)
          const rotation = await getPdfRotation(page)
          const viewport = page.getViewport({ scale: 0.18, rotation })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) continue

          canvas.width = Math.max(1, Math.floor(viewport.width))
          canvas.height = Math.max(1, Math.floor(viewport.height))

          await page.render({ canvasContext: context, viewport }).promise
          thumbs.push(canvas.toDataURL('image/png'))
        }
        setPageThumbnails(thumbs)
      } catch (thumbErr) {
        console.error('Error building PDF thumbnails:', thumbErr)
      }
    }

    buildThumbnails()
  }, [pdfDoc, pageOrder, pageOrientation])

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || pageOrder.length === 0) return

      // Make sure current page is valid
      if (currentPage < 1 || currentPage > pageOrder.length) {
        setCurrentPage(1)
        return
      }

      try {
        const actualPageIndex = pageOrder[currentPage - 1]
        if (actualPageIndex === undefined || actualPageIndex === -1) {
          // Blank page or placeholder
          const canvas = canvasRef.current
          const context = canvas?.getContext('2d')
          if (canvas && context) {
            canvas.width = 600
            canvas.height = 800
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.fillStyle = '#94a3b8'
            context.font = '24px Arial'
            context.textAlign = 'center'
            context.fillText('Blank Page', canvas.width / 2, canvas.height / 2)
          }
          return
        }

        const page = await pdfDoc.getPage(actualPageIndex + 1)
        const rotation = await getPdfRotation(page)
        const scale = (zoom / 100) * 2.35
        const viewport = page.getViewport({ scale, rotation })

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise
      } catch (err) {
        console.error('Error rendering PDF page:', err)
      }
    }

    renderPage()
  }, [pdfDoc, currentPage, zoom, pageOrder, pageOrientation, setCurrentPage])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if ((!isAddTextMode && activeTool !== 'text') || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const xRatio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    const yRatio = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)

    const newAnnotation: PdfAnnotation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      page: currentPage,
      xRatio,
      yRatio,
      text: 'Edit me',
      fontSize: textFontSize,
      fontFamily: textFontFamily,
      color: textColor,
    }

    setAnnotations((prev) => [...prev, newAnnotation])
    setSelectedAnnotationId(newAnnotation.id)
    setIsAddTextMode(false)
  }

  const updateAnnotation = (id: string, patch: Partial<PdfAnnotation>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  useEffect(() => {
    const currentFormat = { textColor, textFontFamily, textFontSize }
    const previousFormat = lastToolbarFormatRef.current
    const changed =
      previousFormat.textColor !== textColor ||
      previousFormat.textFontFamily !== textFontFamily ||
      previousFormat.textFontSize !== textFontSize

    lastToolbarFormatRef.current = currentFormat

    if (changed && selectedAnnotationId) {
      updateAnnotation(selectedAnnotationId, {
        color: textColor,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
      })
    }
  }, [selectedAnnotationId, textColor, textFontFamily, textFontSize])

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null)
    }
  }

  const hexToRgb = (hex: string) => {
    const clean = hex.replace('#', '')
    if (clean.length !== 6) {
      return { r: 0, g: 0, b: 0 }
    }
    const r = parseInt(clean.slice(0, 2), 16) / 255
    const g = parseInt(clean.slice(2, 4), 16) / 255
    const b = parseInt(clean.slice(4, 6), 16) / 255
    return { r, g, b }
  }

  const getPdfStandardFont = (fontFamily: string) => {
    if (fontFamily.includes('Times') || fontFamily === 'Georgia' || fontFamily === 'Cambria') {
      return StandardFonts.TimesRoman
    }
    if (fontFamily.includes('Courier') || fontFamily === 'Consolas') {
      return StandardFonts.Courier
    }
    return StandardFonts.Helvetica
  }

  const handleExportEditedPdf = async () => {
    try {
      setIsExporting(true)
      if (!pdfSourceBuffer || pdfSourceBuffer.byteLength === 0) {
        throw new Error('No PDF source data available. Please re-upload the PDF.')
      }

      const sourceDoc = await PDFDocument.load(pdfSourceBuffer)
      const outDoc = await PDFDocument.create()
      const embeddedFonts = new Map<string, Awaited<ReturnType<typeof outDoc.embedFont>>>()
      const getEmbeddedFont = async (fontFamily: string) => {
        const standardFont = getPdfStandardFont(fontFamily)
        if (!embeddedFonts.has(standardFont)) {
          embeddedFonts.set(standardFont, await outDoc.embedFont(standardFont))
        }
        return embeddedFonts.get(standardFont)!
      }

      for (let i = 0; i < pageOrder.length; i++) {
        const originalIndex = pageOrder[i]
        let page

        if (originalIndex === -1) {
          // Add a blank A4-ish page
          page = outDoc.addPage([595, 842])
        } else {
          const [copiedPage] = await outDoc.copyPages(sourceDoc, [originalIndex])
          page = outDoc.addPage(copiedPage)
        }

        // Find annotations that belong to this position in the new document
        const posInNewDoc = i + 1
        const relevantAnnotations = annotations.filter((a) => a.page === posInNewDoc)

        for (const annotation of relevantAnnotations) {
          if (!annotation.text.trim()) continue
          const { width, height } = page.getSize()
          const x = annotation.xRatio * width
          const y = height - annotation.yRatio * height - annotation.fontSize
          const color = hexToRgb(annotation.color)
          const font = await getEmbeddedFont(annotation.fontFamily)
          const lineHeight = annotation.fontSize * 1.25

          annotation.text.split(/\r?\n/).forEach((line, lineIndex) => {
            page.drawText(line || ' ', {
              x,
              y: y - lineIndex * lineHeight,
              size: annotation.fontSize,
              font,
              color: rgb(color.r, color.g, color.b),
            })
          })
        }
      }

      const editedBytes = await outDoc.save()
      const editedBuffer = editedBytes.buffer.slice(
        editedBytes.byteOffset,
        editedBytes.byteOffset + editedBytes.byteLength
      ) as ArrayBuffer
      const blob = new Blob([editedBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name.replace(/\.pdf$/i, '') + '-edited.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (exportErr) {
      console.error('Export failed:', exportErr)
      showErrorToast('Could not export edited PDF.')
    } finally {
      setIsExporting(false)
    }
  }

  const selectPdfPage = (pageNumber: number) => {
    setCurrentPage(pageNumber)
    setSelectedAnnotationId(null)
    if (isAddTextMode) {
      setIsAddTextMode(false)
    }
  }

  const pageItems: PageRailItem[] = pageOrder.map((originalIndex, index) => ({
    id: String(index + 1),
    label: `Page ${index + 1}`,
    fileType: 'pdf',
    pageType: pageOrientation,
    // Use positional index — pageThumbnails is built sequentially from pageOrder
    thumbnail: originalIndex === -1 ? null : (pageThumbnails[index] ?? null),
    onClick: () => selectPdfPage(index + 1),
    onDelete: !viewOnly ? () => {
      const newOrder = pageOrder.filter((_, i) => i !== index)
      updatePageOrder(newOrder)

      // Immediately rebuild thumbnails for the remaining pages
      setPageThumbnails((prev) => prev.filter((_, i) => i !== index))

      // Always validate and update currentPage to ensure valid state
      if (newOrder.length === 0) {
        setCurrentPage(1)
      } else if (currentPage > newOrder.length) {
        setCurrentPage(newOrder.length)
      } else if (currentPage === index + 1) {
        // If we deleted the current page, show the next page or go back
        setCurrentPage(Math.min(index + 1, newOrder.length))
      }
    } : undefined,
  }))

  const selectedAnnotation = selectedAnnotationId
    ? annotations.find((a) => a.id === selectedAnnotationId)
    : null

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const newOrder = [...pageOrder]
    const removedPages = newOrder.splice(fromIndex, 1)
    newOrder.splice(toIndex, 0, removedPages[0])
    updatePageOrder(newOrder)

    // Update current page if needed
    if (currentPage === fromIndex + 1) {
      setCurrentPage(toIndex + 1)
    } else if (currentPage > fromIndex && currentPage <= toIndex) {
      setCurrentPage(currentPage - 1)
    } else if (currentPage >= toIndex && currentPage < fromIndex) {
      setCurrentPage(currentPage + 1)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading PDF...</p>
          <p className="text-xs text-gray-500 mt-2">This may take a moment</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md p-6">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-600" />
          <p className="text-gray-800 font-semibold mb-2">Unable to Load PDF</p>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <p className="text-xs text-gray-500">Try uploading a different PDF file</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-gray-100 flex overflow-hidden">
      <div className="flex-1 min-w-0 overflow-auto p-0 sm:p-1 md:p-2 relative">
        {/* Mode Toggle */}
        <div className="absolute top-4 right-6 z-20">
          <button
            onClick={() => toggleViewMode()}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all border ${viewOnly
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
          >
            {viewOnly ? 'View mode' : 'Edit mode'}
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-none flex-col gap-2">
          <div className="rounded-lg border border-gray-200 bg-white px-2 py-2 sm:px-4 sm:py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setIsAddTextMode((v) => !v)}
                className={`flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${isAddTextMode
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                title="Add text annotation"
              >
                <Type size={16} />
                {isAddTextMode ? 'Click on page...' : 'Add Text'}
              </button>
              <button
                onClick={handleExportEditedPdf}
                disabled={isExporting}
                className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                title="Download edited PDF"
              >
                <Download size={16} />
                {isExporting ? 'Exporting...' : 'Download Edited PDF'}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-0 sm:p-1 shadow-md">
            <div ref={canvasContainerRef} className="relative mx-auto w-fit overflow-auto" style={{ maxHeight: 'calc(100vh - 170px)', transition: 'all 250ms ease' }}>
              <div>
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className={`rounded border border-gray-100 h-auto ${isAddTextMode || activeTool === 'text'
                      ? 'cursor-crosshair'
                      : activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image'
                        ? 'cursor-crosshair'
                        : 'cursor-default'
                    }`}
                  style={{
                    maxWidth: 'none',
                    width: 'auto',
                    height: 'auto',
                    maxHeight: 'none',
                    display: 'block',
                    margin: '0 auto',
                  }}
                />
              </div>

              {pageAnnotations.map((annotation) => (
                <textarea
                  key={annotation.id}
                  value={annotation.text}
                  onChange={(e) => updateAnnotation(annotation.id, { text: e.target.value })}
                  onFocus={() => setSelectedAnnotationId(annotation.id)}
                  rows={Math.max(1, annotation.text.split(/\r?\n/).length)}
                  className={`absolute min-w-[120px] resize both rounded border bg-white/80 px-1 py-0.5 text-sm leading-tight outline-none ${selectedAnnotationId === annotation.id ? 'border-red-500' : 'border-gray-300'
                    }`}
                  style={{
                    left: `${annotation.xRatio * 100}%`,
                    top: `${annotation.yRatio * 100}%`,
                    fontSize: `${annotation.fontSize}px`,
                    fontFamily: annotation.fontFamily,
                    color: annotation.color,
                    transform: 'translateY(-100%)',
                    lineHeight: 1.25,
                  }}
                />
              ))}
            </div>

            {selectedAnnotationId && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded border bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-700">Selected Annotation</span>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Font
                  <select
                    value={selectedAnnotation?.fontFamily || 'Helvetica'}
                    onChange={(e) => updateAnnotation(selectedAnnotationId, { fontFamily: e.target.value })}
                    className="w-36 rounded border px-2 py-1"
                  >
                    {EDITOR_FONT_FAMILIES.map((font) => (
                      <option key={font} value={font} style={{ fontFamily: font }}>
                        {font}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Size
                  <select
                    value={selectedAnnotation?.fontSize || 14}
                    onChange={(e) =>
                      updateAnnotation(selectedAnnotationId, {
                        fontSize: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-20 rounded border px-2 py-1"
                  >
                    {EDITOR_FONT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Color
                  <input
                    type="color"
                    value={selectedAnnotation?.color || '#d11a2a'}
                    onChange={(e) => updateAnnotation(selectedAnnotationId, { color: e.target.value })}
                    className="h-8 w-10 rounded border p-0"
                  />
                </label>
                <div className="flex flex-wrap gap-1">
                  {EDITOR_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateAnnotation(selectedAnnotationId, { color })}
                      className="h-6 w-6 rounded border border-gray-300 shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={color}
                    />
                  ))}
                </div>
                <button
                  onClick={() => removeAnnotation(selectedAnnotationId)}
                  className="ml-auto flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            )}
          </div>
       <EditorNavigation
  current={currentPage}
  total={pageOrder.length}
  onPrevious={() => setCurrentPage(Math.max(1, currentPage - 1))}
  onNext={() => setCurrentPage(Math.min(pageOrder.length, currentPage + 1))}
  className="sticky bottom-0 z-20 border-t border-gray-200 bg-gray-100/95 backdrop-blur"
  themeColor="#dc2626"  // ✅ Add this line
/>
        </div>
      </div>

      <PageRail
        title="SCREENS"
        items={pageItems}
        activeId={String(currentPage)}
        accentColor="#dc2626"
        side="right"
        onAddStep={!viewOnly ? () => {
          addPage()
          setCurrentPage(pageOrder.length + 1)
        } : undefined}
        onReorder={!viewOnly ? handleReorder : undefined}
      />
    </div>
  )
}
