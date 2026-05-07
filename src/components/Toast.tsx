import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
  color?: string
  duration?: number
}

interface ToastProps {
  message: ToastMessage
  onClose: (id: string) => void
}

function Toast({ message, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => {
        setIsVisible(false)
        onClose(message.id)
      }, 300)
    }, message.duration || 3000)

    return () => clearTimeout(timer)
  }, [message.id, message.duration, onClose])

  const getIcon = () => {
    switch (message.type) {
      case 'success':
        return <CheckCircle size={24} className="animate-pulse" />
      case 'error':
        return <AlertCircle size={24} className="animate-pulse" />
      case 'info':
        return <Info size={24} className="animate-pulse" />
    }
  }

  const bgColor = message.color || (
    message.type === 'success' ? '#10b981' :
    message.type === 'error' ? '#ef4444' :
    '#3b82f6'
  )

  const lightBg = bgColor

  const borderColor = bgColor

  if (!isVisible) return null

  return (
    <div
      className={`
        group relative overflow-hidden rounded-2xl border-2 px-6 py-4 shadow-2xl
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-full scale-95' : 'opacity-100 translate-x-0 scale-100'}
        hover:shadow-2xl hover:scale-105
      `}
      style={{
        backgroundColor: lightBg,
        borderColor: borderColor,
      }}
    >
      {/* Background gradient effect */}
      <div
        className="absolute inset-0 opacity-10 blur-xl transition-opacity group-hover:opacity-20"
        style={{ backgroundColor: bgColor }}
      />

      {/* Animated border gradient */}
      <div
        className="absolute top-0 left-0 h-1 w-full transition-all duration-300"
        style={{ backgroundColor: bgColor }}
      />

      <div className="relative flex items-start gap-4">
        {/* Icon container with animation */}
        <div
          className="flex-shrink-0 p-1 rounded-lg transition-all duration-300 bg-white/20"
        >
          <div className="text-white">
            {getIcon()}
          </div>
        </div>

        {/* Message content */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold leading-relaxed text-white"
          >
            {message.message}
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={() => {
            setIsExiting(true)
            setTimeout(() => {
              setIsVisible(false)
              onClose(message.id)
            }, 300)
          }}
          className="flex-shrink-0 p-2 rounded-lg opacity-60 transition-all hover:opacity-100 hover:bg-white/20 text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10 overflow-hidden">
        <div
          className="h-full transition-all bg-white"
          style={{
            animation: `shrink ${message.duration || 3000}ms linear forwards`,
          }}
        />
      </div>

      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  )
}

export function ToastContainer({ toasts, onClose }: { toasts: ToastMessage[]; onClose: (id: string) => void }) {
  return (
    <div className="fixed top-6 right-6 z-50 space-y-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast message={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  )
}
