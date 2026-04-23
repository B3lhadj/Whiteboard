import * as pdfjsLib from 'pdfjs-dist'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
} from 'docx'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export interface PDFTextContent {
  page: number
  text: string
  fontSize: number
  isBold: boolean
  isItalic: boolean
  alignment: 'left' | 'center' | 'right'
  isHeading: boolean
  headingLevel: number
  isList: boolean
  isListItem: boolean
}

/**
 * Extract structured content from a PDF file
 */
export async function extractPDFContent(
  pdfBuffer: ArrayBuffer
): Promise<PDFTextContent[]> {
  try {
    const pdf = await pdfjsLib.getDocument(pdfBuffer).promise
    const content: PDFTextContent[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        const viewport = page.getViewport({ scale: 1.0 })

        // Group items by Y position (same line)
        const lines: any[] = []
        let currentLine: any = null
        let lastY = -1

        for (const item of textContent.items) {
          const textItem = item as any
          if (!textItem.str || textItem.str.trim() === '') continue

          const y = Math.round(textItem.y)

          // Check if this item is on a new line
          if (Math.abs(y - lastY) > 5 || !currentLine) {
            if (currentLine && currentLine.items.length > 0) {
              lines.push(currentLine)
            }
            currentLine = {
              y,
              x: textItem.x,
              items: [textItem],
              width: viewport.width,
            }
            lastY = y
          } else {
            currentLine.items.push(textItem)
          }
        }

        if (currentLine && currentLine.items.length > 0) {
          lines.push(currentLine)
        }

        // Process each line
        for (const line of lines) {
          const lineText = line.items
            .map((item: any) => item.str)
            .join('')
            .trim()

          if (!lineText) continue

          // Extract formatting info from first item
          const firstItem = line.items[0] as any
          const fontSize = firstItem.height || 12
          const fontName = firstItem.fontName || ''

          // Detect text properties
          const isBold = fontName.toLowerCase().includes('bold')
          const isItalic = fontName.toLowerCase().includes('italic')

          // Detect heading based on size and content
          let isHeading = false
          let headingLevel = 0
          if (fontSize > 20) {
            isHeading = true
            headingLevel = 1
          } else if (fontSize > 16) {
            isHeading = true
            headingLevel = 2
          } else if (fontSize > 14) {
            isHeading = true
            headingLevel = 3
          }

          // Detect list items
          const isList = _isListMarker(lineText)
          const isListItem = isList || _isNumberedList(lineText)

          // Detect alignment
          const lineX = line.x
          const lineWidth = line.items.reduce((sum: number, item: any) => sum + (item.width || 0), 0)
          const rightEdge = lineX + lineWidth
          const alignment = _detectAlignment(lineX, rightEdge, line.width)

          content.push({
            page: pageNum,
            text: lineText,
            fontSize,
            isBold,
            isItalic,
            alignment,
            isHeading,
            headingLevel,
            isList,
            isListItem,
          })
        }
      } catch (pageError) {
        console.warn(`Could not extract text from page ${pageNum}:`, pageError)
      }
    }

    return content
  } catch (error) {
    console.error('Error extracting PDF content:', error)
    throw new Error('Failed to extract content from PDF')
  }
}

/**
 * Check if text starts with a list marker
 */
function _isListMarker(text: string): boolean {
  const markers = ['•', '○', '◦', '■', '□', '▪', '-', '+', '*']
  const trimmed = text.trim()
  return markers.some((m) => trimmed.startsWith(m))
}

/**
 * Check if text is a numbered list item
 */
function _isNumberedList(text: string): boolean {
  const trimmed = text.trim()
  return /^[\d]+[\.\)]\s/.test(trimmed) || /^[\da-z][\.\)]\s/.test(trimmed)
}

/**
 * Detect text alignment based on position
 */
