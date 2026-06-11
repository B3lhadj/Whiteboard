import { useState, useEffect, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import ImageEditorCanvas, { type ImageEditorCanvasHandle } from '../ImageEditorCanvas'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils'

interface ImageEditorProps {
  file: DocumentFile
}

export default function ImageEditor({ file }: ImageEditorProps) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTool] = useState('pencil')
  const [brushSize] = useState(6)
  const [brushOpacity] = useState(100)
  const [brushColor] = useState('#ff0000')
  const [fillColor] = useState('#ffffff')
  const [strokeColor] = useState('#000000')
  const [strokeWidth] = useState(2)
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>(undefined)

  const canvasRef = useRef<ImageEditorCanvasHandle>(null)
  const zoom = useDocumentStore((state) => state.zoom)
  const themeColor = getThemeForFileType(file.type)

  const getMimeType = (filename: string): string => {
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

  const contentToBlob = (content: unknown): Blob => {
    const mimeType = getMimeType(file.name)

    if (content instanceof Blob) {
      return content
    }

    if (content instanceof ArrayBuffer) {
      return new Blob([content], { type: mimeType })
    }

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

  // Load image from file content
  useEffect(() => {
    if (!file.content) {
      setError('No image content found')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log('Loading image, content type:', typeof file.content)
      console.log('File name:', file.name)

      const blob = contentToBlob(file.content)

      const url = URL.createObjectURL(blob)
      console.log('Created blob URL, size:', blob.size)
      setImageUrl(url)
      setLoading(false)
      
      return () => {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Failed to load image:', err)
      setError(err instanceof Error ? err.message : 'Failed to load image')
      setLoading(false)
    }
  }, [file])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-gray-400">Loading image...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-red-400">Error: {error}</div>
      </div>
    )
  }

  if (!imageUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-gray-400">No image to display</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div
        className="flex-1 min-h-0 bg-gray-900 overflow-auto"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease',
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ImageEditorCanvas
            ref={canvasRef as any}
            imageUrl={imageUrl}
            activeTool={activeTool as any}
            brushSize={brushSize}
            brushOpacity={brushOpacity}
            brushColor={brushColor}
            fillColor={fillColor}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            selectedObjectId={selectedObjectId}
            onObjectSelect={(id) => setSelectedObjectId(id)}
          />
        </div>
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
