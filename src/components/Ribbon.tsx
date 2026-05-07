import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useDocumentStore } from '../store'
import { getThemeForFileType } from '../utils'
import {
  EDITOR_FONT_FAMILIES,
  EDITOR_FONT_SIZES,
  EDITOR_STANDARD_COLORS,
  EDITOR_THEME_COLOR_COLUMNS,
} from '../editorOptions'
import {
  ArrowLeft,
  DoorOpen,
  FilePlus,
  FileX,
  Home,
  Save,
  SaveAll,
  FolderOpen,
  Download,
  MousePointer2,
  Square,
  Image,
  PenTool,
  Type,
  Eraser,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Replace,
  Search,
  ChevronDown,
  Printer,
  RotateCcw,
  RotateCw,
  Move,
  RefreshCw,
  Info,
  Share2,
  Palette,
} from 'lucide-react'
import backIcon from '../assets/Back.png'

export interface RibbonActions {
  onSave?: () => void | Promise<void>
  onSaveAs?: () => void | Promise<void>
  onOpen?: () => void
  onExport?: () => void | Promise<void>
  onPrint?: () => void | Promise<void>
  onZoomIn?: () => void
  onZoomOut?: () => void
  onToggleBold?: () => void
  onToggleItalic?: () => void
  onToggleUnderline?: () => void
  onAlignLeft?: () => void
  onAlignCenter?: () => void
  onAlignRight?: () => void
  onAlignJustify?: () => void
  onSetFontFamily?: (font: string) => void
  onSetFontSize?: (size: number) => void
  onSetColor?: (color: string) => void
  onFind?: () => void
  onReplace?: () => void
  onSetTool?: (tool: 'select' | 'shape' | 'image' | 'draw' | 'text' | 'erase') => void
  onSetLanguage?: (language: string) => void
  onBack?: () => void
  onLogout?: () => void
  // Image-specific actions
  onRotateLeft?: () => void
  onRotateRight?: () => void
  onResetRotation?: () => void
  onTogglePan?: () => void
  onResetPosition?: () => void
  isPanActive?: boolean
}

interface RibbonProps {
  fileType?: string | null
  actions?: RibbonActions
  themeColorOverride?: string
}

