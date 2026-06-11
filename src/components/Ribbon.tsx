import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useDocumentStore } from '../store'
import { getEditorLanguageSettings, getThemeForFileType, normalizeEditorLanguage } from '../utils'
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
  Undo2,
  Redo2,
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
  Strikethrough,
  Subscript,
  Superscript,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Highlighter,
  List,
  ListOrdered,
  ListTree,
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
  Ruler,
  FileText,
  Columns,
  Languages,
} from 'lucide-react'
import {
  PAGE_COLUMN_OPTIONS,
  PAGE_MARGIN_OPTIONS,
  PAGE_SIZE_OPTIONS,
  type PageColumnCount,
  type PageMarginPreset,
  type PageOrientation,
  type PageSizePreset,
} from '../pageLayout'

export interface RibbonActions {
  onSave?: () => void | Promise<void>
  onSaveAs?: () => void | Promise<void>
  onOpen?: () => void
  onExport?: () => void | Promise<void>
  onPrint?: () => void | Promise<void>
  onZoomIn?: () => void
  onZoomOut?: () => void
  onUndoLast?: () => void
  onUndo?: (steps?: number) => void
  onRedo?: () => void
  undoHistory?: string[]
  undoAvailable?: boolean
  redoAvailable?: boolean
  onToggleBold?: () => void
  onToggleItalic?: () => void
  onToggleUnderline?: () => void
  onToggleStrikethrough?: () => void
  onToggleSubscript?: () => void
  onToggleSuperscript?: () => void
  onAlignLeft?: () => void
  onAlignCenter?: () => void
  onAlignRight?: () => void
  onAlignJustify?: () => void
  onSetFontFamily?: (font: string) => void
  onSetFontSize?: (size: number) => void
  onSetColor?: (color: string) => void
  onSetHighlight?: (color: string) => void
  onSetTextEffect?: (effect: TextEffectValue) => void
  onToggleBulletedList?: () => void
  onSetBulletedList?: (style: BulletListValue) => void
  onToggleNumberedList?: () => void
  onSetMultilevelList?: (style: MultilevelListValue) => void
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

export type TextEffectValue = 'none' | 'shadow' | 'glow' | 'outline' | 'lifted'
export type BulletListValue = 'none' | 'disc' | 'circle' | 'square' | 'arrow' | 'check' | 'diamond' | 'plus'
export type MultilevelListValue = 'decimal' | 'heading' | 'legal'

const TEXT_EFFECT_OPTIONS: RibbonMenuOption<TextEffectValue>[] = [
  { value: 'none', label: 'No effect', description: 'Remove text effects' },
  { value: 'shadow', label: 'Shadow', description: 'Soft drop shadow' },
  { value: 'glow', label: 'Glow', description: 'Blue text glow' },
  { value: 'outline', label: 'Outline', description: 'Thin text outline' },
  { value: 'lifted', label: 'Lifted', description: 'Raised highlight style' },
]

const HIGHLIGHT_OPTIONS = [
  { color: 'transparent', label: 'No highlight' },
  { color: '#fff59d', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bfdbfe', label: 'Blue' },
  { color: '#fecaca', label: 'Red' },
  { color: '#e9d5ff', label: 'Purple' },
  { color: '#fed7aa', label: 'Orange' },
]

const BULLET_LIBRARY_OPTIONS: Array<{
  value: BulletListValue
  label: string
  preview: string
}> = [
  { value: 'none', label: 'Aucune', preview: 'Aucune' },
  { value: 'disc', label: 'Puce pleine', preview: '\u25cf' },
  { value: 'circle', label: 'Puce vide', preview: '\u25cb' },
  { value: 'square', label: 'Carre', preview: '\u25a0' },
  { value: 'plus', label: 'Plus', preview: '\u2723' },
  { value: 'diamond', label: 'Losanges', preview: '\u2756' },
  { value: 'arrow', label: 'Fleche', preview: '\u27a4' },
  { value: 'check', label: 'Coche', preview: '\u2713' },
]

const MULTILEVEL_LIST_OPTIONS: RibbonMenuOption<MultilevelListValue>[] = [
  { value: 'decimal', label: '1. 1.1. 1.1.1', shortLabel: 'Numbered levels' },
  { value: 'heading', label: 'A. Heading 2 / 1. Heading', shortLabel: 'Heading levels' },
  { value: 'legal', label: 'Article I / Section 1.01', shortLabel: 'Legal levels' },
]

const LANGUAGE_OPTIONS = ['English', 'Arabic', 'French', 'Spanish'] as const

const RIBBON_TRANSLATIONS: Record<string, Record<string, string>> = {
  English: {},
  French: {
    'Home mode': 'Mode accueil',
    'Word mode': 'Mode Word',
    'PDF mode': 'Mode PDF',
    'PowerPoint mode': 'Mode PowerPoint',
    'Excel mode': 'Mode Excel',
    'Image mode': 'Mode image',
    File: 'Fichier',
    Quick: 'Rapide',
    Redo: 'Refaire',
    Image: 'Image',
    'Rotate Left': 'Tourner gauche',
    'Rotate Right': 'Tourner droite',
    Pan: 'Deplacer',
    'Reset View': 'Reinitialiser',
    Tools: 'Outils',
    Select: 'Selection',
    Shape: 'Forme',
    Draw: 'Dessin',
    Text: 'Texte',
    Erase: 'Effacer',
    Font: 'Police',
    Bold: 'Gras',
    Italic: 'Italique',
    Underline: 'Souligner',
    Strikethrough: 'Barre',
    Subscript: 'Indice',
    Superscript: 'Exposant',
    Left: 'Gauche',
    Center: 'Centre',
    Right: 'Droite',
    Justify: 'Justifier',
    Colors: 'Couleurs',
    Effects: 'Effets',
    Highlight: 'Surligner',
    Lists: 'Listes',
    Bullets: 'Puces',
    Numbering: 'Numerotation',
    Levels: 'Niveaux',
    'Mise en page': 'Mise en page',
    Marges: 'Marges',
    Orientation: 'Orientation',
    Taille: 'Taille',
    Colonnes: 'Colonnes',
    'Find & Replace': 'Rechercher',
    Replace: 'Remplacer',
    Find: 'Trouver',
    Language: 'Langue',
    Back: 'Retour',
    Account: 'Compte',
    Exit: 'Quitter',
    English: 'Anglais',
    Arabic: 'Arabe',
    French: 'Francais',
    Spanish: 'Espagnol',
    Undo: 'Annuler',
    'Undo history': 'Historique',
    'Aucune modification': 'Aucune modification',
    Annuler: 'Annuler',
    Light: 'Clair',
    Dark: 'Sombre',
  },
  Spanish: {
    'Home mode': 'Modo inicio',
    'Word mode': 'Modo Word',
    'PDF mode': 'Modo PDF',
    'PowerPoint mode': 'Modo PowerPoint',
    'Excel mode': 'Modo Excel',
    'Image mode': 'Modo imagen',
    File: 'Archivo',
    Quick: 'Rapido',
    Redo: 'Rehacer',
    Image: 'Imagen',
    'Rotate Left': 'Girar izq.',
    'Rotate Right': 'Girar der.',
    Pan: 'Mover',
    'Reset View': 'Restablecer',
    Tools: 'Herramientas',
    Select: 'Seleccionar',
    Shape: 'Forma',
    Draw: 'Dibujar',
    Text: 'Texto',
    Erase: 'Borrar',
    Font: 'Fuente',
    Bold: 'Negrita',
    Italic: 'Cursiva',
    Underline: 'Subrayar',
    Strikethrough: 'Tachado',
    Subscript: 'Subindice',
    Superscript: 'Superindice',
    Left: 'Izquierda',
    Center: 'Centro',
    Right: 'Derecha',
    Justify: 'Justificar',
    Colors: 'Colores',
    Effects: 'Efectos',
    Highlight: 'Resaltar',
    Lists: 'Listas',
    Bullets: 'Vinetas',
    Numbering: 'Numeracion',
    Levels: 'Niveles',
    'Mise en page': 'Diseno',
    Marges: 'Margenes',
    Orientation: 'Orientacion',
    Taille: 'Tamano',
    Colonnes: 'Columnas',
    'Find & Replace': 'Buscar',
    Replace: 'Reemplazar',
    Find: 'Buscar',
    Language: 'Idioma',
    Back: 'Atras',
    Account: 'Cuenta',
    Exit: 'Salir',
    English: 'Ingles',
    Arabic: 'Arabe',
    French: 'Frances',
    Spanish: 'Espanol',
    Undo: 'Deshacer',
    'Undo history': 'Historial',
    'Aucune modification': 'Sin cambios',
    Annuler: 'Cancelar',
    Light: 'Claro',
    Dark: 'Oscuro',
  },
  Arabic: {
    'Home mode': 'وضع البداية',
    'Word mode': 'وضع وورد',
    'PDF mode': 'وضع PDF',
    'PowerPoint mode': 'وضع باوربوينت',
    'Excel mode': 'وضع اكسل',
    'Image mode': 'وضع الصورة',
    File: 'ملف',
    Quick: 'سريع',
    Redo: 'اعادة',
    Image: 'صورة',
    'Rotate Left': 'تدوير يسار',
    'Rotate Right': 'تدوير يمين',
    Pan: 'تحريك',
    'Reset View': 'اعادة العرض',
    Tools: 'ادوات',
    Select: 'تحديد',
    Shape: 'شكل',
    Draw: 'رسم',
    Text: 'نص',
    Erase: 'مسح',
    Font: 'خط',
    Bold: 'غامق',
    Italic: 'مائل',
    Underline: 'تحته خط',
    Strikethrough: 'مشطوب',
    Subscript: 'منخفض',
    Superscript: 'مرتفع',
    Left: 'يسار',
    Center: 'وسط',
    Right: 'يمين',
    Justify: 'ضبط',
    Colors: 'الوان',
    Effects: 'تاثيرات',
    Highlight: 'تمييز',
    Lists: 'قوائم',
    Bullets: 'نقاط',
    Numbering: 'ترقيم',
    Levels: 'مستويات',
    'Mise en page': 'تخطيط',
    Marges: 'هوامش',
    Orientation: 'اتجاه',
    Taille: 'حجم',
    Colonnes: 'اعمدة',
    'Find & Replace': 'بحث',
    Replace: 'استبدال',
    Find: 'بحث',
    Language: 'اللغة',
    Back: 'رجوع',
    Account: 'حساب',
    Exit: 'خروج',
    English: 'الانجليزية',
    Arabic: 'العربية',
    French: 'الفرنسية',
    Spanish: 'الاسبانية',
    Undo: 'تراجع',
    'Undo history': 'السجل',
    'Aucune modification': 'لا تغييرات',
    Annuler: 'الغاء',
    Light: 'فاتح',
    Dark: 'داكن',
  },
}

const translateRibbon = (language: string, label: string) =>
  RIBBON_TRANSLATIONS[language]?.[label] || label

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
    strikeThrough: false,
    subscript: false,
    superscript: false,
  })
  const [selectedTextEffect, setSelectedTextEffect] = useState<TextEffectValue>('none')
  const [selectedBulletStyle, setSelectedBulletStyle] = useState<BulletListValue>('disc')
  const [selectedListStyle, setSelectedListStyle] = useState<MultilevelListValue>('decimal')
  const toggleDarkMode = useDocumentStore((state) => state.toggleDarkMode)
  const darkMode = useDocumentStore((state) => state.darkMode)
  const activeTool = useDocumentStore((state) => state.activeTool)
  const setActiveTool = useDocumentStore((state) => state.setActiveTool)
  const selectedLanguage = useDocumentStore((state) => state.selectedLanguage)
  const setSelectedLanguage = useDocumentStore((state) => state.setSelectedLanguage)
  const toolbarLanguage = normalizeEditorLanguage(selectedLanguage)
  const toolbarLanguageSettings = getEditorLanguageSettings(toolbarLanguage)
  const t = (label: string) => translateRibbon(toolbarLanguage, label)

  const themeColor = themeColorOverride || (fileType
    ? getThemeForFileType(fileType as any)
    : '#217346')

  const pageOrientation = useDocumentStore((state) => state.pageOrientation)
  const setPageOrientation = useDocumentStore((state) => state.setPageOrientation)
  const pageMarginPreset = useDocumentStore((state) => state.pageMarginPreset)
  const setPageMarginPreset = useDocumentStore((state) => state.setPageMarginPreset)
  const pageSize = useDocumentStore((state) => state.pageSize)
  const setPageSize = useDocumentStore((state) => state.setPageSize)
  const pageColumns = useDocumentStore((state) => state.pageColumns)
  const setPageColumns = useDocumentStore((state) => state.setPageColumns)

  const modeLabel =
    !fileType
      ? t('Home mode')
      :
    fileType === 'pptx'
      ? t('PowerPoint mode')
      : fileType === 'pdf'
      ? t('PDF mode')
      : fileType === 'xlsx'
      ? t('Excel mode')
      : fileType === 'image'
      ? t('Image mode')
      : t('Word mode')

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
        strikeThrough: document.queryCommandState('strikeThrough'),
        subscript: document.queryCommandState('subscript'),
        superscript: document.queryCommandState('superscript'),
      })
    }

    document.addEventListener('selectionchange', updateFormatState)
    updateFormatState()
    return () => document.removeEventListener('selectionchange', updateFormatState)
  }, [])

  return (
    <div
      key={toolbarLanguage}
      className="relative border-b border-gray-300 bg-white shadow-sm"
      data-print-hidden="true"
      lang={toolbarLanguageSettings.lang}
      dir={toolbarLanguageSettings.dir}
    >
      <div className="flex items-center justify-between gap-3 bg-[#f3f4f6] px-4 py-1.5 text-[11px] text-gray-600">
        <div className="flex items-center gap-2 font-medium">
          <Home size={14} />
          <span>{modeLabel}</span>
        </div>
        <button
          onClick={toggleDarkMode}
          className="rounded px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-white hover:shadow-sm"
          title={t('Toggle dark mode')}
        >
          {darkMode ? t('Light') : t('Dark')}
        </button>
      </div>

      <div className="flex items-stretch gap-0 overflow-x-auto px-2 py-2 text-white" style={{ backgroundColor: themeColor }}>
        <button
          onClick={() => setShowFileMenu(true)}
          className="mx-1 flex min-h-[76px] w-[74px] shrink-0 flex-col items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-white/20"
        >
          {t('File')}
        </button>

        <RibbonGroup label={t('Quick')}>
          <UndoHistoryButton
            history={actions?.undoHistory || []}
            undoLabel={t('Undo')}
            undoHistoryLabel={t('Undo history')}
            emptyLabel={t('Aucune modification')}
            cancelLabel={t('Annuler')}
            onUndoLast={actions?.onUndoLast}
            onUndo={actions?.onUndo}
            disabled={!actions?.onUndoLast || !actions?.undoAvailable}
          />
          <RibbonButton
            icon={<Redo2 size={18} />}
            label={t('Redo')}
            onClick={actions?.onRedo}
            disabled={!actions?.onRedo || !actions?.redoAvailable}
          />
        </RibbonGroup>

        {/* Image Controls - only show when file is image */}
        {fileType === 'image' && (
          <RibbonGroup label={t('Image')}>
            <RibbonButton 
              icon={<RotateCcw size={18} />} 
              label={t('Rotate Left')}
              onClick={actions?.onRotateLeft} 
              disabled={!actions?.onRotateLeft} 
            />
            <RibbonButton 
              icon={<RotateCw size={18} />} 
              label={t('Rotate Right')}
              onClick={actions?.onRotateRight} 
              disabled={!actions?.onRotateRight} 
            />
            <RibbonButton 
              icon={<Move size={18} />} 
              label={t('Pan')}
              onClick={actions?.onTogglePan}
              active={actions?.isPanActive}
              disabled={!actions?.onTogglePan}
            />
            <RibbonButton 
              icon={<RefreshCw size={18} />} 
              label={t('Reset View')}
              onClick={actions?.onResetPosition} 
              disabled={!actions?.onResetPosition} 
            />
          </RibbonGroup>
        )}

        <RibbonGroup label={t('Tools')}>
          <RibbonButton icon={<MousePointer2 size={18} />} label={t('Select')} active={activeTool === 'select'} onClick={() => { setActiveTool('select'); actions?.onSetTool?.('select') }} />
          <RibbonButton icon={<Square size={18} />} label={t('Shape')} active={activeTool === 'shape'} onClick={() => { setActiveTool('shape'); actions?.onSetTool?.('shape') }} />
          <RibbonButton icon={<Image size={18} />} label={t('Image')} active={activeTool === 'image'} onClick={() => { setActiveTool('image'); actions?.onSetTool?.('image') }} />
          <RibbonButton icon={<PenTool size={18} />} label={t('Draw')} active={activeTool === 'draw'} onClick={() => { setActiveTool('draw'); actions?.onSetTool?.('draw') }} />
          <RibbonButton icon={<Type size={18} />} label={t('Text')} active={activeTool === 'text'} onClick={() => { setActiveTool('text'); actions?.onSetTool?.('text') }} />
          <RibbonButton icon={<Eraser size={18} />} label={t('Erase')} active={activeTool === 'erase'} onClick={() => { setActiveTool('erase'); actions?.onSetTool?.('erase') }} />
        </RibbonGroup>

        <RibbonGroup label={t('Font')}>
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
            <RibbonButton icon={<Bold size={16} />} label={t('Bold')} compact active={formatState.bold} onClick={actions?.onToggleBold} disabled={!actions?.onToggleBold} />
            <RibbonButton icon={<Italic size={16} />} label={t('Italic')} compact active={formatState.italic} onClick={actions?.onToggleItalic} disabled={!actions?.onToggleItalic} />
            <RibbonButton icon={<Underline size={16} />} label={t('Underline')} compact active={formatState.underline} onClick={actions?.onToggleUnderline} disabled={!actions?.onToggleUnderline} />
            <RibbonButton icon={<Strikethrough size={16} />} label={t('Strikethrough')} compact active={formatState.strikeThrough} onClick={actions?.onToggleStrikethrough} disabled={!actions?.onToggleStrikethrough} />
            <RibbonButton icon={<Subscript size={16} />} label={t('Subscript')} compact active={formatState.subscript} onClick={actions?.onToggleSubscript} disabled={!actions?.onToggleSubscript} />
            <RibbonButton icon={<Superscript size={16} />} label={t('Superscript')} compact active={formatState.superscript} onClick={actions?.onToggleSuperscript} disabled={!actions?.onToggleSuperscript} />
          </div>
          <div className="mt-1 flex items-center gap-1">
            <RibbonButton icon={<AlignLeft size={16} />} label={t('Left')} compact onClick={actions?.onAlignLeft} disabled={!actions?.onAlignLeft} />
            <RibbonButton icon={<AlignCenter size={16} />} label={t('Center')} compact onClick={actions?.onAlignCenter} disabled={!actions?.onAlignCenter} />
            <RibbonButton icon={<AlignRight size={16} />} label={t('Right')} compact onClick={actions?.onAlignRight} disabled={!actions?.onAlignRight} />
            <RibbonButton icon={<AlignJustify size={16} />} label={t('Justify')} compact onClick={actions?.onAlignJustify} disabled={!actions?.onAlignJustify} />
          </div>
        </RibbonGroup>

        <RibbonGroup label={t('Colors')}>
          <OfficeColorPicker onSetColor={actions?.onSetColor} themeColor={themeColor} />
          <RibbonMenuButton<TextEffectValue>
            icon={<span className="text-lg font-semibold leading-none drop-shadow-[0_0_3px_rgba(255,255,255,0.85)]">A</span>}
            label={t('Effects')}
            value={selectedTextEffect}
            options={TEXT_EFFECT_OPTIONS}
            onSelect={(effect) => {
              setSelectedTextEffect(effect)
              actions?.onSetTextEffect?.(effect)
            }}
            disabled={!actions?.onSetTextEffect}
          />
          <HighlightMenuButton label={t('Highlight')} onSelect={actions?.onSetHighlight} disabled={!actions?.onSetHighlight} />
        </RibbonGroup>

        <RibbonGroup label={t('Lists')}>
          <BulletLibraryMenuButton
            label={t('Bullets')}
            value={selectedBulletStyle}
            onSelect={(style) => {
              setSelectedBulletStyle(style)
              actions?.onSetBulletedList?.(style)
            }}
            onToggle={actions?.onToggleBulletedList}
            disabled={!actions?.onSetBulletedList && !actions?.onToggleBulletedList}
          />
          <RibbonButton icon={<ListOrdered size={18} />} label={t('Numbering')} onClick={actions?.onToggleNumberedList} disabled={!actions?.onToggleNumberedList} />
          <RibbonMenuButton<MultilevelListValue>
            icon={<ListTree size={18} />}
            label={t('Levels')}
            value={selectedListStyle}
            options={MULTILEVEL_LIST_OPTIONS}
            onSelect={(style) => {
              setSelectedListStyle(style)
              actions?.onSetMultilevelList?.(style)
            }}
            disabled={!actions?.onSetMultilevelList}
          />
        </RibbonGroup>

        {(fileType === 'pdf' || fileType === 'pptx' || fileType === 'docx') && (
          <RibbonGroup label={t('Mise en page')}>
            <RibbonMenuButton<PageMarginPreset>
              icon={<Ruler size={18} />}
              label={t('Marges')}
              value={pageMarginPreset}
              options={PAGE_MARGIN_OPTIONS}
              onSelect={setPageMarginPreset}
            />
            <RibbonMenuButton<PageOrientation>
              icon={pageOrientation === 'portrait' ? <RotateCcw size={18} /> : <RotateCw size={18} />}
              label={t('Orientation')}
              value={pageOrientation}
              options={[
                { value: 'portrait', label: 'Portrait', description: 'Page verticale' },
                { value: 'landscape', label: 'Paysage', description: 'Page horizontale' },
              ]}
              onSelect={setPageOrientation}
            />
            <RibbonMenuButton<PageSizePreset>
              icon={<FileText size={18} />}
              label={t('Taille')}
              value={pageSize}
              options={PAGE_SIZE_OPTIONS}
              onSelect={setPageSize}
            />
            <RibbonMenuButton<PageColumnCount>
              icon={<Columns size={18} />}
              label={t('Colonnes')}
              value={pageColumns}
              options={PAGE_COLUMN_OPTIONS}
              onSelect={setPageColumns}
            />
          </RibbonGroup>
        )}

        <RibbonGroup label={t('Find & Replace')}>
          <RibbonButton icon={<Replace size={18} />} label={t('Replace')} onClick={actions?.onReplace} disabled={!actions?.onReplace} />
          <RibbonButton icon={<Search size={18} />} label={t('Find')} onClick={actions?.onFind} disabled={!actions?.onFind} />
        </RibbonGroup>

        <RibbonGroup label={t('Language')}>
          <LanguageMenuButton
            value={toolbarLanguage}
            label={t(toolbarLanguage)}
            options={LANGUAGE_OPTIONS.map((language) => ({
              value: language,
              label: t(language),
            }))}
            onSelect={(language) => {
              const nextLanguage = normalizeEditorLanguage(language)
              setSelectedLanguage(nextLanguage)
              actions?.onSetLanguage?.(nextLanguage)
            }}
          />
        </RibbonGroup>

        <RibbonGroup label={t('Back')} alignRight>
          <button
            onClick={actions?.onBack}
            disabled={!actions?.onBack}
            className="flex h-10 w-10 flex-col items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={t('Back')}
          >
            <ArrowLeft size={18} />
            <span className="text-[10px] font-medium text-white">{t('Back')}</span>
          </button>
        </RibbonGroup>

        <RibbonGroup label={t('Account')} alignRight>
          <button onClick={actions?.onLogout} className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-medium hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40" disabled={!actions?.onLogout}>
            <DoorOpen size={16} />
            {t('Exit')}
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

function HighlightMenuButton({
  label = 'Highlight',
  onSelect,
  disabled = false,
}: {
  label?: string
  onSelect?: (color: string) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedColor, setSelectedColor] = useState('#fff59d')
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    setMenuPosition({
      left: Math.max(8, Math.min(rect?.left || 0, window.innerWidth - 224)),
      top: (rect?.bottom || 0) + 6,
    })
    setIsOpen((current) => !current)
  }

  const chooseHighlight = (color: string) => {
    setSelectedColor(color === 'transparent' ? '#fff59d' : color)
    onSelect?.(color)
    setIsOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onMouseDown={(event) => event.preventDefault()}
        onClick={openMenu}
        disabled={disabled}
        className="group flex h-12 min-w-[78px] flex-col items-center justify-center rounded-lg px-2 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        title={label}
      >
        <span className="flex items-center gap-1">
          <span className="relative flex h-6 w-6 items-center justify-center">
            <Highlighter size={18} />
            <span
              className="absolute bottom-0 h-1 w-5 rounded-sm border border-white/30"
              style={{ backgroundColor: selectedColor }}
            />
          </span>
          <ChevronDown size={12} />
        </span>
        <span className="mt-1 max-w-[72px] truncate text-[10px] font-medium text-white/95">
          {label}
        </span>
      </button>

      {isOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close highlight menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-md border border-white/20 bg-white py-1 text-gray-800 shadow-2xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
              Highlight
            </div>
            {HIGHLIGHT_OPTIONS.map((option) => (
              <button
                key={option.color}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseHighlight(option.color)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <span
                  className="h-5 w-5 rounded-sm border border-gray-300"
                  style={{
                    backgroundColor: option.color === 'transparent' ? '#ffffff' : option.color,
                    backgroundImage:
                      option.color === 'transparent'
                        ? 'linear-gradient(135deg, transparent 45%, #ef4444 46%, #ef4444 54%, transparent 55%)'
                        : undefined,
                  }}
                />
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function BulletLibraryMenuButton({
  label = 'Bullets',
  value,
  onSelect,
  onToggle,
  disabled = false,
}: {
  label?: string
  value: BulletListValue
  onSelect?: (style: BulletListValue) => void
  onToggle?: () => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const selectedOption = BULLET_LIBRARY_OPTIONS.find((option) => option.value === value)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    setMenuPosition({
      left: Math.max(8, Math.min(rect?.left || 0, window.innerWidth - 396)),
      top: (rect?.bottom || 0) + 6,
    })
    setIsOpen((current) => !current)
  }

  const selectStyle = (style: BulletListValue) => {
    onSelect?.(style)
    setIsOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onMouseDown={(event) => event.preventDefault()}
        onClick={openMenu}
        disabled={disabled}
        className="group flex h-12 min-w-[78px] flex-col items-center justify-center rounded-lg px-2 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        title={`${label}: ${selectedOption?.label || ''}`}
      >
        <span className="flex items-center gap-1">
          <List size={18} />
          <ChevronDown size={12} />
        </span>
        <span className="mt-1 max-w-[72px] truncate text-[10px] font-medium text-white/95">
          {label}
        </span>
      </button>

      {isOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close bullets menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 w-[384px] max-w-[calc(100vw-16px)] overflow-hidden rounded-md border border-white/25 bg-[#262626] text-white shadow-2xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            <div className="px-5 pb-2 pt-3 text-sm font-semibold">
              Bibliotheque de puces
            </div>

            <div className="grid grid-cols-6 gap-2 px-3 pb-4">
              {BULLET_LIBRARY_OPTIONS.map((option) => {
                const isSelected = option.value === value
                return (
                  <button
                    key={option.value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectStyle(option.value)}
                    className={`flex h-[54px] items-center justify-center border bg-white text-black transition-colors hover:border-white ${
                      isSelected ? 'border-2 border-white ring-1 ring-white/70' : 'border-[#262626]'
                    }`}
                    title={option.label}
                  >
                    <span className={option.value === 'none' ? 'text-sm' : 'text-3xl leading-none'}>
                      {option.preview}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="border-t border-white/15 py-1">
              <button
                className="flex w-full cursor-not-allowed items-center justify-between px-5 py-2 text-left text-sm text-white/35"
                disabled
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">&lt;-&gt;</span>
                  Modifier le niveau de liste
                </span>
                <ChevronDown size={16} className="-rotate-90" />
              </button>
              <button
                className="flex w-full items-center gap-3 px-5 py-2 text-left text-sm text-white hover:bg-white/10"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onToggle?.()
                  setIsOpen(false)
                }}
              >
                <span className="w-5 text-center">*</span>
                Definir une puce...
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

interface RibbonMenuOption<T extends string | number> {
  value: T
  label: string
  description?: string
  shortLabel?: string
}

function RibbonMenuButton<T extends string | number>({
  icon,
  label,
  value,
  options,
  onSelect,
  disabled = false,
}: {
  icon: ReactNode
  label: string
  value: T
  options: RibbonMenuOption<T>[]
  onSelect: (value: T) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const selectedOption = options.find((option) => option.value === value) || options[0]

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    setMenuPosition({
      left: Math.max(8, Math.min(rect?.left || 0, window.innerWidth - 224)),
      top: (rect?.bottom || 0) + 6,
    })
    setIsOpen((current) => !current)
  }

  const selectOption = (optionValue: T) => {
    onSelect(optionValue)
    setIsOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onMouseDown={(event) => event.preventDefault()}
        onClick={openMenu}
        disabled={disabled}
        className="group flex h-12 min-w-[78px] flex-col items-center justify-center rounded-lg px-2 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        title={`${label}: ${selectedOption?.label || ''}`}
      >
        <span className="flex items-center gap-1">
          {icon}
          <ChevronDown size={12} />
        </span>
        <span className="mt-1 max-w-[72px] truncate text-[10px] font-medium text-white/95">
          {label}
        </span>
      </button>

      {isOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close layout menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-md border border-white/20 bg-white py-1 text-gray-800 shadow-2xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
              {label}
            </div>
            {options.map((option) => {
              const isSelected = option.value === value
              return (
                <button
                  key={String(option.value)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option.value)}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    isSelected ? 'bg-gray-100 font-semibold text-gray-950' : 'text-gray-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.shortLabel || option.label}</span>
                    {option.description && (
                      <span className="block truncate text-[11px] font-normal text-gray-500">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {isSelected && <span className="text-xs text-gray-500">*</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
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

function LanguageMenuButton({
  value,
  label,
  options,
  onSelect,
}: {
  value: string
  label: string
  options: Array<{ value: string; label: string }>
  onSelect: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    setMenuPosition({
      left: Math.max(8, Math.min(rect?.left || 0, window.innerWidth - 184)),
      top: (rect?.bottom || 0) + 6,
    })
    setIsOpen((current) => !current)
  }

  const chooseLanguage = (language: string) => {
    onSelect(language)
    setIsOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={openMenu}
        className="flex h-10 min-w-[116px] items-center justify-between gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-left text-[12px] font-semibold text-white outline-none hover:bg-white/20 focus:ring-2 focus:ring-white/50"
        title={label}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Languages size={16} className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown size={14} className="shrink-0" />
      </button>

      {isOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close language menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-sm text-gray-800 shadow-2xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            {options.map((option) => {
              const isSelected = normalizeEditorLanguage(option.value) === normalizeEditorLanguage(value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseLanguage(option.value)}
                  className={`flex h-9 w-full items-center justify-between gap-3 px-3 text-left hover:bg-blue-50 ${
                    isSelected ? 'bg-blue-600 text-white hover:bg-blue-600' : ''
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <span className="text-xs">*</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
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

function UndoHistoryButton({
  history,
  undoLabel = 'Undo',
  undoHistoryLabel = 'Undo history',
  emptyLabel = 'Aucune modification',
  cancelLabel = 'Annuler',
  onUndoLast,
  onUndo,
  disabled = false,
}: {
  history: string[]
  undoLabel?: string
  undoHistoryLabel?: string
  emptyLabel?: string
  cancelLabel?: string
  onUndoLast?: () => void
  onUndo?: (steps?: number) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLDivElement>(null)
  const items = history.length > 0 ? history : [emptyLabel]

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    setMenuPosition({
      left: Math.max(8, Math.min(rect?.left || 0, window.innerWidth - 224)),
      top: (rect?.bottom || 0) + 6,
    })
    setIsOpen((current) => !current)
  }

  const runUndo = (steps = 1) => {
    onUndo?.(steps)
    setIsOpen(false)
  }

  const runUndoLast = () => {
    onUndoLast?.()
    setIsOpen(false)
  }

  return (
    <div ref={buttonRef} className="relative flex h-10 w-[58px] overflow-hidden rounded-lg border border-white/20 bg-white/10 text-white">
      <button
        onMouseDown={(event) => event.preventDefault()}
        onClick={runUndoLast}
        disabled={disabled}
        className="flex flex-1 items-center justify-center hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        title={undoLabel}
      >
        <Undo2 size={18} />
      </button>
      <button
        onMouseDown={(event) => event.preventDefault()}
        onClick={openMenu}
        disabled={disabled}
        className="flex w-5 items-center justify-center border-l border-white/20 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        title={undoHistoryLabel}
      >
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close undo history"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 w-56 overflow-hidden rounded border border-white/25 bg-[#262626] py-1 text-sm text-white shadow-2xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            {items.slice(0, 8).map((item, index) => {
              const canUndoItem = history.length > 0
              return (
                <button
                  key={`${item}-${index}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => canUndoItem && runUndo(index + 1)}
                  disabled={!canUndoItem}
                  className="flex w-full items-center px-2 py-1.5 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/45"
                >
                  <span className="truncate">{item}</span>
                </button>
              )
            })}
            <div className="my-1 h-px bg-white/15" />
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center px-2 py-1.5 text-left hover:bg-white/10"
            >
              {cancelLabel}
            </button>
          </div>
        </>
      )}
    </div>
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
