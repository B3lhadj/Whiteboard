import { create } from 'zustand'
import {
  DEFAULT_PAGE_COLUMNS,
  DEFAULT_PAGE_MARGIN_PRESET,
  getDefaultPageSizeForFileType,
  type PageColumnCount,
  type PageMarginPreset,
  type PageOrientation,
  type PageSizePreset,
} from './pageLayout'
import type { ShapeKind } from './shapes'

export type FileType = 'docx' | 'pptx' | 'xlsx' | 'pdf' | 'image' | 'whiteboard' | null
export type ThemeColor = 'blue' | 'green' | 'red' | 'dark' | 'teal' | 'purple' | 'amber'
export type ToolbarTool = 'select' | 'shape' | 'image' | 'draw' | 'text' | 'erase'
export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
  color?: string
  duration?: number
}

export interface DocumentFile {
  id: string
  name: string
  type: FileType
  size: number
  content: ArrayBuffer
  uploadedAt: number
  slides?: any[] // For Flask-parsed PPTX slides
  originalType?: FileType
  workflow?: 'pdf-to-word' | 'pdf-to-docx' | 'pdf-to-pptx' | 'pptx-to-word'
  viewOnly?: boolean
  pageOrder?: number[] // For PDF/Word page ordering (array of original page indices)
  wordPages?: any[] // For Word document page previews
  sheetOrder?: string[] // For Excel sheet ordering
}

export interface DocumentState {
  currentFile: DocumentFile | null
  recentFiles: DocumentFile[]
  selectedTheme: ThemeColor
  darkMode: boolean
  zoom: number
  pageOrientation: PageOrientation
  pageMarginPreset: PageMarginPreset
  pageSize: PageSizePreset
  pageColumns: PageColumnCount
  currentPage: number
  wordCount: number
  charCount: number
  editorHtml: string
  activeTool: ToolbarTool
  selectedShape: ShapeKind
  textColor: string
  textFontFamily: string
  textFontSize: number
  selectedLanguage: string
  toasts: ToastMessage[]

  // Actions
  setCurrentFile: (file: DocumentFile) => void
  setPageOrientation: (orientation: PageOrientation) => void
  setPageMarginPreset: (preset: PageMarginPreset) => void
  setPageSize: (size: PageSizePreset) => void
  setPageColumns: (columns: PageColumnCount) => void
  addRecentFile: (file: DocumentFile) => void
  removeRecentFile: (id: string) => void
  setSelectedTheme: (theme: ThemeColor) => void
  toggleDarkMode: () => void
  setZoom: (zoom: number) => void
  setCurrentPage: (page: number) => void
  setWordCount: (count: number) => void
  setCharCount: (count: number) => void
  setEditorHtml: (html: string) => void
  setActiveTool: (tool: ToolbarTool) => void
  setSelectedShape: (shape: ShapeKind) => void
  setTextColor: (color: string) => void
  setTextFontFamily: (font: string) => void
  setTextFontSize: (size: number) => void
  setSelectedLanguage: (language: string) => void
  clearCurrentFile: () => void
  loadRecentFilesFromStorage: () => void
  saveRecentFilesToStorage: () => void
  showToast: (message: string, type: ToastType, color?: string, duration?: number) => void
  removeToast: (id: string) => void

  // Slide Management (PowerPoint)
  deleteSlide: (slideId: string) => void
  addSlide: () => void
  moveSlide: (slideId: string, direction: 'up' | 'down') => void
  toggleViewMode: () => void

  // Page Management (PDF/Word)
  deletePage: (pageIndex: number) => void
  addPage: () => void
  movePage: (pageIndex: number, direction: 'up' | 'down') => void
  updatePageOrder: (pageOrder: number[]) => void

  // Sheet Management (Excel)
  deleteSheet: (sheetName: string) => void
  addSheet: (sheetName: string) => void
  moveSheet: (sheetName: string, direction: 'up' | 'down') => void
  updateSheetOrder: (sheetOrder: string[]) => void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentFile: null,
  recentFiles: [],
  selectedTheme: 'blue',
  darkMode: false,
  zoom: 100,
  pageOrientation: 'portrait',
  pageMarginPreset: DEFAULT_PAGE_MARGIN_PRESET,
  pageSize: 'a4',
  pageColumns: DEFAULT_PAGE_COLUMNS,
  currentPage: 1,
  wordCount: 0,
  charCount: 0,
  editorHtml: '',
  activeTool: 'select',
  selectedShape: 'rectangle',
  textColor: '#111827',
  textFontFamily: 'Calibri',
  textFontSize: 16,
  selectedLanguage: 'English',
  toasts: [],

