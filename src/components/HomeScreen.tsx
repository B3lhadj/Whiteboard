import { useState, useRef } from 'react'
import { Upload, X, Settings } from 'lucide-react'
import { useDocumentStore, DocumentFile } from '../store'
import { getFileType, formatFileSize, generateFileId } from '../utils'
import { convertPdfToDocx, isPdfConversionSuccessful } from '../utils/pdfConverter'
import Ribbon from './Ribbon'
import ThemePicker from './ThemePicker'

export default function HomeScreen() {
  const [isDragging, setIsDragging] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [pptxMode, setPptxMode] = useState<'pixel' | 'editable'>('editable')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setCurrentFile = useDocumentStore((state) => state.setCurrentFile)
  const addRecentFile = useDocumentStore((state) => state.addRecentFile)
  const recentFiles = useDocumentStore((state) => state.recentFiles)
  const removeRecentFile = useDocumentStore((state) => state.removeRecentFile)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach((file) => handleFile(file))
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || [])
    files.forEach((file) => handleFile(file))
  }

  const handleFile = async (file: File) => {
    const fileType = getFileType(file)
    if (!fileType) {
      alert('Unsupported file type. Please upload PDF, DOCX, PPTX, or XLSX.')
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
                
                alert(errorMessage)
                console.error('Backend PDF conversion error:', { status: response.status, errorMessage })
                return
              }

              const result = await response.json()
              
              if (!result.success) {
                alert(`Backend conversion failed: ${result.error || 'Unknown error'}`)
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
                  alert(
                    'Connection error: Make sure the Flask backend is running on http://localhost:5000'
                  )
                } else {
                  alert(`Backend connection error: ${backendError.message}`)
                }
              } else {
                alert('Could not reach backend service for PDF conversion.')
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
            
            console.log(
              `✅ PDF successfully converted to Word format (${usedFrontend ? 'Frontend' : 'Backend'} - ${(docxBlob.size / 1024).toFixed(2)}KB)`
            )
            return
          }
          
          alert('PDF conversion failed: Could not generate Word document')
          return
        } catch (error) {
          console.error('PDF workflow error:', error)
          alert('An unexpected error occurred while converting PDF to Word.')
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
            return
          } else {
            const error = await response.json()
            alert(`PPTX conversion failed: ${error.error}`)
            return
          }
        } catch (error) {
          alert('Could not convert PPTX on the backend. Make sure LibreOffice is installed and the Flask server is running.')
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
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      <Ribbon />

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
        <div className="w-full max-w-2xl">
          {/* Upload area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <Upload size={48} className="mx-auto mb-4 text-gray-400" />
            <h2 className="text-2xl font-bold mb-2">Upload a Document</h2>
            <p className="text-gray-600 mb-4">
              Drag and drop your PDF, Word, PowerPoint, or Excel file here
            </p>
            <div className="mb-4 flex items-center justify-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pptx-mode"
                  checked={pptxMode === 'editable'}
                  onChange={() => setPptxMode('editable')}
                />
                Editable PPTX mode
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pptx-mode"
                  checked={pptxMode === 'pixel'}
                  onChange={() => setPptxMode('pixel')}
                />
                Pixel-perfect PPTX mode
              </label>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Browse Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx"
              onChange={handleFileInput}
              className="hidden"
              multiple
            />
          </div>

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
                        alert('This recent file entry has no local file data. Please upload the file again.')
                        return
                      }
                      setCurrentFile(file)
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
    </div>
  )
}
