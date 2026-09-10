import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown, Search, ArrowLeftRight, CaseSensitive, WholeWord, AlertCircle, CheckCircle2, GripHorizontal } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FindReplaceDialogProps {
  open: boolean
  mode?: 'find' | 'replace'
  onClose: () => void
  /** Pass the editable root element directly for reliable targeting */
  editorEl?: HTMLElement | null
}

interface Match {
  node: Text
  startOffset: number
  endOffset: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HIGHLIGHT_CLASS = 'fr-highlight'
const ACTIVE_CLASS = 'fr-highlight-active'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findAllMatches(root: Element, query: string, caseSensitive: boolean, wholeWord: boolean): Match[] {
  if (!query || !root) return []
  const matches: Match[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const tag = parent.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT
      if (parent.closest('#find-replace-dialog')) return NodeFilter.FILTER_REJECT
      if (parent.classList.contains(HIGHLIGHT_CLASS)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const flags = caseSensitive ? 'g' : 'gi'
  let pattern: RegExp
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const boundary = wholeWord ? `\\b${escaped}\\b` : escaped
    pattern = new RegExp(boundary, flags)
  } catch {
    return []
  }

  let node = walker.nextNode() as Text | null
  while (node) {
    const text = node.nodeValue || ''
    let match: RegExpExecArray | null
    pattern.lastIndex = 0
    while ((match = pattern.exec(text)) !== null) {
      matches.push({ node, startOffset: match.index, endOffset: match.index + match[0].length })
    }
    node = walker.nextNode() as Text | null
  }
  return matches
}

function clearHighlights(root: Element | null) {
  if (!root || root === document.body) return
  try {
    const spans = root.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`)
    spans.forEach((span) => {
      const parent = span.parentNode
      if (!parent) return
      while (span.firstChild) parent.insertBefore(span.firstChild, span)
      parent.removeChild(span)
    })
    root.normalize()
  } catch {
    /* noop */
  }
}

function wrapMatch(match: Match, isActive: boolean): HTMLElement | null {
  try {
    const { node, startOffset, endOffset } = match
    if (!node.parentNode || !document.contains(node)) return null
    const textLen = (node.nodeValue || '').length
    if (startOffset < 0 || endOffset > textLen || startOffset >= endOffset) return null

    const range = document.createRange()
    range.setStart(node, startOffset)
    range.setEnd(node, endOffset)

    const mark = document.createElement('mark')
    mark.className = `${HIGHLIGHT_CLASS}${isActive ? ` ${ACTIVE_CLASS}` : ''}`
    if (isActive) {
      mark.style.cssText =
        'background:rgba(99,102,241,0.35);color:inherit;border-radius:3px;outline:2.5px solid #6366f1;outline-offset:1px;box-shadow:0 0 0 3px rgba(99,102,241,0.15);'
    } else {
      mark.style.cssText = 'background:rgba(251,191,36,0.4);color:inherit;border-radius:3px;'
    }
    range.surroundContents(mark)
    return mark
  } catch {
    return null
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FindReplaceDialog({ open, mode = 'find', onClose, editorEl }: FindReplaceDialogProps) {
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [showReplace, setShowReplace] = useState(mode === 'replace')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [totalMatches, setTotalMatches] = useState(0)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })
  const matchesRef = useRef<Match[]>([])
  const findInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const getRoot = useCallback((): Element | null => {
    if (editorEl && document.contains(editorEl)) return editorEl
    return (
      document.querySelector('[data-excel-editor="true"]') ||
      document.querySelector('[data-pdf-editor="true"]') ||
      document.querySelector('.word-editor-root') ||
      document.querySelector('[data-print-document="true"][contenteditable="true"]') ||
      document.querySelector('[data-editor-shell] [contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]') ||
      null
    )
  }, [editorEl])

  const highlight = useCallback(
    (query: string, index: number) => {
      const root = getRoot()
      if (!root) return
      clearHighlights(root)

      if (!query.trim()) {
        matchesRef.current = []
        setTotalMatches(0)
        setCurrentIndex(-1)
        return
      }

      const matches = findAllMatches(root, query, caseSensitive, wholeWord)
      matchesRef.current = matches
      setTotalMatches(matches.length)

      if (matches.length === 0) {
        setCurrentIndex(-1)
        return
      }

      const idx = ((index % matches.length) + matches.length) % matches.length
      setCurrentIndex(idx)

      // Group matches by text node and wrap in reverse offset order
      const byNode = new Map<Text, Match[]>()
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i]
        const list = byNode.get(m.node) || []
        list.push(m)
        byNode.set(m.node, list)
      }

      let activeMarkEl: HTMLElement | null = null
      for (const nodeMatches of byNode.values()) {
        // Sort descending by startOffset so earlier offsets are not displaced by splitting
        nodeMatches.sort((a, b) => b.startOffset - a.startOffset)
        for (const m of nodeMatches) {
          const matchIdx = matches.indexOf(m)
          const mark = wrapMatch(m, matchIdx === idx)
          if (matchIdx === idx && mark) {
            activeMarkEl = mark
          }
        }
      }

      if (activeMarkEl) {
        ;(activeMarkEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [caseSensitive, wholeWord, getRoot],
  )

  useEffect(() => {
    setShowReplace(mode === 'replace')
  }, [mode])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        findInputRef.current?.focus()
        findInputRef.current?.select()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Debounced search on query or option change
  useEffect(() => {
    if (!open) return
    setStatus(null)
    const timer = setTimeout(() => {
      highlight(findText, 0)
    }, 120)
    return () => clearTimeout(timer)
  }, [findText, caseSensitive, wholeWord, open, highlight])

  // Clear highlights when dialog closes
  useEffect(() => {
    if (!open) {
      const root = getRoot()
      if (root) clearHighlights(root)
      setFindText('')
      setReplaceText('')
      setCurrentIndex(-1)
      setTotalMatches(0)
      setStatus(null)
    }
  }, [open, getRoot])

  const goNext = () => {
    if (totalMatches === 0) {
      highlight(findText, 0)
      return
    }
    highlight(findText, currentIndex + 1)
  }

  const goPrev = () => {
    if (totalMatches === 0) {
      highlight(findText, 0)
      return
    }
    highlight(findText, currentIndex - 1)
  }

  const replaceCurrent = () => {
    setStatus(null)
    const root = getRoot()
    if (!root) return

    const activeMarks = root.querySelectorAll<HTMLElement>(`.${ACTIVE_CLASS}`)
    if (activeMarks.length > 0) {
      const mark = activeMarks[0]
      const cellTd = mark.closest<HTMLElement>('[data-excel-cell="true"]')
      const prevVal = cellTd ? cellTd.innerText : ''
      mark.replaceWith(document.createTextNode(replaceText))
      root.normalize()
      root.dispatchEvent(new Event('input', { bubbles: true }))

      if (cellTd) {
        const rowIndex = Number(cellTd.dataset.row ?? 0)
        const colIndex = Number(cellTd.dataset.col ?? 0)
        const sheetName = cellTd.dataset.sheet
        const newVal = cellTd.innerText
        window.dispatchEvent(
          new CustomEvent('excel-cell-replace', {
            detail: { sheetName, rowIndex, colIndex, prevValue: prevVal, newValue: newVal },
          })
        )
      }

      setStatus({ type: 'success', msg: 'Remplacement effectué (1 occurrence)' })
      setTimeout(() => highlight(findText, currentIndex), 80)
    } else if (currentIndex >= 0 && currentIndex < matchesRef.current.length) {
      const m = matchesRef.current[currentIndex]
      if (m && document.contains(m.node)) {
        try {
          const cellTd = (m.node.parentElement as HTMLElement | null)?.closest<HTMLElement>('[data-excel-cell="true"]')
          const prevVal = cellTd ? cellTd.innerText : ''
          const full = m.node.nodeValue || ''
          m.node.nodeValue = full.slice(0, m.startOffset) + replaceText + full.slice(m.endOffset)
          root.normalize()
          root.dispatchEvent(new Event('input', { bubbles: true }))

          if (cellTd) {
            const rowIndex = Number(cellTd.dataset.row ?? 0)
            const colIndex = Number(cellTd.dataset.col ?? 0)
            const sheetName = cellTd.dataset.sheet
            const newVal = cellTd.innerText
            window.dispatchEvent(
              new CustomEvent('excel-cell-replace', {
                detail: { sheetName, rowIndex, colIndex, prevValue: prevVal, newValue: newVal },
              })
            )
          }

          setStatus({ type: 'success', msg: 'Remplacement effectué (1 occurrence)' })
          setTimeout(() => highlight(findText, currentIndex), 80)
        } catch {
          /* noop */
        }
      }
    }
  }

  const replaceAll = () => {
    setStatus(null)
    if (!findText.trim()) return
    const root = getRoot()
    if (!root) return

    clearHighlights(root)
    const matches = findAllMatches(root, findText, caseSensitive, wholeWord)
    if (matches.length === 0) {
      setStatus({ type: 'error', msg: 'Aucun résultat trouvé' })
      return
    }

    // Group by text node and replace from highest offset to lowest
    const byNode = new Map<Text, Match[]>()
    for (const m of matches) {
      const list = byNode.get(m.node) || []
      list.push(m)
      byNode.set(m.node, list)
    }

    let count = 0
    const affectedExcelCells = new Map<HTMLElement, { prev: string }>()

    byNode.forEach((nodeMatches) => {
      nodeMatches.sort((a, b) => b.startOffset - a.startOffset)
      for (const m of nodeMatches) {
        try {
          const cellTd = (m.node.parentElement as HTMLElement | null)?.closest<HTMLElement>('[data-excel-cell="true"]')
          if (cellTd && !affectedExcelCells.has(cellTd)) {
            affectedExcelCells.set(cellTd, { prev: cellTd.innerText })
          }

          const full = m.node.nodeValue || ''
          m.node.nodeValue = full.slice(0, m.startOffset) + replaceText + full.slice(m.endOffset)
          count++
        } catch {
          /* noop */
        }
      }
    })

    root.normalize()
    root.dispatchEvent(new Event('input', { bubbles: true }))

    // Notify Excel of all cell changes
    affectedExcelCells.forEach((data, cellTd) => {
      const rowIndex = Number(cellTd.dataset.row ?? 0)
      const colIndex = Number(cellTd.dataset.col ?? 0)
      const sheetName = cellTd.dataset.sheet
      const newVal = cellTd.innerText
      window.dispatchEvent(
        new CustomEvent('excel-cell-replace', {
          detail: { sheetName, rowIndex, colIndex, prevValue: data.prev, newValue: newVal },
        })
      )
    })
    setStatus({
      type: 'success',
      msg: `${count} occurrence${count > 1 ? 's' : ''} remplacée${count > 1 ? 's' : ''}`,
    })
    setCurrentIndex(-1)
    setTotalMatches(0)
    matchesRef.current = []
  }

  const startDrag = (e: React.MouseEvent) => {
    // Only allow drag on header background or grip icon, not when clicking buttons
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) =>
      setPos({
        x: dragOrigin.current.ox + (e.clientX - dragOrigin.current.mx),
        y: dragOrigin.current.oy + (e.clientY - dragOrigin.current.my),
      })
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  if (!open) return null

  const noResults = !!findText && totalMatches === 0
  const matchLabel = totalMatches > 0 ? `${currentIndex + 1} / ${totalMatches}` : noResults ? '0 résultat' : ''

  const css = `
    .fr-highlight { border-radius: 3px; }
    .fr-highlight-active { outline: 2.5px solid #6366f1; }
    #find-replace-dialog * { box-sizing: border-box; font-family: "Inter", "Segoe UI", system-ui, sans-serif; }
    .fr-tab-btn { position:relative; padding:6px 14px; font-size:12px; font-weight:600; color:#6b7280; border-radius:8px; transition:all 0.15s; cursor:pointer; border:none; background:transparent; display:flex; align-items:center; gap:5px; }
    .fr-tab-btn.active { color:#4f46e5; background:#eef2ff; }
    .fr-tab-btn:hover:not(.active) { color:#374151; background:#f3f4f6; }
    .fr-input { height:38px; width:100%; border-radius:10px; border:1.5px solid #e5e7eb; background:#f9fafb; padding:0 12px; font-size:13px; outline:none; transition:border-color 0.15s,box-shadow 0.15s; color:#111827; }
    .fr-input:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.14); background:#fff; }
    .fr-input.error { border-color:#f87171; background:#fff5f5; color:#dc2626; }
    .fr-icon-btn { display:flex; align-items:center; justify-content:center; height:36px; width:36px; border-radius:8px; border:1.5px solid #e5e7eb; background:#fff; color:#4b5563; cursor:pointer; transition:all 0.15s; flex-shrink:0; }
    .fr-icon-btn:hover:not(:disabled) { background:#eef2ff; border-color:#c7d2fe; color:#4f46e5; }
    .fr-icon-btn:disabled { opacity:0.35; cursor:not-allowed; }
    .fr-toggle { display:flex; align-items:center; justify-content:center; padding:5px 12px; border-radius:8px; border:1.5px solid transparent; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; user-select:none; gap:5px; }
    .fr-toggle.on { border-color:#c7d2fe; background:#eef2ff; color:#4338ca; }
    .fr-toggle.off { border-color:#e5e7eb; background:#f9fafb; color:#6b7280; }
    .fr-toggle:hover { border-color:#a5b4fc; background:#f0f0ff; color:#4338ca; }
    .fr-btn { display:flex; align-items:center; justify-content:center; gap:6px; height:38px; flex:1; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; border:none; }
    .fr-btn.outline { background:#f5f3ff; color:#5b21b6; border:1.5px solid #ddd6fe; }
    .fr-btn.outline:hover:not(:disabled) { background:#ede9fe; border-color:#c4b5fd; }
    .fr-btn.solid { background:linear-gradient(135deg,#6366f1 0%,#7c3aed 100%); color:#fff; box-shadow:0 2px 8px rgba(99,102,241,0.3); }
    .fr-btn.solid:hover:not(:disabled) { background:linear-gradient(135deg,#4f46e5 0%,#6d28d9 100%); box-shadow:0 4px 12px rgba(99,102,241,0.4); }
    .fr-btn:disabled { opacity:0.4; cursor:not-allowed; }
    @keyframes fr-in { from { opacity:0; transform:translateY(-8px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
    #find-replace-dialog { animation:fr-in 0.18s ease; }
    kbd.fr-kbd { font-size:10px; background:#f3f4f6; border:1px solid #e5e7eb; border-bottom:2px solid #d1d5db; border-radius:4px; padding:1px 5px; font-family:monospace; }
  `

  return (
    <>
      <style>{css}</style>
      <div
        ref={dialogRef}
        id="find-replace-dialog"
        data-print-hidden="true"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }
        }}
        style={{
          position: 'fixed',
          top: `${Math.max(8, 68 + pos.y)}px`,
          right: pos.x === 0 ? '20px' : undefined,
          left: pos.x !== 0 ? `calc(100vw - 420px + ${pos.x}px)` : undefined,
          zIndex: 99999,
          width: 410,
          userSelect: dragging ? 'none' : 'auto',
          borderRadius: 16,
          border: '1px solid rgba(99,102,241,0.25)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(99,102,241,0.10)',
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          onMouseDown={startDrag}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 12px 10px 14px',
            background: 'linear-gradient(135deg, #f0f0ff 0%, #f5f3ff 100%)',
            borderBottom: '1px solid #e8e4ff',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            <button
              type="button"
              className={`fr-tab-btn${!showReplace ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setShowReplace(false)
              }}
              id="fr-tab-find"
            >
              <Search size={12} />
              Rechercher
            </button>
            <button
              type="button"
              className={`fr-tab-btn${showReplace ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setShowReplace(true)
              }}
              id="fr-tab-replace"
            >
              <ArrowLeftRight size={12} />
              Remplacer
            </button>
          </div>
          <GripHorizontal size={14} style={{ color: '#c4b5fd', flexShrink: 0 }} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            id="find-replace-close-btn"
            title="Fermer (Échap)"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget
              b.style.background = '#fee2e2'
              b.style.color = '#dc2626'
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget
              b.style.background = 'transparent'
              b.style.color = '#9ca3af'
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Search row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: noResults ? '#f87171' : '#9ca3af',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={findInputRef}
                id="find-replace-search-input"
                type="text"
                value={findText}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setFindText(e.target.value)
                  setStatus(null)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (e.shiftKey) goPrev()
                    else goNext()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                  }
                }}
                placeholder="Rechercher dans le document…"
                className={`fr-input${noResults ? ' error' : ''}`}
                style={{ paddingLeft: 34, paddingRight: totalMatches > 0 ? 74 : 12 }}
              />
              {matchLabel && (
                <span
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 11,
                    fontWeight: 700,
                    color: noResults ? '#ef4444' : '#6366f1',
                    background: noResults ? '#fee2e2' : '#eef2ff',
                    padding: '2px 8px',
                    borderRadius: 6,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {matchLabel}
                </span>
              )}
            </div>
            <button
              type="button"
              className="fr-icon-btn"
              onClick={(e) => {
                e.stopPropagation()
                goPrev()
              }}
              disabled={totalMatches === 0}
              title="Précédent (Shift+Entrée)"
              id="find-prev-btn"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className="fr-icon-btn"
              onClick={(e) => {
                e.stopPropagation()
                goNext()
              }}
              disabled={totalMatches === 0}
              title="Suivant (Entrée)"
              id="find-next-btn"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`fr-toggle${caseSensitive ? ' on' : ' off'}`}
              onClick={(e) => {
                e.stopPropagation()
                setCaseSensitive((v) => !v)
              }}
              id="find-case-sensitive"
              title="Respecter la casse"
            >
              <CaseSensitive size={14} />
              Respecter la casse
            </button>
            <button
              type="button"
              className={`fr-toggle${wholeWord ? ' on' : ' off'}`}
              onClick={(e) => {
                e.stopPropagation()
                setWholeWord((v) => !v)
              }}
              id="find-whole-word"
              title="Mot entier uniquement"
            >
              <WholeWord size={14} />
              Mot entier
            </button>
          </div>

          {/* Replace section */}
          {showReplace && (
            <>
              <div style={{ borderTop: '1px dashed #e8e4ff', margin: '2px 0' }} />
              <div style={{ position: 'relative' }}>
                <ArrowLeftRight
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  id="find-replace-replace-input"
                  type="text"
                  value={replaceText}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setReplaceText(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      replaceCurrent()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      onClose()
                    }
                  }}
                  placeholder="Remplacer par…"
                  className="fr-input"
                  style={{ paddingLeft: 34 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="fr-btn outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    replaceCurrent()
                  }}
                  disabled={totalMatches === 0}
                  id="find-replace-one-btn"
                >
                  <ArrowLeftRight size={13} />
                  Remplacer
                </button>
                <button
                  type="button"
                  className="fr-btn solid"
                  onClick={(e) => {
                    e.stopPropagation()
                    replaceAll()
                  }}
                  disabled={!findText || totalMatches === 0}
                  id="find-replace-all-btn"
                >
                  Remplacer tout
                </button>
              </div>
              {status && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 500,
                    background: status.type === 'success' ? '#f0fdf4' : '#fff5f5',
                    color: status.type === 'success' ? '#15803d' : '#dc2626',
                    border: `1px solid ${status.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                  }}
                >
                  {status.type === 'success' ? (
                    <CheckCircle2 size={15} style={{ flexShrink: 0, color: '#16a34a' }} />
                  ) : (
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  )}
                  {status.msg}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid #f3f4f6',
            background: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            <kbd className="fr-kbd">Entrée</kbd> suivant &nbsp;·&nbsp;
            <kbd className="fr-kbd">⇧ Entrée</kbd> précédent &nbsp;·&nbsp;
            <kbd className="fr-kbd">Échap</kbd> fermer
          </span>
          {totalMatches > 0 && (
            <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>
              {totalMatches} résultat{totalMatches > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </>
  )
}