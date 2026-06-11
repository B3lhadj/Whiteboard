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
  Pipette,
  Square,
  Circle,
  Triangle,
  Minus,
  ChevronDown,
  Download,
  Layers,
} from 'lucide-react'

// Export types so they can be imported by other files
export type ImageDrawingTool = 'select' | 'pencil' | 'highlighter' | 'text' | 'eraser' | 'eyedropper' | 'rectangle' | 'circle' | 'triangle' | 'line'
export type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'diamond' | 'line' | 'arrow'

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
  brushSize?: number
  brushOpacity?: number
  brushColor?: string
  onSetShapeType?: (shape: ShapeType) => void
  onSetFillColor?: (color: string) => void
  onSetStrokeColor?: (color: string) => void
  onSetStrokeWidth?: (width: number) => void
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onResetZoom?: () => void
  zoom?: number
  onExport?: (format: 'png' | 'jpg' | 'pdf') => void
  onLayers?: () => void
}

const BRUSH_PRESETS = [
  { name: 'Fine', size: 2, opacity: 1 },
  { name: 'Medium', size: 6, opacity: 1 },
  { name: 'Bold', size: 12, opacity: 1 },
  { name: 'Soft', size: 8, opacity: 0.7 },
  { name: 'Marker', size: 15, opacity: 0.5 },
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

interface RibbonGroupProps {
  label: string
  children: ReactNode
  alignRight?: boolean
}

function RibbonGroup({ label, children, alignRight = false }: RibbonGroupProps) {
  return (
    <div className={`flex flex-col items-start gap-1 px-3 py-2 border-r border-gray-600 last:border-r-0 ${alignRight ? 'ml-auto' : ''}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="flex gap-1">{children}</div>
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
          ? 'border-orange-500 bg-orange-500/20 text-orange-400'
          : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:bg-gray-700 hover:text-white'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {icon}
      {!compact && <span className="text-[9px] font-medium leading-tight text-center">{label}</span>}
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
  const menuRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition-all ${
          isOpen
            ? 'border-orange-500 bg-orange-500/20 text-orange-400'
            : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:bg-gray-700 hover:text-white'
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
            className="absolute top-full left-0 z-30 mt-1 min-w-max rounded-lg border border-gray-600 bg-gray-800 shadow-lg"
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
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
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
  return (
    <div className="flex items-center gap-1">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      <div className="flex items-center gap-1">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`h-6 w-6 rounded border-2 transition-all ${
              value === color ? 'border-orange-400' : 'border-gray-600'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-gray-600"
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
}

function Slider({ label, value, min, max, onChange }: SliderProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-gray-400 min-w-fit">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-20 cursor-pointer rounded-lg bg-gray-600 accent-orange-500"
      />
      <span className="text-xs font-medium text-gray-300 min-w-fit">{value}</span>
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
  const fillColor = actions?.fillColor || '#ffffff'
  const strokeColor = actions?.strokeColor || '#000000'
  const strokeWidth = actions?.strokeWidth || 2
  const zoom = actions?.zoom || 100

  return (
    <div className="w-full border-b border-gray-600 bg-gray-800 text-white shadow-lg" data-print-hidden="true">
      {/* Main toolbar */}
      <div className="flex items-stretch gap-0 overflow-x-auto px-2 py-2">
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
            onClick={actions?.onCrop}
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
            icon={<Pipette size={18} />}
            label="Eyedropper"
            active={activeTool === 'eyedropper'}
            onClick={() => actions?.onSetTool?.('eyedropper')}
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
          <span className="flex items-center px-2 text-xs font-medium text-gray-300">{zoom}%</span>
        </RibbonGroup>

        {/* Export */}
        <RibbonGroup label="File">
          <DropdownMenu
            icon={<Download size={18} />}
            label="Export"
            options={[
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

      {/* Brush Settings */}
      {['pencil', 'highlighter', 'eraser'].includes(activeTool) && (
        <div className="border-t border-gray-600 bg-gray-800/50 px-4 py-2">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-gray-400">Brush Presets:</span>
              <div className="flex gap-1">
                {BRUSH_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      actions?.onSetBrushSize?.(preset.size)
                      actions?.onSetBrushOpacity?.(Math.round(preset.opacity * 100))
                    }}
                    className="rounded border border-gray-600 bg-gray-700/50 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-l border-gray-600 pl-4">
              <Slider
                label="Size"
                value={brushSize}
                min={1}
                max={50}
                onChange={(value) => actions?.onSetBrushSize?.(value)}
              />
            </div>

            <div className="border-l border-gray-600 pl-4">
              <Slider
                label="Opacity"
                value={brushOpacity}
                min={10}
                max={100}
                onChange={(value) => actions?.onSetBrushOpacity?.(value)}
              />
            </div>

            <div className="border-l border-gray-600 pl-4">
              <ColorPicker
                value={brushColor}
                onChange={(color) => actions?.onSetBrushColor?.(color)}
                label="Color"
              />
            </div>
          </div>
        </div>
      )}

      {/* Shape Settings */}
      {['rectangle', 'circle', 'triangle', 'line'].includes(activeTool) && (
        <div className="border-t border-gray-600 bg-gray-800/50 px-4 py-2">
          <div className="flex flex-wrap items-center gap-4">
            <div className="border-r border-gray-600 pr-4">
              <ColorPicker
                value={fillColor}
                onChange={(color) => actions?.onSetFillColor?.(color)}
                label="Fill"
              />
            </div>

            <div className="border-r border-gray-600 pr-4">
              <ColorPicker
                value={strokeColor}
                onChange={(color) => actions?.onSetStrokeColor?.(color)}
                label="Stroke"
              />
            </div>

            <div>
              <Slider
                label="Stroke Width"
                value={strokeWidth}
                min={1}
                max={20}
                onChange={(value) => actions?.onSetStrokeWidth?.(value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}