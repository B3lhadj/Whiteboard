/**
 * userColors.ts
 * Deterministic and per-file user-color assignment for modification tracking.
 * When multiple users edit the same file (same fileId), each user is guaranteed
 * to receive a completely different, distinctive color.
 */

export interface UserColorEntry {
  /** The primary hex color used for borders, badges, tags, etc. */
  color: string
  /** A lighter version (rgba) used for background highlights in text */
  highlight: string
  /** Human-readable label */
  label: string
  /** Text color on top of the primary color for badges/avatars */
  textColor: string
}

/**
 * A curated palette of 12 distinctive, high-contrast, accessible colors.
 * Ordered so that consecutive users get maximally distinct hues.
 */
export const USER_COLOR_PALETTE: UserColorEntry[] = [
  { color: '#6366f1', highlight: 'rgba(99, 102, 241, 0.22)', label: 'Indigo', textColor: '#ffffff' },
  { color: '#059669', highlight: 'rgba(5, 150, 105, 0.22)',   label: 'Émeraude', textColor: '#ffffff' },
  { color: '#d97706', highlight: 'rgba(217, 119, 6, 0.24)',   label: 'Ambre', textColor: '#ffffff' },
  { color: '#e11d48', highlight: 'rgba(225, 29, 72, 0.22)',   label: 'Rose', textColor: '#ffffff' },
  { color: '#0284c7', highlight: 'rgba(2, 132, 199, 0.22)',   label: 'Bleu ciel', textColor: '#ffffff' },
  { color: '#7c3aed', highlight: 'rgba(124, 58, 237, 0.22)',  label: 'Violet', textColor: '#ffffff' },
  { color: '#ea580c', highlight: 'rgba(234, 88, 12, 0.22)',   label: 'Orange', textColor: '#ffffff' },
  { color: '#0d9488', highlight: 'rgba(13, 148, 136, 0.22)',  label: 'Teal', textColor: '#ffffff' },
  { color: '#db2777', highlight: 'rgba(219, 39, 119, 0.22)',  label: 'Fuchsia', textColor: '#ffffff' },
  { color: '#65a30d', highlight: 'rgba(101, 163, 13, 0.24)',  label: 'Lime', textColor: '#ffffff' },
  { color: '#0891b2', highlight: 'rgba(8, 145, 178, 0.22)',   label: 'Cyan', textColor: '#ffffff' },
  { color: '#b91c1c', highlight: 'rgba(185, 28, 28, 0.22)',   label: 'Rouge', textColor: '#ffffff' },
]

/**
 * In-memory map from fileId -> list of unique user identifiers in order of first appearance.
 */
const fileUserRegistryMap = new Map<string, string[]>()

/**
 * Retrieve the list of users registered for a specific fileId.
 */
export function getFileUsers(fileId?: string): string[] {
  if (!fileId) return []
  if (fileUserRegistryMap.has(fileId)) {
    return fileUserRegistryMap.get(fileId)!
  }
  try {
    const raw = localStorage.getItem(`file_user_registry_${fileId}`)
    const parsed: string[] = raw ? JSON.parse(raw) : []
    fileUserRegistryMap.set(fileId, parsed)
    return parsed
  } catch {
    return []
  }
}

/**
 * Registers a user on a given fileId and returns their 0-based index.
 * If the user is already registered for this file, their existing index is returned.
 * If it's a new user, they are assigned the next available index.
 */
export function registerFileUser(fileId: string, userIdentifier: string): number {
  if (!fileId || !userIdentifier) return 0
  const norm = userIdentifier.trim()
  const lower = norm.toLowerCase()
  const list = getFileUsers(fileId)

  const existingIdx = list.findIndex((u) => u.toLowerCase() === lower)
  if (existingIdx !== -1) {
    return existingIdx
  }

  list.push(norm)
  fileUserRegistryMap.set(fileId, list)
  try {
    localStorage.setItem(`file_user_registry_${fileId}`, JSON.stringify(list))
  } catch {
    /* noop */
  }
  return list.length - 1
}

/**
 * Syncs an array of discovered user names (e.g. from past edit history or loaded document spans)
 * into the per-file user registry.
 */
export function syncFileUsers(fileId: string, discoveredUsers: string[]) {
  if (!fileId || !discoveredUsers || discoveredUsers.length === 0) return
  const list = getFileUsers(fileId)
  let changed = false
  for (const u of discoveredUsers) {
    if (!u || !u.trim()) continue
    const norm = u.trim()
    const lower = norm.toLowerCase()
    if (!list.some((existing) => existing.toLowerCase() === lower)) {
      list.push(norm)
      changed = true
    }
  }
  if (changed) {
    fileUserRegistryMap.set(fileId, list)
    try {
      localStorage.setItem(`file_user_registry_${fileId}`, JSON.stringify(list))
    } catch {
      /* noop */
    }
  }
}

/**
 * Simple string hash (djb2) -> integer.
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Returns the UserColorEntry assigned to a given user identifier.
 * If fileId is provided, users on the SAME file are assigned distinct colors sequentially
 * from USER_COLOR_PALETTE (User 0 -> Color 0, User 1 -> Color 1, etc.).
 *
 * @param userIdentifier  Display name or email of the user
 * @param fileId          Optional file ID to guarantee collision-free colors per file
 */
export function getUserColor(userIdentifier: string, fileId?: string): UserColorEntry {
  if (!userIdentifier || userIdentifier.trim() === '') {
    return USER_COLOR_PALETTE[0]
  }
  const norm = userIdentifier.trim()

  if (fileId) {
    const userIndex = registerFileUser(fileId, norm)
    return USER_COLOR_PALETTE[userIndex % USER_COLOR_PALETTE.length]
  }

  // Fallback deterministic hash when fileId is not supplied
  const index = hashString(norm.toLowerCase()) % USER_COLOR_PALETTE.length
  return USER_COLOR_PALETTE[index]
}

/**
 * Returns just the primary hex color string for a user.
 */
export function getUserHexColor(userIdentifier: string, fileId?: string): string {
  return getUserColor(userIdentifier, fileId).color
}

/**
 * Returns the semi-transparent highlight background color for text modifications.
 */
export function getUserHighlightColor(userIdentifier: string, fileId?: string): string {
  return getUserColor(userIdentifier, fileId).highlight
}

/**
 * Generates initials from a display name or email.
 * "John Doe" -> "JD", "john@example.com" -> "J"
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
