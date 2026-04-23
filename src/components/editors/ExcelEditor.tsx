import { useEffect, useRef, useState } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import * as XLSX from 'xlsx'
import { AlertCircle } from 'lucide-react'
import PageRail, { type PageRailItem } from '../PageRail'

interface ExcelEditorProps {
  file: DocumentFile
}

interface CellData {
  [key: string]: any
}

export default function ExcelEditor({ file }: ExcelEditorProps) {
  const [sheets, setSheets] = useState<string[]>([])
  const [data, setData] = useState<CellData[]>([])
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const workbookRef = useRef<XLSX.WorkBook | null>(null)
  const zoom = useDocumentStore((state) => state.zoom)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)

  useEffect(() => {
    const loadExcel = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const workbook = XLSX.read(file.content, { type: 'array' })
        workbookRef.current = workbook
        const sheetNames = workbook.SheetNames
        setSheets(sheetNames)

        if (sheetNames.length > 0) {
          loadSheet(workbook, 0)
        }
      } catch (err) {
        console.error('Error loading Excel:', err)
        setError('Failed to load Excel file')
      } finally {
        setIsLoading(false)
      }
    }

    loadExcel()
  }, [file.content])

  const loadSheet = (workbook: XLSX.WorkBook, sheetIndex: number) => {
    const sheetName = workbook.SheetNames[sheetIndex]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json<CellData>(worksheet)
    setData(jsonData)
    setSelectedSheet(sheetIndex)

    // Update word/char count
    const text = JSON.stringify(jsonData)
    setWordCount(text.split(/\s+/).filter((w) => w.length > 0).length)
    setCharCount(text.length)
  }

  const sheetItems: PageRailItem[] = sheets.map((sheet, index) => ({
    id: String(index + 1),
    label: sheet,
    subtitle: `${data.length} rows`,
    onClick: () => {
      const workbook = workbookRef.current
      if (workbook) {
        loadSheet(workbook, index)
      }
    },
  }))

  const handleCellChange = (rowIndex: number, key: string, value: string) => {
    const newData = [...data]
    newData[rowIndex][key] = value
    setData(newData)
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading spreadsheet...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="mx-auto mb-4 text-green-600" />
          <p className="text-gray-800 font-semibold mb-2">Error Loading Spreadsheet</p>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  const columns = data.length > 0 ? Object.keys(data[0]) : []

  return (
    <div className="flex-1 min-h-0 bg-gray-100 flex overflow-hidden">
      <PageRail
        title="SHEETS"
        items={sheetItems}
        activeId={String(selectedSheet + 1)}
        accentColor="#16a34a"
      />

      <div className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
          {sheets.length > 1 && (
            <div className="flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
              {sheets.map((sheet, index) => (
                <button
                  key={sheet}
                  onClick={() => {
                    const workbook = workbookRef.current
                    if (workbook) {
                      loadSheet(workbook, index)
                    }
                  }}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    selectedSheet === index
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {sheet}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-3 text-xs font-semibold text-gray-700">FORMULA BAR</div>
            <input
              type="text"
              placeholder="Enter formula or value (read-only in preview)"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
              readOnly
            />
          </div>

          <div className="overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top left',
              }}
              className="inline-block"
            >
              <table className="border-collapse">
                <thead>
                  <tr className="border-b-2 border-green-300 bg-green-50">
                    <th className="sticky left-0 z-20 w-12 border-r border-gray-300 bg-green-100 px-4 py-2 text-left text-sm font-bold text-gray-700">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="min-w-40 border-r border-gray-300 bg-green-50 px-4 py-2 text-left text-sm font-bold text-gray-700"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-gray-200 transition-colors hover:bg-blue-50">
                      <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-4 py-2 text-center text-sm font-semibold text-gray-700">
                        {rowIndex + 1}
                      </td>
                      {columns.map((col) => (
                        <td key={`${rowIndex}-${col}`} className="border-r border-gray-300 px-4 py-2 text-sm">
                          <input
                            type="text"
                            value={row[col] ?? ''}
                            onChange={(e) => handleCellChange(rowIndex, col, e.target.value)}
                            className="w-full rounded border-0 px-2 py-1 text-sm focus:bg-yellow-50 focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
