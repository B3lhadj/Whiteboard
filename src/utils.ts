import type { FileType } from './store'
import { getDefaultPageSizeForFileType, getPageSize, type PageOrientation, type PageSizePreset } from './pageLayout'

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
    default: 'Default Blue',
  }
  return names[fileType || 'default'] || 'Default'
}

export function getEditorLanguageSettings(language: string) {
  const normalizedLanguage = normalizeEditorLanguage(language)
  const settings: Record<string, { lang: string; dir: 'ltr' | 'rtl' }> = {
    English: { lang: 'en', dir: 'ltr' },
    Arabic: { lang: 'ar', dir: 'rtl' },
    French: { lang: 'fr', dir: 'ltr' },
    Spanish: { lang: 'es', dir: 'ltr' },
  }

  return settings[normalizedLanguage] || settings.English
}

export function normalizeEditorLanguage(language: string) {
  const normalized = language.trim().toLowerCase()
  const aliases: Record<string, string> = {
    english: 'English',
    anglais: 'English',
    ingles: 'English',
    الانجليزية: 'English',
    arabic: 'Arabic',
    arabe: 'Arabic',
    ar: 'Arabic',
    العربية: 'Arabic',
    french: 'French',
    francais: 'French',
    français: 'French',
    frances: 'French',
    الفرنسية: 'French',
    spanish: 'Spanish',
    espagnol: 'Spanish',
    espanol: 'Spanish',
    español: 'Spanish',
    الاسبانية: 'Spanish',
  }

  return aliases[normalized] || 'English'
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
  layout: PageOrientation
  width: number
  height: number
  aspectRatio: string
}

export function getPageDimensions(
  fileType?: FileType,
  orientation?: PageOrientation,
  pageSize?: PageSizePreset
): PageDimensions {
  const size = getPageSize(pageSize || getDefaultPageSizeForFileType(fileType))

  // Determine base layout based on file type.
  const baseLayout: PageOrientation = fileType === 'pptx' ? 'landscape' : 'portrait'
  const currentLayout = orientation || baseLayout
  const shouldSwap =
    (currentLayout === 'portrait' && size.width > size.height) ||
    (currentLayout === 'landscape' && size.width < size.height)
  const baseWidth = shouldSwap ? size.height : size.width
  const height = shouldSwap ? size.width : size.height
  const width =
    currentLayout === 'landscape' && fileType !== 'pptx' && pageSize !== 'screen16x9'
      ? Math.round(baseWidth * 1.24)
      : baseWidth

  return {
    layout: currentLayout,
    width,
    height,
    aspectRatio: `${width} / ${height}`,
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
