import { useState, useRef } from 'react'
import { X, Settings, FileText, FileSpreadsheet, Presentation } from 'lucide-react'
import { useDocumentStore, DocumentFile } from '../store'
import { getFileType, formatFileSize, generateFileId } from '../utils'
import { convertPdfToDocx, isPdfConversionSuccessful } from '../utils/pdfConverter'
import { showSuccessToast, showErrorToast } from '../utils/toast'
import ThemePicker from './ThemePicker'
import imageIcon from '../assets/image.png'
import pdfIcon from '../assets/pdf.png'
import signIcon from '../assets/Sign.png'
import whiteboardIcon from '../assets/Vector.png'

export default function HomeScreen() {
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [pptxMode] = useState<'pixel' | 'editable'>('editable')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setCurrentFile = useDocumentStore((state) => state.setCurrentFile)
  const addRecentFile = useDocumentStore((state) => state.addRecentFile)
  const recentFiles = useDocumentStore((state) => state.recentFiles)
  const removeRecentFile = useDocumentStore((state) => state.removeRecentFile)

  const openFileDialog = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }


  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || [])
    files.forEach((file) => handleFile(file))
  }

  const handleFile = async (file: File) => {
    const fileType = getFileType(file)
    if (!fileType) {
      showErrorToast('Unsupported file type. Please upload PDF, DOCX, PPTX, or XLSX.')
      return
    }

    // First, read file as ArrayBuffer (for fallback parsing or non-PPTX files)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as ArrayBuffer

      // PDF -> Word workflow: Try frontend first (faster), then fallback to backend
      if (fileType === 'pdf') {
        let docxBlob: Blob | null = null
        let usedFrontend = false
        try {
          console.log(`[1/2] Attempting frontend PDF to DOCX conversion for "${file.name}"...`)
          
          // Try frontend conversion first
          try {
            docxBlob = await convertPdfToDocx(content, file.name)
            
            // Verify conversion was successful
            const isSuccessful = await isPdfConversionSuccessful(content)
            if (isSuccessful && docxBlob.size > 0) {
              usedFrontend = true
              console.log(`✅ Frontend conversion successful: ${(docxBlob.size / 1024).toFixed(2)}KB`)
            } else {
              console.warn('Frontend conversion produced minimal output, will try backend...')
              docxBlob = null
            }
          } catch (frontendError) {
            console.warn('Frontend conversion failed, will attempt backend fallback:', frontendError)
          }
          
          // If frontend failed, try backend
          if (!docxBlob) {
            console.log('[2/2] Attempting backend PDF to DOCX conversion...')
            
            // Check if backend is available
            try {
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
                  
                  if (error.errorCode === 'INVALID_FILE_TYPE') {
                    errorMessage = `Invalid file type: ${error.error}`
                  } else if (error.errorCode === 'FILE_TOO_LARGE') {
                    errorMessage = 'File is too large. Maximum size is 50MB.'
                  } else if (error.errorCode === 'EMPTY_FILE') {
                    errorMessage = 'The PDF file is empty.'
                  } else if (error.errorCode === 'SAVE_ERROR') {
                    errorMessage = 'Failed to save the uploaded file. Please try again.'
                  } else if (error.errorCode === 'CONVERSION_ERROR') {
                    errorMessage = `Backend conversion failed: ${error.error}`
                  } else if (error.errorCode === 'NO_FILE') {
                    errorMessage = 'No file was provided.'
                  } else if (error.error) {
                    errorMessage = error.error
                  }
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
              
              console.log(`✅ Backend conversion successful`)
              
              // Log conversion metrics
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
            } catch (backendError) {
              if (backendError instanceof Error) {
                if (backendError.message.includes('Failed to fetch')) {
                  showErrorToast(
                    'Connection error: Make sure the Flask backend is running on http://localhost:5000'
                  )
                } else {
                  showErrorToast(`Backend connection error: ${backendError.message}`)
                }
              } else {
                showErrorToast('Could not reach backend service for PDF conversion.')
              }
              console.error('Backend connection error:', backendError)
              return
            }
          }
          
          // Create document file from blob
          if (docxBlob) {
            const docFile: DocumentFile = {
              id: generateFileId(),
              name: file.name,
              type: 'docx',
              originalType: 'pdf',
              workflow: 'pdf-to-word',
              size: docxBlob.size,
              content: await docxBlob.arrayBuffer(),
              uploadedAt: Date.now(),
            }
            
            addRecentFile(docFile)
            setCurrentFile(docFile)
            
            console.log(`✅ Document loaded (${usedFrontend ? 'Frontend' : 'Backend'} conversion)`)
            showSuccessToast(`✅ File opened successfully (${(docxBlob.size / 1024).toFixed(2)}KB)`, 'pdf')
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

      // For PPTX files, try to send to Flask backend for parsing
      if (fileType === 'pptx') {
        try {
          console.log('Uploading PPTX to Flask...')
          const formData = new FormData()
          formData.append('file', file)
          formData.append('renderMode', pptxMode)

          const response = await fetch('http://localhost:5000/api/upload-pptx', {
            method: 'POST',
            body: formData,
          })

          if (response.ok) {
            const result = await response.json()
            console.log(`Flask ${pptxMode} slide processing:`, result.total)
            const docFile: DocumentFile = {
              id: generateFileId(),
              name: file.name,
              type: fileType,
              size: file.size,
              content, // Keep original content as fallback
              uploadedAt: Date.now(),
              slides: result.slides, // Store Flask-parsed slides
            }
            addRecentFile(docFile)
            setCurrentFile(docFile)
            showSuccessToast(`✅ ${file.name} opened successfully`, 'pptx')
            return
          } else {
            const error = await response.json()
            showErrorToast(`PPTX conversion failed: ${error.error}`)
            return
          }
        } catch (error) {
          showErrorToast('Could not convert PPTX on the backend. Make sure LibreOffice is installed and the Flask server is running.')
          console.error('Flask connection failed:', error)
          return
        }
      }

      // For PPTX files that Flask couldn't parse, or for other file types
      const docFile: DocumentFile = {
        id: generateFileId(),
        name: file.name,
        type: fileType,
        size: file.size,
        content,
        uploadedAt: Date.now(),
      }
      addRecentFile(docFile)
      setCurrentFile(docFile)
      showSuccessToast(`✅ ${file.name} opened successfully`, fileType)
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Settings button */}
      <div className="absolute top-16 right-4 z-10">
        <button
          onClick={() => setShowThemePicker(!showThemePicker)}
          className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          title="Theme Settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {showThemePicker && <ThemePicker onClose={() => setShowThemePicker(false)} />}

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          {/* Diamond Grid */}
          <div className="mb-12">
            <div className="diamond-container">
              {/* WhiteBoard - Single */}
              <div
                className="diamond-single"
                onClick={() => openFileDialog('.pdf,.docx,.pptx,.xlsx')}
              >
                <div className="diamond-content">
                  <img src={whiteboardIcon} alt="WhiteBoard" className="diamond-icon" />
                  <span>WhiteBoard</span>
                </div>
              </div>

              {/* Row 1 - Pair */}
              <div className="diamond-row">
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.png,.jpg,.jpeg,.gif,.webp')}
                >
                  <div className="diamond-content">
                    <img src={imageIcon} alt="Image" className="diamond-icon" />
                    <span>Image</span>
                  </div>
                </div>
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.xlsx')}
                >
                  <div className="diamond-content">
                    <FileSpreadsheet size={28} className="diamond-icon" />
                    <span>Excel</span>
                  </div>
                </div>
              </div>

              {/* Plans - Single */}
              <div
                className="diamond-single"
                onClick={() => openFileDialog('.docx')}
              >
                <div className="diamond-content">
                  <FileText size={28} className="diamond-icon" />
                  <span>Word</span>
                </div>
              </div>

              {/* Row 2 - Pair */}
              <div className="diamond-row">
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.pdf')}
                >
                  <div className="diamond-content">
                    <img src={pdfIcon} alt="PDF file" className="diamond-icon" />
                    <span>PDF file</span>
                  </div>
                </div>
                <div
                  className="diamond"
                  onClick={() => openFileDialog('.pptx')}
                >
                  <div className="diamond-content">
                    <Presentation size={28} className="diamond-icon" />
                    <span>POWER POINT</span>
                  </div>
                </div>
              </div>

              {/* Sign - Single */}
              <div
                className="diamond-single"
                onClick={() => openFileDialog('.pdf')}
              >
                <div className="diamond-content">
                  <img src={signIcon} alt="Sign" className="diamond-icon" />
                  <span>Sign</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.gif,.webp"
            onChange={handleFileInput}
            className="hidden"
            multiple
          />

          {/* Recent files */}
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
                      showSuccessToast(`✅ ${file.name} opened successfully`, file.type)
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.originalType || file.type)?.toUpperCase()} • {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecentFile(file.id)
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

      {/* CSS styles */}
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

        /* Responsive */
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