function _detectAlignment(
  x: number,
  rightEdge: number,
  pageWidth: number
): 'left' | 'center' | 'right' {
  const leftRatio = x / pageWidth
  const rightRatio = (pageWidth - rightEdge) / pageWidth

  if (leftRatio < 0.1 && rightRatio < 0.1) {
    return 'center'
  }
  if (rightRatio < 0.15) {
    return 'right'
  }
  return 'left'
}

/**
 * Convert extracted PDF content to DOCX format
 */
export async function convertExtractedContentToDocx(
  content: PDFTextContent[],
  filename: string
): Promise<Blob> {
  try {
    const sections: Paragraph[] = []
    let lastPageNumber = 0

    console.log(`Building DOCX from PDF: ${filename}`)

    for (const item of content) {
      // Add page break for new pages
      if (item.page !== lastPageNumber && lastPageNumber > 0) {
        sections.push(new Paragraph({ pageBreakBefore: true, text: '' }))
      }
      lastPageNumber = item.page

      if (item.isListItem) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text.replace(/^[\s•○◦■□▪\-\+\*\d\.\)]+\s*/, ''),
                bold: item.isBold,
                italics: item.isItalic,
                size: Math.max(Math.round(item.fontSize * 2), 20),
              }),
            ],
            bullet: { level: 0 },
            alignment: _alignmentTypeMap(item.alignment),
          })
        )
      } else if (item.isHeading) {
        const headingLevel = (_headingLevelMap as any)[
          Math.min(item.headingLevel, 3)
        ] || HeadingLevel.HEADING_3
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                bold: true,
                size: Math.max(Math.round(item.fontSize * 2), 24),
              }),
            ],
            heading: headingLevel,
            alignment: _alignmentTypeMap(item.alignment),
          })
        )
      } else {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                bold: item.isBold,
                italics: item.isItalic,
                size: Math.max(Math.round(item.fontSize * 2), 20),
              }),
            ],
            alignment: _alignmentTypeMap(item.alignment),
          })
        )
      }
    }

    // Create document
    const doc = new Document({
      sections: [
        {
          children: sections.length > 0 ? sections : [new Paragraph('Converted from PDF')],
        },
      ],
    })

    // Generate DOCX blob
    const blob = await Packer.toBlob(doc)
    return blob
  } catch (error) {
    console.error('Error converting content to DOCX:', error)
    throw new Error('Failed to generate Word document')
  }
}

/**
 * Map alignment to docx AlignmentType
 */
function _alignmentTypeMap(alignment: 'left' | 'center' | 'right') {
  const alignmentMap = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
  }
  return alignmentMap[alignment]
}

/**
 * Map heading level to docx HeadingLevel
 */
const _headingLevelMap = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
}

/**
 * Main conversion function: PDF buffer to DOCX blob
 */
export async function convertPdfToDocx(
  pdfBuffer: ArrayBuffer,
  filename: string
): Promise<Blob> {
  try {
    console.log('Starting frontend PDF to DOCX conversion...')
    
    // Extract content from PDF
    const content = await extractPDFContent(pdfBuffer)
    const pageCount = content.length > 0 ? Math.max(...content.map((c) => c.page)) : 0
    console.log(`Extracted ${content.length} content items from ${pageCount} pages`)

    // Convert to DOCX
    const docxBlob = await convertExtractedContentToDocx(content, filename)
    console.log(`Generated DOCX document: ${(docxBlob.size / 1024).toFixed(2)}KB`)

    return docxBlob
  } catch (error) {
    console.error('Frontend PDF conversion failed:', error)
    throw error
  }
}

/**
 * Check if PDF conversion was successful
 * (heuristic: if we extracted reasonable content)
 */
export async function isPdfConversionSuccessful(
  pdfBuffer: ArrayBuffer
): Promise<boolean> {
  try {
    const content = await extractPDFContent(pdfBuffer)
    // Consider successful if we extracted at least some content
    return content.length > 0
  } catch {
    return false
  }
}
