import {
  useEffect,
  useState,
  useRef,
  type CSSProperties,
  type FormEvent,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { calculateWordCount, calculateCharCount, getEditorLanguageSettings, getPageDimensions } from '../../utils'
import { AlertCircle, AlignLeft, AlignCenter, AlignRight, LayoutTemplate } from 'lucide-react'
import * as mammoth from 'mammoth'
import { renderAsync } from 'docx-preview'
import PageRail, { type PageRailItem } from '../PageRail'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils'
import { getShapeSize, getShapeSvg, type ShapeKind } from '../../shapes'
import type { PageMargins } from '../../pageLayout'
import { getEditorName } from '../../services/editAudit'

interface WordPagePreview {
  id: string
  label: string
  subtitle: string
  html: string
  scrollTop: number
  selector?: string
}

interface WordEditorProps {
  file: DocumentFile
}

interface HFConfig {
  enabled: boolean
  text: string
  align: 'left' | 'center' | 'right'
  fontSize: number
  color: string
}

const DEFAULT_HF: HFConfig = { enabled: false, text: '', align: 'center', fontSize: 10, color: '#777777' }

interface HighlightedWord {
  id: string
  text: string
  by: string
  action: string
  at: string
  element: HTMLElement
}

const filterDocumentHeadings = (root: HTMLElement): HTMLElement[] => {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      'h1, h2, h3, h4, h5, h6, .heading, .title, [class*="heading"], [class*="title"], [style*="font-size: 2"], [style*="font-size: 18px"], [style*="font-size: 20px"], [style*="font-size: 22px"], [style*="font-size: 24px"], [style*="font-size: 26px"]'
    )
  )

  const blocks = Array.from(root.querySelectorAll<HTMLElement>('p, div, section'))
  blocks.forEach((el) => {
    if (candidates.includes(el)) return
    const text = (el.textContent || '').trim()
    const isNumberedHeading = /^(?:[0-9]+\.|\b[IVXLCDM]+\.|\bChapitre\b|\bSection\b|\bPartie\b|\bModule\b)/i.test(text)
    if (isNumberedHeading && text.length >= 4 && text.length <= 140) {
      candidates.push(el)
    }
  })

  return candidates.filter((el) => {
    if (el.closest('.document-sommaire, [data-sommaire-block="true"], .word-hf-injected, .word-header, .word-footer, [data-radio-group]')) {
      return false
    }

    const text = (el.textContent || '').trim()
    if (!text || text.length < 3) return false
    if (text.endsWith(':') || text.endsWith(': ')) return false

    const tagName = el.tagName.toUpperCase()
    const isHeadingTag = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)
    const className = typeof el.className === 'string' ? el.className.toLowerCase() : ''
    const hasHeadingClass = className.includes('heading') || className.includes('title')

    if (isHeadingTag || hasHeadingClass) {
      return true
    }

    const fontSizeStyle = el.style?.fontSize || ''
    const fontSizeNum = parseFloat(fontSizeStyle) || 0
    const isLargeFont = fontSizeStyle.includes('2') || fontSizeStyle.includes('18') || fontSizeStyle.includes('20') || fontSizeNum >= 16
    const isNumberedHeading = /^(?:[0-9]+\.|\b[IVXLCDM]+\.|\bChapitre\b|\bSection\b|\bPartie\b|\bModule\b)/i.test(text)

    return isLargeFont || isNumberedHeading
  })
}

const formatPageNumber = (
  pageIdx: number,
  total: number,
  config: import('../../store').PageNumberConfig
) => {
  if (config.hideFirstPage && pageIdx === 1) return ''
  const num = pageIdx + (config.startNumber - 1)

  switch (config.format) {
    case 'page_x':
      return `Page ${num}`
    case 'page_x_of_y':
      return `Page ${num} / ${total}`
    case 'dash':
      return `- ${num} -`
    case 'roman': {
      const romanNums = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
      return romanNums[num - 1] || `${num}`
    }
    case 'alpha':
      return String.fromCharCode(65 + ((num - 1) % 26))
    case 'number':
    default:
      return `${num}`
  }
}

const getPageNumberPositionStyle = (
  position: import('../../store').PageNumberPosition,
  margins?: { top: number; bottom: number; left: number; right: number }
): CSSProperties => {
  const topOffset = margins ? `${Math.max(12, Math.floor(margins.top / 2))}px` : '18px'
  const bottomOffset = margins ? `${Math.max(12, Math.floor(margins.bottom / 2))}px` : '18px'
  const leftOffset = margins ? `${Math.max(20, margins.left)}px` : '32px'
  const rightOffset = margins ? `${Math.max(20, margins.right)}px` : '32px'

  switch (position) {
    case 'top-left':
      return { top: topOffset, left: leftOffset }
    case 'top-center':
      return { top: topOffset, left: '50%', transform: 'translateX(-50%)' }
    case 'top-right':
      return { top: topOffset, right: rightOffset }
    case 'bottom-left':
      return { bottom: bottomOffset, left: leftOffset }
    case 'bottom-right':
      return { bottom: bottomOffset, right: rightOffset }
    case 'bottom-center':
    default:
      return { bottom: bottomOffset, left: '50%', transform: 'translateX(-50%)' }
  }
}

