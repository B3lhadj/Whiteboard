import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, forwardRef, useImperativeHandle } from 'react'
import type { ImageDrawingTool, ShapeType } from './ImageEditorRibbon'

interface DrawingState {
  isDrawing: boolean
  startX: number
  startY: number
  lastX: number
  lastY: number
}

interface Point {
  x: number
  y: number
}

interface CanvasObject {
  id: string
  type: 'drawing' | 'shape' | 'text'
  tool: ImageDrawingTool
  startPoint: Point
  endPoint?: Point
  points?: Point[]
  text?: string
  properties: {
    brushSize: number
    brushOpacity: number
    brushColor: string
    fillColor: string
    strokeColor: string
    strokeWidth: number
    shapeType?: ShapeType
  }
}

interface ImageEditorCanvasProps {
  imageUrl: string
  activeTool: ImageDrawingTool
  brushSize: number
  brushOpacity: number
  brushColor: string
  fillColor: string
  strokeColor: string
  strokeWidth: number
  onCanvasChange?: (canvas: HTMLCanvasElement) => void
  selectedObjectId?: string
  onObjectSelect?: (id: string | null) => void
}

export interface ImageEditorCanvasHandle {
  deleteSelectedObject: () => void
  undo: () => void
  getCanvasObjects: () => CanvasObject[]
  getCanvas: () => HTMLCanvasElement | null
}

