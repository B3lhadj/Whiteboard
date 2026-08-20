import type { FileType } from '../store'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

interface EditAuditPayload {
  fileId: string
  fileName: string
  fileType: FileType
  action: string
  editor: string
  metadata?: Record<string, unknown>
}

export interface FileRecordPayload {
  fileId: string
  fileName: string
  fileType: FileType
  originalType?: FileType
  workflow?: string
  size: number
  contentBase64?: string
  contentType?: string
}

export interface EditAuditEvent {
  _id: string
  fileId: string
  fileName: string
  fileType: string
  action: string
  editor: string
  userId: string
  editorName?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface FileAuditRecord {
  _id?: string
  fileId: string
  fileName: string
  fileType: string
  originalType?: string
  workflow?: string
  size?: number
  uploadedBy?: {
    userId: string
    displayName: string
  }
  uploadedAt?: string
  contentStorage?: string
  contentGridFsId?: string
  contentType?: string
  contentSize?: number
  edited?: boolean
  editCount?: number
  shareCount?: number
  shared?: boolean
  lastEdit?: EditAuditEvent | null
}

export interface UserRecord {
  _id?: string
  userId: string
  displayName: string
  email?: string
  createdAt?: string
  updatedAt?: string
  lastSeenAt?: string
}

export interface AuthSession {
  token: string
  user: UserRecord
}

export interface FileShareRecord {
  _id: string
  fileId: string
  fileName: string
  fileType: string
  permission: 'view' | 'edit'
  accessToken?: string
  accessUrl?: string
  emailStatus?: {
    sent: boolean
    configured: boolean
    reason?: string
  }
  sharedBy: {
    userId: string
    displayName: string
    email?: string
  }
  sharedWith: {
    userId: string
    displayName: string
    email?: string
  }
  createdAt: string
  updatedAt: string
}

export interface EditStatus {
  success: boolean
  fileId: string
  file?: FileAuditRecord | null
  edited: boolean
  lastEdit: EditAuditEvent | null
  error?: string
}

export interface FileEditHistory extends EditStatus {
  events: EditAuditEvent[]
}

export interface SharedFileResponse {
  success: boolean
  share: FileShareRecord
  file: FileAuditRecord
  contentBase64: string
  downloadUrl: string
  error?: string
}

export interface UserShareHistory {
  success: boolean
  email: string
  received: FileShareRecord[]
  sent: FileShareRecord[]
  notificationCount: number
}

export interface ShareFileResult {
  success?: boolean
  share?: FileShareRecord
  event?: EditAuditEvent
  emailStatus?: FileShareRecord['emailStatus']
  accessUrl?: string
  error?: string
}

export const getEditorName = () => {
  const storedName = localStorage.getItem('editorUserName')?.trim()
  return storedName || 'Local user'
}

export const getEditorEmail = () => localStorage.getItem('editorUserEmail')?.trim() || ''

export const setEditorName = (name: string) => {
  const nextName = name.trim() || 'Local user'
  localStorage.setItem('editorUserName', nextName)
  return nextName
}

export const setEditorEmail = (email: string) => {
  const nextEmail = email.trim().toLowerCase()
  localStorage.setItem('editorUserEmail', nextEmail)
  return nextEmail
}

export const getAuthSession = (): AuthSession | null => {
  const stored = localStorage.getItem('authSession')
  if (!stored) return null

  try {
    return JSON.parse(stored) as AuthSession
  } catch {
    localStorage.removeItem('authSession')
    return null
  }
}

export const saveAuthSession = (session: AuthSession) => {
  localStorage.setItem('authSession', JSON.stringify(session))
  setEditorName(session.user.displayName)
  setEditorEmail(session.user.email || '')
}

export const clearAuthSession = () => {
  localStorage.removeItem('authSession')
}

const requestAuth = async (path: 'login' | 'register', payload: { displayName?: string; email: string; password: string }) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Authentication failed')
  }

  const session = { token: data.token, user: data.user } as AuthSession
  saveAuthSession(session)
  return session
}

export const loginUser = (email: string, password: string) => requestAuth('login', { email, password })

export const registerUser = (displayName: string, email: string, password: string) =>
  requestAuth('register', { displayName, email, password })

export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export const base64ToArrayBuffer = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

export const upsertUser = async (displayName = getEditorName(), email = getEditorEmail()): Promise<UserRecord | null> => {
  try {
    const nextName = displayName.trim() || 'Local user'
    const nextEmail = email.trim().toLowerCase()
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: nextEmail || nextName,
        editorName: nextName,
        displayName: nextName,
        email: nextEmail,
        editorEmail: nextEmail,
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    return data.user as UserRecord
  } catch (error) {
    console.warn('Could not save user:', error)
    return null
  }
}

