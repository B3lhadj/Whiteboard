import { useDocumentStore, FileType } from '../store'
import { getThemeForFileType } from '../utils'

export function getColorForFileType(fileType: FileType): string {
  return getThemeForFileType(fileType)
}

export function showSuccessToast(message: string, fileType?: FileType, duration?: number) {
  const store = useDocumentStore.getState()
  const color = fileType ? getThemeForFileType(fileType) : '#10b981'
  store.showToast(message, 'success', color, duration || 3000)
}

export function showErrorToast(message: string, duration?: number) {
  const store = useDocumentStore.getState()
  store.showToast(message, 'error', '#ef4444', duration || 4000)
}

export function showInfoToast(message: string, duration?: number) {
  const store = useDocumentStore.getState()
  store.showToast(message, 'info', '#3b82f6', duration || 3000)
}
