import { useState, useEffect, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../store'
import { ChevronLeft, History, Share2, X } from 'lucide-react'
import { Document as DocxDocument, Packer, PageOrientation as DocxPageOrientation, Paragraph, TextRun } from 'docx'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getEditorLanguageSettings, getPageDimensions, getThemeForFileType } from '../utils'
import { showSuccessToast, showErrorToast } from '../utils/toast'
import Ribbon, {
  type BulletListValue,
  type MultilevelListValue,
  type RibbonActions,
  type TextEffectValue,
} from './Ribbon'
import ImageEditorRibbon, { type ImageEditorRibbonActions } from './ImageEditorRibbon'
import StatusBar from './StatusBar'
import WordEditor from './editors/WordEditor'
import PowerPointEditor from './editors/PowerPointEditor'
import PDFEditor from './editors/PDFEditor'
import ExcelEditor from './editors/ExcelEditor'
import ImageEditor from './editors/ImageEditor'
import WhiteboardEditor from './editors/WhiteboardEditor'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  createFileRecord,
  getEditorEmail,
  getEditorName,
  getFileEditEvents,
  getFileShares,
  getShareEditorUrl,
  getSenderShareAccess,
  getUsers,
  logFileEdit,
  saveFileContent,
  shareFile,
  upsertUser,
  type EditAuditEvent,
  type FileShareRecord,
  type UserRecord,
} from '../services/editAudit'

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
  kind: 'typing' | 'delete' | 'paste' | 'format' | 'tool' | 'other'
  text?: string
  root?: HTMLElement
  beforeHtml?: string
  afterHtml?: string
  applyUndo?: () => void
  applyRedo?: () => void
  startedAt: number
  updatedAt: number
}

