import { useEffect, useState } from 'react'
import { useDocumentStore } from './store'
import HomeScreen from './components/HomeScreen'
import EditorView from './components/EditorView'
import { ToastContainer } from './components/Toast'
import './App.css'

function App() {
  const [mounted, setMounted] = useState(false)
  const currentFile = useDocumentStore((state) => state.currentFile)
  const darkMode = useDocumentStore((state) => state.darkMode)
  const toasts = useDocumentStore((state) => state.toasts)
  const removeToast = useDocumentStore((state) => state.removeToast)
  const loadRecentFilesFromStorage = useDocumentStore(
    (state) => state.loadRecentFilesFromStorage
  )

  useEffect(() => {
    loadRecentFilesFromStorage()
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-full h-full flex items-center justify-center">Loading...</div>
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      {currentFile ? (
        <EditorView file={currentFile} />
      ) : (
        <HomeScreen />
      )}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  )
}

export default App