  setCurrentFile: (file) => {
    // Set initial orientation based on file type
    const initialOrientation = file.type === 'pptx' ? 'landscape' : 'portrait'
    set({
      currentFile: file,
      currentPage: 1,
      zoom: 100,
      pageOrientation: initialOrientation,
      pageMarginPreset: DEFAULT_PAGE_MARGIN_PRESET,
      pageSize: getDefaultPageSizeForFileType(file.type),
      pageColumns: DEFAULT_PAGE_COLUMNS,
    })
  },

  addRecentFile: (file) => {
    set((state) => {
      const filtered = state.recentFiles.filter((f) => f.id !== file.id)
      const updated = [file, ...filtered].slice(0, 10) // Keep last 10 files
      return { recentFiles: updated }
    })
    get().saveRecentFilesToStorage()
  },

  removeRecentFile: (id) => {
    set((state) => ({
      recentFiles: state.recentFiles.filter((f) => f.id !== id),
    }))
    get().saveRecentFilesToStorage()
  },

  setSelectedTheme: (theme) => {
    set({ selectedTheme: theme })
    localStorage.setItem('selectedTheme', theme)
  },

  toggleDarkMode: () => {
    set((state) => {
      const newMode = !state.darkMode
      localStorage.setItem('darkMode', String(newMode))
      return { darkMode: newMode }
    })
  },

  setZoom: (zoom) => set({ zoom: Math.min(200, Math.max(50, zoom)) }),

  setCurrentPage: (page) => set({ currentPage: page }),
  setPageOrientation: (orientation) => set({ pageOrientation: orientation }),
  setPageMarginPreset: (preset) => set({ pageMarginPreset: preset }),
  setPageSize: (size) => set({ pageSize: size }),
  setPageColumns: (columns) => set({ pageColumns: columns }),

  setWordCount: (count) => set({ wordCount: count }),

  setCharCount: (count) => set({ charCount: count }),

  setEditorHtml: (html) => set({ editorHtml: html }),

  setActiveTool: (tool) => set({ activeTool: tool }),
  setSelectedShape: (shape) => set({ selectedShape: shape, activeTool: shape === 'text-box' ? 'text' : 'shape' }),

  setTextColor: (color) => set({ textColor: color }),

  setTextFontFamily: (font) => set({ textFontFamily: font }),

  setTextFontSize: (size) => set({ textFontSize: size }),

  setSelectedLanguage: (language) => {
    set({ selectedLanguage: language })
    localStorage.setItem('selectedLanguage', language)
  },

  clearCurrentFile: () => {
    set({
      currentFile: null,
      currentPage: 1,
      pageOrientation: 'portrait',
      pageMarginPreset: DEFAULT_PAGE_MARGIN_PRESET,
      pageSize: 'a4',
      pageColumns: DEFAULT_PAGE_COLUMNS,
      wordCount: 0,
      charCount: 0,
      editorHtml: '',
      activeTool: 'select',
      selectedShape: 'rectangle',
      zoom: 100,
    })
  },

  loadRecentFilesFromStorage: () => {
    const stored = localStorage.getItem('recentFiles')
    if (stored) {
      try {
        const files = JSON.parse(stored) as Partial<DocumentFile>[]
        set({ recentFiles: files as DocumentFile[] })
      } catch (error) {
        console.error('Failed to load recent files:', error)
      }
    }
    const theme = localStorage.getItem('selectedTheme') as ThemeColor || 'blue'
    const selectedLanguage = localStorage.getItem('selectedLanguage') || 'English'
    const darkMode = localStorage.getItem('darkMode') === 'true'
    set({ selectedTheme: theme, darkMode, selectedLanguage })
  },

