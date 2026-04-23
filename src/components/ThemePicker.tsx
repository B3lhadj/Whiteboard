import { useDocumentStore, ThemeColor } from '../store'
import { X } from 'lucide-react'

interface ThemePickerProps {
  onClose: () => void
}

export default function ThemePicker({ onClose }: ThemePickerProps) {
  const selectedTheme = useDocumentStore((state) => state.selectedTheme)
  const setSelectedTheme = useDocumentStore((state) => state.setSelectedTheme)
  const darkMode = useDocumentStore((state) => state.darkMode)
  const toggleDarkMode = useDocumentStore((state) => state.toggleDarkMode)

  const themes: Array<{ name: ThemeColor; label: string; color: string }> = [
    { name: 'blue', label: 'Blue', color: '#3b82f6' },
    { name: 'green', label: 'Green', color: '#10b981' },
    { name: 'red', label: 'Red', color: '#ef4444' },
    { name: 'dark', label: 'Dark', color: '#1f2937' },
    { name: 'teal', label: 'Teal', color: '#14b8a6' },
    { name: 'purple', label: 'Purple', color: '#a855f7' },
    { name: 'amber', label: 'Amber', color: '#f59e0b' },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Theme Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Theme selector */}
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Color Theme</h3>
          <div className="grid grid-cols-4 gap-3">
            {themes.map((theme) => (
              <button
                key={theme.name}
                onClick={() => setSelectedTheme(theme.name)}
                className={`p-3 rounded-lg transition-all ${
                  selectedTheme === theme.name
                    ? 'ring-2 ring-offset-2 ring-blue-500 scale-105'
                    : 'hover:shadow-md'
                }`}
                style={{ backgroundColor: theme.color }}
                title={theme.label}
              >
                <span
                  className="text-xs font-medium"
                  style={{ color: ['dark'].includes(theme.name) ? '#fff' : '#000' }}
                >
                  {theme.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Dark mode toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
          <span className="font-medium text-gray-700">Dark Mode</span>
          <button
            onClick={toggleDarkMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              darkMode ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                darkMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Done
        </button>
      </div>
    </div>
  )
}
