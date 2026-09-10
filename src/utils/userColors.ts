/**
 * userColors.ts
 * Deterministic user-color assignment for modification tracking.
 * Each unique user (by name or email) always gets the same color from
 * a curated premium 8-color palette.
 */

export interface UserColorEntry {
  /** The primary hex color used for borders, badges, etc. */
  color: string
  /** A lighter version (rgba) used for background highlights in text */
  highlight: string
  /** Human-readable label */
  label: string
  /** Tailwind-like text-on-color for avatars/initials */
  textColor: string
}

/**
 * A curated palette of 8 distinctive, accessible colors.
 * Ordered so that the most visually distinct colors appear first.
 */
export const USER_COLOR_PALETTE: UserColorEntry[] = [
  { color: '#6366f1', highlight: 'rgba(99,102,241,0.18)',  label: 'Indigo', textColor: '#ffffff' },
  { color: '#f43f5e', highlight: 'rgba(244,63,94,0.18)',   label: 'Rose',   textColor: '#ffffff' },
  { color: '#10b981', highlight: 'rgba(16,185,129,0.18)',  label: 'Emerald',textColor: '#ffffff' },
  { color: '#f59e0b', highlight: 'rgba(245,158,11,0.22)',  label: 'Amber',  textColor: '#1c1917' },
  { color: '#0ea5e9', highlight: 'rgba(14,165,233,0.18)',  label: 'Sky',    textColor: '#ffffff' },
  { color: '#a855f7', highlight: 'rgba(168,85,247,0.18)',  label: 'Purple', textColor: '#ffffff' },
  { color: '#14b8a6', highlight: 'rgba(20,184,166,0.18)',  label: 'Teal',   textColor: '#ffffff' },
  { color: '#fb923c', highlight: 'rgba(251,146,60,0.20)',  label: 'Orange', textColor: '#1c1917' },
]

/**
 * Simple string hash (djb2) → integer.
 * Deterministic: same string → same index.
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash |= 0 // convert to 32-bit signed int
  }
  return Math.abs(hash)
}

/**
 * Returns the UserColorEntry assigned to a given user identifier.
 * Normalizes to lower-case before hashing for consistency.
 *
 * @param userIdentifier  Display name or email of the user
 */
export function getUserColor(userIdentifier: string): UserColorEntry {
  if (!userIdentifier || userIdentifier.trim() === '') {
    return USER_COLOR_PALETTE[0]
  }
  const index = hashString(userIdentifier.trim().toLowerCase()) % USER_COLOR_PALETTE.length
  return USER_COLOR_PALETTE[index]
}

/**
 * Returns just the hex color string for a user.
 * Convenience wrapper around getUserColor.
 */
export function getUserHexColor(userIdentifier: string): string {
  return getUserColor(userIdentifier).color
}

/**
 * Returns the highlight (semi-transparent) color for text backgrounds.
 */
export function getUserHighlightColor(userIdentifier: string): string {
  return getUserColor(userIdentifier).highlight
}

/**
 * Generates initials from a display name or email.
 * "John Doe" → "JD", "john@example.com" → "J"
 */
export function getUserInitials(userIdentifier: string): string {
  if (!userIdentifier) return '?'
  const clean = userIdentifier.split('@')[0].trim()
  const parts = clean.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return clean.slice(0, 2).toUpperCase()
}
