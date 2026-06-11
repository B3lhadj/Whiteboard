import { useState, useEffect, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import ImageEditorRibbon, { type ImageEditorRibbonActions, type ImageDrawingTool } from '../ImageEditorRibbon'
import ImageEditorCanvas, { type ImageEditorCanvasHandle } from '../ImageEditorCanvas'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils'

interface ImageEditorProps {
  file: DocumentFile
}

export default function ImageEditor({ file }: ImageEditorProps) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [activeTool, setActiveTool] = useState<ImageDrawingTool>('select')
  const [brushSize, setBrushSize] = useState(6)
  const [brushOpacity, setBrushOpacity] = useState(100)
  const [brushColor, setBrushColor] = useState('#000000')
  const [fillColor, setFillColor] = useState('#ffffff')
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [zoom, setZoom] = useState(100)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)

  const canvasRef = useRef<ImageEditorCanvasHandle>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const setEditorHtml = useDocumentStore((state) => state.setEditorHtml)
  const themeColor = getThemeForFileType(file.type)

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

  // Load image from file content
  useEffect(() => {
    if (file.content) {
      const blob = new Blob([file.content], { type: getMimeType(file.name) })
      const url = URL.createObjectURL(blob)
      setImageUrl(url)

      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [file])

  // Update image dimensions
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      useDocumentStore.getState().setWordCount(imageRef.current.naturalWidth)
      useDocumentStore.getState().setCharCount(imageRef.current.naturalHeight)
    }
  }, [imageUrl])

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 20, 200))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 20, 50))
  const handleRotateLeft = () => setRotation((prev) => (prev - 90) % 360)
  const handleRotateRight = () => setRotation((prev) => (prev + 90) % 360)
  const handleFlipHorizontal = () => setFlipH((prev) => !prev)
  const handleFlipVertical = () => setFlipV((prev) => !prev)

  const handleUndo = () => {
    canvasRef.current?.undo()
  }

  const handleDeleteSelected = () => {
    canvasRef.current?.deleteSelectedObject()
  }

  const handleExport = (format: 'png' | 'jpg' | 'pdf') => {
    const canvas = canvasRef.current?.getCanvas()
    if (!canvas) return

    const link = document.createElement('a')
    let dataUrl: string

    if (format === 'png') {
      dataUrl = canvas.toDataURL('image/png')
      link.download = `image-${Date.now()}.png`
    } else if (format === 'jpg') {
      dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      link.download = `image-${Date.now()}.jpg`
    } else if (format === 'pdf') {
      // For PDF, we'd need a library like jsPDF
      console.log('PDF export requires additional setup')
      return
    }

    link.href = dataUrl
    link.click()
  }

  const ribbonActions: ImageEditorRibbonActions = {
    onSetTool: setActiveTool,
    activeTool,
    onSetBrushSize: setBrushSize,
    onSetBrushOpacity: setBrushOpacity,
    onSetBrushColor: setBrushColor,
    brushSize,
    brushOpacity,
    brushColor,
    onSetFillColor: setFillColor,
    onSetStrokeColor: setStrokeColor,
    onSetStrokeWidth: setStrokeWidth,
    fillColor,
    strokeColor,
    strokeWidth,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    zoom,
    onRotateLeft: handleRotateLeft,
    onRotateRight: handleRotateRight,
    onFlipHorizontal: handleFlipHorizontal,
    onFlipVertical: handleFlipVertical,
    onUndo: handleUndo,
    onRedo: () => {},
    undoAvailable: true,
    redoAvailable: false,
    onDeleteSelected: handleDeleteSelected,
    onExport: handleExport,
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <ImageEditorRibbon actions={ribbonActions} />

      {/* Canvas area */}
      <div
        className="flex-1 min-h-0 bg-gray-900 overflow-hidden"
        style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'center top',
          transition: 'transform 0.2s ease',
        }}
      >
        <ImageEditorCanvas
          ref={canvasRef as any}
          imageUrl={imageUrl}
          activeTool={activeTool}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          brushColor={brushColor}
          fillColor={fillColor}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          selectedObjectId={selectedObjectId}
          onObjectSelect={setSelectedObjectId}
        />
      </div>

      <EditorNavigation
        current={1}
        total={1}
        onPrevious={() => undefined}
        onNext={() => undefined}
        accentColor="#0891b2"
        className="shrink-0 border-t border-gray-700 bg-gray-800"
        themeColor={themeColor}
      />
    </div>
  )
}