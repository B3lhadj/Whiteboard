import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import ImageEditorCanvas, { type ImageEditorCanvasHandle, type ImageEditorObjectType, type ImageObjectStyle } from '../ImageEditorCanvas'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils'
import type { ImageDrawingTool, ShapeTextAlign, ShapeTextVerticalAlign } from '../ImageEditorRibbon'

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

interface ImageEditorProps {
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
  onObjectSelect?: (id: string | undefined, type?: ImageEditorObjectType, style?: ImageObjectStyle) => void
  onBackgroundFill?: (color: string) => void
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void
}

export interface ImageEditorHandle {
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

const getMimeType = (filename: string): string => {
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

const canvasToBlob = (canvas: HTMLCanvasElement, format: 'png' | 'jpg' = 'png') =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not render image'))
      },
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      0.92
    )
  })

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

const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(function ImageEditor(
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
    onObjectSelect,
    onBackgroundFill,
    onHistoryChange,
  },
  ref
) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<ImageEditorCanvasHandle>(null)
  const activeUrlRef = useRef<string>('')
  const zoom = useDocumentStore((state) => state.zoom)
  const themeColor = getThemeForFileType(file.type)

  const contentToBlob = (content: unknown): Blob => {
    const mimeType = getMimeType(file.name)

    if (content instanceof Blob) return content
    if (content instanceof ArrayBuffer) return new Blob([content], { type: mimeType })
    if (ArrayBuffer.isView(content)) {
      const bytes = new Uint8Array(content.byteLength)
      bytes.set(new Uint8Array(content.buffer, content.byteOffset, content.byteLength))
      return new Blob([bytes.buffer], { type: mimeType })
    }
    if (typeof content === 'string') {
      if (content.startsWith('data:')) {
        const [header, base64Data] = content.split(',')
        const contentType = header.match(/^data:([^;]+)/)?.[1] || mimeType
        const binary = atob(base64Data || '')
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i)
        }
        return new Blob([bytes], { type: contentType })
      }
      return new Blob([content], { type: mimeType })
    }

    throw new Error('Unsupported image content type')
  }

  const setRenderedBlob = async (blob: Blob) => {
    const nextUrl = URL.createObjectURL(blob)
    if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current)
    activeUrlRef.current = nextUrl
    setImageUrl(nextUrl)
    canvasRef.current?.clearObjects()
  }

  const replaceWithCanvas = async (canvas: HTMLCanvasElement) => {
    const blob = await canvasToBlob(canvas)
    await setRenderedBlob(blob)
  }

  const transformImage = async (operation: 'rotate-left' | 'rotate-right' | 'flip-horizontal' | 'flip-vertical') => {
    const source = canvasRef.current?.exportCanvas()
    if (!source) return

    const output = document.createElement('canvas')
    const isRotate = operation === 'rotate-left' || operation === 'rotate-right'
    output.width = isRotate ? source.height : source.width
    output.height = isRotate ? source.width : source.height
    const ctx = output.getContext('2d')
    if (!ctx) return

    if (operation === 'rotate-left') {
      ctx.translate(0, output.height)
      ctx.rotate(-Math.PI / 2)
    } else if (operation === 'rotate-right') {
      ctx.translate(output.width, 0)
      ctx.rotate(Math.PI / 2)
    } else if (operation === 'flip-horizontal') {
      ctx.translate(output.width, 0)
      ctx.scale(-1, 1)
    } else if (operation === 'flip-vertical') {
      ctx.translate(0, output.height)
      ctx.scale(1, -1)
    }

    ctx.drawImage(source, 0, 0)
    await replaceWithCanvas(output)
  }

  const handleCropComplete = async (rect: CropRect) => {
    const cropped = canvasRef.current?.exportCanvas(rect)
    if (!cropped) return
    await replaceWithCanvas(cropped)
  }

  const exportImage = (format: 'png' | 'jpg' | 'pdf' | 'webm') => {
    if (format === 'webm') return
    const canvas = canvasRef.current?.exportCanvas()
    if (!canvas) return

    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image'
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
    rotateLeft: () => void transformImage('rotate-left'),
    rotateRight: () => void transformImage('rotate-right'),
    flipHorizontal: () => void transformImage('flip-horizontal'),
    flipVertical: () => void transformImage('flip-vertical'),
    setSelectedShapeDimensions: (width, height) => canvasRef.current?.setSelectedShapeDimensions(width, height),
    setSelectedImageStyle: (style) => canvasRef.current?.setSelectedImageStyle(style),
    setSelectedObjectTiming: (startTime, endTime) => canvasRef.current?.setSelectedObjectTiming(startTime, endTime),
    exportVideo: async () => undefined,
    exportImage,
  }))

  useEffect(() => {
    if (!file.content) {
      setError('No image content found')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const blob = contentToBlob(file.content)
      const url = URL.createObjectURL(blob)
      if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current)
      activeUrlRef.current = url
      setImageUrl(url)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image')
      setLoading(false)
    }

    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current)
        activeUrlRef.current = ''
      }
    }
  }, [file])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100">
        <div className="text-slate-500">Loading image...</div>
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

  if (!imageUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100">
        <div className="text-slate-500">No image to display</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto" style={{ backgroundColor }}>
        <div
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease',
            width: '100%',
            height: '100%',
          }}
        >
          <ImageEditorCanvas
            ref={canvasRef}
            imageUrl={imageUrl}
            mediaType="image"
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
            onCropComplete={handleCropComplete}
            onBackgroundFill={onBackgroundFill}
            onHistoryChange={onHistoryChange}
          />
        </div>
      </div>

      <EditorNavigation
        current={1}
        total={1}
        onPrevious={() => undefined}
        onNext={() => undefined}
        accentColor="#0891b2"
        className="shrink-0 border-t border-slate-200 bg-white"
        themeColor={themeColor}
      />
    </div>
  )
})

export default ImageEditor