export default function EditorView({ file }: EditorViewProps) {
  const [, setIsSaving] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [isPanActive, setIsPanActive] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [undoHistory, setUndoHistory] = useState<UndoHistoryEntry[]>([])
  const [redoHistory, setRedoHistory] = useState<UndoHistoryEntry[]>([])
  const [lastEdit, setLastEdit] = useState<EditAuditEvent | null>(null)
  const [editEvents, setEditEvents] = useState<EditAuditEvent[]>([])
  const [editStatusLoaded, setEditStatusLoaded] = useState(false)
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [shareRecipient, setShareRecipient] = useState('')
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view')
  const [shareResultMessage, setShareResultMessage] = useState('')
  const [lastShareAccessUrl, setLastShareAccessUrl] = useState('')
  const [shares, setShares] = useState<FileShareRecord[]>([])
  const [shareUsers, setShareUsers] = useState<UserRecord[]>([])
  const [isSharing, setIsSharing] = useState(false)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const suppressHistoryRef = useRef(false)
  const beforeInputSnapshotRef = useRef<{
    root: HTMLElement
    html: string
  } | null>(null)
  const editableHtmlSnapshotsRef = useRef<WeakMap<HTMLElement, string>>(new WeakMap())
  const lastEditAuditAtRef = useRef(0)

  const clearCurrentFile = useDocumentStore((state) => state.clearCurrentFile)
  const editorHtml = useDocumentStore((state) => state.editorHtml)
  const zoom = useDocumentStore((state) => state.zoom)
  const setZoom = useDocumentStore((state) => state.setZoom)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const setSelectedShape = useDocumentStore((state) => state.setSelectedShape)
  const setTextColor = useDocumentStore((state) => state.setTextColor)
  const setShapeFillColor = useDocumentStore((state) => state.setShapeFillColor)
  const setTextFontFamily = useDocumentStore((state) => state.setTextFontFamily)
  const setTextFontSize = useDocumentStore((state) => state.setTextFontSize)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const pageMargins = useDocumentStore((state) => state.pageMargins)
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

  const formatEditTime = (value?: string) => {
    if (!value) return ''

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  const formatEditMetadata = (event: EditAuditEvent) => {
    const metadata = event.metadata || {}
    const segments: string[] = []

    if (typeof metadata.historyKind === 'string' && metadata.historyKind.trim()) {
      const kindLabels: Record<string, string> = {
        typing: 'Typing',
        delete: 'Delete',
        paste: 'Paste',
        format: 'Format',
        tool: 'Tool',
        other: 'Edit',
      }
      const kind = metadata.historyKind.trim()
      segments.push(kindLabels[kind] || kind)
    }

    if (typeof metadata.inputType === 'string' && metadata.inputType.trim()) {
      segments.push(metadata.inputType)
    }

    if (typeof metadata.modifiedWord === 'string' && metadata.modifiedWord.trim()) {
      segments.push(`word: ${metadata.modifiedWord.trim()}`)
    }

    return segments.join(' • ')
  }

  const getEditContent = (event: EditAuditEvent): string => {
    const metadata = event.metadata || {}
    if (typeof metadata.modifiedWord === 'string' && metadata.modifiedWord.trim()) {
      return metadata.modifiedWord.trim()
    }

    if (typeof metadata.content === 'string' && metadata.content.trim()) {
      const text = metadata.content.trim()
      // If content is clean word text (like "dfsdfsdf"), return it directly
      const isGenericSymbol = text.startsWith('↵') || text.startsWith('⌫') || text.startsWith('📋') || text.startsWith('🎨') || text.startsWith('✏️')
      if (!isGenericSymbol) {
        return text.length > 80 ? `${text.slice(0, 80)}…` : text
      }
    }

    // Try finding the last modified word from DOM highlights as preferred content
    try {
      const highlights = document.querySelectorAll<HTMLElement>('.word-edit-highlight')
      if (highlights.length > 0) {
        const lastWord = highlights[highlights.length - 1].textContent?.trim()
        if (lastWord) return lastWord
      }
    } catch {}

    if (typeof metadata.content === 'string' && metadata.content.trim()) {
      return metadata.content.trim()
    }

    return ''
  }

  const recordEditAudit = (
    action: string,
    metadata: Record<string, unknown> = {},
    throttle = true
  ) => {
    const now = Date.now()
    if (throttle && now - lastEditAuditAtRef.current < 2500) return

    lastEditAuditAtRef.current = now
    void logFileEdit({
      fileId: file.id,
      fileName: file.name,
      fileType: displayType,
      action,
      editor: displayType || 'unknown',
      metadata: {
        ...metadata,
        editorName: getEditorName(),
        editorEmail: getEditorEmail(),
      },
    }).then((event) => {
      if (event) {
        setLastEdit(event)
        setEditEvents((events) => [event, ...events.filter((item) => item._id !== event._id)].slice(0, 100))
        setEditStatusLoaded(true)
      }
    })
  }

  useEffect(() => {
    let cancelled = false
    setEditStatusLoaded(false)
    setLastEdit(null)
    setEditEvents([])
    setShares([])

    void getFileEditEvents(file.id).then((history) => {
      if (cancelled) return

      const events = history?.events || []
      setEditEvents(events)
      setLastEdit(history?.lastEdit || events[0] || null)
      setEditStatusLoaded(true)
    })

    void getFileShares(file.id).then((nextShares) => {
      if (!cancelled) setShares(nextShares)
    })

    void getUsers().then((users) => {
      if (!cancelled) setShareUsers(users)
    })

    return () => {
      cancelled = true
    }
  }, [file.id])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Determine content to persist
      let contentBase64: string | undefined

      // First, try to ask the active editor if it can provide the serialized content
      const editorProvidedContent = await new Promise<string | undefined>((resolve) => {
        const handleReady = (event: Event) => {
          const detail = (event as CustomEvent).detail
          if (detail?.contentBase64) {
            resolve(detail.contentBase64)
          } else {
            resolve(undefined)
          }
        }
        window.addEventListener('editor-save-content-ready', handleReady, { once: true })
        window.dispatchEvent(new CustomEvent('editor-request-save-content'))
        
        // Timeout if editor doesn't support this event
        setTimeout(() => {
          window.removeEventListener('editor-save-content-ready', handleReady)
          resolve(undefined)
        }, 500)
      })

      if (editorProvidedContent) {
        contentBase64 = editorProvidedContent
      } else if (editorHtml.trim() && file.type && ['docx', 'doc', 'pptx', 'ppt', 'whiteboard'].includes(file.type as any)) {
        const blob = await buildDocxFromEditorHtml()
        const buffer = await blob.arrayBuffer()
        contentBase64 = arrayBufferToBase64(buffer)
      } else if (file.content.byteLength > 0) {
        contentBase64 = arrayBufferToBase64(file.content)
      }

      if (contentBase64) {
        await saveFileContent(
          file.id,
          contentBase64,
          getDocumentMimeType(),
          file.name,
          file.type
        )
      }

      recordEditAudit('save', { size: file.size }, false)
      showSuccessToast(`${file.name} saved to database!`, file.type)
    } catch (err) {
      console.error('Save failed:', err)
      showErrorToast('Could not save the file to the database.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleShareFile = async () => {
    const recipientEmail = shareRecipient.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
      showErrorToast('Enter a valid email address to share with.')
      return
    }

    setIsSharing(true)
    setShareResultMessage('')
    setLastShareAccessUrl('')
    await upsertUser(recipientEmail, recipientEmail)
    await createFileRecord({
      fileId: file.id,
      fileName: file.name,
      fileType: file.type,
      originalType: file.originalType,
      workflow: file.workflow,
      size: file.size,
      contentBase64: file.content.byteLength > 0 ? arrayBufferToBase64(file.content) : undefined,
      contentType: getDocumentMimeType(),
    })
    const result = await shareFile(file.id, recipientEmail, sharePermission, recipientEmail)
    setIsSharing(false)

    if (!result?.share) {
      showErrorToast(result?.error || 'Could not share this file. Check MongoDB/backend connection.')
      return
    }

    const sharedRecord = result.share
    setLastShareAccessUrl(getShareEditorUrl(sharedRecord, result.accessUrl))
    if (result.emailStatus?.sent) {
      setShareResultMessage(`Email sent to ${recipientEmail}.`)
    } else if (result.emailStatus && !result.emailStatus.configured) {
      setShareResultMessage('Share saved. SMTP is not configured, so use the access link below for testing.')
    } else if (result.emailStatus && !result.emailStatus.sent) {
      setShareResultMessage(`Share saved, but email failed: ${result.emailStatus.reason || 'unknown error'}`)
    }

    setShareUsers((users) => [
      sharedRecord.sharedWith,
      ...users.filter((user) => user.userId !== sharedRecord.sharedWith.userId),
    ])
    setShares((current) => [
      sharedRecord,
      ...current.filter((share) => share._id !== sharedRecord._id),
    ])
    if (result.event) {
      setLastEdit(result.event)
      setEditEvents((events) => [result.event!, ...events.filter((event) => event._id !== result.event!._id)].slice(0, 100))
      setEditStatusLoaded(true)
    }
    setShareRecipient('')
    showSuccessToast(`${file.name} shared with ${recipientEmail}`, file.type)
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
      const defaultName = getCopyFileName()
      const userEnteredName = window.prompt('Enregistrer sous (Nom du fichier) :', defaultName)
      if (userEnteredName === null) return // User cancelled

      const targetName = userEnteredName.trim() || defaultName

      // Check if the active editor provides updated content (PDF, PowerPoint, Excel, Word, etc.)
      const editorProvidedContent = await new Promise<string | undefined>((resolve) => {
        const handleReady = (event: Event) => {
          const detail = (event as CustomEvent).detail
          if (detail?.contentBase64) {
            resolve(detail.contentBase64)
          } else {
            resolve(undefined)
          }
        }
        window.addEventListener('editor-save-content-ready', handleReady, { once: true })
        window.dispatchEvent(new CustomEvent('editor-request-save-content'))

        setTimeout(() => {
          window.removeEventListener('editor-save-content-ready', handleReady)
          resolve(undefined)
        }, 500)
      })

      if (editorProvidedContent) {
        const buffer = base64ToArrayBuffer(editorProvidedContent)
        const blob = new Blob([buffer], { type: getDocumentMimeType() })
        downloadBlob(blob, targetName)
        recordEditAudit('save as', { format: file.type, size: blob.size }, false)
        showSuccessToast(`${targetName} enregistré avec succès`, file.type)
        return
      }

      if (file.type === 'docx' && editorHtml.trim()) {
        const blob = await buildDocxFromEditorHtml()
        downloadBlob(blob, targetName)
        recordEditAudit('save as', { format: 'docx', size: blob.size }, false)
        showSuccessToast(`${targetName} enregistré avec succès`, file.type)
        return
      }

      const blob = new Blob([file.content.slice(0)], { type: getDocumentMimeType() })
      downloadBlob(blob, targetName)
      recordEditAudit('save as', { format: file.type, size: blob.size }, false)
      showSuccessToast(`${targetName} enregistré avec succès`, file.type)
    } catch (err) {
      console.error('Save as failed:', err)
      showErrorToast('Impossible d\'enregistrer le fichier.')
    }
  }

  const handleExport = async () => {
    if (file.workflow === 'pdf-to-word' && file.type === 'docx') {
      try {
        const doc = await PDFDocument.create()
        const font = await doc.embedFont(StandardFonts.Helvetica)
        const pageDimensions = getPageDimensions(file.type, pageOrientation, pageSize)
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
        recordEditAudit('export', { format: 'pdf', size: blob.size }, false)
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
        recordEditAudit('export', { format: file.type, size: blob.size }, false)
        showSuccessToast(`${file.name} exported successfully!`, file.type)
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
  }

  const handleRotateRight = () => {
    setRotation(prev => prev + 90)
  }

  const handleResetRotation = () => {
    setRotation(0)
  }

  const handleResetPosition = () => {
    setPosition({ x: 0, y: 0 })
  }

  useEffect(() => {
    const container = imageContainerRef.current
    if (container) {
      container.style.transform = `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg)`
    }
  }, [position, rotation])

  const handleTogglePan = () => {
    setIsPanActive((active) => !active)
    setIsPanning(false)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isPanActive) return
    setIsPanning(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanActive && isPanning) {
      const newPosition = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }
      setPosition(newPosition)
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
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

    // Try to extract active word highlight or current selection text
    let highlightText = ''
    try {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const node = sel.anchorNode
        const el = (node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement)?.closest('.word-edit-highlight')
        if (el) {
          highlightText = el.textContent?.trim() || ''
        }
      }
      if (!highlightText) {
        const highlights = (root || document).querySelectorAll<HTMLElement>('.word-edit-highlight')
        if (highlights.length > 0) {
          highlightText = highlights[highlights.length - 1].textContent?.trim() || ''
        }
      }
    } catch {}

    const textPayload = data || highlightText

    if (event.inputType === 'insertText') {
      return {
        label: 'Frappe',
        steps: 1,
        kind: 'typing',
        text: textPayload || 'Frappe',
        ...snapshotFields,
      }
    }
    if (event.inputType === 'insertParagraph') {
      return {
        label: 'Frappe paragraphe',
        steps: 1,
        kind: 'other',
        text: highlightText || '↵ Nouveau paragraphe',
        ...snapshotFields,
      }
    }
    if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
      return {
        label: 'Suppression',
        steps: 1,
        kind: 'delete',
        text: highlightText || '⌫ Suppression',
        ...snapshotFields,
      }
    }
    if (event.inputType === 'insertFromPaste') {
      return {
        label: 'Collage',
        steps: 1,
        kind: 'paste',
        text: data || highlightText || '📋 Collage',
        ...snapshotFields,
      }
    }
    if (event.inputType?.startsWith('format')) {
      return {
        label: 'Correction automatique',
        steps: 1,
        kind: 'format',
        text: highlightText || '🎨 Format',
        ...snapshotFields,
      }
    }
    return {
      label: 'Modification du document',
      steps: 1,
      kind: 'other',
      text: textPayload || '✏️ Modification',
      ...snapshotFields,
    }
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
      recordEditAudit(entry.label, {
        inputType: (event as InputEvent).inputType || 'input',
        historyKind: entry.kind,
        content: entry.text || '',
        timestamp: new Date().toISOString(),
      })
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
  }, [file.id, file.name, displayType])

  useEffect(() => {
    const handleEditorHistorySnapshot = (event: Event) => {
      if (suppressHistoryRef.current) return

      const detail = (event as CustomEvent<{
        root?: HTMLElement
        beforeHtml?: string
        afterHtml?: string
        label?: string
        applyUndo?: () => void
        applyRedo?: () => void
      }>).detail
      const root = detail?.root
      const hasHtmlSnapshot =
        root && document.contains(root) && detail.beforeHtml !== undefined && detail.afterHtml !== undefined
      const hasExternalSnapshot = detail?.applyUndo && detail?.applyRedo
      if (!hasHtmlSnapshot && !hasExternalSnapshot) return
      if (hasHtmlSnapshot && detail.beforeHtml === detail.afterHtml) return

      const now = Date.now()
      const entry: UndoHistoryEntry = {
        label: detail.label || 'Modification de forme',
        steps: 1,
        kind: 'tool',
        root,
        beforeHtml: detail.beforeHtml,
        afterHtml: detail.afterHtml,
        applyUndo: detail.applyUndo,
        applyRedo: detail.applyRedo,
        startedAt: now,
        updatedAt: now,
      }

      if (root && detail.afterHtml !== undefined) {
        editableHtmlSnapshotsRef.current.set(root, detail.afterHtml)
      }
      beforeInputSnapshotRef.current = null
      setUndoHistory((previous) => [entry, ...previous].slice(0, 12))
      setRedoHistory([])
      recordEditAudit(entry.label, {
        historyKind: entry.kind,
        hasDomSnapshot: Boolean(hasHtmlSnapshot),
        timestamp: new Date().toISOString(),
      })
    }

    window.addEventListener('editor-history-snapshot', handleEditorHistorySnapshot)
    return () => window.removeEventListener('editor-history-snapshot', handleEditorHistorySnapshot)
  }, [file.id, file.name, displayType])

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
    const applyExternalSnapshot = direction === 'undo' ? entry.applyUndo : entry.applyRedo
    if (applyExternalSnapshot) {
      suppressHistoryRef.current = true
      applyExternalSnapshot()
      beforeInputSnapshotRef.current = null
      window.setTimeout(() => {
        suppressHistoryRef.current = false
      }, 0)
      return true
    }

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
    const canRestoreExternalSnapshots = moved.length > 0 && moved.every((entry) => entry.applyUndo)
    const canRestoreHtmlSnapshots = moved.length > 0 && moved.every(
      (entry) =>
        entry.root &&
        entry.root === oldestEntry.root &&
        entry.beforeHtml !== undefined &&
        document.contains(entry.root)
    )

    if (canRestoreExternalSnapshots) {
      moved.forEach((entry) => restoreHistorySnapshot(entry, 'undo'))
    } else if (canRestoreHtmlSnapshots) {
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

    const canRestoreSnapshot =
      latest.applyUndo ||
      (
        latest.kind === 'tool' &&
        latest.root &&
        latest.beforeHtml !== undefined &&
        document.contains(latest.root)
      )
    if (canRestoreSnapshot) {
      restoreHistorySnapshot(latest, 'undo')
      setUndoHistory((previous) => previous.slice(1))
      setRedoHistory((previous) => [latest, ...previous].slice(0, 12))
      return
    }

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

  useEffect(() => {
    const handleTriggerUndo = () => {
      handleUndoLast()
    }
    window.addEventListener('editor-trigger-undo', handleTriggerUndo)
    return () => window.removeEventListener('editor-trigger-undo', handleTriggerUndo)
  }, [handleUndoLast])

  const handleRedo = () => {
    const [restored] = redoHistory
    if (!restored) return

    const canRestoreSnapshot =
      restored.applyRedo ||
      (restored.root && restored.afterHtml !== undefined && document.contains(restored.root))

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
    setShapeFillColor(color)
    window.dispatchEvent(
      new CustomEvent('editor-shape-fill-change', {
        detail: { color },
      })
    )

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
    onShare: () => setShowShareDialog(true),
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
    // Image-specific actions
    onRotateLeft: file.type === 'image' ? handleRotateLeft : undefined,
    onRotateRight: file.type === 'image' ? handleRotateRight : undefined,
    onResetRotation: file.type === 'image' ? handleResetRotation : undefined,
    onTogglePan: file.type === 'image' ? handleTogglePan : undefined,
    onResetPosition: file.type === 'image' ? handleResetPosition : undefined,
    isPanActive,
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearCurrentFile, handleRedo, handleUndo])

  const imageRibbonActions: ImageEditorRibbonActions = {
    onSetTool: () => {
      // Image editor handles this internally
    },
    activeTool: 'select',
    onSetBrushSize: () => {},
    onSetBrushOpacity: () => {},
    onSetBrushColor: () => {},
    brushSize: 6,
    brushOpacity: 100,
    brushColor: '#000000',
    onSetFillColor: () => {},
    onSetStrokeColor: () => {},
    onSetStrokeWidth: () => {},
    fillColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 2,
    onZoomIn: () => {},
    onZoomOut: () => {},
    zoom: 100,
    onRotateLeft: () => {},
    onRotateRight: () => {},
    onFlipHorizontal: () => {},
    onFlipVertical: () => {},
    onCrop: () => {},
    onUndo: () => {},
    onRedo: () => {},
    onDeleteSelected: () => {},
    onExport: () => {},
  }

  const lastEditLabel = lastEdit
    ? `${lastEdit.action} by ${lastEdit.editorName || lastEdit.userId || 'Unknown'}`
    : editStatusLoaded
      ? 'No recorded edits'
      : 'Loading edit history...'
  const lastEditTimeLabel = lastEdit ? formatEditTime(lastEdit.createdAt) : ''
  const editCountLabel = editEvents.length === 1 ? '1 edit' : `${editEvents.length} edits`
  const shareCountLabel = shares.length === 1 ? '1 shared user' : `${shares.length} shared users`
  const filteredShareUsers = shareUsers
    .filter((user) => {
      const query = shareRecipient.trim().toLowerCase()
      return (
        user.displayName.toLowerCase().includes(query) ||
        (user.email || '').toLowerCase().includes(query)
      )
    })
    .slice(0, 5)

  return (
    <div className="w-full h-full flex flex-col" data-editor-shell="true" style={{ backgroundColor: displayType === 'image' ? '#111827' : 'white' }}>
      {displayType === 'image' ? (
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                <span>{displayType?.toUpperCase()}</span>
                <span className="text-gray-300">|</span>
                <span>ID {file.id}</span>
                <span className="text-gray-300">|</span>
                <span>{lastEditLabel}</span>
                {lastEditTimeLabel && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span>{lastEditTimeLabel}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowEditHistory(true)}
              className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 font-medium text-gray-700 shadow-sm hover:bg-gray-100"
              title="View edit history"
            >
              <History size={16} />
              {editCountLabel}
            </button>
            <button
              onClick={() => setShowShareDialog(true)}
              className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 font-medium text-gray-700 shadow-sm hover:bg-gray-100"
              title="Share file"
            >
              <Share2 size={16} />
              Share
            </button>
          </div>
        </>
      )}

      {/* Back button for images */}
      {displayType === 'image' && (
        <div data-print-hidden="true" className="flex items-center gap-2 border-b border-gray-700 bg-gray-800 px-4 py-2 text-xs text-gray-400 shadow-sm">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 rounded px-3 py-2 font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#ff9500' }}
            title="Back"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <div className="flex-1 px-2">
            <div className="font-semibold text-gray-200">{file.name}</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
              <span>{displayType?.toUpperCase()}</span>
              <span className="text-gray-600">|</span>
              <span>ID {file.id}</span>
              <span className="text-gray-600">|</span>
              <span>{lastEditLabel}</span>
              {lastEditTimeLabel && (
                <>
                  <span className="text-gray-600">|</span>
                  <span>{lastEditTimeLabel}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowEditHistory(true)}
            className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 font-medium text-gray-200 shadow-sm hover:bg-gray-700"
            title="View edit history"
          >
            <History size={16} />
            {editCountLabel}
          </button>
          <button
            onClick={() => setShowShareDialog(true)}
            className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 font-medium text-gray-200 shadow-sm hover:bg-gray-700"
            title="Share file"
          >
            <Share2 size={16} />
            Share
          </button>
        </div>
      )}

      {/* Editor content */}
      <div
        data-print-content="true"
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
      cursor: isPanActive ? (isPanning ? 'grabbing' : 'grab') : 'default',
      transition: 'transform 0.2s ease',
      width: '100%',
      height: '100%'
    }}
    onMouseDown={handleMouseDown}
  >
    <ImageEditor file={file} />  {/* This is correct */}
  </div>
)}
        {file.type === 'whiteboard' && <WhiteboardEditor file={file} />}
      </div>

      {displayType !== 'image' && (
        <div data-print-hidden="true">
          <StatusBar file={file} />
        </div>
      )}
      {showShareDialog && (
        <div data-print-hidden="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-md bg-white text-gray-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <div className="font-semibold">Share file</div>
                <div className="mt-1 truncate text-xs text-gray-500">{file.name} - {shareCountLabel}</div>
              </div>
              <button
                onClick={() => setShowShareDialog(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                title="Close share dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <label className="block text-sm font-medium text-gray-700">
                User email
                <input
                  value={shareRecipient}
                  onChange={(event) => setShareRecipient(event.target.value)}
                  className="mt-1 h-10 w-full rounded border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="user@example.com"
                  type="email"
                />
              </label>

              {filteredShareUsers.length > 0 && (
                <div className="-mt-2 flex flex-wrap gap-2">
                  {filteredShareUsers.map((user) => (
                    <button
                      key={user.userId}
                      onClick={() => setShareRecipient(user.email || user.userId)}
                      className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      type="button"
                    >
                      {user.email || user.displayName}
                    </button>
                  ))}
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700">
                Permission
                <select
                  value={sharePermission}
                  onChange={(event) => setSharePermission(event.target.value as 'view' | 'edit')}
                  className="mt-1 h-10 w-full rounded border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
              </label>

              <button
                onClick={handleShareFile}
                disabled={isSharing}
                className="flex h-10 w-full items-center justify-center gap-2 rounded bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Share2 size={16} />
                {isSharing ? 'Sharing...' : 'Share'}
              </button>

              {(shareResultMessage || lastShareAccessUrl) && (
                <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  {shareResultMessage && <div>{shareResultMessage}</div>}
                  {lastShareAccessUrl && (
                    <a className="mt-1 block break-all font-medium underline" href={lastShareAccessUrl} target="_blank" rel="noreferrer">
                      {lastShareAccessUrl}
                    </a>
                  )}
                </div>
              )}

              <div className="border-t border-gray-200 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Shared users</span>
                  <button
                    onClick={async () => {
                      const result = await getSenderShareAccess(file.id)
                      if (result?.accessUrl) {
                        window.open(result.accessUrl, '_blank', 'noreferrer')
                      } else {
                        showErrorToast('No shared link available. Share the file first.')
                      }
                    }}
                    className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    title="Open this file via shared link"
                    type="button"
                  >
                    Open my shared link
                  </button>
                </div>
                {shares.length === 0 ? (
                  <div className="text-sm text-gray-500">No users yet.</div>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {shares.map((share) => (
                      <div key={share._id} className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">{share.sharedWith.email || share.sharedWith.displayName}</div>
                          <div className="text-xs text-gray-500">by {share.sharedBy.displayName} · {share.permission === 'edit' ? 'Can edit' : 'Can view'}</div>
                        </div>
                        <button
                          onClick={() => {
                            const url = getShareEditorUrl(share)
                            if (url) window.open(url, '_blank', 'noreferrer')
                            else showErrorToast('No access link for this share.')
                          }}
                          className="shrink-0 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          type="button"
                          title="Open file as this user"
                        >
                          Open
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
      {showEditHistory && (() => {
        const modalModifiedWords = Array.from(document.querySelectorAll<HTMLElement>('.word-edit-highlight'))
          .map((el, i) => ({
            id: `mod-word-${i}`,
            text: el.textContent?.trim() || '',
            by: el.dataset.modifiedBy || 'Inconnu',
            at: el.dataset.modifiedAt || '',
            element: el,
          }))
          .filter((w) => w.text.length > 0)

        return (
          <div data-print-hidden="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white text-gray-900 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="font-semibold text-base flex items-center gap-2">
                    Edit history
                    {modalModifiedWords.length > 0 && (
                      <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-bold text-yellow-950">
                        {modalModifiedWords.length} mots modifiés
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-gray-500">{file.name} - ID {file.id}</div>
                </div>
                <button
                  onClick={() => setShowEditHistory(false)}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  title="Close edit history"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[65vh] overflow-y-auto px-5 py-3 space-y-4">
                {/* ── Section: Mots modifiés (Surlignés en jaune) ── */}
                {modalModifiedWords.length > 0 && (
                  <div className="rounded-xl border border-yellow-300/80 bg-yellow-50/70 p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-yellow-200/80 pb-2 mb-2">
                      <span className="text-xs font-bold text-yellow-900 flex items-center gap-1.5">
                        ✏️ Mots modifiés dans le document
                      </span>
                      <span className="text-[10px] text-yellow-700 font-medium">
                        {modalModifiedWords.length} surlignage{modalModifiedWords.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                      {modalModifiedWords.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setShowEditHistory(false)
                            w.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            w.element.style.outline = '2px solid #f59e0b'
                            setTimeout(() => { w.element.style.outline = '' }, 1400)
                          }}
                          className="group flex items-center gap-1 rounded bg-yellow-200/90 border border-yellow-400/60 px-2 py-0.5 text-xs font-semibold text-amber-950 transition-all hover:bg-yellow-300 hover:shadow-sm"
                          title={`Modifié par ${w.by} — cliquer pour localiser`}
                        >
                          <span>{w.text}</span>
                          <span className="text-[9px] font-normal text-yellow-700 group-hover:text-yellow-900">({w.by})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Section: Historique des événements ── */}
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Activité récente</div>
                  {editEvents.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-500">No recorded edits for this file.</div>
                  ) : (
                    <div className="space-y-2">
                      {editEvents.map((event) => {
                        const contentSnippet = getEditContent(event)
                        const metaLabel = formatEditMetadata(event)
                        return (
                          <div key={event._id} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-gray-300 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {/* Action + kind badge */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{event.action}</span>
                                  {metaLabel && (
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 uppercase tracking-wide">{metaLabel}</span>
                                  )}
                                </div>
                                {/* Editor name */}
                                <div className="mt-1 text-xs text-gray-500">
                                  by <span className="font-medium text-gray-700">{event.editorName || event.userId || 'Unknown'}</span>
                                </div>
                                {/* Content snippet with yellow highlight styling */}
                                {contentSnippet && (
                                  <div className="mt-2 flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-amber-700 uppercase">Mot :</span>
                                    <span
                                      className="rounded border border-amber-300/80 px-2 py-0.5 font-mono text-xs font-semibold text-amber-950 shadow-2xs break-all"
                                      style={{ background: 'rgba(250,204,21,0.35)' }}
                                    >
                                      &ldquo;{contentSnippet}&rdquo;
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Time */}
                              <div className="shrink-0 text-right">
                                <div className="text-xs font-medium text-gray-500">{formatEditTime(event.createdAt)}</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

