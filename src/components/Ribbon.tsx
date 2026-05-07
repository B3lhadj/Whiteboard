import type { ReactNode } from 'react'
import { useDocumentStore } from '../store'
import { getThemeForFileType } from '../utils'
import {
  Home,
  Save,
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
  Languages,
  ChevronDown,
  Printer,
  RotateCcw,
  RotateCw,
  Move,
  RefreshCw,
} from 'lucide-react'
import backIcon from '../assets/Back.png'
import TextColorPicker from './TextColorPicker'

export interface RibbonActions {
  onSave?: () => void | Promise<void>
  onOpen?: () => void
  onExport?: () => void | Promise<void>
  onPrint?: () => void
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
}

// Expanded font options
const FONT_OPTIONS = [
  'Montserrat',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Helvetica',
  'Impact',
  'Comic Sans MS',
  'Trebuchet MS',
  'Lucida Sans',
  'Open Sans',
  'Roboto',
  'Lato',
  'Poppins',
  'Nunito',
  'Inter',
]

// Font size options
const FONT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 64, 72]

// Preset colors for quick selection
const PRESET_COLORS = [
  '#000000', // Black
  '#FFFFFF', // White
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#FFA500', // Orange
  '#800080', // Purple
  '#FFC0CB', // Pink
  '#A52A2A', // Brown
  '#808080', // Gray
  '#f6c94c', // Gold
  '#9be15d', // Lime
  '#E6194B', // Bright Red
  '#3CB44B', // Bright Green
  '#4363D8', // Bright Blue
  '#F58231', // Orange
  '#911EB4', // Purple
  '#46F0F0', // Cyan
  '#F032E6', // Magenta
  '#BCF60C', // Lime Yellow
  '#FABEBE', // Pink
  '#008080', // Teal
  '#E6BEFF', // Lavender
  '#AA6E28', // Brown
  '#800000', // Maroon
]

export default function Ribbon({ fileType, actions }: RibbonProps) {
  const toggleDarkMode = useDocumentStore((state) => state.toggleDarkMode)
  const darkMode = useDocumentStore((state) => state.darkMode)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const selectedLanguage = useDocumentStore((state) => state.selectedLanguage)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const setSelectedLanguage = useDocumentStore((state) => state.setSelectedLanguage)

  const themeColor = fileType
    ? getThemeForFileType(fileType as any)
    : '#217346'

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

  return (
    <div className="border-b border-gray-300 bg-white shadow-sm">
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

      <div className="flex items-stretch gap-0 overflow-x-auto px-2 py-2 text-white" style={{ backgroundColor: themeColor, height: '91px' }}>
        <RibbonGroup label="File">
          <RibbonButton icon={<Save size={18} />} label="Save" onClick={actions?.onSave} disabled={!actions?.onSave} />
          <RibbonButton icon={<FolderOpen size={18} />} label="Open" onClick={actions?.onOpen} disabled={!actions?.onOpen} />
          <RibbonButton icon={<Download size={18} />} label="Export" onClick={actions?.onExport} disabled={!actions?.onExport} />
          <RibbonButton icon={<Printer size={18} />} label="Print" onClick={handlePrint}  disabled={!actions?.onSave} />
        </RibbonGroup>

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
              defaultValue="Montserrat"
              onChange={(e) => actions?.onSetFontFamily?.(e.target.value)}
              className="h-8 rounded-md border border-white/20 bg-white/95 px-2 text-[11px] text-gray-800 outline-none"
            >
              {FONT_OPTIONS.map((font) => (
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
              {FONT_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <RibbonButton icon={<Bold size={16} />} label="Bold" compact onClick={actions?.onToggleBold} disabled={!actions?.onToggleBold} />
            <RibbonButton icon={<Italic size={16} />} label="Italic" compact onClick={actions?.onToggleItalic} disabled={!actions?.onToggleItalic} />
            <RibbonButton icon={<Underline size={16} />} label="Underline" compact onClick={actions?.onToggleUnderline} disabled={!actions?.onToggleUnderline} />
          </div>
          <div className="mt-1 flex items-center gap-1">
            <RibbonButton icon={<AlignLeft size={16} />} label="Left" compact onClick={actions?.onAlignLeft} disabled={!actions?.onAlignLeft} />
            <RibbonButton icon={<AlignCenter size={16} />} label="Center" compact onClick={actions?.onAlignCenter} disabled={!actions?.onAlignCenter} />
            <RibbonButton icon={<AlignRight size={16} />} label="Right" compact onClick={actions?.onAlignRight} disabled={!actions?.onAlignRight} />
            <RibbonButton icon={<AlignJustify size={16} />} label="Justify" compact onClick={actions?.onAlignJustify} disabled={!actions?.onAlignJustify} />
          </div>
        </RibbonGroup>

        <RibbonGroup label="Colors">
          <TextColorPicker 
            onColorSelect={actions?.onSetColor}
            presetColors={PRESET_COLORS}
            disabled={!actions?.onSetColor}
          />
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
          <button
            className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-medium hover:bg-white/20"
            onClick={actions?.onSetLanguage ? () => actions.onSetLanguage?.(selectedLanguage) : undefined}
          >
            <Languages size={16} />
            Change language
            <ChevronDown size={13} />
          </button>
        </RibbonGroup>

        <RibbonGroup label="Clear" alignRight>
          <button onClick={actions?.onBack} className="flex flex-col items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 py-2 h-10 w-10 hover:bg-white/20">
            <img src={backIcon} alt="Back" className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium text-white">Back</span>
          </button>
        </RibbonGroup>
      </div>
    </div>
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

