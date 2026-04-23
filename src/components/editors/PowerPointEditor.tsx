import { useEffect, useState } from 'react'
import { DocumentFile, useDocumentStore } from '../../store'
import JSZip from 'jszip'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PageRail, { type PageRailItem } from '../PageRail.tsx'

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

interface PowerPointEditorProps {
  file: DocumentFile
}

export default function PowerPointEditor({ file }: PowerPointEditorProps) {
  const [slides, setSlides] = useState<Slide[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const currentPage = useDocumentStore((state) => state.currentPage)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)
  const setWordCount = useDocumentStore((state) => state.setWordCount)
  const setCharCount = useDocumentStore((state) => state.setCharCount)
  const activeTool = useDocumentStore((state) => state.activeTool)

  useEffect(() => {
    const loadPPTX = async () => {
      try {
        setIsLoading(true)
        
        // If Flask already parsed the slides, use them directly
        if (file.slides && file.slides.length > 0) {
          setSlides(file.slides)
          setIsLoading(false)
          
          // Update word/char count from first slide
          if (file.slides.length > 0) {
            const firstSlide = file.slides[0]
            setWordCount(firstSlide.fullText?.split(/\s+/).filter((w: string) => w.length > 0).length || 0)
            setCharCount(firstSlide.fullText?.length || 0)
          }
          return
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

  const handleSlideChange = (pageNum: number) => {
    setCurrentPage(pageNum)
    if (slides[pageNum - 1]) {
      const slide = slides[pageNum - 1]
      setWordCount(slide.fullText.split(/\s+/).filter((w) => w.length > 0).length)
      setCharCount(slide.fullText.length)
    }
  }

  const slideItems: PageRailItem[] = slides.map((slide, index) => ({
    id: String(index + 1),
    label: `Slide ${index + 1}`,
    subtitle: slide.title,
    thumbnail: slide.thumbnailData ?? null,
    onClick: () => handleSlideChange(index + 1),
  }))

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

  return (
    <div className="flex-1 flex bg-gray-100 overflow-hidden">
      <PageRail
        title="SLIDES"
        items={slideItems}
        activeId={String(currentPage)}
        accentColor="#dc2626"
      />

      {/* Main slide view */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-auto bg-gray-100 p-6">
        {currentSlide ? (
          <div
            className="bg-white rounded-lg shadow-2xl flex flex-col relative overflow-hidden"
            style={{
              aspectRatio: '16 / 9',
              width: '1000px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              backgroundColor: currentSlide.backgroundColor || '#ffffff',
            }}
          >
            {currentSlide.imageData ? (
              <img
                src={currentSlide.imageData}
                alt={currentSlide.title}
                className="absolute inset-0 w-full h-full object-contain bg-white"
              />
            ) : (
              <>
                {/* Slide header bar */}
                <div className="h-1.5 bg-gradient-to-r from-red-500 via-red-600 to-orange-500"></div>

                {/* Fallback legacy text/image rendering */}
                {currentSlide.images.map((img, idx) => (
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

                <div className="absolute inset-0 z-10 pointer-events-none">
                  <div className="absolute inset-0 px-12 py-10 overflow-hidden">
                    {currentSlide.textElements.map((textElement, index) => (
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
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => handleTextElementEdit(index, e.currentTarget.textContent || '')}
                                className={activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image' ? 'cursor-crosshair' : 'cursor-text'}
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
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => handleTextElementEdit(index, e.currentTarget.textContent || '')}
                                className={activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image' ? 'cursor-crosshair' : 'cursor-text'}
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
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => handleTextElementEdit(index, e.currentTarget.textContent || '')}
                                className={activeTool === 'draw' || activeTool === 'shape' || activeTool === 'image' ? 'cursor-crosshair' : 'cursor-text'}
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

            {/* Slide footer */}
            <div className="border-t border-gray-200 px-12 py-4 text-right text-sm text-gray-500 bg-gradient-to-r from-gray-50 to-white">
              Slide {currentPage} of {slides.length}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-600">No slides available</div>
        )}

        {/* Navigation controls */}
        {currentSlide && (
          <div className="flex gap-3 mt-8">
            <button
              onClick={() => handleSlideChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all text-white font-medium text-sm shadow-md hover:shadow-lg"
              title="Previous slide"
            >
              <ChevronLeft size={18} />
              Previous
            </button>
            <span className="px-4 py-2.5 bg-gray-200 rounded-lg font-medium text-sm text-gray-700">
              {currentPage} / {slides.length}
            </span>
            <button
              onClick={() => handleSlideChange(Math.min(slides.length, currentPage + 1))}
              disabled={currentPage === slides.length}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all text-white font-medium text-sm shadow-md hover:shadow-lg"
              title="Next slide"
            >
              Next
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
