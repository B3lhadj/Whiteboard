import { useState, useRef, ReactNode } from 'react'
import {
  MousePointer2,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Crop,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Pencil,
  Highlighter,
  Type,
  Eraser,
  PaintBucket,
  Square,
  Circle,
  Triangle,
  Minus,
  ChevronDown,
  Download,
  Layers,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Timer,
  Film,
} from 'lucide-react'
import type { ImageEditorObjectType, VideoExportQuality } from './ImageEditorCanvas'

// Export types so they can be imported by other files
export type ImageDrawingTool = 'select' | 'crop' | 'pencil' | 'highlighter' | 'text' | 'eraser' | 'fill' | 'rectangle' | 'circle' | 'triangle' | 'line'
export type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'diamond' | 'line' | 'arrow'
export type ShapeTextAlign = 'left' | 'center' | 'right'
export type ShapeTextVerticalAlign = 'top' | 'middle' | 'bottom'

export interface ImageEditorRibbonActions {
  onSelectTool?: () => void
  onDeleteSelected?: () => void
  onDuplicateSelected?: () => void
  onCopySelected?: () => void
  onUndo?: () => void
  onRedo?: () => void
  undoAvailable?: boolean
  redoAvailable?: boolean
  onCrop?: () => void
  onRotateLeft?: () => void
  onRotateRight?: () => void
  onFlipHorizontal?: () => void
  onFlipVertical?: () => void
  onSetTool?: (tool: ImageDrawingTool) => void
  activeTool?: ImageDrawingTool
  onSetBrushSize?: (size: number) => void
  onSetBrushOpacity?: (opacity: number) => void
  onSetBrushColor?: (color: string) => void
  onSetBackgroundColor?: (color: string) => void
  brushSize?: number
  brushOpacity?: number
  brushColor?: string
  backgroundColor?: string
  onSetShapeType?: (shape: ShapeType) => void
  onSetFillColor?: (color: string) => void
  onSetStrokeColor?: (color: string) => void
  onSetStrokeWidth?: (width: number) => void
  onSetShapeRotation?: (rotation: number) => void
  onSetShapeWidth?: (width: number) => void
  onSetShapeHeight?: (height: number) => void
  onSetImageBorderRadius?: (radius: number) => void
  onSetImageBorderWidth?: (width: number) => void
  onSetImageBorderColor?: (color: string) => void
  onSetImageOpacity?: (opacity: number) => void
  onSetShapeText?: (text: string) => void
  onSetShapeTextAlign?: (align: ShapeTextAlign) => void
  onSetShapeTextVerticalAlign?: (align: ShapeTextVerticalAlign) => void
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  shapeRotation?: number
  shapeWidth?: number
  shapeHeight?: number
  shapeText?: string
  shapeTextAlign?: ShapeTextAlign
  shapeTextVerticalAlign?: ShapeTextVerticalAlign
  imageBorderRadius?: number
  imageBorderWidth?: number
  imageBorderColor?: string
  imageOpacity?: number
  selectedObjectType?: ImageEditorObjectType
  mediaType?: 'image' | 'video'
  mediaCurrentTime?: number
  mediaDuration?: number
  videoExportQuality?: VideoExportQuality
  elementStartTime?: number
  elementEndTime?: number
  onSetVideoExportQuality?: (quality: VideoExportQuality) => void
  onSetElementStartTime?: (time: number) => void
  onSetElementEndTime?: (time: number) => void
  onSetTextFontFamily?: (fontFamily: string) => void
  onSetTextFontSize?: (fontSize: number) => void
  onToggleTextBold?: () => void
  onToggleTextItalic?: () => void
  onSetTextColor?: (color: string) => void
  onSetTextRotation?: (rotation: number) => void
  textFontFamily?: string
  textFontSize?: number
  textBold?: boolean
  textItalic?: boolean
  textColor?: string
  textRotation?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onResetZoom?: () => void
  zoom?: number
  onExport?: (format: 'png' | 'jpg' | 'pdf' | 'webm') => void
  onLayers?: () => void
  onConvertToVideo?: () => void
  convertingToVideo?: boolean
}