const ImageEditorCanvas = forwardRef<ImageEditorCanvasHandle, ImageEditorCanvasProps>(
  (
    {
      imageUrl,
      activeTool,
      brushSize,
      brushOpacity,
      brushColor,
      fillColor,
      strokeColor,
      strokeWidth,
      onCanvasChange,
      selectedObjectId,
      onObjectSelect,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null)
    const [drawingState, setDrawingState] = useState<DrawingState>({
      isDrawing: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
    })
    const [canvasObjects, setCanvasObjects] = useState<CanvasObject[]>([])
    const [selectedPoints, setSelectedPoints] = useState<Point[]>([])

    // Expose methods through ref
    useImperativeHandle(
      ref,
      () => ({
        deleteSelectedObject: () => {
          if (selectedObjectId) {
            setCanvasObjects((prev) => prev.filter((obj) => obj.id !== selectedObjectId))
            onObjectSelect?.(null)
            if (ctx) {
              redrawCanvas(ctx)
            }
          }
        },
        undo: () => {
          if (canvasObjects.length > 0) {
            const newObjects = canvasObjects.slice(0, -1)
            setCanvasObjects(newObjects)
            if (ctx) {
              redrawCanvas(ctx)
            }
          }
        },
        getCanvasObjects: () => canvasObjects,
        getCanvas: () => canvasRef.current,
      }),
      [canvasObjects, selectedObjectId, ctx]
    )

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const context = canvas.getContext('2d')
    if (!context) return

    const updateCanvasSize = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      setCtx(context)
      redrawCanvas(context)
    }

    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      updateCanvasSize()
    }
    image.src = imageUrl

    window.addEventListener('resize', updateCanvasSize)
    return () => window.removeEventListener('resize', updateCanvasSize)
  }, [imageUrl])

  const redrawCanvas = (context: CanvasRenderingContext2D) => {
    if (!canvasRef.current || !imageRef.current) return

    const canvas = canvasRef.current
    context.clearRect(0, 0, canvas.width, canvas.height)

    // Draw image
    const img = imageRef.current
    const containerWidth = canvas.width
    const containerHeight = canvas.height
    const imgRatio = img.width / img.height
    const containerRatio = containerWidth / containerHeight

    let drawWidth, drawHeight, offsetX, offsetY

    if (imgRatio > containerRatio) {
      drawWidth = containerWidth
      drawHeight = containerWidth / imgRatio
      offsetX = 0
      offsetY = (containerHeight - drawHeight) / 2
    } else {
      drawHeight = containerHeight
      drawWidth = containerHeight * imgRatio
      offsetX = (containerWidth - drawWidth) / 2
      offsetY = 0
    }

    context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

    // Draw canvas objects
    canvasObjects.forEach((obj) => {
      drawObject(context, obj)
    })

    onCanvasChange?.(canvas)
  }

  const drawObject = (context: CanvasRenderingContext2D, obj: CanvasObject) => {
    const { brushColor, brushOpacity, brushSize, strokeColor, strokeWidth, fillColor, shapeType } = obj.properties

    context.save()

    if (obj.type === 'drawing') {
      context.strokeStyle = brushColor
      context.lineWidth = brushSize
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.globalAlpha = brushOpacity / 100

      if (obj.points && obj.points.length > 0) {
        context.beginPath()
        context.moveTo(obj.points[0].x, obj.points[0].y)
        for (let i = 1; i < obj.points.length; i++) {
          context.lineTo(obj.points[i].x, obj.points[i].y)
        }
        context.stroke()
      }
    } else if (obj.type === 'shape' && obj.endPoint) {
      const { startPoint, endPoint } = obj
      const width = endPoint.x - startPoint.x
      const height = endPoint.y - startPoint.y

      context.globalAlpha = 1
      context.fillStyle = fillColor
      context.strokeStyle = strokeColor
      context.lineWidth = strokeWidth

      if (shapeType === 'rectangle') {
        context.fillRect(startPoint.x, startPoint.y, width, height)
        context.strokeRect(startPoint.x, startPoint.y, width, height)
      } else if (shapeType === 'circle') {
        const radius = Math.sqrt(width * width + height * height) / 2
        const centerX = startPoint.x + width / 2
        const centerY = startPoint.y + height / 2
        context.beginPath()
        context.arc(centerX, centerY, radius, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      } else if (shapeType === 'triangle') {
        context.beginPath()
        context.moveTo(startPoint.x + width / 2, startPoint.y)
        context.lineTo(startPoint.x + width, startPoint.y + height)
        context.lineTo(startPoint.x, startPoint.y + height)
        context.closePath()
        context.fill()
        context.stroke()
      } else if (shapeType === 'line') {
        context.beginPath()
        context.moveTo(startPoint.x, startPoint.y)
        context.lineTo(endPoint.x, endPoint.y)
        context.stroke()
      }
    }

    context.restore()

    // Highlight selected object
    if (obj.id === selectedObjectId) {
      context.strokeStyle = '#ff9500'
      context.lineWidth = 2
      context.setLineDash([5, 5])
      if (obj.type === 'shape' && obj.endPoint) {
        const width = obj.endPoint.x - obj.startPoint.x
        const height = obj.endPoint.y - obj.startPoint.y
        context.strokeRect(obj.startPoint.x, obj.startPoint.y, width, height)
      }
      context.setLineDash([])
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (activeTool === 'select') {
      // Check if clicking on an object
      for (let i = canvasObjects.length - 1; i >= 0; i--) {
        const obj = canvasObjects[i]
        if (isPointInObject(x, y, obj)) {
          onObjectSelect?.(obj.id)
          return
        }
      }
      onObjectSelect?.(null)
      return
    }

    setDrawingState({
      isDrawing: true,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
    })

    if (activeTool === 'pencil' || activeTool === 'highlighter') {
      setSelectedPoints([{ x, y }])
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingState.isDrawing || !canvasRef.current || !ctx) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (activeTool === 'pencil' || activeTool === 'highlighter') {
      const newPoints = [...selectedPoints, { x, y }]
      setSelectedPoints(newPoints)

      // Draw line segment
      ctx.strokeStyle = brushColor
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = brushOpacity / 100

      ctx.beginPath()
      ctx.moveTo(drawingState.lastX, drawingState.lastY)
      ctx.lineTo(x, y)
      ctx.stroke()

      ctx.globalAlpha = 1

      setDrawingState((prev) => ({
        ...prev,
        lastX: x,
        lastY: y,
      }))
    } else if (activeTool === 'eraser') {
      ctx.clearRect(x - brushSize / 2, y - brushSize / 2, brushSize, brushSize)

      setDrawingState((prev) => ({
        ...prev,
        lastX: x,
        lastY: y,
      }))
    }
  }

  const handlePointerUp = () => {
    if (!drawingState.isDrawing) return

    const { startX, startY } = drawingState

    if (activeTool === 'pencil' || activeTool === 'highlighter') {
      if (selectedPoints.length > 1) {
        const newObject: CanvasObject = {
          id: `obj-${Date.now()}`,
          type: 'drawing',
          tool: activeTool,
          startPoint: { x: startX, y: startY },
          points: selectedPoints,
          properties: {
            brushSize,
            brushOpacity,
            brushColor,
            fillColor,
            strokeColor,
            strokeWidth,
          },
        }
        setCanvasObjects([...canvasObjects, newObject])
      }
      setSelectedPoints([])
    } else if (['rectangle', 'circle', 'triangle', 'line'].includes(activeTool)) {
      const endX = drawingState.lastX
      const endY = drawingState.lastY

      if (Math.abs(endX - startX) > 2 && Math.abs(endY - startY) > 2) {
        const newObject: CanvasObject = {
          id: `obj-${Date.now()}`,
          type: 'shape',
          tool: activeTool,
          startPoint: { x: startX, y: startY },
          endPoint: { x: endX, y: endY },
          properties: {
            brushSize,
            brushOpacity,
            brushColor,
            fillColor,
            strokeColor,
            strokeWidth,
            shapeType: activeTool as ShapeType,
          },
        }
        setCanvasObjects([...canvasObjects, newObject])
      }
    }

    setDrawingState({
      isDrawing: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
    })

    if (ctx) {
      redrawCanvas(ctx)
    }
  }

  const isPointInObject = (x: number, y: number, obj: CanvasObject): boolean => {
    if (obj.type === 'drawing' && obj.points) {
      for (const point of obj.points) {
        const dist = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2)
        if (dist < obj.properties.brushSize + 5) return true
      }
    } else if (obj.type === 'shape' && obj.endPoint) {
      const minX = Math.min(obj.startPoint.x, obj.endPoint.x)
      const maxX = Math.max(obj.startPoint.x, obj.endPoint.x)
      const minY = Math.min(obj.startPoint.y, obj.endPoint.y)
      const maxY = Math.max(obj.startPoint.y, obj.endPoint.y)

      return x >= minX && x <= maxX && y >= minY && y <= maxY
    }
    return false
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-gray-900 overflow-hidden cursor-crosshair"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: activeTool === 'select' ? 'pointer' : 'crosshair' }}
      />
    </div>
  )
  }
)

ImageEditorCanvas.displayName = 'ImageEditorCanvas'

export default ImageEditorCanvas