  saveRecentFilesToStorage: () => {
    const { recentFiles } = get()
    const simplified = recentFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      uploadedAt: f.uploadedAt,
    }))
    localStorage.setItem('recentFiles', JSON.stringify(simplified))
  },

  showToast: (message, type, color, duration) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const toast: ToastMessage = { id, message, type, color, duration }
    set((state) => ({
      toasts: [...state.toasts, toast],
    }))
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  deleteSlide: (slideId) => {
    set((state) => {
      if (!state.currentFile || !state.currentFile.slides) return state
      const slides = state.currentFile.slides.filter(s => s.id !== slideId)
      return {
        currentFile: { ...state.currentFile, slides }
      }
    })
  },

  addSlide: () => {
    set((state) => {
      if (!state.currentFile) return state
      const slides = [...(state.currentFile.slides || [])]
      const newIndex = slides.length + 1
      slides.push({
        id: `slide-new-${Date.now()}`,
        pageNumber: newIndex,
        title: `New Slide ${newIndex}`,
        textElements: [
          { runs: [{ text: 'New Slide Title', bold: true }], type: 'title' },
          { runs: [{ text: 'Click to add text' }], type: 'body' }
        ],
        images: [],
        fullText: 'New Slide Title\nClick to add text',
        isNew: true
      })
      return {
        currentFile: { ...state.currentFile, slides }
      }
    })
  },

  moveSlide: (slideId, direction) => {
    set((state) => {
      if (!state.currentFile || !state.currentFile.slides) return state
      const slides = [...state.currentFile.slides]
      const index = slides.findIndex(s => s.id === slideId)
      if (index === -1) return state

      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= slides.length) return state

      const temp = slides[index]
      slides[index] = slides[newIndex]
      slides[newIndex] = temp

      return {
        currentFile: { ...state.currentFile, slides }
      }
    })
  },

  toggleViewMode: () => {
    set((state) => {
      if (!state.currentFile) return state
      return {
        currentFile: { ...state.currentFile, viewOnly: !state.currentFile.viewOnly }
      }
    })
  },

  deletePage: (pageIndex) => {
    set((state) => {
      if (!state.currentFile || !state.currentFile.pageOrder) return state
      const pageOrder = state.currentFile.pageOrder.filter((_, i) => i !== pageIndex)
      const newCurrentPage = Math.max(1, Math.min(state.currentPage, pageOrder.length))
      return {
        currentFile: { ...state.currentFile, pageOrder },
        currentPage: newCurrentPage
      }
    })
  },

  addPage: () => {
    set((state) => {
      if (!state.currentFile || !state.currentFile.pageOrder) return state
      const pageOrder = [...state.currentFile.pageOrder, -1] // -1 represents a new blank page
      return {
        currentFile: { ...state.currentFile, pageOrder }
      }
    })
  },

  movePage: (pageIndex, direction) => {
    set((state) => {
      if (!state.currentFile || !state.currentFile.pageOrder) return state
      const pageOrder = [...state.currentFile.pageOrder]
      const newIndex = direction === 'up' ? pageIndex - 1 : pageIndex + 1

      if (newIndex < 0 || newIndex >= pageOrder.length) return state

      const temp = pageOrder[pageIndex]
      pageOrder[pageIndex] = pageOrder[newIndex]
      pageOrder[newIndex] = temp

      const newCurrentPage = state.currentPage === pageIndex + 1 ? newIndex + 1 : state.currentPage === newIndex + 1 ? pageIndex + 1 : state.currentPage

      return {
        currentFile: { ...state.currentFile, pageOrder },
        currentPage: newCurrentPage
      }
    })
  },

  updatePageOrder: (pageOrder) => {
    set((state) => {
      if (!state.currentFile) return state
      return {
        currentFile: { ...state.currentFile, pageOrder }
      }
    })
  },

  deleteSheet: (sheetName) => {
    set((state) => {
      if (!state.currentFile || !state.currentFile.sheetOrder) return state
      const sheetOrder = state.currentFile.sheetOrder.filter(s => s !== sheetName)
      return {
        currentFile: { ...state.currentFile, sheetOrder }
      }
    })
  },

  addSheet: (sheetName) => {
    set((state) => {
      if (!state.currentFile) return state
      const sheetOrder = [...(state.currentFile.sheetOrder || []), sheetName]
      return {
        currentFile: { ...state.currentFile, sheetOrder }
      }
    })
  },

  moveSheet: (sheetName, direction) => {
    set((state) => {
      if (!state.currentFile || !state.currentFile.sheetOrder) return state
      const sheetOrder = [...state.currentFile.sheetOrder]
      const index = sheetOrder.indexOf(sheetName)
      if (index === -1) return state

      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= sheetOrder.length) return state

      const temp = sheetOrder[index]
      sheetOrder[index] = sheetOrder[newIndex]
      sheetOrder[newIndex] = temp

      return {
        currentFile: { ...state.currentFile, sheetOrder }
      }
    })
  },

  updateSheetOrder: (sheetOrder) => {
    set((state) => {
      if (!state.currentFile) return state
      return {
        currentFile: { ...state.currentFile, sheetOrder }
      }
    })
  }
}))
