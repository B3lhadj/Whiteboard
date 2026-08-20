import { useEffect, useRef, useState } from 'react'
import { Bell, ExternalLink, History, LogOut, X, FileText, FileSpreadsheet, Presentation, User } from 'lucide-react'
import { useDocumentStore, DocumentFile, FileType } from '../store'
import { getFileType, formatFileSize, generateFileId } from '../utils'
import { convertPdfToDocx, isPdfConversionSuccessful } from '../utils/pdfConverter'
import { showSuccessToast, showErrorToast } from '../utils/toast'
import {
  arrayBufferToBase64,
  createFileRecord,
  getEditorEmail,
  getEditorName,
  getUserShareHistory,
  getShareEditorUrl,
  setEditorEmail as persistEditorEmail,
  setEditorName as persistEditorName,
  upsertUser,
  type FileShareRecord,
} from '../services/editAudit'
import ThemePicker from './ThemePicker'
import imageIcon from '../assets/image.png'
import pdfIcon from '../assets/pdf.png'
import signIcon from '../assets/Sign.png'
import whiteboardIcon from '../assets/Vector.png'

interface HomeScreenProps {
  onLogout?: () => void
}

export default function HomeScreen({ onLogout }: HomeScreenProps) {
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [editorName, setEditorName] = useState(() => getEditorName())
  const [editorEmail, setEditorEmail] = useState(() => getEditorEmail())
  const [receivedShares, setReceivedShares] = useState<FileShareRecord[]>([])
  const [sentShares, setSentShares] = useState<FileShareRecord[]>([])
  const [sharePanel, setSharePanel] = useState<'notifications' | 'history' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setCurrentFile = useDocumentStore((state) => state.setCurrentFile)
  const addRecentFile = useDocumentStore((state) => state.addRecentFile)
  const recentFiles = useDocumentStore((state) => state.recentFiles)
  const removeRecentFile = useDocumentStore((state) => state.removeRecentFile)

  const [lastDeletedFile, setLastDeletedFile] = useState<DocumentFile | null>(null)
  const [showUndoBanner, setShowUndoBanner] = useState(false)
  const undoTimeoutRef = useRef<number | null>(null)

  const handleDeleteFile = (file: DocumentFile) => {
    setLastDeletedFile(file)
    setShowUndoBanner(true)
    removeRecentFile(file.id)

    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current)
    }

    undoTimeoutRef.current = window.setTimeout(() => {
      setShowUndoBanner(false)
      setLastDeletedFile(null)
    }, 6000)
  }

  const handleUndoDelete = () => {
    if (lastDeletedFile) {
      addRecentFile(lastDeletedFile)
      setLastDeletedFile(null)
      setShowUndoBanner(false)
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current)
      }
      showSuccessToast('Restored successfully')
    }
  }

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current)
      }
    }
  }, [])

  const registerCurrentUser = (name = editorName, email = editorEmail) => {
    void upsertUser(name, email)
  }

  const getDocumentContentType = (docFile: DocumentFile) => {
    if (docFile.type === 'image') {
      const extension = docFile.name.split('.').pop()?.toLowerCase() || ''
      const imageTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
      }
      return imageTypes[extension] || 'image/png'
    }

    const mimeTypes: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      whiteboard: 'application/json',
    }

    return docFile.type ? mimeTypes[docFile.type] || 'application/octet-stream' : 'application/octet-stream'
  }

  const loadShareHistory = (email = editorEmail) => {
    void getUserShareHistory(email).then((history) => {
      setReceivedShares(history?.received || [])
      setSentShares(history?.sent || [])
    })
  }

  useEffect(() => {
    registerCurrentUser()
    loadShareHistory()
    const refreshTimer = window.setInterval(() => loadShareHistory(getEditorEmail()), 20000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  const registerFileRecord = (docFile: DocumentFile) => {
    registerCurrentUser()
    void createFileRecord({
      fileId: docFile.id,
      fileName: docFile.name,
      fileType: docFile.type,
      originalType: docFile.originalType,
      workflow: docFile.workflow,
      size: docFile.size,
      contentBase64: docFile.content.byteLength > 0 ? arrayBufferToBase64(docFile.content) : undefined,
      contentType: getDocumentContentType(docFile),
    })
  }

  const handleEditorNameChange = (value: string) => {
    setEditorName(value)
    persistEditorName(value)
  }

  const handleEditorEmailChange = (value: string) => {
    setEditorEmail(value)
    persistEditorEmail(value)
  }

  const handleEditorAccountCommit = () => {
    const nextName = persistEditorName(editorName)
    const nextEmail = persistEditorEmail(editorEmail)
    setEditorName(nextName)
    setEditorEmail(nextEmail)
    registerCurrentUser(nextName, nextEmail)
    loadShareHistory(nextEmail)
  }

  const handleNewWhiteboard = () => {
    const whiteboardFile: DocumentFile = {
      id: generateFileId(),
      name: 'Untitled Whiteboard',
      type: 'whiteboard',
      size: 0,
      content: new ArrayBuffer(0),
      uploadedAt: Date.now(),
      pageOrder: [0],
      wordPages: [{ id: '1', content: '' }],
    }

    registerFileRecord(whiteboardFile)
    setCurrentFile(whiteboardFile)
    addRecentFile(whiteboardFile)
    showSuccessToast('Whiteboard opened', 'whiteboard')
  }

  const openFileDialog = (accept: string, _type: FileType = null) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || [])
    files.forEach((file) => handleFile(file))
    e.currentTarget.value = ''
  }

  const formatShareTime = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  const openShare = (share: FileShareRecord) => {
    const shareUrl = getShareEditorUrl(share)
    if (!shareUrl) {
      showErrorToast('This share has no access link.')
      return
    }
    window.location.href = shareUrl
  }

  const handleFile = async (file: File) => {
    const fileType = getFileType(file)
    if (!fileType) {
      showErrorToast('Unsupported file type. Please upload PDF, DOCX, PPTX, XLSX, XLSM, XLS, or an image.')
      return
    }
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as ArrayBuffer

      if (fileType === 'pdf') {
        let docxBlob: Blob | null = null
        let usedFrontend = false
        const pdfTarget = 'docx'

        try {
          console.log(`[1/2] Attempting ${pdfTarget.toUpperCase()} conversion for "${file.name}"...`)

          try {
            docxBlob = await convertPdfToDocx(content, file.name)
            const isSuccessful = await isPdfConversionSuccessful(content)
            if (isSuccessful && docxBlob.size > 0) {
              usedFrontend = true
              console.log(`Frontend conversion successful: ${(docxBlob.size / 1024).toFixed(2)}KB`)
            } else {
              docxBlob = null
            }
          } catch (frontendError) {
            console.warn('Frontend conversion failed, will attempt backend fallback:', frontendError)
          }

          if (!docxBlob) {
            console.log(`[2/2] Attempting backend PDF to ${pdfTarget.toUpperCase()} conversion...`)

            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('http://localhost:5000/api/pdf-to-word', {
              method: 'POST',
              body: formData,
            })

            if (!response.ok) {
              let errorMessage = 'PDF to Word conversion failed'
              try {
                const error = await response.json()
                errorMessage = error.error || errorMessage
              } catch {
                errorMessage += `: ${response.status} ${response.statusText}`
              }

              showErrorToast(errorMessage)
              console.error('Backend PDF conversion error:', { status: response.status, errorMessage })
              return
            }

            const result = await response.json()
            if (!result.success) {
              showErrorToast(`Backend conversion failed: ${result.error || 'Unknown error'}`)
              return
            }

            console.log('Backend conversion successful')

            if (result.metadata) {
              console.log('PDF Conversion Metrics (Backend):', {
                pages: result.metadata.pages,
                originalSize: formatFileSize(result.metadata.originalSize),
                convertedSize: formatFileSize(result.metadata.convertedSize),
                processTime: `${result.metadata.processTime}s`,
              })
            }

            const binaryString = atob(result.docxBase64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }

            docxBlob = new Blob([bytes], {
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            })
          }

          if (docxBlob) {
            const docFile: DocumentFile = {
              id: generateFileId(),
              name: file.name,
              type: pdfTarget,
              originalType: 'pdf',
              workflow: `pdf-to-${pdfTarget}`,
              size: docxBlob.size,
              content: await docxBlob.arrayBuffer(),
              uploadedAt: Date.now(),
            }

            registerFileRecord(docFile)
            addRecentFile(docFile)
            setCurrentFile(docFile)
            console.log(`Document loaded (${usedFrontend ? 'Frontend' : 'Backend'} conversion)`)
            showSuccessToast(`File opened successfully (${(docxBlob.size / 1024).toFixed(2)}KB)`, 'pdf')
            return
          }

          showErrorToast('PDF conversion failed: Could not generate Word document')
          return
        } catch (error) {
          console.error('PDF workflow error:', error)
          showErrorToast('An unexpected error occurred while converting PDF to Word.')
          return
        }
      }

      if (fileType === 'pptx') {
        const docFile: DocumentFile = {
          id: generateFileId(),
          name: file.name,
          type: fileType,
          size: file.size,
          content,
          uploadedAt: Date.now(),
        }

        try {
          console.log('Processing PPTX...')
          const formData = new FormData()
          formData.append('file', file)
          formData.append('renderMode', 'pixel')

          const response = await fetch('http://localhost:5000/api/upload-pptx', {
            method: 'POST',
            body: formData,
          })

          if (response.ok) {
            const result = await response.json()
            if (result.slides?.length) {
              docFile.slides = result.slides
            }
          } else {
            console.warn('PPTX backend parsing failed; using local parser in editor.')
          }
        } catch (error) {
          console.warn('PPTX backend unavailable; using local parser in editor.', error)
        }

        registerFileRecord(docFile)
        addRecentFile(docFile)
        setCurrentFile(docFile)
        showSuccessToast(`${file.name} opened successfully`, 'pptx')
        return
      }

      const docFile: DocumentFile = {
        id: generateFileId(),
        name: file.name,
        type: fileType,
        size: file.size,
        content,
        uploadedAt: Date.now(),
      }
      registerFileRecord(docFile)
      addRecentFile(docFile)
      setCurrentFile(docFile)
      showSuccessToast(`${file.name} opened successfully`, fileType)
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {showThemePicker && <ThemePicker onClose={() => setShowThemePicker(false)} />}

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <div className="mb-4 rounded-md border border-gray-200 bg-white text-sm text-gray-700 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{editorName}</div>
                <div className="truncate text-xs text-gray-500">{editorEmail || 'No email saved'}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSharePanel(sharePanel === 'notifications' ? null : 'notifications')}
                  className="relative flex items-center gap-2 rounded border border-gray-200 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50"
                  title="Shared file notifications"
                >
                  <Bell size={16} />
                  Notifications
                  {receivedShares.length > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {receivedShares.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setSharePanel(sharePanel === 'history' ? null : 'history')}
                  className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50"
                  title="Share history"
                >
                  <History size={16} />
                  History
                </button>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!onLogout}
                  title="Logout"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            </div>

            {sharePanel && (
              <div className="border-t border-gray-200 px-4 py-3">
                {sharePanel === 'notifications' ? (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Shared with me</div>
                    {receivedShares.length === 0 ? (
                      <div className="text-sm text-gray-500">No shared files yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {receivedShares.map((share) => (
                          <button
                            key={share._id}
                            onClick={() => openShare(share)}
                            className="flex w-full items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-gray-900">{share.fileName}</span>
                              <span className="block truncate text-xs text-gray-500">
                                From {share.sharedBy.displayName} - {formatShareTime(share.updatedAt)}
                              </span>
                            </span>
                            <ExternalLink size={16} className="shrink-0 text-gray-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Received</div>
                      {receivedShares.length === 0 ? (
                        <div className="text-sm text-gray-500">No received shares.</div>
                      ) : (
                        <div className="space-y-2">
                          {receivedShares.map((share) => (
                            <button key={share._id} onClick={() => openShare(share)} className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100">
                              <div className="truncate font-medium text-gray-900">{share.fileName}</div>
                              <div className="truncate text-xs text-gray-500">{share.permission} - {formatShareTime(share.updatedAt)}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sent</div>
                      {sentShares.length === 0 ? (
                        <div className="text-sm text-gray-500">No sent shares.</div>
                      ) : (
                        <div className="space-y-2">
                          {sentShares.map((share) => (
                            <div key={share._id} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                              <div className="truncate font-medium text-gray-900">{share.fileName}</div>
                              <div className="truncate text-xs text-gray-500">
                                To {share.sharedWith.email || share.sharedWith.displayName} - {formatShareTime(share.updatedAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-12">
            <div className="diamond-container">
              <div
                className="diamond-single"
                onClick={handleNewWhiteboard}
              >
                <div className="diamond-content">
                  <img src={whiteboardIcon} alt="WhiteBoard" className="diamond-icon" />
                  <span>WhiteBoard</span>
                </div>
              </div>

              <div className="diamond-row">
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg', 'image')}
                >
                  <div className="diamond-content">
                    <img src={imageIcon} alt="Image" className="diamond-icon" />
                    <span>Image</span>
                  </div>
                </div>
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.xlsx,.xlsm,.xls', 'xlsx')}
                >
                  <div className="diamond-content">
                    <FileSpreadsheet size={28} className="diamond-icon" />
                    <span>Excel</span>
                  </div>
                </div>
              </div>

              <div
                className="diamond-single"
                onClick={() => openFileDialog('.docx', 'docx')}
              >
                <div className="diamond-content">
                  <FileText size={28} className="diamond-icon" />
                  <span>Word</span>
                </div>
              </div>

              <div className="diamond-row">
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.pdf', 'pdf')}
                >
                  <div className="diamond-content">
                    <img src={pdfIcon} alt="PDF file" className="diamond-icon" />
                    <span>PDF file</span>
                  </div>
                </div>
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.pptx', 'pptx')}
                >
                  <div className="diamond-content">
                    <Presentation size={28} className="diamond-icon" />
                    <span>POWER POINT</span>
                  </div>
                </div>
              </div>

              <div
                className="diamond-single"
                onClick={() => openFileDialog('.pdf', 'pdf')}
              >
                <div className="diamond-content">
                  <img src={signIcon} alt="Sign" className="diamond-icon" />
                  <span>Sign</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-8 flex justify-center">
            <div className="grid w-full max-w-xl gap-3 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-sm sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <User size={16} className="shrink-0 text-gray-500" />
                <span className="shrink-0 font-medium">Name</span>
                <input
                  value={editorName}
                  onChange={(event) => handleEditorNameChange(event.target.value)}
                  onBlur={handleEditorAccountCommit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none"
                  placeholder="Your name"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="shrink-0 font-medium">Email</span>
                <input
                  value={editorEmail}
                  onChange={(event) => handleEditorEmailChange(event.target.value)}
                  onBlur={handleEditorAccountCommit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none"
                  placeholder="you@example.com"
                  type="email"
                />
              </label>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,.xlsx,.xlsm,.xls,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg"
            onChange={handleFileInput}
            className="hidden"
            multiple
          />

          {recentFiles.length > 0 && (
            <div className="mt-12">
              <h3 className="text-xl font-bold mb-4">Recent Files</h3>
              <div className="space-y-2">
                {recentFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer group"
                    onClick={() => {
                      if (!file.content || file.content.byteLength === 0) {
                        showErrorToast('This recent file entry has no local file data. Please upload the file again.')
                        return
                      }
                      setCurrentFile(file)
                      showSuccessToast(`${file.name} opened successfully`, file.type)
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.originalType || file.type)?.toUpperCase()} - {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteFile(file)
                      }}
                      className="ml-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 rounded"
                    >
                      <X size={18} className="text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showUndoBanner && lastDeletedFile && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-gray-900/90 text-white shadow-2xl backdrop-blur border border-white/10 min-w-[320px] max-w-md">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-sm font-medium">Removed &quot;{lastDeletedFile.name}&quot;</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndoDelete}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Undo
            </button>
            <button
              onClick={() => {
                setShowUndoBanner(false)
                setLastDeletedFile(null)
              }}
              className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .diamond-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 20px;
        }

        .diamond-row {
          display: flex;
          gap: 60px;
          margin: -60px 0;
        }

        .diamond, .diamond-single {
          width: 140px;
          height: 140px;
          transform: rotate(45deg);
          border: 3px solid #2e9e44;
          background: linear-gradient(145deg, #f6f1d3, #e4dca5);
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }

        .diamond-single {
          margin: 20px 0;
        }

        .diamond:hover, .diamond-single:hover {
          transform: rotate(45deg) scale(1.08);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
          background: linear-gradient(145deg, #f0e98c, #cfc65f);
        }

        .diamond-content {
          transform: rotate(-45deg);
          text-align: center;
          color: #2e9e44;
          font-weight: bold;
          font-size: 14px;
          pointer-events: none;
          padding: 10px;
          word-break: break-word;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .diamond-icon {
          color: #2e9e44;
          margin-bottom: 4px;
          display: block;
          max-width: 36px;
          max-height: 36px;
          width: auto;
          height: auto;
        }

        .diamond:hover .diamond-icon,
        .diamond-single:hover .diamond-icon {
          color: #1f6e2f;
        }

        @media (max-width: 640px) {
          .diamond, .diamond-single {
            width: 100px;
            height: 100px;
          }

          .diamond-row {
            gap: 30px;
            margin: -40px 0;
          }

          .diamond-content {
            font-size: 10px;
            gap: 4px;
          }

          .diamond-icon {
            width: 20px;
            height: 20px;
          }
        }
      `}</style>
    </div>
  )
}