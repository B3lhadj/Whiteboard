import { FileType } from './store'

export function getFileType(file: File): FileType {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.pptx')) return 'pptx'
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.pdf')) return 'pdf'
  return null
}

export function getThemeForFileType(fileType: FileType): string {
  const themes: Record<string, string> = {
    docx: '#2b579a',
    xlsx: '#217346',
    pptx: '#b7472a',
    pdf: '#e02b20',
    default: '#3b82f6',
  }
  return themes[fileType || 'default'] || themes.default
}

export function getThemeNameForFileType(fileType: FileType): string {
  const names: Record<string, string> = {
    docx: 'Word Blue',
    xlsx: 'Excel Green',
    pptx: 'PowerPoint Red',
    pdf: 'Adobe Red',
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