export const getUsers = async (): Promise<UserRecord[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users`)
    if (!response.ok) return []

    const data = await response.json()
    return data.users as UserRecord[]
  } catch (error) {
    console.warn('Could not load users:', error)
    return []
  }
}

export const createFileRecord = async (payload: FileRecordPayload) => {
  try {
    const editorName = getEditorName()
    const response = await fetch(`${API_BASE_URL}/api/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        userId: getEditorEmail() || editorName,
        editorName,
        editorEmail: getEditorEmail(),
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    return data.file as FileAuditRecord
  } catch (error) {
    console.warn('Could not create file record:', error)
    return null
  }
}

export const logFileEdit = async (payload: EditAuditPayload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/edit-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        userId: getEditorEmail() || getEditorName(),
        editorName: getEditorName(),
        editorEmail: getEditorEmail(),
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    return data.event as EditAuditEvent
  } catch (error) {
    console.warn('Could not record edit event:', error)
    return null
  }
}

export const getFileEditStatus = async (fileId: string): Promise<EditStatus | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(fileId)}/edit-status`)
    if (!response.ok) return null

    return await response.json() as EditStatus
  } catch (error) {
    console.warn('Could not load edit status:', error)
    return null
  }
}

export const getFileEditEvents = async (fileId: string): Promise<FileEditHistory | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(fileId)}/edits`)
    if (!response.ok) return null

    return await response.json() as FileEditHistory
  } catch (error) {
    console.warn('Could not load edit history:', error)
    return null
  }
}

export const getFileShares = async (fileId: string): Promise<FileShareRecord[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(fileId)}/shares`)
    if (!response.ok) return []

    const data = await response.json()
    return data.shares as FileShareRecord[]
  } catch (error) {
    console.warn('Could not load file shares:', error)
    return []
  }
}

export const shareFile = async (
  fileId: string,
  sharedWithEmail: string,
  permission: 'view' | 'edit',
  sharedWithName = sharedWithEmail
): Promise<ShareFileResult | null> => {
  try {
    const editorName = getEditorName()
    const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(fileId)}/shares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedWith: sharedWithName,
        sharedWithName,
        sharedWithEmail,
        permission,
        userId: getEditorEmail() || editorName,
        editorName,
        editorEmail: getEditorEmail(),
      }),
    })

    const data = await response.json().catch(() => ({})) as ShareFileResult
    if (!response.ok || !data.share) return data

    return data
  } catch (error) {
    console.warn('Could not share file:', error)
    return null
  }
}

export const getShareEditorUrl = (share?: Pick<FileShareRecord, 'accessToken' | 'accessUrl'> | null, fallbackUrl = '') => {
  const rawUrl = share?.accessUrl || fallbackUrl
  const token = share?.accessToken || rawUrl.match(/\/shared\/([^/?#]+)/)?.[1]

  if (token && typeof window !== 'undefined') {
    return `${window.location.origin}/shared/${decodeURIComponent(token)}`
  }

  return rawUrl
}

export const getSharedFile = async (accessToken: string): Promise<SharedFileResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/shared/${encodeURIComponent(accessToken)}`)
  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Could not open shared file')
  }

  return data as SharedFileResponse
}

export const getUserShareHistory = async (email = getEditorEmail()): Promise<UserShareHistory | null> => {
  const nextEmail = email.trim().toLowerCase()
  if (!nextEmail) return null

  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(nextEmail)}/shares`)
    if (!response.ok) return null

    return await response.json() as UserShareHistory
  } catch (error) {
    console.warn('Could not load user share history:', error)
    return null
  }
}
export const saveFileContent = async (
  fileId: string,
  contentBase64: string,
  contentType: string,
  fileName: string,
  fileType: FileType
): Promise<{ success: boolean; error?: string } | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(fileId)}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentBase64,
        contentType,
        fileName,
        fileType,
        userId: getEditorEmail() || getEditorName(),
        editorName: getEditorName(),
        editorEmail: getEditorEmail(),
      }),
    })
    const data = await response.json().catch(() => ({}))
    return data
  } catch (error) {
    console.warn('Could not save file content:', error)
    return null
  }
}

export const getSenderShareAccess = async (
  fileId: string
): Promise<{ success: boolean; accessToken?: string; accessUrl?: string; error?: string } | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(fileId)}/sender-share`)
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.warn('Could not get sender share access:', error)
    return null
  }
}
