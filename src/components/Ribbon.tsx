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
  LogOut,
  ChevronDown,
} from 'lucide-react'

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
  onLogout?: () => void
}

interface RibbonProps {
  fileType?: string | null
  actions?: RibbonActions
}

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
      : 'Word mode'

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

      <div className="flex items-stretch gap-0 overflow-x-auto px-2 py-2 text-white" style={{ backgroundColor: themeColor }}>
        <RibbonGroup label="File">
          <RibbonButton icon={<Save size={18} />} label="Save" onClick={actions?.onSave} disabled={!actions?.onSave} />
          <RibbonButton icon={<FolderOpen size={18} />} label="Open" onClick={actions?.onOpen} disabled={!actions?.onOpen} />
          <RibbonButton icon={<Download size={18} />} label="Export" onClick={actions?.onExport} disabled={!actions?.onExport} />
        </RibbonGroup>

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
              <option>Montserrat</option>
              <option>Arial</option>
              <option>Georgia</option>
              <option>Times New Roman</option>
              <option>Courier New</option>
            </select>
            <select
              defaultValue="16"
              onChange={(e) => actions?.onSetFontSize?.(parseInt(e.target.value, 10))}
              className="h-8 w-14 rounded-md border border-white/20 bg-white/95 px-2 text-[11px] text-gray-800 outline-none"
            >
              <option>16</option>
              <option>14</option>
              <option>12</option>
              <option>10</option>
              <option>8</option>
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
          <div className="flex items-end gap-2">
            <ColorSwatch label="Color 1" color="#f6c94c" onClick={() => actions?.onSetColor?.('#f6c94c')} />
            <ColorSwatch label="Color 2" color="#9be15d" onClick={() => actions?.onSetColor?.('#9be15d')} />
          </div>
          <div className="mt-2 text-center text-[11px] font-medium text-white/90">Select colors</div>
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

        <RibbonGroup label="Account" alignRight>
          <button onClick={actions?.onLogout} className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-medium hover:bg-white/20">
            <LogOut size={16} />
            Log out
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
      } ${compact ? 'h-9 w-10' : 'h-16 w-16'}`}
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
      className={`mx-1 flex min-h-[76px] flex-col justify-between rounded-xl border border-white/20 bg-white/8 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
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

function ColorSwatch({
  label,
  color,
  onClick,
}: {
  label: string
  color: string
  onClick?: () => void
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-14 w-16 flex-col items-center justify-center rounded-lg border border-white/20 bg-white/10 px-2 py-1 hover:bg-white/20"
    >
      <div className="mb-1 h-7 w-7 rounded-sm border border-white/30 shadow-sm" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-medium text-white">{label}</span>
    </button>
  )
}
