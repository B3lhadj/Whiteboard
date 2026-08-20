export interface CaptionWord {
  start: number
  end: number
  text: string
}

export interface CaptionCue {
  start: number
  end: number
  text: string
  words: CaptionWord[]
  timing: 'word' | 'cue' | 'estimated'
}

const asFiniteNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export const estimateWordTimings = (text: string, start: number, end: number): CaptionWord[] => {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const safeStart = Math.max(0, start)
  const safeEnd = Math.max(safeStart + 0.05, end)
  const weights = tokens.map((token) => Math.max(1, token.replace(/[^\p{L}\p{N}]/gu, '').length))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  let elapsedWeight = 0
  return tokens.map((token, index) => {
    const wordStart = safeStart + ((safeEnd - safeStart) * elapsedWeight) / totalWeight
    elapsedWeight += weights[index]
    const wordEnd = safeStart + ((safeEnd - safeStart) * elapsedWeight) / totalWeight
    return { start: wordStart, end: wordEnd, text: token }
  })
}

export const normalizeCaptionCues = (value: unknown): CaptionCue[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const cue = candidate as Record<string, unknown>
    const start = asFiniteNumber(cue.start)
    const end = asFiniteNumber(cue.end)
    const text = String(cue.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (start === null || end === null || !text) return []
    const safeStart = Math.max(0, start)
    const safeEnd = Math.max(safeStart + 0.05, end)
    const rawWords = Array.isArray(cue.words) ? cue.words : []
    const words = rawWords.flatMap((candidateWord) => {
      if (!candidateWord || typeof candidateWord !== 'object') return []
      const word = candidateWord as Record<string, unknown>
      const wordStart = asFiniteNumber(word.start)
      const wordEnd = asFiniteNumber(word.end)
      const wordText = String(word.text || '').trim()
      if (wordStart === null || wordEnd === null || !wordText) return []
      return [{
        start: Math.max(safeStart, wordStart),
        end: Math.min(safeEnd, Math.max(wordStart + 0.01, wordEnd)),
        text: wordText,
      }]
    }).filter((word) => word.end > word.start)

    return [{
      start: safeStart,
      end: safeEnd,
      text,
      words,
      timing: words.length > 0 ? 'word' as const : 'cue' as const,
    }]
  }).sort((left, right) => left.start - right.start || left.end - right.end)
}

export const buildEstimatedCaptionCues = (text: string, duration: number): CaptionCue[] => {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const chunks: string[] = []
  for (let index = 0; index < words.length; index += 8) {
    chunks.push(words.slice(index, index + 8).join(' '))
  }
  const safeDuration = Math.max(1, duration || chunks.length * 2)
  const cueDuration = safeDuration / chunks.length
  return chunks.map((textValue, index) => {
    const start = index * cueDuration
    const end = Math.min(safeDuration, (index + 1) * cueDuration)
    return { start, end, text: textValue, words: estimateWordTimings(textValue, start, end), timing: 'estimated' }
  })
}

export const replaceCaptionText = (cue: CaptionCue, text: string): CaptionCue => {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const words = tokens.length === cue.words.length
    ? cue.words.map((word, index) => ({ ...word, text: tokens[index] }))
    : estimateWordTimings(text, cue.start, cue.end)
  return { ...cue, text, words, timing: tokens.length === cue.words.length ? cue.timing : 'estimated' }
}

export const getActiveCaptionCueIndex = (cues: CaptionCue[], time: number) => cues.findIndex((cue) => (
  time >= cue.start && time < cue.end + 0.001
))
