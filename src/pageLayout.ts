export type PageOrientation = 'portrait' | 'landscape'
export type PageMarginPreset = 'normal' | 'narrow' | 'moderate' | 'wide'
export type PageSizePreset = 'a4' | 'letter' | 'legal' | 'screen16x9'
export type PageColumnCount = 1 | 2 | 3

export interface PageMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PageSizeOption {
  value: PageSizePreset
  label: string
  shortLabel: string
  width: number
  height: number
}

export const PAGE_MARGIN_OPTIONS: Array<{
  value: PageMarginPreset
  label: string
  description: string
  margins: PageMargins
}> = [
  {
    value: 'normal',
    label: 'Normal',
    description: '96 px',
    margins: { top: 96, right: 96, bottom: 96, left: 96 },
  },
  {
    value: 'narrow',
    label: 'Etroites',
    description: '48 px',
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
  },
  {
    value: 'moderate',
    label: 'Moderees',
    description: '72 px',
    margins: { top: 72, right: 64, bottom: 72, left: 64 },
  },
  {
    value: 'wide',
    label: 'Larges',
    description: '144 px',
    margins: { top: 144, right: 144, bottom: 144, left: 144 },
  },
]

export const PAGE_SIZE_OPTIONS: PageSizeOption[] = [
  {
    value: 'a4',
    label: 'A4',
    shortLabel: 'A4',
    width: 794,
    height: 1123,
  },
  {
    value: 'letter',
    label: 'Lettre',
    shortLabel: 'Letter',
    width: 816,
    height: 1056,
  },
  {
    value: 'legal',
    label: 'Legal',
    shortLabel: 'Legal',
    width: 816,
    height: 1344,
  },
  {
    value: 'screen16x9',
    label: 'Ecran 16:9',
    shortLabel: '16:9',
    width: 1120,
    height: 630,
  },
]

export const PAGE_COLUMN_OPTIONS: Array<{
  value: PageColumnCount
  label: string
  description: string
}> = [
  { value: 1, label: 'Une', description: '1 colonne' },
  { value: 2, label: 'Deux', description: '2 colonnes' },
  { value: 3, label: 'Trois', description: '3 colonnes' },
]

export const DEFAULT_PAGE_MARGIN_PRESET: PageMarginPreset = 'normal'
export const DEFAULT_PAGE_COLUMNS: PageColumnCount = 1

export function getPageMargins(preset: PageMarginPreset): PageMargins {
  return PAGE_MARGIN_OPTIONS.find((option) => option.value === preset)?.margins || PAGE_MARGIN_OPTIONS[0].margins
}

export function getPageSize(preset: PageSizePreset): PageSizeOption {
  return PAGE_SIZE_OPTIONS.find((option) => option.value === preset) || PAGE_SIZE_OPTIONS[0]
}

export function getDefaultPageSizeForFileType(fileType?: string | null): PageSizePreset {
  return fileType === 'pptx' ? 'screen16x9' : 'a4'
}