const BRUSH_PRESETS = [
  { name: 'Fine', size: 2, opacity: 1 },
  { name: 'Medium', size: 6, opacity: 1 },
  { name: 'Bold', size: 12, opacity: 1 },
  { name: 'Soft', size: 8, opacity: 0.7 },
  { name: 'Marker', size: 15, opacity: 0.5 },
]

const VIDEO_EXPORT_QUALITY_OPTIONS: Array<{ value: VideoExportQuality; label: string }> = [
  { value: 'hd', label: 'HD 720p' },
  { value: 'fullHd', label: 'Full HD 1080p' },
  { value: '4k', label: '4K UHD' },
]

const SHAPE_OPTIONS: Array<{ value: ShapeType; label: string; icon: ReactNode }> = [
  { value: 'rectangle', label: 'Rectangle', icon: <Square size={18} /> },
  { value: 'circle', label: 'Circle', icon: <Circle size={18} /> },
  { value: 'triangle', label: 'Triangle', icon: <Triangle size={18} /> },
  { value: 'line', label: 'Line', icon: <Minus size={18} /> },
]

const PRESET_COLORS = [
  '#000000', '#ffffff', '#808080',
  '#ff0000', '#ff8c00', '#ffff00',
  '#00ff00', '#00ffff', '#0000ff',
  '#ff00ff', '#c0c0c0', '#8b4513',
]

const FONT_OPTIONS = [
  'Arial',
  'Calibri',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Courier New',
]

interface RibbonGroupProps {
  label: string
  children: ReactNode
  alignRight?: boolean
}

