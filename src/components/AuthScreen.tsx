import { useState } from 'react'
import { FileText, Lock, Mail, User } from 'lucide-react'
import { loginUser, registerUser, type AuthSession } from '../services/editAudit'

interface AuthScreenProps {
  onAuthenticated: (session: AuthSession) => void
}

type AuthMode = 'login' | 'register'

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isRegister = mode === 'register'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const session = isRegister
        ? await registerUser(displayName, email, password)
        : await loginUser(email, password)
      onAuthenticated(session)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl">
        <div className="border-b border-gray-200 bg-[#f3f4f6] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#2b579a] text-white">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-950">Office Editor</h1>
              <p className="text-sm text-gray-500">Sign in before opening your workspace</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-gray-200 text-sm font-semibold">
          <button
            className={`h-11 ${mode === 'login' ? 'bg-white text-[#2b579a]' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Login
          </button>
          <button
            className={`h-11 ${mode === 'register' ? 'bg-white text-[#2b579a]' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
            onClick={() => switchMode('register')}
            type="button"
          >
            Register
          </button>
        </div>

        <form className="space-y-4 px-6 py-6" onSubmit={handleSubmit}>
          {isRegister && (
            <label className="block text-sm font-medium text-gray-700">
              Name
              <span className="mt-1 flex h-11 items-center gap-2 rounded border border-gray-300 px-3 focus-within:border-[#2b579a] focus-within:ring-2 focus-within:ring-blue-100">
                <User size={16} className="text-gray-500" />
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="min-w-0 flex-1 outline-none"
                  placeholder="Your name"
                  required
                />
              </span>
            </label>
          )}

          <label className="block text-sm font-medium text-gray-700">
            Email
            <span className="mt-1 flex h-11 items-center gap-2 rounded border border-gray-300 px-3 focus-within:border-[#2b579a] focus-within:ring-2 focus-within:ring-blue-100">
              <Mail size={16} className="text-gray-500" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-w-0 flex-1 outline-none"
                placeholder="you@example.com"
                type="email"
                required
              />
            </span>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Password
            <span className="mt-1 flex h-11 items-center gap-2 rounded border border-gray-300 px-3 focus-within:border-[#2b579a] focus-within:ring-2 focus-within:ring-blue-100">
              <Lock size={16} className="text-gray-500" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 outline-none"
                minLength={6}
                placeholder="At least 6 characters"
                type="password"
                required
              />
            </span>
          </label>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            className="flex h-11 w-full items-center justify-center rounded bg-[#2b579a] px-4 text-sm font-semibold text-white hover:bg-[#244a82] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Please wait...' : isRegister ? 'Create account' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
