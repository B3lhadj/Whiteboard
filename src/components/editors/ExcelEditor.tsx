import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type UIEvent } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import * as XLSX from 'xlsx'
import { AlertCircle, Check, ChevronDown, MoreVertical, Plus, X } from 'lucide-react'
import PageRail, { type PageRailItem } from '../PageRail'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils' // Add this import
import { getShapeSize, getShapeSvg, type ShapeKind } from '../../shapes'

interface ExcelEditorProps {
  file: DocumentFile
}

type LetterCaseMode = 'upper' | 'lower'

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
type ExcelShape = {
  id: string
  kind: ShapeKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  stroke: string
  fill: string
  text?: string
}
type ExcelSnapshot = {
  sheets: string[]
  sheetsData: Record<string, SheetData>
  selectedSheet: number
  selectedCell: { row: number; col: number }
  formulaValue: string
  cellFormats: Record<string, Record<string, CellFormat>>
  columnWidths: Record<string, Record<number, number>>
  shapes: ExcelShape[]
  visibleRowCount: number
  visibleColCount: number
}

const MIN_ROWS = 40
const MIN_COLS = 18
const DEFAULT_COLUMN_WIDTH = 132
const MIN_COLUMN_WIDTH = 34
const MAX_COLUMN_WIDTH = 520
const MAX_INITIAL_COLUMN_WIDTH = 240
const MIN_ROW_HEIGHT = 44
const MAX_ROW_HEIGHT = 260
const CELL_LINE_HEIGHT = 20
const CELL_VERTICAL_PADDING = 18
const INITIAL_RENDER_ROWS = 160
const ROW_RENDER_INCREMENT = 160
const INITIAL_RENDER_COLS = 40
const COL_RENDER_INCREMENT = 20

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

const getTextFitWidth = (text: string) => {
  if (!text) return DEFAULT_COLUMN_WIDTH
  return Math.min(MAX_COLUMN_WIDTH, Math.max(DEFAULT_COLUMN_WIDTH, text.length * 8 + 28))
}

const getInitialColumnWidths = (rows: SheetData) => {
  const columnCount = Math.max(MIN_COLS, ...rows.map((row) => row.length))
  const widths: Record<number, number> = {}

  for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
    const contentWidth = rows.reduce((maxWidth, row) => {
      const text = getCellText(row[colIndex] ?? '')
      return Math.max(maxWidth, text.length * 7 + 36)
    }, DEFAULT_COLUMN_WIDTH)

    widths[colIndex] = Math.min(MAX_INITIAL_COLUMN_WIDTH, Math.max(DEFAULT_COLUMN_WIDTH, contentWidth))
  }

  return widths
}

const getWrappedLineCount = (text: string, width: number) => {
  if (!text) return 1

  const usableWidth = Math.max(48, width - 18)
  const charactersPerLine = Math.max(6, Math.floor(usableWidth / 7))

  return text.split(/\r?\n/).reduce((lineCount, line) => {
    return lineCount + Math.max(1, Math.ceil(line.length / charactersPerLine))
  }, 0)
}

const isFormula = (value: CellValue) => typeof value === 'string' && value.trim().startsWith('=')

const worksheetToSheetData = (worksheet?: XLSX.WorkSheet): SheetData => {
  if (!worksheet) return normalizeSheetData([])

  const cellRefs = Object.keys(worksheet).filter((key) => !key.startsWith('!') && /^[A-Z]+\d+$/i.test(key))
  if (cellRefs.length === 0) return normalizeSheetData([])

  const decodedCells = cellRefs.map((ref) => XLSX.utils.decode_cell(ref))
  const maxRow = Math.max(...decodedCells.map((cell) => cell.r))
  const maxCol = Math.max(...decodedCells.map((cell) => cell.c))
  const rows: SheetData = []

  for (let rowIndex = 0; rowIndex <= maxRow; rowIndex += 1) {
    const row: CellValue[] = []
    for (let colIndex = 0; colIndex <= maxCol; colIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
      const cell = worksheet[address]
      if (!cell) {
        row.push('')
      } else if (cell.f) {
        row.push(`=${cell.f}`)
      } else {
        row.push(cell.w ?? cell.v ?? '')
      }
    }
    rows.push(row)
  }

  return normalizeSheetData(rows)
}

const cloneSheetData = (data: SheetData): SheetData => data.map((row) => [...row])

const cloneSheetsData = (data: Record<string, SheetData>): Record<string, SheetData> =>
  Object.fromEntries(Object.entries(data).map(([sheetName, rows]) => [sheetName, cloneSheetData(rows)]))

const cloneCellFormats = (
  formats: Record<string, Record<string, CellFormat>>
): Record<string, Record<string, CellFormat>> =>
  Object.fromEntries(
    Object.entries(formats).map(([sheetName, sheetFormats]) => [
      sheetName,
      Object.fromEntries(
        Object.entries(sheetFormats).map(([cellKey, format]) => [cellKey, { ...format }])
      ),
    ])
  )

const cloneColumnWidths = (
  widths: Record<string, Record<number, number>>
): Record<string, Record<number, number>> =>
  Object.fromEntries(
    Object.entries(widths).map(([sheetName, sheetWidths]) => [
      sheetName,
      Object.fromEntries(Object.entries(sheetWidths).map(([index, width]) => [Number(index), width])),
    ])
  )

const cloneExcelShapes = (shapes: ExcelShape[]) => shapes.map((shape) => ({ ...shape }))

