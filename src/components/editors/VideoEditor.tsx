import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { DocumentFile } from '../../store'
import { CheckCircle2, Minus, Plus, Trash2, Type, X, ZoomIn } from 'lucide-react'
import ImageEditorCanvas, { type ImageEditorCanvasHandle, type ImageEditorObjectType, type ImageObjectStyle, type VideoExportQuality } from '../ImageEditorCanvas'
import { getThemeForFileType } from '../../utils'
import type { ImageDrawingTool, ShapeTextAlign, ShapeTextVerticalAlign } from '../ImageEditorRibbon'
import {
  buildEstimatedCaptionCues,
  getActiveCaptionCueIndex as findActiveCaptionCueIndex,
  normalizeCaptionCues,
  replaceCaptionText,
  type CaptionCue,
} from '../../captions'

interface VideoEditorProps {
  file: DocumentFile
  activeTool: ImageDrawingTool
  brushSize: number
  brushOpacity: number
  brushColor: string
  backgroundColor: string
  fillColor: string
  strokeColor: string
  strokeWidth: number
  shapeRotation: number
  textFontFamily: string
  textFontSize: number
  textBold: boolean
  textItalic: boolean
  textColor: string
  textRotation: number
  shapeText: string
  shapeTextAlign: ShapeTextAlign
  shapeTextVerticalAlign: ShapeTextVerticalAlign
  elementStartTime: number
  elementEndTime: number
  imageBorderRadius?: number
  imageBorderWidth?: number
  imageBorderColor?: string
  imageOpacity?: number
  selectedObjectId?: string
  exportQuality: VideoExportQuality
  onObjectSelect?: (id: string | undefined, type?: ImageEditorObjectType, style?: ImageObjectStyle) => void
  onBackgroundFill?: (color: string) => void
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void
  onMediaTimeChange?: (currentTime: number, duration: number, playing: boolean) => void
}

export interface VideoEditorHandle {
  undo: () => void
  redo: () => void
  deleteSelectedObject: () => void
  rotateLeft: () => void
  rotateRight: () => void
  flipHorizontal: () => void
  flipVertical: () => void
  setSelectedShapeDimensions: (width?: number, height?: number) => void
  setSelectedImageStyle: (style: { borderRadius?: number; borderWidth?: number; borderColor?: string; opacity?: number }) => void
  setSelectedObjectTiming: (startTime?: number, endTime?: number) => void
  exportImage: (format: 'png' | 'jpg' | 'pdf' | 'webm') => void
  exportVideo: () => Promise<void>
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

const getImageMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  }
  return mimeTypes[ext || ''] || 'image/png'
}

const getBackendBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_BACKEND_URL
  if (configuredUrl) return configuredUrl.replace(/\/$/, '')
  return `${window.location.protocol}//${window.location.hostname}:5000`
}

