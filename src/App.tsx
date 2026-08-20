import { useEffect, useState } from 'react'
import { useDocumentStore, type DocumentFile, type FileType } from './store'
import AuthScreen from './components/AuthScreen'
import HomeScreen from './components/HomeScreen'
import EditorView from './components/EditorView'
import { ToastContainer } from './components/Toast'
import {
  base64ToArrayBuffer,
  clearAuthSession,
  getAuthSession,
  getSharedFile,
  type AuthSession,
} from './services/editAudit'
import './App.css'

function App() {
  const [mounted, setMounted] = useState(false)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [sharedFileLoading, setSharedFileLoading] = useState(false)
  const [sharedFileError, setSharedFileError] = useState('')
  const currentFile = useDocumentStore((state) => state.currentFile)
  const setCurrentFile = useDocumentStore((state) => state.setCurrentFile)
  const darkMode = useDocumentStore((state) => state.darkMode)
  const toasts = useDocumentStore((state) => state.toasts)
  const removeToast = useDocumentStore((state) => state.removeToast)
  const loadRecentFilesFromStorage = useDocumentStore(
    (state) => state.loadRecentFilesFromStorage
  )

  useEffect(() => {
    const openSharedFile = async (accessToken: string) => {
      setSharedFileLoading(true)
      setSharedFileError('')
      try {
        const shared = await getSharedFile(accessToken)
        if (!shared.contentBase64) {
          throw new Error('This shared file has no stored content yet. Re-share it after uploading again.')
        }

        const fileType = (shared.file.fileType || null) as FileType
        const docFile: DocumentFile = {
          id: shared.file.fileId,
          name: shared.file.fileName,
          type: fileType,
          originalType: (shared.file.originalType || undefined) as FileType | undefined,
          workflow: shared.file.workflow as DocumentFile['workflow'],
          size: shared.file.contentSize || shared.file.size || 0,
          content: base64ToArrayBuffer(shared.contentBase64),
          uploadedAt: shared.file.uploadedAt ? new Date(shared.file.uploadedAt).getTime() : Date.now(),
          viewOnly: shared.share.permission === 'view',
        }
        setCurrentFile(docFile)
      } catch (error) {
        setSharedFileError(error instanceof Error ? error.message : 'Could not open shared file')
      } finally {
        setSharedFileLoading(false)
      }
    }

    loadRecentFilesFromStorage()
    setAuthSession(getAuthSession())

    const sharedMatch = window.location.pathname.match(/^\/shared\/([^/]+)$/)
    if (sharedMatch) {
      void openSharedFile(decodeURIComponent(sharedMatch[1]))
    }

    setMounted(true)
  }, [loadRecentFilesFromStorage, setCurrentFile])

  if (!mounted || sharedFileLoading) {
    return <div className="w-full h-full flex items-center justify-center">Loading shared file...</div>
  }

  if (sharedFileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-md border border-red-200 bg-white p-6 text-red-700 shadow">
          {sharedFileError}
        </div>
      </div>
    )
  }

  const handleLogout = () => {
    clearAuthSession()
    setAuthSession(null)
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      {currentFile ? (
        <EditorView file={currentFile} />
      ) : !authSession ? (
        <AuthScreen onAuthenticated={setAuthSession} />
      ) : (
        <HomeScreen onLogout={handleLogout} />
      )}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  )
}

export default App
