import { FileType } from './store'

export function getFileType(file: File): FileType {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.pptx')) return 'pptx'
  if (name.endsWith('.xlsm')) return 'xlsx'
  if (name.endsWith('.xls')) return 'xlsx'
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.pdf')) return 'pdf'
  // Image support
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif') || name.endsWith('.webp') || name.endsWith('.bmp') || name.endsWith('.svg')) return 'image'
  return null
}

export function getThemeForFileType(fileType: FileType): string {
  const themes: Record<string, string> = {
    docx: '#2b579a',
    xlsx: '#217346',
    pptx: '#c2410c',
    pdf: '#dc2626',
    image: '#0891b2',
    whiteboard: '#7c3aed',
    default: '#2b579a',
  }
  return themes[fileType || 'default'] || themes.default
}

export function getThemeNameForFileType(fileType: FileType): string {
  const names: Record<string, string> = {
    docx: 'Word Blue',
    xlsx: 'Excel Green',
    pptx: 'PowerPoint Red',
    pdf: 'Adobe Red',
    image: 'Image Cyan',
    whiteboard: 'Whiteboard Purple',
    default: 'Default Blue',
  }
  return names[fileType || 'default'] || 'Default'
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export function calculateWordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length
}

export function calculateCharCount(text: string): number {
  return text.length
}
export interface PageDimensions {
  layout: 'portrait' | 'landscape'
  width: number
  height: number
  aspectRatio: string
}

export function getPageDimensions(fileType?: FileType, orientation?: 'portrait' | 'landscape'): PageDimensions {
  // Determine base layout based on file type
  const baseLayout = fileType === 'pptx' ? 'landscape' : 'portrait'

  // Use provided orientation or fall back to base layout
  const currentLayout = orientation || baseLayout

  switch (currentLayout) {
    case 'landscape':
      return {
        layout: 'landscape',
        width: 1120, // ~16:9 aspect ratio width
        height: 630, // ~16:9 aspect ratio height
        aspectRatio: '16 / 9',
      }

    case 'portrait':
    default:
      return {
        layout: 'portrait',
        width: 794, // A4 width equivalent
        height: 1123, // A4 height equivalent
        aspectRatio: '210 / 297', // A4 aspect ratio
      }
  }
}
export function generateFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}
