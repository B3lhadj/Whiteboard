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
  if (!query) return []
  const matches: Match[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const tag = parent.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT
      if (parent.classList.contains(HIGHLIGHT_CLASS)) return NodeFilter.FILTER_REJECT
      if (parent.classList.contains('word-edit-highlight')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const flags = caseSensitive ? 'g' : 'gi'
  let pattern: RegExp
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const boundary = wholeWord ? `\\b${escaped}\\b` : escaped
    pattern = new RegExp(boundary, flags)
  } catch { return [] }
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

function clearHighlights(root: Element) {
  const spans = root.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`)
  spans.forEach((span) => {
    const parent = span.parentNode
    if (!parent) return
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    parent.removeChild(span)
  })
  root.normalize()
}

function wrapMatch(match: Match, isActive: boolean): HTMLElement {
  const { node, startOffset, endOffset } = match
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
  try { range.surroundContents(mark) } catch { /* skip */ }
  return mark
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
    if (editorEl) return editorEl
    return (
      document.querySelector('.word-editor-root') ||
      document.querySelector('[contenteditable="true"]') ||
      document.body
    )
  }, [editorEl])

  const highlight = useCallback(
    (query: string, index: number) => {
      const root = getRoot()
      if (!root) return
      clearHighlights(root)
      if (!query.trim()) {
        matchesRef.current = []; setTotalMatches(0); setCurrentIndex(-1); return
      }
      const matches = findAllMatches(root, query, caseSensitive, wholeWord)
      matchesRef.current = matches
      setTotalMatches(matches.length)
      if (matches.length === 0) { setCurrentIndex(-1); return }
      const idx = ((index % matches.length) + matches.length) % matches.length
      setCurrentIndex(idx)
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          const mark = wrapMatch(matches[i], i === idx)
          if (i === idx) mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } catch { /* skip */ }
      }
    },
    [caseSensitive, wholeWord, getRoot],
  )

  useEffect(() => { setShowReplace(mode === 'replace') }, [mode])
  useEffect(() => { if (open) setTimeout(() => findInputRef.current?.focus(), 60) }, [open])
  useEffect(() => {
    if (!open) return
    setStatus(null)
    highlight(findText, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findText, caseSensitive, wholeWord, open])

  useEffect(() => {
    if (!open) {
      const root = getRoot()
      if (root) { try { clearHighlights(root) } catch { /* noop */ } }
      setFindText(''); setReplaceText(''); setCurrentIndex(-1); setTotalMatches(0); setStatus(null)
    }
  }, [open, getRoot])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      const dialogEl = document.getElementById('find-replace-dialog')
      const isInside = dialogEl?.contains(document.activeElement)
      if (isInside && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goNext() }
      if (isInside && e.key === 'Enter' && e.shiftKey) { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, findText, currentIndex, totalMatches])

  const goNext = () => {
    if (totalMatches === 0) { highlight(findText, 0); return }
    highlight(findText, currentIndex + 1)
  }
  const goPrev = () => {
    if (totalMatches === 0) { highlight(findText, 0); return }
    highlight(findText, currentIndex - 1)
  }

  const replaceCurrent = () => {
    setStatus(null)
    if (currentIndex < 0 || currentIndex >= matchesRef.current.length) return
    const root = getRoot()
    if (!root) return
    const activeMarks = root.querySelectorAll<HTMLElement>(`.${ACTIVE_CLASS}`)
    if (activeMarks.length > 0) {
      activeMarks[0].replaceWith(document.createTextNode(replaceText))
      root.normalize()
      root.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      const m = matchesRef.current[currentIndex]
      if (m) {
        try {
          const full = m.node.nodeValue || ''
          m.node.nodeValue = full.slice(0, m.startOffset) + replaceText + full.slice(m.endOffset)
        } catch { /* noop */ }
      }
    }
    setStatus({ type: 'success', msg: 'Remplacement effectué (1 occurrence)' })
    setTimeout(() => highlight(findText, Math.min(currentIndex, totalMatches - 2)), 80)
  }

  const replaceAll = () => {
    setStatus(null)
    if (!findText.trim()) return
    const root = getRoot()
    if (!root) return
    clearHighlights(root)
    const matches = findAllMatches(root, findText, caseSensitive, wholeWord)
    if (matches.length === 0) { setStatus({ type: 'error', msg: 'Aucun résultat trouvé' }); return }
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        const m = matches[i]
        const full = m.node.nodeValue || ''
        m.node.nodeValue = full.slice(0, m.startOffset) + replaceText + full.slice(m.endOffset)
      } catch { /* noop */ }
    }
    root.normalize()
    root.dispatchEvent(new Event('input', { bubbles: true }))
    setStatus({ type: 'success', msg: `${matches.length} occurrence${matches.length > 1 ? 's' : ''} remplacée${matches.length > 1 ? 's' : ''}` })
    setCurrentIndex(-1); setTotalMatches(0); matchesRef.current = []
  }

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y }
    setDragging(true)
  }
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => setPos({
      x: dragOrigin.current.ox + (e.clientX - dragOrigin.current.mx),
      y: dragOrigin.current.oy + (e.clientY - dragOrigin.current.my),
    })
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  if (!open) return null

  const noResults = !!findText && totalMatches === 0
  const matchLabel = totalMatches > 0 ? `${currentIndex + 1} / ${totalMatches}` : noResults ? '0 résultat' : ''

  const css = `
    .fr-highlight { border-radius: 3px; }
    .fr-highlight-active { outline: 2.5px solid #6366f1; }
    #find-replace-dialog * { box-sizing: border-box; font-family: "Inter", "Segoe UI", system-ui, sans-serif; }
    .fr-tab-btn { position:relative; padding:5px 12px; font-size:12px; font-weight:600; color:#6b7280; border-radius:8px; transition:all 0.15s; cursor:pointer; border:none; background:transparent; }
    .fr-tab-btn.active { color:#4f46e5; background:#eef2ff; }
    .fr-tab-btn:hover:not(.active) { color:#374151; background:#f3f4f6; }
    .fr-input { height:38px; width:100%; border-radius:10px; border:1.5px solid #e5e7eb; background:#f9fafb; padding:0 12px; font-size:13px; outline:none; transition:border-color 0.15s,box-shadow 0.15s; color:#111827; }
    .fr-input:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); background:#fff; }
    .fr-input.error { border-color:#f87171; background:#fff5f5; color:#dc2626; }
    .fr-icon-btn { display:flex; align-items:center; justify-content:center; height:34px; width:34px; border-radius:8px; border:1.5px solid #e5e7eb; background:#fff; color:#4b5563; cursor:pointer; transition:all 0.15s; flex-shrink:0; }
    .fr-icon-btn:hover:not(:disabled) { background:#eef2ff; border-color:#c7d2fe; color:#4f46e5; }
    .fr-icon-btn:disabled { opacity:0.35; cursor:not-allowed; }
    .fr-toggle { display:flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:7px; border:1.5px solid transparent; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.15s; user-select:none; gap:4px; }
    .fr-toggle.on { border-color:#c7d2fe; background:#eef2ff; color:#4338ca; }
    .fr-toggle.off { border-color:#e5e7eb; background:#f9fafb; color:#6b7280; }
    .fr-toggle:hover { border-color:#a5b4fc; background:#f0f0ff; color:#4338ca; }
    .fr-btn { display:flex; align-items:center; justify-content:center; gap:6px; height:36px; flex:1; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; border:none; }
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
        style={{
          position: 'fixed',
          top: `${Math.max(8, 68 + pos.y)}px`,
          right: pos.x === 0 ? '20px' : undefined,
          left: pos.x !== 0 ? `calc(100vw - 420px + ${pos.x}px)` : undefined,
          zIndex: 9999,
          width: 400,
          userSelect: dragging ? 'none' : 'auto',
          borderRadius: 16,
          border: '1px solid rgba(99,102,241,0.2)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15), 0 4px 16px rgba(99,102,241,0.08)',
          background: '#fff',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          onMouseDown={startDrag}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 12px 10px 14px',
            background: 'linear-gradient(135deg, #f0f0ff 0%, #f5f3ff 100%)',
            borderBottom: '1px solid #e8e4ff',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            <button className={`fr-tab-btn${!showReplace ? ' active' : ''}`} onClick={() => setShowReplace(false)} id="fr-tab-find">
              <Search size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Rechercher
            </button>
            <button className={`fr-tab-btn${showReplace ? ' active' : ''}`} onClick={() => setShowReplace(true)} id="fr-tab-replace">
              <ArrowLeftRight size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Remplacer
            </button>
          </div>
          <GripHorizontal size={14} style={{ color: '#c4b5fd', flexShrink: 0 }} />
          <button
            onClick={onClose}
            id="find-replace-close-btn"
            title="Fermer (Échap)"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 7, border: 'none',
              background: 'transparent', color: '#9ca3af', cursor: 'pointer', flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = '#fee2e2'; b.style.color = '#dc2626' }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = '#9ca3af' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Search row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                color: noResults ? '#f87171' : '#9ca3af', pointerEvents: 'none',
              }} />
              <input
                ref={findInputRef}
                id="find-replace-search-input"
                type="text"
                value={findText}
                onChange={e => { setFindText(e.target.value); setStatus(null) }}
                placeholder="Rechercher dans le document…"
                className={`fr-input${noResults ? ' error' : ''}`}
                style={{ paddingLeft: 30, paddingRight: totalMatches > 0 ? 68 : 12 }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() } }}
              />
              {matchLabel && (
                <span style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 10, fontWeight: 700,
                  color: noResults ? '#ef4444' : '#6366f1',
                  background: noResults ? '#fee2e2' : '#eef2ff',
                  padding: '2px 7px', borderRadius: 6, pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}>
                  {matchLabel}
                </span>
              )}
            </div>
            <button className="fr-icon-btn" onClick={goPrev} disabled={totalMatches === 0} title="Précédent (Shift+Entrée)" id="find-prev-btn">
              <ChevronUp size={15} />
            </button>
            <button className="fr-icon-btn" onClick={goNext} disabled={totalMatches === 0} title="Suivant (Entrée)" id="find-next-btn">
              <ChevronDown size={15} />
            </button>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`fr-toggle${caseSensitive ? ' on' : ' off'}`} onClick={() => setCaseSensitive(v => !v)} id="find-case-sensitive" title="Respecter la casse">
              <CaseSensitive size={13} />
              Aa
            </button>
            <button className={`fr-toggle${wholeWord ? ' on' : ' off'}`} onClick={() => setWholeWord(v => !v)} id="find-whole-word" title="Mot entier uniquement">
              <WholeWord size={13} />
              Mot entier
            </button>
          </div>

          {/* Replace section */}
          {showReplace && (
            <>
              <div style={{ borderTop: '1px dashed #ede9fe', margin: '2px 0' }} />
              <div style={{ position: 'relative' }}>
                <ArrowLeftRight size={13} style={{
                  position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                  color: '#9ca3af', pointerEvents: 'none',
                }} />
                <input
                  id="find-replace-replace-input"
                  type="text"
                  value={replaceText}
                  onChange={e => setReplaceText(e.target.value)}
                  placeholder="Remplacer par…"
                  className="fr-input"
                  style={{ paddingLeft: 30 }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); replaceCurrent() } }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="fr-btn outline" onClick={replaceCurrent} disabled={totalMatches === 0} id="find-replace-one-btn">
                  <ArrowLeftRight size={13} />
                  Remplacer
                </button>
                <button className="fr-btn solid" onClick={replaceAll} disabled={!findText || totalMatches === 0} id="find-replace-all-btn">
                  Remplacer tout
                </button>
              </div>
              {status && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 500,
                  background: status.type === 'success' ? '#f0fdf4' : '#fff5f5',
                  color: status.type === 'success' ? '#15803d' : '#dc2626',
                  border: `1px solid ${status.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                }}>
                  {status.type === 'success'
                    ? <CheckCircle2 size={14} style={{ flexShrink: 0, color: '#16a34a' }} />
                    : <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  }
                  {status.msg}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '7px 16px', borderTop: '1px solid #f3f4f6', background: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>
            <kbd className="fr-kbd">Entrée</kbd> suivant &nbsp;·&nbsp;
            <kbd className="fr-kbd">⇧ Entrée</kbd> précédent &nbsp;·&nbsp;
            <kbd className="fr-kbd">Échap</kbd> fermer
          </span>
          {totalMatches > 0 && (
            <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700 }}>
              {totalMatches} résultat{totalMatches > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </>
  )
}