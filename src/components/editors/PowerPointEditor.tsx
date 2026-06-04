import { useEffect, useRef, useState } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import { getPageDimensions } from '../../utils'
import { getPageMargins } from '../../pageLayout'
import JSZip from 'jszip'
import { Move, Plus, Type, Trash2 } from 'lucide-react'
import PageRail, { type PageRailItem } from '../PageRail.tsx'
import EditorNavigation from '../EditorNavigation'
import { EDITOR_COLOR_PALETTE, EDITOR_FONT_FAMILIES, EDITOR_FONT_SIZES } from '../../editorOptions'

interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  color?: string
  fontSize?: number
}

interface TextElement {
  runs: TextRun[]
  type: 'title' | 'subtitle' | 'body' | 'text'
  level?: number
  isBullet?: boolean
  alignment?: string
  color?: string
}

interface TextBox extends TextElement {
  x?: number
  y?: number
  width?: number
  height?: number
}

interface ImageElement {
  id: string
  data: string
  x?: number
  y?: number
  width?: number
  height?: number
  zIndex?: number
}

interface Slide {
  id: string
  title: string
  textElements: TextElement[]
  textBoxes?: TextBox[]
  images: ImageElement[]
  imageData?: string
  thumbnailData?: string
  backgroundColor?: string
  fullText: string
  width?: number
  height?: number
}

interface PptOverlayText {
  id: string
  slideIndex: number
  xRatio: number
  yRatio: number
  text: string
  fontSize: number
  fontFamily: string
  color: string
}

interface PowerPointEditorProps {
  file: DocumentFile
}

const arrayBufferToFile = (content: ArrayBuffer, name: string) =>
  new File([content], name, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })

const runText = (runs: TextRun[] = []) => runs.map((run) => run.text).join('')