export default function WordEditor({ file }: WordEditorProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fallbackHtml, setFallbackHtml] = useState<string | null>(null)
  const [pagePreviews, setPagePreviews] = useState<WordPagePreview[]>([])
  const [showHFPanel, setShowHFPanel] = useState(false)
  const [header, setHeader] = useState<HFConfig>(DEFAULT_HF)
  const [footer, setFooter] = useState<HFConfig>(DEFAULT_HF)
  const [highlightedWords, setHighlightedWords] = useState<HighlightedWord[]>([])
  const [showHighlightPanel, setShowHighlightPanel] = useState(false)
  const [activeHFZone, setActiveHFZone] = useState<'header' | 'footer'>('header')
  const [hasEdited, setHasEdited] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const pageOffsetsRef = useRef<number[]>([])
  const pendingImagePointRef = useRef<{ x: number; y: number } | null>(null)
  const selectedToolObjectRef = useRef<HTMLElement | null>(null)
  const [editorViewportWidth, setEditorViewportWidth] = useState(0)
  const zoom = useDocumentStore((state) => state.zoom)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const textColor = useDocumentStore((state) => state.textColor)
  const shapeFillColor = useDocumentStore((state) => state.shapeFillColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
  const selectedShape = useDocumentStore((state) => state.selectedShape)
  const selectedLanguage = useDocumentStore((state) => state.selectedLanguage)
  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const setEditorHtml = useDocumentStore((state) => state.setEditorHtml)
  const addPage = useDocumentStore((state) => state.addPage)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const pageNumberConfig = useDocumentStore((state) => state.pageNumberConfig)
  const actualFileType = file.originalType || file.type
  const themeColor = getThemeForFileType(actualFileType)
  const pageMargins = useDocumentStore((state) => state.pageMargins)
  const setPageMargins = useDocumentStore((state) => state.setPageMargins)
  const pageSize = useDocumentStore((state) => state.pageSize)
  const pageColumns = useDocumentStore((state) => state.pageColumns)
  const pageDimensions = getPageDimensions(file.type, pageOrientation, pageSize)
  const pageColumnGap = pageColumns > 1 ? 32 : 0
  const languageSettings = getEditorLanguageSettings(selectedLanguage)
  const autoFitScale = editorViewportWidth
    ? Math.min(1.55, Math.max(0.72, (editorViewportWidth - 96) / (pageDimensions.width + 42)))
    : 1.12
  const editorScale = autoFitScale * (zoom / 100)

  /**
   * Replace Unicode ligature characters and special typographic glyphs
   * with their plain-text equivalents so text is always readable,
   * even when the original font isn't available in the browser.
   */
  const fixLigatures = (container: HTMLElement) => {
    const ligatureMap: Record<string, string> = {
      '\uFB00': 'ff',   // ff ligature
      '\uFB01': 'fi',   // fi ligature
      '\uFB02': 'fl',   // fl ligature
      '\uFB03': 'ffi',  // ffi ligature
      '\uFB04': 'ffl',  // ffl ligature
      '\uFB05': 'st',   // long-s t ligature
      '\uFB06': 'st',   // st ligature
      '\u0132': 'IJ',   // IJ ligature
      '\u0133': 'ij',   // ij ligature
      '\u0152': 'OE',   // OE ligature
      '\u0153': 'oe',   // oe ligature
      '\u00C6': 'AE',   // AE ligature
      '\u00E6': 'ae',   // ae ligature
      '\u2013': '–',    // en dash
      '\u2014': '—',    // em dash
      '\u2018': "'",    // left single quote
      '\u2019': "'",    // right single quote
      '\u201C': '"',    // left double quote
      '\u201D': '"',    // right double quote
      '\u2026': '...',  // ellipsis
      '\u00A0': ' ',    // non-breaking space → regular space (for rendering)
    }

    // Build a regex matching all ligature characters
    const pattern = new RegExp(
      Object.keys(ligatureMap).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'g'
    )

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
    const textNodes: Text[] = []
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      textNodes.push(node)
    }

    let replaced = 0
    for (const textNode of textNodes) {
      const original = textNode.nodeValue
      if (!original) continue
      const fixed = original.replace(pattern, (match) => ligatureMap[match] || match)
      if (fixed !== original) {
        textNode.nodeValue = fixed
        replaced++
      }
    }

    if (replaced > 0) {
      console.log(`Fixed ligatures in ${replaced} text nodes`)
    }
  }

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setIsLoading(true)
        setError(null)
        setFallbackHtml(null)

        const container = editorRef.current
        if (!container) {
          throw new Error('Editor container not ready')
        }

        container.innerHTML = ''

        // High-fidelity DOCX rendering.
        await renderAsync(file.content.slice(0), container, undefined, {
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          useBase64URL: true,
        })

        // Fix ligature characters that browsers can't render without the original font
        fixLigatures(container)

        // Always start from top to avoid landing mid-document on reload.
        container.scrollTop = 0

        // Any non-render processing issue should not force a low-fidelity fallback.
        try {
          const pageNodes = collectPageNodes(container)
          const { previews, offsets } = buildPageModel(container, pageNodes)
          pageOffsetsRef.current = offsets
          setPagePreviews(previews)
        } catch (previewErr) {
          console.warn('Could not build Word page previews:', previewErr)
          pageOffsetsRef.current = [0]
          setPagePreviews([
            {
              id: '1',
              label: 'Page 1',
              subtitle: 'Document preview',
              html: container.innerHTML || '<div></div>',
              scrollTop: 0,
            },
          ])
        }

        setEditorHtml(container.innerHTML)
        const text = container.innerText || ''
        setWordCount(calculateWordCount(text))
        setCharCount(calculateCharCount(text))
        setCurrentPage(1)
      } catch (err: any) {
        console.error('Error loading DOCX with docx-preview:', err)

        // Fallback to mammoth only if docx-preview itself fails.
        try {
          const result = await mammoth.convertToHtml({ arrayBuffer: file.content })
          setPagePreviews([
            {
              id: '1',
              label: 'Page 1',
              subtitle: 'Converted document',
              html: `<div class="word-fallback-preview">${result.value}</div>`,
              scrollTop: 0,
            },
          ])
          pageOffsetsRef.current = [0]
          setFallbackHtml(result.value)
          setEditorHtml(result.value)
          updateCounts(result.value)
          setCurrentPage(1)
        } catch (fallbackErr) {
          console.error('Mammoth fallback failed:', fallbackErr)
          setError(err?.message || 'Failed to load Word document')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadDocument()
  }, [file.content, setCharCount, setCurrentPage, setEditorHtml, setWordCount])

  useEffect(() => {
    const container = editorRef.current
    if (!container) return

    container.setAttribute('lang', languageSettings.lang)
    container.setAttribute('dir', languageSettings.dir)
    container.spellcheck = true
    container.style.direction = languageSettings.dir
  }, [languageSettings.dir, languageSettings.lang])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateWidth = () => {
      setEditorViewportWidth(Math.max(320, viewport.clientWidth))
    }

    updateWidth()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateWidth) : null
    observer?.observe(viewport)
    window.addEventListener('resize', updateWidth)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [])

  const updateCounts = (html: string) => {
    const text = html.replace(/<[^>]*>/g, '')
    setWordCount(calculateWordCount(text))
    setCharCount(calculateCharCount(text))
  }

  const splitPagesByPageBreaks = (pageElement: HTMLElement): HTMLElement[] => {
    console.log('=== ATTEMPTING TO SPLIT PAGE BY BREAKS ===')
    console.log('Input element:', {
      tag: pageElement.tagName,
      class: pageElement.className,
      height: pageElement.clientHeight,
      children: pageElement.children.length,
    })

    // Look for various page break markers that docx-preview might insert
    const pageBreakSelectors = [
      '[style*="page-break-after"]',
      '[style*="break-after:page"]',
      '[class*="page-break"]',
      'hr[class*="page"]',
      'div[data-page-break]',
      '.page-break-marker',
      '[style*="border-bottom"]', // Sometimes page breaks are represented as borders
    ]

    let pageBreakElements: Element[] = []
    for (const selector of pageBreakSelectors) {
      try {
        pageBreakElements = Array.from(pageElement.querySelectorAll(selector))
        if (pageBreakElements.length > 0) {
          console.log(`Found ${pageBreakElements.length} page breaks using selector: ${selector}`)
          break
        }
      } catch (e) {
        console.warn(`Selector failed: ${selector}`)
      }
    }

    if (pageBreakElements.length === 0) {
      console.log('No explicit page break elements found')
      // Don't split, return original
      return [pageElement]
    }

    console.log(`Splitting at ${pageBreakElements.length} break points...`)

    // Split the content at page breaks
    const pages: HTMLElement[] = []
    let currentPageContent: Element[] = []

    for (const child of Array.from(pageElement.children)) {
      if (pageBreakElements.includes(child)) {
        // Found a page break, save current page content
        if (currentPageContent.length > 0) {
          const newPageElement = pageElement.cloneNode(false) as HTMLElement
          for (const item of currentPageContent) {
            newPageElement.appendChild(item.cloneNode(true))
          }
          pages.push(newPageElement)
          currentPageContent = []
          console.log(`  Created page ${pages.length} with ${currentPageContent.length} items`)
        }
      } else {
        // Add child to current page
        currentPageContent.push(child)
      }
    }

    // Don't forget the last page
    if (currentPageContent.length > 0) {
      const newPageElement = pageElement.cloneNode(false) as HTMLElement
      for (const item of currentPageContent) {
        newPageElement.appendChild(item.cloneNode(true))
      }
      pages.push(newPageElement)
      console.log(`  Created final page ${pages.length}`)
    }

    console.log(`Split complete: ${pages.length} pages created`)
    return pages.length > 1 ? pages : [pageElement]
  }

  const collectPageNodes = (container: HTMLDivElement) => {
    console.log('=== COLLECT PAGE NODES ===')
    console.log('Container dimensions:', {
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
      offsetHeight: container.offsetHeight,
    })

    // Try multiple selectors in priority order
    const pageSelectors = [
      '.docx-wrapper > section.docx',
      '.docx-wrapper > section',
      '.docx-wrapper section.docx',
      '.docx-wrapper section',
      'section.docx',
      '[class*="docx-wrapper"] > section',
      '[class*="page"]',
      'section',
    ]

    for (const selector of pageSelectors) {
      const candidates = Array.from(container.querySelectorAll(selector)) as HTMLElement[]

      if (candidates.length > 0) {
        console.log(`✓ Found ${candidates.length} page(s) using selector: "${selector}"`)

        // If only 1 page but it's very tall, try to split it
        if (candidates.length === 1 && candidates[0].clientHeight > 1200) {
          console.log('Single large page detected (height > 1200px), attempting to split...')

          // First try splitting by page break markers
          const splitPages = splitPagesByPageBreaks(candidates[0])

          if (splitPages.length <= 1) {
            console.log('Page break splitting failed or found no breaks; using virtual page slices.')
          }

          if (splitPages.length > 1) {
            console.log(`✓ Successfully split into ${splitPages.length} pages`)
            splitPages.forEach((page, i) => {
              console.log(`  Split page ${i + 1}: height=${page.clientHeight}`)
            })
            return splitPages
          }
        }

        candidates.forEach((el, i) => {
          console.log(`  Page ${i + 1}: height=${el.clientHeight}, offsetTop=${el.offsetTop}, class="${el.className}", tag="${el.tagName}"`)
        })
        return candidates
      }
    }

    // Check for elements with page-break-after style (CSS-based pagination)
    const elementsWithPageBreak = Array.from(
      container.querySelectorAll('[style*="page-break"], [style*="break-after"]')
    ) as HTMLElement[]
    if (elementsWithPageBreak.length > 0) {
      console.log(`✓ Found ${elementsWithPageBreak.length} elements with page-break styles`)
    }

    // Fallback: Check direct children of container
    const directChildren = Array.from(container.children).filter((child) => {
      const element = child as HTMLElement
      const text = element.textContent?.trim() || ''
      const isVisible = element.offsetHeight > 0
      return text.length > 0 && isVisible
    }) as HTMLElement[]

    if (directChildren.length > 0) {
      console.log(`✓ Found ${directChildren.length} direct children as pages`)
      directChildren.forEach((el, i) => {
        console.log(`  Child ${i + 1}: height=${el.clientHeight}, tag=${el.tagName}, class="${el.className}"`)
      })
      return directChildren
    }

    // Final fallback: Look for any substantial content blocks
    const allElements = Array.from(container.querySelectorAll('div, section, article'))
      .map((node) => node as HTMLElement)
      .filter((element) => {
        const height = element.clientHeight
        const text = (element.textContent || '').trim().length
        const isDirectChild = element.parentElement === container
        // Look for blocks that are substantial and direct children
        return isDirectChild && height > 400 && text > 180
      })

    if (allElements.length > 0) {
      console.log(`✓ Found ${allElements.length} substantial content blocks`)
      allElements.forEach((el, i) => {
        console.log(`  Block ${i + 1}: height=${el.clientHeight}, offsetTop=${el.offsetTop}`)
      })
      return allElements
    }

    // Last resort: treat entire container as single page but check if it's really long
    console.log(
      `⚠ No page nodes found. Container: height=${container.clientHeight}, scrollHeight=${container.scrollHeight}, children=${container.children.length}`
    )

    // Log all direct children for inspection
    Array.from(container.children).forEach((child, i) => {
      const el = child as HTMLElement
      console.log(
        `  Direct child ${i}: tag=${el.tagName}, class="${el.className}", height=${el.clientHeight}, text="${el.textContent?.slice(0, 50)}"`
      )
    })

    return []
  }

  const buildPageModel = (container: HTMLDivElement, pages: HTMLElement[]) => {
    const toSubtitle = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 110)
    const buildVirtualPageHtml = (pageNode: HTMLElement, offset: number, pageHeight: number, index: number) => {
      const pageWidth = Math.max(pageNode.scrollWidth, pageNode.offsetWidth, 794)

      return `
        <div
          class="word-virtual-page"
          data-word-page-index="${index}"
          style="height:${pageHeight}px;width:${pageWidth}px;max-width:100%;overflow:hidden;position:relative;margin:0 auto 16px;background:#ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.16);border-radius:6px;"
        >
          <div style="width:${pageWidth}px;transform:translateY(-${offset}px);transform-origin:top left;">
            ${pageNode.outerHTML}
          </div>
        </div>
      `
    }

    if (pages.length === 0) {
      console.warn('No pages detected, using single page fallback')
      return {
        offsets: [0],
        previews: [
          {
            id: '1',
            label: 'Page 1',
            subtitle: 'Document preview',
            html: container.innerHTML || '<div></div>',
            scrollTop: 0,
          },
        ],
      }
    }

    // Normal case: real page wrappers detected (could be original or split)
    if (pages.length > 1) {
      console.log(`Building pagination for ${pages.length} page(s)`)

      // For split pages (clones), offsetTop will be 0, so calculate based on accumulated heights
      const offsets: number[] = []
      let accumulatedHeight = 0
      pages.forEach((pageNode) => {
        const offsetTop = pageNode.offsetTop === 0 || pageNode.offsetTop === undefined
          ? accumulatedHeight
          : pageNode.offsetTop
        offsets.push(offsetTop)
        accumulatedHeight += pageNode.clientHeight + 16 // 16px is the margin-bottom
      })

      console.log('Calculated page offsets:', offsets)

      const previews = pages.map((pageNode, index) => {
        pageNode.dataset.wordPageIndex = String(index)
        const subtitle = toSubtitle(pageNode.textContent || '')
        return {
          id: String(index + 1),
          label: `Page ${index + 1}`,
          subtitle: subtitle || `Page ${index + 1}`,
          html: pageNode.outerHTML,
          scrollTop: offsets[index],
          selector: `[data-word-page-index="${index}"]`,
        }
      })

      return { offsets, previews }
    }

    // Single page detected - but check if it's actually a long document that should be split
    const firstPage = pages[0]
    const actualHeight = firstPage.clientHeight || container.scrollHeight || container.clientHeight
    const containerScrollHeight = container.scrollHeight
    const totalHeight = Math.max(actualHeight, containerScrollHeight, 0)

    console.log(`Single page detected:`)
    console.log(`  - firstPage.clientHeight: ${firstPage.clientHeight}`)
    console.log(`  - container.scrollHeight: ${containerScrollHeight}`)
    console.log(`  - container.clientHeight: ${container.clientHeight}`)
    console.log(`  - totalHeight (calculated): ${totalHeight}`)

    // Standard A4 page in pixels at normal zoom
    const standardPageHeight = 1120

    // If the document is suspiciously long or the container isn't showing proper height, do smarter detection
    if (totalHeight > standardPageHeight * 1.5 || containerScrollHeight > standardPageHeight * 1.5) {
      // This looks like it should be multiple pages
      const estimatedPageCount = Math.ceil(totalHeight / standardPageHeight)
      console.log(`⚠ Document appears to be ${estimatedPageCount} pages but only 1 wrapper found. Creating virtual pages.`)

      const offsets = Array.from({ length: estimatedPageCount }, (_, i) => i * standardPageHeight)
      const previewSubtitle = toSubtitle(firstPage.textContent || container.textContent || '')

      const previews = offsets.map((offset, index) => ({
        id: String(index + 1),
        label: `Page ${index + 1}`,
        subtitle: previewSubtitle || `Page ${index + 1}`,
        html: buildVirtualPageHtml(firstPage, offset, standardPageHeight, index),
        scrollTop: offset,
        selector: `[data-word-page-index="${index}"]`,
      }))

      console.log(`Created ${estimatedPageCount} virtual pages with offsets:`, offsets)
      return { offsets, previews }
    }

    // Document appears to be single page
    console.log(`Document appears to be single page (height ${totalHeight}px is under ${standardPageHeight * 1.5}px threshold)`)
    firstPage.dataset.wordPageIndex = '0'
    return {
      offsets: [0],
      previews: [
        {
          id: '1',
          label: 'Page 1',
          subtitle: toSubtitle(firstPage.textContent || container.textContent || ''),
          html: firstPage.outerHTML,
          scrollTop: 0,
          selector: '[data-word-page-index="0"]',
        },
      ],
    }
  }

  useEffect(() => {
    const root = contentScrollRef.current

    if (!root || pageOffsetsRef.current.length === 0) return

    const onScroll = () => {
      const editorRoot = editorRef.current
      const viewportRect = root.getBoundingClientRect()
      let pageNumber = 1

      if (editorRoot) {
        let closestDistance = Number.POSITIVE_INFINITY
        pagePreviews.forEach((page, index) => {
          const target = page.selector
            ? editorRoot.querySelector(page.selector) as HTMLElement | null
            : null
          if (!target) return

          const distance = Math.abs(target.getBoundingClientRect().top - viewportRect.top - 16)
          if (distance < closestDistance) {
            closestDistance = distance
            pageNumber = index + 1
          }
        })
      }

      if (pageNumber === 1 && pagePreviews.every((page) => !page.selector)) {
        const currentScroll = root.scrollTop
        const offsets = pageOffsetsRef.current
        for (let i = 0; i < offsets.length; i++) {
          const next = offsets[i + 1] ?? Number.POSITIVE_INFINITY
          if (currentScroll >= offsets[i] - 12 && currentScroll < next - 12) {
            pageNumber = i + 1
            break
          }
        }
      }

      setCurrentPage(pageNumber)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => root.removeEventListener('scroll', onScroll)
  }, [pagePreviews, setCurrentPage])

  // Listen for Radio Button insertion custom event
  useEffect(() => {
    const handleInsertRadioButton = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: 'single' | 'yesno' | 'multiple' }>).detail
      const type = detail?.type || 'single'
      const container = editorRef.current
      if (!container) return

      const groupId = `radio_grp_${Date.now()}`
      let radioHtml = ''

      if (type === 'single') {
        radioHtml = `
          <div class="radio-button-group my-2 p-2 rounded-lg border border-slate-300/80 bg-slate-50/70 inline-flex flex-col gap-1 text-slate-800 shadow-sm" data-radio-group="${groupId}" contenteditable="false">
            <label class="inline-flex items-center gap-2 text-xs font-medium cursor-pointer select-none hover:text-blue-600 transition-colors">
              <input type="radio" name="${groupId}" class="w-4 h-4 text-blue-600 rounded-full border-slate-300 focus:ring-blue-500 cursor-pointer" checked />
              <span contenteditable="true" class="outline-none px-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-400">Option 1</span>
            </label>
          </div>
        `
      } else if (type === 'yesno') {
        radioHtml = `
          <div class="radio-button-group my-2 p-2.5 rounded-lg border border-slate-300/80 bg-slate-50/70 inline-flex flex-col gap-2 text-slate-800 shadow-sm" data-radio-group="${groupId}" contenteditable="false">
            <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Évaluation / Choix</div>
            <div class="flex items-center gap-4">
              <label class="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none hover:text-emerald-600 transition-colors">
                <input type="radio" name="${groupId}" class="w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer" checked />
                <span contenteditable="true" class="outline-none px-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-emerald-400">Oui</span>
              </label>
              <label class="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none hover:text-rose-600 transition-colors">
                <input type="radio" name="${groupId}" class="w-4 h-4 text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer" />
                <span contenteditable="true" class="outline-none px-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-rose-400">Non</span>
              </label>
            </div>
          </div>
        `
      } else {
        radioHtml = `
          <div class="radio-button-group my-2 p-3 rounded-xl border border-slate-300/80 bg-slate-50/70 flex flex-col gap-2 text-slate-800 shadow-sm min-w-[220px]" data-radio-group="${groupId}" contenteditable="false">
            <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 border-b border-slate-200 pb-1">Veuillez sélectionner une option</div>
            <label class="inline-flex items-center gap-2 text-xs font-medium cursor-pointer select-none hover:text-blue-600 transition-colors">
              <input type="radio" name="${groupId}" class="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer" checked />
              <span contenteditable="true" class="outline-none px-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-400">Option A</span>
            </label>
            <label class="inline-flex items-center gap-2 text-xs font-medium cursor-pointer select-none hover:text-blue-600 transition-colors">
              <input type="radio" name="${groupId}" class="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer" />
              <span contenteditable="true" class="outline-none px-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-400">Option B</span>
            </label>
            <label class="inline-flex items-center gap-2 text-xs font-medium cursor-pointer select-none hover:text-blue-600 transition-colors">
              <input type="radio" name="${groupId}" class="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer" />
              <span contenteditable="true" class="outline-none px-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-400">Option C</span>
            </label>
          </div>
        `
      }

      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0 && container.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0)
        const wrapper = document.createElement('div')
        wrapper.innerHTML = radioHtml.trim()
        const node = wrapper.firstElementChild
        if (node) {
          range.insertNode(node)
          range.collapse(false)
        }
      } else {
        const wrapper = document.createElement('div')
        wrapper.innerHTML = radioHtml.trim()
        if (wrapper.firstElementChild) {
          container.appendChild(wrapper.firstElementChild)
        }
      }
      setHasEdited(true)
    }

    window.addEventListener('editor-insert-radio-button', handleInsertRadioButton)
    return () => window.removeEventListener('editor-insert-radio-button', handleInsertRadioButton)
  }, [])

  // Listen for Sommaire insertion custom event
  useEffect(() => {
    const handleInsertSommaire = (e: Event) => {
      const detail = (e as CustomEvent<{ style?: 'dotted' | 'modern' | 'minimal'; position?: 'top' | 'dedicated_page' | 'cursor' }>).detail
      const style = detail?.style || 'dotted'
      const position = detail?.position || 'dedicated_page'
      const container = editorRef.current
      if (!container) return

      interface TocItem {
        title: string
        level: number
        id: string
        page: number
      }

      const tocItems: TocItem[] = []

      if (pagePreviews.length > 0) {
        // Filter out existing dedicated sommaire preview to collect headings from content pages
        const contentPreviews = pagePreviews.filter((p) => p.subtitle !== 'Sommaire')
        contentPreviews.forEach((preview, pageIdx) => {
          const actualPageNum = position === 'dedicated_page' ? pageIdx + 2 : pageIdx + 1
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = preview.html
          const headings = filterDocumentHeadings(tempDiv)
          headings.forEach((el, hIdx) => {
            const text = (el.textContent || '').trim()
            const id = el.id || `toc_heading_p${pageIdx}_${hIdx}`
            const tagName = el.tagName.toUpperCase()
            const className = typeof el.className === 'string' ? el.className.toLowerCase() : ''
            let level = 1
            if (tagName === 'H1' || className.includes('heading1') || className.includes('heading 1')) {
              level = 1
            } else if (tagName === 'H2' || className.includes('heading2') || className.includes('heading 2')) {
              level = 2
            } else if (tagName === 'H3' || className.includes('heading3') || className.includes('heading 3')) {
              level = 3
            } else if (tagName === 'H4' || tagName === 'H5' || tagName === 'H6') {
              level = 3
            } else {
              const fontSz = parseFloat(el.style?.fontSize || '0')
              level = fontSz >= 22 ? 1 : fontSz >= 18 ? 2 : 3
            }

            tocItems.push({
              title: text,
              level,
              id,
              page: actualPageNum,
            })
          })
        })
      } else {
        const headingElements = filterDocumentHeadings(container)
        if (headingElements.length > 0) {
          headingElements.forEach((el, idx) => {
            const text = (el.textContent || '').trim()
            if (!el.id) {
              el.id = `toc_heading_${idx}_${Date.now()}`
            }
            const tagName = el.tagName.toUpperCase()
            const className = typeof el.className === 'string' ? el.className.toLowerCase() : ''
            let level = 1
            if (tagName === 'H1' || className.includes('heading1') || className.includes('heading 1')) {
              level = 1
            } else if (tagName === 'H2' || className.includes('heading2') || className.includes('heading 2')) {
              level = 2
            } else if (tagName === 'H3' || className.includes('heading3') || className.includes('heading 3')) {
              level = 3
            } else if (tagName === 'H4' || tagName === 'H5' || tagName === 'H6') {
              level = 3
            } else {
              const fontSz = parseFloat(el.style?.fontSize || '0')
              level = fontSz >= 22 ? 1 : fontSz >= 18 ? 2 : 3
            }

            const top = (el as HTMLElement).offsetTop || 0
            const estPage = position === 'dedicated_page' ? Math.max(2, Math.floor(top / 1000) + 2) : Math.max(1, Math.floor(top / 1000) + 1)
            tocItems.push({
              title: text,
              level,
              id: el.id,
              page: estPage,
            })
          })
        }
      }

      if (tocItems.length === 0) {
        tocItems.push(
          { title: '1. Introduction et Aperçu Général', level: 1, id: 'intro', page: position === 'dedicated_page' ? 2 : 1 },
          { title: '2. Objectifs et Périmètre du Projet', level: 1, id: 'objectifs', page: position === 'dedicated_page' ? 2 : 1 },
          { title: '   2.1 Fonctionnalités Principales', level: 2, id: 'features', page: position === 'dedicated_page' ? 3 : 2 },
          { title: '   2.2 Spécifications Techniques', level: 2, id: 'specs', page: position === 'dedicated_page' ? 3 : 2 },
          { title: '3. Analyse et Développement', level: 1, id: 'dev', page: position === 'dedicated_page' ? 4 : 3 },
          { title: '4. Conclusion et Perspectives', level: 1, id: 'conclusion', page: position === 'dedicated_page' ? 5 : 4 },
        )
      }

      let sommaireInnerHtml = ''

      if (style === 'dotted') {
        sommaireInnerHtml = `
          <div class="document-sommaire my-6 p-6 rounded-xl border border-slate-300 bg-white shadow-md font-sans text-slate-800 w-full" contenteditable="false" data-sommaire-block="true">
            <div class="flex items-center justify-between border-b-2 border-slate-800 pb-2.5 mb-5">
              <h2 class="text-xl font-bold uppercase tracking-wider text-slate-900 m-0 flex items-center gap-2">
                📖 Table des Matières (Sommaire)
              </h2>
              <span class="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md font-medium border border-slate-200">Pointillé classique</span>
            </div>
            <div class="flex flex-col gap-3 text-sm">
              ${tocItems.map((item) => `
                <div class="flex items-baseline justify-between gap-2 group cursor-pointer hover:text-blue-600 transition-colors" data-toc-target="${item.id}" data-toc-page="${item.page}" onclick="window.dispatchEvent(new CustomEvent('editor-jump-to-page', {detail: {page: ${item.page}, targetId: '${item.id}'}}))">
                  <span class="${item.level === 1 ? 'font-bold text-slate-900 text-sm' : item.level === 2 ? 'pl-5 text-slate-700 font-medium text-xs' : 'pl-9 text-slate-600 italic text-xs'} truncate">
                    ${item.title}
                  </span>
                  <span class="flex-1 border-b border-dotted border-slate-400 mx-2 mb-1 opacity-70"></span>
                  <span class="font-mono text-xs font-semibold text-slate-700 group-hover:text-blue-600 bg-slate-100 group-hover:bg-blue-50 px-2.5 py-0.5 rounded border border-slate-200 shrink-0">
                    Page ${item.page}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        `
      } else if (style === 'modern') {
        sommaireInnerHtml = `
          <div class="document-sommaire my-6 p-6 rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/40 shadow-lg font-sans text-slate-800 w-full" contenteditable="false" data-sommaire-block="true">
            <div class="flex items-center justify-between border-b border-emerald-500/20 pb-3 mb-4">
              <h2 class="text-xl font-extrabold text-emerald-900 m-0 flex items-center gap-2">
                📑 Sommaire du Document
              </h2>
              <span class="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-semibold">Style Moderne</span>
            </div>
            <div class="grid grid-cols-1 gap-2 text-sm">
              ${tocItems.map((item, idx) => `
                <div class="flex items-center justify-between p-2.5 rounded-lg border border-slate-200/80 bg-white hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer group" data-toc-target="${item.id}" data-toc-page="${item.page}" onclick="window.dispatchEvent(new CustomEvent('editor-jump-to-page', {detail: {page: ${item.page}, targetId: '${item.id}'}}))">
                  <div class="flex items-center gap-3 truncate">
                    <span class="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      ${idx + 1}
                    </span>
                    <span class="${item.level === 1 ? 'font-bold text-slate-900' : 'font-medium text-slate-800'} group-hover:text-emerald-700 truncate">
                      ${item.title}
                    </span>
                  </div>
                  <span class="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-md shrink-0">
                    p. ${item.page}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        `
      } else {
        sommaireInnerHtml = `
          <div class="document-sommaire my-6 p-5 rounded-lg border border-slate-200 bg-slate-50/60 font-sans text-slate-800 w-full" contenteditable="false" data-sommaire-block="true">
            <div class="font-bold text-base border-b border-slate-300 pb-2 mb-3 text-slate-900">
              Sommaire
            </div>
            <div class="flex flex-col gap-1.5 text-xs">
              ${tocItems.map((item) => `
                <div class="flex items-center justify-between cursor-pointer hover:bg-slate-200/60 p-1.5 rounded transition" data-toc-target="${item.id}" data-toc-page="${item.page}" onclick="window.dispatchEvent(new CustomEvent('editor-jump-to-page', {detail: {page: ${item.page}, targetId: '${item.id}'}}))">
                  <span class="${item.level === 1 ? 'font-semibold text-slate-900' : 'text-slate-700 pl-3'} hover:text-slate-950 truncate">${item.title}</span>
                  <span class="text-slate-500 font-mono text-[11px] pl-2 shrink-0">Page ${item.page}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `
      }

      // Handle pagePreviews and container DOM placement
      if (pagePreviews.length > 0) {
        // Clean out old sommaire blocks and old dedicated sommaire pages
        const cleanedPreviews = pagePreviews
          .filter((p) => p.subtitle !== 'Sommaire')
          .map((p) => {
            const div = document.createElement('div')
            div.innerHTML = p.html
            div.querySelectorAll('[data-sommaire-block="true"]').forEach((el) => el.remove())
            return { ...p, html: div.innerHTML }
          })

        if (position === 'dedicated_page') {
          const sommairePagePreview: WordPagePreview = {
            id: `sommaire-page-${Date.now()}`,
            label: 'Page 1',
            subtitle: 'Sommaire',
            html: `<div class="word-sommaire-page p-6 bg-white min-h-full">${sommaireInnerHtml}</div>`,
            scrollTop: 0,
          }
          const updatedPreviews = [
            sommairePagePreview,
            ...cleanedPreviews.map((p, i) => ({
              ...p,
              label: `Page ${i + 2}`,
            })),
          ]
          setPagePreviews(updatedPreviews)
        } else if (position === 'top') {
          const firstPage = cleanedPreviews[0] || pagePreviews[0]
          const div = document.createElement('div')
          div.innerHTML = firstPage.html
          const wrapper = document.createElement('div')
          wrapper.innerHTML = sommaireInnerHtml.trim()
          if (div.firstElementChild) {
            div.insertBefore(wrapper.firstElementChild!, div.firstElementChild)
          } else {
            div.appendChild(wrapper.firstElementChild!)
          }
          const updatedPreviews = [
            { ...firstPage, html: div.innerHTML },
            ...cleanedPreviews.slice(1).map((p, i) => ({ ...p, label: `Page ${i + 2}` })),
          ]
          setPagePreviews(updatedPreviews)
        } else {
          // cursor
          const activeIdx = Math.max(0, currentPage - 1)
          const targetPage = cleanedPreviews[activeIdx] || cleanedPreviews[0]
          const div = document.createElement('div')
          div.innerHTML = targetPage.html
          const wrapper = document.createElement('div')
          wrapper.innerHTML = sommaireInnerHtml.trim()
          div.prepend(wrapper.firstElementChild!)
          const updatedPreviews = [...cleanedPreviews]
          updatedPreviews[activeIdx] = { ...targetPage, html: div.innerHTML }
          setPagePreviews(updatedPreviews)
        }
      } else {
        // Single container mode
        container.querySelectorAll('[data-sommaire-block="true"]').forEach((node) => node.remove())
        const wrapper = document.createElement('div')
        wrapper.innerHTML = sommaireInnerHtml.trim()

        if (position === 'dedicated_page') {
          const docHtml = container.innerHTML || '<div></div>'
          const sommairePagePreview: WordPagePreview = {
            id: `sommaire-page-${Date.now()}`,
            label: 'Page 1',
            subtitle: 'Sommaire',
            html: `<div class="word-sommaire-page p-6 bg-white min-h-full">${sommaireInnerHtml}</div>`,
            scrollTop: 0,
          }
          const docPagePreview: WordPagePreview = {
            id: `doc-page-2`,
            label: 'Page 2',
            subtitle: 'Contenu du Document',
            html: docHtml,
            scrollTop: 0,
          }
          setPagePreviews([sommairePagePreview, docPagePreview])
        } else if (position === 'top') {
          const firstChild = container.firstElementChild
          if (firstChild) {
            while (wrapper.firstChild) {
              container.insertBefore(wrapper.firstChild, firstChild)
            }
          } else {
            while (wrapper.firstChild) {
              container.appendChild(wrapper.firstChild)
            }
          }
        } else {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0 && container.contains(selection.anchorNode)) {
            let anchor: Node | null = selection.anchorNode
            while (anchor && anchor.parentNode !== container) {
              anchor = anchor.parentNode
            }
            if (anchor && anchor.parentNode === container) {
              while (wrapper.firstChild) {
                container.insertBefore(wrapper.firstChild, anchor)
              }
            } else {
              while (wrapper.firstChild) {
                container.prepend(wrapper.firstChild)
              }
            }
          } else {
            while (wrapper.firstChild) {
              container.prepend(wrapper.firstChild)
            }
          }
        }
      }

      setCurrentPage(1)
      setHasEdited(true)
    }

    window.addEventListener('editor-insert-sommaire', handleInsertSommaire)
    return () => window.removeEventListener('editor-insert-sommaire', handleInsertSommaire)
  }, [pagePreviews, currentPage, setCurrentPage])

  // Listen for jump-to-page event from Sommaire item clicks
  useEffect(() => {
    const handleJumpToPage = (e: Event) => {
      const detail = (e as CustomEvent<{ page: number; targetId: string }>).detail
      if (!detail) return
      if (detail.page) {
        setCurrentPage(detail.page)
      }
      window.requestAnimationFrame(() => {
        setTimeout(() => {
          const targetEl = document.getElementById(detail.targetId)
          targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 120)
      })
    }
    window.addEventListener('editor-jump-to-page', handleJumpToPage)
    return () => window.removeEventListener('editor-jump-to-page', handleJumpToPage)
  }, [setCurrentPage])

  const handleWordPageChange = (pageNum: number) => {
    const pageCount = Math.max(1, pagePreviews.length)
    const nextPage = Math.min(Math.max(1, pageNum), pageCount)
    setCurrentPage(nextPage)

    window.requestAnimationFrame(() => {
      viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }

  /**
   * Auto-capitalize the first letter of a sentence.
   * Triggers when the user types a single lowercase letter right after:
   *  - The very start of an editable block (no preceding text), OR
   *  - A sentence-ending punctuation followed by one or more spaces (. ! ?)
   */
  const autoCapitalizeFirstLetter = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!range.collapsed) return

    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return

    const text = node.textContent || ''
    const offset = range.startOffset

    // The character just inserted is at offset - 1
    if (offset < 1) return
    const justTyped = text[offset - 1]
    if (!justTyped || justTyped !== justTyped.toLowerCase() || justTyped === justTyped.toUpperCase()) return
    if (!/[a-zàâäéèêëîïôùûüç]/i.test(justTyped)) return

    // Gather all text before cursor in this block
    const container = editorRef.current
    if (!container) return

    // Get the block-level ancestor (paragraph/div/section)
    const block = (() => {
      let n: Node | null = node
      const blockTags = new Set(['P', 'DIV', 'LI', 'TD', 'TH', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])
      while (n && n !== container) {
        if (n.nodeType === Node.ELEMENT_NODE && blockTags.has((n as HTMLElement).tagName)) return n as HTMLElement
        n = n.parentNode
      }
      return container
    })()

    // Build full text before the cursor within this block
    const blockRange = document.createRange()
    blockRange.setStart(block, 0)
    blockRange.setEnd(node, offset - 1)
    const textBefore = blockRange.toString()

    // Determine if this is a sentence-start position
    const trimmed = textBefore.trimEnd()
    const isSentenceStart =
      trimmed.length === 0 ||
      /[.!?](\s*)$/.test(trimmed)

    if (!isSentenceStart) return

    // Replace the just-typed char with its uppercase version
    const upper = justTyped.toLocaleUpperCase()
    if (upper === justTyped) return

    // Use range replacement so the browser's undo stack stays intact
    const replaceRange = document.createRange()
    replaceRange.setStart(node, offset - 1)
    replaceRange.setEnd(node, offset)
    replaceRange.deleteContents()
    replaceRange.insertNode(document.createTextNode(upper))

    // Restore cursor after the inserted char
    const newRange = document.createRange()
    const textNode = node.nodeType === Node.TEXT_NODE ? node : node.firstChild
    if (textNode) {
      try {
        newRange.setStart(textNode, offset)
        newRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(newRange)
      } catch {
        // ignore – cursor position will self-correct on next input
      }
    }
  }

  const handleContentChange = (event: FormEvent<HTMLDivElement>) => {
    if (editorRef.current) {
      const text = editorRef.current.innerText
      setWordCount(calculateWordCount(text))
      setCharCount(calculateCharCount(text))

      const inputEvent = event.nativeEvent as InputEvent
      const inputType = inputEvent.inputType || ''

      // Auto-capitalize first letter of each sentence
      if (inputType === 'insertText') {
        autoCapitalizeFirstLetter()
      }

      if (!hasEdited) setHasEdited(true)

      const shouldAnnotate =
        inputType.startsWith('insert') ||
        inputType.startsWith('delete') ||
        inputType.startsWith('format')

      if (shouldAnnotate) {
        annotateModifiedWord(editorRef.current, getEditorName(), inputType || 'input')
      }

      setEditorHtml(editorRef.current.innerHTML)
    }
  }

  const syncEditorState = () => {
    const container = editorRef.current
    if (!container) return

    setEditorHtml(container.innerHTML)
    const text = container.innerText || ''
    setWordCount(calculateWordCount(text))
    setCharCount(calculateCharCount(text))
  }

  const pushToolHistory = (label: string, beforeHtml: string, root: HTMLElement | null = editorRef.current) => {
    if (!root) return
    const afterHtml = root.innerHTML
    window.dispatchEvent(
      new CustomEvent('editor-history-snapshot', {
        detail: { root, beforeHtml, afterHtml, label },
      })
    )
  }

  const getEditorPoint = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    const container = editorRef.current
    if (!container) return { x: 24, y: 24 }
    const rect = container.getBoundingClientRect()
    const scale = editorScale || 1
    return {
      x: Math.max(0, (event.clientX - rect.left) / scale),
      y: Math.max(0, (event.clientY - rect.top) / scale),
    }
  }

  const createToolObject = (
    className: string,
    x: number,
    y: number,
    html = '',
    size?: { width: number; height: number }
  ) => {
    const container = editorRef.current
    if (!container) return null
    const beforeHtml = container.innerHTML

    const element = document.createElement('div')
    element.className = `word-tool-object ${className}`
    element.style.left = `${x}px`
    element.style.top = `${y}px`
    if (size) {
      element.style.width = `${size.width}px`
      element.style.height = `${size.height}px`
    }
    element.innerHTML = html
    container.appendChild(element)
    syncEditorState()
    pushToolHistory('Insertion de forme', beforeHtml, container)
    return element
  }

  const selectToolObject = (object: HTMLElement | null) => {
    selectedToolObjectRef.current?.classList.remove('is-selected')
    selectedToolObjectRef.current = object
    if (object?.classList.contains('word-shape-object')) {
      object.style.setProperty('--word-shape-control-color', object.dataset.shapeStroke || textColor)
    }
    object?.classList.add('is-selected')
  }

  const shapeMarkup = (svg: string) =>
    `${svg}<span class="word-rotate-handle" contenteditable="false"></span><span class="word-resize-handle" contenteditable="false"></span>`

  const setShapeMarkup = (object: HTMLElement, shape: ShapeKind, color: string, fill: string) => {
    object.dataset.shapeStroke = color
    object.dataset.shapeFill = fill
    object.style.setProperty('--word-shape-control-color', color)
    object.innerHTML = shapeMarkup(
      getShapeSvg(shape, {
        width: Math.max(1, object.offsetWidth),
        height: Math.max(1, object.offsetHeight),
        stroke: color,
        fill,
      })
    )
  }

  const beginResizeToolObject = (event: ReactPointerEvent<HTMLDivElement>, object: HTMLElement) => {
    event.preventDefault()
    event.stopPropagation()
    selectToolObject(object)

    const startX = event.clientX
    const startY = event.clientY
    const initialWidth = object.offsetWidth
    const initialHeight = object.offsetHeight
    const scale = editorScale || 1
    const root = editorRef.current
    const beforeHtml = root?.innerHTML || ''

    const resize = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(36, initialWidth + (moveEvent.clientX - startX) / scale)
      const nextHeight = Math.max(24, initialHeight + (moveEvent.clientY - startY) / scale)
      object.style.width = `${nextWidth}px`
      object.style.height = `${nextHeight}px`
    }

    const stop = () => {
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
      syncEditorState()
      pushToolHistory('Redimensionnement de forme', beforeHtml, root)
    }

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop)
  }

  const applyCurrentTypingColor = () => {
    const container = editorRef.current
    const selection = window.getSelection()
    if (!container || !selection || selection.rangeCount === 0) return
    if (!container.contains(selection.getRangeAt(0).commonAncestorContainer)) return

    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('foreColor', false, textColor)
    document.execCommand('fontName', false, textFontFamily)
  }

  const getRangeFromPoint = (x: number, y: number) => {
    const documentWithCaret = document as Document & {
      caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
      caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null
    }

    const range = documentWithCaret.caretRangeFromPoint?.(x, y)
    if (range) return range

    const position = documentWithCaret.caretPositionFromPoint?.(x, y)
    if (!position) return null

    const nextRange = document.createRange()
    nextRange.setStart(position.offsetNode, position.offset)
    nextRange.collapse(true)
    return nextRange
  }

  const getClickedCheckboxGlyph = (text: string, offset: number) => {
    const checkboxGlyphs = new Set(['□', '☐', '☒', '☑', '▢', '▫', '◻', '▣', '■', '◼'])
    const candidates = [offset, offset - 1, offset + 1]
    return candidates.find((index) => checkboxGlyphs.has(text[index])) ?? -1
  }

  const getChoiceLineRoot = (node: Node) => {
    const element = node instanceof HTMLElement ? node : node.parentElement
    if (!element) return null

    const blockTags = new Set(['P', 'LI', 'TD', 'TH', 'TR'])
    const hasChoiceBoxes = (text: string) => (text.match(/[□☐☒☑▢▫◻▣■◼]/g) || []).length >= 2
    let current: HTMLElement | null = element

    while (current && current !== editorRef.current) {
      const text = current.textContent || ''
      if (blockTags.has(current.tagName)) return current
      if (text.length <= 260 && hasChoiceBoxes(text)) return current
      current = current.parentElement
    }

    return null
  }

  const collectTextNodes = (root: HTMLElement) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let current = walker.nextNode()
    while (current) {
      nodes.push(current as Text)
      current = walker.nextNode()
    }
    return nodes
  }

  const wordCharacterPattern = /[\p{L}\p{N}]/u

  const isWordCharacter = (value: string) => wordCharacterPattern.test(value) || value === '\'' || value === '’'

  const getClosestModifiedWord = (node: Node | null) => {
    if (!node) return null

    const element = node instanceof HTMLElement ? node : node.parentElement
    return element?.closest('.word-edit-highlight') as HTMLElement | null
  }

  const getWordRangeFromSelection = (root: HTMLElement) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return null

    const existingHighlight = getClosestModifiedWord(range.startContainer) || getClosestModifiedWord(range.endContainer)
    if (existingHighlight) {
      return { range, existingHighlight }
    }

    if (!range.collapsed) {
      return { range, existingHighlight: null }
    }

    if (!(range.startContainer instanceof Text)) return null

    const text = range.startContainer.nodeValue || ''
    let start = range.startOffset
    let end = range.startOffset

    while (start > 0 && isWordCharacter(text[start - 1])) {
      start -= 1
    }

    while (end < text.length && isWordCharacter(text[end])) {
      end += 1
    }

    if (start === end) return null

    const nextRange = document.createRange()
    nextRange.setStart(range.startContainer, start)
    nextRange.setEnd(range.startContainer, end)
    return { range: nextRange, existingHighlight: null }
  }

  const annotateModifiedWord = (root: HTMLElement, modifiedBy: string, modifiedAction: string) => {
    const selectionInfo = getWordRangeFromSelection(root)
    if (!selectionInfo) return null

    const { range, existingHighlight } = selectionInfo
    const selectedText = range.toString().trim()
    if (!selectedText) return null

    if (existingHighlight) {
      existingHighlight.dataset.modifiedBy = modifiedBy
      existingHighlight.dataset.modifiedAction = modifiedAction
      existingHighlight.dataset.modifiedAt = new Date().toISOString()
      existingHighlight.title = `${modifiedAction} by ${modifiedBy}`
      return selectedText
    }

    const highlight = document.createElement('span')
    highlight.className = 'word-edit-highlight'
    highlight.dataset.modifiedBy = modifiedBy
    highlight.dataset.modifiedAction = modifiedAction
    highlight.dataset.modifiedAt = new Date().toISOString()
    highlight.title = `${modifiedAction} by ${modifiedBy}`

    try {
      range.surroundContents(highlight)
    } catch {
      const contents = range.extractContents()
      if (!contents.textContent?.trim()) return null
      highlight.appendChild(contents)
      range.insertNode(highlight)
    }

    const nextRange = document.createRange()
    nextRange.selectNodeContents(highlight)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(nextRange)
    return selectedText
  }

  const selectChoiceCheckbox = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = editorRef.current
    if (!container) return false

    if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
      const lineRoot = getChoiceLineRoot(event.target)
      if (!lineRoot || !container.contains(lineRoot)) return false

      lineRoot.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
        input.checked = input === event.target
        if (input.checked) {
          input.setAttribute('checked', 'checked')
        } else {
          input.removeAttribute('checked')
        }
      })
      syncEditorState()
      return true
    }

    const range = getRangeFromPoint(event.clientX, event.clientY)
    const textNode = range?.startContainer
    if (!(textNode instanceof Text) || !container.contains(textNode)) return false

    const text = textNode.nodeValue || ''
    if (!range) return false
    const glyphIndex = getClickedCheckboxGlyph(text, range.startOffset)
    if (glyphIndex < 0) return false

    const lineRoot = getChoiceLineRoot(textNode)
    if (!lineRoot || !container.contains(lineRoot)) return false

    for (const node of collectTextNodes(lineRoot)) {
      node.nodeValue = (node.nodeValue || '').replace(/[☒☑▣■◼]/g, '□')
    }

    const updatedText = textNode.nodeValue || ''
    textNode.nodeValue =
      updatedText.slice(0, glyphIndex) + '☒' + updatedText.slice(glyphIndex + 1)

    syncEditorState()
    return true
  }

  const beginMoveToolObject = (event: ReactPointerEvent<HTMLDivElement>, object: HTMLElement) => {
    const editableTarget = event.target instanceof HTMLElement
      ? event.target.closest('[contenteditable="true"]')
      : null
    if (editableTarget && object.classList.contains('word-textbox-object')) return
    selectToolObject(object)

    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const initialLeft = parseFloat(object.style.left || '0')
    const initialTop = parseFloat(object.style.top || '0')
    const scale = editorScale || 1
    const root = editorRef.current
    const beforeHtml = root?.innerHTML || ''

    const move = (moveEvent: PointerEvent) => {
      object.style.left = `${initialLeft + (moveEvent.clientX - startX) / scale}px`
      object.style.top = `${initialTop + (moveEvent.clientY - startY) / scale}px`
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      syncEditorState()
      pushToolHistory('Deplacement de forme', beforeHtml, root)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const beginRotateToolObject = (event: ReactPointerEvent<HTMLDivElement>, object: HTMLElement) => {
    event.preventDefault()
    event.stopPropagation()
    selectToolObject(object)

    const rect = object.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const initialRotation = parseFloat(object.dataset.rotation || '0')
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX)
    const root = editorRef.current
    const beforeHtml = root?.innerHTML || ''

    const rotate = (moveEvent: PointerEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX)
      const delta = ((currentAngle - startAngle) * 180) / Math.PI
      const nextRotation = Math.round(initialRotation + delta)
      object.dataset.rotation = String(nextRotation)
      object.style.transform = `rotate(${nextRotation}deg)`
    }

    const stop = () => {
      window.removeEventListener('pointermove', rotate)
      window.removeEventListener('pointerup', stop)
      syncEditorState()
      pushToolHistory('Rotation de forme', beforeHtml, root)
    }

    window.addEventListener('pointermove', rotate)
    window.addEventListener('pointerup', stop)
  }

  const handleToolPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isLoading || error) return

    const target = event.target as HTMLElement
    const selectedObject = target.closest('.word-tool-object') as HTMLElement | null
    const rotateObject = target.closest('.word-rotate-handle')?.closest('.word-tool-object') as HTMLElement | null
    const resizeObject = target.closest('.word-resize-handle')?.closest('.word-tool-object') as HTMLElement | null

    if (rotateObject) {
      beginRotateToolObject(event, rotateObject)
      return
    }

    if (resizeObject) {
      beginResizeToolObject(event, resizeObject)
      return
    }

    if (!selectedObject && selectChoiceCheckbox(event)) {
      event.preventDefault()
      return
    }

    if (activeTool === 'select') {
      if (selectedObject) {
        beginMoveToolObject(event, selectedObject)
      } else {
        selectToolObject(null)
      }
      return
    }

    if (selectedObject && activeTool !== 'erase') {
      beginMoveToolObject(event, selectedObject)
      return
    }

    if (activeTool === 'text' && target.closest('.word-textbox-object')) {
      return
    }

    if (activeTool === 'erase') {
      event.preventDefault()
      const root = editorRef.current
      const beforeHtml = root?.innerHTML || ''
      if (selectedObject) {
        selectedObject.remove()
      } else {
        document.execCommand('delete', false)
      }
      syncEditorState()
      pushToolHistory('Suppression de forme', beforeHtml, root)
      return
    }

    if (activeTool === 'shape') {
      event.preventDefault()
      const point = getEditorPoint(event)
      const shapeSize = getShapeSize(selectedShape)
      const fill = shapeFillColor
      const shapeObject = createToolObject(
        'word-shape-object',
        point.x,
        point.y,
        shapeMarkup(getShapeSvg(selectedShape, {
          width: shapeSize.width,
          height: shapeSize.height,
          stroke: textColor,
          fill,
        })),
        shapeSize
      )
      if (shapeObject) {
        shapeObject.dataset.shapeKind = selectedShape
        shapeObject.dataset.shapeStroke = textColor
        shapeObject.dataset.shapeFill = fill
        shapeObject.style.setProperty('--word-shape-control-color', textColor)
        selectToolObject(shapeObject)
      }
      setActiveTool('select')
      return
    }

    if (activeTool === 'text') {
      event.preventDefault()
      const point = getEditorPoint(event)
      const textBox = createToolObject(
        'word-textbox-object',
        point.x,
        point.y,
        `<div contenteditable="true" spellcheck="true" lang="${languageSettings.lang}" dir="${languageSettings.dir}" style="color: ${textColor}; font-family: ${textFontFamily}; font-size: ${textFontSize}px; direction: ${languageSettings.dir};">Text box</div>`
      )
      const editable = textBox?.querySelector('[contenteditable="true"]') as HTMLElement | null
      editable?.focus()
      return
    }

    if (activeTool === 'image') {
      event.preventDefault()
      pendingImagePointRef.current = getEditorPoint(event)
      imageInputRef.current?.click()
      return
    }

    if (activeTool === 'draw') {
      event.preventDefault()
      const container = editorRef.current
      if (!container) return

      const start = getEditorPoint(event)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const points = [start]

      svg.classList.add('word-tool-object', 'word-drawing-object')
      svg.setAttribute('contenteditable', 'false')
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', '#2563eb')
      path.setAttribute('stroke-width', '3')
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      path.setAttribute('d', `M ${start.x} ${start.y}`)
      svg.appendChild(path)
      container.appendChild(svg)

      const draw = (moveEvent: PointerEvent) => {
        const rect = container.getBoundingClientRect()
        const scale = editorScale || 1
        points.push({
          x: Math.max(0, (moveEvent.clientX - rect.left) / scale),
          y: Math.max(0, (moveEvent.clientY - rect.top) / scale),
        })
        path.setAttribute(
          'd',
          points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
        )
      }

      const stop = () => {
        window.removeEventListener('pointermove', draw)
        window.removeEventListener('pointerup', stop)
        syncEditorState()
      }

      window.addEventListener('pointermove', draw)
      window.addEventListener('pointerup', stop)
    }
  }

  const handleImagePicked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const point = pendingImagePointRef.current
    event.target.value = ''
    pendingImagePointRef.current = null
    if (!file || !point) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      createToolObject(
        'word-image-object',
        point.x,
        point.y,
        `<img src="${dataUrl}" alt="" />`
      )
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    const handleConfirmShape = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return

      const object = selectedToolObjectRef.current
      if (!object || !document.contains(object) || !object.classList.contains('word-shape-object')) return

      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('.word-textbox-object')) return

      event.preventDefault()
      selectToolObject(null)
      syncEditorState()
    }

    window.addEventListener('keydown', handleConfirmShape)
    return () => window.removeEventListener('keydown', handleConfirmShape)
  }, [])

  useEffect(() => {
    const handleShapeColorChange = (event: Event) => {
      const color = (event as CustomEvent<{ color?: string }>).detail?.color
      const object = selectedToolObjectRef.current
      if (!color || !object || !document.contains(object) || !object.classList.contains('word-shape-object')) return

      const shape = (object.dataset.shapeKind || 'rectangle') as ShapeKind
      const beforeHtml = editorRef.current?.innerHTML || ''
      setShapeMarkup(object, shape, color, object.dataset.shapeFill || shapeFillColor)
      syncEditorState()
      pushToolHistory('Couleur de forme', beforeHtml)
    }

    const handleShapeFillChange = (event: Event) => {
      const fill = (event as CustomEvent<{ color?: string }>).detail?.color
      const object = selectedToolObjectRef.current
      if (!fill || !object || !document.contains(object) || !object.classList.contains('word-shape-object')) return

      const shape = (object.dataset.shapeKind || 'rectangle') as ShapeKind
      const beforeHtml = editorRef.current?.innerHTML || ''
      setShapeMarkup(object, shape, object.dataset.shapeStroke || textColor, fill)
      syncEditorState()
      pushToolHistory('Remplissage de forme', beforeHtml)
    }

    window.addEventListener('editor-shape-color-change', handleShapeColorChange)
    window.addEventListener('editor-shape-fill-change', handleShapeFillChange)
    return () => {
      window.removeEventListener('editor-shape-color-change', handleShapeColorChange)
      window.removeEventListener('editor-shape-fill-change', handleShapeFillChange)
    }
  }, [shapeFillColor, textColor])

  // ── Auto-detect yellow-highlighted words via MutationObserver ──
  useEffect(() => {
    const container = editorRef.current
    if (!container) return

    const scanHighlights = () => {
      const spans = Array.from(
        container.querySelectorAll<HTMLElement>('.word-edit-highlight')
      )
      const words: HighlightedWord[] = spans.map((el, i) => ({
        id: `hw-${i}-${el.dataset.modifiedAt || Date.now()}`,
        text: el.textContent?.trim() || '',
        by: el.dataset.modifiedBy || 'Inconnu',
        action: el.dataset.modifiedAction || 'edit',
        at: el.dataset.modifiedAt || '',
        element: el,
      })).filter((w) => w.text.length > 0)
      setHighlightedWords(words)
      if (words.length > 0 && hasEdited) setShowHighlightPanel(true)
    }

    // Initial scan
    scanHighlights()

    const observer = new MutationObserver(scanHighlights)
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-modified-at', 'class'] })
    return () => observer.disconnect()
  }, [isLoading, hasEdited])

  const resolveHFText = (cfg: HFConfig, pageNum: number, total: number) =>
    cfg.text
      .replace(/\{page\}/gi, String(pageNum))
      .replace(/\{total\}/gi, String(total))
      .replace(/\{date\}/gi, new Date().toLocaleDateString())

  // ── Inject header/footer as real editable DOM zones ──
  useEffect(() => {
    const container = editorRef.current
    if (!container || isLoading) return

    // Clean previous injected zones
    container.querySelectorAll('.word-hf-injected').forEach((el) => el.remove())

    const sections = Array.from(
      container.querySelectorAll('.docx-wrapper > section.docx, .docx-wrapper > section, section.docx')
    ) as HTMLElement[]
    const total = Math.max(sections.length, 1)

    sections.forEach((section, i) => {
      const pageNum = i + 1
      if (getComputedStyle(section).position === 'static') section.style.position = 'relative'

      const hasH = header.enabled && Boolean(header.text.trim())
      const hasF = footer.enabled && Boolean(footer.text.trim())

      // ─ Header zone ─
      const hEl = document.createElement('div')
      hEl.className = `word-hf-injected word-hf-zone word-hf-zone--header${hasH ? ' word-hf-zone--active' : ''}`
      hEl.contentEditable = 'true'
      hEl.dataset.zone = 'header'
      hEl.title = 'Cliquez ici pour saisir du texte dans l’en-tête (double-clic pour les options)'
      hEl.style.fontSize = `${header.fontSize}px`
      hEl.style.color = header.color
      hEl.style.textAlign = header.align
      hEl.style.fontFamily = 'Arial, sans-serif'
      hEl.innerHTML = hasH
        ? resolveHFText(header, pageNum, total)
        : `<span class="word-hf-placeholder">En-tête — saisissez votre texte ici...</span>`

      // ─ Footer zone ─
      const fEl = document.createElement('div')
      fEl.className = `word-hf-injected word-hf-zone word-hf-zone--footer${hasF ? ' word-hf-zone--active' : ''}`
      fEl.contentEditable = 'true'
      fEl.dataset.zone = 'footer'
      fEl.title = 'Cliquez ici pour saisir du texte dans le pied de page (double-clic pour les options)'
      fEl.style.fontSize = `${footer.fontSize}px`
      fEl.style.color = footer.color
      fEl.style.textAlign = footer.align
      fEl.style.fontFamily = 'Arial, sans-serif'
      fEl.innerHTML = hasF
        ? resolveHFText(footer, pageNum, total)
        : `<span class="word-hf-placeholder">Pied de page — saisissez votre texte ici...</span>`

      // Clear placeholder on focus
      const handleFocus = (el: HTMLElement) => {
        const placeholder = el.querySelector('.word-hf-placeholder')
        if (placeholder) {
          el.innerHTML = ''
        }
      }

      // Sync typed text to state
      const handleInput = (el: HTMLElement, zone: 'header' | 'footer') => {
        const val = el.innerText.replace(/\n/g, ' ').trim()
        if (zone === 'header') {
          setHeader((p) => ({ ...p, enabled: true, text: val }))
        } else {
          setFooter((p) => ({ ...p, enabled: true, text: val }))
        }
      }

      hEl.addEventListener('focus', () => handleFocus(hEl))
      hEl.addEventListener('input', () => handleInput(hEl, 'header'))

      fEl.addEventListener('focus', () => handleFocus(fEl))
      fEl.addEventListener('input', () => handleInput(fEl, 'footer'))

      section.prepend(hEl)
      section.appendChild(fEl)
    })

    // Click handler for activating zone & double-click for opening options panel
    const handleHFClick = (e: MouseEvent) => {
      const zone = (e.target as HTMLElement).closest('.word-hf-zone') as HTMLElement | null
      if (!zone) return
      const zoneType = (zone.dataset.zone as 'header' | 'footer') || 'header'
      setActiveHFZone(zoneType)
      if (e.detail >= 2) {
        setShowHFPanel(true)
      }
    }

    container.addEventListener('click', handleHFClick, true)
    return () => {
      container.removeEventListener('click', handleHFClick, true)
      container.querySelectorAll('.word-hf-injected').forEach((el) => el.remove())
    }
  }, [header, footer, isLoading, pagePreviews.length])

  const pageCount = Math.max(1, pagePreviews.length)
  const safeCurrentPage = Math.min(Math.max(1, currentPage), pageCount)

  useEffect(() => {
    if (pagePreviews.length > 0 && currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage)
    }
  }, [currentPage, pagePreviews.length, safeCurrentPage, setCurrentPage])

  const activePageHtml = pagePreviews[safeCurrentPage - 1]?.html || fallbackHtml || undefined

  const previewScale = pageOrientation === 'landscape' ? 0.14 : 0.19
  const pageWidth = pageDimensions.width
  const wordPageStyle = {
    '--word-page-width': `${pageDimensions.width}px`,
    '--word-page-height': `${pageDimensions.height}px`,
    '--word-page-margin-top': `${pageMargins.top}px`,
    '--word-page-margin-right': `${pageMargins.right}px`,
    '--word-page-margin-bottom': `${pageMargins.bottom}px`,
    '--word-page-margin-left': `${pageMargins.left}px`,
    '--word-page-column-count': pageColumns,
    '--word-page-column-gap': `${pageColumnGap}px`,
  } as CSSProperties

  const rulerMajorStep = 96
  const horizontalRulerLabels = Array.from(
    { length: Math.floor(pageDimensions.width / rulerMajorStep) + 1 },
    (_, index) => ({
      value: index,
      position: index * rulerMajorStep,
    })
  )

  const pageItems: PageRailItem[] = pagePreviews.map((page, index) => ({
    id: String(index + 1),
    label: page.label,
    subtitle: page.subtitle,
    fileType: 'word',
    pageType: pageOrientation,
    preview: (
      <div className="word-preview-thumb absolute inset-0 flex items-start justify-center overflow-hidden bg-white">
        <div
          className="origin-top text-[8px]"
          style={{
            ...wordPageStyle,
            width: `${pageWidth}px`,
            transform: `scale(${previewScale})`,
            transformOrigin: 'top center',
          }}
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      </div>
    ),
    onClick: () => handleWordPageChange(index + 1),
    onDelete: pagePreviews.length > 1 ? () => {
      const container = editorRef.current
      let htmlBackup = ''
      
      if (container) {
        const pageSections = Array.from(
          container.querySelectorAll('.docx-wrapper > section.docx, .docx-wrapper > section, section.docx')
        ) as HTMLElement[]

        if (pageSections.length > 0 && index < pageSections.length) {
          const sectionToRemove = pageSections[index]
          htmlBackup = sectionToRemove.outerHTML
          sectionToRemove.parentNode?.removeChild(sectionToRemove)
          console.log(`Removed page section ${index + 1} from DOM`)
        } else {
          console.warn('Could not find exact DOM section to delete, using virtual approach')
        }

        setEditorHtml(container.innerHTML)
        const text = container.innerText || ''
        setWordCount(calculateWordCount(text))
        setCharCount(calculateCharCount(text))
      }

      const prevPreviews = [...pagePreviews]
      const newPreviews = pagePreviews.filter((_, i) => i !== index)
      const relabeledPreviews = newPreviews.map((p, i) => ({
        ...p,
        id: String(i + 1),
        label: `Page ${i + 1}`,
      }))
      setPagePreviews(relabeledPreviews)

      if (container) {
        const remainingSections = Array.from(
          container.querySelectorAll('.docx-wrapper > section.docx, .docx-wrapper > section, section.docx')
        ) as HTMLElement[]
        if (remainingSections.length > 0) {
          pageOffsetsRef.current = remainingSections.map((el) => el.offsetTop)
        } else {
          pageOffsetsRef.current = [0]
        }
      }

      const prevSafeCurrentPage = safeCurrentPage
      if (safeCurrentPage > newPreviews.length) {
        setCurrentPage(Math.max(1, newPreviews.length))
      } else if (safeCurrentPage === index + 1) {
        setCurrentPage(Math.min(index + 1, newPreviews.length))
      }

      window.dispatchEvent(
        new CustomEvent('editor-history-snapshot', {
          detail: {
            label: 'Delete Page',
            applyUndo: () => {
              setPagePreviews(prevPreviews)
              if (container && htmlBackup) {
                const template = document.createElement('template')
                template.innerHTML = htmlBackup
                const restoredNode = template.content.firstChild
                if (restoredNode) {
                  const currentSections = Array.from(
                    container.querySelectorAll('.docx-wrapper > section.docx, .docx-wrapper > section, section.docx')
                  ) as HTMLElement[]
                  if (index < currentSections.length) {
                    currentSections[index].before(restoredNode)
                  } else {
                    const wrapper = container.querySelector('.docx-wrapper')
                    if (wrapper) wrapper.appendChild(restoredNode)
                    else container.appendChild(restoredNode)
                  }
                  setEditorHtml(container.innerHTML)
                  const text = container.innerText || ''
                  setWordCount(calculateWordCount(text))
                  setCharCount(calculateCharCount(text))
                  
                  const updatedSections = Array.from(
                    container.querySelectorAll('.docx-wrapper > section.docx, .docx-wrapper > section, section.docx')
                  ) as HTMLElement[]
                  if (updatedSections.length > 0) {
                    pageOffsetsRef.current = updatedSections.map((el) => el.offsetTop)
                  }
                }
              }
              setCurrentPage(prevSafeCurrentPage)
            },
            applyRedo: () => {
              // Soft redo fallback: we don't fully implement redo for page delete yet, 
              // but it's required by the event signature. 
            }
          }
        })
      )
    } : undefined,
  }))

  const handleReorderPages = (fromIndex: number, toIndex: number) => {
    const newPreviews = [...pagePreviews]
    const removedPreviews = newPreviews.splice(fromIndex, 1)
    newPreviews.splice(toIndex, 0, removedPreviews[0])
    setPagePreviews(newPreviews)

    // Update current page if needed
    if (safeCurrentPage === fromIndex + 1) {
      setCurrentPage(toIndex + 1)
    } else if (safeCurrentPage > fromIndex && safeCurrentPage <= toIndex) {
      setCurrentPage(safeCurrentPage - 1)
    } else if (safeCurrentPage >= toIndex && safeCurrentPage < fromIndex) {
      setCurrentPage(safeCurrentPage + 1)
    }
  }

  const clampPageMargins = (nextMargins: PageMargins): PageMargins => {
    const minMargin = 24
    const minContentWidth = Math.min(320, pageDimensions.width * 0.45)
    const minContentHeight = Math.min(420, pageDimensions.height * 0.45)
    const maxHorizontalTotal = pageDimensions.width - minContentWidth
    const maxVerticalTotal = pageDimensions.height - minContentHeight
    let next = {
      top: Math.max(minMargin, Math.round(nextMargins.top)),
      right: Math.max(minMargin, Math.round(nextMargins.right)),
      bottom: Math.max(minMargin, Math.round(nextMargins.bottom)),
      left: Math.max(minMargin, Math.round(nextMargins.left)),
    }

    if (next.left + next.right > maxHorizontalTotal) {
      const overflow = next.left + next.right - maxHorizontalTotal
      if (next.left >= next.right) {
        next.left = Math.max(minMargin, next.left - overflow)
      } else {
        next.right = Math.max(minMargin, next.right - overflow)
      }
    }

    if (next.top + next.bottom > maxVerticalTotal) {
      const overflow = next.top + next.bottom - maxVerticalTotal
      if (next.top >= next.bottom) {
        next.top = Math.max(minMargin, next.top - overflow)
      } else {
        next.bottom = Math.max(minMargin, next.bottom - overflow)
      }
    }

    return next
  }

  const beginMarginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    edge: keyof PageMargins
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const startMargins = { ...pageMargins }
    const scale = editorScale || 1

    const move = (moveEvent: PointerEvent) => {
      const horizontalDelta = (moveEvent.clientX - startX) / scale
      const verticalDelta = (moveEvent.clientY - startY) / scale
      const nextMargins = { ...startMargins }

      if (edge === 'left') nextMargins.left = startMargins.left + horizontalDelta
      if (edge === 'right') nextMargins.right = startMargins.right - horizontalDelta
      if (edge === 'top') nextMargins.top = startMargins.top + verticalDelta
      if (edge === 'bottom') nextMargins.bottom = startMargins.bottom - verticalDelta

      setPageMargins(clampPageMargins(nextMargins))
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <div data-print-editor="word" className="flex-1 min-h-0 bg-[#f3f4f6] flex overflow-hidden">
      <div data-print-editor-main="true" ref={viewportRef} className="flex min-w-0 flex-1 flex-col overflow-hidden p-0 sm:p-1 md:p-2">
        <div data-print-scroll="true" ref={contentScrollRef} className="relative mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col items-center overflow-auto">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePicked}
          />
          <div
            data-print-hidden="true"
            className="word-margin-ruler word-margin-ruler-horizontal sticky top-0 z-30 mt-2"
            style={{
              width: `${pageDimensions.width}px`,
              transform: `scale(${editorScale})`,
              transformOrigin: 'top center',
            }}
          >
            {/* ── En-tête / Pied de page button ── */}
            <div className="absolute -top-9 left-0 right-0 flex justify-center" style={{ zIndex: 40 }}>
              <button
                type="button"
                onClick={() => setShowHFPanel((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-all border ${
                  showHFPanel
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : (header.enabled || footer.enabled)
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
                title="En-tête / Pied de page"
              >
                <LayoutTemplate size={12} />
                En-tête / Pied de page
                {(header.enabled || footer.enabled) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                )}
              </button>
            </div>

            {/* ── HF Panel ── */}
            {showHFPanel && (
              <div
                data-print-hidden="true"
                className="absolute top-8 left-1/2 z-50 w-[440px] -translate-x-1/2 rounded-xl border border-indigo-200 bg-white shadow-2xl overflow-hidden"
                style={{ minWidth: 300 }}
              >
                {/* Title bar */}
                <div className="flex items-center justify-between border-b border-gray-100 bg-indigo-50 px-4 py-2">
                  <span className="text-xs font-bold text-indigo-800">En-tête / Pied de page</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-400">
                      <code className="bg-white px-1 rounded">{'{page}'}</code> ·{' '}
                      <code className="bg-white px-1 rounded">{'{total}'}</code> ·{' '}
                      <code className="bg-white px-1 rounded">{'{date}'}</code>
                    </span>
                    <button type="button" onClick={() => setShowHFPanel(false)} className="rounded p-0.5 text-gray-400 hover:text-gray-700">✕</button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                  {(['header', 'footer'] as const).map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => setActiveHFZone(zone)}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        activeHFZone === zone
                          ? 'border-b-2 border-indigo-500 text-indigo-700 bg-indigo-50/60'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {zone === 'header' ? '▲ En-tête' : '▼ Pied de page'}
                    </button>
                  ))}
                </div>

                {/* Active zone editor */}
                {(['header', 'footer'] as const).map((zone) => {
                  if (zone !== activeHFZone) return null
                  const cfg = zone === 'header' ? header : footer
                  const setCfg = (patch: Partial<HFConfig>) =>
                    zone === 'header' ? setHeader((p) => ({ ...p, ...patch })) : setFooter((p) => ({ ...p, ...patch }))
                  return (
                    <div key={zone} className="p-3 space-y-2.5">
                      {/* Toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Activer</span>
                        <div
                          onClick={() => setCfg({ enabled: !cfg.enabled })}
                          className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors ${cfg.enabled ? 'bg-indigo-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      {cfg.enabled && (
                        <>
                          <input
                            type="text"
                            value={cfg.text}
                            onChange={(e) => setCfg({ text: e.target.value })}
                            autoFocus
                            placeholder={zone === 'header' ? 'Mon document — {page}/{total}' : 'Page {page} sur {total}  |  {date}'}
                            className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Align */}
                            <div className="flex rounded border border-gray-200 overflow-hidden">
                              {(['left', 'center', 'right'] as const).map((a) => (
                                <button key={a} type="button" onClick={() => setCfg({ align: a })}
                                  className={`px-1.5 py-1 ${cfg.align === a ? 'bg-indigo-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                                >
                                  {a === 'left' && <AlignLeft size={11} />}
                                  {a === 'center' && <AlignCenter size={11} />}
                                  {a === 'right' && <AlignRight size={11} />}
                                </button>
                              ))}
                            </div>
                            {/* Size */}
                            <select
                              value={cfg.fontSize}
                              onChange={(e) => setCfg({ fontSize: Number(e.target.value) })}
                              className="rounded border border-gray-200 px-1 py-0.5 text-xs"
                            >
                              {[7, 8, 9, 10, 11, 12, 14].map((s) => (
                                <option key={s} value={s}>{s}pt</option>
                              ))}
                            </select>
                            {/* Color */}
                            <input
                              type="color"
                              value={cfg.color}
                              onChange={(e) => setCfg({ color: e.target.value })}
                              className="h-5 w-7 cursor-pointer rounded border p-0"
                            />
                          </div>
                          {/* Preview */}
                          <div
                            className="rounded border border-dashed border-indigo-200 bg-indigo-50/40 px-2 py-1 text-[10px] truncate"
                            style={{ textAlign: cfg.align, color: cfg.color, fontFamily: 'Arial,sans-serif', fontSize: `${Math.max(9, cfg.fontSize)}px` }}
                          >
                            {resolveHFText(cfg, safeCurrentPage, pageCount) || <span className="italic text-gray-300">Aperçu…</span>}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="word-margin-ruler-shade left-0" style={{ width: `${pageMargins.left}px` }} />
            <div className="word-margin-ruler-shade right-0" style={{ width: `${pageMargins.right}px` }} />
            {horizontalRulerLabels.map((mark) => (
              <span
                key={`h-ruler-${mark.value}`}
                className="word-margin-ruler-number word-margin-ruler-number-horizontal"
                style={{ left: `${mark.position}px` }}
              >
                {mark.value}
              </span>
            ))}
            <button
              type="button"
              className="word-margin-ruler-handle word-margin-ruler-handle-left"
              style={{ left: `${pageMargins.left}px` }}
              onPointerDown={(event) => beginMarginDrag(event, 'left')}
              title="Left margin"
            />
            <button
              type="button"
              className="word-margin-ruler-handle word-margin-ruler-handle-right"
              style={{ right: `${pageMargins.right}px` }}
              onPointerDown={(event) => beginMarginDrag(event, 'right')}
              title="Right margin"
            />
          </div>

          <div className="flex items-start justify-center gap-2">

          <div
            className="relative shadow-xl rounded-sm transition-all"
            style={{
              width: `${pageDimensions.width}px`,
              minHeight: `${pageDimensions.height}px`,
              transform: `scale(${editorScale})`,
              transformOrigin: 'top center',
            }}
          >
            <div
              data-print-document="true"
              ref={editorRef}
              contentEditable
              spellCheck
              lang={languageSettings.lang}
              dir={languageSettings.dir}
              className={`word-editor-root relative min-h-[calc(100vh-172px)] p-0 sm:p-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                activeTool === 'text'
                  ? 'cursor-text'
                  : activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image'
                  ? 'cursor-crosshair'
                  : activeTool === 'erase'
                    ? 'cursor-not-allowed'
                    : 'cursor-text'
                }`}
              style={{
                ...wordPageStyle,
                color: '#333',
                width: '100%',
                minWidth: 'unset',
                maxWidth: pageOrientation === 'landscape' ? 'none' : '100%',
                minHeight: `${pageDimensions.height}px`,
                transition: 'width 250ms ease, min-height 250ms ease',
                direction: languageSettings.dir,
              }}
              onPointerDown={handleToolPointerDown}
              onKeyDown={applyCurrentTypingColor}
              onMouseUp={applyCurrentTypingColor}
              onInput={handleContentChange}
              suppressContentEditableWarning
              dangerouslySetInnerHTML={activePageHtml ? { __html: activePageHtml } : undefined}
            />
            {pageNumberConfig.enabled && formatPageNumber(safeCurrentPage, Math.max(1, pagePreviews.length), pageNumberConfig) && (
              <div
                contentEditable={false}
                className="pointer-events-none absolute z-20 font-mono text-xs font-semibold px-2.5 py-1 rounded-md border border-slate-300/70 bg-white/95 shadow-sm text-slate-700 select-none"
                style={{
                  ...getPageNumberPositionStyle(pageNumberConfig.position, pageMargins),
                  fontSize: `${pageNumberConfig.fontSize || 11}px`,
                  color: pageNumberConfig.color || '#444444',
                }}
              >
                {formatPageNumber(safeCurrentPage, Math.max(1, pagePreviews.length), pageNumberConfig)}
              </div>
            )}
          </div>
          </div>

          {isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/85 backdrop-blur-[1px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 font-medium">Loading document...</p>
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 p-6">
              <div className="text-center max-w-md">
                <AlertCircle size={48} className="mx-auto mb-4 text-blue-600" />
                <p className="text-gray-800 font-semibold mb-2">Error Loading Document</p>
                <p className="text-gray-600">{error}</p>
              </div>
            </div>
          )}
        </div>
        <EditorNavigation
          current={safeCurrentPage}
          total={pagePreviews.length}
          onPrevious={() => handleWordPageChange(safeCurrentPage - 1)}
          onNext={() => handleWordPageChange(safeCurrentPage + 1)}
          accentColor={themeColor}
          className="shrink-0 border-t border-gray-200 bg-[#f3f4f6]"
          themeColor={themeColor}
        />
      </div>

      {/* ── Mots modifiés — floating panel in grey area ── */}
      {showHighlightPanel && highlightedWords.length > 0 && (
        <div
          data-print-hidden="true"
          className="pointer-events-none absolute inset-0 z-40"
          style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}
        >
          <div
            className="pointer-events-auto absolute right-4 top-4 flex flex-col rounded-xl border border-yellow-200 bg-white/95 shadow-2xl backdrop-blur-sm"
            style={{ width: 210, maxHeight: 'calc(100vh - 160px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-yellow-100 bg-yellow-50 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-yellow-800">✏️ Mots modifiés</span>
                <span className="rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-yellow-900">
                  {highlightedWords.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowHighlightPanel(false)}
                className="rounded p-0.5 text-yellow-600 hover:bg-yellow-100"
                title="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Word list */}
            <div className="flex-1 overflow-y-auto">
              {highlightedWords.map((w, i) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    w.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    w.element.style.outline = '2px solid #f59e0b'
                    setTimeout(() => { w.element.style.outline = '' }, 1200)
                  }}
                  className="w-full border-b border-yellow-50 px-3 py-2 text-left transition-colors hover:bg-yellow-50 active:bg-yellow-100"
                >
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-[10px] font-bold text-yellow-500">{i + 1}</span>
                    <div className="min-w-0">
                      <div
                        className="truncate rounded px-1 text-xs font-semibold text-amber-900"
                        style={{ background: 'rgba(250,204,21,0.28)' }}
                      >
                        {w.text.length > 22 ? `${w.text.slice(0, 22)}…` : w.text}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-gray-500">{w.by}</div>
                      {w.at && (
                        <div className="text-[9px] text-gray-400">
                          {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(w.at))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Clear all */}
            <div className="rounded-b-xl border-t border-yellow-100 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  const container = editorRef.current
                  if (!container) return
                  container.querySelectorAll<HTMLElement>('.word-edit-highlight').forEach((el) => {
                    const parent = el.parentNode
                    while (el.firstChild) parent?.insertBefore(el.firstChild, el)
                    parent?.removeChild(el)
                  })
                  setHighlightedWords([])
                  setShowHighlightPanel(false)
                }}
                className="w-full rounded bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-800 hover:bg-yellow-200"
              >
                Effacer les surlignages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-open pill — stays in grey area top-right */}
      {!showHighlightPanel && highlightedWords.length > 0 && (
        <div
          data-print-hidden="true"
          className="pointer-events-none absolute inset-0 z-40"
          style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}
        >
          <button
            type="button"
            onClick={() => setShowHighlightPanel(true)}
            className="pointer-events-auto absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-yellow-300 bg-yellow-400 px-3 py-1.5 text-xs font-bold text-yellow-900 shadow-lg hover:bg-yellow-300"
          >
            ✏️ {highlightedWords.length} mot{highlightedWords.length > 1 ? 's' : ''} modifié{highlightedWords.length > 1 ? 's' : ''}
          </button>
        </div>
      )}

      <PageRail
        title="Document Pages"
        items={pageItems}
        activeId={String(safeCurrentPage)}
        accentColor={themeColor}
        side="right"
        onAddStep={() => {
          addPage()
          setPagePreviews([
            ...pagePreviews,
            {
              id: `new-page-${Date.now()}`,
              label: `Page ${pagePreviews.length + 1}`,
              subtitle: 'New page',
              html: '<div></div>',
              scrollTop: 0,
            }
          ])
          setCurrentPage(pagePreviews.length + 1)
        }}
        onReorder={handleReorderPages}
      />
    </div>
  )
}