export default function Ribbon({ fileType, actions, themeColorOverride }: RibbonProps) {
  const [showFileMenu, setShowFileMenu] = useState(false)
  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
  })
  const toggleDarkMode = useDocumentStore((state) => state.toggleDarkMode)
  const darkMode = useDocumentStore((state) => state.darkMode)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const selectedLanguage = useDocumentStore((state) => state.selectedLanguage)
  const setSelectedLanguage = useDocumentStore((state) => state.setSelectedLanguage)

  const themeColor = themeColorOverride || (fileType
    ? getThemeForFileType(fileType as any)
    : '#217346')

  const modeLabel =
    !fileType
      ? 'Home mode'
      :
    fileType === 'pptx'
      ? 'PowerPoint mode'
      : fileType === 'pdf'
      ? 'PDF mode'
      : fileType === 'xlsx'
      ? 'Excel mode'
      : fileType === 'image'
      ? 'Image mode'
      : 'Word mode'

  const handlePrint = () => {
    if (actions?.onPrint) {
      actions.onPrint()
    } else {
      window.print()
    }
  }

  useEffect(() => {
    const updateFormatState = () => {
      setFormatState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      })
    }

    document.addEventListener('selectionchange', updateFormatState)
    updateFormatState()
    return () => document.removeEventListener('selectionchange', updateFormatState)
  }, [])

  return (
    <div className="relative border-b border-gray-300 bg-white shadow-sm" data-print-hidden="true">
      <div className="flex items-center justify-between gap-3 bg-[#f3f4f6] px-4 py-1.5 text-[11px] text-gray-600">
        <div className="flex items-center gap-2 font-medium">
          <Home size={14} />
          <span>{modeLabel}</span>
        </div>
        <button
          onClick={toggleDarkMode}
          className="rounded px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-white hover:shadow-sm"
          title="Toggle dark mode"
        >
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </div>

      <div className="flex items-stretch gap-0 overflow-x-auto px-2 py-2 text-white" style={{ backgroundColor: themeColor }}>
        <button
          onClick={() => setShowFileMenu(true)}
          className="mx-1 flex min-h-[76px] w-[74px] shrink-0 flex-col items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-white/20"
        >
          File
        </button>

        {/* Image Controls - only show when file is image */}
        {fileType === 'image' && (
          <RibbonGroup label="Image">
            <RibbonButton 
              icon={<RotateCcw size={18} />} 
              label="Rotate Left" 
              onClick={actions?.onRotateLeft} 
              disabled={!actions?.onRotateLeft} 
            />
            <RibbonButton 
              icon={<RotateCw size={18} />} 
              label="Rotate Right" 
              onClick={actions?.onRotateRight} 
              disabled={!actions?.onRotateRight} 
            />
            <RibbonButton 
              icon={<Move size={18} />} 
              label="Pan" 
              onClick={actions?.onTogglePan}
              active={actions?.isPanActive}
              disabled={!actions?.onTogglePan}
            />
            <RibbonButton 
              icon={<RefreshCw size={18} />} 
              label="Reset View" 
              onClick={actions?.onResetPosition} 
              disabled={!actions?.onResetPosition} 
            />
          </RibbonGroup>
        )}

        <RibbonGroup label="Tools">
          <RibbonButton icon={<MousePointer2 size={18} />} label="Select" active={activeTool === 'select'} onClick={() => { setActiveTool('select'); actions?.onSetTool?.('select') }} />
          <RibbonButton icon={<Square size={18} />} label="Shape" active={activeTool === 'shape'} onClick={() => { setActiveTool('shape'); actions?.onSetTool?.('shape') }} />
          <RibbonButton icon={<Image size={18} />} label="Image" active={activeTool === 'image'} onClick={() => { setActiveTool('image'); actions?.onSetTool?.('image') }} />
          <RibbonButton icon={<PenTool size={18} />} label="Draw" active={activeTool === 'draw'} onClick={() => { setActiveTool('draw'); actions?.onSetTool?.('draw') }} />
          <RibbonButton icon={<Type size={18} />} label="Text" active={activeTool === 'text'} onClick={() => { setActiveTool('text'); actions?.onSetTool?.('text') }} />
          <RibbonButton icon={<Eraser size={18} />} label="Erase" active={activeTool === 'erase'} onClick={() => { setActiveTool('erase'); actions?.onSetTool?.('erase') }} />
        </RibbonGroup>

        <RibbonGroup label="Font">
          <div className="flex items-center gap-2">
            <select
              defaultValue="Calibri"
              onChange={(e) => actions?.onSetFontFamily?.(e.target.value)}
              className="h-8 w-36 rounded-md border border-white/20 bg-white/95 px-2 text-[11px] text-gray-800 outline-none"
            >
              {EDITOR_FONT_FAMILIES.map((font) => (
                <option key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </option>
              ))}
            </select>
            <select
              defaultValue="16"
              onChange={(e) => actions?.onSetFontSize?.(parseInt(e.target.value, 10))}
              className="h-8 w-16 rounded-md border border-white/20 bg-white/95 px-2 text-[11px] text-gray-800 outline-none"
            >
              {EDITOR_FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <RibbonButton icon={<Bold size={16} />} label="Bold" compact active={formatState.bold} onClick={actions?.onToggleBold} disabled={!actions?.onToggleBold} />
            <RibbonButton icon={<Italic size={16} />} label="Italic" compact active={formatState.italic} onClick={actions?.onToggleItalic} disabled={!actions?.onToggleItalic} />
            <RibbonButton icon={<Underline size={16} />} label="Underline" compact active={formatState.underline} onClick={actions?.onToggleUnderline} disabled={!actions?.onToggleUnderline} />
          </div>
          <div className="mt-1 flex items-center gap-1">
            <RibbonButton icon={<AlignLeft size={16} />} label="Left" compact onClick={actions?.onAlignLeft} disabled={!actions?.onAlignLeft} />
            <RibbonButton icon={<AlignCenter size={16} />} label="Center" compact onClick={actions?.onAlignCenter} disabled={!actions?.onAlignCenter} />
            <RibbonButton icon={<AlignRight size={16} />} label="Right" compact onClick={actions?.onAlignRight} disabled={!actions?.onAlignRight} />
            <RibbonButton icon={<AlignJustify size={16} />} label="Justify" compact onClick={actions?.onAlignJustify} disabled={!actions?.onAlignJustify} />
          </div>
        </RibbonGroup>

        <RibbonGroup label="Colors">
          <OfficeColorPicker onSetColor={actions?.onSetColor} themeColor={themeColor} />
        </RibbonGroup>

        <RibbonGroup label="Find & Replace">
          <RibbonButton icon={<Replace size={18} />} label="Replace" onClick={actions?.onReplace} disabled={!actions?.onReplace} />
          <RibbonButton icon={<Search size={18} />} label="Find" onClick={actions?.onFind} disabled={!actions?.onFind} />
        </RibbonGroup>

        <RibbonGroup label="Language">
          <select
            value={selectedLanguage}
            onChange={(e) => {
              setSelectedLanguage(e.target.value)
              actions?.onSetLanguage?.(e.target.value)
            }}
            className="h-10 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-medium text-white outline-none hover:bg-white/20"
          >
            <option className="text-gray-800">English</option>
            <option className="text-gray-800">Arabic</option>
            <option className="text-gray-800">French</option>
            <option className="text-gray-800">Spanish</option>
          </select>
        </RibbonGroup>

        <RibbonGroup label="Clear" alignRight>
          <button onClick={actions?.onBack} className="flex flex-col items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 py-2 h-10 w-10 hover:bg-white/20">
            <img src={backIcon} alt="Back" className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium text-white">Back</span>
          </button>
        </RibbonGroup>

        <RibbonGroup label="Account" alignRight>
          <button onClick={actions?.onLogout} className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-medium hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40" disabled={!actions?.onLogout}>
            <DoorOpen size={16} />
            Exit
          </button>
        </RibbonGroup>
      </div>

      {showFileMenu && (
        <FileMenu
          actions={actions}
          onPrint={handlePrint}
          onClose={() => setShowFileMenu(false)}
          themeColor={themeColor}
        />
      )}
    </div>
  )
}
function OfficeColorPicker({
  onSetColor,
  themeColor,
}: {
  onSetColor?: (color: string) => void
  themeColor: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedColor, setSelectedColor] = useState('#111827')
  const [highContrastOnly, setHighContrastOnly] = useState(false)
  const [showCustomColorDialog, setShowCustomColorDialog] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelColor = mixHexColor(themeColor, '#000000', 0.18)
  const panelBorderColor = mixHexColor(themeColor, '#ffffff', 0.24)
  const dividerColor = mixHexColor(themeColor, '#ffffff', 0.16)
  const selectedSolidColor = getFirstHexColor(selectedColor)
  const themedColumns = [
    buildThemeColorColumn(themeColor),
    ...EDITOR_THEME_COLOR_COLUMNS,
  ].slice(0, 10)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    setMenuPosition({
      left: Math.max(8, Math.min(rect?.left || 0, window.innerWidth - 352)),
      top: (rect?.bottom || 0) + 6,
    })
    setIsOpen((value) => !value)
  }

  const chooseColor = (color: string) => {
    setSelectedColor(color)
    setShowCustomColorDialog(false)
    onSetColor?.(color)
    setIsOpen(false)
  }

  const openCustomColorDialog = () => {
    setIsOpen(false)
    setShowCustomColorDialog(true)
  }

  return (
    <div>
      <button
        ref={buttonRef}
        onMouseDown={(event) => event.preventDefault()}
        onClick={openMenu}
        className="flex h-12 min-w-[78px] items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2 text-white hover:bg-white/20"
        title="Text color"
      >
        <span className="relative flex h-8 w-8 items-center justify-center">
          <span className="text-lg font-semibold leading-none">A</span>
          <span
            className="absolute bottom-0 h-1 w-6 rounded-sm"
            style={isGradientColor(selectedColor) ? { background: selectedColor } : { backgroundColor: selectedColor }}
          />
        </span>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close color menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 w-[344px] max-w-[calc(100vw-16px)] rounded-sm border text-white shadow-2xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
              backgroundColor: panelColor,
              borderColor: panelBorderColor,
            }}
          >
            <div className="h-1" style={{ backgroundColor: themeColor }} />
            <div
              className="flex items-center justify-end gap-2 border-b px-3 py-2 text-sm"
              style={{ borderColor: dividerColor }}
            >
              <span>Contraste eleve uniquement</span>
              <button
                onClick={() => setHighContrastOnly((value) => !value)}
                className={`relative h-6 w-12 rounded-full border transition-colors ${
                  highContrastOnly ? 'border-white' : 'border-white/80 bg-transparent'
                }`}
                style={highContrastOnly ? { backgroundColor: themeColor } : undefined}
                title="High contrast only"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    highContrastOnly ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseColor('#000000')}
              className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm hover:bg-white/10"
              style={{ borderColor: dividerColor }}
            >
              <span className="h-5 w-5 border border-white/35 bg-black" />
              Automatique
            </button>

            <div className="px-4 py-3">
              <div className="mb-2 text-sm font-semibold">Couleurs du theme</div>
              <div className="grid grid-cols-10 gap-x-1 gap-y-2">
                {themedColumns.map((column, columnIndex) => (
                  <div key={columnIndex} className="flex flex-col gap-1">
                    {column.map((color, shadeIndex) => (
                      <ColorChoice
                        key={`${color}-${shadeIndex}`}
                        color={color}
                        onClick={() => chooseColor(color)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-3 border-t" style={{ borderColor: dividerColor }} />

            <div className="px-4 py-3">
              <div className="mb-2 text-sm font-semibold">Couleurs standard</div>
              <div className="grid grid-cols-10 gap-1">
                {EDITOR_STANDARD_COLORS.map((color) => (
                  <ColorChoice key={color} color={color} onClick={() => chooseColor(color)} />
                ))}
              </div>
            </div>

            <div className="border-t py-1" style={{ borderColor: dividerColor }}>
              <label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm hover:bg-white/10">
                <Palette size={18} className="text-cyan-300" />
                Autres couleurs...
                <input
                  type="color"
                  className="sr-only"
                  value={selectedSolidColor}
                  onChange={(event) => chooseColor(event.target.value)}
                />
              </label>
              <button
                onClick={openCustomColorDialog}
                className="flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 border border-white/45"
                    style={{
                      background: `linear-gradient(135deg, #ffffff, ${themeColor}, ${mixHexColor(themeColor, '#000000', 0.34)})`,
                    }}
                  />
                  Degrade
                </span>
                <ChevronDown size={15} className="-rotate-90" />
              </button>
            </div>
          </div>
        </>
      )}

      {showCustomColorDialog && (
        <CustomColorDialog
          currentColor={selectedSolidColor}
          themeColor={themeColor}
          onCancel={() => setShowCustomColorDialog(false)}
          onApply={chooseColor}
        />
      )}
    </div>
  )
}
function ColorChoice({
  color,
  onClick,
}: {
  color: string
  onClick: () => void
}) {
  return (
    <button
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="h-7 w-7 border border-white/30 shadow-sm transition-transform hover:scale-110 hover:border-white focus:outline-none focus:ring-1 focus:ring-white"
      style={{ backgroundColor: color }}
      title={color}
      aria-label={color}
    />
  )
}

function CustomColorDialog({
  currentColor,
  themeColor,
  onApply,
  onCancel,
}: {
  currentColor: string
  themeColor: string
  onApply: (color: string) => void
  onCancel: () => void
}) {
  const initialColor = normalizeHexColor(currentColor)
  const [draftColor, setDraftColor] = useState(initialColor)
  const [hexInput, setHexInput] = useState(initialColor.toUpperCase())
  const [hsv, setHsv] = useState(() => hexToHsv(initialColor))
  const spectrumRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)
  const rgb = hexToRgb(draftColor)
  const dialogAccent = normalizeHexColor(themeColor)
  const dialogAccentDark = mixHexColor(dialogAccent, '#000000', 0.28)
  const dialogPanelTint = mixHexColor(dialogAccent, '#ffffff', 0.94)

  const setColorFromHex = (color: string) => {
    const normalized = normalizeHexColor(color)
    setDraftColor(normalized)
    setHexInput(normalized.toUpperCase())
    setHsv(hexToHsv(normalized))
  }

  const setColorFromHsv = (nextHsv: { h: number; s: number; v: number }) => {
    const clampedHsv = {
      h: clampNumber(nextHsv.h, 0, 360),
      s: clampNumber(nextHsv.s, 0, 100),
      v: clampNumber(nextHsv.v, 0, 100),
    }
    const nextColor = hsvToHex(clampedHsv)
    setHsv(clampedHsv)
    setDraftColor(nextColor)
    setHexInput(nextColor.toUpperCase())
  }

  const updateSpectrumFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = spectrumRef.current?.getBoundingClientRect()
    if (!rect) return

    const saturation = clampNumber(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
    const value = clampNumber(100 - ((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    setColorFromHsv({ ...hsv, s: saturation, v: value })
  }

  const updateHueFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = hueRef.current?.getBoundingClientRect()
    if (!rect) return

    const hue = clampNumber(((event.clientY - rect.top) / rect.height) * 360, 0, 360)
    setColorFromHsv({ ...hsv, h: hue })
  }

  const updateRgbChannel = (channel: 'r' | 'g' | 'b', value: string) => {
    const nextRgb = {
      ...rgb,
      [channel]: clampNumber(Number.parseInt(value, 10) || 0, 0, 255),
    }
    setColorFromHex(rgbToHex(nextRgb))
  }

  const updateHexInput = (value: string) => {
    const clean = value.replace(/[^#0-9a-fA-F]/g, '').replace(/(?!^)#/g, '').slice(0, 7)
    const nextValue = clean.startsWith('#') ? clean : `#${clean}`
    setHexInput(nextValue.toUpperCase())

    if (/^#[0-9a-fA-F]{6}$/.test(nextValue) || /^#[0-9a-fA-F]{3}$/.test(nextValue)) {
      setColorFromHex(nextValue)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/15 p-3"
      onMouseDown={onCancel}
    >
      <div
        className="w-[435px] max-w-[calc(100vw-24px)] overflow-hidden rounded-md border bg-[#f1f1f1] text-gray-950 shadow-2xl"
        style={{ borderColor: dialogAccentDark }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex h-9 items-center justify-between px-3 text-sm text-white"
          style={{ backgroundColor: dialogAccent }}
        >
          <span>Couleurs</span>
          <div className="flex items-center gap-5 text-lg leading-none">
            <span className="text-white/80">-</span>
            <span className="text-sm">[]</span>
            <button className="text-lg leading-none" onClick={onCancel} title="Fermer">
              X
            </button>
          </div>
        </div>

        <div className="flex gap-3 p-3">
          <div
            className="min-w-0 flex-1 border bg-[#f7f7f7]"
            style={{ borderColor: mixHexColor(dialogAccent, '#ffffff', 0.58) }}
          >
            <div
              className="flex border-b text-xs"
              style={{ borderColor: mixHexColor(dialogAccent, '#ffffff', 0.58) }}
            >
              <button
                className="border-r bg-white px-4 py-2"
                style={{
                  borderColor: mixHexColor(dialogAccent, '#ffffff', 0.58),
                  color: dialogAccentDark,
                }}
              >
                Standard
              </button>
              <button
                className="px-4 py-2"
                style={{ backgroundColor: dialogPanelTint, color: dialogAccentDark }}
              >
                Personnalisees
              </button>
            </div>

            <div className="p-3">
              <div className="mb-1 text-xs underline">Couleurs :</div>
              <div className="flex items-start gap-3">
                <div
                  ref={spectrumRef}
                  className="relative h-[145px] w-[222px] cursor-crosshair border border-gray-400"
                  style={{
                    background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, hsl(${hsv.h}, 100%, 50%))`,
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    updateSpectrumFromPointer(event)
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons === 1) updateSpectrumFromPointer(event)
                  }}
                >
                  <span
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-2xl font-bold leading-none text-black"
                    style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
                  >
                    +
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <div
                    ref={hueRef}
                    className="relative h-[145px] w-3 cursor-pointer border border-gray-300"
                    style={{
                      background: 'linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      updateHueFromPointer(event)
                    }}
                    onPointerMove={(event) => {
                      if (event.buttons === 1) updateHueFromPointer(event)
                    }}
                  >
                    <span
                      className="absolute -right-3 h-0 w-0 border-y-[5px] border-r-[7px] border-y-transparent border-r-black"
                      style={{ top: `calc(${(hsv.h / 360) * 100}% - 5px)` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-[125px_82px] items-center gap-x-2 gap-y-1 text-xs">
                <label>Palette de couleurs :</label>
                <select
                  className="h-7 border bg-white px-2"
                  style={{ borderColor: mixHexColor(dialogAccent, '#000000', 0.12) }}
                >
                  <option>RVB</option>
                </select>

                <label>Rouge :</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb.r}
                  onChange={(event) => updateRgbChannel('r', event.target.value)}
                  className="h-7 border bg-white px-2"
                  style={{ borderColor: mixHexColor(dialogAccent, '#000000', 0.12) }}
                />

                <label>Vert :</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb.g}
                  onChange={(event) => updateRgbChannel('g', event.target.value)}
                  className="h-7 border bg-white px-2"
                  style={{ borderColor: mixHexColor(dialogAccent, '#000000', 0.12) }}
                />

                <label>Bleu :</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb.b}
                  onChange={(event) => updateRgbChannel('b', event.target.value)}
                  className="h-7 border bg-white px-2"
                  style={{ borderColor: mixHexColor(dialogAccent, '#000000', 0.12) }}
                />

                <label>Hex :</label>
                <input
                  type="text"
                  value={hexInput}
                  onChange={(event) => updateHexInput(event.target.value)}
                  className="h-7 border bg-white px-2 uppercase"
                  style={{ borderColor: mixHexColor(dialogAccent, '#000000', 0.12) }}
                />
              </div>
            </div>
          </div>

          <div className="flex w-[112px] flex-col items-stretch gap-3">
            <button
              className="h-8 rounded border text-sm font-medium text-white shadow-sm"
              style={{ borderColor: dialogAccentDark, backgroundColor: dialogAccent }}
              onClick={() => onApply(draftColor)}
            >
              OK
            </button>
            <button
              className="h-8 rounded border bg-white text-sm hover:bg-gray-100"
              style={{ borderColor: mixHexColor(dialogAccent, '#000000', 0.12), color: dialogAccentDark }}
              onClick={onCancel}
            >
              Annuler
            </button>

            <div className="mt-auto flex flex-col items-center gap-2 pb-1 text-xs">
              <span>Nouvelle</span>
              <div
                className="h-16 w-16 overflow-hidden border"
                style={{ borderColor: dialogAccentDark }}
              >
                <div className="h-1/2" style={{ backgroundColor: draftColor }} />
                <div className="h-1/2" style={{ backgroundColor: currentColor }} />
              </div>
              <span>Actuelle</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildThemeColorColumn(color: string) {
  const hex = normalizeHexColor(color)
  return [
    mixHexColor(hex, '#ffffff', 0.92),
    mixHexColor(hex, '#ffffff', 0.68),
    mixHexColor(hex, '#ffffff', 0.36),
    hex,
    mixHexColor(hex, '#000000', 0.34),
  ]
}

function isGradientColor(color: string) {
  return color.trim().startsWith('linear-gradient(')
}

function getFirstHexColor(color: string) {
  return color.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/)?.[0] || '#111827'
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(color: string) {
  const hex = normalizeHexColor(color).replace('#', '')
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((value) => clampNumber(value, 0, 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function hexToHsv(color: string) {
  const { r, g, b } = hexToRgb(color)
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let h = 0

  if (delta !== 0) {
    if (max === red) {
      h = 60 * (((green - blue) / delta) % 6)
    } else if (max === green) {
      h = 60 * ((blue - red) / delta + 2)
    } else {
      h = 60 * ((red - green) / delta + 4)
    }
  }

  if (h < 0) h += 360

  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  }
}

function hsvToHex({ h, s, v }: { h: number; s: number; v: number }) {
  const hue = ((h % 360) + 360) % 360
  const saturation = clampNumber(s, 0, 100) / 100
  const value = clampNumber(v, 0, 100) / 100
  const chroma = value * saturation
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = value - chroma
  let red = 0
  let green = 0
  let blue = 0

  if (hue < 60) {
    red = chroma
    green = x
  } else if (hue < 120) {
    red = x
    green = chroma
  } else if (hue < 180) {
    green = chroma
    blue = x
  } else if (hue < 240) {
    green = x
    blue = chroma
  } else if (hue < 300) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  return rgbToHex({
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  })
}

function normalizeHexColor(color: string) {
  const clean = color.replace('#', '')
  if (clean.length === 3) {
    return `#${clean.split('').map((char) => char + char).join('')}`
  }
  return clean.length === 6 ? `#${clean}` : '#217346'
}

function mixHexColor(color: string, target: string, amount: number) {
  const source = normalizeHexColor(color).replace('#', '')
  const destination = normalizeHexColor(target).replace('#', '')
  const sourceRgb = [0, 2, 4].map((index) => parseInt(source.slice(index, index + 2), 16))
  const targetRgb = [0, 2, 4].map((index) => parseInt(destination.slice(index, index + 2), 16))
  const mixed = sourceRgb.map((value, index) =>
    Math.round(value + (targetRgb[index] - value) * amount)
      .toString(16)
      .padStart(2, '0')
  )
  return `#${mixed.join('')}`
}

function FileMenu({
  actions,
  onPrint,
  onClose,
  themeColor,
}: {
  actions?: RibbonActions
  onPrint: () => void | Promise<void>
  onClose: () => void
  themeColor: string
}) {
  const runAction = (action?: () => void | Promise<void>) => {
    onClose()
    window.setTimeout(() => {
      void action?.()
    }, 0)
  }

  return (
    <div
      className="absolute left-0 top-0 z-30 flex min-h-[540px] w-[200px] flex-col py-2 text-white shadow-2xl"
      style={{ backgroundColor: themeColor }}
    >
      <button
        className="mb-3 ml-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/90 text-white transition-colors hover:bg-white/10"
        onClick={onClose}
        title="Retour"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="flex flex-col gap-1">
        <FileMenuItem icon={<Home size={20} />} label="Accueil" active onClick={onClose} themeColor={themeColor} />
        <FileMenuItem icon={<FilePlus size={20} />} label="Nouveau" onClick={() => runAction(actions?.onOpen)} disabled={!actions?.onOpen} />
        <FileMenuItem icon={<FolderOpen size={20} />} label="Ouvrir" onClick={() => runAction(actions?.onOpen)} disabled={!actions?.onOpen} />
        <FileMenuItem icon={<Share2 size={20} />} label="Partager" disabled />

        <div className="my-2 mx-6 h-px bg-white/25" />

        <FileMenuItem icon={<Info size={20} />} label="Informations" disabled />
        <FileMenuItem icon={<Save size={20} />} label="Enregistrer" onClick={() => runAction(actions?.onSave)} disabled={!actions?.onSave} />
        <FileMenuItem icon={<SaveAll size={20} />} label="Enregistrer sous" onClick={() => runAction(actions?.onSaveAs)} disabled={!actions?.onSaveAs} />
        <FileMenuItem icon={<Printer size={20} />} label="Imprimer" onClick={() => runAction(onPrint)} disabled={!actions?.onPrint} />
        <FileMenuItem icon={<Download size={20} />} label="Exporter" onClick={() => runAction(actions?.onExport)} disabled={!actions?.onExport} />
        <FileMenuItem icon={<FileX size={20} />} label="Fermer" onClick={() => runAction(actions?.onLogout)} disabled={!actions?.onLogout} />
      </div>
    </div>
  )
}

function FileMenuItem({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  themeColor = '#217346',
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  themeColor?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'border border-white bg-white/5 text-white'
          : 'text-white/95 hover:bg-white/10'
      }`}
      title={label}
    >
      {active && (
        <span
          className="absolute left-0 top-0 h-full w-1"
          style={{ backgroundColor: themeColor }}
        />
      )}
      <span className="flex h-6 w-6 items-center justify-center text-white">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

interface RibbonButtonProps {
  icon: string | ReactNode
  label: string
  onClick?: () => void
  compact?: boolean
  disabled?: boolean
  active?: boolean
}

function RibbonButton({ icon, label, onClick, compact = false, disabled = false, active = false }: RibbonButtonProps) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex flex-col items-center justify-center rounded-lg px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-white/20 shadow-inner' : 'hover:bg-white/15 active:bg-white/20'
      } ${compact ? 'h-9 w-10' : 'h-10 w-10'}`}
      title={label}
    >
      <div className="flex items-center justify-center text-white group-hover:text-white">{icon}</div>
      <span className={`mt-1 text-[10px] font-medium text-white/95 ${compact ? 'hidden' : 'block'}`}>{label}</span>
    </button>
  )
}

function RibbonGroup({
  label,
  children,
  alignRight = false,
}: {
  label: string
  children: ReactNode
  alignRight?: boolean
}) {
  return (
    <div
      className={`relative mx-1 flex h-[72px] flex-col justify-between rounded-xl border border-white/20 bg-white/8 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
        alignRight ? 'ml-auto' : ''
      }`}
    >
      <div className="flex items-center justify-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
        {label}
      </div>
      <div className="flex items-center justify-center gap-1">{children}</div>
    </div>
  )
}