const downloadCanvas = (canvas: HTMLCanvasElement, filename: string, format: 'png' | 'jpg') => {
  canvas.toBlob(
    (blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${filename}.${format}`
      anchor.click()
      URL.revokeObjectURL(url)
    },
    format === 'jpg' ? 'image/jpeg' : 'image/png',
    0.92
  )
}

const triggerDownload = (url: string, filename: string) => {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

const getExportQualityLabel = (quality: VideoExportQuality) => ({
  hd: 'HD',
  fullHd: 'Full HD',
  '4k': '4K',
}[quality])

const CAPTION_LANGUAGES = [
  { value: '', label: 'Auto language' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'tr', label: 'Türkçe' },
]

const getInitialCaptionLanguage = () => {
  const browserLanguage = navigator.language.split('-')[0].toLowerCase()
  return CAPTION_LANGUAGES.some((language) => language.value === browserLanguage) ? browserLanguage : ''
}

const formatCaptionTime = (time: number) => {
  const safeTime = Math.max(0, time || 0)
  const minutes = Math.floor(safeTime / 60)
  const seconds = Math.floor(safeTime % 60)
  const tenths = Math.floor((safeTime % 1) * 10)
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
}

interface ExportJob {
  id: string
  filename: string
  progress: number
  status: 'downloading' | 'completed' | 'failed'
  downloadUrl?: string
}

const VideoEditor = forwardRef<VideoEditorHandle, VideoEditorProps>(function VideoEditor(
  {
    file,
    activeTool,
    brushSize,
    brushOpacity,
    brushColor,
    backgroundColor,
    fillColor,
    strokeColor,
    strokeWidth,
    shapeRotation,
    textFontFamily,
    textFontSize,
    textBold,
    textItalic,
    textColor,
    textRotation,
    shapeText,
    shapeTextAlign,
    shapeTextVerticalAlign,
    elementStartTime,
    elementEndTime,
    imageBorderRadius,
    imageBorderWidth,
    imageBorderColor,
    imageOpacity,
    selectedObjectId,
    exportQuality,
    onObjectSelect,
    onBackgroundFill,
    onHistoryChange,
    onMediaTimeChange,
  },
  ref
) {
  const [videoUrl, setVideoUrl] = useState('')
  const [convertedImageUrl, setConvertedImageUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const [pages, setPages] = useState([0])
  const [currentPage, setCurrentPage] = useState(0)
  const [pageDurations, setPageDurations] = useState<number[]>([5])
  const [videoZoom, setVideoZoom] = useState(100)
  const [showPageControls, setShowPageControls] = useState(false)
  const [captionText, setCaptionText] = useState('')
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([])
  const [activeCaptionTime, setActiveCaptionTime] = useState(0)
  const [selectedCaptionCueIndex, setSelectedCaptionCueIndex] = useState<number | null>(null)
  const [captionVisible, setCaptionVisible] = useState(false)
  const [captionSize, setCaptionSize] = useState(28)
  const [captionColor, setCaptionColor] = useState('#ffffff')
  const [captionFont, setCaptionFont] = useState('Arial')
  const [captionLanguage, setCaptionLanguage] = useState(getInitialCaptionLanguage)
  const [extractingCaptions, setExtractingCaptions] = useState(false)
  const [captionError, setCaptionError] = useState('')
  const canvasRef = useRef<ImageEditorCanvasHandle | null>(null)
  const pageCanvasRefs = useRef<Array<ImageEditorCanvasHandle | null>>([])
  const activeUrlRef = useRef('')
  const exportUrlRef = useRef('')
  const convertedImageUrlRef = useRef('')
  const transcriptionAbortRef = useRef<AbortController | null>(null)
  const themeColor = getThemeForFileType(file.type)

  useEffect(() => {
    canvasRef.current = pageCanvasRefs.current[currentPage]
  }, [currentPage, pages.length])

  const getPageDuration = (pageIndex: number) => {
    if (pageIndex > 0 || file.convertedImageContent) return 5
    return Math.max(0.1, pageDurations[0] || 5)
  }

  const getPageStartOffset = (pageIndex: number) => (
    pages.slice(0, pageIndex).reduce((total, _page, index) => total + getPageDuration(index), 0)
  )

  const getTotalTimelineDuration = () => (
    pages.reduce((total, _page, index) => total + getPageDuration(index), 0)
  )

  const addEmptyPage = () => {
    setPages((items) => [...items, Date.now()])
    setPageDurations((items) => [...items, 5])
    setCurrentPage(pages.length)
  }

  const deleteCurrentPage = () => {
    if (pages.length <= 1) return
    setPages((items) => items.filter((_, index) => index !== currentPage))
    setPageDurations((items) => items.filter((_, index) => index !== currentPage))
    setCurrentPage((page) => Math.max(0, page - 1))
  }

  const extractEmbeddedCaptions = async () => {
    if (!videoUrl || extractingCaptions) return []
    const probe = document.createElement('video')
    probe.src = videoUrl
    probe.preload = 'metadata'
    try {
      await new Promise<void>((resolve, reject) => {
        probe.onloadedmetadata = () => resolve()
        probe.onerror = () => reject(new Error('Could not read this video'))
      })

      const tracks = Array.from(probe.textTracks || [])
      tracks.forEach((track) => {
        track.mode = 'hidden'
      })
      await new Promise((resolve) => window.setTimeout(resolve, 250))

      return normalizeCaptionCues(tracks.flatMap((track) => (
        Array.from(track.cues || []).map((cue) => {
          const textCue = cue as VTTCue
          return {
            start: textCue.startTime,
            end: textCue.endTime,
            text: textCue.text,
          }
        })
      )))
    } finally {
      probe.removeAttribute('src')
      probe.load()
    }
  }

  const getActiveCaptionCueIndex = () => currentPage === 0
    ? findActiveCaptionCueIndex(captionCues, activeCaptionTime)
    : -1

  const getEditableCaptionIndex = () => {
    if (selectedCaptionCueIndex !== null && captionCues[selectedCaptionCueIndex]) return selectedCaptionCueIndex
    return getActiveCaptionCueIndex()
  }

  const getEditableCaptionText = () => {
    const editableIndex = getEditableCaptionIndex()
    return editableIndex >= 0 ? captionCues[editableIndex].text : captionText
  }

  const updateCaptionText = (text: string) => {
    const editableIndex = getEditableCaptionIndex()
    if (editableIndex < 0) {
      setCaptionText(text)
      return
    }
    setCaptionCues((items) => items.map((cue, index) => (
      index === editableIndex ? replaceCaptionText(cue, text) : cue
    )))
    setCaptionText((textValue) => captionCues.length > 0 ? textValue : text)
    setCaptionError('')
  }

  const transcribeVideoAudio = async (signal: AbortSignal) => {
    const blob = new Blob([file.content], { type: getVideoMimeType(file.name) })
    const formData = new FormData()
    formData.append('file', blob, file.name || 'video.webm')
    if (captionLanguage) formData.append('language', captionLanguage)

    let response: Response
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/transcribe-video`, {
        method: 'POST',
        body: formData,
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new Error('The transcription backend disconnected. Restart backend/app.py, then try again with a shorter video or a smaller local Whisper model.')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Could not transcribe this video audio. Make sure the backend is running on localhost:5000.')
    }
    const captions = normalizeCaptionCues(data.captions)
    const text = String(data.text || '').trim()
    return {
      text,
      captions: captions.length > 0 ? captions : buildEstimatedCaptionCues(text, getPageDuration(0)),
    }
  }

  const extractCaptions = async () => {
    if (!videoUrl || extractingCaptions) return
    transcriptionAbortRef.current?.abort()
    const controller = new AbortController()
    transcriptionAbortRef.current = controller
    setExtractingCaptions(true)
    setCaptionVisible(true)
    setCaptionError('')

    try {
      const embeddedCues = await extractEmbeddedCaptions()
      if (embeddedCues.length > 0) {
        setCaptionCues(embeddedCues)
        setSelectedCaptionCueIndex(0)
        setCaptionText(embeddedCues.map((cue) => cue.text).join(' '))
        window.requestAnimationFrame(() => canvasRef.current?.seekTo(embeddedCues[0].start + 0.01))
        return
      }

      const spoken = await transcribeVideoAudio(controller.signal)
      if (controller.signal.aborted) return
      setCaptionCues(spoken.captions)
      setSelectedCaptionCueIndex(spoken.captions.length > 0 ? 0 : null)
      setCaptionText(spoken.text || 'No spoken words were detected in this video audio.')
      if (spoken.captions.length > 0) {
        window.requestAnimationFrame(() => canvasRef.current?.seekTo(spoken.captions[0].start + 0.01))
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const message = error instanceof Error ? error.message : 'Could not transcribe this video audio.'
      setCaptionCues([])
      setSelectedCaptionCueIndex(null)
      setCaptionError(message)
      setCaptionVisible(false)
    } finally {
      if (transcriptionAbortRef.current === controller) {
        transcriptionAbortRef.current = null
        setExtractingCaptions(false)
      }
    }
  }

  const exportVideo = async () => {
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'video'
    const filename = `${baseName}-edited-${exportQuality}.webm`
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = ''
    }
    setExportJob({
      id: jobId,
      filename,
      progress: 2,
      status: 'downloading',
    })

    const blob = await canvasRef.current?.exportVideo({
      quality: exportQuality,
      onProgress: (progress) => {
        setExportJob((current) => current?.id === jobId
          ? { ...current, progress: Math.max(current.progress, progress) }
          : current
        )
      },
    })

    if (!blob) {
      setExportJob((current) => current?.id === jobId
        ? { ...current, progress: 100, status: 'failed' }
        : current
      )
      return
    }

    const url = URL.createObjectURL(blob)
    exportUrlRef.current = url
    triggerDownload(url, filename)
    setExportJob((current) => current?.id === jobId
      ? { ...current, progress: 100, status: 'completed', downloadUrl: url }
      : current
    )
  }

  const exportImage = (format: 'png' | 'jpg' | 'pdf' | 'webm') => {
    if (format === 'webm') {
      void exportVideo()
      return
    }

    const canvas = canvasRef.current?.exportCanvas()
    if (!canvas) return

    const baseName = `${file.name.replace(/\.[^/.]+$/, '') || 'video'}-frame`
    if (format === 'pdf') {
      const imageData = canvas.toDataURL('image/png')
      const printWindow = window.open('', '_blank')
      if (!printWindow) return
      printWindow.document.write(`
        <html>
          <head><title>${baseName}</title></head>
          <body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;">
            <img src="${imageData}" style="max-width:100%;max-height:100vh;object-fit:contain;" />
            <script>window.onload=()=>window.print();<\/script>
          </body>
        </html>
      `)
      printWindow.document.close()
      return
    }

    downloadCanvas(canvas, baseName, format)
  }

  useImperativeHandle(ref, () => ({
    undo: () => canvasRef.current?.undo(),
    redo: () => canvasRef.current?.redo(),
    deleteSelectedObject: () => canvasRef.current?.deleteSelectedObject(),
    rotateLeft: () => undefined,
    rotateRight: () => undefined,
    flipHorizontal: () => undefined,
    flipVertical: () => undefined,
    setSelectedShapeDimensions: (width, height) => canvasRef.current?.setSelectedShapeDimensions(width, height),
    setSelectedImageStyle: (style) => canvasRef.current?.setSelectedImageStyle(style),
    setSelectedObjectTiming: (startTime, endTime) => canvasRef.current?.setSelectedObjectTiming(startTime, endTime),
    exportVideo,
    exportImage,
  }))

  useEffect(() => {
    transcriptionAbortRef.current?.abort()
    transcriptionAbortRef.current = null
    setExtractingCaptions(false)
    setCaptionCues([])
    setCaptionText('')
    setCaptionError('')
    setSelectedCaptionCueIndex(null)
    setActiveCaptionTime(0)
    setCaptionVisible(false)
    if (!file.content) {
      setError('No video content found')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const blob = new Blob([file.content], { type: getVideoMimeType(file.name) })
    const url = URL.createObjectURL(blob)
    if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current)
    activeUrlRef.current = url
    setVideoUrl(url)
    if (file.convertedImageContent) {
      const convertedUrl = URL.createObjectURL(new Blob(
        [file.convertedImageContent],
        { type: getImageMimeType(file.convertedImageName || '') }
      ))
      convertedImageUrlRef.current = convertedUrl
      setConvertedImageUrl(convertedUrl)
    } else {
      setConvertedImageUrl('')
    }
    setLoading(false)

    return () => {
      transcriptionAbortRef.current?.abort()
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current)
        activeUrlRef.current = ''
      }
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current)
        exportUrlRef.current = ''
      }
      if (convertedImageUrlRef.current) {
        URL.revokeObjectURL(convertedImageUrlRef.current)
        convertedImageUrlRef.current = ''
      }
      setConvertedImageUrl('')
    }
  }, [file])

  const closeExportJob = () => {
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = ''
    }
    setExportJob(null)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100">
        <div className="text-slate-500">Loading video...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain bg-slate-100">
      <div
        data-video-stage="true"
        className="relative flex h-full min-h-[640px] shrink-0 items-center justify-center overflow-auto"
        style={{ backgroundColor }}
      >
        {pages.map((pageId, pageIndex) => (
          <div
            key={pageId}
            className={pageIndex === currentPage ? 'block h-full w-full' : 'hidden'}
            style={{
              transform: `scale(${videoZoom / 100})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease',
            }}
          >
          <ImageEditorCanvas
            ref={(handle) => {
              pageCanvasRefs.current[pageIndex] = handle
              if (pageIndex === currentPage) canvasRef.current = handle
            }}
            imageUrl={videoUrl}
            hideBaseMedia={pageIndex > 0 || Boolean(file.convertedImageContent)}
            timelineDurationOverride={pageIndex > 0 || Boolean(file.convertedImageContent) ? 5 : undefined}
            timelineStartOffset={getPageStartOffset(pageIndex)}
            timelineTotalDuration={getTotalTimelineDuration()}
            syntheticTimeline={pageIndex > 0 || Boolean(file.convertedImageContent)}
            initialTimedImageUrl={pageIndex === 0 ? convertedImageUrl || undefined : undefined}
            initialTimedImageName={pageIndex === 0 ? file.convertedImageName : undefined}
            captionOverlay={{
              text: captionCues.length === 0 ? captionText : '',
              cues: pageIndex === 0 ? captionCues : [],
              visible: captionVisible,
              loading: extractingCaptions,
              onToggle: pageIndex === 0 ? () => {
                if (captionVisible) {
                  setCaptionVisible(false)
                } else if (captionCues.length > 0 || captionText.trim()) {
                  setCaptionVisible(true)
                } else {
                  void extractCaptions()
                }
              } : undefined,
              color: captionColor,
              fontFamily: captionFont,
              fontSize: captionSize,
            }}
            mediaType="video"
            activeTool={activeTool}
            brushSize={brushSize}
            brushOpacity={brushOpacity}
            brushColor={brushColor}
            backgroundColor={backgroundColor}
            fillColor={fillColor}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            shapeRotation={shapeRotation}
            textFontFamily={textFontFamily}
            textFontSize={textFontSize}
            textBold={textBold}
            textItalic={textItalic}
            textColor={textColor}
            textRotation={textRotation}
            shapeText={shapeText}
            shapeTextAlign={shapeTextAlign}
            shapeTextVerticalAlign={shapeTextVerticalAlign}
            elementStartTime={elementStartTime}
            elementEndTime={elementEndTime}
            imageBorderRadius={imageBorderRadius}
            imageBorderWidth={imageBorderWidth}
            imageBorderColor={imageBorderColor}
            imageOpacity={imageOpacity}
            selectedObjectId={selectedObjectId}
            onObjectSelect={onObjectSelect}
            onBackgroundFill={onBackgroundFill}
            onHistoryChange={onHistoryChange}
            onMediaTimeChange={pageIndex === currentPage ? (currentTime, duration, playing) => {
              setActiveCaptionTime(currentTime)
              setPageDurations((items) => {
                const nextDuration = pageIndex === 0 && !file.convertedImageContent
                  ? Math.max(0.1, duration || 5)
                  : 5
                if (Math.abs((items[pageIndex] || 0) - nextDuration) < 0.05) return items
                const next = [...items]
                next[pageIndex] = nextDuration
                return next
              })
              onMediaTimeChange?.(getPageStartOffset(pageIndex) + currentTime, getTotalTimelineDuration(), playing)
            } : undefined}
          />
          </div>
        ))}
      </div>

      <div data-video-options="true" className="shrink-0 border-t border-slate-200 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Type size={17} className="text-teal-700" />
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            Use the CC button in the video player
          </div>
          <select value={captionLanguage} onChange={(event) => {
            setCaptionLanguage(event.target.value)
            setCaptionCues([])
            setCaptionText('')
            setCaptionError('')
            setSelectedCaptionCueIndex(null)
            setCaptionVisible(false)
          }} disabled={extractingCaptions} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 outline-none focus:border-teal-500" title="Spoken language">
            {CAPTION_LANGUAGES.map((language) => <option key={language.value || 'auto'} value={language.value}>{language.label}</option>)}
          </select>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold tabular-nums text-slate-600">
            {captionCues.length > 0
              ? `${formatCaptionTime(captionCues[getEditableCaptionIndex()]?.start || 0)} - ${formatCaptionTime(captionCues[getEditableCaptionIndex()]?.end || 0)}`
              : 'Manual caption'}
          </div>
          {captionCues.some((cue) => cue.timing === 'word') && (
            <div className="flex h-8 items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 text-[11px] font-bold text-teal-700" title="Each word uses its own audio timestamp">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shadow-[0_0_0_3px_rgba(20,184,166,0.15)]" />
              Word-synced
            </div>
          )}
          <input data-caption-editor="true" value={getEditableCaptionText()} onChange={(event) => updateCaptionText(event.target.value)} placeholder="Edit caption text..." className="h-8 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
          <select value={captionFont} onChange={(event) => setCaptionFont(event.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            {['Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'].map((font) => <option key={font}>{font}</option>)}
          </select>
          <input type="number" min="12" max="72" value={captionSize} onChange={(event) => setCaptionSize(Number(event.target.value))} className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-xs" title="Caption size" />
          <input type="color" value={captionColor} onChange={(event) => setCaptionColor(event.target.value)} className="h-8 w-9 cursor-pointer rounded border border-slate-200 bg-white p-1" title="Caption color" />
          <div className="ml-auto flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600">
            <ZoomIn size={14} className="text-teal-700" />
            <button type="button" onClick={() => setVideoZoom((value) => Math.max(50, value - 10))} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-100" title="Zoom out">
              <Minus size={14} />
            </button>
            <input
              type="range"
              min={50}
              max={200}
              step={10}
              value={videoZoom}
              onChange={(event) => setVideoZoom(Number(event.target.value))}
              className="h-1 w-28 cursor-pointer accent-teal-600"
              title="Video zoom"
            />
            <button type="button" onClick={() => setVideoZoom((value) => Math.min(200, value + 10))} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-100" title="Zoom in">
              <Plus size={14} />
            </button>
            <span className="w-10 text-right tabular-nums">{videoZoom}%</span>
          </div>
          <button type="button" onClick={() => setShowPageControls((visible) => !visible)} className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-600">
            {showPageControls ? 'Hide pages' : 'Show pages'}
          </button>
        </div>
        {captionError && (
          <div role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {captionError}
          </div>
        )}
        {captionCues.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {captionCues.map((cue, index) => {
              const activeIndex = getActiveCaptionCueIndex()
              const isActive = index === activeIndex
              const isSelected = index === getEditableCaptionIndex()
              return (
                <button
                  key={`${cue.start}-${cue.end}-${index}`}
                  type="button"
                  onClick={() => {
                    setSelectedCaptionCueIndex(index)
                    canvasRef.current?.seekTo(cue.start)
                  }}
                  data-caption-cue={index}
                  className={`max-w-[260px] shrink-0 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50 text-teal-900'
                      : isActive
                        ? 'border-slate-400 bg-slate-100 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="mb-1 font-semibold tabular-nums">{formatCaptionTime(cue.start)} - {formatCaptionTime(cue.end)}</div>
                  <div className="truncate">{cue.text}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {exportJob && (
        <div className="fixed right-6 top-24 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-[20px] border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <video
              src={videoUrl}
              muted
              playsInline
              preload="metadata"
              className="h-[54px] w-[72px] shrink-0 rounded-xl border border-slate-200 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    Edited Video - {getExportQualityLabel(exportQuality)}
                  </div>
                  <div className="truncate text-xs text-slate-500">{exportJob.filename}</div>
                </div>
                <button
                  type="button"
                  onClick={closeExportJob}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900"
                  title="Close download status"
                >
                  <X size={16} />
                </button>
              </div>

              {exportJob.status === 'downloading' ? (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Downloading</span>
                    <span>{Math.min(100, Math.round(exportJob.progress))}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(4, exportJob.progress))}%` }}
                    />
                  </div>
                </div>
              ) : exportJob.status === 'completed' ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Completed.</span>
                  {exportJob.downloadUrl && (
                    <a
                      href={exportJob.downloadUrl}
                      download={exportJob.filename}
                      className="font-semibold text-violet-600 underline-offset-2 hover:underline"
                    >
                      Download again
                    </a>
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm font-medium text-red-600">Could not export the edited video.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPageControls && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
          <button type="button" onClick={() => setCurrentPage((page) => Math.max(0, page - 1))} disabled={currentPage === 0} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40">
            Previous
          </button>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600" style={{ borderColor: themeColor }}>
            Page {currentPage + 1} / {pages.length}
          </div>
          <button type="button" onClick={() => setCurrentPage((page) => Math.min(pages.length - 1, page + 1))} disabled={currentPage >= pages.length - 1} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40">
            Next
          </button>
          <button type="button" onClick={addEmptyPage} className="flex h-8 items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white">
            <Plus size={15} /> New empty page
          </button>
          {currentPage > 0 && <button type="button" onClick={deleteCurrentPage} className="flex h-8 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600"><Trash2 size={14} /> Delete page</button>}
        </div>
      )}
    </div>
  )
})


export default VideoEditor
