import { useState, useEffect, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../store'
import { ChevronLeft } from 'lucide-react'
import { Document as DocxDocument, Packer, PageOrientation as DocxPageOrientation, Paragraph, TextRun } from 'docx'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getEditorLanguageSettings, getPageDimensions, getThemeForFileType } from '../utils'
import { getPageMargins } from '../pageLayout'
import { showSuccessToast, showErrorToast } from '../utils/toast'
import Ribbon, {
  type BulletListValue,
  type MultilevelListValue,
  type RibbonActions,
  type TextEffectValue,
} from './Ribbon'
import ImageEditorRibbon, {
  type ImageDrawingTool,
  type ImageEditorRibbonActions,
  type ShapeTextAlign,
  type ShapeTextVerticalAlign,
} from './ImageEditorRibbon'
import type { ImageEditorObjectType, ImageObjectStyle, VideoExportQuality } from './ImageEditorCanvas'
import StatusBar from './StatusBar'
import WordEditor from './editors/WordEditor'
import PowerPointEditor from './editors/PowerPointEditor'
import PDFEditor from './editors/PDFEditor'
import ExcelEditor from './editors/ExcelEditor'
import ImageEditor, { type ImageEditorHandle } from './editors/ImageEditor'
import VideoEditor from './editors/VideoEditor'
import WhiteboardEditor from './editors/WhiteboardEditor'

interface EditorViewProps {
  file: DocumentFile
}

const isCssGradient = (value: string) => value.trim().startsWith('linear-gradient(')

const getColorFallback = (value: string) =>
  value.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/)?.[0] || '#111827'

const getBaseFileName = (filename: string) => filename.replace(/\.[^/.]+$/, '') || 'document'
const TYPING_UNDO_GROUP_MS = 1800
type LetterCaseMode = 'upper' | 'lower'

interface UndoHistoryEntry {
  label: string
  steps: number
  kind: 'typing' | 'delete' | 'paste' | 'format' | 'other'
  text?: string
  root?: HTMLElement
  beforeHtml?: string
  afterHtml?: string
  startedAt: number
  updatedAt: number
}

