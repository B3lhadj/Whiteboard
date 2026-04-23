import { create } from 'zustand'

export type FileType = 'docx' | 'pptx' | 'xlsx' | 'pdf' | null
export type ThemeColor = 'blue' | 'green' | 'red' | 'dark' | 'teal' | 'purple' | 'amber'
export type ToolbarTool = 'select' | 'shape' | 'image' | 'draw' | 'text' | 'erase'

export interface DocumentFile {
  id: string
  name: string
  type: FileType
  size: number
  content: ArrayBuffer
  uploadedAt: number
  slides?: any[] // For Flask-parsed PPTX slides
  originalType?: FileType
  workflow?: 'pdf-to-word'
}

export interface DocumentState {
  currentFile: DocumentFile | null
  recentFiles: DocumentFile[]
  selectedTheme: ThemeColor
  darkMode: boolean
  zoom: number
  currentPage: number
  wordCount: number
  charCount: number
  editorHtml: string
  activeTool: ToolbarTool
  selectedLanguage: string
  
  // Actions
  setCurrentFile: (file: DocumentFile) => void
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
  setSelectedLanguage: (language: string) => void
  clearCurrentFile: () => void
  loadRecentFilesFromStorage: () => void
  saveRecentFilesToStorage: () => void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentFile: null,
  recentFiles: [],
  selectedTheme: 'blue',
  darkMode: false,
  zoom: 100,
  currentPage: 1,
  wordCount: 0,
  charCount: 0,
  editorHtml: '',
  activeTool: 'select',
  selectedLanguage: 'English',

  setCurrentFile: (file) => {
    set({ currentFile: file })
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

  setWordCount: (count) => set({ wordCount: count }),

  setCharCount: (count) => set({ charCount: count }),

  setEditorHtml: (html) => set({ editorHtml: html }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setSelectedLanguage: (language) => set({ selectedLanguage: language }),

  clearCurrentFile: () => {
    set({
      currentFile: null,
      currentPage: 1,
      wordCount: 0,
      charCount: 0,
      editorHtml: '',
      activeTool: 'select',
      selectedLanguage: 'English',
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
    const darkMode = localStorage.getItem('darkMode') === 'true'
    set({ selectedTheme: theme, darkMode })
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
}))