function RibbonGroup({ label, children, alignRight = false }: RibbonGroupProps) {
  return (
    <div className={`flex shrink-0 flex-col items-start gap-1 border-r border-slate-200 px-3 py-2 last:border-r-0 ${alignRight ? 'ml-auto' : ''}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="flex flex-nowrap gap-1">{children}</div>
    </div>
  )
}

interface ToolButtonProps {
  icon: ReactNode
  label: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  compact?: boolean
}

function ToolButton({ icon, label, active = false, onClick, disabled = false, compact = false }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border transition-all ${
        compact ? 'h-8 w-8' : 'h-12 w-12'
      } ${
        active
          ? 'border-cyan-500 bg-cyan-50 text-cyan-700 shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {icon}
      {!compact && <span className="max-w-full whitespace-nowrap text-center text-[8px] font-medium leading-tight">{label}</span>}
    </button>
  )
}

interface DropdownMenuProps<T> {
  icon: ReactNode
  label: string
  value?: T
  options: Array<{ value: T; label: string; icon?: ReactNode }>
  onSelect: (value: T) => void
  disabled?: boolean
}

function DropdownMenu<T extends string>({
  icon,
  label,
  value,
  options,
  onSelect,
  disabled = false,
}: DropdownMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => {
          if (disabled) return
          const rect = buttonRef.current?.getBoundingClientRect()
          if (rect) {
            setMenuPosition({ top: rect.bottom + 6, left: rect.left })
          }
          setIsOpen(!isOpen)
        }}
        disabled={disabled}
        className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition-all ${
          isOpen
            ? 'border-cyan-500 bg-cyan-50 text-cyan-700 shadow-sm'
            : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span className="flex items-center gap-1">
          {icon}
          <span className="hidden sm:inline text-xs font-medium">{label}</span>
        </span>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={menuRef}
            className="fixed z-50 min-w-max overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {options.map((option) => (
              <button
                key={String(option.value)}
                onClick={() => {
                  onSelect(option.value)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-all ${
                  value === option.value
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-cyan-700'
                }`}
              >
                {option.icon && <span className="flex items-center">{option.icon}</span>}
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  label: string
}

function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const inputValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'

  return (
    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
      <label className="shrink-0 text-xs font-medium text-slate-600">{label}</label>
      <div className="flex shrink-0 flex-nowrap items-center gap-1">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`h-6 w-6 rounded border-2 transition-all ${
              value.toLowerCase() === color.toLowerCase() ? 'border-cyan-500 shadow-sm' : 'border-slate-300'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        <input
          type="color"
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-slate-300 bg-white"
          title="Custom color"
        />
      </div>
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  unit?: string
  resetValue?: number
}

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function Slider({ label, value, min, max, onChange, unit, resetValue }: SliderProps) {
  const commitValue = (nextValue: number) => {
    onChange(clampNumber(Number.isFinite(nextValue) ? nextValue : min, min, max))
  }

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-100 bg-slate-50 px-2">
      <label className="min-w-fit shrink-0 text-xs font-semibold text-slate-600">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => commitValue(Number(e.target.value))}
        className="h-1 w-20 shrink-0 cursor-pointer rounded-lg bg-slate-200 accent-cyan-600"
      />
      <div className="flex items-center rounded-lg border border-slate-200 bg-white">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => commitValue(Number(e.target.value))}
          className="h-6 w-12 rounded-l-lg bg-transparent px-2 text-right text-xs font-semibold text-slate-700 outline-none"
        />
        {unit && <span className="pr-2 text-[11px] font-medium text-slate-400">{unit}</span>}
      </div>
      {typeof resetValue === 'number' && (
        <button
          type="button"
          onClick={() => commitValue(resetValue)}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-cyan-300 hover:text-cyan-700"
          title={`Reset ${label}`}
        >
          <RotateCcw size={13} />
        </button>
      )}
    </div>
  )
}

interface ImageEditorRibbonProps {
  actions?: ImageEditorRibbonActions
}

export default function ImageEditorRibbon({ actions }: ImageEditorRibbonProps) {
  const activeTool = actions?.activeTool || 'select'
  const brushSize = actions?.brushSize || 6
  const brushOpacity = actions?.brushOpacity || 100
  const brushColor = actions?.brushColor || '#000000'
  const backgroundColor = actions?.backgroundColor || '#ffffff'
  const fillColor = actions?.fillColor || '#ffffff'
  const strokeColor = actions?.strokeColor || '#000000'
  const strokeWidth = actions?.strokeWidth || 2
  const shapeRotation = actions?.shapeRotation || 0
  const shapeWidth = actions?.shapeWidth || 120
  const shapeHeight = actions?.shapeHeight || 80
  const shapeText = actions?.shapeText || ''
  const shapeTextAlign = actions?.shapeTextAlign || 'center'
  const shapeTextVerticalAlign = actions?.shapeTextVerticalAlign || 'middle'
  const textFontFamily = actions?.textFontFamily || 'Arial'
  const textFontSize = actions?.textFontSize || 24
  const textBold = Boolean(actions?.textBold)
  const textItalic = Boolean(actions?.textItalic)
  const textColor = actions?.textColor || brushColor
  const textRotation = actions?.textRotation || 0
  const zoom = actions?.zoom || 100
  const mediaDuration = Math.max(0, actions?.mediaDuration || 0)
  const mediaCurrentTime = Math.max(0, actions?.mediaCurrentTime || 0)
  const elementStartTime = Math.max(0, actions?.elementStartTime || 0)
  const elementEndTime = Math.max(elementStartTime, actions?.elementEndTime ?? mediaDuration)
  const imageBorderRadius = actions?.imageBorderRadius || 0
  const imageBorderWidth = actions?.imageBorderWidth || 0
  const imageBorderColor = actions?.imageBorderColor || '#ffffff'
  const imageOpacity = actions?.imageOpacity || 100
  const showTextSettings = activeTool === 'text' || actions?.selectedObjectType === 'text'
  const showShapeSettings = ['rectangle', 'circle', 'triangle', 'line'].includes(activeTool) || actions?.selectedObjectType === 'shape'
  const showTimingSettings = actions?.mediaType === 'video' && Boolean(actions?.selectedObjectType) && mediaDuration > 0

  return (
    <div className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50 text-slate-900 shadow-sm" data-print-hidden="true">
      {/* Main toolbar */}
      <div className="block h-[76px] shrink-0 overflow-hidden bg-slate-50">
        <div className="flex h-full flex-nowrap items-stretch gap-0 overflow-x-auto overflow-y-hidden px-2 py-2">
        {/* Selection & Editing */}
        <RibbonGroup label="Select">
          <ToolButton
            icon={<MousePointer2 size={18} />}
            label="Select"
            active={activeTool === 'select'}
            onClick={() => actions?.onSetTool?.('select')}
          />
        </RibbonGroup>

        {/* Edit Operations */}
        <RibbonGroup label="Edit">
          <ToolButton
            icon={<Copy size={16} />}
            label="Copy"
            compact
            onClick={actions?.onCopySelected}
          />
          <ToolButton
            icon={<Trash2 size={16} />}
            label="Delete"
            compact
            onClick={actions?.onDeleteSelected}
          />
          <ToolButton
            icon={<Undo2 size={16} />}
            label="Undo"
            compact
            onClick={actions?.onUndo}
            disabled={!actions?.undoAvailable}
          />
          <ToolButton
            icon={<Redo2 size={16} />}
            label="Redo"
            compact
            onClick={actions?.onRedo}
            disabled={!actions?.redoAvailable}
          />
        </RibbonGroup>

        {/* Image Operations */}
        <RibbonGroup label="Image">
          <ToolButton
            icon={<Crop size={16} />}
            label="Crop"
            compact
            active={activeTool === 'crop'}
            onClick={() => actions?.onCrop?.()}
          />
          <ToolButton
            icon={<RotateCcw size={16} />}
            label="Rotate Left"
            compact
            onClick={actions?.onRotateLeft}
          />
          <ToolButton
            icon={<RotateCw size={16} />}
            label="Rotate Right"
            compact
            onClick={actions?.onRotateRight}
          />
          <ToolButton
            icon={<FlipHorizontal size={16} />}
            label="Flip H"
            compact
            onClick={actions?.onFlipHorizontal}
          />
          <ToolButton
            icon={<FlipVertical size={16} />}
            label="Flip V"
            compact
            onClick={actions?.onFlipVertical}
          />
        </RibbonGroup>

        {/* Drawing Tools */}
        <RibbonGroup label="Draw">
          <ToolButton
            icon={<Pencil size={18} />}
            label="Pencil"
            active={activeTool === 'pencil'}
            onClick={() => actions?.onSetTool?.('pencil')}
          />
          <ToolButton
            icon={<Highlighter size={18} />}
            label="Highlight"
            active={activeTool === 'highlighter'}
            onClick={() => actions?.onSetTool?.('highlighter')}
          />
          <ToolButton
            icon={<Type size={18} />}
            label="Text"
            active={activeTool === 'text'}
            onClick={() => actions?.onSetTool?.('text')}
          />
          <ToolButton
            icon={<Eraser size={18} />}
            label="Eraser"
            active={activeTool === 'eraser'}
            onClick={() => actions?.onSetTool?.('eraser')}
          />
          <ToolButton
            icon={<PaintBucket size={18} />}
            label="Fill"
            active={activeTool === 'fill'}
            onClick={() => actions?.onSetTool?.('fill')}
          />
        </RibbonGroup>

        {/* Shapes */}
        <RibbonGroup label="Shapes">
          <DropdownMenu
            icon={<Square size={18} />}
            label="Shapes"
            value={activeTool as ShapeType}
            options={SHAPE_OPTIONS}
            onSelect={(shape) => actions?.onSetTool?.(shape as any)}
          />
        </RibbonGroup>

        {/* Zoom */}
        <RibbonGroup label="View">
          <ToolButton
            icon={<ZoomIn size={16} />}
            label="Zoom In"
            compact
            onClick={actions?.onZoomIn}
          />
          <ToolButton
            icon={<ZoomOut size={16} />}
            label="Zoom Out"
            compact
            onClick={actions?.onZoomOut}
          />
          <ToolButton
            icon={<RotateCcw size={16} />}
            label="Reset Zoom"
            compact
            onClick={actions?.onResetZoom}
          />
          <span className="flex items-center px-2 text-xs font-medium text-slate-700">{zoom}%</span>
        </RibbonGroup>

        {/* Export */}
        <RibbonGroup label="File">
          {actions?.mediaType === 'image' && (
            <ToolButton
              icon={<Film size={18} />}
              label={actions.convertingToVideo ? 'Creating…' : 'Image to video'}
              onClick={actions.onConvertToVideo}
              disabled={actions.convertingToVideo}
            />
          )}
          {actions?.mediaType === 'video' && (
            <DropdownMenu
              icon={<Download size={16} />}
              label={VIDEO_EXPORT_QUALITY_OPTIONS.find((option) => option.value === actions.videoExportQuality)?.label || 'Full HD 1080p'}
              value={actions.videoExportQuality || 'fullHd'}
              options={VIDEO_EXPORT_QUALITY_OPTIONS}
              onSelect={(quality) => actions?.onSetVideoExportQuality?.(quality)}
            />
          )}
          <DropdownMenu
            icon={<Download size={18} />}
            label="Export"
            options={[
              ...(actions?.mediaType === 'video' ? [{ value: 'webm' as const, label: 'Edited video' }] : []),
              { value: 'png', label: 'PNG' },
              { value: 'jpg', label: 'JPG' },
              { value: 'pdf', label: 'PDF' },
            ]}
            onSelect={(format) => actions?.onExport?.(format as any)}
          />
          <ToolButton
            icon={<Layers size={16} />}
            label="Layers"
            compact
            onClick={actions?.onLayers}
          />
        </RibbonGroup>
        </div>
      </div>

      <div className="block h-[48px] shrink-0 clear-both overflow-hidden border-t border-slate-200 bg-white">
        <div className="h-full overflow-x-auto overflow-y-hidden px-4 py-1.5">
      {/* Brush Settings */}
      {showTimingSettings ? (
        <div className="flex h-full min-w-max flex-nowrap items-center gap-3 whitespace-nowrap">
          <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3">
            <Timer size={16} className="text-teal-700" />
            <span className="shrink-0 text-xs font-semibold text-teal-800">Element timing</span>
            <span className="text-[11px] font-medium text-teal-700">{mediaCurrentTime.toFixed(1)}s / {mediaDuration.toFixed(1)}s</span>
          </div>
          <Slider
            label="Start"
            value={Number(elementStartTime.toFixed(1))}
            min={0}
            max={Math.max(1, Math.ceil(mediaDuration))}
            unit="s"
            onChange={(value) => actions?.onSetElementStartTime?.(Math.min(value, elementEndTime))}
          />
          <Slider
            label="End"
            value={Number(elementEndTime.toFixed(1))}
            min={0}
            max={Math.max(1, Math.ceil(mediaDuration))}
            unit="s"
            onChange={(value) => actions?.onSetElementEndTime?.(Math.max(value, elementStartTime))}
          />
          <button
            type="button"
            onClick={() => {
              actions?.onSetElementStartTime?.(mediaCurrentTime)
              actions?.onSetElementEndTime?.(Math.min(mediaDuration, mediaCurrentTime + 3))
            }}
            className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-300 hover:text-teal-700"
          >
            From playhead
          </button>
          <button
            type="button"
            onClick={() => {
              actions?.onSetElementStartTime?.(0)
              actions?.onSetElementEndTime?.(mediaDuration)
            }}
            className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-300 hover:text-teal-700"
          >
            Full video
          </button>
          {actions?.selectedObjectType === 'image' && (
            <>
              <div className="h-6 w-px shrink-0 bg-slate-200" />
              <Slider
                label="Opacity"
                value={imageOpacity}
                min={10}
                max={100}
                unit="%"
                onChange={(value) => actions?.onSetImageOpacity?.(value)}
              />
              <Slider
                label="W"
                value={shapeWidth}
                min={12}
                max={2000}
                unit="px"
                onChange={(value) => actions?.onSetShapeWidth?.(value)}
              />
              <Slider
                label="H"
                value={shapeHeight}
                min={12}
                max={2000}
                unit="px"
                onChange={(value) => actions?.onSetShapeHeight?.(value)}
              />
              <Slider
                label="Radius"
                value={imageBorderRadius}
                min={0}
                max={120}
                unit="px"
                onChange={(value) => actions?.onSetImageBorderRadius?.(value)}
              />
              <Slider
                label="Border"
                value={imageBorderWidth}
                min={0}
                max={30}
                unit="px"
                onChange={(value) => actions?.onSetImageBorderWidth?.(value)}
              />
              <ColorPicker
                value={imageBorderColor}
                onChange={(color) => actions?.onSetImageBorderColor?.(color)}
                label="Border"
              />
            </>
          )}
        </div>
      ) : ['pencil', 'highlighter', 'eraser'].includes(activeTool) ? (
          <div className="flex h-full min-w-max flex-nowrap items-center gap-3 whitespace-nowrap">
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <span className="shrink-0 text-xs font-semibold uppercase text-slate-500">Brush Presets:</span>
              <div className="flex shrink-0 flex-nowrap gap-1">
                {BRUSH_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      actions?.onSetBrushSize?.(preset.size)
                      actions?.onSetBrushOpacity?.(Math.round(preset.opacity * 100))
                    }}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-l border-slate-200 pl-4">
              <Slider
                label="Size"
                value={brushSize}
                min={1}
                max={50}
                unit="px"
                onChange={(value) => actions?.onSetBrushSize?.(value)}
              />
            </div>

            <div className="border-l border-slate-200 pl-4">
              <Slider
                label="Opacity"
                value={brushOpacity}
                min={10}
                max={100}
                unit="%"
                onChange={(value) => actions?.onSetBrushOpacity?.(value)}
              />
            </div>

            <div className="border-l border-slate-200 pl-4">
              <ColorPicker
                value={brushColor}
                onChange={(color) => actions?.onSetBrushColor?.(color)}
                label="Brush"
              />
            </div>
          </div>
      ) : activeTool === 'fill' ? (
        <div className="flex h-full min-w-max flex-nowrap items-center gap-3 whitespace-nowrap">
          <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-cyan-100 bg-cyan-50 px-3">
            <PaintBucket size={16} className="text-cyan-700" />
            <span className="shrink-0 text-xs font-semibold text-cyan-800">Fill empty image area or selected shape</span>
          </div>
          <ColorPicker
            value={backgroundColor}
            onChange={(color) => actions?.onSetBackgroundColor?.(color)}
            label="Background"
          />
          <button
            type="button"
            onClick={() => actions?.onSetBackgroundColor?.('#ffffff')}
            className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-cyan-300 hover:text-cyan-700"
          >
            Reset background
          </button>
          <ColorPicker
            value={fillColor}
            onChange={(color) => actions?.onSetFillColor?.(color)}
            label="Shape fill"
          />
        </div>
      ) : showShapeSettings ? (
        <div className="flex h-full min-w-max flex-nowrap items-center gap-3 whitespace-nowrap">

      {/* Shape Settings */}
            <div className="border-r border-slate-200 pr-4">
              <ColorPicker
                value={fillColor}
                onChange={(color) => actions?.onSetFillColor?.(color)}
                label="Fill"
              />
            </div>

            <div className="border-r border-slate-200 pr-4">
              <ColorPicker
                value={strokeColor}
                onChange={(color) => actions?.onSetStrokeColor?.(color)}
                label="Stroke"
              />
            </div>

            <div className="border-r border-slate-200 pr-4">
              <Slider
                label="Stroke Width"
                value={strokeWidth}
                min={1}
                max={20}
                onChange={(value) => actions?.onSetStrokeWidth?.(value)}
              />
            </div>

            {actions?.selectedObjectType === 'shape' && (
              <>
                <div className="border-r border-slate-200 pr-4">
                  <Slider
                    label="W"
                    value={shapeWidth}
                    min={12}
                    max={2000}
                    unit="px"
                    onChange={(value) => actions?.onSetShapeWidth?.(value)}
                  />
                </div>

                <div className="border-r border-slate-200 pr-4">
                  <Slider
                    label="H"
                    value={shapeHeight}
                    min={12}
                    max={2000}
                    unit="px"
                    onChange={(value) => actions?.onSetShapeHeight?.(value)}
                  />
                </div>
              </>
            )}

            <div>
              <Slider
                label="Angle"
                value={shapeRotation}
                min={-180}
                max={180}
                unit="deg"
                resetValue={0}
                onChange={(value) => actions?.onSetShapeRotation?.(value)}
              />
            </div>

            {actions?.selectedObjectType === 'shape' && activeTool !== 'line' && (
              <>
                <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                  <label className="text-xs font-medium text-slate-600">Text</label>
                  <input
                    value={shapeText}
                    onChange={(event) => actions?.onSetShapeText?.(event.target.value)}
                    placeholder="Text inside shape"
                    className="h-8 w-36 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex items-center gap-1 border-l border-slate-200 pl-4">
                  <ToolButton icon={<AlignLeft size={16} />} label="Left" compact active={shapeTextAlign === 'left'} onClick={() => actions?.onSetShapeTextAlign?.('left')} />
                  <ToolButton icon={<AlignCenter size={16} />} label="Center" compact active={shapeTextAlign === 'center'} onClick={() => actions?.onSetShapeTextAlign?.('center')} />
                  <ToolButton icon={<AlignRight size={16} />} label="Right" compact active={shapeTextAlign === 'right'} onClick={() => actions?.onSetShapeTextAlign?.('right')} />
                </div>
                <div className="flex items-center gap-1 border-l border-slate-200 pl-4">
                  <ToolButton icon={<AlignVerticalJustifyStart size={16} />} label="Top" compact active={shapeTextVerticalAlign === 'top'} onClick={() => actions?.onSetShapeTextVerticalAlign?.('top')} />
                  <ToolButton icon={<AlignVerticalJustifyCenter size={16} />} label="Middle" compact active={shapeTextVerticalAlign === 'middle'} onClick={() => actions?.onSetShapeTextVerticalAlign?.('middle')} />
                  <ToolButton icon={<AlignVerticalJustifyEnd size={16} />} label="Bottom" compact active={shapeTextVerticalAlign === 'bottom'} onClick={() => actions?.onSetShapeTextVerticalAlign?.('bottom')} />
                </div>
              </>
            )}
          </div>
      ) : showTextSettings ? (
        <div className="flex h-full min-w-max flex-nowrap items-center gap-3 whitespace-nowrap">
      {/* Text Settings */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">Font</label>
              <select
                value={textFontFamily}
                onChange={(event) => actions?.onSetTextFontFamily?.(event.target.value)}
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-cyan-500"
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-l border-slate-200 pl-4">
              <Slider
                label="Size"
                value={textFontSize}
                min={10}
                max={96}
                unit="px"
                onChange={(value) => actions?.onSetTextFontSize?.(value)}
              />
            </div>

            <div className="flex items-center gap-1 border-l border-slate-200 pl-4">
              <ToolButton
                icon={<Bold size={16} />}
                label="Bold"
                compact
                active={textBold}
                onClick={actions?.onToggleTextBold}
              />
              <ToolButton
                icon={<Italic size={16} />}
                label="Italic"
                compact
                active={textItalic}
                onClick={actions?.onToggleTextItalic}
              />
            </div>

            <div className="border-l border-slate-200 pl-4">
              <ColorPicker
                value={textColor}
                onChange={(color) => actions?.onSetTextColor?.(color)}
                label="Color"
              />
            </div>

            <div className="border-l border-slate-200 pl-4">
              <Slider
                label="Angle"
                value={textRotation}
                min={-180}
                max={180}
                unit="deg"
                resetValue={0}
                onChange={(value) => actions?.onSetTextRotation?.(value)}
              />
            </div>
          </div>
      ) : (
        <div className="flex h-full min-w-max items-center whitespace-nowrap text-xs font-medium text-slate-400">
          Choose a drawing, text, fill, or shape tool to edit its options.
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
