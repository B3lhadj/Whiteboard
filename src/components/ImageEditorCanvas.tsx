import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Clock3, Image as ImageIcon, Maximize2, Move, Music, Pause, Play, Plus, RotateCw, Scissors, Volume2, VolumeX } from 'lucide-react'
import type { ImageDrawingTool, ShapeTextAlign, ShapeTextVerticalAlign } from './ImageEditorRibbon'
import type { CaptionCue } from '../captions'

interface Point {
  x: number
  y: number
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type ImageEditorObjectType = 'drawing' | 'shape' | 'text' | 'image'

interface CanvasObject {
  id: string
  type: ImageEditorObjectType
  points?: Point[]
  startPoint?: Point
  endPoint?: Point
  text?: string
  properties: {
    color: string
    fillColor?: string
    strokeColor?: string
    size: number
    opacity: number
    shapeType?: 'rectangle' | 'circle' | 'triangle' | 'line'
    fontFamily?: string
    fontSize?: number
    bold?: boolean
    italic?: boolean
    rotation?: number
    shapeText?: string
    shapeTextAlign?: ShapeTextAlign
    shapeTextVerticalAlign?: ShapeTextVerticalAlign
    startTime?: number
    endTime?: number
    imageUrl?: string
    imageName?: string
    borderRadius?: number
    borderWidth?: number
    borderColor?: string
  }
}

export interface ImageObjectStyle {
  color: string
  fillColor?: string
  strokeColor?: string
  size: number
  opacity: number
  width?: number
  height?: number
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  rotation?: number
  shapeText?: string
  shapeTextAlign?: ShapeTextAlign
  shapeTextVerticalAlign?: ShapeTextVerticalAlign
  startTime?: number
  endTime?: number
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
}

interface AudioTrackState {
  url: string
  name: string
  mode: 'original' | 'replacement'
  startTime: number
  endTime?: number
}

export type VideoExportQuality = 'hd' | 'fullHd' | '4k'

export interface VideoExportOptions {
  quality?: VideoExportQuality
  onProgress?: (progress: number) => void
}

interface ImageEditorCanvasProps {
  imageUrl: string
  hideBaseMedia?: boolean
  initialTimedImageUrl?: string
  initialTimedImageName?: string
  timelineDurationOverride?: number
  timelineStartOffset?: number
  timelineTotalDuration?: number
  syntheticTimeline?: boolean
  captionOverlay?: {
    text: string
    cues?: CaptionCue[]
    visible: boolean
    loading?: boolean
    onToggle?: () => void
    color: string
    fontFamily: string
    fontSize: number
  }
  mediaType?: 'image' | 'video'
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
  onObjectSelect?: (id: string | undefined, type?: CanvasObject['type'], style?: ImageObjectStyle) => void
  onCropComplete?: (rect: CropRect) => void
  onBackgroundFill?: (color: string) => void
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void
  onMediaTimeChange?: (currentTime: number, duration: number, playing: boolean) => void
}

export interface ImageEditorCanvasHandle {
  undo: () => void
  redo: () => void
  deleteSelectedObject: () => void
  setSelectedShapeDimensions: (width?: number, height?: number) => void
  setSelectedImageStyle: (style: { borderRadius?: number; borderWidth?: number; borderColor?: string; opacity?: number }) => void
  setSelectedObjectTiming: (startTime?: number, endTime?: number) => void
  clearObjects: () => void
  seekTo: (time: number) => void
  exportCanvas: (cropRect?: CropRect) => HTMLCanvasElement | null
  exportVideo: (options?: VideoExportOptions) => Promise<Blob | null>
  getCanvas: () => HTMLCanvasElement | null
}

const VIDEO_EXPORT_QUALITY_PRESETS: Record<VideoExportQuality, { maxWidth: number; maxHeight: number; videoBitsPerSecond: number }> = {
  hd: { maxWidth: 1280, maxHeight: 720, videoBitsPerSecond: 8_000_000 },
  fullHd: { maxWidth: 1920, maxHeight: 1080, videoBitsPerSecond: 14_000_000 },
  '4k': { maxWidth: 3840, maxHeight: 2160, videoBitsPerSecond: 35_000_000 },
}

type ImageShapeTool = 'rectangle' | 'circle' | 'triangle' | 'line'

const DRAWING_TOOLS: ImageDrawingTool[] = ['pencil', 'highlighter']
const SHAPE_TOOLS: ImageShapeTool[] = ['rectangle', 'circle', 'triangle', 'line']

const ImageEditorCanvas = forwardRef<ImageEditorCanvasHandle, ImageEditorCanvasProps>(
  (
    {
      imageUrl,
      hideBaseMedia = false,
      initialTimedImageUrl,
      initialTimedImageName,
      timelineDurationOverride,
      timelineStartOffset = 0,
      timelineTotalDuration,
      syntheticTimeline = false,
      captionOverlay,
      mediaType = 'image',
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
      imageBorderRadius = 12,
      imageBorderWidth = 0,
      imageBorderColor = '#ffffff',
      imageOpacity = 100,
      selectedObjectId,
      onObjectSelect,
      onCropComplete,
      onBackgroundFill,
      onHistoryChange,
      onMediaTimeChange,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageRef = useRef<HTMLImageElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const imageFileInputRef = useRef<HTMLInputElement>(null)
    const audioFileInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [objects, setObjects] = useState<CanvasObject[]>([])
    const [undoSnapshots, setUndoSnapshots] = useState<CanvasObject[][]>([])
    const [redoSnapshots, setRedoSnapshots] = useState<CanvasObject[][]>([])
    const [draftObject, setDraftObject] = useState<CanvasObject | null>(null)
    const [cropRect, setCropRect] = useState<CropRect | null>(null)
    const [imageFailed, setImageFailed] = useState(false)
    const [videoState, setVideoState] = useState({
      currentTime: 0,
      duration: 0,
      playing: false,
    })
    const [videoThumbnails, setVideoThumbnails] = useState<string[]>([])
    const [audioTrack, setAudioTrack] = useState<AudioTrackState | null>(null)
    const [audioVolume, setAudioVolume] = useState(100)
    const [audioMuted, setAudioMuted] = useState(false)
    const [audioStartTime, setAudioStartTime] = useState(0)
    const [audioEndTime, setAudioEndTime] = useState<number | undefined>(undefined)
    const [dragState, setDragState] = useState<{
      objectId: string
      lastPoint: Point
      moved: boolean
    } | null>(null)
    const objectsRef = useRef<CanvasObject[]>([])
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
    const objectUrlRefs = useRef<Set<string>>(new Set())
    const initialTimedImageAddedRef = useRef(false)
    const syntheticExportTimeRef = useRef(0)
    const onMediaTimeChangeRef = useRef(onMediaTimeChange)

    useEffect(() => {
      objectsRef.current = objects
    }, [objects])

    useEffect(() => {
      onMediaTimeChangeRef.current = onMediaTimeChange
    }, [onMediaTimeChange])

    const cloneObjects = (items: CanvasObject[]) => items.map((obj) => ({
      ...obj,
      points: obj.points?.map((point) => ({ ...point })),
      startPoint: obj.startPoint ? { ...obj.startPoint } : undefined,
      endPoint: obj.endPoint ? { ...obj.endPoint } : undefined,
      properties: { ...obj.properties },
    }))

    const getCachedImage = (url?: string) => {
      if (!url) return null
      const cached = imageCacheRef.current.get(url)
      if (cached) return cached

      const image = new Image()
      image.onload = drawCanvas
      image.src = url
      imageCacheRef.current.set(url, image)
      return image
    }

    const recordHistory = useCallback(() => {
      setUndoSnapshots((prev) => [...prev.slice(-39), cloneObjects(objectsRef.current)])
      setRedoSnapshots([])
    }, [])

    const getTextFont = (obj: CanvasObject) => {
      const italic = obj.properties.italic ? 'italic ' : ''
      const bold = obj.properties.bold ? '700 ' : ''
      const size = obj.properties.fontSize || Math.max(12, obj.properties.size * 3)
      const family = obj.properties.fontFamily || 'Arial'
      return `${italic}${bold}${size}px ${family}, sans-serif`
    }

    const getMediaElement = (): CanvasImageSource | null => (
      mediaType === 'video' ? videoRef.current || getCachedImage(initialTimedImageUrl) : imageRef.current
    )

    const getMediaDimensions = () => {
      if (mediaType === 'video') {
        const video = videoRef.current
        if (video?.videoWidth && video.videoHeight) return { width: video.videoWidth, height: video.videoHeight }
        const fallbackImage = getCachedImage(initialTimedImageUrl)
        if (fallbackImage?.naturalWidth && fallbackImage.naturalHeight) {
          return { width: fallbackImage.naturalWidth, height: fallbackImage.naturalHeight }
        }
        return null
      }

      const image = imageRef.current
      if (!image?.naturalWidth || !image.naturalHeight) return null
      return { width: image.naturalWidth, height: image.naturalHeight }
    }

    const isObjectVisible = useCallback((obj: CanvasObject) => {
      if (mediaType !== 'video') return true
      const startTime = obj.properties.startTime ?? 0
      const endTime = obj.properties.endTime ?? Number.POSITIVE_INFINITY
      return videoState.currentTime >= startTime && videoState.currentTime <= endTime
    }, [mediaType, videoState.currentTime])

    const isObjectVisibleAtTime = (obj: CanvasObject, time: number) => {
      if (mediaType !== 'video') return true
      const startTime = obj.properties.startTime ?? 0
      const endTime = obj.properties.endTime ?? Number.POSITIVE_INFINITY
      return time >= startTime && time <= endTime
    }

    const getDefaultObjectTiming = () => ({
      startTime: mediaType === 'video' ? videoState.currentTime : 0,
      endTime: mediaType === 'video' && videoState.duration > 0
        ? Math.min(videoState.duration, videoState.currentTime + 3)
        : undefined,
    })

    const getAudioTiming = useCallback(() => {
      const duration = Math.max(0.1, videoState.duration || 0.1)
      const startTime = Math.min(duration, Math.max(0, audioTrack?.startTime ?? audioStartTime))
      const fallbackEnd = audioTrack?.endTime ?? audioEndTime ?? duration
      const endTime = Math.min(duration, Math.max(startTime + 0.1, fallbackEnd))
      return { startTime, endTime, duration }
    }, [audioEndTime, audioStartTime, audioTrack, videoState.duration])

    const isAudioActiveAtTime = useCallback((time: number) => {
      const { startTime, endTime } = getAudioTiming()
      return time >= startTime && time <= endTime
    }, [getAudioTiming])

    const getObjectBounds = useCallback((obj: CanvasObject): CropRect | null => {
      if (obj.type === 'drawing' && obj.points && obj.points.length > 0) {
        const xs = obj.points.map((point) => point.x)
        const ys = obj.points.map((point) => point.y)
        const padding = obj.properties.size + 8
        return {
          x: Math.min(...xs) - padding,
          y: Math.min(...ys) - padding,
          width: Math.max(...xs) - Math.min(...xs) + padding * 2,
          height: Math.max(...ys) - Math.min(...ys) + padding * 2,
        }
      }

      if (obj.type === 'shape' && obj.startPoint && obj.endPoint) {
        const rect = normalizeRect(obj.startPoint, obj.endPoint)
        const padding = obj.properties.size + 8
        return {
          x: rect.x - padding,
          y: rect.y - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        }
      }

      if (obj.type === 'text' && obj.startPoint) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        const fontSize = obj.properties.fontSize || 24
        let width = Math.max(64, (obj.text || 'Text').length * fontSize * 0.58)
        if (ctx) {
          ctx.save()
          ctx.font = getTextFont(obj)
          width = Math.max(64, ctx.measureText(obj.text || 'Text').width)
          ctx.restore()
        }
        return {
          x: obj.startPoint.x,
          y: obj.startPoint.y - fontSize,
          width,
          height: fontSize * 1.25,
        }
      }

      if (obj.type === 'image' && obj.startPoint && obj.endPoint) {
        return normalizeRect(obj.startPoint, obj.endPoint)
      }

      return null
    }, [])

    const getObjectStyle = useCallback((obj: CanvasObject): ImageObjectStyle => {
      const bounds = getObjectBounds(obj)
      const shapeRect = obj.type === 'shape' && obj.startPoint && obj.endPoint
        ? normalizeRect(obj.startPoint, obj.endPoint)
        : null
      return {
        ...obj.properties,
        width: shapeRect ? Math.round(shapeRect.width) : bounds ? Math.round(bounds.width) : undefined,
        height: shapeRect ? Math.round(shapeRect.height) : bounds ? Math.round(bounds.height) : undefined,
      }
    }, [getObjectBounds])

    const moveObject = (obj: CanvasObject, dx: number, dy: number): CanvasObject => ({
      ...obj,
      points: obj.points?.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      startPoint: obj.startPoint ? { x: obj.startPoint.x + dx, y: obj.startPoint.y + dy } : undefined,
      endPoint: obj.endPoint ? { x: obj.endPoint.x + dx, y: obj.endPoint.y + dy } : undefined,
    })

    const moveObjectById = (objectId: string, dx: number, dy: number) => {
      setObjects((prev) => prev.map((obj) => (
        obj.id === objectId ? moveObject(obj, dx, dy) : obj
      )))
      setRedoSnapshots([])
    }

    const updateObjectById = (objectId: string, updater: (obj: CanvasObject) => CanvasObject) => {
      recordHistory()
      setObjects((prev) => prev.map((obj) => (
        obj.id === objectId ? updater(obj) : obj
      )))
    }

    const getCanvasCoordinates = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    }, [])

