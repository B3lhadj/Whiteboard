import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import * as XLSX from 'xlsx'
import { AlertCircle, Plus } from 'lucide-react'
import PageRail, { type PageRailItem } from '../PageRail'
import EditorNavigation from '../EditorNavigation'

interface ExcelEditorProps {
  file: DocumentFile
}

type CellValue = string | number | boolean | null
type SheetData = CellValue[][]
type CellFormat = {
  color?: string
  backgroundColor?: string
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
}

const MIN_ROWS = 40
const MIN_COLS = 18

const normalizeSheetData = (rows: SheetData): SheetData => {
  const sourceRows = rows.length > 0 ? rows : [[]]
  const maxCols = Math.max(MIN_COLS, ...sourceRows.map((row) => row.length))
  const rowCount = Math.max(MIN_ROWS, sourceRows.length)

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const row = sourceRows[rowIndex] ? [...sourceRows[rowIndex]] : []
    while (row.length < maxCols) row.push('')
    return row
  })
}

const getCellText = (value: CellValue) => (value === null || value === undefined ? '' : String(value))

export default function ExcelEditor({ file }: ExcelEditorProps) {
  const [sheets, setSheets] = useState<string[]>([])
  const [sheetsData, setSheetsData] = useState<Record<string, SheetData>>({})
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [selectedCell, setSelectedCell] = useState({ row: 0, col: 0 })
  const [formulaValue, setFormulaValue] = useState('')
  const [cellFormats, setCellFormats] = useState<Record<string, Record<string, CellFormat>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const workbookRef = useRef<XLSX.WorkBook | null>(null)
  const topScrollbarRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableContentRef = useRef<HTMLDivElement | null>(null)
  const syncingScrollRef = useRef(false)
  const zoom = useDocumentStore((state) => state.zoom)
  const textColor = useDocumentStore((state) => state.textColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const lastToolbarFormatRef = useRef({ textColor: '', textFontFamily: '', textFontSize: 0 })
  const [topScrollbarWidth, setTopScrollbarWidth] = useState<number | string>('100%')

  const activeSheetName = sheets[selectedSheet]
  const activeData = activeSheetName ? sheetsData[activeSheetName] || [] : []
  const columnCount = activeData[0]?.length || MIN_COLS

  const columns = useMemo(
    () => Array.from({ length: columnCount }, (_, index) => XLSX.utils.encode_col(index)),
    [columnCount]
  )

  const getCellKey = (rowIndex: number, colIndex: number) => `${rowIndex}:${colIndex}`
  const selectedCellKey = getCellKey(selectedCell.row, selectedCell.col)
  useEffect(() => {
    const loadExcel = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const workbook = XLSX.read(file.content, { type: 'array', cellFormula: true, cellStyles: true })
        workbookRef.current = workbook

        const sheetNames = workbook.SheetNames.length > 0 ? workbook.SheetNames : ['Sheet1']
        const nextSheetsData: Record<string, SheetData> = {}

        sheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName]
          const rows = worksheet
            ? XLSX.utils.sheet_to_json<CellValue[]>(worksheet, {
                header: 1,
                defval: '',
                blankrows: true,
                raw: false,
              })
            : []

          nextSheetsData[sheetName] = normalizeSheetData(rows)
        })

        setSheets(sheetNames)
        setSheetsData(nextSheetsData)
        setCellFormats({})
        setSelectedSheet(0)
        setSelectedCell({ row: 0, col: 0 })
        setFormulaValue(getCellText(nextSheetsData[sheetNames[0]]?.[0]?.[0] ?? ''))
        updateCounts(nextSheetsData[sheetNames[0]] || [])
      } catch (err) {
        console.error('Error loading Excel:', err)
        setError('Failed to load Excel file')
      } finally {
        setIsLoading(false)
      }
    }

    loadExcel()
  }, [file.content])

  const updateCounts = (rows: SheetData) => {
    const text = rows.flat().map(getCellText).filter(Boolean).join(' ')
    setWordCount(text.split(/\s+/).filter((word) => word.length > 0).length)
    setCharCount(text.length)
  }

  const syncWorksheet = (sheetName: string, rows: SheetData) => {
    const workbook = workbookRef.current
    if (!workbook) return

    workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows)
    if (!workbook.SheetNames.includes(sheetName)) {
      workbook.SheetNames.push(sheetName)
    }
  }

  const selectSheet = (index: number) => {
    const nextSheetName = sheets[index]
    if (!nextSheetName) return

    const firstValue = sheetsData[nextSheetName]?.[0]?.[0] ?? ''
    setSelectedSheet(index)
    setSelectedCell({ row: 0, col: 0 })
    setFormulaValue(getCellText(firstValue))
    updateCounts(sheetsData[nextSheetName] || [])
  }

  const updateCellValue = (rowIndex: number, colIndex: number, value: string) => {
    if (!activeSheetName) return

    setSheetsData((previous) => {
      const currentRows = normalizeSheetData(previous[activeSheetName] || [])
      const rows = currentRows.map((row) => [...row])

      while (rows.length <= rowIndex) {
        rows.push(Array.from({ length: columnCount }, () => ''))
      }
      while (rows[rowIndex].length <= colIndex) {
        rows.forEach((row) => row.push(''))
      }

      rows[rowIndex][colIndex] = value
      syncWorksheet(activeSheetName, rows)
      updateCounts(rows)
      return { ...previous, [activeSheetName]: rows }
    })
  }

  const handleCellFocus = (rowIndex: number, colIndex: number) => {
    setSelectedCell({ row: rowIndex, col: colIndex })
    setFormulaValue(getCellText(activeData[rowIndex]?.[colIndex] ?? ''))
  }

  const handleFormulaChange = (value: string) => {
    setFormulaValue(value)
    updateCellValue(selectedCell.row, selectedCell.col, value)
  }

  const updateSelectedCellFormat = (patch: CellFormat) => {
    if (!activeSheetName) return

    setCellFormats((previous) => {
      const sheetFormats = previous[activeSheetName] || {}
      const currentFormat = sheetFormats[selectedCellKey] || {}
      return {
        ...previous,
        [activeSheetName]: {
          ...sheetFormats,
          [selectedCellKey]: {
            ...currentFormat,
            ...patch,
          },
        },
      }
    })
  }

  useEffect(() => {
    const changed =
      lastToolbarFormatRef.current.textColor !== textColor ||
      lastToolbarFormatRef.current.textFontFamily !== textFontFamily ||
      lastToolbarFormatRef.current.textFontSize !== textFontSize

    lastToolbarFormatRef.current = { textColor, textFontFamily, textFontSize }

    if (changed && activeSheetName) {
      updateSelectedCellFormat({
        color: textColor,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
      })
    }
  }, [activeSheetName, selectedCell.row, selectedCell.col, textColor, textFontFamily, textFontSize])

  useEffect(() => {
    const updateTopScrollbarWidth = () => {
      const scroller = tableScrollRef.current
      const content = tableContentRef.current
      if (!scroller || !content) return

      setTopScrollbarWidth(Math.max(scroller.scrollWidth, content.scrollWidth, scroller.clientWidth))

      if (topScrollbarRef.current) {
        topScrollbarRef.current.scrollLeft = scroller.scrollLeft
      }
    }

    updateTopScrollbarWidth()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateTopScrollbarWidth) : null

    if (resizeObserver) {
      if (tableScrollRef.current) resizeObserver.observe(tableScrollRef.current)
      if (tableContentRef.current) resizeObserver.observe(tableContentRef.current)
    }

    window.addEventListener('resize', updateTopScrollbarWidth)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateTopScrollbarWidth)
    }
  }, [activeSheetName, activeData.length, columnCount, zoom])

  const syncScrollLeft = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || syncingScrollRef.current) return

    syncingScrollRef.current = true
    target.scrollLeft = source.scrollLeft
    window.requestAnimationFrame(() => {
      syncingScrollRef.current = false
    })
  }

  const handleTopScrollbarScroll = (event: UIEvent<HTMLDivElement>) => {
    syncScrollLeft(event.currentTarget, tableScrollRef.current)
  }

  const handleTableScroll = (event: UIEvent<HTMLDivElement>) => {
    syncScrollLeft(event.currentTarget, topScrollbarRef.current)
  }

  const handleDeleteSheet = (sheetName: string) => {
    if (sheets.length <= 1) return

    const nextSheets = sheets.filter((name) => name !== sheetName)
    const nextSheetsData = { ...sheetsData }
    delete nextSheetsData[sheetName]

    const workbook = workbookRef.current
    if (workbook) {
      delete workbook.Sheets[sheetName]
      workbook.SheetNames = workbook.SheetNames.filter((name) => name !== sheetName)
    }

    setSheets(nextSheets)
    setSheetsData(nextSheetsData)
    const nextSelectedSheet = Math.min(selectedSheet, nextSheets.length - 1)
    const nextSheetName = nextSheets[nextSelectedSheet]
    setSelectedSheet(nextSelectedSheet)
    setSelectedCell({ row: 0, col: 0 })
    setFormulaValue(getCellText(nextSheetsData[nextSheetName]?.[0]?.[0] ?? ''))
    updateCounts(nextSheetsData[nextSheetName] || [])
  }

  const handleAddSheet = () => {
    let index = sheets.length + 1
    let sheetName = `Sheet${index}`
    while (sheets.includes(sheetName)) {
      index += 1
      sheetName = `Sheet${index}`
    }

    const rows = normalizeSheetData([])
    syncWorksheet(sheetName, rows)
    setSheets((previous) => [...previous, sheetName])
    setSheetsData((previous) => ({ ...previous, [sheetName]: rows }))
    setSelectedSheet(sheets.length)
    setSelectedCell({ row: 0, col: 0 })
    setFormulaValue('')
    updateCounts(rows)
  }

  const handleReorderSheets = (fromIndex: number, toIndex: number) => {
    const nextSheets = [...sheets]
    const removedSheets = nextSheets.splice(fromIndex, 1)
    nextSheets.splice(toIndex, 0, removedSheets[0])

    const workbook = workbookRef.current
    if (workbook) {
      workbook.SheetNames = nextSheets
    }

    setSheets(nextSheets)

    if (selectedSheet === fromIndex) {
      setSelectedSheet(toIndex)
    } else if (selectedSheet > fromIndex && selectedSheet <= toIndex) {
      setSelectedSheet(selectedSheet - 1)
    } else if (selectedSheet >= toIndex && selectedSheet < fromIndex) {
      setSelectedSheet(selectedSheet + 1)
    }
  }

  const sheetItems: PageRailItem[] = sheets.map((sheet, index) => ({
    id: String(index + 1),
    label: sheet,
    subtitle: `${sheetsData[sheet]?.length || 0} rows`,
    preview: (
      <div className="h-full w-full overflow-hidden bg-white p-1">
        <table className="w-full border-collapse text-[6px] text-gray-700">
          <tbody>
            {(sheetsData[sheet] || []).slice(0, 6).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.slice(0, 4).map((cell, cellIndex) => (
                  <td key={cellIndex} className="max-w-[34px] truncate border border-gray-200 px-1 py-0.5">
                    {getCellText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    onClick: () => selectSheet(index),
    onDelete: sheets.length > 1 ? () => handleDeleteSheet(sheet) : undefined,
  }))

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

  return (
    <div className="flex-1 min-h-0 bg-gray-100 flex overflow-hidden">
      <div className="flex-1 min-w-0 overflow-auto p-2 sm:p-4 md:p-5">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3">
          <EditorNavigation
            current={selectedSheet + 1}
            total={sheets.length}
            onPrevious={() => selectSheet(Math.max(0, selectedSheet - 1))}
            onNext={() => selectSheet(Math.min(sheets.length - 1, selectedSheet + 1))}
            previousLabel="Back"
            nextLabel="Next"
            className="sticky top-0 z-30 border-b border-gray-200 bg-gray-100/95 backdrop-blur"
          />

          {sheets.length > 1 && (
            <div className="flex gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
              {sheets.map((sheet, index) => (
                <button
                  key={sheet}
                  onClick={() => selectSheet(index)}
                  className={`whitespace-nowrap rounded px-4 py-2 text-sm font-medium transition-all ${
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

          <div className="rounded-lg border border-gray-200 bg-white p-2 sm:p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-center text-sm font-semibold text-gray-700">
                {XLSX.utils.encode_cell({ r: selectedCell.row, c: selectedCell.col })}
              </span>
              <input
                type="text"
                value={formulaValue}
                onChange={(e) => handleFormulaChange(e.target.value)}
                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="rounded-lg shadow-sm">
            <div
              ref={topScrollbarRef}
              onScroll={handleTopScrollbarScroll}
              className="overflow-x-auto overflow-y-hidden rounded-t-lg border border-b-0 border-gray-200 bg-white"
              style={{ scrollbarGutter: 'stable' }}
            >
              <div className="h-4" style={{ width: topScrollbarWidth }} />
            </div>

            <div
              ref={tableScrollRef}
              onScroll={handleTableScroll}
              className="overflow-auto rounded-b-lg border border-gray-200 bg-white"
            >
              <div
                ref={tableContentRef}
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                }}
                className="inline-block min-w-full"
              >
                <table className="border-collapse">
                  <thead>
                    <tr className="border-b-2 border-green-300 bg-green-50">
                      <th className="sticky left-0 top-0 z-30 w-12 border-r border-gray-300 bg-green-100 px-3 py-2 text-center text-sm font-bold text-gray-700">
                        #
                      </th>
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="sticky top-0 z-20 min-w-32 border-r border-gray-300 bg-green-50 px-3 py-2 text-center text-sm font-bold text-gray-700"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-gray-200">
                        <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-2 text-center text-sm font-semibold text-gray-700">
                          {rowIndex + 1}
                        </td>
                        {columns.map((_, colIndex) => {
                          const isSelected = selectedCell.row === rowIndex && selectedCell.col === colIndex
                          const cellFormat = activeSheetName
                            ? cellFormats[activeSheetName]?.[getCellKey(rowIndex, colIndex)]
                            : undefined

                          return (
                            <td key={`${rowIndex}-${colIndex}`} className="border-r border-gray-300 p-0 text-sm">
                              <input
                                type="text"
                                value={getCellText(row[colIndex] ?? '')}
                                onFocus={() => handleCellFocus(rowIndex, colIndex)}
                                onChange={(e) => {
                                  setFormulaValue(e.target.value)
                                  updateCellValue(rowIndex, colIndex, e.target.value)
                                }}
                                className={`h-9 w-full border-0 px-2 text-sm focus:outline-none ${
                                  isSelected
                                    ? 'bg-yellow-50 ring-2 ring-inset ring-green-500'
                                    : 'bg-white hover:bg-green-50'
                                }`}
                                style={{
                                  minWidth: '9rem',
                                  color: cellFormat?.color || '#111827',
                                  backgroundColor:
                                    isSelected
                                      ? cellFormat?.backgroundColor || '#fefce8'
                                      : cellFormat?.backgroundColor || '#ffffff',
                                  fontFamily: cellFormat?.fontFamily || 'Calibri',
                                  fontSize: `${cellFormat?.fontSize || 14}px`,
                                  fontWeight: cellFormat?.bold ? 700 : 400,
                                  fontStyle: cellFormat?.italic ? 'italic' : 'normal',
                                }}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PageRail
        title="SCREENS"
        items={sheetItems}
        activeId={String(selectedSheet + 1)}
        accentColor="#16a34a"
        side="right"
        onReorder={handleReorderSheets}
        footer={
          <button
            onClick={handleAddSheet}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-500 transition-all hover:border-green-500 hover:text-green-600"
          >
            <Plus size={14} />
            Add New Sheet
          </button>
        }
      />
    </div>
  )
}
