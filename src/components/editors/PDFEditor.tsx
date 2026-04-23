import { useEffect, useMemo, useState, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { ChevronLeft, ChevronRight, AlertCircle, Type, Download, Trash2 } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import PageRail, { type PageRailItem } from '../PageRail.tsx'

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
  color: string
}

// Use local bundled worker to avoid CDN/network failures.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString()

export default function PDFEditor({ file }: PDFEditorProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [totalPages, setTotalPages] = useState(0)
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

  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const zoom = useDocumentStore((state) => state.zoom)
  const activeTool = useDocumentStore((state) => state.activeTool)

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
        setTotalPages(doc.numPages)
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
          setTotalPages(doc.numPages)
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

  useEffect(() => {
    const buildThumbnails = async () => {
      if (!pdfDoc || totalPages === 0) return

      try {
        const thumbs: string[] = []
        for (let index = 1; index <= totalPages; index += 1) {
          const page = await pdfDoc.getPage(index)
          const viewport = page.getViewport({ scale: 0.18 })
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
  }, [pdfDoc, totalPages])

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return

      try {
        const page = await pdfDoc.getPage(Math.min(currentPage, pdfDoc.numPages))
        const scale = (zoom / 100) * 1.5
        const viewport = page.getViewport({ scale })

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
  }, [pdfDoc, currentPage, zoom])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isAddTextMode || !canvasRef.current) return

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
      fontSize: 14,
      color: '#d11a2a',
    }

    setAnnotations((prev) => [...prev, newAnnotation])
    setSelectedAnnotationId(newAnnotation.id)
    setIsAddTextMode(false)
  }

  const updateAnnotation = (id: string, patch: Partial<PdfAnnotation>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

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

  const handleExportEditedPdf = async () => {
    try {
      setIsExporting(true)
      if (!pdfSourceBuffer || pdfSourceBuffer.byteLength === 0) {
        throw new Error('No PDF source data available. Please re-upload the PDF.')
      }

      const pdfBytes = pdfSourceBuffer.slice(0)
      const doc = await PDFDocument.load(pdfBytes)
      const font = await doc.embedFont(StandardFonts.Helvetica)

      annotations.forEach((annotation) => {
        if (!annotation.text.trim()) return
        const page = doc.getPage(annotation.page - 1)
        if (!page) return

        const width = page.getWidth()
        const height = page.getHeight()
        const x = annotation.xRatio * width
        const y = height - annotation.yRatio * height - annotation.fontSize
        const color = hexToRgb(annotation.color)

        page.drawText(annotation.text, {
          x,
          y,
          size: annotation.fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        })
      })

      const editedBytes = await doc.save()
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
      alert('Could not export edited PDF.')
    } finally {
      setIsExporting(false)
    }
  }

  const pageItems: PageRailItem[] = Array.from({ length: totalPages }, (_, index) => ({
    id: String(index + 1),
    label: `Page ${index + 1}`,
    thumbnail: pageThumbnails[index] ?? null,
    onClick: () => setCurrentPage(index + 1),
  }))

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
      <PageRail
        title="PAGES"
        items={pageItems}
        activeId={String(currentPage)}
        accentColor="#dc2626"
      />

      <div className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="rounded p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Previous page"
            >
              <ChevronLeft size={20} className="text-gray-700" />
            </button>
            <span className="min-w-fit rounded border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="rounded p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Next page"
            >
              <ChevronRight size={20} className="text-gray-700" />
            </button>
            <button
              onClick={() => setIsAddTextMode((v) => !v)}
              className={`ml-4 flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
                isAddTextMode
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

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-md">
            <div ref={canvasContainerRef} className="relative mx-auto w-fit">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className={`max-w-full rounded border border-gray-100 h-auto ${
                  isAddTextMode || activeTool === 'text'
                    ? 'cursor-crosshair'
                    : activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image'
                    ? 'cursor-crosshair'
                    : 'cursor-default'
                }`}
                style={{
                  maxHeight: 'calc(100vh - 300px)',
                }}
              />

              {pageAnnotations.map((annotation) => (
                <input
                  key={annotation.id}
                  type="text"
                  value={annotation.text}
                  onChange={(e) => updateAnnotation(annotation.id, { text: e.target.value })}
                  onFocus={() => setSelectedAnnotationId(annotation.id)}
                  className={`absolute min-w-[90px] rounded border bg-white/80 px-1 py-0.5 text-sm ${
                    selectedAnnotationId === annotation.id ? 'border-red-500' : 'border-gray-300'
                  }`}
                  style={{
                    left: `${annotation.xRatio * 100}%`,
                    top: `${annotation.yRatio * 100}%`,
                    fontSize: `${annotation.fontSize}px`,
                    color: annotation.color,
                    transform: 'translateY(-100%)',
                  }}
                />
              ))}
            </div>

            {selectedAnnotationId && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded border bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-700">Selected Annotation</span>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Size
                  <input
                    type="number"
                    min={8}
                    max={72}
                    value={annotations.find((a) => a.id === selectedAnnotationId)?.fontSize || 14}
                    onChange={(e) =>
                      updateAnnotation(selectedAnnotationId, {
                        fontSize: Math.max(8, Math.min(72, parseInt(e.target.value || '14'))),
                      })
                    }
                    className="w-16 rounded border px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Color
                  <input
                    type="color"
                    value={annotations.find((a) => a.id === selectedAnnotationId)?.color || '#d11a2a'}
                    onChange={(e) => updateAnnotation(selectedAnnotationId, { color: e.target.value })}
                    className="h-8 w-10 rounded border p-0"
                  />
                </label>
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
        </div>
      </div>
    </div>
  )
}
