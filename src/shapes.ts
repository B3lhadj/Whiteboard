export type ShapeKind =
  | 'text-box'
  | 'line'
  | 'line-down'
  | 'arrow'
  | 'arrow-down'
  | 'double-arrow'
  | 'double-arrow-down'
  | 'rectangle'
  | 'oval'
  | 'rounded-rectangle'
  | 'triangle'
  | 'elbow'
  | 'elbow-arrow'
  | 'left-arrow'
  | 'right-arrow'
  | 'down-arrow'
  | 's-curve'
  | 'arc'
  | 'brace-left'
  | 'brace-right'
  | 'star'
  | 'curve'
  | 'freeform'

export interface ShapeOption {
  value: ShapeKind
  label: string
  group: 'recent' | 'lines'
}

export const SHAPE_OPTIONS: ShapeOption[] = [
  { value: 'text-box', label: 'Text box', group: 'recent' },
  { value: 'line', label: 'Line', group: 'recent' },
  { value: 'arrow', label: 'Arrow', group: 'recent' },
  { value: 'rectangle', label: 'Rectangle', group: 'recent' },
  { value: 'oval', label: 'Oval', group: 'recent' },
  { value: 'rounded-rectangle', label: 'Rounded rectangle', group: 'recent' },
  { value: 'triangle', label: 'Triangle', group: 'recent' },
  { value: 'elbow', label: 'Elbow connector', group: 'recent' },
  { value: 'elbow-arrow', label: 'Elbow arrow', group: 'recent' },
  { value: 'right-arrow', label: 'Right arrow', group: 'recent' },
  { value: 'down-arrow', label: 'Down arrow', group: 'recent' },
  { value: 'freeform', label: 'Freeform', group: 'recent' },
  { value: 'curve', label: 'Curve', group: 'recent' },
  { value: 'brace-left', label: 'Left brace', group: 'recent' },
  { value: 'brace-right', label: 'Right brace', group: 'recent' },
  { value: 'star', label: 'Star', group: 'recent' },
  { value: 'line', label: 'Line', group: 'lines' },
  { value: 'arrow', label: 'Arrow', group: 'lines' },
  { value: 'line-down', label: 'Down line', group: 'lines' },
  { value: 'arrow-down', label: 'Down arrow', group: 'lines' },
  { value: 'double-arrow-down', label: 'Double down arrow', group: 'lines' },
  { value: 'double-arrow', label: 'Double arrow', group: 'lines' },
  { value: 'elbow', label: 'Elbow connector', group: 'lines' },
  { value: 'elbow-arrow', label: 'Elbow arrow', group: 'lines' },
  { value: 'left-arrow', label: 'Left arrow', group: 'lines' },
  { value: 's-curve', label: 'S curve', group: 'lines' },
  { value: 'arc', label: 'Arc', group: 'lines' },
  { value: 'curve', label: 'Curve', group: 'lines' },
  { value: 'freeform', label: 'Scribble', group: 'lines' },
  { value: 'brace-left', label: 'Left brace', group: 'lines' },
]

export const getShapeSize = (shape: ShapeKind) => {
  if (
    shape === 'line' ||
    shape === 'line-down' ||
    shape === 'arrow' ||
    shape === 'arrow-down' ||
    shape === 'double-arrow' ||
    shape === 'double-arrow-down'
  ) return { width: 150, height: 48 }
  if (shape === 'brace-left' || shape === 'brace-right') return { width: 70, height: 110 }
  return { width: 150, height: 92 }
}