    const normalizeRect = (start: Point, end: Point): CropRect => ({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    })

    const getImageBounds = useCallback((): CropRect | null => {
      const container = containerRef.current
      const dimensions = getMediaDimensions()
      const canvas = canvasRef.current
      if (!container || !dimensions || !canvas) return null

      const containerRect = container.getBoundingClientRect()
      const imageRatio = dimensions.width / dimensions.height
      const containerRatio = containerRect.width / containerRect.height
      let width = containerRect.width
      let height = containerRect.height

      if (containerRatio > imageRatio) {
        height = containerRect.height
        width = height * imageRatio
      } else {
        width = containerRect.width
        height = width / imageRatio
      }

      const scaleX = canvas.width / containerRect.width
      const scaleY = canvas.height / containerRect.height
      return {
        x: ((containerRect.width - width) / 2) * scaleX,
        y: ((containerRect.height - height) / 2) * scaleY,
        width: width * scaleX,
        height: height * scaleY,
      }
    }, [])

    const clampRectToImage = useCallback((rect: CropRect): CropRect | null => {
      const bounds = getImageBounds()
      if (!bounds) return null

      const x = Math.max(bounds.x, rect.x)
      const y = Math.max(bounds.y, rect.y)
      const right = Math.min(bounds.x + bounds.width, rect.x + rect.width)
      const bottom = Math.min(bounds.y + bounds.height, rect.y + rect.height)
      const width = right - x
      const height = bottom - y

      if (width < 8 || height < 8) return null
      return { x, y, width, height }
    }, [getImageBounds])

