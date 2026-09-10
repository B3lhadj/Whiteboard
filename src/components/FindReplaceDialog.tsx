import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown, Search, Replace } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FindReplaceDialogProps {
  /** Whether the dialog is visible */
  open: boolean
  /** 'find' opens just the search pane; 'replace' shows both panes */
  mode?: 'find' | 'replace'
  /** Called when the user closes the dialog */
  onClose: () => void
  /**
   * Selector for the scrollable editor container in which to search.
   * Falls back to document.body if the selector yields nothing.
   */
  editorSelector?: string
}

interface Match {
  node: Text
  startOffset: number
  endOffset: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HIGHLIGHT_CLASS = 'fr-highlight'
const ACTIVE_CLASS    = 'fr-highlight-active'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Collect all text-node matches within a root element */
function findAllMatches(
  root: Element,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): Match[] {
  if (!query) return []

  const matches: Match[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // skip script / style / our own highlight spans
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const tag = parent.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT
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

/** Remove all highlight spans and restore original text nodes */
function clearHighlights(root: Element) {
  const spans = root.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`)
  spans.forEach((span) => {
    const parent = span.parentNode
    if (!parent) return
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    parent.removeChild(span)
  })
  // normalize merges adjacent text nodes
  root.normalize()
}

/** Wrap a text-node range in a <mark> highlight span */
function wrapMatch(match: Match, isActive: boolean): HTMLElement {
  const { node, startOffset, endOffset } = match
  const range = document.createRange()
  range.setStart(node, startOffset)
  range.setEnd(node, endOffset)
  const mark = document.createElement('mark')
  mark.className = `${HIGHLIGHT_CLASS}${isActive ? ` ${ACTIVE_CLASS}` : ''}`
  mark.style.cssText = isActive
    ? 'background:rgba(99,102,241,0.55);color:inherit;border-radius:2px;outline:2px solid #6366f1;'
    : 'background:rgba(253,224,71,0.55);color:inherit;border-radius:2px;'
  range.surroundContents(mark)
  return mark
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FindReplaceDialog({
  open,
  mode = 'find',
  onClose,
  editorSelector,
}: FindReplaceDialogProps) {
  // ── State ──
  const [findText, setFindText]           = useState('')
  const [replaceText, setReplaceText]     = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord]         = useState(false)
  const [showReplace, setShowReplace]     = useState(mode === 'replace')
  const [currentIndex, setCurrentIndex]  = useState(-1)
  const [totalMatches, setTotalMatches]   = useState(0)
  const [replaceMessage, setReplaceMessage] = useState('')
  // drag state
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  // ── Refs ──
  const matchesRef   = useRef<Match[]>([])
  const findInputRef = useRef<HTMLInputElement>(null)
  const dialogRef    = useRef<HTMLDivElement>(null)

  // ── Helpers ──
  const getRoot = useCallback((): Element => {
    if (editorSelector) {
      const el = document.querySelector(editorSelector)
      if (el) return el
    }
    // Try common editor containers
    const editorEl =
      document.querySelector('[data-editor-shell]') ||
      document.querySelector('[contenteditable="true"]') ||
      document.body
    return editorEl
  }, [editorSelector])

  // Re-highlight whenever query or options change
  const highlight = useCallback(
    (query: string, index: number) => {
      const root = getRoot()
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

      const clampedIndex = index < 0 ? 0 : index % matches.length
      setCurrentIndex(clampedIndex)

      // We must highlight in reverse DOM order to avoid offset drift after DOM mutations
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          const mark = wrapMatch(matches[i], i === clampedIndex)
          if (i === clampedIndex) {
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        } catch {
          // text node may have changed; skip
        }
      }
    },
    [caseSensitive, wholeWord, getRoot],
  )

  // ── Effects ──

  // Sync mode prop → showReplace
  useEffect(() => {
    setShowReplace(mode === 'replace')
  }, [mode])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => findInputRef.current?.focus(), 60)
    }
  }, [open])

  // Re-run highlight when query or options change
  useEffect(() => {
    if (!open) return
    highlight(findText, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findText, caseSensitive, wholeWord, open])

  // Clear highlights when dialog closes
  useEffect(() => {
    if (!open) {
      try { clearHighlights(getRoot()) } catch { /* noop */ }
      setFindText('')
      setReplaceText('')
      setCurrentIndex(-1)
      setTotalMatches(0)
      setReplaceMessage('')
    }
  }, [open, getRoot])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // Escape always closes the dialog
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      // Enter / Shift+Enter navigation — only when focus is inside the dialog
      const dialogEl = document.getElementById('find-replace-dialog')
      const activeEl = document.activeElement
      const isInsideDialog = dialogEl && activeEl && dialogEl.contains(activeEl)
      if (isInsideDialog && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goNext() }
      if (isInsideDialog && e.key === 'Enter' && e.shiftKey)  { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, findText, currentIndex, totalMatches])

  // ── Navigation ──
  const goNext = () => {
    if (totalMatches === 0) { highlight(findText, 0); return }
    const next = (currentIndex + 1) % totalMatches
    highlight(findText, next)
  }

  const goPrev = () => {
    if (totalMatches === 0) { highlight(findText, 0); return }
    const prev = (currentIndex - 1 + totalMatches) % totalMatches
    highlight(findText, prev)
  }

  // ── Replace ──
  const replaceCurrent = () => {
    setReplaceMessage('')
    if (currentIndex < 0 || currentIndex >= matchesRef.current.length) return

    const match = matchesRef.current[currentIndex]
    // Find the active mark
    const root = getRoot()
    const activeMarks = root.querySelectorAll<HTMLElement>(`.${ACTIVE_CLASS}`)
    if (activeMarks.length > 0) {
      activeMarks[0].replaceWith(document.createTextNode(replaceText))
      root.normalize()
      // Dispatch input to trigger editor re-renders
      root.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (match) {
      // Fallback: directly patch text node
      try {
        const full = match.node.nodeValue || ''
        match.node.nodeValue =
          full.slice(0, match.startOffset) + replaceText + full.slice(match.endOffset)
      } catch { /* noop */ }
    }

    // Re-highlight after replacement
    setTimeout(() => highlight(findText, Math.min(currentIndex, totalMatches - 2)), 80)
    setReplaceMessage('Replaced 1 occurrence')
  }

  const replaceAll = () => {
    setReplaceMessage('')
    if (!findText.trim()) return
    const root = getRoot()

    // Work with actual DOM marks
    clearHighlights(root)
    const matches = findAllMatches(root, findText, caseSensitive, wholeWord)
    if (matches.length === 0) {
      setReplaceMessage('No matches found')
      return
    }

    // Replace in reverse order to preserve offsets
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        const m = matches[i]
        const full = m.node.nodeValue || ''
        m.node.nodeValue =
          full.slice(0, m.startOffset) + replaceText + full.slice(m.endOffset)
      } catch { /* noop */ }
    }
    root.normalize()
    root.dispatchEvent(new Event('input', { bubbles: true }))
    setReplaceMessage(`Replaced ${matches.length} occurrence${matches.length !== 1 ? 's' : ''}`)
    setCurrentIndex(-1)
    setTotalMatches(0)
    matchesRef.current = []
  }

  // ── Drag ──
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      setPos({
        x: dragOrigin.current.ox + (e.clientX - dragOrigin.current.mx),
        y: dragOrigin.current.oy + (e.clientY - dragOrigin.current.my),
      })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  // ── Render ──
  if (!open) return null

  const matchLabel = totalMatches === 0
    ? (findText ? 'No results' : '')
    : `${currentIndex + 1} of ${totalMatches}`

  return (
    <>
      {/* Inject highlight styles once */}
      <style>{`
        .fr-highlight { border-radius: 2px; }
        .fr-highlight-active { outline: 2px solid #6366f1; }
      `}</style>

      <div
        ref={dialogRef}
        id="find-replace-dialog"
        data-print-hidden="true"
        style={{
          position: 'fixed',
          top:  `${Math.max(8, 72 + pos.y)}px`,
          right: pos.x === 0 ? '16px' : undefined,
          left:  pos.x !== 0 ? `calc(100vw - 424px + ${pos.x}px)` : undefined,
          zIndex: 9999,
          width: 408,
          userSelect: dragging ? 'none' : 'auto',
        }}
        className="rounded-xl border border-indigo-200 bg-white/95 shadow-2xl backdrop-blur-sm"
      >
        {/* ── Header ── */}
        <div
          onMouseDown={startDrag}
          className="flex cursor-grab items-center gap-2 rounded-t-xl border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-2.5 active:cursor-grabbing"
        >
          <Search size={15} className="shrink-0 text-indigo-500" />
          <div className="flex flex-1 gap-1.5">
            <button
              onClick={() => setShowReplace(false)}
              className={`rounded px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                !showReplace
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-indigo-100 hover:text-indigo-700'
              }`}
            >
              Find
            </button>
            <button
              onClick={() => setShowReplace(true)}
              className={`flex items-center gap-1 rounded px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                showReplace
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-indigo-100 hover:text-indigo-700'
              }`}
            >
              <Replace size={11} />
              Replace
            </button>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title="Close (Esc)"
            id="find-replace-close-btn"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Find row ── */}
        <div className="space-y-2.5 p-4">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={findInputRef}
                id="find-replace-search-input"
                type="text"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Search…"
                className={`h-9 w-full rounded-lg border pl-3 pr-24 text-sm outline-none transition-shadow focus:ring-2 focus:ring-indigo-300 ${
                  findText && totalMatches === 0
                    ? 'border-rose-300 bg-rose-50/60 text-rose-700 placeholder:text-rose-400'
                    : 'border-gray-300 bg-white'
                }`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() }
                }}
              />
              {/* Match counter */}
              {findText && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400">
                  {matchLabel}
                </span>
              )}
            </div>

            {/* Prev / Next */}
            <button
              onClick={goPrev}
              disabled={totalMatches === 0}
              title="Previous match (Shift+Enter)"
              id="find-prev-btn"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={goNext}
              disabled={totalMatches === 0}
              title="Next match (Enter)"
              id="find-next-btn"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* ── Options row ── */}
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-1.5 select-none text-xs text-gray-600 hover:text-gray-900">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
                id="find-case-sensitive"
              />
              Aa Case
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 select-none text-xs text-gray-600 hover:text-gray-900">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
                id="find-whole-word"
              />
              [W] Whole word
            </label>
          </div>

          {/* ── Replace section ── */}
          {showReplace && (
            <>
              <div className="my-1 border-t border-dashed border-gray-200" />
              <div className="relative">
                <input
                  id="find-replace-replace-input"
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Replace with…"
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-3 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={replaceCurrent}
                  disabled={totalMatches === 0}
                  id="find-replace-one-btn"
                  className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-40"
                >
                  <Replace size={12} />
                  Replace
                </button>
                <button
                  onClick={replaceAll}
                  disabled={!findText || totalMatches === 0}
                  id="find-replace-all-btn"
                  className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40"
                >
                  Replace All
                </button>
              </div>

              {replaceMessage && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  {replaceMessage}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer hint ── */}
        <div className="rounded-b-xl border-t border-gray-100 bg-gray-50/70 px-4 py-1.5 text-[10px] text-gray-400">
          Enter next · Shift+Enter prev · Esc close
        </div>
      </div>
    </>
  )
}