export const getShapeSvg = (
  shape: ShapeKind,
  options: {
    width?: number
    height?: number
    stroke?: string
    strokeWidth?: number
    fill?: string
  } = {}
) => {
  const { width, height } = { ...getShapeSize(shape), ...options }
  const stroke = options.stroke || '#2563eb'
  const strokeWidth = options.strokeWidth || 4
  const fill = options.fill || 'rgba(37, 99, 235, 0.08)'
  const lineAttrs = `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"`
  const shapeAttrs = `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" fill="${fill}"`
  const marker = `
    <defs>
      <marker id="arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}" />
      </marker>
      <marker id="arrow-tail" markerWidth="10" markerHeight="10" refX="2" refY="5" orient="auto">
        <path d="M 10 0 L 0 5 L 10 10 z" fill="${stroke}" />
      </marker>
    </defs>
  `

  const content: Record<ShapeKind, string> = {
    'text-box': `<rect x="14" y="22" width="${width - 28}" height="${height - 44}" rx="2" ${lineAttrs} /><text x="24" y="${height / 2 + 7}" fill="${stroke}" font-size="24" font-family="Arial">A</text>`,
    line: `<line x1="12" y1="${height - 12}" x2="${width - 12}" y2="12" ${lineAttrs} />`,
    'line-down': `<line x1="12" y1="12" x2="${width - 12}" y2="${height - 12}" ${lineAttrs} />`,
    arrow: `<line x1="12" y1="${height - 12}" x2="${width - 14}" y2="12" ${lineAttrs} marker-end="url(#arrow-head)" />`,
    'arrow-down': `<line x1="12" y1="12" x2="${width - 14}" y2="${height - 12}" ${lineAttrs} marker-end="url(#arrow-head)" />`,
    'double-arrow': `<line x1="14" y1="${height - 12}" x2="${width - 14}" y2="12" ${lineAttrs} marker-start="url(#arrow-tail)" marker-end="url(#arrow-head)" />`,
    'double-arrow-down': `<line x1="14" y1="12" x2="${width - 14}" y2="${height - 12}" ${lineAttrs} marker-start="url(#arrow-tail)" marker-end="url(#arrow-head)" />`,
    rectangle: `<rect x="12" y="16" width="${width - 24}" height="${height - 32}" ${shapeAttrs} />`,
    oval: `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2 - 14}" ry="${height / 2 - 16}" ${shapeAttrs} />`,
    'rounded-rectangle': `<rect x="12" y="16" width="${width - 24}" height="${height - 32}" rx="14" ${shapeAttrs} />`,
    triangle: `<polygon points="${width / 2},12 ${width - 14},${height - 14} 14,${height - 14}" ${shapeAttrs} />`,
    elbow: `<polyline points="18,18 18,${height - 18} ${width - 18},${height - 18}" ${lineAttrs} />`,
    'elbow-arrow': `<polyline points="18,18 18,${height - 18} ${width - 18},${height - 18}" ${lineAttrs} marker-end="url(#arrow-head)" />`,
    'left-arrow': `<line x1="${width - 14}" y1="${height - 12}" x2="14" y2="12" ${lineAttrs} marker-end="url(#arrow-head)" />`,
    'right-arrow': `<polygon points="12,${height * 0.35} ${width * 0.62},${height * 0.35} ${width * 0.62},18 ${width - 12},${height / 2} ${width * 0.62},${height - 18} ${width * 0.62},${height * 0.65} 12,${height * 0.65}" ${shapeAttrs} />`,
    'down-arrow': `<polygon points="${width * 0.35},12 ${width * 0.65},12 ${width * 0.65},${height * 0.58} ${width - 18},${height * 0.58} ${width / 2},${height - 12} 18,${height * 0.58} ${width * 0.35},${height * 0.58}" ${shapeAttrs} />`,
    'brace-left': `<path d="M ${width - 18} 10 C 22 10 34 28 26 42 C 22 50 16 50 14 ${height / 2} C 16 ${height - 50} 22 ${height - 50} 26 ${height - 42} C 34 ${height - 28} 22 ${height - 10} ${width - 18} ${height - 10}" ${lineAttrs} />`,
    'brace-right': `<path d="M 18 10 C ${width - 22} 10 ${width - 34} 28 ${width - 26} 42 C ${width - 22} 50 ${width - 16} 50 ${width - 14} ${height / 2} C ${width - 16} ${height - 50} ${width - 22} ${height - 50} ${width - 26} ${height - 42} C ${width - 34} ${height - 28} ${width - 22} ${height - 10} 18 ${height - 10}" ${lineAttrs} />`,
    star: `<polygon points="${width / 2},12 ${width * 0.6},${height * 0.38} ${width - 14},${height * 0.38} ${width * 0.68},${height * 0.56} ${width * 0.78},${height - 14} ${width / 2},${height * 0.68} ${width * 0.22},${height - 14} ${width * 0.32},${height * 0.56} 14,${height * 0.38} ${width * 0.4},${height * 0.38}" ${shapeAttrs} />`,
    's-curve': `<path d="M 14 18 C ${width * 0.35} ${height - 8} ${width * 0.65} 6 ${width - 14} ${height - 18}" ${lineAttrs} />`,
    arc: `<path d="M 14 ${height - 18} C ${width * 0.3} 8 ${width * 0.72} 8 ${width - 14} ${height - 18}" ${lineAttrs} />`,
    curve: `<path d="M 14 ${height - 22} C ${width * 0.28} 8 ${width * 0.62} ${height + 12} ${width - 14} 18" ${lineAttrs} />`,
    freeform: `<path d="M 14 ${height - 24} C 34 18 54 ${height - 14} 76 26 S 120 12 ${width - 14} ${height - 30}" ${lineAttrs} />`,
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" aria-hidden="true">${marker}${content[shape]}</svg>`
}
