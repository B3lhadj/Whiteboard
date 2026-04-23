import { useEffect, useState, useRef } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { calculateWordCount, calculateCharCount } from '../../utils'
import { AlertCircle } from 'lucide-react'
import * as mammoth from 'mammoth'
import { renderAsync } from 'docx-preview'

interface WordPagePreview {
  id: string
  label: string
  subtitle: string
  html: string
  scrollTop: number
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
  const pageOffsetsRef = useRef<number[]>([])
  const zoom = useDocumentStore((state) => state.zoom)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const setEditorHtml = useDocumentStore((state) => state.setEditorHtml)

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

        // Debug: Log the actual structure created by docx-preview
        console.log('Container after renderAsync:', {
          innerHTML_length: container.innerHTML.length,
          children: container.children.length,
          scrollHeight: container.scrollHeight,
        })
        
        // Log ALL children structure
        console.log('=== CONTAINER CHILDREN STRUCTURE ===')
        Array.from(container.children).forEach((child, i) => {
          const el = child as HTMLElement
          console.log(`Child ${i}:`, {
            tag: el.tagName,
            class: el.className,
            id: el.id,
            height: el.clientHeight,
            scrollHeight: el.scrollHeight,
            children_count: el.children.length,
            text_length: el.textContent?.length || 0,
          })
          
          // If this is docx-wrapper, log its children
          if (el.className.includes('docx-wrapper')) {
            Array.from(el.children).forEach((grandchild, j) => {
              const gchild = grandchild as HTMLElement
              console.log(`  └─ Child ${j}:`, {
                tag: gchild.tagName,
                class: gchild.className,
                height: gchild.clientHeight,
              })
            })
          }
        })

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

  const splitPageByHeight = (pageElement: HTMLElement, standardHeight: number = 1120): HTMLElement[] => {
    console.log('=== ATTEMPTING TO SPLIT PAGE BY HEIGHT ===')
    console.log(`Standard page height: ${standardHeight}px, actual height: ${pageElement.clientHeight}px`)

    const actualHeight = pageElement.clientHeight
    if (actualHeight <= standardHeight * 1.2) {
      console.log('Page height is within tolerance, not splitting')
      return [pageElement]
    }

    const estimatedPages = Math.ceil(actualHeight / standardHeight)
    console.log(`Estimated ${estimatedPages} pages needed`)

    // Clone the page element once to create multiple instances
    const pages: HTMLElement[] = []
    for (let i = 0; i < estimatedPages; i++) {
      const clone = pageElement.cloneNode(true) as HTMLElement
      pages.push(clone)
    }

    console.log(`Created ${pages.length} page elements by height splitting`)
    return pages
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
          let splitPages = splitPagesByPageBreaks(candidates[0])
          
          // If that didn't work, split by height
          if (splitPages.length <= 1) {
            console.log('Page break splitting failed or found no breaks, using height-based splitting')
            splitPages = splitPageByHeight(candidates[0])
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
        const subtitle = toSubtitle(pageNode.textContent || '')
        return {
          id: String(index + 1),
          label: `Page ${index + 1}`,
          subtitle: subtitle || `Page ${index + 1}`,
          html: pageNode.outerHTML,
          scrollTop: offsets[index],
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
        html: firstPage.outerHTML,
        scrollTop: offset,
      }))

      console.log(`Created ${estimatedPageCount} virtual pages with offsets:`, offsets)
      return { offsets, previews }
    }

    // Document appears to be single page
    console.log(`Document appears to be single page (height ${totalHeight}px is under ${standardPageHeight * 1.5}px threshold)`)
    return {
      offsets: [0],
      previews: [
        {
          id: '1',
          label: 'Page 1',
          subtitle: toSubtitle(firstPage.textContent || container.textContent || ''),
          html: firstPage.outerHTML,
          scrollTop: 0,
        },
      ],
    }
  }

  useEffect(() => {
    const root = editorRef.current

    if (!root || pageOffsetsRef.current.length === 0) return

    const onScroll = () => {
      const currentScroll = root.scrollTop
      const offsets = pageOffsetsRef.current
      let pageNumber = 1

      for (let i = 0; i < offsets.length; i++) {
        const next = offsets[i + 1] ?? Number.POSITIVE_INFINITY
        if (currentScroll >= offsets[i] - 12 && currentScroll < next - 12) {
          pageNumber = i + 1
          break
        }
      }

      setCurrentPage(pageNumber)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => root.removeEventListener('scroll', onScroll)
  }, [pagePreviews, setCurrentPage])

  const handleContentChange = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText
      setEditorHtml(editorRef.current.innerHTML)
      setWordCount(calculateWordCount(text))
      setCharCount(calculateCharCount(text))
    }
  }

  return (
    <div className="flex-1 min-h-0 bg-gray-100 flex overflow-hidden">
      <aside className="w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col shadow-sm">
        <div className="px-3 pt-3 pb-2 text-[11px] font-bold tracking-[0.18em] text-gray-600">PAGES</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {pagePreviews.map((page, index) => {
            const isActive = currentPage === index + 1
            return (
              <button
                key={page.id}
                onClick={() => {
                  const root = editorRef.current
                  if (root) {
                    root.scrollTo({ top: page.scrollTop, behavior: 'smooth' })
                  }
                  setCurrentPage(index + 1)
                }}
                className={`mb-2 w-full rounded-xl border-2 p-2 text-left transition-all ${
                  isActive
                    ? 'bg-blue-50 shadow-sm border-blue-500'
                    : 'bg-white hover:bg-gray-50 hover:shadow-sm border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
                  <span className="text-[11px] font-semibold text-gray-700 truncate">{page.label}</span>
                  <span className="text-[10px] font-bold text-gray-400">{index + 1}</span>
                </div>

                <div className="h-24 overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div
                    className="word-preview-thumb origin-top-left scale-[0.11] pointer-events-none"
                    style={{ width: '909%' }}
                    dangerouslySetInnerHTML={{ __html: page.html }}
                  />
                </div>

                <div className="mt-2 truncate text-[11px] text-gray-500">{page.subtitle}</div>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
        <div className="relative mx-auto w-full max-w-[980px] rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div
            ref={editorRef}
            contentEditable
            spellCheck={false}
            className={`word-editor-root min-h-[80vh] bg-[#e5e7eb] p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-4 overflow-auto ${
              activeTool === 'text'
                ? 'cursor-text'
                : activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image'
                ? 'cursor-crosshair'
                : 'cursor-text'
            }`}
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              color: '#333',
              maxWidth: '100%',
            }}
            onInput={handleContentChange}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={fallbackHtml ? { __html: fallbackHtml } : undefined}
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
      </div>
    </div>
  )
}