export default function PowerPointEditor({ file }: PowerPointEditorProps) {
  const [slides, setSlides] = useState<Slide[]>([])
  const [editableSlides, setEditableSlides] = useState<Slide[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingEditable, setIsLoadingEditable] = useState(false)
  const [isObjectEditMode, setIsObjectEditMode] = useState(false)
  const [areImagesEditable, setAreImagesEditable] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [overlayTexts, setOverlayTexts] = useState<PptOverlayText[]>([])
  const [isAddingText, setIsAddingText] = useState(false)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const lastToolbarFormatRef = useRef({ textColor: '', textFontFamily: '', textFontSize: 0 })

  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const zoom = useDocumentStore((state) => state.zoom)
  const textColor = useDocumentStore((state) => state.textColor)
  const textFontFamily = useDocumentStore((state) => state.textFontFamily)
  const textFontSize = useDocumentStore((state) => state.textFontSize)
  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const pageMarginPreset = useDocumentStore((state) => state.pageMarginPreset)
  const pageSize = useDocumentStore((state) => state.pageSize)
  const pageColumns = useDocumentStore((state) => state.pageColumns)
  const pageDimensions = getPageDimensions(file.type, pageOrientation, pageSize)
  const pageMargins = getPageMargins(pageMarginPreset)
  const slideContentBox = {
    top: Math.min(pageMargins.top, pageDimensions.height * 0.28),
    right: Math.min(pageMargins.right, pageDimensions.width * 0.28),
    bottom: Math.min(pageMargins.bottom, pageDimensions.height * 0.28),
    left: Math.min(pageMargins.left, pageDimensions.width * 0.28),
  }

  const toggleViewMode = useDocumentStore((state) => state.toggleViewMode)

  const loadEditableSlides = async (activate = false) => {
    try {
      setIsLoadingEditable(true)
      const formData = new FormData()
      formData.append('file', arrayBufferToFile(file.content, file.name))
      formData.append('renderMode', 'editable')

      const response = await fetch('http://localhost:5000/api/upload-pptx', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) return

      const result = await response.json()
      if (result.slides?.length) {
        setEditableSlides(result.slides)
        if (activate) {
          setIsObjectEditMode(true)
          setCurrentPage(1)
        }
      }
    } catch (error) {
      console.warn('Could not load editable PPTX object model.', error)
    } finally {
      setIsLoadingEditable(false)
    }
  }

  useEffect(() => {
    const loadPPTX = async () => {
      try {
        setIsLoading(true)

        // If Flask already rendered the slides, use them directly.
        if (file.slides && file.slides.length > 0) {
          const hasRenderedSlides = file.slides.some((slide) => slide.imageData)
          if (hasRenderedSlides) {
            setSlides(file.slides)
            loadEditableSlides(false)
            const firstSlide = file.slides[0]
            setWordCount(firstSlide.fullText?.split(/\s+/).filter((w: string) => w.length > 0).length || 0)
            setCharCount(firstSlide.fullText?.length || 0)
            setIsLoading(false)
            return
          }
        }

        // Upgrade old editable parses to pixel-perfect slide images when the backend is available.
        try {
          const formData = new FormData()
          formData.append('file', arrayBufferToFile(file.content, file.name))
          formData.append('renderMode', 'pixel')

          const response = await fetch('http://localhost:5000/api/upload-pptx', {
            method: 'POST',
            body: formData,
          })

          if (response.ok) {
            const result = await response.json()
            if (result.slides?.length) {
              setSlides(result.slides)
              loadEditableSlides(false)
              setWordCount(0)
              setCharCount(0)
              setCurrentPage(1)
              setIsLoading(false)
              return
            }
          }
        } catch (error) {
          console.warn('Could not render PPTX through backend; using local editable fallback.', error)
        }

        // Fallback to client-side parsing
        const zip = new JSZip()
        await zip.loadAsync(file.content)

        let loadedSlides: Slide[] = []

        // Get slide dimensions from presentation.xml
        let slideWidth = 9144000 // default 10 inches in EMU
        let slideHeight = 5143500 // default 5.625 inches in EMU (16:9)

        try {
          const presFile = zip.file('ppt/presentation.xml')
          if (presFile) {
            const presXml = await presFile.async('text')
            const sldSizeMatch = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(presXml)
            if (sldSizeMatch) {
              slideWidth = parseInt(sldSizeMatch[1])
              slideHeight = parseInt(sldSizeMatch[2])
              console.log(`Slide dimensions: ${slideWidth} x ${slideHeight} EMU`)
            }
          }
        } catch (err) {
          console.log('Could not read presentation dimensions, using defaults')
        }

        const slideCount = Object.keys(zip.files).filter(
          (f) => f.startsWith('ppt/slides/slide') && f.endsWith('.xml') && !f.includes('_rels')
        ).length

        for (let i = 1; i <= slideCount; i++) {
          try {
            const slideFile = zip.file(`ppt/slides/slide${i}.xml`)
            const slideRelsFile = zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)
            if (!slideFile) continue

            const slideXml = await slideFile.async('text')
            const slideRelsXml = slideRelsFile ? await slideRelsFile.async('text') : ''
            const slide = await parseSlide(slideXml, slideRelsXml, i, zip, slideWidth, slideHeight)
            loadedSlides.push(slide)
          } catch (err) {
            console.error(`Error parsing slide ${i}:`, err)
          }
        }

        if (loadedSlides.length === 0) {
          loadedSlides = createDefaultSlides()
        }

        setSlides(loadedSlides)
        setCurrentPage(1)
      } catch (err) {
        console.error('Error loading PPTX:', err)
        setSlides(createDefaultSlides())
        setCurrentPage(1)
      } finally {
        setIsLoading(false)
      }
    }

    loadPPTX()
  }, [file.content, setCurrentPage])

  const parseSlide = async (
    slideXml: string,
    slideRelsXml: string,
    slideNumber: number,
    zip: JSZip,
    slideWidth: number = 9144000,
    slideHeight: number = 5143500
  ): Promise<Slide> => {
    const textElements: TextElement[] = []
    const images: ImageElement[] = []
    let title = `Slide ${slideNumber}`

    console.log(`=== Parsing Slide ${slideNumber} ===`)
    console.log('Available files in ZIP:', Object.keys(zip.files).filter(f => f.includes('media') || f.includes('image')))

    // Parse image relationships
    const imageRelMap = new Map<string, string>()
    const relRegex = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g
    let match
    while ((match = relRegex.exec(slideRelsXml)) !== null) {
      imageRelMap.set(match[1], match[2])
      console.log(`Relationship: ${match[1]} -> ${match[2]}`)
    }

    // Load ALL images from relationships (they may be in slide layouts)
    for (const [relId, imagePath] of imageRelMap.entries()) {
      if (!imagePath.includes('media')) continue // Skip non-media files

      console.log(`Processing image from relationship: ${relId} -> ${imagePath}`)

      try {
        // Resolve the relative path from slide folder
        // "../media/image1.png" -> "ppt/media/image1.png"
        const resolvedPath = imagePath.replace(/^\.\.\//, 'ppt/')

        let imageFile = null
        let finalPath = ''

        // Try the resolved path
        if (zip.file(resolvedPath)) {
          imageFile = zip.file(resolvedPath)
          finalPath = resolvedPath
        }

        // Try alternative paths
        if (!imageFile) {
          const filename = imagePath.split('/').pop()
          if (filename) {
            const alternatives = [
              `ppt/media/${filename}`,
              filename,
              `ppt/slides/${filename}`,
            ]
            for (const alt of alternatives) {
              if (zip.file(alt)) {
                imageFile = zip.file(alt)
                finalPath = alt
                break
              }
            }
          }
        }

        // Search all files
        if (!imageFile) {
          const filename = imagePath.split('/').pop()
          if (filename) {
            const allFiles = Object.keys(zip.files)
            const found = allFiles.find((f) => f.endsWith(filename))
            if (found) {
              imageFile = zip.file(found)
              finalPath = found
            }
          }
        }

        if (imageFile) {
          const imageData = await imageFile.async('base64')
          const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
          const mimeType =
            ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : ext === 'png'
              ? 'image/png'
              : ext === 'gif'
              ? 'image/gif'
              : 'image/png'

          // Extract position and size from shapes that use this image
          let x = 0 // percent of slide width
          let y = 0 // percent of slide height
          let width = 100 // percent of slide width
          let height = 100 // percent of slide height
          let zIndex = 1

          // Find all picture shapes that use this image
          const picRegex = /<p:pic>[\s\S]*?<\/p:pic>/g
          let picMatch
          let picIndex = 0
          while ((picMatch = picRegex.exec(slideXml)) !== null) {
            const pic = picMatch[0]
            // Check if this pic uses the current image
            if (pic.includes(`r:embed="${relId}"`) || pic.includes(`r:link="${relId}"`)) {
              picIndex++
              console.log(`Found picture ${picIndex} using image ${relId}`)

              // Extract position from xfrm (transform)
              const xfrmMatch = /<p:xfrm>[\s\S]*?<\/p:xfrm>/.exec(pic)
              if (xfrmMatch) {
                const xfrm = xfrmMatch[0]

                // Extract off (offset) in EMU
                const offMatch = /<a:off x="(\d+)" y="(\d+)"/.exec(xfrm)
                if (offMatch) {
                  const offsetXEmu = parseInt(offMatch[1])
                  const offsetYEmu = parseInt(offMatch[2])
                  // Convert EMU to percentage of slide
                  x = (offsetXEmu / slideWidth) * 100
                  y = (offsetYEmu / slideHeight) * 100
                }

                // Extract ext (extent - size) in EMU
                const extMatch = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(xfrm)
                if (extMatch) {
                  const extXEmu = parseInt(extMatch[1])
                  const extYEmu = parseInt(extMatch[2])
                  // Convert EMU to percentage of slide
                  width = (extXEmu / slideWidth) * 100
                  height = (extYEmu / slideHeight) * 100
                }
              }

              zIndex = picIndex
            }
          }

          console.log(`✓ Loaded image: ${finalPath} at (${x.toFixed(1)}%, ${y.toFixed(1)}%) size ${width.toFixed(1)}% x ${height.toFixed(1)}%`)
          images.push({
            id: relId,
            data: `data:${mimeType};base64,${imageData}`,
            x,
            y,
            width,
            height,
            zIndex,
          })
        } else {
          console.warn(`✗ Could not find image file: ${imagePath}`)
        }
      } catch (err) {
        console.error('Error loading image:', imagePath, err)
      }
    }
    console.log(`Total images loaded from relationships: ${images.length}`)

    // Also try to extract directly referenced images with blip tags
    const imageRegex = /<a:blip[^>]*r:embed="([^"]*)"[^>]*\/>/g
    let blipMatches = 0
    while ((match = imageRegex.exec(slideXml)) !== null) {
      blipMatches++
      const relId = match[1]
      console.log(`Found blip reference: ${relId}`)
      // Already loaded above from relationships
    }
    console.log(`Found ${blipMatches} blip references in slide XML`)

    // Parse text shapes
    const shapeRegex = /<p:sp>[\s\S]*?<\/p:sp>/g
    const shapes = slideXml.match(shapeRegex) || []

    shapes.forEach((shape, shapeIndex) => {
      // Extract paragraphs
      const paragraphRegex = /<a:p>[\s\S]*?<\/a:p>/g
      const paragraphs = shape.match(paragraphRegex) || []

      let shapeTitle = ''
      const isTitle =
        shape.includes('ph type="ctrTitle"') ||
        shape.includes('ph type="title"') ||
        shapeIndex === 0

      paragraphs.forEach((para, paraIndex) => {
        const runs: TextRun[] = []

        // Extract text runs with formatting
        const runRegex = /<a:r>[\s\S]*?<\/a:r>/g
        const matchedRuns = para.match(runRegex) || []

        matchedRuns.forEach((run) => {
          const textMatch = /<a:t>([^<]*)<\/a:t>/.exec(run)
          if (!textMatch) return

          const text = textMatch[1]
          if (!text.trim()) return

          // Parse run properties for formatting
          const rPrMatch = /<a:rPr[^>]*>[\s\S]*?<\/a:rPr>/.exec(run)
          let bold = false
          let italic = false
          let color = '#000000'
          let fontSize = 18

          if (rPrMatch) {
            const rPr = rPrMatch[0]
            bold = rPr.includes('b="1"') || rPr.includes('b="true"')
            italic = rPr.includes('i="1"') || rPr.includes('i="true"')

            // Extract font size (in hundredths of a point)
            const sizeMatch = /sz="(\d+)"/.exec(rPr)
            if (sizeMatch) {
              fontSize = Math.round(parseInt(sizeMatch[1]) / 100)
            }

            // Extract color - try RGB first
            let colorMatch = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(rPr)
            if (colorMatch) {
              color = `#${colorMatch[1]}`
            } else {
              // Try scheme color
              colorMatch = /<a:schemeClr val="([^"]*)"/.exec(rPr)
              if (colorMatch) {
                const schemeColor = colorMatch[1]
                // Map common scheme colors
                const schemeMap: Record<string, string> = {
                  accent1: '#0066cc',
                  accent2: '#ff6600',
                  accent3: '#00cc66',
                  accent4: '#cc0000',
                  accent5: '#006600',
                  accent6: '#cc00cc',
                  lt1: '#ffffff',
                  lt2: '#f0f0f0',
                  dk1: '#000000',
                  dk2: '#333333',
                }
                color = schemeMap[schemeColor] || '#000000'
              }
            }
          }

          runs.push({ text, bold, italic, color, fontSize })
        })

        if (runs.length === 0) return

        // Get paragraph properties for alignment
        const pPrMatch = /<a:pPr[^>]*algn="([^"]*)"/.exec(para)
        const alignment = pPrMatch ? pPrMatch[1] : 'l'

        // Check for bullet
        const isBullet = para.includes('<a:buChar') || para.includes('<a:buFont')
        const levelMatch = /<a:lvl(\d+)/.exec(para)
        const level = levelMatch ? parseInt(levelMatch[1]) : 0

        // Determine text type
        let type: 'title' | 'subtitle' | 'body' | 'text' = 'body'
        if (isTitle && paraIndex === 0) {
          type = 'title'
          shapeTitle = runs.map((r) => r.text).join('')
        } else if (isTitle && paraIndex === 1) {
          type = 'subtitle'
        }

        textElements.push({
          runs,
          type,
          level: isBullet ? level : undefined,
          isBullet,
          alignment,
        })
      })

      if (shapeTitle) {
        title = shapeTitle
      }
    })

    // Fallback parsing if no elements found
    if (textElements.length === 0) {
      const allTextMatches = slideXml.match(/<a:t>([^<]+)<\/a:t>/g) || []
      const allTexts = allTextMatches
        .map((t) => t.replace(/<a:t>|<\/a:t>/g, ''))
        .filter((t) => t.trim())

      if (allTexts.length > 0) {
        title = allTexts[0]
        textElements.push({
          runs: [{ text: title, bold: true }],
          type: 'title',
        })
        allTexts.slice(1).forEach((text) => {
          textElements.push({
            runs: [{ text }],
            type: 'body',
          })
        })
      }
    }

    const fullText = textElements
      .flatMap((el) => el.runs.map((r) => r.text))
      .join('\n')

    return {
      id: `slide${slideNumber}`,
      title,
      textElements: textElements.length > 0 ? textElements : [
        {
          runs: [{ text: 'Click to add text' }],
          type: 'body',
        },
      ],
      images,
      backgroundColor: '#ffffff',
      fullText,
      width: slideWidth,
      height: slideHeight,
    }
  }

  const createDefaultSlides = (): Slide[] => [
    {
      id: '1',
      title: 'Welcome to Your Presentation',
      textElements: [
        {
          runs: [{ text: 'Welcome to Your Presentation', bold: true }],
          type: 'title',
        },
        {
          runs: [{ text: 'Click to add subtitle' }],
          type: 'subtitle',
        },
      ],
      images: [],
      backgroundColor: '#ffffff',
      fullText: 'Welcome to Your Presentation\nClick to add subtitle',
      width: 9144000,
      height: 5143500,
    },
    {
      id: '2',
      title: 'Slide 2 - Content',
      textElements: [
        {
          runs: [{ text: 'Slide 2 - Content', bold: true }],
          type: 'title',
        },
        {
          runs: [{ text: 'First bullet point' }],
          type: 'body',
          level: 0,
          isBullet: true,
        },
        {
          runs: [{ text: 'Second bullet point' }],
          type: 'body',
          level: 0,
          isBullet: true,
        },
        {
          runs: [{ text: 'Sub-bullet point' }],
          type: 'body',
          level: 1,
          isBullet: true,
        },
      ],
      images: [],
      backgroundColor: '#ffffff',
      fullText: 'Slide 2 - Content\nFirst bullet point\nSecond bullet point\nSub-bullet point',
      width: 9144000,
      height: 5143500,
    },
    {
      id: '3',
      title: 'Thank You',
      textElements: [
        {
          runs: [{ text: 'Thank You', bold: true }],
          type: 'title',
        },
        {
          runs: [{ text: 'Questions?' }],
          type: 'subtitle',
        },
      ],
      images: [],
      backgroundColor: '#ffffff',
      fullText: 'Thank You\nQuestions?',
      width: 9144000,
      height: 5143500,
    },
  ]

  const currentSlide = slides[currentPage - 1]
  const currentEditableSlide = editableSlides[currentPage - 1]
  const activeSlide = isObjectEditMode && currentEditableSlide ? currentEditableSlide : currentSlide
  const currentSlideOverlays = overlayTexts.filter((item) => item.slideIndex === currentPage - 1)

  const handleTextElementEdit = (elementIndex: number, text: string) => {
    setSlides((prevSlides) => {
      const slideIndex = currentPage - 1
      if (!prevSlides[slideIndex] || !prevSlides[slideIndex].textElements[elementIndex]) {
        return prevSlides
      }

      const updatedSlides = [...prevSlides]
      const targetSlide = { ...updatedSlides[slideIndex] }
      const textElements = [...targetSlide.textElements]
      const targetElement = { ...textElements[elementIndex] }
      const runs = [...targetElement.runs]

      if (runs.length === 0) {
        runs.push({ text })
      } else {
        runs[0] = { ...runs[0], text }
        if (runs.length > 1) {
          runs.splice(1)
        }
      }

      targetElement.runs = runs
      textElements[elementIndex] = targetElement
      targetSlide.textElements = textElements
      targetSlide.fullText = textElements.flatMap((el) => el.runs.map((r) => r.text)).join('\n')
      updatedSlides[slideIndex] = targetSlide

      setWordCount(targetSlide.fullText.split(/\s+/).filter((w) => w.length > 0).length)
      setCharCount(targetSlide.fullText.length)

      return updatedSlides
    })
  }

  const handleAddSlide = () => {
    setSlides((prevSlides) => {
      const nextPage = prevSlides.length + 1
      const newSlide: Slide = {
        id: `slide-new-${Date.now()}`,
        title: `New Slide ${nextPage}`,
        textElements: [
          { runs: [{ text: 'New Slide Title', bold: true }], type: 'title' },
          { runs: [{ text: 'Click to add text' }], type: 'body' },
        ],
        images: [],
        fullText: 'New Slide Title\nClick to add text',
        backgroundColor: '#ffffff',
        width: 9144000,
        height: 5143500,
      }

      setCurrentPage(nextPage)
      return [...prevSlides, newSlide]
    })
  }

  const handleDeleteSlide = (slideId: string) => {
    setSlides((prevSlides) => {
      const nextSlides = prevSlides.filter((slide) => slide.id !== slideId)
      const nextPage = Math.max(1, Math.min(currentPage, nextSlides.length))
      setCurrentPage(nextPage)
      return nextSlides
    })
  }

  const handleSlideChange = (pageNum: number) => {
    setCurrentPage(pageNum)
    setSelectedImageIndex(null)
    setSelectedOverlayId(null)
    const slideIndex = pageNum - 1
    const slide = slides[slideIndex]
    if (slide) {
      setWordCount(slide.fullText?.split(/\s+/).filter((w: string) => w.length > 0).length || 0)
      setCharCount(slide.fullText?.length || 0)
    }
  }

  const effectiveSlides = slides

  const slideItems: PageRailItem[] = effectiveSlides.map((slide, index) => ({
    id: String(index + 1),
    label: `Slide ${index + 1}`,
    subtitle: slide.title,
    fileType: 'powerpoint',
    pageType: pageOrientation,
    thumbnail: slide.thumbnailData ?? null,
    onClick: () => handleSlideChange(index + 1),
    onDelete: !file.viewOnly ? () => handleDeleteSlide(slide.id) : undefined,
  }))

  const handleReorderSlides = (fromIndex: number, toIndex: number) => {
    const newSlides = [...slides]
    const removedSlides = newSlides.splice(fromIndex, 1)
    newSlides.splice(toIndex, 0, removedSlides[0])

    // Update the file with new order
    setSlides(newSlides)

    // Update current page if needed
    if (currentPage === fromIndex + 1) {
      handleSlideChange(toIndex + 1)
    } else if (currentPage > fromIndex && currentPage <= toIndex) {
      handleSlideChange(currentPage - 1)
    } else if (currentPage >= toIndex && currentPage < fromIndex) {
      handleSlideChange(currentPage + 1)
    }
  }

  const handleTextBoxEdit = (boxIndex: number, text: string) => {
    setEditableSlides((previousSlides) => {
      const slideIndex = currentPage - 1
      const slide = previousSlides[slideIndex]
      const textBox = slide?.textBoxes?.[boxIndex]
      if (!slide || !textBox) return previousSlides

      const nextSlides = [...previousSlides]
      const nextSlide = { ...slide }
      const textBoxes = [...(nextSlide.textBoxes || [])]
      const nextBox = { ...textBox }
      nextBox.runs = [{ ...(nextBox.runs[0] || {}), text }]
      textBoxes[boxIndex] = nextBox
      nextSlide.textBoxes = textBoxes
      nextSlide.fullText = textBoxes.map((box) => runText(box.runs)).join('\n')
      nextSlides[slideIndex] = nextSlide

      setWordCount(nextSlide.fullText.split(/\s+/).filter((word) => word.length > 0).length)
      setCharCount(nextSlide.fullText.length)
      return nextSlides
    })
  }

  const handleDeleteTextBox = (boxIndex: number) => {
    setEditableSlides((previousSlides) => {
      const slideIndex = currentPage - 1
      const slide = previousSlides[slideIndex]
      if (!slide?.textBoxes) return previousSlides

      const nextSlides = [...previousSlides]
      const nextSlide = { ...slide }
      const textBoxes = slide.textBoxes.filter((_, index) => index !== boxIndex)
      nextSlide.textBoxes = textBoxes
      nextSlide.fullText = textBoxes.map((box) => runText(box.runs)).join('\n')
      nextSlides[slideIndex] = nextSlide

      setWordCount(nextSlide.fullText.split(/\s+/).filter((word) => word.length > 0).length)
      setCharCount(nextSlide.fullText.length)
      return nextSlides
    })
  }

  const handleDeleteImage = (imageIndex: number) => {
    setEditableSlides((previousSlides) => {
      const slideIndex = currentPage - 1
      const slide = previousSlides[slideIndex]
      if (!slide) return previousSlides

      const nextSlides = [...previousSlides]
      nextSlides[slideIndex] = {
        ...slide,
        images: slide.images.filter((_, index) => index !== imageIndex),
      }
      return nextSlides
    })
    setSelectedImageIndex(null)
  }

  const beginImageMove = (event: React.PointerEvent<HTMLButtonElement>, imageIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedImageIndex(imageIndex)

    const slideElement = event.currentTarget.closest('[data-ppt-slide="true"]') as HTMLElement | null
    if (!slideElement) return

    const moveImage = (moveEvent: PointerEvent) => {
      const rect = slideElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const x = Math.min(Math.max(((moveEvent.clientX - rect.left) / rect.width) * 100, 0), 100)
      const y = Math.min(Math.max(((moveEvent.clientY - rect.top) / rect.height) * 100, 0), 100)

      setEditableSlides((previousSlides) => {
        const slideIndex = currentPage - 1
        const slide = previousSlides[slideIndex]
        const image = slide?.images[imageIndex]
        if (!slide || !image) return previousSlides

        const nextSlides = [...previousSlides]
        const nextImages = [...slide.images]
        nextImages[imageIndex] = { ...image, x, y }
        nextSlides[slideIndex] = { ...slide, images: nextImages }
        return nextSlides
      })
    }

    const stopMoving = () => {
      window.removeEventListener('pointermove', moveImage)
      window.removeEventListener('pointerup', stopMoving)
    }

    window.addEventListener('pointermove', moveImage)
    window.addEventListener('pointerup', stopMoving)
  }

  const handleSlideCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((!isAddingText && activeTool !== 'text') || file.viewOnly) {
      setSelectedImageIndex(null)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const xRatio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    const yRatio = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1)

    if (isObjectEditMode && currentEditableSlide) {
      const x = xRatio * 100
      const y = yRatio * 100
      setEditableSlides((previousSlides) => {
        const slideIndex = currentPage - 1
        const slide = previousSlides[slideIndex]
        if (!slide) return previousSlides

        const nextSlides = [...previousSlides]
        const nextSlide = { ...slide }
        const textBoxes = [...(nextSlide.textBoxes || [])]
        textBoxes.push({
          runs: [{ text: 'New text', fontSize: textFontSize, color: textColor }],
          type: 'body',
          x,
          y,
          width: 28,
          height: 10,
        })
        nextSlide.textBoxes = textBoxes
        nextSlide.fullText = textBoxes.map((box) => runText(box.runs)).join('\n')
        nextSlides[slideIndex] = nextSlide
        return nextSlides
      })
      setIsAddingText(false)
      return
    }

    const id = `ppt-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    setOverlayTexts((previous) => [
      ...previous,
      {
        id,
        slideIndex: currentPage - 1,
        xRatio,
        yRatio,
        text: 'Edit text',
        fontSize: textFontSize,
        fontFamily: textFontFamily,
        color: textColor,
      },
    ])
    setSelectedOverlayId(id)
    if (isAddingText) {
      setIsAddingText(false)
    }
  }

  const updateOverlayText = (id: string, patch: Partial<PptOverlayText>) => {
    setOverlayTexts((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  useEffect(() => {
    const changed =
      lastToolbarFormatRef.current.textColor !== textColor ||
      lastToolbarFormatRef.current.textFontFamily !== textFontFamily ||
      lastToolbarFormatRef.current.textFontSize !== textFontSize

    lastToolbarFormatRef.current = { textColor, textFontFamily, textFontSize }

    if (changed && selectedOverlayId) {
      updateOverlayText(selectedOverlayId, {
        color: textColor,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
      })
    }
  }, [selectedOverlayId, textColor, textFontFamily, textFontSize])

  const removeOverlayText = (id: string) => {
    setOverlayTexts((previous) => previous.filter((item) => item.id !== id))
    if (selectedOverlayId === id) {
      setSelectedOverlayId(null)
    }
  }

  const handleOverlayTextInput = (id: string, element: HTMLElement) => {
    updateOverlayText(id, { text: element.innerText })
  }

  const beginOverlayMove = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedOverlayId(id)

    const slideElement = event.currentTarget.closest('[data-ppt-slide="true"]') as HTMLElement | null
    if (!slideElement) return

    const moveOverlay = (moveEvent: PointerEvent) => {
      const rect = slideElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      updateOverlayText(id, {
        xRatio: Math.min(Math.max((moveEvent.clientX - rect.left) / rect.width, 0), 1),
        yRatio: Math.min(Math.max((moveEvent.clientY - rect.top) / rect.height, 0), 1),
      })
    }

    const stopMoving = () => {
      window.removeEventListener('pointermove', moveOverlay)
      window.removeEventListener('pointerup', stopMoving)
    }

    window.addEventListener('pointermove', moveOverlay)
    window.addEventListener('pointerup', stopMoving)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isEditingText = activeElement instanceof HTMLElement && activeElement.isContentEditable
      if (isEditingText || file.viewOnly) return
      if (!selectedOverlayId && (!areImagesEditable || selectedImageIndex === null)) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        if (selectedOverlayId) {
          removeOverlayText(selectedOverlayId)
        } else if (areImagesEditable && selectedImageIndex !== null) {
          handleDeleteImage(selectedImageIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [areImagesEditable, file.viewOnly, selectedImageIndex, selectedOverlayId])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading presentation...</p>
        </div>
      </div>
    )
  }

  const isRenderedSlide = Boolean(activeSlide?.imageData) && !isObjectEditMode
  const canObjectEdit = editableSlides.length > 0
  const slideZoom = zoom / 100
  const selectedOverlay = selectedOverlayId
    ? overlayTexts.find((item) => item.id === selectedOverlayId)
    : null

  return (
    <div className="flex-1 flex bg-gray-100 overflow-hidden">
      {/* Main slide view */}
      <div className="flex-1 flex flex-col items-center overflow-auto bg-gray-100 p-2 sm:p-4 md:p-5 relative">
        {/* Mode Toggle Overlay */}
        <div className="absolute left-2 right-2 top-2 z-20 flex flex-wrap justify-end gap-2 sm:left-auto sm:right-5 sm:top-4">
          {!file.viewOnly && (
            <button
              onClick={() => {
                if (canObjectEdit) {
                  setIsObjectEditMode((value) => !value)
                } else {
                  loadEditableSlides(true)
                }
              }}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm transition-all ${
                isObjectEditMode
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              {isLoadingEditable ? 'Loading objects...' : isObjectEditMode ? 'Preview' : 'Edit Objects'}
            </button>
          )}

          {!file.viewOnly && (isRenderedSlide || isObjectEditMode) && (
            <button
              onClick={() => setIsAddingText((value) => !value)}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm transition-all ${
                isAddingText
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <Type size={14} />
              {isAddingText ? 'Click slide' : 'Add Text'}
            </button>
          )}

          {!file.viewOnly && isObjectEditMode && (
            <button
              onClick={() => {
                setAreImagesEditable((value) => !value)
                setSelectedImageIndex(null)
              }}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm transition-all ${
                areImagesEditable
                  ? 'border-amber-500 bg-amber-500 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              {areImagesEditable ? 'Images Editable' : 'Images Locked'}
            </button>
          )}

          {!isRenderedSlide && (
            <button
              onClick={() => toggleViewMode()}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all border ${
                file.viewOnly
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {file.viewOnly ? 'View mode' : 'Edit mode'}
            </button>
          )}
        </div>

        {activeSlide ? (
          <div
            className="bg-white rounded-lg shadow-2xl relative overflow-hidden"
            data-ppt-slide="true"
            onClick={handleSlideCanvasClick}
            style={{
              aspectRatio: pageDimensions.aspectRatio,
              width: `min(${pageDimensions.width}px, calc(100vw - 1rem))`,
              height: `${pageDimensions.height}px`,
              maxWidth: 'none',
              maxHeight: 'none',
              backgroundColor: activeSlide.backgroundColor || '#ffffff',
              transition: 'width 250ms ease, height 250ms ease, aspect-ratio 250ms ease',
            }}
          >
            {isRenderedSlide && activeSlide.imageData ? (
              <>
                <img
                  src={activeSlide.imageData}
                  alt={activeSlide.title}
                  className="h-full w-full object-contain bg-white"
                />
                {currentSlideOverlays.map((overlay) => {
                  const isSelected = selectedOverlayId === overlay.id

                  return (
                    <div
                      key={overlay.id}
                      className="absolute"
                      style={{
                        left: `${overlay.xRatio * 100}%`,
                        top: `${overlay.yRatio * 100}%`,
                        transform: 'translate(-2px, -50%)',
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div
                        contentEditable={!file.viewOnly}
                        suppressContentEditableWarning
                        spellCheck={false}
                        onFocus={() => setSelectedOverlayId(overlay.id)}
                        onClick={() => setSelectedOverlayId(overlay.id)}
                        onInput={(event) => handleOverlayTextInput(overlay.id, event.currentTarget)}
                        className={`min-w-[80px] max-w-[420px] whitespace-pre-wrap px-1 font-semibold leading-tight outline-none ${
                          isSelected ? 'rounded border border-dashed border-red-500 bg-white/15' : ''
                        }`}
                        style={{
                          color: overlay.color,
                          fontSize: `${overlay.fontSize}px`,
                          fontFamily: overlay.fontFamily,
                        }}
                      >
                        {overlay.text}
                      </div>
                      {isSelected && !file.viewOnly && (
                        <div className="absolute -top-7 left-0 flex items-center gap-1 rounded bg-white px-1 py-0.5 shadow">
                          <button
                            onPointerDown={(event) => beginOverlayMove(event, overlay.id)}
                            className="rounded p-1 text-gray-700 hover:bg-gray-100"
                            title="Move text"
                          >
                            <Move size={12} />
                          </button>
                          <button
                            onClick={() => removeOverlayText(overlay.id)}
                            className="rounded bg-red-600 p-1 text-white hover:bg-red-700"
                            title="Delete text"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            ) : isObjectEditMode && currentEditableSlide ? (
              <>
                {currentEditableSlide.images.map((img, idx) => {
                  const isSelected = selectedImageIndex === idx

                  return (
                    <div
                      key={`editable-img-${idx}`}
                      className={`group absolute ${areImagesEditable ? 'pointer-events-auto' : 'pointer-events-none'}`}
                      style={{
                        left: `${img.x || 0}%`,
                        top: `${img.y || 0}%`,
                        width: `${img.width || 15}%`,
                        height: `${img.height || 15}%`,
                        zIndex: img.zIndex || 1,
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (areImagesEditable) {
                          setSelectedImageIndex(idx)
                        }
                      }}
                    >
                      <img
                        src={img.data}
                        alt=""
                        className={`h-full w-full object-contain ${
                          areImagesEditable
                            ? isSelected
                              ? 'outline outline-2 outline-amber-500'
                              : 'outline outline-1 outline-transparent group-hover:outline-amber-400'
                            : ''
                        }`}
                        draggable={false}
                      />
                      {areImagesEditable && isSelected && (
                        <div className="absolute -top-7 left-0 flex items-center gap-1 rounded bg-white px-1 py-0.5 shadow">
                          <button
                            onPointerDown={(event) => beginImageMove(event, idx)}
                            className="rounded p-1 text-gray-700 hover:bg-gray-100"
                            title="Move image"
                          >
                            <Move size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteImage(idx)}
                            className="rounded bg-red-600 p-1 text-white hover:bg-red-700"
                            title="Delete image"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {currentEditableSlide.textBoxes?.map((box, index) => {
                  const text = runText(box.runs)
                  const firstRun = box.runs[0] || {}
                  return (
                    <div
                      key={`textbox-${index}`}
                      className="group absolute z-20 rounded border border-transparent hover:border-red-400 focus-within:border-red-500"
                      style={{
                        left: `${box.x || 0}%`,
                        top: `${box.y || 0}%`,
                        width: `${box.width || 24}%`,
                        minHeight: `${box.height || 8}%`,
                        textAlign:
                          box.alignment === 'ctr'
                            ? 'center'
                            : box.alignment === 'r'
                            ? 'right'
                            : 'left',
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        className="h-full min-h-[24px] w-full whitespace-pre-wrap px-1 py-0.5 outline-none"
                        style={{
                          color: firstRun.color || '#111827',
                          fontSize: `${Math.max(10, Number(firstRun.fontSize || 18))}px`,
                          fontWeight: firstRun.bold ? '700' : '400',
                          fontStyle: firstRun.italic ? 'italic' : 'normal',
                        }}
                        onBlur={(event) => handleTextBoxEdit(index, event.currentTarget.innerText)}
                      >
                        {text}
                      </div>
                      <button
                        onClick={() => handleDeleteTextBox(index)}
                        className="absolute -right-3 -top-3 hidden rounded-full bg-red-600 p-1 text-white shadow hover:bg-red-700 group-hover:block"
                        title="Delete text"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </>
            ) : (
              <>
                {/* Slide header bar */}
                <div className="h-1.5 bg-gradient-to-r from-red-500 via-red-600 to-orange-500"></div>

                {/* Fallback legacy text/image rendering */}
                {activeSlide.images.map((img, idx) => (
                  <img
                    key={`img-${idx}`}
                    src={img.data}
                    alt="slide-image"
                    className="absolute object-contain"
                    style={{
                      left: `${img.x || 0}%`,
                      top: `${img.y || 0}%`,
                      width: `${img.width || 15}%`,
                      height: `${img.height || 15}%`,
                      zIndex: img.zIndex || 1,
                    }}
                    onError={(e) => {
                      console.error('Image failed to load:', img.id, e)
                    }}
                  />
                ))}

                <div className="absolute inset-0 z-10">
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      padding: `${slideContentBox.top}px ${slideContentBox.right}px ${slideContentBox.bottom}px ${slideContentBox.left}px`,
                      columnCount: pageColumns,
                      columnGap: pageColumns > 1 ? '32px' : '0px',
                    }}
                  >
                    {activeSlide.textElements.map((textElement, index) => (
                      <div
                        key={index}
                        className={`${
                          textElement.type === 'title'
                            ? 'mb-6'
                            : textElement.type === 'subtitle'
                            ? 'mb-4'
                            : 'mb-3'
                        }`}
                        style={{
                          paddingLeft: textElement.isBullet
                            ? `${(textElement.level || 0) * 24 + 16}px`
                            : '0',
                          textAlign:
                            textElement.alignment === 'ctr'
                              ? 'center'
                              : textElement.alignment === 'r'
                              ? 'right'
                              : 'left',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {textElement.isBullet && (
                            <span className="flex-shrink-0 mt-2">
                              {textElement.level === 0 ? '•' : textElement.level === 1 ? '◦' : '▪'}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            {textElement.type === 'title' && (
                              <h1
                                contentEditable={!file.viewOnly}
                                suppressContentEditableWarning
                                onBlur={(e) => handleTextElementEdit(index, e.currentTarget.textContent || '')}
                                className={file.viewOnly ? '' : (activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image' ? 'cursor-crosshair' : 'cursor-text')}
                                style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937', lineHeight: '1.2', wordWrap: 'break-word' }}
                              >
                                {textElement.runs.map((run, ridx) => (
                                  <span
                                    key={ridx}
                                    style={{
                                      color: run.color || '#1f2937',
                                      fontWeight: run.bold ? 'bold' : 'normal',
                                      fontStyle: run.italic ? 'italic' : 'normal',
                                      fontSize: run.fontSize ? `${run.fontSize * 0.7}px` : 'inherit',
                                    }}
                                  >
                                    {run.text}
                                  </span>
                                ))}
                              </h1>
                            )}
                            {textElement.type === 'subtitle' && (
                              <h2
                                contentEditable={!file.viewOnly}
                                suppressContentEditableWarning
                                onBlur={(e) => handleTextElementEdit(index, e.currentTarget.textContent || '')}
                                className={file.viewOnly ? '' : (activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image' ? 'cursor-crosshair' : 'cursor-text')}
                                style={{ fontSize: '1.5rem', fontWeight: '600', color: '#374151', lineHeight: '1.3', wordWrap: 'break-word' }}
                              >
                                {textElement.runs.map((run, ridx) => (
                                  <span
                                    key={ridx}
                                    style={{
                                      color: run.color || '#374151',
                                      fontWeight: run.bold ? 'bold' : 'normal',
                                      fontStyle: run.italic ? 'italic' : 'normal',
                                      fontSize: run.fontSize ? `${run.fontSize * 0.7}px` : 'inherit',
                                    }}
                                  >
                                    {run.text}
                                  </span>
                                ))}
                              </h2>
                            )}
                            {textElement.type !== 'title' && textElement.type !== 'subtitle' && (
                              <p
                                contentEditable={!file.viewOnly}
                                suppressContentEditableWarning
                                onBlur={(e) => handleTextElementEdit(index, e.currentTarget.textContent || '')}
                                className={file.viewOnly ? '' : (activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image' ? 'cursor-crosshair' : 'cursor-text')}
                                style={{ fontSize: '1rem', color: '#1f2937', lineHeight: '1.5', fontWeight: 'normal', wordWrap: 'break-word' }}
                              >
                                {textElement.runs.map((run, ridx) => (
                                  <span
                                    key={ridx}
                                    style={{
                                      color: run.color || '#1f2937',
                                      fontWeight: run.bold ? 'bold' : 'normal',
                                      fontStyle: run.italic ? 'italic' : 'normal',
                                      fontSize: run.fontSize ? `${run.fontSize * 0.7}px` : 'inherit',
                                    }}
                                  >
                                    {run.text}
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {(pageMarginPreset !== 'normal' || pageColumns > 1) && (
              <div
                className="pointer-events-none absolute border border-dashed border-red-300/70"
                style={{
                  left: `${slideContentBox.left}px`,
                  right: `${slideContentBox.right}px`,
                  top: `${slideContentBox.top}px`,
                  bottom: `${slideContentBox.bottom}px`,
                }}
              >
                {pageColumns > 1 && Array.from({ length: pageColumns - 1 }, (_, index) => (
                  <span
                    key={index}
                    className="absolute top-0 h-full border-l border-dashed border-red-300/70"
                    style={{ left: `${((index + 1) / pageColumns) * 100}%` }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-600">No slides available</div>
        )}

        {/* Navigation controls */}
        {currentSlide && (
          <EditorNavigation
            current={currentPage}
            total={slides.length}
            onPrevious={() => handleSlideChange(Math.max(1, currentPage - 1))}
            onNext={() => handleSlideChange(Math.min(slides.length, currentPage + 1))}
            accentColor="#c2410c"
            className="sticky bottom-0 z-20 mt-4 border-t border-gray-200 bg-white/95 backdrop-blur"
          />
        )}

        {selectedOverlayId && !file.viewOnly && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Font
              <select
                value={selectedOverlay?.fontFamily || 'Calibri'}
                onChange={(event) => updateOverlayText(selectedOverlayId, { fontFamily: event.target.value })}
                className="w-36 rounded border px-2 py-1"
              >
                {EDITOR_FONT_FAMILIES.map((font) => (
                  <option key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Size
              <select
                value={selectedOverlay?.fontSize || 24}
                onChange={(event) =>
                  updateOverlayText(selectedOverlayId, {
                    fontSize: parseInt(event.target.value, 10),
                  })
                }
                className="w-20 rounded border px-2 py-1"
              >
                {EDITOR_FONT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Color
              <input
                type="color"
                value={selectedOverlay?.color || '#111827'}
                onChange={(event) => updateOverlayText(selectedOverlayId, { color: event.target.value })}
                className="h-8 w-10 rounded border p-0"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {EDITOR_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => updateOverlayText(selectedOverlayId, { color })}
                  className="h-6 w-6 rounded border border-gray-300 shadow-sm"
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={color}
                />
              ))}
            </div>
            <button
              onClick={() => removeOverlayText(selectedOverlayId)}
              className="flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <Trash2 size={14} />
              Delete Text
            </button>
          </div>
        )}
      </div>

      <PageRail
        title="SCREENS"
        items={slideItems}
        activeId={String(currentPage)}
        accentColor="#dc2626"
        side="right"
        onReorder={!file.viewOnly ? handleReorderSlides : undefined}
        footer={!file.viewOnly && !isRenderedSlide && (
          <button
            onClick={handleAddSlide}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-red-500 hover:text-red-500 transition-all font-medium text-xs bg-white"
          >
            <Plus size={14} />
            Add New Slide
          </button>
        )}
      />
    </div>
  )
}
