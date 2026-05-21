import {
  useEffect,
  useState,
  useRef,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { calculateWordCount, calculateCharCount, getPageDimensions } from '../../utils'
import { AlertCircle } from 'lucide-react'
import * as mammoth from 'mammoth'
import { renderAsync } from 'docx-preview'
import PageRail, { type PageRailItem } from '../PageRail'
import EditorNavigation from '../EditorNavigation'
import { getThemeForFileType } from '../../utils'

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

export default function WordEditor({ file }: WordEditorProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fallbackHtml, setFallbackHtml] = useState<string | null>(null)
  const [pagePreviews, setPagePreviews] = useState<WordPagePreview[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const pageOffsetsRef = useRef<number[]>([])
  const pendingImagePointRef = useRef<{ x: number; y: number } | null>(null)
  const zoom = useDocumentStore((state) => state.zoom)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const textColor = useDocumentStore((state) => state.textColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const setEditorHtml = useDocumentStore((state) => state.setEditorHtml)
  const addPage = useDocumentStore((state) => state.addPage)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const pageDimensions = getPageDimensions(file.type, pageOrientation)
  
  // Use originalType for PDFs that were converted to Word
  const actualFileType = file.originalType || file.type
  const themeColor = getThemeForFileType(actualFileType)

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

  const handleWordPageChange = (pageNum: number) => {
    const pageCount = Math.max(1, pagePreviews.length)
    const nextPage = Math.min(Math.max(1, pageNum), pageCount)
    setCurrentPage(nextPage)

    window.requestAnimationFrame(() => {
      viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }

  const handleContentChange = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText
      setEditorHtml(editorRef.current.innerHTML)
      setWordCount(calculateWordCount(text))
      setCharCount(calculateCharCount(text))
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

  const getEditorPoint = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    const container = editorRef.current
    if (!container) return { x: 24, y: 24 }
    const rect = container.getBoundingClientRect()
    const scale = zoom / 100 || 1
    return {
      x: Math.max(0, (event.clientX - rect.left) / scale),
      y: Math.max(0, (event.clientY - rect.top) / scale),
    }
  }

  const createToolObject = (className: string, x: number, y: number, html = '') => {
    const container = editorRef.current
    if (!container) return null

    const element = document.createElement('div')
    element.className = `word-tool-object ${className}`
    element.style.left = `${x}px`
    element.style.top = `${y}px`
    element.innerHTML = html
    container.appendChild(element)
    syncEditorState()
    return element
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

  const beginMoveToolObject = (event: ReactPointerEvent<HTMLDivElement>, object: HTMLElement) => {
    const editableTarget = event.target instanceof HTMLElement
      ? event.target.closest('[contenteditable="true"]')
      : null
    if (editableTarget && object.classList.contains('word-textbox-object')) return

    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const initialLeft = parseFloat(object.style.left || '0')
    const initialTop = parseFloat(object.style.top || '0')
    const scale = zoom / 100 || 1

    const move = (moveEvent: PointerEvent) => {
      object.style.left = `${initialLeft + (moveEvent.clientX - startX) / scale}px`
      object.style.top = `${initialTop + (moveEvent.clientY - startY) / scale}px`
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      syncEditorState()
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const handleToolPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isLoading || error) return

    const target = event.target as HTMLElement
    const selectedObject = target.closest('.word-tool-object') as HTMLElement | null

    if (activeTool === 'select') {
      if (selectedObject) {
        beginMoveToolObject(event, selectedObject)
      }
      return
    }

    if (activeTool === 'text' && target.closest('.word-textbox-object')) {
      return
    }

    if (activeTool === 'erase') {
      event.preventDefault()
      if (selectedObject) {
        selectedObject.remove()
      } else {
        document.execCommand('delete', false)
      }
      syncEditorState()
      return
    }

    if (activeTool === 'shape') {
      event.preventDefault()
      const point = getEditorPoint(event)
      createToolObject('word-shape-object', point.x, point.y)
      return
    }

    if (activeTool === 'text') {
      event.preventDefault()
      const point = getEditorPoint(event)
      const textBox = createToolObject(
        'word-textbox-object',
        point.x,
        point.y,
        `<div contenteditable="true" spellcheck="false" style="color: ${textColor}; font-family: ${textFontFamily}; font-size: ${textFontSize}px;">Text box</div>`
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
        const scale = zoom / 100 || 1
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

  const pageItems: PageRailItem[] = pagePreviews.map((page, index) => ({
    id: String(index + 1),
    label: page.label,
    subtitle: page.subtitle,
    fileType: 'word',
    pageType: pageOrientation,
    preview: (
      <div className="word-preview-thumb flex h-full w-full items-start justify-center overflow-hidden bg-white">
        <div
          className="origin-top text-[8px]"
          style={{ width: `${pageWidth}px`, transform: `scale(${previewScale})`, transformOrigin: 'top center' }}
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      </div>
    ),
    onClick: () => handleWordPageChange(index + 1),
    onDelete: pagePreviews.length > 1 ? () => {
      // Actually remove the page section from the rendered DOM
      const container = editorRef.current
      if (container) {
        // Find all page section nodes in the DOM
        const pageSections = Array.from(
          container.querySelectorAll('.docx-wrapper > section.docx, .docx-wrapper > section, section.docx')
        ) as HTMLElement[]

        // If we found real page sections matching our preview count
        if (pageSections.length > 0 && index < pageSections.length) {
          const sectionToRemove = pageSections[index]
          sectionToRemove.parentNode?.removeChild(sectionToRemove)
          console.log(`Removed page section ${index + 1} from DOM`)
        } else {
          // Fallback: if pages were split virtually, try to remove by height
          console.warn('Could not find exact DOM section to delete, using virtual approach')
        }

        // Update the editor HTML and counts after DOM change
        setEditorHtml(container.innerHTML)
        const text = container.innerText || ''
        setWordCount(calculateWordCount(text))
        setCharCount(calculateCharCount(text))
      }

      // Update the previews list
      const newPreviews = pagePreviews.filter((_, i) => i !== index)
      // Recalculate labels for remaining pages
      const relabeledPreviews = newPreviews.map((p, i) => ({
        ...p,
        id: String(i + 1),
        label: `Page ${i + 1}`,
      }))
      setPagePreviews(relabeledPreviews)

      // Rebuild page offsets
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

      // Fix current page
      if (safeCurrentPage > newPreviews.length) {
        setCurrentPage(Math.max(1, newPreviews.length))
      } else if (safeCurrentPage === index + 1) {
        setCurrentPage(Math.min(index + 1, newPreviews.length))
      }
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

  return (
    <div data-print-editor="word" className="flex-1 min-h-0 bg-white flex overflow-hidden">
      <div data-print-editor-main="true" ref={viewportRef} className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white p-0 sm:p-1 md:p-2">
        <div data-print-scroll="true" ref={contentScrollRef} className="relative mx-auto flex min-h-0 w-full max-w-none flex-1 justify-center overflow-auto bg-white">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePicked}
          />
          <div
            data-print-document="true"
            ref={editorRef}
            contentEditable
            spellCheck={false}
            className={`word-editor-root relative min-h-[calc(100vh-172px)] bg-white p-0 sm:p-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${activeTool === 'text'
              ? 'cursor-text'
              : activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image'
                ? 'cursor-crosshair'
                : activeTool === 'erase'
                  ? 'cursor-not-allowed'
                  : 'cursor-text'
              }`}
            style={{
              transform: `scale(${(zoom * 1.12) / 100})`,
              transformOrigin: 'top center',
              color: '#333',
              width: `${pageDimensions.width}px`,
              minWidth: 'unset',
              maxWidth: '100%',
              minHeight: `${pageDimensions.height}px`,
              transition: 'width 250ms ease, min-height 250ms ease, transform 250ms ease',
            }}
            onPointerDown={handleToolPointerDown}
            onKeyDown={applyCurrentTypingColor}
            onMouseUp={applyCurrentTypingColor}
            onInput={handleContentChange}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={activePageHtml ? { __html: activePageHtml } : undefined}
          />

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
          className="shrink-0 border-t border-gray-200 bg-white"
          themeColor={themeColor}
        />
      </div>

      <PageRail
        title="SCREENS"
        items={pageItems}
        activeId={String(safeCurrentPage)}
        accentColor={getThemeForFileType(file.originalType || file.type)}
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