    const drawRoundedRectPath = (ctx: CanvasRenderingContext2D, rect: CropRect, radius: number) => {
      const safeRadius = Math.min(Math.max(0, radius), rect.width / 2, rect.height / 2)
      ctx.beginPath()
      ctx.moveTo(rect.x + safeRadius, rect.y)
      ctx.lineTo(rect.x + rect.width - safeRadius, rect.y)
      ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + safeRadius)
      ctx.lineTo(rect.x + rect.width, rect.y + rect.height - safeRadius)
      ctx.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - safeRadius, rect.y + rect.height)
      ctx.lineTo(rect.x + safeRadius, rect.y + rect.height)
      ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - safeRadius)
      ctx.lineTo(rect.x, rect.y + safeRadius)
      ctx.quadraticCurveTo(rect.x, rect.y, rect.x + safeRadius, rect.y)
      ctx.closePath()
    }

    const drawObject = useCallback((ctx: CanvasRenderingContext2D, obj: CanvasObject) => {
      ctx.save()
      ctx.globalAlpha = obj.properties.opacity / 100
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = obj.properties.size
      ctx.strokeStyle = obj.properties.strokeColor || obj.properties.color
      ctx.fillStyle = obj.properties.fillColor || obj.properties.color

      if (obj.type === 'drawing' && obj.points && obj.points.length > 0) {
        ctx.beginPath()
        ctx.moveTo(obj.points[0].x, obj.points[0].y)
        obj.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y))
        if (obj.points.length === 1) {
          ctx.lineTo(obj.points[0].x + 0.1, obj.points[0].y + 0.1)
        }
        ctx.stroke()
      }

      if (obj.type === 'shape' && obj.startPoint && obj.endPoint) {
        const rect = normalizeRect(obj.startPoint, obj.endPoint)
        const shapeType = obj.properties.shapeType
        const centerX = rect.x + rect.width / 2
        const centerY = rect.y + rect.height / 2
        ctx.translate(centerX, centerY)
        ctx.rotate(((obj.properties.rotation || 0) * Math.PI) / 180)
        ctx.translate(-centerX, -centerY)
        ctx.beginPath()
        if (shapeType === 'rectangle') {
          ctx.rect(rect.x, rect.y, rect.width, rect.height)
        } else if (shapeType === 'circle') {
          ctx.ellipse(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            rect.width / 2,
            rect.height / 2,
            0,
            0,
            Math.PI * 2
          )
        } else if (shapeType === 'triangle') {
          ctx.moveTo(rect.x + rect.width / 2, rect.y)
          ctx.lineTo(rect.x + rect.width, rect.y + rect.height)
          ctx.lineTo(rect.x, rect.y + rect.height)
          ctx.closePath()
        } else {
          ctx.moveTo(obj.startPoint.x, obj.startPoint.y)
          ctx.lineTo(obj.endPoint.x, obj.endPoint.y)
        }

        if (shapeType !== 'line') {
          ctx.fill()
        }
        ctx.stroke()

        if (shapeType !== 'line' && obj.properties.shapeText?.trim()) {
          const padding = Math.max(8, obj.properties.size + 8)
          const fontSize = obj.properties.fontSize || 20
          ctx.font = getTextFont({
            ...obj,
            properties: {
              ...obj.properties,
              color: obj.properties.color,
              size: fontSize / 3,
            },
          })
          ctx.fillStyle = obj.properties.color
          ctx.textAlign = obj.properties.shapeTextAlign || 'center'
          ctx.textBaseline = 'middle'

          const lines = obj.properties.shapeText.split(/\r?\n/)
          const lineHeight = fontSize * 1.2
          const textBlockHeight = lines.length * lineHeight
          const contentTop = rect.y + padding
          const contentBottom = rect.y + rect.height - padding
          const contentHeight = Math.max(lineHeight, contentBottom - contentTop)
          const verticalAlign = obj.properties.shapeTextVerticalAlign || 'middle'
          const startY = verticalAlign === 'top'
            ? contentTop + lineHeight / 2
            : verticalAlign === 'bottom'
              ? contentBottom - textBlockHeight + lineHeight / 2
              : contentTop + contentHeight / 2 - textBlockHeight / 2 + lineHeight / 2
          const x = ctx.textAlign === 'left'
            ? rect.x + padding
            : ctx.textAlign === 'right'
              ? rect.x + rect.width - padding
              : rect.x + rect.width / 2

          lines.forEach((line, index) => {
            ctx.fillText(line, x, startY + index * lineHeight, Math.max(10, rect.width - padding * 2))
          })
        }
      }

      if (obj.type === 'text' && obj.startPoint) {
        ctx.translate(obj.startPoint.x, obj.startPoint.y)
        ctx.rotate(((obj.properties.rotation || 0) * Math.PI) / 180)
        ctx.font = getTextFont(obj)
        ctx.fillStyle = obj.properties.color
        ctx.fillText(obj.text || 'Text', 0, 0)
      }

      if (obj.type === 'image' && obj.startPoint && obj.endPoint) {
        const image = getCachedImage(obj.properties.imageUrl)
        const rect = normalizeRect(obj.startPoint, obj.endPoint)
        if (image?.complete && image.naturalWidth > 0) {
          const centerX = rect.x + rect.width / 2
          const centerY = rect.y + rect.height / 2
          ctx.translate(centerX, centerY)
          ctx.rotate(((obj.properties.rotation || 0) * Math.PI) / 180)
          const localRect = {
            x: -rect.width / 2,
            y: -rect.height / 2,
            width: rect.width,
            height: rect.height,
          }
          drawRoundedRectPath(ctx, localRect, obj.properties.borderRadius || 0)
          ctx.clip()
          ctx.drawImage(image, localRect.x, localRect.y, localRect.width, localRect.height)
          const borderWidth = obj.properties.borderWidth || 0
          if (borderWidth > 0) {
            ctx.lineWidth = borderWidth
            ctx.strokeStyle = obj.properties.borderColor || '#ffffff'
            drawRoundedRectPath(ctx, localRect, obj.properties.borderRadius || 0)
            ctx.stroke()
          }
        }
      }

      ctx.restore()
    }, [])

    const drawSelection = useCallback((ctx: CanvasRenderingContext2D, obj: CanvasObject) => {
      const bounds = getObjectBounds(obj)
      if (!bounds) return

      ctx.save()
      ctx.strokeStyle = '#0891b2'
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
      ctx.restore()
    }, [getObjectBounds])

    const drawCropRect = useCallback((ctx: CanvasRenderingContext2D, rect: CropRect) => {
      ctx.save()
      ctx.fillStyle = 'rgba(15, 23, 42, 0.38)'
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
      ctx.strokeStyle = '#0891b2'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 5])
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
      ctx.restore()
    }, [])

    const drawCaptionOverlay = useCallback((ctx: CanvasRenderingContext2D, bounds: CropRect, scale = 1, renderTime?: number) => {
      const currentTime = renderTime ?? videoRef.current?.currentTime ?? videoState.currentTime
      const activeCue = captionOverlay?.cues?.find((cue) => (
        currentTime >= cue.start && currentTime < cue.end + 0.001
      ))
      const text = (activeCue?.text || captionOverlay?.text || '').trim()
      if (!captionOverlay?.visible || !text) return

      ctx.save()
      const fontSize = Math.max(12, captionOverlay.fontSize * scale)
      const paddingX = 14 * scale
      const paddingY = 8 * scale
      const maxWidth = bounds.width * 0.82
      const lineHeight = fontSize * 1.25
      ctx.font = `600 ${fontSize}px ${captionOverlay.fontFamily}, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const timedWords = activeCue?.words || []
      const activeWordIndex = timedWords.findIndex((word) => (
        currentTime >= word.start && currentTime < word.end + 0.001
      ))
      const tokens = timedWords.length > 0
        ? timedWords.map((word, index) => ({ text: word.text, index }))
        : text.split(/\s+/).map((word) => ({ text: word, index: -1 }))
      const joinsWithoutSpace = (value: string) => /^[,.;:!?%\)\]\}]/.test(value) || value.startsWith("'")
      const lineText = (line: typeof tokens) => line.map((token, index) => (
        index === 0 || joinsWithoutSpace(token.text) ? token.text : ` ${token.text}`
      )).join('')
      const lines: Array<typeof tokens> = []
      let currentLine: typeof tokens = []
      tokens.forEach((token) => {
        const nextLine = [...currentLine, token]
        if (ctx.measureText(lineText(nextLine)).width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine)
          currentLine = [token]
        } else {
          currentLine = nextLine
        }
      })
      if (currentLine.length > 0) lines.push(currentLine)

      const visibleLines = lines.slice(-3)
      const boxWidth = Math.min(maxWidth + paddingX * 2, Math.max(...visibleLines.map((line) => ctx.measureText(lineText(line)).width), 80 * scale) + paddingX * 2)
      const boxHeight = visibleLines.length * lineHeight + paddingY * 2
      const boxX = bounds.x + bounds.width / 2 - boxWidth / 2
      const bottomSafeArea = Math.max(16 * scale, bounds.height * 0.055)
      const boxY = bounds.y + bounds.height - boxHeight - bottomSafeArea

      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)'
      drawRoundedRectPath(ctx, { x: boxX, y: boxY, width: boxWidth, height: boxHeight }, 3 * scale)
      ctx.fill()
      visibleLines.forEach((line, index) => {
        const content = lineText(line)
        let cursorX = bounds.x + bounds.width / 2 - ctx.measureText(content).width / 2
        const centerY = boxY + paddingY + lineHeight * index + lineHeight / 2
        ctx.textAlign = 'left'
        line.forEach((token, tokenIndex) => {
          const displayText = tokenIndex === 0 || joinsWithoutSpace(token.text) ? token.text : ` ${token.text}`
          const tokenWidth = ctx.measureText(displayText).width
          const isActiveWord = token.index === activeWordIndex
          ctx.fillStyle = isActiveWord ? '#ffffff' : captionOverlay.color
          ctx.fillText(displayText, cursorX, centerY, maxWidth)
          cursorX += tokenWidth
        })
      })
      ctx.restore()
    }, [captionOverlay, videoState.currentTime])

    const drawCanvas = useCallback(() => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const rect = container.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width || container.clientWidth))
      const height = Math.max(1, Math.floor(rect.height || container.clientHeight))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      objects.forEach((obj) => {
        if (!isObjectVisible(obj)) return
        if (!(obj.id === selectedObjectId && obj.type === 'text')) {
          drawObject(ctx, obj)
        }
        if (obj.id === selectedObjectId) drawSelection(ctx, obj)
      })
      if (draftObject) drawObject(ctx, draftObject)
      const bounds = getImageBounds()
      if (bounds) drawCaptionOverlay(ctx, bounds)
      if (cropRect) drawCropRect(ctx, cropRect)
    }, [cropRect, draftObject, drawCaptionOverlay, drawCropRect, drawObject, drawSelection, getImageBounds, isObjectVisible, objects, selectedObjectId])

    useEffect(() => {
      drawCanvas()
    }, [
      captionOverlay?.color,
      captionOverlay?.fontFamily,
      captionOverlay?.fontSize,
      captionOverlay?.cues,
      captionOverlay?.text,
      captionOverlay?.visible,
      drawCanvas,
    ])

    const exportCanvas = useCallback((requestedCrop?: CropRect) => {
      const media = getMediaElement()
      const dimensions = getMediaDimensions()
      const canvas = canvasRef.current
      const bounds = getImageBounds()
      if (!media || !dimensions || !canvas || !bounds) return null

      const crop = requestedCrop || bounds
      const output = document.createElement('canvas')
      output.width = Math.max(1, Math.round(crop.width))
      output.height = Math.max(1, Math.round(crop.height))
      const ctx = output.getContext('2d')
      if (!ctx) return null

      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, output.width, output.height)

      const sx = ((crop.x - bounds.x) / bounds.width) * dimensions.width
      const sy = ((crop.y - bounds.y) / bounds.height) * dimensions.height
      const sw = (crop.width / bounds.width) * dimensions.width
      const sh = (crop.height / bounds.height) * dimensions.height
      if (!hideBaseMedia) ctx.drawImage(media, sx, sy, sw, sh, 0, 0, output.width, output.height)

      ctx.save()
      ctx.translate(-crop.x, -crop.y)
      objects.forEach((obj) => {
        if (isObjectVisible(obj)) drawObject(ctx, obj)
      })
      drawCaptionOverlay(ctx, bounds)
      ctx.restore()

      return output
    }, [backgroundColor, drawCaptionOverlay, drawObject, getImageBounds, hideBaseMedia, isObjectVisible, objects])

    const exportVideo = useCallback(async (options?: VideoExportOptions) => {
      if (mediaType !== 'video' || !imageUrl) return null

      const bounds = getImageBounds()
      const dimensions = getMediaDimensions()
      if (!bounds || !dimensions) return null

      const preset = VIDEO_EXPORT_QUALITY_PRESETS[options?.quality || 'fullHd']
      const sourceRatio = dimensions.width / dimensions.height
      const targetRatio = Math.min(preset.maxWidth / dimensions.width, preset.maxHeight / dimensions.height)
      const outputWidth = targetRatio >= 1
        ? Math.min(preset.maxWidth, Math.round(preset.maxHeight * sourceRatio))
        : Math.round(dimensions.width * targetRatio)
      const outputHeight = Math.round(outputWidth / sourceRatio)
      const scaleX = outputWidth / bounds.width
      const scaleY = outputHeight / bounds.height
      const previewVideo = videoRef.current
      const previewWasPlaying = previewVideo ? !previewVideo.paused && !previewVideo.ended : false
      if (previewVideo) previewVideo.pause()

      const output = document.createElement('canvas')
      output.width = Math.max(1, outputWidth)
      output.height = Math.max(1, outputHeight)
      const ctx = output.getContext('2d')
      if (!ctx) return null

      const source = document.createElement('video')
      source.src = imageUrl
      source.playsInline = true
      source.crossOrigin = 'anonymous'
      source.muted = true
      source.volume = 0

      if (!syntheticTimeline) {
        await new Promise<void>((resolve, reject) => {
          source.onloadedmetadata = () => resolve()
          source.onerror = () => reject(new Error('Could not load video for export'))
        })

        if (!Number.isFinite(source.duration) || source.duration <= 0) return null
      }

      const exportDuration = syntheticTimeline
        ? Math.max(0.1, timelineDurationOverride || videoState.duration || 5)
        : source.duration

      const canvasStream = output.captureStream(30)
      let audioContext: AudioContext | null = null
      let exportAudioElement: HTMLMediaElement | null = null
      let exportGainNode: GainNode | null = null
      const audioTiming = getAudioTiming()
      try {
        audioContext = new AudioContext()
        const audioDestination = audioContext.createMediaStreamDestination()
        exportAudioElement = document.createElement(audioTrack?.url ? 'audio' : 'video') as HTMLMediaElement
        exportAudioElement.src = audioTrack?.url || imageUrl
        exportAudioElement.crossOrigin = 'anonymous'
        exportAudioElement.loop = Boolean(audioTrack?.url)
        if ('playsInline' in exportAudioElement) {
          ;(exportAudioElement as HTMLVideoElement).playsInline = true
        }
        const audioSource = audioContext.createMediaElementSource(exportAudioElement)
        exportGainNode = audioContext.createGain()
        exportGainNode.gain.value = 0
        audioSource.connect(exportGainNode)
        exportGainNode.connect(audioDestination)
        audioDestination.stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track))
      } catch {
        audioContext = null
        exportAudioElement = null
        exportGainNode = null
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm'
      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: preset.videoBitsPerSecond,
      })
      const chunks: BlobPart[] = []

      const drawExportFrame = () => {
        const renderTime = syntheticTimeline ? syntheticExportTimeRef.current : source.currentTime
        if (exportAudioElement && exportGainNode) {
          const audioActive = !audioMuted && renderTime >= audioTiming.startTime && renderTime <= audioTiming.endTime
          const expectedAudioTime = audioTrack?.url
            ? Math.max(0, renderTime - audioTiming.startTime)
            : renderTime
          exportGainNode.gain.value = audioActive ? audioVolume / 100 : 0
          if (Math.abs(exportAudioElement.currentTime - expectedAudioTime) > 0.35) {
            exportAudioElement.currentTime = expectedAudioTime
          }
          if (audioActive && exportAudioElement.paused) {
            void exportAudioElement.play().catch(() => undefined)
          }
          if (!audioActive && !exportAudioElement.paused) {
            exportAudioElement.pause()
          }
        }

        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, output.width, output.height)
        if (!hideBaseMedia && !syntheticTimeline) ctx.drawImage(source, 0, 0, output.width, output.height)
        ctx.save()
        ctx.scale(scaleX, scaleY)
        ctx.translate(-bounds.x, -bounds.y)
        objectsRef.current.forEach((obj) => {
          if (isObjectVisibleAtTime(obj, renderTime)) drawObject(ctx, obj)
        })
        drawCaptionOverlay(ctx, bounds, 1, renderTime)
        ctx.restore()
      }

      return await new Promise<Blob | null>((resolve) => {
        let frameId = 0
        let resolved = false
        let exportStartedAt = 0

        const finish = () => {
          window.cancelAnimationFrame(frameId)
          canvasStream.getTracks().forEach((track) => track.stop())
          source.pause()
          exportAudioElement?.pause()
          void audioContext?.close().catch(() => undefined)
          options?.onProgress?.(100)
          if (previewWasPlaying) void previewVideo?.play().catch(() => undefined)
        }

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => {
          if (resolved) return
          resolved = true
          finish()
          resolve(chunks.length > 0 ? new Blob(chunks, { type: 'video/webm' }) : null)
        }
        source.onended = () => {
          if (!syntheticTimeline) {
            drawExportFrame()
            if (recorder.state !== 'inactive') recorder.stop()
          }
        }

        const render = () => {
          if (syntheticTimeline) {
            syntheticExportTimeRef.current = Math.min(exportDuration, (performance.now() - exportStartedAt) / 1000)
          }
          drawExportFrame()
          const progressTime = syntheticTimeline ? syntheticExportTimeRef.current : source.currentTime
          options?.onProgress?.(Math.min(99, Math.round((progressTime / exportDuration) * 100)))
          if (syntheticTimeline && syntheticExportTimeRef.current >= exportDuration) {
            if (recorder.state !== 'inactive') recorder.stop()
            return
          }
          if ((syntheticTimeline || !source.ended) && recorder.state !== 'inactive') {
            frameId = window.requestAnimationFrame(render)
          }
        }

        const stopWithNull = () => {
          if (resolved) return
          resolved = true
          if (recorder.state !== 'inactive') recorder.stop()
          finish()
          resolve(null)
        }

        source.currentTime = 0
        syntheticExportTimeRef.current = 0
        if (exportAudioElement) exportAudioElement.currentTime = 0
        options?.onProgress?.(0)
        recorder.start(250)
        void audioContext?.resume().catch(() => undefined)
        exportStartedAt = performance.now()
        const playbackPromises = syntheticTimeline ? [] : [source.play()]
        if (exportAudioElement && !audioTrack?.url) playbackPromises.push(exportAudioElement.play())
        void Promise.all(playbackPromises).then(() => {
          render()
        }).catch(() => {
          stopWithNull()
        })
      })
    }, [audioMuted, audioTrack, audioVolume, backgroundColor, drawCaptionOverlay, drawObject, getAudioTiming, getImageBounds, hideBaseMedia, imageUrl, mediaType, syntheticTimeline, timelineDurationOverride, videoState.duration])

    const hitTestObject = useCallback((point: Point, obj: CanvasObject) => {
      const tolerance = Math.max(8, obj.properties.size + 4)
      const bounds = getObjectBounds(obj)
      const points = obj.points || [obj.startPoint, obj.endPoint].filter(Boolean) as Point[]
      if (points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance)) return true

      if (obj.type === 'text' && bounds) {
        return point.x >= bounds.x - tolerance &&
          point.x <= bounds.x + bounds.width + tolerance &&
          point.y >= bounds.y - tolerance &&
          point.y <= bounds.y + bounds.height + tolerance
      }

      if (obj.startPoint && obj.endPoint) {
        const rect = normalizeRect(obj.startPoint, obj.endPoint)
        return point.x >= rect.x - tolerance &&
          point.x <= rect.x + rect.width + tolerance &&
          point.y >= rect.y - tolerance &&
          point.y <= rect.y + rect.height + tolerance
      }

      return false
    }, [getObjectBounds])

    const pushObject = (object: CanvasObject, selectAfterCreate = false) => {
      recordHistory()
      setObjects((prev) => [...prev, object])
      if (selectAfterCreate) onObjectSelect?.(object.id, object.type, getObjectStyle(object))
    }

    useEffect(() => {
      if (
        mediaType !== 'video' ||
        !initialTimedImageUrl ||
        initialTimedImageAddedRef.current ||
        videoState.duration <= 0
      ) return
      const bounds = getImageBounds()
      if (!bounds) return

      initialTimedImageAddedRef.current = true
      const object: CanvasObject = {
        id: `converted-image-${Date.now()}`,
        type: 'image',
        startPoint: { x: bounds.x, y: bounds.y },
        endPoint: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        properties: {
          color: '#0f766e',
          size: 1,
          opacity: 100,
          rotation: 0,
          imageUrl: initialTimedImageUrl,
          imageName: initialTimedImageName || 'Converted image',
          borderRadius: 0,
          borderWidth: 0,
          borderColor: '#ffffff',
          startTime: 0,
          endTime: Math.min(5, videoState.duration),
        },
      }
      getCachedImage(initialTimedImageUrl)
      setObjects((items) => [...items, object])
      onObjectSelect?.(object.id, object.type, getObjectStyle(object))
    }, [getImageBounds, getObjectStyle, initialTimedImageName, initialTimedImageUrl, mediaType, onObjectSelect, videoState.duration])

    useImperativeHandle(ref, () => ({
      undo: () => {
        setUndoSnapshots((prev) => {
          if (prev.length === 0) return prev
          const restored = prev[prev.length - 1]
          setRedoSnapshots((redoPrev) => [...redoPrev, cloneObjects(objectsRef.current)])
          setObjects(cloneObjects(restored))
          onObjectSelect?.(undefined)
          return prev.slice(0, -1)
        })
      },
      redo: () => {
        setRedoSnapshots((prev) => {
          if (prev.length === 0) return prev
          const restored = prev[prev.length - 1]
          setUndoSnapshots((undoPrev) => [...undoPrev, cloneObjects(objectsRef.current)])
          setObjects(cloneObjects(restored))
          onObjectSelect?.(undefined)
          return prev.slice(0, -1)
        })
      },
      deleteSelectedObject: () => {
        if (!selectedObjectId) return
        recordHistory()
        setObjects((prev) => prev.filter((obj) => obj.id !== selectedObjectId))
        onObjectSelect?.(undefined)
      },
      setSelectedShapeDimensions: (width?: number, height?: number) => {
        if (!selectedObjectId) return
        recordHistory()
        setObjects((prev) => prev.map((obj) => {
          if (obj.id !== selectedObjectId || (obj.type !== 'shape' && obj.type !== 'image') || !obj.startPoint || !obj.endPoint) return obj
          const currentWidth = obj.endPoint.x - obj.startPoint.x
          const currentHeight = obj.endPoint.y - obj.startPoint.y
          const nextWidth = typeof width === 'number' ? Math.sign(currentWidth || 1) * Math.max(12, width) : currentWidth
          const nextHeight = typeof height === 'number' ? Math.sign(currentHeight || 1) * Math.max(12, height) : currentHeight
          return {
            ...obj,
            endPoint: {
              x: obj.startPoint.x + nextWidth,
              y: obj.startPoint.y + nextHeight,
            },
          }
        }))
      },
      setSelectedImageStyle: (style) => {
        if (!selectedObjectId) return
        recordHistory()
        setObjects((prev) => prev.map((obj) => {
          if (obj.id !== selectedObjectId || obj.type !== 'image') return obj
          const nextObj = {
            ...obj,
            properties: {
              ...obj.properties,
              borderRadius: typeof style.borderRadius === 'number' ? style.borderRadius : obj.properties.borderRadius,
              borderWidth: typeof style.borderWidth === 'number' ? style.borderWidth : obj.properties.borderWidth,
              borderColor: style.borderColor || obj.properties.borderColor,
              opacity: typeof style.opacity === 'number' ? style.opacity : obj.properties.opacity,
            },
          }
          onObjectSelect?.(nextObj.id, nextObj.type, getObjectStyle(nextObj))
          return nextObj
        }))
      },
      setSelectedObjectTiming: (startTime?: number, endTime?: number) => {
        if (!selectedObjectId) return
        recordHistory()
        setObjects((prev) => prev.map((obj) => {
          if (obj.id !== selectedObjectId) return obj
          const nextObj = {
            ...obj,
            properties: {
              ...obj.properties,
              startTime,
              endTime,
            },
          }
          onObjectSelect?.(nextObj.id, nextObj.type, getObjectStyle(nextObj))
          return nextObj
        }))
      },
      clearObjects: () => {
        recordHistory()
        setObjects([])
        onObjectSelect?.(undefined)
      },
      seekTo: (time: number) => {
        const nextTime = Math.min(Math.max(0, time), videoState.duration || Math.max(0, time))
        if (syntheticTimeline) {
          setVideoState((state) => ({ ...state, currentTime: nextTime }))
          return
        }
        const video = videoRef.current
        if (!video) return
        video.currentTime = nextTime
        setVideoState((state) => ({ ...state, currentTime: nextTime }))
        drawCanvas()
      },
      exportCanvas,
      exportVideo,
      getCanvas: () => canvasRef.current,
    }), [drawCanvas, exportCanvas, exportVideo, getObjectStyle, onObjectSelect, recordHistory, selectedObjectId, syntheticTimeline, videoState.duration])

    useEffect(() => {
      drawCanvas()
    }, [drawCanvas])

    useEffect(() => {
      if (!selectedObjectId) return
      setObjects((prev) => prev.map((obj) => {
        if (obj.id !== selectedObjectId) return obj
        if (obj.type === 'shape') {
          return {
            ...obj,
            properties: {
              ...obj.properties,
              fillColor: obj.properties.shapeType === 'line' ? 'transparent' : fillColor,
              strokeColor,
              size: strokeWidth,
              rotation: shapeRotation,
              shapeText,
              shapeTextAlign,
              shapeTextVerticalAlign,
              color: shapeText ? textColor : strokeColor,
              fontFamily: textFontFamily,
              fontSize: textFontSize,
              bold: textBold,
              italic: textItalic,
              startTime: elementStartTime,
              endTime: elementEndTime,
            },
          }
        }
        if (obj.type === 'drawing') {
          return {
            ...obj,
            properties: {
              ...obj.properties,
              color: brushColor,
              size: brushSize,
              opacity: brushOpacity,
            },
          }
        }
        if (obj.type === 'image') {
          return {
            ...obj,
            properties: {
              ...obj.properties,
              startTime: elementStartTime,
              endTime: elementEndTime,
              borderRadius: imageBorderRadius,
              borderWidth: imageBorderWidth,
              borderColor: imageBorderColor,
              opacity: imageOpacity,
            },
          }
        }
        if (obj.type !== 'text') return obj
        return {
          ...obj,
          properties: {
            ...obj.properties,
            color: textColor,
            fontFamily: textFontFamily,
            fontSize: textFontSize,
            bold: textBold,
            italic: textItalic,
            rotation: textRotation,
            startTime: elementStartTime,
            endTime: elementEndTime,
          },
        }
      }))
    }, [
      brushColor,
      brushOpacity,
      brushSize,
      fillColor,
      selectedObjectId,
      strokeColor,
      strokeWidth,
      shapeRotation,
      shapeText,
      shapeTextAlign,
      shapeTextVerticalAlign,
      elementStartTime,
      elementEndTime,
      imageBorderColor,
      imageBorderRadius,
      imageBorderWidth,
      imageOpacity,
      textBold,
      textColor,
      textFontFamily,
      textFontSize,
      textItalic,
      textRotation,
    ])

    useEffect(() => {
      onHistoryChange?.(undoSnapshots.length > 0, redoSnapshots.length > 0)
    }, [onHistoryChange, redoSnapshots.length, undoSnapshots.length])

    useEffect(() => {
      onMediaTimeChangeRef.current?.(videoState.currentTime, videoState.duration, videoState.playing)
    }, [videoState.currentTime, videoState.duration, videoState.playing])

    useEffect(() => {
      setImageFailed(false)
      setCropRect(null)
      setVideoThumbnails([])
    }, [imageUrl])

    useEffect(() => {
      if (mediaType !== 'video' || !imageUrl || !videoState.duration) {
        setVideoThumbnails([])
        return
      }

      let cancelled = false
      const source = document.createElement('video')
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = 160
      canvas.height = 90
      source.src = imageUrl
      source.crossOrigin = 'anonymous'
      source.muted = true
      source.volume = 0
      source.playsInline = true
      source.preload = 'auto'

      const waitFor = (eventName: keyof HTMLMediaElementEventMap) => new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          source.removeEventListener(eventName, handleEvent)
          source.removeEventListener('error', handleError)
        }
        const handleEvent = () => {
          cleanup()
          resolve()
        }
        const handleError = () => {
          cleanup()
          reject(new Error('Could not read video frame'))
        }
        source.addEventListener(eventName, handleEvent, { once: true })
        source.addEventListener('error', handleError, { once: true })
      })

      const captureFrames = async () => {
        if (!ctx) return
        try {
          await waitFor('loadedmetadata')
          const frameCount = Math.min(18, Math.max(8, Math.ceil(videoState.duration / 4)))
          const frames: string[] = []

          for (let index = 0; index < frameCount; index += 1) {
            if (cancelled) return
            const ratio = frameCount === 1 ? 0 : index / (frameCount - 1)
            source.currentTime = Math.min(Math.max(0, videoState.duration * ratio), Math.max(0, videoState.duration - 0.05))
            await waitFor('seeked')
            if (cancelled) return
            ctx.fillStyle = '#e2e8f0'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
            frames.push(canvas.toDataURL('image/jpeg', 0.72))
            setVideoThumbnails([...frames])
          }
        } catch {
          if (!cancelled) setVideoThumbnails([])
        }
      }

      void captureFrames()

      return () => {
        cancelled = true
        source.pause()
        source.removeAttribute('src')
        source.load()
      }
    }, [imageUrl, mediaType, videoState.duration])

    useEffect(() => () => {
      objectUrlRefs.current.forEach((url) => URL.revokeObjectURL(url))
      objectUrlRefs.current.clear()
      imageCacheRef.current.clear()
    }, [])

    useEffect(() => {
      let frameId = 0
      const handleResize = () => {
        window.cancelAnimationFrame(frameId)
        frameId = window.requestAnimationFrame(drawCanvas)
      }

      window.addEventListener('resize', handleResize)
      const resizeObserver = new ResizeObserver(handleResize)
      if (containerRef.current) resizeObserver.observe(containerRef.current)
      handleResize()

      return () => {
        window.cancelAnimationFrame(frameId)
        window.removeEventListener('resize', handleResize)
        resizeObserver.disconnect()
      }
    }, [drawCanvas])

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasCoordinates(e)
      e.currentTarget.setPointerCapture(e.pointerId)
      const selected = [...objects].reverse().find((obj) => isObjectVisible(obj) && hitTestObject(point, obj))
      const shouldOnlyDeselect = Boolean(
        selectedObjectId &&
        !selected &&
        (activeTool === 'text' || SHAPE_TOOLS.includes(activeTool as ImageShapeTool))
      )

      if (activeTool === 'select') {
        onObjectSelect?.(selected?.id, selected?.type, selected ? getObjectStyle(selected) : undefined)
        if (selected) {
          recordHistory()
          setDragState({ objectId: selected.id, lastPoint: point, moved: false })
        }
        return
      }

      if (shouldOnlyDeselect) {
        onObjectSelect?.(undefined)
        return
      }

      if (activeTool === 'fill') {
        if (selected?.type === 'shape') {
          updateObjectById(selected.id, (obj) => ({
            ...obj,
            properties: {
              ...obj.properties,
              fillColor,
              color: obj.properties.strokeColor || obj.properties.color,
            },
          }))
          onObjectSelect?.(selected.id, selected.type, { ...getObjectStyle(selected), fillColor })
        } else {
          onBackgroundFill?.(fillColor)
        }
        return
      }

      if (activeTool === 'eraser') {
        recordHistory()
        setObjects((prev) => prev.filter((obj) => !hitTestObject(point, obj)))
        return
      }

      if (activeTool === 'text') {
        if (selected?.type === 'text') {
          onObjectSelect?.(selected.id, selected.type, getObjectStyle(selected))
          recordHistory()
          setDragState({ objectId: selected.id, lastPoint: point, moved: false })
          return
        }

        pushObject({
          id: `text-${Date.now()}-${Math.random()}`,
          type: 'text',
          startPoint: point,
          text: 'Text',
          properties: {
            color: textColor,
            size: brushSize,
            opacity: brushOpacity,
            fontFamily: textFontFamily,
            fontSize: textFontSize,
            bold: textBold,
            italic: textItalic,
            rotation: textRotation,
            ...getDefaultObjectTiming(),
          },
        }, true)
        return
      }

      if (SHAPE_TOOLS.includes(activeTool as ImageShapeTool) && selected?.type === 'shape') {
        onObjectSelect?.(selected.id, selected.type, getObjectStyle(selected))
        recordHistory()
        setDragState({ objectId: selected.id, lastPoint: point, moved: false })
        return
      }

      if (activeTool === 'crop') {
        setIsDrawing(true)
        setCropRect({ x: point.x, y: point.y, width: 0, height: 0 })
        return
      }

      if (DRAWING_TOOLS.includes(activeTool)) {
        setIsDrawing(true)
        setDraftObject({
          id: `drawing-${Date.now()}-${Math.random()}`,
          type: 'drawing',
          points: [point],
          properties: {
            color: activeTool === 'highlighter' ? brushColor : brushColor,
            size: activeTool === 'highlighter' ? brushSize * 2 : brushSize,
            opacity: activeTool === 'highlighter' ? Math.min(45, brushOpacity) : brushOpacity,
            ...getDefaultObjectTiming(),
          },
        })
        return
      }

      if (SHAPE_TOOLS.includes(activeTool as ImageShapeTool)) {
        const shapeTool = activeTool as ImageShapeTool
        setIsDrawing(true)
        setDraftObject({
          id: `shape-${Date.now()}-${Math.random()}`,
          type: 'shape',
          startPoint: point,
          endPoint: point,
          properties: {
            color: strokeColor,
            fillColor: shapeTool === 'line' ? 'transparent' : fillColor,
            strokeColor,
            size: strokeWidth,
            opacity: 100,
            shapeType: shapeTool,
            rotation: shapeRotation,
            shapeText: '',
            shapeTextAlign,
            shapeTextVerticalAlign,
            fontFamily: textFontFamily,
            fontSize: textFontSize,
            bold: textBold,
            italic: textItalic,
            ...getDefaultObjectTiming(),
          },
        })
      }
    }

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasCoordinates(e)

      if (dragState && e.buttons === 1) {
        const dx = point.x - dragState.lastPoint.x
        const dy = point.y - dragState.lastPoint.y
        setObjects((prev) => prev.map((obj) => (
          obj.id === dragState.objectId ? moveObject(obj, dx, dy) : obj
        )))
        setDragState({ objectId: dragState.objectId, lastPoint: point, moved: true })
        return
      }

      if (activeTool === 'eraser' && e.buttons === 1) {
        setObjects((prev) => prev.filter((obj) => !hitTestObject(point, obj)))
        return
      }

      if (!isDrawing) return

      if (activeTool === 'crop' && cropRect) {
        setCropRect(normalizeRect({ x: cropRect.x, y: cropRect.y }, point))
        return
      }

      setDraftObject((prev) => {
        if (!prev) return prev
        if (prev.type === 'drawing') {
          return { ...prev, points: [...(prev.points || []), point] }
        }
        return { ...prev, endPoint: point }
      })
    }

    const finishPointerAction = () => {
      if (dragState) {
        setDragState(null)
        return
      }

      if (activeTool === 'crop' && cropRect) {
        const clamped = clampRectToImage(cropRect)
        setCropRect(null)
        setIsDrawing(false)
        if (clamped) onCropComplete?.(clamped)
        return
      }

      if (draftObject) {
        const hasSize = draftObject.type !== 'shape' ||
          !draftObject.startPoint ||
          !draftObject.endPoint ||
          Math.hypot(draftObject.endPoint.x - draftObject.startPoint.x, draftObject.endPoint.y - draftObject.startPoint.y) > 4
        if (hasSize) pushObject(draftObject, draftObject.type === 'shape')
      }

      setDraftObject(null)
      setIsDrawing(false)
    }

    const selectedTextObject = selectedObjectId
      ? objects.find((obj) => obj.id === selectedObjectId && obj.type === 'text' && isObjectVisible(obj))
      : undefined
    const selectedShapeObject = selectedObjectId
      ? objects.find((obj) => obj.id === selectedObjectId && obj.type === 'shape' && isObjectVisible(obj))
      : undefined

    const updateVideoState = () => {
      const video = videoRef.current
      if (!video) return
      const duration = timelineDurationOverride && timelineDurationOverride > 0
        ? timelineDurationOverride
        : Number.isFinite(video.duration) ? video.duration : 0
      if (timelineDurationOverride && video.currentTime >= timelineDurationOverride) {
        video.pause()
        video.currentTime = timelineDurationOverride
      }
      setVideoState({
        currentTime: syntheticTimeline ? 0 : video.currentTime || 0,
        duration,
        playing: syntheticTimeline ? false : !video.paused && !video.ended,
      })
    }

    const seekVideo = (time: number) => {
      const video = videoRef.current
      const nextTime = Math.min(Math.max(0, time), videoState.duration || time)
      if (syntheticTimeline) {
        setVideoState((state) => ({ ...state, currentTime: nextTime }))
        return
      }
      if (!video) return
      video.currentTime = nextTime
      const { startTime } = getAudioTiming()
      if (audioRef.current) audioRef.current.currentTime = Math.max(0, nextTime - startTime)
      updateVideoState()
      drawCanvas()
    }

    const toggleVideoPlayback = async () => {
      const video = videoRef.current
      if (syntheticTimeline) {
        setVideoState((state) => ({
          ...state,
          currentTime: state.currentTime >= state.duration ? 0 : state.currentTime,
          playing: !state.playing,
        }))
        return
      }
      if (!video) return
      if (video.paused) {
        const active = isAudioActiveAtTime(video.currentTime)
        if (audioRef.current) {
          const { startTime } = getAudioTiming()
          audioRef.current.currentTime = Math.max(0, video.currentTime - startTime)
          if (active && !audioMuted) void audioRef.current.play().catch(() => undefined)
        }
        await video.play()
      } else {
        video.pause()
        audioRef.current?.pause()
      }
      updateVideoState()
    }

    useEffect(() => {
      if (!syntheticTimeline || !videoState.playing) return
      const startedAt = performance.now()
      const initialTime = videoState.currentTime
      let frameId = 0
      const tick = (now: number) => {
        const nextTime = Math.min(videoState.duration, initialTime + (now - startedAt) / 1000)
        setVideoState((state) => ({ ...state, currentTime: nextTime, playing: nextTime < state.duration }))
        if (nextTime < videoState.duration) frameId = requestAnimationFrame(tick)
      }
      frameId = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(frameId)
    }, [syntheticTimeline, videoState.duration, videoState.playing])

    const syncPreviewAudio = useCallback(() => {
      const video = videoRef.current
      const audio = audioRef.current
      if (!video) return
      const { startTime } = getAudioTiming()
      const active = isAudioActiveAtTime(video.currentTime)
      video.volume = audioVolume / 100
      video.muted = Boolean(audioTrack) || audioMuted || !active

      if (!audio) return
      audio.volume = audioVolume / 100
      audio.muted = audioMuted || !active
      const expectedAudioTime = Math.max(0, video.currentTime - startTime)
      if (Math.abs(audio.currentTime - expectedAudioTime) > 0.25) {
        audio.currentTime = expectedAudioTime
      }
      if (!active || audioMuted || video.paused || video.ended) {
        audio.pause()
      } else if (audio.paused) {
        void audio.play().catch(() => undefined)
      }
    }, [audioMuted, audioTrack, audioVolume, getAudioTiming, isAudioActiveAtTime])

    useEffect(() => {
      syncPreviewAudio()
    }, [syncPreviewAudio])

    useEffect(() => {
      if (mediaType !== 'video' || syntheticTimeline || !videoState.playing) return
      let frameId = 0
      const drawPlaybackFrame = () => {
        drawCanvas()
        frameId = window.requestAnimationFrame(drawPlaybackFrame)
      }
      frameId = window.requestAnimationFrame(drawPlaybackFrame)
      return () => window.cancelAnimationFrame(frameId)
    }, [drawCanvas, mediaType, syntheticTimeline, videoState.playing])

    const updateSelectedText = (text: string) => {
      if (!selectedObjectId) return
      recordHistory()
      setObjects((prev) => prev.map((obj) => (
        obj.id === selectedObjectId && obj.type === 'text'
          ? { ...obj, text }
          : obj
      )))
    }

    const updateSelectedShapeText = (text: string) => {
      if (!selectedObjectId) return
      recordHistory()
      setObjects((prev) => prev.map((obj) => (
        obj.id === selectedObjectId && obj.type === 'shape'
          ? {
              ...obj,
              properties: {
                ...obj.properties,
                shapeText: text,
              },
            }
          : obj
      )))
    }

    const handleObjectOverlayMove = (event: React.PointerEvent<HTMLElement>, objectId: string) => {
      event.preventDefault()
      event.stopPropagation()
      recordHistory()
      let lastX = event.clientX
      let lastY = event.clientY

      const handleMove = (moveEvent: PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        const dx = (moveEvent.clientX - lastX) * scaleX
        const dy = (moveEvent.clientY - lastY) * scaleY
        lastX = moveEvent.clientX
        lastY = moveEvent.clientY
        moveObjectById(objectId, dx, dy)
      }

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }

    const updateObjectRotation = (objectId: string, rotation: number) => {
      setObjects((prev) => prev.map((obj) => (
        obj.id === objectId
          ? (() => {
              const nextObj = {
                ...obj,
                properties: {
                  ...obj.properties,
                  rotation,
                },
              }
              onObjectSelect?.(nextObj.id, nextObj.type, getObjectStyle(nextObj))
              return nextObj
            })()
          : obj
      )))
    }

    const resizeShapeObject = (
      objectId: string,
      updater: (obj: CanvasObject) => CanvasObject
    ) => {
      setObjects((prev) => prev.map((obj) => {
        if (obj.id !== objectId) return obj
        const nextObj = updater(obj)
        onObjectSelect?.(nextObj.id, nextObj.type, getObjectStyle(nextObj))
        return nextObj
      }))
    }

    const handleObjectOverlayRotate = (event: React.PointerEvent<HTMLButtonElement>, object: CanvasObject) => {
      event.preventDefault()
      event.stopPropagation()
      recordHistory()
      const bounds = getObjectBounds(object)
      const canvas = canvasRef.current
      if (!bounds || !canvas) return
      const canvasRect = canvas.getBoundingClientRect()
      const scaleX = canvasRect.width / canvas.width
      const scaleY = canvasRect.height / canvas.height
      const center = {
        x: canvasRect.left + (bounds.x + bounds.width / 2) * scaleX,
        y: canvasRect.top + (bounds.y + bounds.height / 2) * scaleY,
      }
      const startAngle = Math.atan2(event.clientY - center.y, event.clientX - center.x)
      const startRotation = object.properties.rotation || 0

      const handleMove = (moveEvent: PointerEvent) => {
        const currentAngle = Math.atan2(moveEvent.clientY - center.y, moveEvent.clientX - center.x)
        const delta = ((currentAngle - startAngle) * 180) / Math.PI
        updateObjectRotation(object.id, Math.round(startRotation + delta))
      }

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }

    const handleSelectedShapeResize = (
      event: React.PointerEvent<HTMLButtonElement>,
      object: CanvasObject,
      corner: 'nw' | 'ne' | 'sw' | 'se'
    ) => {
      if (!object.startPoint || !object.endPoint) return
      event.preventDefault()
      event.stopPropagation()
      recordHistory()
      const startPointer = { x: event.clientX, y: event.clientY }
      const initialStart = { ...object.startPoint }
      const initialEnd = { ...object.endPoint }

      const handleMove = (moveEvent: PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        const dx = (moveEvent.clientX - startPointer.x) * scaleX
        const dy = (moveEvent.clientY - startPointer.y) * scaleY

        resizeShapeObject(object.id, (obj) => {
          if (!obj.startPoint || !obj.endPoint) return obj
          let nextStart = { ...initialStart }
          let nextEnd = { ...initialEnd }

          if (corner.includes('n')) nextStart.y = initialStart.y + dy
          if (corner.includes('s')) nextEnd.y = initialEnd.y + dy
          if (corner.includes('w')) nextStart.x = initialStart.x + dx
          if (corner.includes('e')) nextEnd.x = initialEnd.x + dx

          if (Math.abs(nextEnd.x - nextStart.x) < 12) {
            nextEnd.x = nextStart.x + Math.sign(nextEnd.x - nextStart.x || 1) * 12
          }
          if (Math.abs(nextEnd.y - nextStart.y) < 12) {
            nextEnd.y = nextStart.y + Math.sign(nextEnd.y - nextStart.y || 1) * 12
          }

          return {
            ...obj,
            startPoint: nextStart,
            endPoint: nextEnd,
          }
        })
      }

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }

    const formatTimelineTime = (value: number) => {
      const safeValue = Math.max(0, value)
      const minutes = Math.floor(safeValue / 60)
      const seconds = Math.floor(safeValue % 60)
      const tenths = Math.floor((safeValue % 1) * 10)
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
    }

    const getObjectTimelineLabel = (object: CanvasObject) => {
      if (object.type === 'text') return object.text?.trim() || 'Text'
      if (object.type === 'shape') return object.properties.shapeText?.trim() || object.properties.shapeType || 'Shape'
      if (object.type === 'image') return object.properties.imageName || 'Image'
      return 'Drawing'
    }

    const getObjectAccent = (object: CanvasObject) => {
      if (object.type === 'text') return '#14b8a6'
      if (object.type === 'shape') return object.properties.strokeColor || '#0891b2'
      if (object.type === 'image') return '#8b5cf6'
      return object.properties.color || '#0f766a'
    }

    const updateObjectTimingById = (objectId: string, startTime: number, endTime: number) => {
      const duration = Math.max(0.1, videoState.duration || endTime || 0.1)
      const nextStart = Math.min(duration, Math.max(0, startTime))
      const nextEnd = Math.min(duration, Math.max(nextStart + 0.1, endTime))
      setObjects((prev) => prev.map((obj) => {
        if (obj.id !== objectId) return obj
        const nextObj = {
          ...obj,
          properties: {
            ...obj.properties,
            startTime: nextStart,
            endTime: nextEnd,
          },
        }
        if (obj.id === selectedObjectId) onObjectSelect?.(nextObj.id, nextObj.type, getObjectStyle(nextObj))
        return nextObj
      }))
    }

    const handleTimelinePointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
      object: CanvasObject,
      mode: 'move' | 'start' | 'end'
    ) => {
      event.preventDefault()
      event.stopPropagation()
      if (!videoState.duration) return

      recordHistory()
      onObjectSelect?.(object.id, object.type, getObjectStyle(object))

      const startX = event.clientX
      const originalStart = object.properties.startTime ?? 0
      const originalEnd = object.properties.endTime ?? videoState.duration
      const originalDuration = Math.max(0.1, originalEnd - originalStart)
      const timelineElement = event.currentTarget.closest('[data-video-timeline-track="true"]') as HTMLElement | null
      const timelineWidth = timelineElement?.getBoundingClientRect().width || 1

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaSeconds = ((moveEvent.clientX - startX) / timelineWidth) * videoState.duration
        if (mode === 'start') {
          updateObjectTimingById(object.id, originalStart + deltaSeconds, originalEnd)
          return
        }
        if (mode === 'end') {
          updateObjectTimingById(object.id, originalStart, originalEnd + deltaSeconds)
          return
        }

        const unclampedStart = originalStart + deltaSeconds
        const nextStart = Math.min(Math.max(0, unclampedStart), Math.max(0, videoState.duration - originalDuration))
        updateObjectTimingById(object.id, nextStart, nextStart + originalDuration)
      }

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }

    const updateAudioTiming = (startTime: number, endTime: number) => {
      const duration = Math.max(0.1, videoState.duration || endTime || 0.1)
      const nextStart = Math.min(duration, Math.max(0, startTime))
      const nextEnd = Math.min(duration, Math.max(nextStart + 0.1, endTime))
      setAudioStartTime(nextStart)
      setAudioEndTime(nextEnd)
      setAudioTrack((current) => current ? {
        ...current,
        startTime: nextStart,
        endTime: nextEnd,
      } : current)
      syncPreviewAudio()
    }

    const handleAudioTimelinePointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
      mode: 'move' | 'start' | 'end'
    ) => {
      event.preventDefault()
      event.stopPropagation()
      if (!videoState.duration) return

      const { startTime: originalStart, endTime: originalEnd } = getAudioTiming()
      const originalDuration = Math.max(0.1, originalEnd - originalStart)
      const startX = event.clientX
      const timelineElement = event.currentTarget.closest('[data-video-audio-track="true"]') as HTMLElement | null
      const timelineWidth = timelineElement?.getBoundingClientRect().width || 1

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaSeconds = ((moveEvent.clientX - startX) / timelineWidth) * videoState.duration
        if (mode === 'start') {
          updateAudioTiming(originalStart + deltaSeconds, originalEnd)
          return
        }
        if (mode === 'end') {
          updateAudioTiming(originalStart, originalEnd + deltaSeconds)
          return
        }

        const unclampedStart = originalStart + deltaSeconds
        const nextStart = Math.min(Math.max(0, unclampedStart), Math.max(0, videoState.duration - originalDuration))
        updateAudioTiming(nextStart, nextStart + originalDuration)
      }

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }

    const handlePlayheadPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!videoState.duration) return
      const timelineElement = event.currentTarget.closest('[data-video-main-timeline="true"]') as HTMLElement | null
      const timelineRect = timelineElement?.getBoundingClientRect()
      if (!timelineRect) return
      const trackOffset = 200

      const updateFromClientX = (clientX: number) => {
        const trackWidth = Math.max(1, timelineRect.width - trackOffset)
        const ratio = Math.min(1, Math.max(0, (clientX - timelineRect.left - trackOffset) / trackWidth))
        seekVideo(ratio * videoState.duration)
      }

      updateFromClientX(event.clientX)

      const handleMove = (moveEvent: PointerEvent) => updateFromClientX(moveEvent.clientX)
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }

    const handleImportImage = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || !file.type.startsWith('image/')) return
      const bounds = getImageBounds()
      if (!bounds) return

      const url = URL.createObjectURL(file)
      objectUrlRefs.current.add(url)
      const width = Math.min(bounds.width * 0.36, 360)
      const height = Math.min(bounds.height * 0.36, 260)
      const startTime = videoState.currentTime
      const endTime = videoState.duration > 0 ? Math.min(videoState.duration, startTime + 5) : startTime + 5
      const object: CanvasObject = {
        id: `image-${Date.now()}-${Math.random()}`,
        type: 'image',
        startPoint: {
          x: bounds.x + bounds.width / 2 - width / 2,
          y: bounds.y + bounds.height / 2 - height / 2,
        },
        endPoint: {
          x: bounds.x + bounds.width / 2 + width / 2,
          y: bounds.y + bounds.height / 2 + height / 2,
        },
        properties: {
          color: '#8b5cf6',
          size: 1,
          opacity: 100,
          rotation: 0,
          imageUrl: url,
          imageName: file.name,
          borderRadius: 12,
          borderWidth: 0,
          borderColor: '#ffffff',
          startTime,
          endTime,
        },
      }
      getCachedImage(url)
      pushObject(object, true)
    }

    const handleImportAudio = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || !file.type.startsWith('audio/')) return

      if (audioTrack?.url) {
        URL.revokeObjectURL(audioTrack.url)
        objectUrlRefs.current.delete(audioTrack.url)
      }
      const url = URL.createObjectURL(file)
      objectUrlRefs.current.add(url)
      const startTime = videoState.currentTime
      const endTime = videoState.duration > 0 ? videoState.duration : undefined
      setAudioStartTime(startTime)
      setAudioEndTime(endTime)
      setAudioTrack({
        url,
        name: file.name,
        mode: 'replacement',
        startTime,
        endTime,
      })
      const video = videoRef.current
      if (video) video.muted = true
    }

    const clearReplacementAudio = () => {
      if (audioTrack?.url) {
        URL.revokeObjectURL(audioTrack.url)
        objectUrlRefs.current.delete(audioTrack.url)
      }
      setAudioTrack(null)
      setAudioStartTime(0)
      setAudioEndTime(videoState.duration || undefined)
      const video = videoRef.current
      if (video) video.muted = false
    }

    const cursor = activeTool === 'pencil' || activeTool === 'highlighter'
      ? 'crosshair'
      : activeTool === 'crop'
        ? 'cell'
        : activeTool === 'fill'
          ? 'copy'
          : activeTool === 'eraser'
            ? 'not-allowed'
            : 'default'
    const audioTiming = getAudioTiming()
    const audioClipLeft = (audioTiming.startTime / audioTiming.duration) * 100
    const audioClipWidth = Math.max(3, ((audioTiming.endTime - audioTiming.startTime) / audioTiming.duration) * 100)

    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100">
      <div ref={containerRef} className="group/video-canvas relative min-h-0 w-full flex-1 overflow-hidden bg-slate-100">
        {imageUrl && !imageFailed && mediaType === 'image' ? (
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
            onLoad={drawCanvas}
            onError={() => setImageFailed(true)}
          />
        ) : imageUrl && !imageFailed && mediaType === 'video' ? (
          <video
            ref={videoRef}
            src={imageUrl}
            className={`absolute inset-0 h-full w-full object-contain ${hideBaseMedia ? 'opacity-0' : ''}`}
            playsInline
            muted={Boolean(audioTrack) || audioMuted}
            onLoadedMetadata={() => {
              updateVideoState()
              drawCanvas()
            }}
            onLoadedData={() => {
              updateVideoState()
              drawCanvas()
            }}
            onPlay={() => {
              syncPreviewAudio()
              updateVideoState()
            }}
            onPause={() => {
              audioRef.current?.pause()
              updateVideoState()
            }}
            onTimeUpdate={() => {
              syncPreviewAudio()
              updateVideoState()
              drawCanvas()
            }}
            onError={() => setImageFailed(true)}
          />
        ) : imageFailed ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">
            Could not decode image
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            No image loaded
          </div>
        )}
        {audioTrack && (
          <audio ref={audioRef} src={audioTrack.url} preload="auto" muted={audioMuted} />
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerAction}
          onPointerCancel={finishPointerAction}
          onPointerLeave={() => {
            if (isDrawing) finishPointerAction()
          }}
          style={{ cursor }}
        />
        {selectedTextObject?.startPoint && (
          <div
            className="absolute z-10 rounded-xl border border-cyan-500/80 bg-white/35 p-1 shadow-[0_18px_42px_rgba(8,145,178,0.22)] backdrop-blur-sm"
            style={{
              left: selectedTextObject.startPoint.x,
              top: selectedTextObject.startPoint.y - (selectedTextObject.properties.fontSize || 24),
              width: Math.max(80, (selectedTextObject.text || 'Text').length * (selectedTextObject.properties.fontSize || 24) * 0.62),
              minHeight: (selectedTextObject.properties.fontSize || 24) * 1.35,
              transform: `rotate(${selectedTextObject.properties.rotation || 0}deg)`,
              transformOrigin: 'left bottom',
            }}
          >
            <button
              type="button"
              className="absolute -left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-move items-center justify-center rounded-full border border-cyan-500 bg-white text-cyan-700 shadow-lg transition-transform hover:scale-105"
              onPointerDown={(event) => handleObjectOverlayMove(event, selectedTextObject.id)}
              title="Move text"
            >
              <Move size={16} />
            </button>
            <div className="pointer-events-none absolute -top-7 left-1/2 h-7 w-px -translate-x-1/2 bg-cyan-500/70" />
            <button
              type="button"
              className="absolute -top-12 left-1/2 flex h-9 w-9 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-cyan-500 bg-cyan-600 text-white shadow-lg transition-transform hover:scale-105 active:cursor-grabbing"
              onPointerDown={(event) => handleObjectOverlayRotate(event, selectedTextObject)}
              title="Rotate text"
            >
              <RotateCw size={17} />
            </button>
            <textarea
              value={selectedTextObject.text || ''}
              onChange={(event) => updateSelectedText(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              className="block h-full w-full resize-none overflow-hidden rounded-lg border border-white/80 bg-white/95 px-2 py-1 text-slate-900 outline-none shadow-inner transition-colors focus:border-cyan-300 focus:bg-white"
              style={{
                minHeight: (selectedTextObject.properties.fontSize || 24) * 1.35,
                color: selectedTextObject.properties.color,
                fontFamily: selectedTextObject.properties.fontFamily || 'Arial',
                fontSize: selectedTextObject.properties.fontSize || 24,
                fontWeight: selectedTextObject.properties.bold ? 700 : 400,
                fontStyle: selectedTextObject.properties.italic ? 'italic' : 'normal',
                pointerEvents: activeTool === 'text' ? 'auto' : 'none',
              }}
            />
          </div>
        )}
        {selectedShapeObject && (() => {
          const bounds = getObjectBounds(selectedShapeObject)
          if (!bounds) return null

          return (
            <div
              className="pointer-events-none absolute z-10 rounded-xl border border-cyan-500/80 bg-cyan-50/10 shadow-[0_18px_42px_rgba(8,145,178,0.2)] backdrop-blur-[1px]"
              style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                transform: `rotate(${selectedShapeObject.properties.rotation || 0}deg)`,
                transformOrigin: 'center center',
              }}
            >
              <button
                type="button"
                className="pointer-events-auto absolute -left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-move items-center justify-center rounded-full border border-cyan-500 bg-white text-cyan-700 shadow-lg transition-transform hover:scale-105"
                onPointerDown={(event) => handleObjectOverlayMove(event, selectedShapeObject.id)}
                title="Move shape"
              >
                <Move size={16} />
              </button>
              <div className="pointer-events-none absolute -top-7 left-1/2 h-7 w-px -translate-x-1/2 bg-cyan-500/70" />
              <button
                type="button"
                className="pointer-events-auto absolute -top-12 left-1/2 flex h-9 w-9 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-cyan-500 bg-cyan-600 text-white shadow-lg transition-transform hover:scale-105 active:cursor-grabbing"
                onPointerDown={(event) => handleObjectOverlayRotate(event, selectedShapeObject)}
                title="Rotate shape"
              >
                <RotateCw size={17} />
              </button>
              {[ 
                { corner: 'nw' as const, className: '-left-3 -top-3 cursor-nwse-resize' },
                { corner: 'ne' as const, className: '-right-3 -top-3 cursor-nesw-resize' },
                { corner: 'sw' as const, className: '-bottom-3 -left-3 cursor-nesw-resize' },
                { corner: 'se' as const, className: '-bottom-3 -right-3 cursor-nwse-resize' },
              ].map((handle) => (
                <button
                  key={handle.corner}
                  type="button"
                  className={`pointer-events-auto absolute flex h-7 w-7 items-center justify-center rounded-full border border-cyan-500 bg-white text-cyan-700 shadow-lg transition-transform hover:scale-110 ${handle.className}`}
                  onPointerDown={(event) => handleSelectedShapeResize(event, selectedShapeObject, handle.corner)}
                  title="Resize shape"
                >
                  <Maximize2 size={13} />
                </button>
              ))}
              {selectedShapeObject.properties.shapeType !== 'line' && (
                <textarea
                  value={selectedShapeObject.properties.shapeText || ''}
                  onChange={(event) => updateSelectedShapeText(event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  placeholder="Shape text"
                  className="pointer-events-auto absolute inset-3 resize-none overflow-hidden rounded-md border border-white/70 bg-white/80 px-2 py-1 text-slate-900 outline-none shadow-inner focus:border-cyan-300 focus:bg-white"
                  style={{
                    color: selectedShapeObject.properties.color,
                    fontFamily: selectedShapeObject.properties.fontFamily || 'Arial',
                    fontSize: selectedShapeObject.properties.fontSize || 20,
                    fontWeight: selectedShapeObject.properties.bold ? 700 : 400,
                    fontStyle: selectedShapeObject.properties.italic ? 'italic' : 'normal',
                    textAlign: selectedShapeObject.properties.shapeTextAlign || 'center',
                    display: 'flex',
                    alignItems:
                      selectedShapeObject.properties.shapeTextVerticalAlign === 'top'
                        ? 'flex-start'
                        : selectedShapeObject.properties.shapeTextVerticalAlign === 'bottom'
                          ? 'flex-end'
                          : 'center',
                  }}
                />
              )}
            </div>
          )
        })()}
      </div>
      {mediaType === 'video' && imageUrl && !imageFailed && (
        <div className="flex shrink-0 items-center justify-center border-t border-slate-200 bg-white px-3 py-2">
          <div className="flex w-[min(720px,100%)] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm">
            <button
              type="button"
              onClick={() => void toggleVideoPlayback()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white transition-colors hover:bg-teal-700"
              title={videoState.playing ? 'Pause video' : 'Play video'}
            >
              {videoState.playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            {captionOverlay?.onToggle && (
              <button
                data-video-cc="true"
                type="button"
                onClick={captionOverlay.onToggle}
                disabled={captionOverlay.loading}
                aria-label={captionOverlay.visible ? 'Turn captions off' : 'Turn captions on'}
                aria-pressed={captionOverlay.visible}
                className={`relative flex h-9 w-10 shrink-0 items-center justify-center rounded-md border text-[12px] font-black tracking-[-0.04em] transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  captionOverlay.visible
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50'
                }`}
                title={captionOverlay.loading
                  ? 'Creating captions...'
                  : captionOverlay.visible ? 'Turn captions off' : 'Turn captions on'}
              >
                CC
                {captionOverlay.visible && <span className="absolute bottom-1 left-2 right-2 h-0.5 rounded-full bg-red-500" />}
              </button>
            )}
            <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">
              {(timelineStartOffset + videoState.currentTime).toFixed(1)}s
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, videoState.duration)}
              step={0.1}
              value={Math.min(videoState.currentTime, Math.max(0.1, videoState.duration))}
              onChange={(event) => seekVideo(Number(event.target.value))}
              className="h-1 flex-1 cursor-pointer rounded-lg bg-slate-200 accent-teal-600"
              title="Video timeline"
            />
            <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-500">
              {(timelineTotalDuration || videoState.duration).toFixed(1)}s
            </span>
          </div>
        </div>
      )}
      {mediaType === 'video' && imageUrl && !imageFailed && (
        <div className="shrink-0 border-t border-slate-200 bg-[#f4f6f8] px-3 py-3 text-slate-900 shadow-[0_-12px_35px_rgba(15,23,42,0.08)]">
          <input ref={imageFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImportImage} />
          <input ref={audioFileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleImportAudio} />
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => imageFileInputRef.current?.click()}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-violet-300 hover:text-violet-700"
            >
              <ImageIcon size={15} />
              Image
            </button>
            <button
              type="button"
              onClick={() => audioFileInputRef.current?.click()}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-teal-300 hover:text-teal-700"
            >
              <Music size={15} />
              {audioTrack ? 'Change audio' : 'Add audio'}
            </button>
            {audioTrack && (
              <button
                type="button"
                onClick={clearReplacementAudio}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition-colors hover:border-red-200 hover:text-red-600"
              >
                Use original audio
              </button>
            )}
            <div className="ml-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold tabular-nums text-slate-700 shadow-sm">
              <Clock3 size={14} className="text-teal-600" />
              {formatTimelineTime(timelineStartOffset + videoState.currentTime)} / {formatTimelineTime(timelineTotalDuration || videoState.duration)}
            </div>
          </div>

          <div
            data-video-main-timeline="true"
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
          >
            <div className="grid grid-cols-[12rem_1fr] gap-2">
              <div />
              <div className="relative h-7 border-l border-slate-300">
                {Array.from({ length: 13 }).map((_, index) => {
                  const ratio = index / 12
                  const isMajor = index % 2 === 0
                  return (
                    <div
                      key={index}
                      className="absolute top-0 h-full -translate-x-px"
                      style={{ left: `${ratio * 100}%` }}
                    >
                      <div className={`${isMajor ? 'h-4 bg-slate-400' : 'h-2 bg-slate-300'} w-px`} />
                      {isMajor && (
                        <span className="absolute left-1 top-0 text-[11px] font-medium tabular-nums text-slate-600">
                          {formatTimelineTime(timelineStartOffset + (videoState.duration || 0) * ratio).replace('.0', '')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                className="flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
              >
                <Plus size={15} />
                Add elements
              </button>
              <div className="relative h-16 rounded-lg bg-slate-100">
                <div className="absolute inset-y-2 left-2 right-16 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex h-full min-w-full">
                    {videoThumbnails.length > 0 ? (
                      videoThumbnails.map((thumbnail, index) => (
                        <div key={`${thumbnail}-${index}`} className="h-full min-w-[96px] overflow-hidden border-r border-white bg-slate-200">
                          <img
                            src={thumbnail}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        </div>
                      ))
                    ) : (
                      Array.from({ length: 12 }).map((_, index) => (
                        <div key={index} className="h-full min-w-[96px] animate-pulse border-r border-white bg-slate-200">
                          <div className="h-full w-full bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-slate-200 text-slate-700 transition-colors hover:bg-slate-300"
                  title="Add element image"
                >
                  <Plus size={22} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => audioFileInputRef.current?.click()}
                className="flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
              >
                <Music size={15} />
                Add audio
              </button>
              <div className="relative h-12 rounded-lg bg-slate-100">
                <div
                  data-video-audio-track="true"
                  className="absolute inset-y-1 left-2 right-2 rounded-lg border border-slate-200 bg-white"
                  onPointerDown={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    seekVideo(((event.clientX - rect.left) / rect.width) * audioTiming.duration)
                  }}
                >
                  <div
                    className="absolute top-1/2 z-10 flex h-9 -translate-y-1/2 cursor-grab items-center gap-3 rounded-lg border border-teal-300 bg-teal-50 px-3 text-xs font-semibold text-teal-800 shadow-sm active:cursor-grabbing"
                    style={{
                      left: `${audioClipLeft}%`,
                      width: `${audioClipWidth}%`,
                      minWidth: 280,
                    }}
                    onPointerDown={(event) => handleAudioTimelinePointerDown(event, 'move')}
                    title={`${formatTimelineTime(audioTiming.startTime)} - ${formatTimelineTime(audioTiming.endTime)}`}
                  >
                    <div
                      className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-l-lg bg-teal-700/15"
                      onPointerDown={(event) => handleAudioTimelinePointerDown(event, 'start')}
                    />
                    {audioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    <span className="min-w-0 truncate">{audioTrack?.name || 'Original audio'}</span>
                    <span className="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[10px] tabular-nums text-teal-700">
                      {formatTimelineTime(audioTiming.startTime)} - {formatTimelineTime(audioTiming.endTime)}
                    </span>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => setAudioMuted((muted) => !muted)}
                      className={`ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        audioMuted
                          ? 'border-red-200 bg-red-50 text-red-600'
                          : 'border-teal-200 bg-white text-teal-700 hover:border-teal-300'
                      }`}
                      title={audioMuted ? 'Unmute audio' : 'Mute audio'}
                    >
                      {audioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={audioVolume}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => setAudioVolume(Number(event.target.value))}
                      className="h-1 w-28 shrink-0 cursor-pointer rounded-lg bg-teal-200 accent-teal-600"
                      title="Audio volume"
                    />
                    <span className="w-9 shrink-0 text-right tabular-nums">{audioVolume}%</span>
                    <div
                      className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-r-lg bg-teal-700/15"
                      onPointerDown={(event) => handleAudioTimelinePointerDown(event, 'end')}
                    />
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => audioFileInputRef.current?.click()}
                      className="h-7 shrink-0 rounded-md border border-teal-200 bg-white px-2 text-[11px] font-bold text-teal-700 transition-colors hover:border-teal-300"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="absolute bottom-2 top-2 z-30 w-0 cursor-ew-resize"
              style={{
                left: `calc(12.5rem + ${Math.min(100, Math.max(0, (videoState.currentTime / Math.max(0.1, videoState.duration || 0.1)) * 100))}% - ${12.5 * Math.min(1, Math.max(0, videoState.currentTime / Math.max(0.1, videoState.duration || 0.1)))}rem)`,
              }}
              onPointerDown={handlePlayheadPointerDown}
              title="Drag playhead"
            >
              <div className="-ml-1.5 h-3 w-3 rounded-b-sm bg-slate-950" />
              <div className="-ml-px h-[calc(100%-0.75rem)] w-0.5 bg-slate-950 shadow-[0_0_12px_rgba(15,23,42,0.24)]" />
            </div>

            <div className="mt-2 grid grid-cols-[12rem_1fr] gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700">
                <Scissors size={15} />
                Element clips
              </div>
              <div className="space-y-2">
                {objects.length === 0 ? (
                  <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs font-medium text-slate-500">
                    Add text, shapes, drawings, or images to create timed clips.
                  </div>
                ) : (
                  objects.map((object) => {
                    const duration = Math.max(0.1, videoState.duration || 0.1)
                    const startTime = Math.min(duration, Math.max(0, object.properties.startTime ?? 0))
                    const endTime = Math.min(duration, Math.max(startTime + 0.1, object.properties.endTime ?? duration))
                    const left = (startTime / duration) * 100
                    const width = Math.max(2, ((endTime - startTime) / duration) * 100)
                    const isSelected = object.id === selectedObjectId
                    const accent = getObjectAccent(object)

                    return (
                      <div
                        key={object.id}
                        data-video-timeline-track="true"
                        className="relative h-9 rounded-lg bg-slate-100"
                        onPointerDown={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect()
                          seekVideo(((event.clientX - rect.left) / rect.width) * duration)
                        }}
                      >
                        <div
                          className="absolute top-1/2 z-10 flex h-7 -translate-y-1/2 cursor-grab items-center rounded-lg border px-3 text-[11px] font-bold text-white shadow-sm transition-transform hover:scale-[1.01] active:cursor-grabbing"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            minWidth: 70,
                            borderColor: isSelected ? '#0f172a' : 'rgba(15,23,42,0.12)',
                            background: `linear-gradient(90deg, ${accent}, rgba(20,184,166,0.72))`,
                          }}
                          onPointerDown={(event) => handleTimelinePointerDown(event, object, 'move')}
                          onClick={() => onObjectSelect?.(object.id, object.type, getObjectStyle(object))}
                          title={`${formatTimelineTime(startTime)} - ${formatTimelineTime(endTime)}`}
                        >
                          <div
                            className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-l-lg bg-white/35"
                            onPointerDown={(event) => handleTimelinePointerDown(event, object, 'start')}
                          />
                          <span className="truncate drop-shadow">{getObjectTimelineLabel(object)}</span>
                          <div
                            className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-r-lg bg-white/35"
                            onPointerDown={(event) => handleTimelinePointerDown(event, object, 'end')}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    )
  }
)

ImageEditorCanvas.displayName = 'ImageEditorCanvas'

export default ImageEditorCanvas
