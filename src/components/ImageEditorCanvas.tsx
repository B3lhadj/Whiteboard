import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { ImageDrawingTool } from './ImageEditorRibbon'

interface Point {
  x: number
  y: number
}

interface CanvasObject {
  id: string
  type: 'drawing' | 'shape'
  points?: Point[]
  startPoint?: Point
  endPoint?: Point
  properties: {
    color: string
    size: number
    opacity: number
    shapeType?: string
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
  selectedObjectId?: string
  onObjectSelect?: (id: string | undefined) => void
}

export interface ImageEditorCanvasHandle {
  undo: () => void
  deleteSelectedObject: () => void
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
      selectedObjectId,
      onObjectSelect,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [lastPoint, setLastPoint] = useState<Point | null>(null)
    const [objects, setObjects] = useState<CanvasObject[]>([])

    useImperativeHandle(ref, () => ({
      undo: () => {
        setObjects(prev => prev.slice(0, -1))
      },
      deleteSelectedObject: () => {
        if (selectedObjectId) {
          setObjects(prev => prev.filter(obj => obj.id !== selectedObjectId))
          onObjectSelect?.(undefined)
        }
      },
      getCanvas: () => canvasRef.current,
    }), [selectedObjectId, onObjectSelect])

    // Draw canvas function
    const drawCanvas = useCallback(() => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size to match container
      const rect = container.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width || container.clientWidth))
      const height = Math.max(1, Math.floor(rect.height || container.clientHeight))
      canvas.width = width
      canvas.height = height

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw all objects
      objects.forEach(obj => {
        if (obj.type === 'drawing' && obj.points && obj.points.length > 1) {
          ctx.beginPath()
          ctx.strokeStyle = obj.properties.color
          ctx.lineWidth = obj.properties.size
          ctx.globalAlpha = obj.properties.opacity / 100
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          
          ctx.moveTo(obj.points[0].x, obj.points[0].y)
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y)
          }
          ctx.stroke()
        }
      })

      // Reset alpha
      ctx.globalAlpha = 1
    }, [objects])

    // Redraw when dependencies change
    useEffect(() => {
      drawCanvas()
    }, [drawCanvas])

    // Handle resize
    useEffect(() => {
      let frameId = 0
      const handleResize = () => {
        window.cancelAnimationFrame(frameId)
        frameId = window.requestAnimationFrame(drawCanvas)
      }

      window.addEventListener('resize', handleResize)
      const resizeObserver = new ResizeObserver(handleResize)
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current)
      }

      handleResize()

      return () => {
        window.cancelAnimationFrame(frameId)
        window.removeEventListener('resize', handleResize)
        resizeObserver.disconnect()
      }
    }, [drawCanvas])

    // Convert screen coordinates to canvas coordinates
    const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    }

    // Start drawing
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool !== 'pencil') return
      
      const point = getCanvasCoordinates(e)
      setIsDrawing(true)
      setLastPoint(point)
      
      // Start new drawing object
      const newObject: CanvasObject = {
        id: `drawing-${Date.now()}-${Math.random()}`,
        type: 'drawing',
        points: [point],
        properties: {
          color: brushColor,
          size: brushSize,
          opacity: brushOpacity,
        },
      }
      setObjects(prev => [...prev, newObject])
    }

    // Draw while moving
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || activeTool !== 'pencil') return
      
      const currentPoint = getCanvasCoordinates(e)
      if (!lastPoint) return
      
      // Update the last drawing object
      setObjects(prev => {
        const newObjects = [...prev]
        const lastObject = newObjects[newObjects.length - 1]
        if (lastObject && lastObject.type === 'drawing' && lastObject.points) {
          lastObject.points = [...lastObject.points, currentPoint]
        }
        return newObjects
      })
      
      setLastPoint(currentPoint)
    }

    // Stop drawing
    const handleMouseUp = () => {
      setIsDrawing(false)
      setLastPoint(null)
    }

    return (
      <div ref={containerRef} className="relative min-h-0 w-full h-full overflow-hidden bg-gray-900">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            No image loaded
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: activeTool === 'pencil' ? 'crosshair' : 'default' }}
        />
      </div>
    )
  }
)

ImageEditorCanvas.displayName = 'ImageEditorCanvas'

export default ImageEditorCanvas
