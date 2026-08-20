import { useEffect, useMemo, useState, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { AlertCircle, Type, Download, Trash2, AlignLeft, AlignCenter, AlignRight, LayoutTemplate } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { showErrorToast } from '../../utils/toast'
import PageRail, { type PageRailItem } from '../PageRail.tsx'
import EditorNavigation from '../EditorNavigation'
import { EDITOR_COLOR_PALETTE, EDITOR_FONT_FAMILIES, EDITOR_FONT_SIZES } from '../../editorOptions'
import { getShapeSvg, type ShapeKind } from '../../shapes'

interface PdfAnnotation {
  id: string
  page: number
  kind: 'text' | 'shape'
  xRatio: number
  yRatio: number
  widthRatio?: number
  heightRatio?: number
  shape?: ShapeKind
  fillColor?: string
  text: string
  fontSize: number
  fontFamily: string
  color: string
}

type PdfListCommandDetail = {
  kind: 'bullet' | 'number' | 'multilevel'
  style?: string
}

type LetterCaseMode = 'upper' | 'lower'

const PDF_BULLET_MARKERS: Record<string, string> = {
  disc: '\u2022',
  circle: 'o',
  square: '-',
  arrow: '>',
  check: 'v',
  diamond: '-',
  plus: '+',
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const LIST_PREFIX_PATTERN = /^\s*(?:(?:[\u2022o>\-+v]\s+)|(?:\d+[.)]\s+)|(?:[A-Z][.)]\s+)|(?:[IVXLCDM]+[.)]\s+))/i

const stripListPrefix = (line: string) => line.replace(LIST_PREFIX_PATTERN, '')

const getPdfListPrefix = (detail: PdfListCommandDetail, index: number) => {
  if (detail.kind === 'bullet') {
    return `${PDF_BULLET_MARKERS[detail.style || 'disc'] || PDF_BULLET_MARKERS.disc} `
  }

  if (detail.kind === 'multilevel' && detail.style === 'heading') {
    return `${String.fromCharCode(65 + (index % 26))}. `
  }

  if (detail.kind === 'multilevel' && detail.style === 'legal') {
    return `${ROMAN_NUMERALS[index] || index + 1}. `
  }

  return `${index + 1}. `
}

const applyListToPlainText = (text: string, detail: PdfListCommandDetail) => {
  const lines = text.split(/\r?\n/)

  if (detail.kind === 'bullet' && detail.style === 'none') {
    return lines.map(stripListPrefix).join('\n')
  }

  return lines
    .map((line, index) => {
      if (!line.trim()) return line
      return `${getPdfListPrefix(detail, index)}${stripListPrefix(line)}`
    })
    .join('\n')
}

// Use local bundled worker to avoid CDN/network failures.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString()

interface HeaderFooterConfig {
  enabled: boolean
  text: string
  align: 'left' | 'center' | 'right'
  fontSize: number
  color: string
  applyToAll: boolean
}

const DEFAULT_HEADER: HeaderFooterConfig = { enabled: false, text: '', align: 'center', fontSize: 10, color: '#555555', applyToAll: true }
const DEFAULT_FOOTER: HeaderFooterConfig = { enabled: false, text: '', align: 'center', fontSize: 10, color: '#555555', applyToAll: true }

