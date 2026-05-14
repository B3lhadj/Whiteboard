import { useState, useRef } from 'react'
import { X, FileText, FileSpreadsheet, Presentation } from 'lucide-react'
import { useDocumentStore, DocumentFile, FileType } from '../store'
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
  const [selectedUploadType, setSelectedUploadType] = useState<FileType>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setCurrentFile = useDocumentStore((state) => state.setCurrentFile)
  const addRecentFile = useDocumentStore((state) => state.addRecentFile)
  const recentFiles = useDocumentStore((state) => state.recentFiles)
  const removeRecentFile = useDocumentStore((state) => state.removeRecentFile)

  const openFileDialog = (accept: string, type: FileType = selectedUploadType) => {
    setSelectedUploadType(type)
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

  const handleFile = async (file: File) => {
    const fileType = getFileType(file)
    if (!fileType) {
      showErrorToast('Unsupported file type. Please upload PDF, DOCX, PPTX, XLSX, XLSM, XLS, or an image.')
      return
    }
    setSelectedUploadType(fileType)

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
          <div className="mb-12">
            <div className="diamond-container">
              <div
                className="diamond-single"
                onClick={() => openFileDialog('.pdf,.docx,.pptx,.xlsx,.xlsm,.xls', selectedUploadType)}
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