export default function EditorView({ file }: EditorViewProps) {
  const [, setIsSaving] = useState(false)
  const [undoHistory, setUndoHistory] = useState<UndoHistoryEntry[]>([])
  const [redoHistory, setRedoHistory] = useState<UndoHistoryEntry[]>([])
  const imageEditorRef = useRef<ImageEditorHandle>(null)
  const [imageActiveTool, setImageActiveTool] = useState<ImageDrawingTool>('select')
  const [imageBrushSize, setImageBrushSize] = useState(6)
  const [imageBrushOpacity, setImageBrushOpacity] = useState(100)
  const [imageBrushColor, setImageBrushColor] = useState('#0f172a')
  const [imageBackgroundColor, setImageBackgroundColor] = useState('#ffffff')
  const [imageFillColor, setImageFillColor] = useState('#e0f2fe')
  const [imageStrokeColor, setImageStrokeColor] = useState('#0891b2')
  const [imageStrokeWidth, setImageStrokeWidth] = useState(2)
  const [imageShapeRotation, setImageShapeRotation] = useState(0)
  const [imageShapeWidth, setImageShapeWidth] = useState(120)
  const [imageShapeHeight, setImageShapeHeight] = useState(80)
  const [imageSelectedObjectId, setImageSelectedObjectId] = useState<string | undefined>(undefined)
  const [imageSelectedObjectType, setImageSelectedObjectType] = useState<ImageEditorObjectType | undefined>(undefined)
  const [imageTextFontFamily, setImageTextFontFamily] = useState('Arial')
  const [imageTextFontSize, setImageTextFontSize] = useState(24)
  const [imageTextBold, setImageTextBold] = useState(false)
  const [imageTextItalic, setImageTextItalic] = useState(false)
  const [imageTextColor, setImageTextColor] = useState('#0f172a')
  const [imageTextRotation, setImageTextRotation] = useState(0)
  const [imageShapeText, setImageShapeText] = useState('')
  const [imageShapeTextAlign, setImageShapeTextAlign] = useState<ShapeTextAlign>('center')
  const [imageShapeTextVerticalAlign, setImageShapeTextVerticalAlign] = useState<ShapeTextVerticalAlign>('middle')
  const [imageBorderRadius, setImageBorderRadius] = useState(12)
  const [imageBorderWidth, setImageBorderWidth] = useState(0)
  const [imageBorderColor, setImageBorderColor] = useState('#ffffff')
  const [imageObjectOpacity, setImageObjectOpacity] = useState(100)
  const [imageElementStartTime, setImageElementStartTime] = useState(0)
  const [imageElementEndTime, setImageElementEndTime] = useState(0)
  const [mediaCurrentTime, setMediaCurrentTime] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [videoExportQuality, setVideoExportQuality] = useState<VideoExportQuality>('fullHd')
  const [convertingToVideo, setConvertingToVideo] = useState(false)
  const [, setMediaPlaying] = useState(false)
  const [imageCanUndo, setImageCanUndo] = useState(false)
  const [imageCanRedo, setImageCanRedo] = useState(false)
  const suppressHistoryRef = useRef(false)
  const beforeInputSnapshotRef = useRef<{
    root: HTMLElement
    html: string
  } | null>(null)
  const editableHtmlSnapshotsRef = useRef<WeakMap<HTMLElement, string>>(new WeakMap())

  const clearCurrentFile = useDocumentStore((state) => state.clearCurrentFile)
  const setCurrentFile = useDocumentStore((state) => state.setCurrentFile)
  const editorHtml = useDocumentStore((state) => state.editorHtml)
  const zoom = useDocumentStore((state) => state.zoom)
  const setZoom = useDocumentStore((state) => state.setZoom)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const setSelectedShape = useDocumentStore((state) => state.setSelectedShape)
  const setTextColor = useDocumentStore((state) => state.setTextColor)
  const setTextFontFamily = useDocumentStore((state) => state.setTextFontFamily)
  const setTextFontSize = useDocumentStore((state) => state.setTextFontSize)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const pageMarginPreset = useDocumentStore((state) => state.pageMarginPreset)
  const pageSize = useDocumentStore((state) => state.pageSize)
  const pageColumns = useDocumentStore((state) => state.pageColumns)
  const displayType = (file.originalType || file.type) as DocumentFile['type']
  const themeColor = getThemeForFileType(displayType)
  const lastEditableRootRef = useRef<HTMLElement | null>(null)
  const lastEditableRangeRef = useRef<Range | null>(null)

  const handleBack = () => {
    showSuccessToast('File closed', displayType)
    clearCurrentFile()
  }

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    setIsSaving(false)
    showSuccessToast(`${file.name} saved successfully!`, file.type)
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const getDocumentMimeType = () => {
    if (file.type === 'image') return getImageMimeType(file.name)
    if (file.type === 'video') return getVideoMimeType(file.name)

    const mimeTypes: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
    }

    return file.type ? mimeTypes[file.type] || 'application/octet-stream' : 'application/octet-stream'
  }

  const getCopyFileName = () => {
    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
    return `${getBaseFileName(file.name)}-copy${extension}`
  }

  const getTextLinesFromHtml = (html: string) => {
    const container = document.createElement('div')
    container.innerHTML = html

    container.querySelectorAll('script, style').forEach((node) => node.remove())
    container.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
    container.querySelectorAll('td, th').forEach((node) => node.appendChild(document.createTextNode('\t')))
    container
      .querySelectorAll('p, div, section, article, table, tr, h1, h2, h3, h4, h5, h6, li')
      .forEach((node) => node.appendChild(document.createTextNode('\n')))

    return (container.textContent || '')
      .replace(/\u00a0/g, ' ')
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }

  const pxToTwips = (value: number) => Math.round(value * 15)
  const pxToPoints = (value: number) => value * 0.75

  const buildDocxFromEditorHtml = async () => {
    const lines = getTextLinesFromHtml(editorHtml)
    const pageDimensions = getPageDimensions(file.type, pageOrientation, pageSize)
    const pageMargins = getPageMargins(pageMarginPreset)
    const children = lines.length > 0
      ? lines.map((line) =>
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 22,
              }),
            ],
          })
        )
      : [new Paragraph({ children: [new TextRun({ text: file.name })] })]

    const document = new DocxDocument({
      sections: [
        {
          properties: {
            page: {
              size: {
                orientation:
                  pageOrientation === 'landscape'
                    ? DocxPageOrientation.LANDSCAPE
                    : DocxPageOrientation.PORTRAIT,
                width: pxToTwips(pageDimensions.width),
                height: pxToTwips(pageDimensions.height),
              },
              margin: {
                top: pxToTwips(pageMargins.top),
                right: pxToTwips(pageMargins.right),
                bottom: pxToTwips(pageMargins.bottom),
                left: pxToTwips(pageMargins.left),
              },
            },
            column: {
              count: pageColumns,
              equalWidth: true,
              space: 720,
            },
          },
          children,
        },
      ],
    })

    const blob = await Packer.toBlob(document)
    return new Blob([blob], { type: getDocumentMimeType() })
  }

  const handleSaveAs = async () => {
    try {
      if (file.type === 'docx' && editorHtml.trim()) {
        const blob = await buildDocxFromEditorHtml()
        downloadBlob(blob, `${getBaseFileName(file.name)}-edited.docx`)
        showSuccessToast(`${file.name} saved as DOCX file`, file.type)
        return
      }

      const blob = new Blob([file.content.slice(0)], { type: getDocumentMimeType() })
      downloadBlob(blob, getCopyFileName())
      showSuccessToast(`${file.name} saved as copy`, file.type)
    } catch (err) {
      console.error('Save as failed:', err)
      showErrorToast('Could not save the file.')
    }
  }

  const handleExport = async () => {
    if (file.workflow === 'pdf-to-word' && file.type === 'docx') {
      try {
        const doc = await PDFDocument.create()
        const font = await doc.embedFont(StandardFonts.Helvetica)
        const pageDimensions = getPageDimensions(file.type, pageOrientation, pageSize)
        const pageMargins = getPageMargins(pageMarginPreset)
        const pdfPageWidth = pxToPoints(pageDimensions.width)
        const pdfPageHeight = pxToPoints(pageDimensions.height)
        let currentPdfPage = doc.addPage([pdfPageWidth, pdfPageHeight])
        const margins = {
          top: pxToPoints(pageMargins.top),
          right: pxToPoints(pageMargins.right),
          bottom: pxToPoints(pageMargins.bottom),
          left: pxToPoints(pageMargins.left),
        }
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

        let y = currentPdfPage.getHeight() - margins.top
        const maxWidth = currentPdfPage.getWidth() - margins.left - margins.right

        const lines = plainText.split(/\r?\n/)
        for (const rawLine of lines) {
          let line = rawLine || ' '
          while (line.length > 0) {
            let fit = line
            while (font.widthOfTextAtSize(fit, fontSize) > maxWidth && fit.length > 1) {
              fit = fit.slice(0, -1)
            }

            if (y < margins.bottom) {
              currentPdfPage = doc.addPage([pdfPageWidth, pdfPageHeight])
              y = currentPdfPage.getHeight() - margins.top
            }

            currentPdfPage.drawText(fit, { x: margins.left, y, size: fontSize, font })
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

    // Handle image/video export
    if (file.type === 'image' || file.type === 'video') {
      try {
        const blob = new Blob([file.content], { type: file.type === 'video' ? getVideoMimeType(file.name) : getImageMimeType(file.name) })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
        showSuccessToast(`${file.name} exported successfully!`, file.type)
      } catch (err) {
        console.error('Export failed:', err)
        showErrorToast(`Could not export ${file.type}.`)
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

  const getVideoMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogv: 'video/ogg',
      mov: 'video/quicktime',
      m4v: 'video/x-m4v',
    }
    return mimeTypes[ext || ''] || 'video/mp4'
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
    if (file.type === 'video') {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        const videoUrl = URL.createObjectURL(new Blob([file.content], { type: getVideoMimeType(file.name) }))
        printWindow.document.write(`
          <html>
            <head>
              <title>${file.name}</title>
              <style>
                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background:#000; }
                video { max-width: 100%; max-height: 100vh; object-fit: contain; }
              </style>
            </head>
            <body>
              <video src="${videoUrl}" controls autoplay></video>
            </body>
          </html>
        `)
        printWindow.document.close()
      }
      return
    }
    window.print()
  }

  const getEditableRoot = () => {
    const selection = window.getSelection()
    const anchorNode = selection?.anchorNode
    const anchorElement = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement
    return anchorElement?.closest('[contenteditable="true"]') as HTMLElement | null
  }

  const getEditableRootFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof Node)) {
      const savedRoot = lastEditableRootRef.current
      if (savedRoot && document.contains(savedRoot)) return savedRoot

      return document.querySelector('[data-print-document="true"][contenteditable="true"]') as HTMLElement | null
    }

    const element = target instanceof HTMLElement ? target : target.parentElement
    const root = element?.closest('[contenteditable="true"]') as HTMLElement | null
    if (root) return root

    const savedRoot = lastEditableRootRef.current
    if (savedRoot && document.contains(savedRoot)) return savedRoot

    return document.querySelector('[data-print-document="true"][contenteditable="true"]') as HTMLElement | null
  }

  const saveEditableSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const root = getEditableRoot()
    if (!root) return

    lastEditableRootRef.current = root
    lastEditableRangeRef.current = selection.getRangeAt(0).cloneRange()
  }

  const restoreEditableSelection = () => {
    const root = lastEditableRootRef.current
    const range = lastEditableRangeRef.current
    if (!root || !range || !document.contains(root)) return getEditableRoot()

    root.focus()
    const selection = window.getSelection()
    if (!selection) return root

    selection.removeAllRanges()
    selection.addRange(range.cloneRange())
    return root
  }

  useEffect(() => {
    document.addEventListener('selectionchange', saveEditableSelection)
    return () => document.removeEventListener('selectionchange', saveEditableSelection)
  }, [])

  const getUndoEntry = (event: InputEvent, root: HTMLElement): UndoHistoryEntry => {
    const data = event.data ?? ''
    const snapshot = beforeInputSnapshotRef.current?.root === root
      ? beforeInputSnapshotRef.current
      : null
    const previousHtml = editableHtmlSnapshotsRef.current.get(root)
    const now = Date.now()
    const snapshotFields = {
      root,
      beforeHtml: snapshot?.html ?? previousHtml ?? root.innerHTML,
      afterHtml: root.innerHTML,
      startedAt: now,
      updatedAt: now,
    }

    if (event.inputType === 'insertText' && data) {
      return {
        label: 'Frappe',
        steps: 1,
        kind: 'typing',
        text: data,
        ...snapshotFields,
      }
    }
    if (event.inputType === 'insertParagraph') {
      return { label: 'Frappe paragraphe', steps: 1, kind: 'other', ...snapshotFields }
    }
    if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
      return { label: 'Suppression', steps: 1, kind: 'delete', ...snapshotFields }
    }
    if (event.inputType === 'insertFromPaste') {
      return { label: 'Collage', steps: 1, kind: 'paste', ...snapshotFields }
    }
    if (event.inputType?.startsWith('format')) {
      return { label: 'Correction automatique', steps: 1, kind: 'format', ...snapshotFields }
    }
    return { label: 'Modification du document', steps: 1, kind: 'other', ...snapshotFields }
  }

  useEffect(() => {
    const rememberEditableSnapshot = (event: Event) => {
      const root = getEditableRootFromTarget(event.target)
      if (!root) return

      editableHtmlSnapshotsRef.current.set(root, root.innerHTML)
    }

    const handleBeforeInput = (event: Event) => {
      if (suppressHistoryRef.current) return

      const root = getEditableRootFromTarget(event.target)
      if (!root) return

      beforeInputSnapshotRef.current = {
        root,
        html: root.innerHTML,
      }
    }

    const handleEditableInput = (event: Event) => {
      if (suppressHistoryRef.current) return

      const root = getEditableRootFromTarget(event.target)
      if (!root) return

      const entry = getUndoEntry(event as InputEvent, root)
      setUndoHistory((previous) => {
        const latest = previous[0]

        const isSameTypingGroup =
          entry.kind === 'typing' &&
          latest?.kind === 'typing' &&
          latest.root === entry.root &&
          entry.updatedAt - latest.startedAt <= TYPING_UNDO_GROUP_MS

        if (isSameTypingGroup) {
          const text = `${latest.text || ''}${entry.text || ''}`
          return [
            {
              ...latest,
              label: 'Frappe',
              steps: latest.steps + entry.steps,
              text,
              afterHtml: entry.afterHtml,
              updatedAt: entry.updatedAt,
            },
            ...previous.slice(1),
          ].slice(0, 12)
        }

        return [entry, ...previous].slice(0, 12)
      })
      editableHtmlSnapshotsRef.current.set(root, root.innerHTML)
      beforeInputSnapshotRef.current = null
      setRedoHistory([])
    }

    document.addEventListener('focusin', rememberEditableSnapshot, true)
    document.addEventListener('pointerdown', rememberEditableSnapshot, true)
    document.addEventListener('beforeinput', handleBeforeInput, true)
    document.addEventListener('input', handleEditableInput, true)
    return () => {
      document.removeEventListener('focusin', rememberEditableSnapshot, true)
      document.removeEventListener('pointerdown', rememberEditableSnapshot, true)
      document.removeEventListener('beforeinput', handleBeforeInput, true)
      document.removeEventListener('input', handleEditableInput, true)
    }
  }, [])

  const runDocumentHistoryCommand = (command: 'undo' | 'redo', steps = 1) => {
    const root = restoreEditableSelection()
    root?.focus()

    suppressHistoryRef.current = true
    for (let index = 0; index < Math.max(1, steps); index++) {
      document.execCommand(command, false)
    }
    window.setTimeout(() => {
      suppressHistoryRef.current = false
    }, 0)

    if (root) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }
  }

  const restoreHistorySnapshot = (entry: UndoHistoryEntry, direction: 'undo' | 'redo') => {
    const root = entry.root
    const html = direction === 'undo' ? entry.beforeHtml : entry.afterHtml

    if (!root || html === undefined || !document.contains(root)) return false

    suppressHistoryRef.current = true
    root.innerHTML = html
    editableHtmlSnapshotsRef.current.set(root, html)
    beforeInputSnapshotRef.current = null
    root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    lastEditableRootRef.current = root
    lastEditableRangeRef.current = null
    window.setTimeout(() => {
      suppressHistoryRef.current = false
    }, 0)
    return true
  }

  const handleUndo = (historyEntries = 1) => {
    const moved = undoHistory.slice(0, Math.max(1, historyEntries))
    if (moved.length === 0) return

    const oldestEntry = moved[moved.length - 1]
    const canRestoreSnapshots = moved.length > 0 && moved.every(
      (entry) =>
        entry.root &&
        entry.root === oldestEntry.root &&
        entry.beforeHtml !== undefined &&
        document.contains(entry.root)
    )

    if (canRestoreSnapshots) {
      restoreHistorySnapshot(oldestEntry, 'undo')
    } else {
      const browserSteps = moved.reduce((total, entry) => total + entry.steps, 0)
      runDocumentHistoryCommand('undo', browserSteps || 1)
    }

    setUndoHistory((previous) => previous.slice(moved.length))
    setRedoHistory((previous) => [...moved.reverse(), ...previous].slice(0, 12))
  }

  const handleUndoLast = () => {
    const latest = undoHistory[0]
    if (!latest) return

    const root = latest.root && document.contains(latest.root)
      ? latest.root
      : restoreEditableSelection()

    root?.focus()
    suppressHistoryRef.current = true
    document.execCommand('undo', false)

    if (root) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }

    window.setTimeout(() => {
      suppressHistoryRef.current = false
    }, 0)

    const nextHtml = root?.innerHTML
    const redoEntry: UndoHistoryEntry = {
      ...latest,
      steps: 1,
      beforeHtml: nextHtml ?? latest.beforeHtml,
      afterHtml: latest.afterHtml,
      updatedAt: Date.now(),
    }

    setUndoHistory((previous) => {
      const [current, ...rest] = previous
      if (!current) return rest

      if (current.steps <= 1) return rest

      return [
        {
          ...current,
          steps: current.steps - 1,
          afterHtml: nextHtml ?? current.afterHtml,
          updatedAt: Date.now(),
        },
        ...rest,
      ]
    })
    setRedoHistory((previous) => [redoEntry, ...previous].slice(0, 12))
  }

  const handleRedo = () => {
    const [restored] = redoHistory
    if (!restored) return

    const canRestoreSnapshot = restored?.root && restored.afterHtml !== undefined && document.contains(restored.root)

    if (restored && canRestoreSnapshot) {
      restoreHistorySnapshot(restored, 'redo')
    } else {
      runDocumentHistoryCommand('redo', restored?.steps || 1)
    }

    setRedoHistory((previous) => previous.slice(1))
    setUndoHistory((previous) => [restored, ...previous].slice(0, 12))
  }

  const applyLanguageToRoot = (root: HTMLElement, language: string) => {
    const settings = getEditorLanguageSettings(language)

    root.setAttribute('lang', settings.lang)
    root.setAttribute('dir', settings.dir)
    root.spellcheck = true
    root.style.direction = settings.dir

    return settings
  }

  const applyLanguageToSelection = (language: string) => {
    const root = restoreEditableSelection() || document.querySelector('[data-print-document="true"][contenteditable="true"]') as HTMLElement | null
    if (!root) return

    const settings = applyLanguageToRoot(root, language)
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (range.collapsed || !root.contains(range.commonAncestorContainer)) return

    const span = document.createElement('span')
    span.setAttribute('lang', settings.lang)
    span.setAttribute('dir', settings.dir)
    span.style.direction = settings.dir
    span.style.unicodeBidi = 'plaintext'

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
    lastEditableRootRef.current = root
    lastEditableRangeRef.current = nextRange.cloneRange()
    root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
  }

  const applySelectionStyle = (style: Record<string, string>) => {
    const root = restoreEditableSelection()
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
      lastEditableRootRef.current = root
      lastEditableRangeRef.current = nextRange.cloneRange()
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
      lastEditableRootRef.current = root
      lastEditableRangeRef.current = nextRange.cloneRange()
    }

    root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
  }

  const transformTextCase = (text: string, mode: LetterCaseMode) =>
    mode === 'upper' ? text.toLocaleUpperCase() : text.toLocaleLowerCase()

  const applyCaseToEditableSelection = (mode: LetterCaseMode) => {
    const root = restoreEditableSelection()
    if (!root) return false

    root.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false

    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer) || range.collapsed) return false

    const selectedText = range.toString()
    if (!selectedText) return false

    const replacement = document.createTextNode(transformTextCase(selectedText, mode))
    range.deleteContents()
    range.insertNode(replacement)

    const nextRange = document.createRange()
    nextRange.selectNodeContents(replacement)
    selection.removeAllRanges()
    selection.addRange(nextRange)
    lastEditableRootRef.current = root
    lastEditableRangeRef.current = nextRange.cloneRange()
    root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    return true
  }

  const applyInlineCommand = (
    command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'subscript' | 'superscript'
  ) => {
    const root = getEditableRoot()
    if (root) {
      root.focus()
    }

    document.execCommand(command, false)
    document.dispatchEvent(new Event('selectionchange'))

    if (root) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }
  }

  const applyValueCommand = (command: 'foreColor' | 'fontName', value: string) => {
    if (command === 'foreColor' && isCssGradient(value)) {
      applySelectionStyle({
        backgroundImage: value,
        backgroundClip: 'text',
        webkitBackgroundClip: 'text',
        color: 'transparent',
        webkitTextFillColor: 'transparent',
      })
      document.dispatchEvent(new Event('selectionchange'))
      return
    }

    const root = restoreEditableSelection()
    if (root) {
      root.focus()
    }

    document.execCommand('styleWithCSS', false, 'true')

    const selection = window.getSelection()
    if (command === 'foreColor' && root && selection?.rangeCount && selection.getRangeAt(0).collapsed) {
      const range = selection.getRangeAt(0)
      const span = document.createElement('span')
      span.style.color = value
      const marker = document.createTextNode('\u200b')
      span.appendChild(marker)
      range.insertNode(span)

      const nextRange = document.createRange()
      nextRange.setStart(marker, 1)
      nextRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(nextRange)
      lastEditableRootRef.current = root
      lastEditableRangeRef.current = nextRange.cloneRange()
    } else {
      document.execCommand(command, false, value)
      saveEditableSelection()
    }

    document.dispatchEvent(new Event('selectionchange'))

    if (root) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }
  }

  const applyParagraphCommand = (command: 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull') => {
    const root = restoreEditableSelection()
    if (root) {
      root.focus()
    }
    document.execCommand(command, false)
    if (root) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }
  }

  const applyTextHighlight = (color: string) => {
    const root = restoreEditableSelection()
    if (!root) return

    root.focus()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('hiliteColor', false, color)
    root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    saveEditableSelection()
  }

  const applyTextEffect = (effect: TextEffectValue) => {
    const effectStyles: Record<TextEffectValue, Record<string, string>> = {
      none: {
        textShadow: 'none',
        webkitTextStroke: '0 transparent',
        filter: 'none',
      },
      shadow: {
        textShadow: '0 2px 4px rgba(15, 23, 42, 0.38)',
      },
      glow: {
        textShadow: '0 0 5px rgba(37, 99, 235, 0.75), 0 0 12px rgba(37, 99, 235, 0.36)',
      },
      outline: {
        webkitTextStroke: '0.65px currentColor',
        textShadow: '0 0 1px currentColor',
      },
      lifted: {
        textShadow: '0 1px 0 rgba(255, 255, 255, 0.9), 0 3px 5px rgba(15, 23, 42, 0.28)',
      },
    }

    applySelectionStyle(effectStyles[effect])
    document.dispatchEvent(new Event('selectionchange'))
  }

  const applyListStyle = (style: MultilevelListValue) => {
    const selection = window.getSelection()
    const root = getEditableRoot()
    const anchorNode = selection?.anchorNode
    const anchorElement = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement
    const activeList = anchorElement?.closest('ol, ul') as HTMLOListElement | HTMLUListElement | null
    const lists = new Set<HTMLOListElement | HTMLUListElement>()

    if (activeList && root?.contains(activeList)) {
      lists.add(activeList)
    }

    if (root && selection?.rangeCount) {
      const range = selection.getRangeAt(0)
      root.querySelectorAll('ol, ul').forEach((list) => {
        if (range.intersectsNode(list)) {
          lists.add(list as HTMLOListElement | HTMLUListElement)
        }
      })
    }

    lists.forEach((list) => {
      list.classList.remove('editor-list-decimal', 'editor-list-heading', 'editor-list-legal')
      list.classList.add(`editor-list-${style}`)
      if (style === 'heading') {
        list.style.listStyleType = 'upper-alpha'
      } else if (style === 'legal') {
        list.style.listStyleType = 'upper-roman'
      } else {
        list.style.listStyleType = 'decimal'
      }
    })
  }

  const applyBulletStyle = (style: BulletListValue) => {
    const selection = window.getSelection()
    const root = getEditableRoot()
    const anchorNode = selection?.anchorNode
    const anchorElement = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement
    const activeList = anchorElement?.closest('ul') as HTMLUListElement | null
    const lists = new Set<HTMLUListElement>()

    if (activeList && root?.contains(activeList)) {
      lists.add(activeList)
    }

    if (root && selection?.rangeCount) {
      const range = selection.getRangeAt(0)
      root.querySelectorAll('ul').forEach((list) => {
        if (range.intersectsNode(list)) {
          lists.add(list as HTMLUListElement)
        }
      })
    }

    lists.forEach((list) => {
      list.classList.remove(
        'editor-bullet-disc',
        'editor-bullet-circle',
        'editor-bullet-square',
        'editor-bullet-arrow',
        'editor-bullet-check',
        'editor-bullet-diamond',
        'editor-bullet-plus'
      )

      if (style === 'none') return

      list.classList.add(`editor-bullet-${style}`)
      if (style === 'disc' || style === 'circle' || style === 'square') {
        list.style.listStyleType = style
      } else {
        list.style.removeProperty('list-style-type')
      }
    })
  }

  const applyBulletCommand = (style: BulletListValue) => {
    const root = restoreEditableSelection()
    if (root) {
      root.focus()
    }

    const selection = window.getSelection()
    const anchorNode = selection?.anchorNode
    const anchorElement = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement
    const activeList = anchorElement?.closest('ul') as HTMLElement | null

    if (style === 'none') {
      if (activeList && root?.contains(activeList)) {
        document.execCommand('insertUnorderedList', false)
      }
    } else {
      if (!activeList || !root?.contains(activeList)) {
        document.execCommand('insertUnorderedList', false)
      }
      applyBulletStyle(style)
    }

    if (root) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }

    document.dispatchEvent(new Event('selectionchange'))
    saveEditableSelection()
  }

  const applyListCommand = (
    command: 'insertUnorderedList' | 'insertOrderedList',
    style?: MultilevelListValue
  ) => {
    const root = restoreEditableSelection()
    if (root) {
      root.focus()
    }

    const selection = window.getSelection()
    const anchorNode = selection?.anchorNode
    const anchorElement = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement
    const activeList = anchorElement?.closest('ol, ul') as HTMLElement | null
    const canRestyleCurrentList = style && activeList?.tagName === 'OL' && root?.contains(activeList)

    if (!canRestyleCurrentList) {
      document.execCommand(command, false)
    }

    if (style) {
      applyListStyle(style)
    }

    if (root) {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
    }

    document.dispatchEvent(new Event('selectionchange'))
    saveEditableSelection()
  }

  const applyPdfListCommand = (
    kind: 'bullet' | 'number' | 'multilevel',
    style?: BulletListValue | MultilevelListValue
  ) => {
    window.dispatchEvent(
      new CustomEvent('pdf-editor-list-command', {
        detail: { kind, style },
      })
    )
  }

  const applyCaseCommand = (mode: LetterCaseMode) => {
    window.dispatchEvent(
      new CustomEvent('editor-change-case', {
        detail: { mode },
      })
    )
    applyCaseToEditableSelection(mode)
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
    onSaveAs: handleSaveAs,
    onOpen: handleBack,
    onExport: handleExport,
    onPrint: handlePrint,
    onZoomIn: () => setZoom(Math.min(300, zoom + 10)),
    onZoomOut: () => setZoom(Math.max(10, zoom - 10)),
    onUndoLast: handleUndoLast,
    onUndo: handleUndo,
    onRedo: handleRedo,
    undoHistory: undoHistory.map((entry) => entry.label),
    undoAvailable: undoHistory.length > 0,
    redoAvailable: redoHistory.length > 0,
    onToggleBold: () => applyInlineCommand('bold'),
    onToggleItalic: () => applyInlineCommand('italic'),
    onToggleUnderline: () => applyInlineCommand('underline'),
    onToggleStrikethrough: () => applyInlineCommand('strikeThrough'),
    onToggleSubscript: () => applyInlineCommand('subscript'),
    onToggleSuperscript: () => applyInlineCommand('superscript'),
    onChangeCase: applyCaseCommand,
    onAlignLeft: () => applyParagraphCommand('justifyLeft'),
    onAlignCenter: () => applyParagraphCommand('justifyCenter'),
    onAlignRight: () => applyParagraphCommand('justifyRight'),
    onAlignJustify: () => applyParagraphCommand('justifyFull'),
    onSetFontFamily: (font) => {
      setTextFontFamily(font)
      applyValueCommand('fontName', font)
    },
    onSetFontSize: (size) => {
      setTextFontSize(size)
      applySelectionStyle({ fontSize: `${size}px` })
    },
    onSetColor: (color) => {
      const nextColor = isCssGradient(color) ? getColorFallback(color) : color
      setTextColor(nextColor)
      window.dispatchEvent(
        new CustomEvent('editor-shape-color-change', {
          detail: { color: nextColor },
        })
      )
      applyValueCommand('foreColor', color)
    },
    onSetHighlight: applyTextHighlight,
    onSetTextEffect: applyTextEffect,
    onToggleBulletedList: () =>
      file.type === 'pdf'
        ? applyPdfListCommand('bullet', 'disc')
        : applyListCommand('insertUnorderedList'),
    onSetBulletedList: (style) =>
      file.type === 'pdf'
        ? applyPdfListCommand('bullet', style)
        : applyBulletCommand(style),
    onToggleNumberedList: () =>
      file.type === 'pdf'
        ? applyPdfListCommand('number', 'decimal')
        : applyListCommand('insertOrderedList', 'decimal'),
    onSetMultilevelList: (style) =>
      file.type === 'pdf'
        ? applyPdfListCommand('multilevel', style)
        : applyListCommand('insertOrderedList', style),
    onFind: handleFind,
    onReplace: handleReplace,
    onSetTool: setActiveTool,
    onSetShape: setSelectedShape,
    onSetLanguage: applyLanguageToSelection,
    onBack: handleBack,
    onLogout: handleBack,
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
      }
      if (
        (file.type === 'image' || file.type === 'video') &&
        imageSelectedObjectId &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement) &&
        !(e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        e.preventDefault()
        imageEditorRef.current?.deleteSelectedObject()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearCurrentFile, file.type, handleRedo, handleUndo, imageSelectedObjectId])

  const handleImageObjectSelect = (
    id: string | undefined,
    type?: ImageEditorObjectType,
    style?: ImageObjectStyle
  ) => {
    setImageSelectedObjectId(id)
    setImageSelectedObjectType(type)
    if (!style) return
    setImageElementStartTime(style.startTime || 0)
    setImageElementEndTime(style.endTime || mediaDuration || 0)

    if (type === 'text') {
      setImageTextColor(style.color)
      setImageTextFontFamily(style.fontFamily || 'Arial')
      setImageTextFontSize(style.fontSize || 24)
      setImageTextBold(Boolean(style.bold))
      setImageTextItalic(Boolean(style.italic))
      setImageTextRotation(style.rotation || 0)
      return
    }

    if (type === 'shape') {
      setImageFillColor(style.fillColor || '#e0f2fe')
      setImageStrokeColor(style.strokeColor || style.color)
      setImageStrokeWidth(style.size)
      setImageShapeRotation(style.rotation || 0)
      setImageShapeWidth(style.width || 120)
      setImageShapeHeight(style.height || 80)
      setImageShapeText(style.shapeText || '')
      setImageShapeTextAlign(style.shapeTextAlign || 'center')
      setImageShapeTextVerticalAlign(style.shapeTextVerticalAlign || 'middle')
      return
    }

    if (type === 'drawing') {
      setImageBrushColor(style.color)
      setImageBrushSize(style.size)
      setImageBrushOpacity(style.opacity)
      return
    }

    if (type === 'image') {
      setImageShapeWidth(style.width || 120)
      setImageShapeHeight(style.height || 80)
      setImageBorderRadius(style.borderRadius || 0)
      setImageBorderWidth(style.borderWidth || 0)
      setImageBorderColor(style.borderColor || '#ffffff')
      setImageObjectOpacity(style.opacity)
    }
  }

  const handleSetElementStartTime = (time: number) => {
    const nextStart = Math.max(0, time)
    const nextEnd = Math.max(nextStart, imageElementEndTime || mediaDuration || nextStart)
    setImageElementStartTime(nextStart)
    setImageElementEndTime(nextEnd)
    imageEditorRef.current?.setSelectedObjectTiming(nextStart, nextEnd)
  }

  const handleSetElementEndTime = (time: number) => {
    const nextEnd = Math.max(imageElementStartTime, time)
    setImageElementEndTime(nextEnd)
    imageEditorRef.current?.setSelectedObjectTiming(imageElementStartTime, nextEnd)
  }

  const handleConvertImageToVideo = async () => {
    if (file.type !== 'image' || convertingToVideo) return
    setConvertingToVideo(true)
    try {
      const imageBlob = new Blob([file.content], { type: getImageMimeType(file.name) })
      const imageUrl = URL.createObjectURL(imageBlob)
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Could not load the image'))
        image.src = imageUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || 1280
      canvas.height = image.naturalHeight || 720
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Video canvas is unavailable')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(imageUrl)

      const stream = canvas.captureStream(30)
      const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      const completed = new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('Could not create the video'))
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
      })
      recorder.start(100)
      await new Promise<void>((resolve) => {
        const startedAt = performance.now()
        let frameId = 0
        const drawFrame = (now: number) => {
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          videoTrack?.requestFrame?.()
          if (now - startedAt >= 5000) {
            window.cancelAnimationFrame(frameId)
            resolve()
            return
          }
          frameId = window.requestAnimationFrame(drawFrame)
        }
        frameId = window.requestAnimationFrame(drawFrame)
      })
      recorder.stop()
      const videoBlob = await completed
      stream.getTracks().forEach((track) => track.stop())
      const content = await videoBlob.arrayBuffer()
      const nextFile: DocumentFile = {
        ...file,
        id: `${file.id}-video-${Date.now()}`,
        name: `${getBaseFileName(file.name)}.webm`,
        type: 'video',
        originalType: undefined,
        content,
        size: videoBlob.size,
        uploadedAt: Date.now(),
        convertedImageContent: file.content.slice(0),
        convertedImageName: file.name,
      }
      setCurrentFile(nextFile)
      useDocumentStore.getState().addRecentFile(nextFile)
      showSuccessToast('Image converted to a 5 second video', 'video')
    } catch (error) {
      console.error('Image-to-video conversion failed:', error)
      showErrorToast('Could not convert this image to video.')
    } finally {
      setConvertingToVideo(false)
    }
  }

  const imageRibbonActions: ImageEditorRibbonActions = {
    onSetTool: setImageActiveTool,
    activeTool: imageActiveTool,
    onSetBrushSize: setImageBrushSize,
    onSetBrushOpacity: setImageBrushOpacity,
    onSetBrushColor: setImageBrushColor,
    onSetBackgroundColor: setImageBackgroundColor,
    brushSize: imageBrushSize,
    brushOpacity: imageBrushOpacity,
    brushColor: imageBrushColor,
    backgroundColor: imageBackgroundColor,
    onSetFillColor: setImageFillColor,
    onSetStrokeColor: setImageStrokeColor,
    onSetStrokeWidth: setImageStrokeWidth,
    onSetShapeRotation: setImageShapeRotation,
    onSetShapeWidth: (width) => {
      setImageShapeWidth(width)
      imageEditorRef.current?.setSelectedShapeDimensions(width, undefined)
    },
    onSetShapeHeight: (height) => {
      setImageShapeHeight(height)
      imageEditorRef.current?.setSelectedShapeDimensions(undefined, height)
    },
    onSetImageBorderRadius: (radius) => {
      setImageBorderRadius(radius)
      imageEditorRef.current?.setSelectedImageStyle({ borderRadius: radius })
    },
    onSetImageBorderWidth: (width) => {
      setImageBorderWidth(width)
      imageEditorRef.current?.setSelectedImageStyle({ borderWidth: width })
    },
    onSetImageBorderColor: (color) => {
      setImageBorderColor(color)
      imageEditorRef.current?.setSelectedImageStyle({ borderColor: color })
    },
    onSetImageOpacity: (opacity) => {
      setImageObjectOpacity(opacity)
      imageEditorRef.current?.setSelectedImageStyle({ opacity })
    },
    onSetShapeText: setImageShapeText,
    onSetShapeTextAlign: setImageShapeTextAlign,
    onSetShapeTextVerticalAlign: setImageShapeTextVerticalAlign,
    mediaType: file.type === 'video' ? 'video' : 'image',
    mediaCurrentTime,
    mediaDuration,
    videoExportQuality,
    onSetVideoExportQuality: setVideoExportQuality,
    elementStartTime: imageElementStartTime,
    elementEndTime: imageElementEndTime,
    onSetElementStartTime: handleSetElementStartTime,
    onSetElementEndTime: handleSetElementEndTime,
    fillColor: imageFillColor,
    strokeColor: imageStrokeColor,
    strokeWidth: imageStrokeWidth,
    shapeRotation: imageShapeRotation,
    shapeWidth: imageShapeWidth,
    shapeHeight: imageShapeHeight,
    shapeText: imageShapeText,
    shapeTextAlign: imageShapeTextAlign,
    shapeTextVerticalAlign: imageShapeTextVerticalAlign,
    imageBorderRadius,
    imageBorderWidth,
    imageBorderColor,
    imageOpacity: imageObjectOpacity,
    selectedObjectType: imageSelectedObjectType,
    onSetTextFontFamily: setImageTextFontFamily,
    onSetTextFontSize: setImageTextFontSize,
    onToggleTextBold: () => setImageTextBold((bold) => !bold),
    onToggleTextItalic: () => setImageTextItalic((italic) => !italic),
    onSetTextColor: setImageTextColor,
    onSetTextRotation: setImageTextRotation,
    textFontFamily: imageTextFontFamily,
    textFontSize: imageTextFontSize,
    textBold: imageTextBold,
    textItalic: imageTextItalic,
    textColor: imageTextColor,
    textRotation: imageTextRotation,
    onZoomIn: () => setZoom(Math.min(300, zoom + 10)),
    onZoomOut: () => setZoom(Math.max(25, zoom - 10)),
    onResetZoom: () => setZoom(100),
    zoom,
    onRotateLeft: () => imageEditorRef.current?.rotateLeft(),
    onRotateRight: () => imageEditorRef.current?.rotateRight(),
    onFlipHorizontal: () => imageEditorRef.current?.flipHorizontal(),
    onFlipVertical: () => imageEditorRef.current?.flipVertical(),
    onCrop: () => setImageActiveTool('crop'),
    onUndo: () => imageEditorRef.current?.undo(),
    onRedo: () => imageEditorRef.current?.redo(),
    undoAvailable: imageCanUndo,
    redoAvailable: imageCanRedo,
    onDeleteSelected: () => imageEditorRef.current?.deleteSelectedObject(),
    onExport: (format) => imageEditorRef.current?.exportImage(format),
    onConvertToVideo: handleConvertImageToVideo,
    convertingToVideo,
  }

  return (
    <div className="w-full h-full flex flex-col" data-editor-shell="true" style={{ backgroundColor: displayType === 'image' || displayType === 'video' ? '#f1f5f9' : 'white' }}>
      {displayType === 'image' || displayType === 'video' ? (
        <ImageEditorRibbon actions={imageRibbonActions} />
      ) : (
        <>
          <Ribbon fileType={displayType} actions={toolbarActions} />
          <div data-print-hidden="true" className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600 shadow-sm">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 rounded px-3 py-2 font-medium text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: themeColor }}
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
        </>
      )}

      {/* Back button for media */}
      {(displayType === 'image' || displayType === 'video') && (
        <div data-print-hidden="true" className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 shadow-sm">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 rounded px-3 py-2 font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: displayType === 'video' ? '#0f766e' : '#0891b2' }}
            title="Back"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <div className="flex-1 px-2">
            <div className="font-semibold text-slate-800">{file.name}</div>
            <div className="text-[11px] text-slate-500">{displayType?.toUpperCase()}</div>
          </div>
        </div>
      )}

      {/* Editor content */}
      <div
        data-print-content="true"
        className="flex-1 overflow-hidden flex flex-col"
      >
        {file.type === 'docx' && <WordEditor file={file} />}
        {file.type === 'pptx' && <PowerPointEditor file={file} />}
        {file.type === 'pdf' && <PDFEditor file={file} />}
        {file.type === 'xlsx' && <ExcelEditor file={file} />}
        {file.type === 'image' && (
          <div
            className="flex-1 min-h-0"
            style={{
              width: '100%',
              height: '100%',
            }}
          >
            <ImageEditor
              ref={imageEditorRef}
              file={file}
              activeTool={imageActiveTool}
              brushSize={imageBrushSize}
              brushOpacity={imageBrushOpacity}
              brushColor={imageBrushColor}
              backgroundColor={imageBackgroundColor}
              fillColor={imageFillColor}
              strokeColor={imageStrokeColor}
              strokeWidth={imageStrokeWidth}
              shapeRotation={imageShapeRotation}
              textFontFamily={imageTextFontFamily}
              textFontSize={imageTextFontSize}
              textBold={imageTextBold}
              textItalic={imageTextItalic}
              textColor={imageTextColor}
              textRotation={imageTextRotation}
              shapeText={imageShapeText}
              shapeTextAlign={imageShapeTextAlign}
              shapeTextVerticalAlign={imageShapeTextVerticalAlign}
              elementStartTime={imageElementStartTime}
              elementEndTime={imageElementEndTime}
              imageBorderRadius={imageBorderRadius}
              imageBorderWidth={imageBorderWidth}
              imageBorderColor={imageBorderColor}
              imageOpacity={imageObjectOpacity}
              selectedObjectId={imageSelectedObjectId}
              onObjectSelect={handleImageObjectSelect}
              onBackgroundFill={setImageBackgroundColor}
              onHistoryChange={(canUndo, canRedo) => {
                setImageCanUndo(canUndo)
                setImageCanRedo(canRedo)
              }}
            />
          </div>
        )}
        {file.type === 'video' && (
          <div
            className="flex-1 min-h-0"
            style={{
              width: '100%',
              height: '100%',
            }}
          >
            <VideoEditor
              ref={imageEditorRef}
              file={file}
              activeTool={imageActiveTool}
              brushSize={imageBrushSize}
              brushOpacity={imageBrushOpacity}
              brushColor={imageBrushColor}
              backgroundColor={imageBackgroundColor}
              fillColor={imageFillColor}
              strokeColor={imageStrokeColor}
              strokeWidth={imageStrokeWidth}
              shapeRotation={imageShapeRotation}
              textFontFamily={imageTextFontFamily}
              textFontSize={imageTextFontSize}
              textBold={imageTextBold}
              textItalic={imageTextItalic}
              textColor={imageTextColor}
              textRotation={imageTextRotation}
              shapeText={imageShapeText}
              shapeTextAlign={imageShapeTextAlign}
              shapeTextVerticalAlign={imageShapeTextVerticalAlign}
              elementStartTime={imageElementStartTime}
              elementEndTime={imageElementEndTime}
              imageBorderRadius={imageBorderRadius}
              imageBorderWidth={imageBorderWidth}
              imageBorderColor={imageBorderColor}
              imageOpacity={imageObjectOpacity}
              selectedObjectId={imageSelectedObjectId}
              onObjectSelect={handleImageObjectSelect}
              onBackgroundFill={setImageBackgroundColor}
              onHistoryChange={(canUndo, canRedo) => {
                setImageCanUndo(canUndo)
                setImageCanRedo(canRedo)
              }}
              onMediaTimeChange={(currentTime, duration, playing) => {
                setMediaCurrentTime(currentTime)
                setMediaDuration(duration)
                setMediaPlaying(playing)
              }}
              exportQuality={videoExportQuality}
            />
          </div>
        )}
        {file.type === 'whiteboard' && <WhiteboardEditor file={file} />}
      </div>

      {displayType !== 'image' && displayType !== 'video' && (
        <div data-print-hidden="true">
          <StatusBar file={file} />
        </div>
      )}
    </div>
  )
}