interface PDFEditorProps {
  file: DocumentFile
}

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
  const [viewerWidth, setViewerWidth] = useState(900)
  const [pageContentSize, setPageContentSize] = useState({ width: 0, height: 0 })
  const [pageCanvasSize, setPageCanvasSize] = useState({ width: 0, height: 0 })
  const [showHeaderFooterPanel, setShowHeaderFooterPanel] = useState(false)
  const [header, setHeader] = useState<HeaderFooterConfig>(DEFAULT_HEADER)
  const [footer, setFooter] = useState<HeaderFooterConfig>(DEFAULT_FOOTER)
  const viewerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<any>(null)
  const lastToolbarFormatRef = useRef({ textColor: '', textFontFamily: '', textFontSize: 0 })

  const currentFile = useDocumentStore((state) => state.currentFile)
  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const zoom = useDocumentStore((state) => state.zoom)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const selectedShape = useDocumentStore((state) => state.selectedShape)
  const textColor = useDocumentStore((state) => state.textColor)
  const shapeFillColor = useDocumentStore((state) => state.shapeFillColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
  const addPage = useDocumentStore((state) => state.addPage)
  const updatePageOrder = useDocumentStore((state) => state.updatePageOrder)
  const toggleViewMode = useDocumentStore((state) => state.toggleViewMode)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const pageNumberConfig = useDocumentStore((state) => state.pageNumberConfig)

  const pageOrder = currentFile?.pageOrder || []
  const viewOnly = currentFile?.viewOnly || false

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.page === currentPage),
    [annotations, currentPage]
  )
  const rightPageGutter = Math.round(Math.min(120, Math.max(64, viewerWidth * 0.07)))
  const availablePageWidth = Math.max(320, viewerWidth - rightPageGutter - 56)

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const updateViewerWidth = () => {
      setViewerWidth(Math.max(320, viewer.clientWidth))
    }

    updateViewerWidth()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateViewerWidth) : null
    observer?.observe(viewer)
    window.addEventListener('resize', updateViewerWidth)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateViewerWidth)
    }
  }, [error, isLoading])

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
    let isDisposed = false

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
            const zoomScale = Math.max(0.25, zoom / 100)
            const isLandscapeBlank = pageOrientation === 'landscape'
            const baseWidth = isLandscapeBlank ? 900 : 600
            const baseHeight = isLandscapeBlank ? 600 : 800
            const fitScale = Math.min(2.25, Math.max(0.45, availablePageWidth / baseWidth))
            const displayWidth = Math.floor(baseWidth * fitScale * zoomScale)
            const displayHeight = Math.floor(baseHeight * fitScale * zoomScale)
            const displayCanvasWidth = displayWidth + rightPageGutter
            const pixelRatio = window.devicePixelRatio || 1

            canvas.width = Math.max(1, Math.floor(displayCanvasWidth * pixelRatio))
            canvas.height = Math.max(1, Math.floor(displayHeight * pixelRatio))
            canvas.style.width = `${displayCanvasWidth}px`
            canvas.style.height = `${displayHeight}px`
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.fillStyle = '#94a3b8'
            context.font = `${Math.max(12, 24 * fitScale * zoomScale * pixelRatio)}px Arial`
            context.textAlign = 'center'
            context.fillText('Blank Page', (displayWidth * pixelRatio) / 2, canvas.height / 2)
            setPageContentSize({ width: displayWidth, height: displayHeight })
            setPageCanvasSize({ width: displayCanvasWidth, height: displayHeight })
          }
          return
        }

        const page = await pdfDoc.getPage(actualPageIndex + 1)
        if (isDisposed) return

        const rotation = await getPdfRotation(page)
        if (isDisposed) return

        const baseViewport = page.getViewport({ scale: 1, rotation })
        const fitScale = Math.min(2.25, Math.max(0.45, availablePageWidth / baseViewport.width))
        const displayScale = fitScale * Math.max(0.25, zoom / 100)
        const pixelRatio = window.devicePixelRatio || 1
        const viewport = page.getViewport({ scale: displayScale * pixelRatio, rotation })
        const contentDisplayWidth = Math.floor(viewport.width / pixelRatio)
        const contentDisplayHeight = Math.floor(viewport.height / pixelRatio)
        const canvasDisplayWidth = contentDisplayWidth + rightPageGutter

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return

        const previousRenderTask = renderTaskRef.current
        if (previousRenderTask) {
          previousRenderTask.cancel?.()
          await previousRenderTask.promise.catch(() => undefined)
          if (isDisposed) return
        }

        canvas.width = Math.max(1, Math.floor(canvasDisplayWidth * pixelRatio))
        canvas.height = viewport.height
        canvas.style.width = `${canvasDisplayWidth}px`
        canvas.style.height = `${contentDisplayHeight}px`
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        })
        renderTaskRef.current = renderTask
        await renderTask.promise

        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null
        }
        setPageContentSize({ width: contentDisplayWidth, height: contentDisplayHeight })
        setPageCanvasSize({ width: canvasDisplayWidth, height: contentDisplayHeight })
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('Error rendering PDF page:', err)
        }
      }
    }

    renderPage()
    return () => {
      isDisposed = true
      renderTaskRef.current?.cancel?.()
      renderTaskRef.current = null
    }
  }, [
    pdfDoc,
    currentPage,
    zoom,
    pageOrder,
    pageOrientation,
    availablePageWidth,
    rightPageGutter,
    viewerWidth,
    setCurrentPage,
  ])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if ((!isAddTextMode && activeTool !== 'text' && activeTool !== 'shape') || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const contentWidth = pageContentSize.width || rect.width
    const contentHeight = pageContentSize.height || rect.height
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < 0 || y < 0 || x > contentWidth || y > contentHeight) return

    const xRatio = Math.min(Math.max(x / contentWidth, 0), 1)
    const yRatio = Math.min(Math.max(y / contentHeight, 0), 1)

    const annotationKind = activeTool === 'shape' ? 'shape' : 'text'
    const newAnnotation: PdfAnnotation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      page: currentPage,
      kind: annotationKind,
      xRatio,
      yRatio,
      widthRatio: annotationKind === 'shape' ? Math.min(160 / contentWidth, 0.28) : undefined,
      heightRatio: annotationKind === 'shape' ? Math.min(96 / contentHeight, 0.18) : undefined,
      shape: annotationKind === 'shape' ? selectedShape : undefined,
      fillColor: annotationKind === 'shape' ? shapeFillColor : undefined,
      text: annotationKind === 'shape' ? '' : 'Edit me',
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

  useEffect(() => {
    const handleShapeFillChange = (event: Event) => {
      const fillColor = (event as CustomEvent<{ color?: string }>).detail?.color
      if (!fillColor || !selectedAnnotationId) return

      setAnnotations((previous) =>
        previous.map((annotation) =>
          annotation.id === selectedAnnotationId && annotation.kind === 'shape'
            ? { ...annotation, fillColor }
            : annotation
        )
      )
    }

    window.addEventListener('editor-shape-fill-change', handleShapeFillChange)
    return () => window.removeEventListener('editor-shape-fill-change', handleShapeFillChange)
  }, [selectedAnnotationId])

  useEffect(() => {
    const handleListCommand = (event: Event) => {
      const detail = (event as CustomEvent<PdfListCommandDetail>).detail
      if (!detail) return

      const activeTextarea =
        document.activeElement instanceof HTMLTextAreaElement
          ? document.activeElement
          : null
      const targetId = activeTextarea?.dataset.pdfAnnotationId || selectedAnnotationId
      if (!targetId) {
        showErrorToast('Select a PDF text annotation before applying bullets or numbering.')
        return
      }

      const selectionStart = activeTextarea?.dataset.pdfAnnotationId === targetId
        ? activeTextarea.selectionStart
        : null
      const selectionEnd = activeTextarea?.dataset.pdfAnnotationId === targetId
        ? activeTextarea.selectionEnd
        : null

      setAnnotations((previous) =>
        previous.map((annotation) => {
          if (annotation.id !== targetId) return annotation

          const hasSelection =
            selectionStart !== null &&
            selectionEnd !== null &&
            selectionStart !== selectionEnd

          if (!hasSelection) {
            return {
              ...annotation,
              text: applyListToPlainText(annotation.text, detail),
            }
          }

          const start = selectionStart ?? 0
          const end = selectionEnd ?? start
          const before = annotation.text.slice(0, start)
          const selected = annotation.text.slice(start, end)
          const after = annotation.text.slice(end)

          return {
            ...annotation,
            text: `${before}${applyListToPlainText(selected, detail)}${after}`,
          }
        })
      )
      setSelectedAnnotationId(targetId)
    }

    window.addEventListener('pdf-editor-list-command', handleListCommand)
    return () => window.removeEventListener('pdf-editor-list-command', handleListCommand)
  }, [selectedAnnotationId])

  useEffect(() => {
    const transformText = (text: string, mode: LetterCaseMode) =>
      mode === 'upper' ? text.toLocaleUpperCase() : text.toLocaleLowerCase()

    const handleChangeCase = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: LetterCaseMode }>).detail?.mode
      if (!mode) return

      const activeTextarea =
        document.activeElement instanceof HTMLTextAreaElement
          ? document.activeElement
          : null
      const targetId = activeTextarea?.dataset.pdfAnnotationId || selectedAnnotationId
      if (!targetId) return

      const selectionStart = activeTextarea?.dataset.pdfAnnotationId === targetId
        ? activeTextarea.selectionStart
        : null
      const selectionEnd = activeTextarea?.dataset.pdfAnnotationId === targetId
        ? activeTextarea.selectionEnd
        : null

      setAnnotations((previous) =>
        previous.map((annotation) => {
          if (annotation.id !== targetId || annotation.kind === 'shape') return annotation

          const hasSelection =
            selectionStart !== null &&
            selectionEnd !== null &&
            selectionStart !== selectionEnd

          if (!hasSelection) {
            return { ...annotation, text: transformText(annotation.text, mode) }
          }

          const start = selectionStart ?? 0
          const end = selectionEnd ?? start
          return {
            ...annotation,
            text: `${annotation.text.slice(0, start)}${transformText(annotation.text.slice(start, end), mode)}${annotation.text.slice(end)}`,
          }
        })
      )
      setSelectedAnnotationId(targetId)
    }

    window.addEventListener('editor-change-case', handleChangeCase)
    return () => window.removeEventListener('editor-change-case', handleChangeCase)
  }, [selectedAnnotationId])

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

  const getPdfFillColor = (color: string | undefined) => {
    if (!color || color === 'transparent') return undefined
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
    if (rgbMatch) {
      return rgb(
        Number(rgbMatch[1]) / 255,
        Number(rgbMatch[2]) / 255,
        Number(rgbMatch[3]) / 255
      )
    }

    const parsed = hexToRgb(color)
    return rgb(parsed.r, parsed.g, parsed.b)
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

  const drawPdfShape = (page: any, annotation: PdfAnnotation) => {
    const { width, height } = page.getSize()
    const color = hexToRgb(annotation.color)
    const strokeColor = rgb(color.r, color.g, color.b)
    const x = annotation.xRatio * width
    const topY = height - annotation.yRatio * height
    const shapeWidth = (annotation.widthRatio || 0.22) * width
    const shapeHeight = (annotation.heightRatio || 0.12) * height
    const y = topY - shapeHeight
    const shape = annotation.shape || 'rectangle'
    const drawLine = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 2, color: strokeColor })
    const drawArrowHead = (tipX: number, tipY: number, fromX: number, fromY: number) => {
      const angle = Math.atan2(tipY - fromY, tipX - fromX)
      const size = 10
      drawLine(tipX, tipY, tipX - size * Math.cos(angle - Math.PI / 6), tipY - size * Math.sin(angle - Math.PI / 6))
      drawLine(tipX, tipY, tipX - size * Math.cos(angle + Math.PI / 6), tipY - size * Math.sin(angle + Math.PI / 6))
    }

    if (shape === 'line' || shape === 'arrow' || shape === 'double-arrow') {
      drawLine(x, y, x + shapeWidth, y + shapeHeight)
      if (shape === 'arrow' || shape === 'double-arrow') drawArrowHead(x + shapeWidth, y + shapeHeight, x, y)
      if (shape === 'double-arrow') drawArrowHead(x, y, x + shapeWidth, y + shapeHeight)
      return
    }

    if (shape === 'oval') {
      page.drawEllipse({
        x: x + shapeWidth / 2,
        y: y + shapeHeight / 2,
        xScale: shapeWidth / 2,
        yScale: shapeHeight / 2,
        borderColor: strokeColor,
        borderWidth: 2,
        color: getPdfFillColor(annotation.fillColor) || rgb(0.93, 0.96, 1),
      })
      return
    }

    if (shape === 'triangle') {
      drawLine(x + shapeWidth / 2, y + shapeHeight, x + shapeWidth, y)
      drawLine(x + shapeWidth, y, x, y)
      drawLine(x, y, x + shapeWidth / 2, y + shapeHeight)
      return
    }

    if (shape === 'elbow' || shape === 'elbow-arrow') {
      drawLine(x, y + shapeHeight, x, y)
      drawLine(x, y, x + shapeWidth, y)
      if (shape === 'elbow-arrow') drawArrowHead(x + shapeWidth, y, x, y)
      return
    }

    page.drawRectangle({
      x,
      y,
      width: shapeWidth,
      height: shapeHeight,
      borderColor: strokeColor,
      borderWidth: 2,
      color: getPdfFillColor(annotation.fillColor) || rgb(0.93, 0.96, 1),
    })
  }

  const resolveHeaderFooterText = (cfg: HeaderFooterConfig, pageNumber: number, totalPages: number) =>
    cfg.text
      .replace(/\{page\}/gi, String(pageNumber))
      .replace(/\{total\}/gi, String(totalPages))
      .replace(/\{date\}/gi, new Date().toLocaleDateString())

  const buildEditedPdfBytes = async () => {
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

    const hFont = await getEmbeddedFont('Helvetica')
    const totalPages = pageOrder.length

    for (let i = 0; i < pageOrder.length; i++) {
      const originalIndex = pageOrder[i]
      let page

      if (originalIndex === -1) {
        page = outDoc.addPage(pageOrientation === 'landscape' ? [842, 595] : [595, 842])
      } else {
        const [copiedPage] = await outDoc.copyPages(sourceDoc, [originalIndex])
        page = outDoc.addPage(copiedPage)
      }

      const { width, height } = page.getSize()
      const margin = 28
      const pageNumber = i + 1

      // Draw header
      if (header.enabled && header.text.trim()) {
        const text = resolveHeaderFooterText(header, pageNumber, totalPages)
        const sz = header.fontSize
        const textWidth = hFont.widthOfTextAtSize(text, sz)
        const hColor = hexToRgb(header.color)
        const x = header.align === 'center'
          ? (width - textWidth) / 2
          : header.align === 'right'
            ? width - margin - textWidth
            : margin
        page.drawText(text, { x, y: height - margin, size: sz, font: hFont, color: rgb(hColor.r, hColor.g, hColor.b) })
        // separator line
        page.drawLine({ start: { x: margin, y: height - margin - sz - 4 }, end: { x: width - margin, y: height - margin - sz - 4 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
      }

      // Draw footer
      if (footer.enabled && footer.text.trim()) {
        const text = resolveHeaderFooterText(footer, pageNumber, totalPages)
        const sz = footer.fontSize
        const textWidth = hFont.widthOfTextAtSize(text, sz)
        const fColor = hexToRgb(footer.color)
        const x = footer.align === 'center'
          ? (width - textWidth) / 2
          : footer.align === 'right'
            ? width - margin - textWidth
            : margin
        page.drawLine({ start: { x: margin, y: margin + sz + 4 }, end: { x: width - margin, y: margin + sz + 4 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
        page.drawText(text, { x, y: margin, size: sz, font: hFont, color: rgb(fColor.r, fColor.g, fColor.b) })
      }

      // Draw Page Numbers from pageNumberConfig
      if (pageNumberConfig.enabled) {
        if (!(pageNumberConfig.hideFirstPage && pageNumber === 1)) {
          const numVal = pageNumber + (pageNumberConfig.startNumber - 1)
          let numStr = String(numVal)
          if (pageNumberConfig.format === 'page_x') numStr = `Page ${numVal}`
          else if (pageNumberConfig.format === 'page_x_of_y') numStr = `Page ${numVal} / ${totalPages}`
          else if (pageNumberConfig.format === 'dash') numStr = `- ${numVal} -`
          else if (pageNumberConfig.format === 'roman') {
            const r = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
            numStr = r[numVal - 1] || String(numVal)
          } else if (pageNumberConfig.format === 'alpha') {
            numStr = String.fromCharCode(65 + ((numVal - 1) % 26))
          }

          const sz = pageNumberConfig.fontSize || 10
          const textWidth = hFont.widthOfTextAtSize(numStr, sz)
          const pColor = hexToRgb(pageNumberConfig.color || '#666666')
          const isTop = pageNumberConfig.position.startsWith('top')
          const isRight = pageNumberConfig.position.endsWith('right')
          const isCenter = pageNumberConfig.position.endsWith('center')

          const x = isCenter ? (width - textWidth) / 2 : isRight ? width - margin - textWidth : margin
          const y = isTop ? height - margin : margin

          page.drawText(numStr, { x, y, size: sz, font: hFont, color: rgb(pColor.r, pColor.g, pColor.b) })
        }
      }

      // Find annotations that belong to this position in the new document
      const posInNewDoc = i + 1
      const relevantAnnotations = annotations.filter((a) => a.page === posInNewDoc)

      for (const annotation of relevantAnnotations) {
        if (annotation.kind === 'shape') {
          drawPdfShape(page, annotation)
          continue
        }
        if (!annotation.text.trim()) continue
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

    return await outDoc.save()
  }

  const handleExportEditedPdf = async () => {
    try {
      setIsExporting(true)
      const editedBytes = await buildEditedPdfBytes()
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

  // Save-to-DB integration: respond to save requests from EditorView
  useEffect(() => {
    const handleSaveRequest = async () => {
      try {
        const editedBytes = await buildEditedPdfBytes()
        // Convert Uint8Array to base64
        let binary = ''
        const chunkSize = 0x8000
        for (let i = 0; i < editedBytes.length; i += chunkSize) {
          binary += String.fromCharCode(...editedBytes.subarray(i, i + chunkSize))
        }
        const base64 = window.btoa(binary)
        
        window.dispatchEvent(new CustomEvent('editor-save-content-ready', {
          detail: {
            contentBase64: base64,
            contentType: 'application/pdf',
          },
        }))
      } catch (err) {
        console.error('PDF serialization for save failed:', err)
      }
    }

    window.addEventListener('editor-request-save-content', handleSaveRequest)
    return () => window.removeEventListener('editor-request-save-content', handleSaveRequest)
  }, [pdfSourceBuffer, pageOrder, annotations, pageOrientation])

  const pageItems: PageRailItem[] = pageOrder.map((originalIndex, index) => ({
    id: String(index + 1),
    label: `Page ${index + 1}`,
    fileType: 'pdf',
    pageType: pageOrientation,
    thumbnail: originalIndex === -1 ? null : (pageThumbnails[index] ?? null),
    onClick: () => selectPdfPage(index + 1),
    onDelete: !viewOnly ? () => {
      const prevOrder = [...pageOrder]
      const prevThumbnails = [...pageThumbnails]
      
      const newOrder = pageOrder.filter((_, i) => i !== index)
      updatePageOrder(newOrder)

      setPageThumbnails((prev) => prev.filter((_, i) => i !== index))

      const prevSafeCurrentPage = currentPage
      if (newOrder.length === 0) {
        setCurrentPage(1)
      } else if (currentPage > newOrder.length) {
        setCurrentPage(newOrder.length)
      } else if (currentPage === index + 1) {
        setCurrentPage(Math.min(index + 1, newOrder.length))
      }

      window.dispatchEvent(
        new CustomEvent('editor-history-snapshot', {
          detail: {
            label: 'Delete Page',
            applyUndo: () => {
              updatePageOrder(prevOrder)
              setPageThumbnails(prevThumbnails)
              setCurrentPage(prevSafeCurrentPage)
            },
            applyRedo: () => {}
          }
        })
      )
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
      <div ref={viewerRef} className="flex-1 min-w-0 overflow-auto p-0 sm:p-1 md:p-2 relative">
        {/* Mode Toggle */}
        <div data-print-hidden="true" className="absolute top-4 right-6 z-20">
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
          <div data-print-hidden="true" className="rounded-lg border border-gray-200 bg-white px-2 py-2 sm:px-4 sm:py-3 shadow-sm">
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
                onClick={() => setShowHeaderFooterPanel((v) => !v)}
                className={`flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
                  showHeaderFooterPanel
                    ? 'bg-indigo-600 text-white'
                    : (header.enabled || footer.enabled)
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
                title="En-tête / Pied de page"
              >
                <LayoutTemplate size={16} />
                En-tête / Pied de page
                {(header.enabled || footer.enabled) && (
                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-indigo-400 inline-block" />
                )}
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

            {/* ── Header / Footer Panel ── */}
            {showHeaderFooterPanel && (
              <div className="mt-3 border-t border-gray-200 pt-3 space-y-4">
                {/* Hint */}
                <p className="text-[11px] text-gray-400 text-center">
                  Variables : <code className="bg-gray-100 px-1 rounded">{'{page}'}</code> · <code className="bg-gray-100 px-1 rounded">{'{total}'}</code> · <code className="bg-gray-100 px-1 rounded">{'{date}'}</code>
                </p>

                {/* ── Header ── */}
                {(['header', 'footer'] as const).map((zone) => {
                  const cfg = zone === 'header' ? header : footer
                  const setCfg = (patch: Partial<HeaderFooterConfig>) =>
                    zone === 'header'
                      ? setHeader((prev) => ({ ...prev, ...patch }))
                      : setFooter((prev) => ({ ...prev, ...patch }))
                  const label = zone === 'header' ? 'En-tête' : 'Pied de page'

                  return (
                    <div key={zone} className={`rounded-lg border px-3 py-2.5 transition-colors ${
                      cfg.enabled ? 'border-indigo-300 bg-indigo-50/60' : 'border-gray-200 bg-gray-50'
                    }`}>
                      {/* Title + toggle */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">{label}</span>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <div
                            onClick={() => setCfg({ enabled: !cfg.enabled })}
                            className={`relative w-9 h-5 rounded-full transition-colors ${
                              cfg.enabled ? 'bg-indigo-500' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              cfg.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </div>
                          <span className="text-xs text-gray-500">{cfg.enabled ? 'Activé' : 'Désactivé'}</span>
                        </label>
                      </div>

                      {cfg.enabled && (
                        <div className="space-y-2">
                          {/* Text input */}
                          <input
                            type="text"
                            value={cfg.text}
                            onChange={(e) => setCfg({ text: e.target.value })}
                            placeholder={zone === 'header' ? 'Titre du document — {page} / {total}' : 'Page {page} sur {total}  |  {date}'}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                          />

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Alignment */}
                            <div className="flex rounded border border-gray-200 overflow-hidden">
                              {(['left', 'center', 'right'] as const).map((a) => (
                                <button
                                  key={a}
                                  type="button"
                                  onClick={() => setCfg({ align: a })}
                                  className={`px-2 py-1 ${
                                    cfg.align === a ? 'bg-indigo-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                                  }`}
                                  title={a === 'left' ? 'Gauche' : a === 'center' ? 'Centre' : 'Droite'}
                                >
                                  {a === 'left' && <AlignLeft size={13} />}
                                  {a === 'center' && <AlignCenter size={13} />}
                                  {a === 'right' && <AlignRight size={13} />}
                                </button>
                              ))}
                            </div>

                            {/* Font size */}
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              Taille
                              <select
                                value={cfg.fontSize}
                                onChange={(e) => setCfg({ fontSize: Number(e.target.value) })}
                                className="rounded border border-gray-200 px-1 py-0.5 text-xs"
                              >
                                {[7, 8, 9, 10, 11, 12, 14].map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </label>

                            {/* Color */}
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              Couleur
                              <input
                                type="color"
                                value={cfg.color}
                                onChange={(e) => setCfg({ color: e.target.value })}
                                className="h-6 w-8 cursor-pointer rounded border p-0"
                              />
                            </label>
                          </div>

                          {/* Live preview */}
                          <div
                            className="rounded border border-dashed border-indigo-300 bg-white px-3 py-1.5 text-[11px] text-gray-500 overflow-hidden truncate"
                            style={{
                              textAlign: cfg.align,
                              fontFamily: 'Helvetica, Arial, sans-serif',
                              fontSize: `${Math.max(9, cfg.fontSize)}px`,
                              color: cfg.color,
                            }}
                          >
                            {resolveHeaderFooterText(cfg, currentPage, pageOrder.length) || <span className="italic text-gray-300">Aperçu…</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-0 shadow-md">
            <div
              ref={canvasContainerRef}
              className="mx-auto flex w-full justify-center overflow-auto bg-white shadow-[0_10px_30px_rgba(15,23,42,0.14)]"
              style={{
                maxHeight: 'calc(100vh - 170px)',
                transition: 'width 250ms ease',
              }}
            >
              <div data-print-document="true" className="relative w-fit">
                {/* Header overlay */}
                {header.enabled && header.text.trim() && pageContentSize.width > 0 && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ top: 0, height: '32px', display: 'flex', alignItems: 'flex-start', paddingTop: '6px' }}
                  >
                    <div
                      className="w-full px-4 truncate"
                      style={{
                        textAlign: header.align,
                        fontSize: `${Math.max(8, header.fontSize)}px`,
                        color: header.color,
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        borderBottom: '1px solid rgba(0,0,0,0.12)',
                        paddingBottom: '3px',
                        background: 'rgba(255,255,255,0.85)',
                      }}
                    >
                      {resolveHeaderFooterText(header, currentPage, pageOrder.length)}
                    </div>
                  </div>
                )}
                {/* Footer overlay */}
                {footer.enabled && footer.text.trim() && pageContentSize.height > 0 && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ bottom: 0, height: '28px', display: 'flex', alignItems: 'flex-end', paddingBottom: '5px' }}
                  >
                    <div
                      className="w-full px-4 truncate"
                      style={{
                        textAlign: footer.align,
                        fontSize: `${Math.max(8, footer.fontSize)}px`,
                        color: footer.color,
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        borderTop: '1px solid rgba(0,0,0,0.12)',
                        paddingTop: '3px',
                        background: 'rgba(255,255,255,0.85)',
                      }}
                    >
                      {resolveHeaderFooterText(footer, currentPage, pageOrder.length)}
                    </div>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className={`block h-auto ${
                    isAddTextMode || activeTool === 'text'
                      ? 'cursor-crosshair'
                      : activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image'
                      ? 'cursor-crosshair'
                      : 'cursor-default'
                  }`}
                  style={{
                    maxWidth: 'none',
                    width: pageCanvasSize.width ? `${pageCanvasSize.width}px` : undefined,
                    height: pageCanvasSize.height ? `${pageCanvasSize.height}px` : undefined,
                    maxHeight: 'none',
                    display: 'block',
                  }}
                />

                {pageAnnotations.map((annotation) => {
                  if (annotation.kind === 'shape') {
                    return (
                      <button
                        key={annotation.id}
                        type="button"
                        onClick={() => setSelectedAnnotationId(annotation.id)}
                        className={`absolute resize overflow-hidden border bg-transparent ${
                          selectedAnnotationId === annotation.id ? 'border-red-500' : 'border-transparent'
                        }`}
                        style={{
                          left: `${annotation.xRatio * (pageContentSize.width || 1)}px`,
                          top: `${annotation.yRatio * (pageContentSize.height || 1)}px`,
                          width: `${(annotation.widthRatio || 0.22) * (pageContentSize.width || 1)}px`,
                          height: `${(annotation.heightRatio || 0.12) * (pageContentSize.height || 1)}px`,
                          transform: 'translateY(-100%)',
                        }}                        dangerouslySetInnerHTML={{
                          __html: getShapeSvg(annotation.shape || 'rectangle', {
                            stroke: annotation.color,
                            fill: annotation.fillColor || shapeFillColor,
                          }),
                        }}
                      />
                    )
                  }

                  return (
                    <textarea
                      key={annotation.id}
                      data-pdf-annotation-id={annotation.id}
                      value={annotation.text}
                      onChange={(e) => updateAnnotation(annotation.id, { text: e.target.value })}
                      onFocus={() => setSelectedAnnotationId(annotation.id)}
                      rows={Math.max(1, annotation.text.split(/\r?\n/).length)}
                      className={`absolute min-w-[120px] resize both rounded border bg-white/80 px-1 py-0.5 text-sm leading-tight outline-none ${
                        selectedAnnotationId === annotation.id ? 'border-red-500' : 'border-gray-300'
                      }`}
                      style={{
                        left: `${annotation.xRatio * (pageContentSize.width || 1)}px`,
                        top: `${annotation.yRatio * (pageContentSize.height || 1)}px`,
                        fontSize: `${annotation.fontSize}px`,
                        fontFamily: annotation.fontFamily,
                        color: annotation.color,
                        transform: 'translateY(-100%)',
                        lineHeight: 1.25,
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {selectedAnnotationId && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded border bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-700">Selected Annotation</span>
                {selectedAnnotation?.kind !== 'shape' && (
                  <>
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
                  </>
                )}
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
            accentColor="#dc2626"
            className="sticky bottom-0 z-20 border-t border-gray-200 bg-gray-100/95 backdrop-blur"
          />
        </div>
      </div>

      <PageRail
        title="Document Pages"
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