export default function ExcelEditor({ file }: ExcelEditorProps) {
  const [sheets, setSheets] = useState<string[]>([])
  const [sheetsData, setSheetsData] = useState<Record<string, SheetData>>({})
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [selectedCell, setSelectedCell] = useState({ row: 0, col: 0 })
  const [formulaValue, setFormulaValue] = useState('')
  const [cellFormats, setCellFormats] = useState<Record<string, Record<string, CellFormat>>>({})
  const [columnWidths, setColumnWidths] = useState<Record<string, Record<number, number>>>({})
  const [shapes, setShapes] = useState<ExcelShape[]>([])
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_RENDER_ROWS)
  const [visibleColCount, setVisibleColCount] = useState(INITIAL_RENDER_COLS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const workbookRef = useRef<XLSX.WorkBook | null>(null)
  const topScrollbarRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableContentRef = useRef<HTMLDivElement | null>(null)
  const syncingScrollRef = useRef(false)
  const zoom = useDocumentStore((state) => state.zoom)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const selectedShape = useDocumentStore((state) => state.selectedShape)
  const textColor = useDocumentStore((state) => state.textColor)
  const shapeFillColor = useDocumentStore((state) => state.shapeFillColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const lastToolbarFormatRef = useRef({ textColor, textFontFamily, textFontSize })
  const [topScrollbarWidth, setTopScrollbarWidth] = useState<number | string>('100%')
  
  // Add theme color based on file type
  const themeColor = getThemeForFileType(file.type)

  const activeSheetName = sheets[selectedSheet]
  const activeData = activeSheetName ? sheetsData[activeSheetName] || [] : []
  const columnCount = activeData[0]?.length || MIN_COLS
  const renderedRows = activeData.slice(0, Math.min(activeData.length, visibleRowCount))
  const renderedColumnCount = Math.min(columnCount, visibleColCount)

  const columns = useMemo(
    () => Array.from({ length: renderedColumnCount }, (_, index) => XLSX.utils.encode_col(index)),
    [renderedColumnCount]
  )

  const getCellKey = (rowIndex: number, colIndex: number) => `${rowIndex}:${colIndex}`
  const selectedCellKey = getCellKey(selectedCell.row, selectedCell.col)
  const getColumnWidth = (colIndex: number) =>
    activeSheetName ? columnWidths[activeSheetName]?.[colIndex] || DEFAULT_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH
  const getRowHeight = (row: CellValue[]) => {
    const maxLineCount = row.slice(0, renderedColumnCount).reduce<number>((lineCount, value, colIndex) => {
      return Math.max(lineCount, getWrappedLineCount(getCellText(value), getColumnWidth(colIndex)))
    }, 1)

    return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, maxLineCount * CELL_LINE_HEIGHT + CELL_VERTICAL_PADDING))
  }

  const getExcelSnapshot = (): ExcelSnapshot => ({
    sheets: [...sheets],
    sheetsData: cloneSheetsData(sheetsData),
    selectedSheet,
    selectedCell: { ...selectedCell },
    formulaValue,
    cellFormats: cloneCellFormats(cellFormats),
    columnWidths: cloneColumnWidths(columnWidths),
    shapes: cloneExcelShapes(shapes),
    visibleRowCount,
    visibleColCount,
  })

  const restoreExcelSnapshot = (snapshot: ExcelSnapshot) => {
    const nextSheetsData = cloneSheetsData(snapshot.sheetsData)
    const nextCellFormats = cloneCellFormats(snapshot.cellFormats)
    const nextColumnWidths = cloneColumnWidths(snapshot.columnWidths)
    const nextShapes = cloneExcelShapes(snapshot.shapes)

    setSheets([...snapshot.sheets])
    setSheetsData(nextSheetsData)
    setSelectedSheet(snapshot.selectedSheet)
    setSelectedCell({ ...snapshot.selectedCell })
    setFormulaValue(snapshot.formulaValue)
    setCellFormats(nextCellFormats)
    setColumnWidths(nextColumnWidths)
    setShapes(nextShapes)
    setSelectedShapeId(null)
    setVisibleRowCount(snapshot.visibleRowCount)
    setVisibleColCount(snapshot.visibleColCount)

    const workbook = workbookRef.current
    if (workbook) {
      Object.keys(workbook.Sheets).forEach((sheetName) => {
        delete workbook.Sheets[sheetName]
      })
      workbook.SheetNames = [...snapshot.sheets]
      snapshot.sheets.forEach((sheetName) => {
        syncWorksheet(sheetName, nextSheetsData[sheetName] || normalizeSheetData([]))
      })
    }

    const restoredSheetName = snapshot.sheets[snapshot.selectedSheet]
    updateCounts(nextSheetsData[restoredSheetName] || [])
  }

  const recordExcelHistory = (label: string, before: ExcelSnapshot, after: ExcelSnapshot) => {
    window.dispatchEvent(
      new CustomEvent('editor-history-snapshot', {
        detail: {
          label,
          applyUndo: () => restoreExcelSnapshot(before),
          applyRedo: () => restoreExcelSnapshot(after),
        },
      })
    )
  }

  useEffect(() => {
    const loadExcel = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const workbook = XLSX.read(file.content, { type: 'array', cellFormula: true, cellStyles: true })
        workbookRef.current = workbook

        const sheetNames = workbook.SheetNames.length > 0 ? workbook.SheetNames : ['Sheet1']
        const nextSheetsData: Record<string, SheetData> = {}
        const nextColumnWidths: Record<string, Record<number, number>> = {}

        sheetNames.forEach((sheetName) => {
          nextSheetsData[sheetName] = worksheetToSheetData(workbook.Sheets[sheetName])
          nextColumnWidths[sheetName] = getInitialColumnWidths(nextSheetsData[sheetName])
        })

        setSheets(sheetNames)
        setSheetsData(nextSheetsData)
        setCellFormats({})
        setColumnWidths(nextColumnWidths)
        setShapes([])
        setSelectedShapeId(null)
        setSelectedSheet(0)
        setSelectedCell({ row: 0, col: 0 })
        setVisibleRowCount(INITIAL_RENDER_ROWS)
        setVisibleColCount(INITIAL_RENDER_COLS)
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

  const getCellNumericValue = (
    rows: SheetData,
    rowIndex: number,
    colIndex: number,
    visited = new Set<string>()
  ): number => {
    const key = getCellKey(rowIndex, colIndex)
    if (visited.has(key)) return 0

    const value = rows[rowIndex]?.[colIndex]
    if (typeof value === 'number') return value
    if (typeof value === 'boolean') return value ? 1 : 0

    const text = getCellText(value).trim()
    if (!text) return 0
    if (isFormula(text)) {
      const result = evaluateFormula(text, rows, new Set([...visited, key]))
      return Number.isFinite(Number(result)) ? Number(result) : 0
    }

    const numeric = Number(text.replace(',', '.'))
    return Number.isFinite(numeric) ? numeric : 0
  }

  const getRangeValues = (rangeRef: string, rows: SheetData, visited: Set<string>) => {
    const [startRef, endRef = startRef] = rangeRef.split(':')
    const start = XLSX.utils.decode_cell(startRef)
    const end = XLSX.utils.decode_cell(endRef)
    const minRow = Math.min(start.r, end.r)
    const maxRow = Math.max(start.r, end.r)
    const minCol = Math.min(start.c, end.c)
    const maxCol = Math.max(start.c, end.c)
    const values: number[] = []

    for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
      for (let colIndex = minCol; colIndex <= maxCol; colIndex += 1) {
        values.push(getCellNumericValue(rows, rowIndex, colIndex, visited))
      }
    }

    return values
  }

  const evaluateFormula = (value: string, rows: SheetData, visited = new Set<string>()): string | number => {
    const formula = value.trim().slice(1)
    if (!formula) return ''

    const applyFunction = (name: string, refsText: string) => {
      const refs = refsText.split(/[,;]/).map((item) => item.trim()).filter(Boolean)
      const values = refs.flatMap((ref) =>
        /^[A-Z]+\d+(?::[A-Z]+\d+)?$/i.test(ref)
          ? getRangeValues(ref.toUpperCase(), rows, visited)
          : [Number(ref.replace(',', '.'))]
      ).filter((number) => Number.isFinite(number))

      if (name === 'SUM') return values.reduce((sum, number) => sum + number, 0)
      if (name === 'AVERAGE') return values.length ? values.reduce((sum, number) => sum + number, 0) / values.length : 0
      if (name === 'MIN') return values.length ? Math.min(...values) : 0
      if (name === 'MAX') return values.length ? Math.max(...values) : 0
      if (name === 'COUNT') return values.length
      return 0
    }

    let expression = formula.replace(/\b(SUM|SOMME|AVERAGE|AVG|MOYENNE|MIN|MAX|COUNT|NB)\(([^()]*)\)/gi, (_match, rawName, refs) => {
      const aliases: Record<string, string> = {
        AVG: 'AVERAGE',
        MOYENNE: 'AVERAGE',
        SOMME: 'SUM',
        NB: 'COUNT',
      }
      const rawFunctionName = rawName.toUpperCase()
      const name = aliases[rawFunctionName] || rawFunctionName
      return String(applyFunction(name, refs))
    })

    expression = expression.replace(/\b[A-Z]+\d+\b/gi, (cellRef) => {
      const cell = XLSX.utils.decode_cell(cellRef.toUpperCase())
      return String(getCellNumericValue(rows, cell.r, cell.c, visited))
    })
    expression = expression.replace(/\^/g, '**')

    if (!/^[\d+\-*/().\s*]+$/.test(expression)) {
      return '#VALUE!'
    }

    try {
      const result = Function(`"use strict"; return (${expression})`)()
      if (!Number.isFinite(result)) return '#DIV/0!'
      return Number.isInteger(result) ? result : Number(result.toFixed(6))
    } catch {
      return '#ERROR!'
    }
  }

  const getDisplayCellValue = (value: CellValue, rowIndex: number, colIndex: number) => {
    if (selectedCell.row === rowIndex && selectedCell.col === colIndex) {
      return getCellText(value)
    }
    if (!isFormula(value)) return getCellText(value)
    return getCellText(evaluateFormula(getCellText(value), activeData, new Set([getCellKey(rowIndex, colIndex)])))
  }

  const syncWorksheet = (sheetName: string, rows: SheetData) => {
    const workbook = workbookRef.current
    if (!workbook) return

    const worksheet = XLSX.utils.aoa_to_sheet(rows)
    rows.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (!isFormula(value)) return
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
        worksheet[address] = {
          t: 'n',
          f: getCellText(value).trim().slice(1),
          v: getCellNumericValue(rows, rowIndex, colIndex),
        }
      })
    })
    workbook.Sheets[sheetName] = worksheet
    if (!workbook.SheetNames.includes(sheetName)) {
      workbook.SheetNames.push(sheetName)
    }
  }

  // Save-to-DB integration: respond to save requests from EditorView
  useEffect(() => {
    const handleSaveRequest = () => {
      const workbook = workbookRef.current
      if (!workbook) return

      // Sync all sheets before exporting
      sheets.forEach((sheetName) => {
        syncWorksheet(sheetName, sheetsData[sheetName] || [])
      })

      try {
        const arrayBuffer: ArrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        const chunkSize = 0x8000
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
        }
        const base64 = btoa(binary)
        window.dispatchEvent(new CustomEvent('editor-save-content-ready', {
          detail: {
            contentBase64: base64,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        }))
      } catch (err) {
        console.error('Excel serialization for save failed:', err)
      }
    }

    window.addEventListener('editor-request-save-content', handleSaveRequest)
    return () => window.removeEventListener('editor-request-save-content', handleSaveRequest)
  }, [sheets, sheetsData])

  const selectSheet = (index: number) => {
    const nextSheetName = sheets[index]
    if (!nextSheetName) return

    const firstValue = sheetsData[nextSheetName]?.[0]?.[0] ?? ''
    setSelectedSheet(index)
    setSelectedCell({ row: 0, col: 0 })
    setVisibleRowCount(INITIAL_RENDER_ROWS)
    setVisibleColCount(INITIAL_RENDER_COLS)
    setFormulaValue(getCellText(firstValue))
    updateCounts(sheetsData[nextSheetName] || [])
  }

  const updateCellValue = (rowIndex: number, colIndex: number, value: string) => {
    if (!activeSheetName) return
    const currentValue = getCellText(activeData[rowIndex]?.[colIndex] ?? '')
    if (currentValue === value) return

    const before = getExcelSnapshot()
    expandColumnForText(colIndex, value)

    const currentRows = normalizeSheetData(sheetsData[activeSheetName] || [])
    const rows = currentRows.map((row) => [...row])

    while (rows.length <= rowIndex) {
      rows.push(Array.from({ length: columnCount }, () => ''))
    }
    while (rows[rowIndex].length <= colIndex) {
      rows.forEach((row) => row.push(''))
    }

    rows[rowIndex][colIndex] = value
    const nextSheetsData = { ...sheetsData, [activeSheetName]: rows }
    const after: ExcelSnapshot = {
      ...before,
      sheetsData: cloneSheetsData(nextSheetsData),
      formulaValue: value,
    }

    syncWorksheet(activeSheetName, rows)
    updateCounts(rows)
    setSheetsData(nextSheetsData)
    recordExcelHistory('Modification de cellule', before, after)
  }

  const handleCellFocus = (rowIndex: number, colIndex: number) => {
    setSelectedCell({ row: rowIndex, col: colIndex })
    setFormulaValue(getCellText(activeData[rowIndex]?.[colIndex] ?? ''))
  }

  const handleFormulaChange = (value: string) => {
    setFormulaValue(value)
    updateCellValue(selectedCell.row, selectedCell.col, value)
  }

  const clearSelectedCell = () => {
    setFormulaValue('')
    updateCellValue(selectedCell.row, selectedCell.col, '')
  }

  const commitFormulaValue = () => {
    updateCellValue(selectedCell.row, selectedCell.col, formulaValue)
  }

  const insertFunction = (name: 'SOMME' | 'MOYENNE' | 'MIN' | 'MAX' | 'NB') => {
    const col = XLSX.utils.encode_col(selectedCell.col)
    const selectedRowNumber = selectedCell.row + 1
    const hasRowsAbove = selectedCell.row > 0
    const endRow = hasRowsAbove ? selectedRowNumber - 1 : selectedRowNumber + 5
    const startRow = hasRowsAbove ? Math.max(1, endRow - 4) : selectedRowNumber + 1
    const nextValue = `=${name}(${col}${startRow}:${col}${endRow})`
    setFormulaValue(nextValue)
    updateCellValue(selectedCell.row, selectedCell.col, nextValue)
  }

  const insertRowAt = (rowIndex: number) => {
    if (!activeSheetName) return
    const before = getExcelSnapshot()
    const rows = normalizeSheetData(sheetsData[activeSheetName] || [])
    const columnLength = Math.max(columnCount, MIN_COLS)
    const insertIndex = Math.max(0, Math.min(rowIndex, rows.length))
    const nextRows = [
      ...rows.slice(0, insertIndex),
      Array.from({ length: columnLength }, () => ''),
      ...rows.slice(insertIndex),
    ]
    const nextSheetsData = { ...sheetsData, [activeSheetName]: nextRows }
    const nextRow = Math.max(0, Math.min(rowIndex, activeData.length))
    const after: ExcelSnapshot = {
      ...before,
      sheetsData: cloneSheetsData(nextSheetsData),
      selectedCell: { row: nextRow, col: selectedCell.col },
      formulaValue: '',
      visibleRowCount: Math.max(visibleRowCount, nextRow + 1),
    }

    syncWorksheet(activeSheetName, nextRows)
    updateCounts(nextRows)
    setSheetsData(nextSheetsData)
    setVisibleRowCount(after.visibleRowCount)
    setSelectedCell(after.selectedCell)
    setFormulaValue('')
    recordExcelHistory('Insertion de ligne', before, after)
  }

  const insertColumnAt = (colIndex: number) => {
    if (!activeSheetName) return
    const before = getExcelSnapshot()
    const insertIndex = Math.max(0, Math.min(colIndex, columnCount))
    const rows = normalizeSheetData(sheetsData[activeSheetName] || [])
    const nextRows = rows.map((row) => [
      ...row.slice(0, insertIndex),
      '',
      ...row.slice(insertIndex),
    ])
    const nextSheetsData = { ...sheetsData, [activeSheetName]: nextRows }
    const currentWidths = columnWidths[activeSheetName] || {}
    const nextWidths: Record<number, number> = {}
    Object.entries(currentWidths).forEach(([key, width]) => {
      const index = Number(key)
      nextWidths[index >= insertIndex ? index + 1 : index] = width
    })
    nextWidths[insertIndex] = DEFAULT_COLUMN_WIDTH
    const nextColumnWidths = { ...columnWidths, [activeSheetName]: nextWidths }
    const after: ExcelSnapshot = {
      ...before,
      sheetsData: cloneSheetsData(nextSheetsData),
      columnWidths: cloneColumnWidths(nextColumnWidths),
      selectedCell: { row: selectedCell.row, col: insertIndex },
      formulaValue: '',
      visibleColCount: Math.max(visibleColCount, insertIndex + 1),
    }

    syncWorksheet(activeSheetName, nextRows)
    updateCounts(nextRows)
    setSheetsData(nextSheetsData)
    setColumnWidths(nextColumnWidths)
    setVisibleColCount(after.visibleColCount)
    setSelectedCell(after.selectedCell)
    setFormulaValue('')
    recordExcelHistory('Insertion de colonne', before, after)
  }

  const insertRowAbove = () => insertRowAt(selectedCell.row)
  const insertRowBelow = () => insertRowAt(selectedCell.row + 1)
  const insertColumnBefore = () => insertColumnAt(selectedCell.col)
  const insertColumnAfter = () => insertColumnAt(selectedCell.col + 1)

  useEffect(() => {
    const transformText = (text: string, mode: LetterCaseMode) =>
      mode === 'upper' ? text.toLocaleUpperCase() : text.toLocaleLowerCase()

    const handleChangeCase = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: LetterCaseMode }>).detail?.mode
      if (!mode) return

      const currentValue = getCellText(activeData[selectedCell.row]?.[selectedCell.col] ?? '')
      const nextValue = transformText(currentValue, mode)
      setFormulaValue(nextValue)
      updateCellValue(selectedCell.row, selectedCell.col, nextValue)
    }

    window.addEventListener('editor-change-case', handleChangeCase)
    return () => window.removeEventListener('editor-change-case', handleChangeCase)
  }, [activeData, selectedCell.row, selectedCell.col])

  const setColumnWidth = (colIndex: number, width: number) => {
    if (!activeSheetName) return

    setColumnWidths((previous) => ({
      ...previous,
      [activeSheetName]: {
        ...(previous[activeSheetName] || {}),
        [colIndex]: Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width))),
      },
    }))
  }

  const expandColumnForText = (colIndex: number, value: string) => {
    const nextWidth = getTextFitWidth(value)
    if (nextWidth > getColumnWidth(colIndex)) {
      setColumnWidth(colIndex, nextWidth)
    }
  }

  const handleColumnResizeStart = (event: ReactPointerEvent<HTMLSpanElement>, colIndex: number) => {
    event.preventDefault()
    event.stopPropagation()

    const before = getExcelSnapshot()
    const startX = event.clientX
    const startWidth = getColumnWidth(colIndex)
    let nextWidth = startWidth

    const resize = (moveEvent: PointerEvent) => {
      nextWidth = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX))
      )
      setColumnWidth(colIndex, nextWidth)
    }

    const stopResize = () => {
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stopResize)

      if (nextWidth !== startWidth && activeSheetName) {
        const nextColumnWidths = {
          ...columnWidths,
          [activeSheetName]: {
            ...(columnWidths[activeSheetName] || {}),
            [colIndex]: nextWidth,
          },
        }
        recordExcelHistory('Largeur de colonne', before, {
          ...before,
          columnWidths: cloneColumnWidths(nextColumnWidths),
        })
      }
    }

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stopResize)
  }

  const autofitColumn = (colIndex: number) => {
    const headerWidth = columns[colIndex]?.length ? columns[colIndex].length * 12 + 36 : DEFAULT_COLUMN_WIDTH
    const contentWidth = activeData.reduce((maxWidth, row) => {
      const text = getCellText(row[colIndex] ?? '')
      return Math.max(maxWidth, text.length * 8 + 28)
    }, headerWidth)

    const before = getExcelSnapshot()
    const nextWidth = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(contentWidth)))
    if (nextWidth === getColumnWidth(colIndex) || !activeSheetName) return
    const nextColumnWidths = {
      ...columnWidths,
      [activeSheetName]: {
        ...(columnWidths[activeSheetName] || {}),
        [colIndex]: nextWidth,
      },
    }

    setColumnWidth(colIndex, nextWidth)
    recordExcelHistory('Ajustement de colonne', before, {
      ...before,
      columnWidths: cloneColumnWidths(nextColumnWidths),
    })
  }

  const updateSelectedCellFormat = (patch: CellFormat) => {
    if (!activeSheetName) return
    const before = getExcelSnapshot()
    const sheetFormats = cellFormats[activeSheetName] || {}
    const currentFormat = sheetFormats[selectedCellKey] || {}
    const nextCellFormat = {
      ...currentFormat,
      ...patch,
    }
    if (JSON.stringify(currentFormat) === JSON.stringify(nextCellFormat)) return
    const nextCellFormats = {
      ...cellFormats,
      [activeSheetName]: {
        ...sheetFormats,
        [selectedCellKey]: nextCellFormat,
      },
    }

    setCellFormats(nextCellFormats)
    recordExcelHistory('Format de cellule', before, {
      ...before,
      cellFormats: cloneCellFormats(nextCellFormats),
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
  }, [activeSheetName, activeData.length, columnCount, zoom, columnWidths])

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

  const getExcelPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const content = tableContentRef.current
    if (!content) return { x: 24, y: 24 }

    const rect = content.getBoundingClientRect()
    const scale = zoom / 100 || 1

    return {
      x: Math.max(0, (event.clientX - rect.left) / scale),
      y: Math.max(0, (event.clientY - rect.top) / scale),
    }
  }

  const getNextShapesSnapshot = (nextShapes: ExcelShape[]): ExcelSnapshot => ({
    ...getExcelSnapshot(),
    shapes: cloneExcelShapes(nextShapes),
  })

  const insertExcelShape = (event: ReactPointerEvent<HTMLElement>, kind: ShapeKind) => {
    const before = getExcelSnapshot()
    const point = getExcelPoint(event)
    const shapeSize = getShapeSize(kind)
    const nextShape: ExcelShape = {
      id: `excel-shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      x: point.x,
      y: point.y,
      width: shapeSize.width,
      height: shapeSize.height,
      rotation: 0,
      stroke: textColor,
      fill: shapeFillColor,
      text: kind === 'text-box' ? 'Text box' : undefined,
    }
    const nextShapes = [...shapes, nextShape]

    setShapes(nextShapes)
    setSelectedShapeId(nextShape.id)
    setActiveTool('select')
    recordExcelHistory('Insertion de forme', before, getNextShapesSnapshot(nextShapes))
  }

  const updateExcelShape = (shapeId: string, patch: Partial<ExcelShape>) => {
    setShapes((previous) =>
      previous.map((shape) => (shape.id === shapeId ? { ...shape, ...patch } : shape))
    )
  }

  const deleteExcelShape = (shapeId: string) => {
    const before = getExcelSnapshot()
    const nextShapes = shapes.filter((shape) => shape.id !== shapeId)

    setShapes(nextShapes)
    setSelectedShapeId(null)
    recordExcelHistory('Suppression de forme', before, getNextShapesSnapshot(nextShapes))
  }

  const beginMoveExcelShape = (event: ReactPointerEvent<HTMLElement>, shape: ExcelShape) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedShapeId(shape.id)

    const before = getExcelSnapshot()
    const startX = event.clientX
    const startY = event.clientY
    const scale = zoom / 100 || 1

    const move = (moveEvent: PointerEvent) => {
      updateExcelShape(shape.id, {
        x: Math.max(0, shape.x + (moveEvent.clientX - startX) / scale),
        y: Math.max(0, shape.y + (moveEvent.clientY - startY) / scale),
      })
    }

    const stop = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      const nextShapes = shapes.map((item) =>
        item.id === shape.id
          ? {
              ...item,
              x: Math.max(0, shape.x + (upEvent.clientX - startX) / scale),
              y: Math.max(0, shape.y + (upEvent.clientY - startY) / scale),
            }
          : item
      )
      setShapes(nextShapes)
      recordExcelHistory('Deplacement de forme', before, getNextShapesSnapshot(nextShapes))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const beginResizeExcelShape = (event: ReactPointerEvent<HTMLElement>, shape: ExcelShape) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedShapeId(shape.id)

    const before = getExcelSnapshot()
    const startX = event.clientX
    const startY = event.clientY
    const scale = zoom / 100 || 1

    const getNextSize = (pointerEvent: PointerEvent) => ({
      width: Math.max(36, shape.width + (pointerEvent.clientX - startX) / scale),
      height: Math.max(24, shape.height + (pointerEvent.clientY - startY) / scale),
    })

    const resize = (moveEvent: PointerEvent) => {
      updateExcelShape(shape.id, getNextSize(moveEvent))
    }

    const stop = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
      const nextSize = getNextSize(upEvent)
      const nextShapes = shapes.map((item) =>
        item.id === shape.id ? { ...item, ...nextSize } : item
      )
      setShapes(nextShapes)
      recordExcelHistory('Redimensionnement de forme', before, getNextShapesSnapshot(nextShapes))
    }

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop)
  }

  const beginRotateExcelShape = (event: ReactPointerEvent<HTMLElement>, shape: ExcelShape) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedShapeId(shape.id)

    const before = getExcelSnapshot()
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX)

    const rotate = (moveEvent: PointerEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX)
      const delta = ((currentAngle - startAngle) * 180) / Math.PI
      updateExcelShape(shape.id, { rotation: Math.round(shape.rotation + delta) })
    }

    const stop = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', rotate)
      window.removeEventListener('pointerup', stop)
      const endAngle = Math.atan2(upEvent.clientY - centerY, upEvent.clientX - centerX)
      const delta = ((endAngle - startAngle) * 180) / Math.PI
      const nextRotation = Math.round(shape.rotation + delta)
      const nextShapes = shapes.map((item) =>
        item.id === shape.id ? { ...item, rotation: nextRotation } : item
      )
      setShapes(nextShapes)
      recordExcelHistory('Rotation de forme', before, getNextShapesSnapshot(nextShapes))
    }

    window.addEventListener('pointermove', rotate)
    window.addEventListener('pointerup', stop)
  }

  const handleExcelCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.excel-shape-object')) return

    if (activeTool === 'shape' || activeTool === 'text') {
      event.preventDefault()
      insertExcelShape(event, activeTool === 'text' ? 'text-box' : selectedShape)
      return
    }

    if (activeTool === 'select') {
      setSelectedShapeId(null)
    }
  }

  useEffect(() => {
    const handleShapeColorChange = (event: Event) => {
      const color = (event as CustomEvent<{ color?: string }>).detail?.color
      if (!color || !selectedShapeId) return

      const before = getExcelSnapshot()
      const nextShapes = shapes.map((shape) =>
        shape.id === selectedShapeId ? { ...shape, stroke: color } : shape
      )
      setShapes(nextShapes)
      recordExcelHistory('Couleur de forme', before, getNextShapesSnapshot(nextShapes))
    }

    const handleShapeFillChange = (event: Event) => {
      const fill = (event as CustomEvent<{ color?: string }>).detail?.color
      if (!fill || !selectedShapeId) return

      const before = getExcelSnapshot()
      const nextShapes = shapes.map((shape) =>
        shape.id === selectedShapeId ? { ...shape, fill } : shape
      )
      setShapes(nextShapes)
      recordExcelHistory('Remplissage de forme', before, getNextShapesSnapshot(nextShapes))
    }

    window.addEventListener('editor-shape-color-change', handleShapeColorChange)
    window.addEventListener('editor-shape-fill-change', handleShapeFillChange)
    return () => {
      window.removeEventListener('editor-shape-color-change', handleShapeColorChange)
      window.removeEventListener('editor-shape-fill-change', handleShapeFillChange)
    }
  }, [selectedShapeId, shapes])

  const handleDeleteSheet = (sheetName: string) => {
    if (sheets.length <= 1) return
    const before = getExcelSnapshot()

    const nextSheets = sheets.filter((name) => name !== sheetName)
    const nextSheetsData = { ...sheetsData }
    delete nextSheetsData[sheetName]
    const nextCellFormats = { ...cellFormats }
    delete nextCellFormats[sheetName]
    const nextColumnWidths = { ...columnWidths }
    delete nextColumnWidths[sheetName]

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
    setCellFormats(nextCellFormats)
    setColumnWidths(nextColumnWidths)
    updateCounts(nextSheetsData[nextSheetName] || [])
    recordExcelHistory('Suppression de feuille', before, {
      ...before,
      sheets: [...nextSheets],
      sheetsData: cloneSheetsData(nextSheetsData),
      selectedSheet: nextSelectedSheet,
      selectedCell: { row: 0, col: 0 },
      formulaValue: getCellText(nextSheetsData[nextSheetName]?.[0]?.[0] ?? ''),
      cellFormats: cloneCellFormats(nextCellFormats),
      columnWidths: cloneColumnWidths(nextColumnWidths),
    })
  }

  const handleAddSheet = () => {
    const before = getExcelSnapshot()
    let index = sheets.length + 1
    let sheetName = `Sheet${index}`
    while (sheets.includes(sheetName)) {
      index += 1
      sheetName = `Sheet${index}`
    }

    const rows = normalizeSheetData([])
    const nextSheets = [...sheets, sheetName]
    const nextSheetsData = { ...sheetsData, [sheetName]: rows }
    syncWorksheet(sheetName, rows)
    setSheets(nextSheets)
    setSheetsData(nextSheetsData)
    setSelectedSheet(sheets.length)
    setSelectedCell({ row: 0, col: 0 })
    setVisibleRowCount(INITIAL_RENDER_ROWS)
    setVisibleColCount(INITIAL_RENDER_COLS)
    setFormulaValue('')
    updateCounts(rows)
    recordExcelHistory('Nouvelle feuille', before, {
      ...before,
      sheets: nextSheets,
      sheetsData: cloneSheetsData(nextSheetsData),
      selectedSheet: sheets.length,
      selectedCell: { row: 0, col: 0 },
      formulaValue: '',
      visibleRowCount: INITIAL_RENDER_ROWS,
      visibleColCount: INITIAL_RENDER_COLS,
    })
  }

  const handleReorderSheets = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const before = getExcelSnapshot()
    const nextSheets = [...sheets]
    const removedSheets = nextSheets.splice(fromIndex, 1)
    nextSheets.splice(toIndex, 0, removedSheets[0])

    const workbook = workbookRef.current
    if (workbook) {
      workbook.SheetNames = nextSheets
    }

    setSheets(nextSheets)
    let nextSelectedSheet = selectedSheet

    if (selectedSheet === fromIndex) {
      nextSelectedSheet = toIndex
    } else if (selectedSheet > fromIndex && selectedSheet <= toIndex) {
      nextSelectedSheet = selectedSheet - 1
    } else if (selectedSheet >= toIndex && selectedSheet < fromIndex) {
      nextSelectedSheet = selectedSheet + 1
    }

    setSelectedSheet(nextSelectedSheet)
    recordExcelHistory('Reorganisation des feuilles', before, {
      ...before,
      sheets: nextSheets,
      selectedSheet: nextSelectedSheet,
    })
  }

  const sheetItems: PageRailItem[] = sheets.map((sheet, index) => ({
    id: String(index + 1),
    label: sheet,
    subtitle: `${sheetsData[sheet]?.length || 0} rows`,
    preview: (
      <div className="absolute inset-0 h-full w-full overflow-hidden bg-white p-1">
        <table className="w-full border-collapse text-[6px] text-gray-700">
          <tbody>
            {(sheetsData[sheet] || []).slice(0, 10).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.slice(0, 5).map((cell, cellIndex) => (
                  <td key={cellIndex} className="max-w-[28px] truncate border border-gray-200 px-0.5 py-0.5">
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
      <div className="flex-1 min-w-0 overflow-auto p-1 sm:p-2 md:p-3">
        <div className="flex w-full max-w-none flex-col gap-3">
          <EditorNavigation
            current={selectedSheet + 1}
            total={sheets.length}
            onPrevious={() => selectSheet(Math.max(0, selectedSheet - 1))}
            onNext={() => selectSheet(Math.min(sheets.length - 1, selectedSheet + 1))}
            previousLabel="Back"
            nextLabel="Next"
            accentColor="#217346"
            className="sticky top-0 z-30 border-b border-gray-200 bg-gray-100/95 backdrop-blur"
            themeColor={themeColor} // Add this line
          />

          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800">
                {activeSheetName || 'Sheet'}
              </div>
              <div className="text-xs text-gray-500">
                Excel page {selectedSheet + 1} of {sheets.length}
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddSheet}
              className="flex shrink-0 items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
              title="Create a new Excel page"
            >
              <Plus size={16} />
              New Page
            </button>
          </div>

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

          <div className="rounded-lg border border-[#4a4a4a] bg-[#1f1f1f] px-2 py-2 shadow-sm">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-white">
              <button
                className="flex h-8 w-32 shrink-0 items-center justify-between rounded border border-[#6a6a6a] bg-[#242424] px-2 text-left text-sm text-white shadow-inner hover:bg-[#2d2d2d]"
                title="Selected cell"
              >
                <span>
                  {XLSX.utils.encode_cell({ r: selectedCell.row, c: selectedCell.col })}
                </span>
                <ChevronDown size={16} className="text-gray-300" />
              </button>

              <MoreVertical size={18} className="shrink-0 text-gray-400" />

              <div className="flex h-8 shrink-0 items-center overflow-hidden rounded border border-[#6a6a6a] bg-[#242424]">
                <button
                  onClick={clearSelectedCell}
                  className="flex h-full w-9 items-center justify-center text-red-400 hover:bg-white/10"
                  title="Clear selected cell"
                >
                  <X size={18} />
                </button>
                <button
                  onClick={commitFormulaValue}
                  className="flex h-full w-9 items-center justify-center text-green-400 hover:bg-white/10"
                  title="Apply value"
                >
                  <Check size={18} />
                </button>
                <span className="flex h-full items-center border-l border-[#6a6a6a] px-3 font-serif text-lg italic text-gray-200">
                  fx
                </span>
              </div>

              <textarea
                value={formulaValue}
                onChange={(e) => handleFormulaChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                  }
                }}
                rows={1}
                placeholder="=SOMME(A1:A5)"
                className="min-h-8 max-h-24 min-w-0 flex-1 resize-y rounded border border-[#6a6a6a] bg-[#242424] px-3 py-1.5 text-sm leading-5 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />

              <div className="flex shrink-0 items-center gap-1">
                {(['SOMME', 'MOYENNE', 'MIN', 'MAX', 'NB'] as const).map((name) => (
                  <button
                    key={name}
                    onClick={() => insertFunction(name)}
                    className="h-8 rounded border border-[#6a6a6a] bg-[#242424] px-2 text-xs font-semibold text-white hover:bg-[#2d2d2d]"
                    title={`Insert ${name} function`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  onClick={insertRowAbove}
                  className="h-8 rounded border border-[#6a6a6a] bg-[#242424] px-2 text-xs font-semibold text-white hover:bg-[#2d2d2d]"
                  title="Insert row above selected row"
                >
                  Row +
                </button>
                <button
                  onClick={insertRowBelow}
                  className="h-8 rounded border border-[#6a6a6a] bg-[#242424] px-2 text-xs font-semibold text-white hover:bg-[#2d2d2d]"
                  title="Insert row below selected row"
                >
                  + Row
                </button>
                <button
                  onClick={insertColumnBefore}
                  className="h-8 rounded border border-[#6a6a6a] bg-[#242424] px-2 text-xs font-semibold text-white hover:bg-[#2d2d2d]"
                  title="Insert column before selected column"
                >
                  Col +
                </button>
                <button
                  onClick={insertColumnAfter}
                  className="h-8 rounded border border-[#6a6a6a] bg-[#242424] px-2 text-xs font-semibold text-white hover:bg-[#2d2d2d]"
                  title="Insert column after selected column"
                >
                  + Col
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow-sm">
            <div
              ref={topScrollbarRef}
              onScroll={handleTopScrollbarScroll}
              className="overflow-x-auto overflow-y-hidden border border-b-0 border-gray-200 bg-white"
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
                onPointerDown={handleExcelCanvasPointerDown}
                onClickCapture={(event) => {
                  if (activeTool === 'shape' || activeTool === 'text') {
                    event.preventDefault()
                    event.stopPropagation()
                  }
                }}
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                }}
                className={`relative inline-block min-w-full bg-white shadow-sm ${
                  activeTool === 'shape' || activeTool === 'text' ? 'cursor-crosshair' : ''
                }`}
              >
                <table className="table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: 48 }} />
                    {columns.map((col, colIndex) => (
                      <col key={col} style={{ width: getColumnWidth(colIndex) }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-300 bg-white">
                      <th className="sticky left-0 top-0 z-30 w-12 border-r border-gray-300 bg-white px-3 py-1 text-center text-sm font-bold text-gray-900">
                        #
                      </th>
                      {columns.map((col, colIndex) => (
                        <th
                          key={col}
                          onClick={() => handleCellFocus(selectedCell.row, colIndex)}
                          className={`sticky top-0 z-20 select-none border-r border-gray-300 px-3 py-1 text-center text-sm font-medium text-gray-900 ${
                            selectedCell.col === colIndex ? 'bg-gray-100' : 'bg-white'
                          }`}
                          style={{ width: getColumnWidth(colIndex) }}
                        >
                          <span>{col}</span>
                          <span
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none hover:bg-green-500/70"
                            onPointerDown={(event) => handleColumnResizeStart(event, colIndex)}
                            onDoubleClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              autofitColumn(colIndex)
                            }}
                            title="Drag to resize column. Double-click to autofit."
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderedRows.map((row, rowIndex) => {
                      const rowHeight = getRowHeight(row)

                      return (
                      <tr key={rowIndex} className="border-b border-gray-200" style={{ height: rowHeight }}>
                        <td className="sticky left-0 z-10 border-r border-gray-300 bg-white px-3 py-1 text-center text-sm font-medium text-gray-900">
                          {rowIndex + 1}
                        </td>
                        {columns.map((_, colIndex) => {
                          const isSelected = selectedCell.row === rowIndex && selectedCell.col === colIndex
                          const cellFormat = activeSheetName
                            ? cellFormats[activeSheetName]?.[getCellKey(rowIndex, colIndex)]
                            : undefined

                          return (
                            <td
                              key={`${rowIndex}-${colIndex}`}
                              className="border-r border-gray-300 p-0 text-sm"
                              style={{ width: getColumnWidth(colIndex) }}
                            >
                              {isSelected ? (
                                <textarea
                                  autoFocus
                                  value={getCellText(row[colIndex] ?? '')}
                                  onFocus={() => handleCellFocus(rowIndex, colIndex)}
                                  onChange={(e) => {
                                    setFormulaValue(e.target.value)
                                    updateCellValue(rowIndex, colIndex, e.target.value)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.stopPropagation()
                                    }
                                  }}
                                  rows={Math.max(1, getCellText(row[colIndex] ?? '').split(/\r?\n/).length)}
                                  className="w-full resize-none whitespace-pre-wrap border-0 bg-yellow-50 px-2 py-2 text-sm leading-5 ring-2 ring-inset ring-green-500 focus:outline-none"
                                  style={{
                                    width: `${getColumnWidth(colIndex)}px`,
                                    minWidth: `${getColumnWidth(colIndex)}px`,
                                    minHeight: `${rowHeight}px`,
                                    height: `${rowHeight}px`,
                                    overflow: 'hidden',
                                    color: cellFormat?.color || '#111827',
                                    fontFamily: cellFormat?.fontFamily || 'Calibri',
                                    fontSize: `${cellFormat?.fontSize || 14}px`,
                                    fontWeight: cellFormat?.bold ? 700 : 400,
                                    fontStyle: cellFormat?.italic ? 'italic' : 'normal',
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCellFocus(rowIndex, colIndex)}
                                  className="block w-full overflow-hidden whitespace-pre-wrap border-0 px-2 py-2 text-left text-sm leading-5 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"
                                  style={{
                                    width: `${getColumnWidth(colIndex)}px`,
                                    minWidth: `${getColumnWidth(colIndex)}px`,
                                    minHeight: `${rowHeight}px`,
                                    color: cellFormat?.color || '#111827',
                                    backgroundColor: cellFormat?.backgroundColor || '#ffffff',
                                    fontFamily: cellFormat?.fontFamily || 'Calibri',
                                    fontSize: `${cellFormat?.fontSize || 14}px`,
                                    fontWeight: cellFormat?.bold ? 700 : 400,
                                    fontStyle: cellFormat?.italic ? 'italic' : 'normal',
                                  }}
                                >
                                  {getDisplayCellValue(row[colIndex] ?? '', rowIndex, colIndex)}
                                </button>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
                {shapes.map((shape) => {
                  const isSelected = selectedShapeId === shape.id

                  return (
                    <div
                      key={shape.id}
                      className={`excel-shape-object word-tool-object word-shape-object ${
                        isSelected ? 'is-selected' : ''
                      }`}
                      style={{
                        left: `${shape.x}px`,
                        top: `${shape.y}px`,
                        width: `${shape.width}px`,
                        height: `${shape.height}px`,
                        transform: `rotate(${shape.rotation}deg)`,
                        ['--word-shape-control-color' as string]: shape.stroke,
                      }}
                      onPointerDown={(event) => {
                        if (activeTool === 'erase') {
                          event.preventDefault()
                          event.stopPropagation()
                          deleteExcelShape(shape.id)
                          return
                        }
                        beginMoveExcelShape(event, shape)
                      }}
                    >
                      {shape.kind === 'text-box' ? (
                        <div
                          className="flex h-full w-full items-center justify-center border border-dashed bg-white/90 px-2 text-sm text-gray-800"
                          style={{
                            borderColor: shape.stroke,
                            color: shape.stroke,
                            fontFamily: textFontFamily,
                            fontSize: `${textFontSize}px`,
                          }}
                        >
                          {shape.text}
                        </div>
                      ) : (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: getShapeSvg(shape.kind, {
                              width: shape.width,
                              height: shape.height,
                              stroke: shape.stroke,
                              fill: shape.fill,
                            }),
                          }}
                        />
                      )}
                      <span
                        className="word-rotate-handle"
                        onPointerDown={(event) => beginRotateExcelShape(event, shape)}
                      />
                      <span
                        className="word-resize-handle"
                        onPointerDown={(event) => beginResizeExcelShape(event, shape)}
                      />
                    </div>
                  )
                })}
                {(visibleRowCount < activeData.length || visibleColCount < columnCount) && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-3 py-3 text-xs text-gray-600">
                    <span>
                      Showing {Math.min(visibleRowCount, activeData.length)} / {activeData.length} rows and {Math.min(visibleColCount, columnCount)} / {columnCount} columns.
                    </span>
                    {visibleRowCount < activeData.length && (
                      <button
                        type="button"
                        onClick={() => setVisibleRowCount((count) => Math.min(activeData.length, count + ROW_RENDER_INCREMENT))}
                        className="rounded border border-green-600 px-3 py-1 font-semibold text-green-700 hover:bg-green-50"
                      >
                        Show More Rows
                      </button>
                    )}
                    {visibleColCount < columnCount && (
                      <button
                        type="button"
                        onClick={() => setVisibleColCount((count) => Math.min(columnCount, count + COL_RENDER_INCREMENT))}
                        className="rounded border border-green-600 px-3 py-1 font-semibold text-green-700 hover:bg-green-50"
                      >
                        Show More Columns
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PageRail
        title="Document Pages"
        items={sheetItems}
        activeId={String(selectedSheet + 1)}
        accentColor={themeColor}
        side="right"
        onAddStep={handleAddSheet}
        onReorder={handleReorderSheets}
      />
    </div>
  )
}
