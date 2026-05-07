import React, { useRef, useEffect, useState, useCallback } from 'react'
import styles from './TextColorPicker.module.scss'

interface TextColorPickerProps {
  onColorSelect?: (color: string) => void
  presetColors: string[]
  disabled?: boolean
  currentColor?: string
}

/**
 * Modern Text Color Picker with Draggable Custom Color Picker
 * Features:
 * - "A" button with color bar indicator
 * - Dropdown with preset colors
 * - Custom draggable color picker (HSL - Hue, Saturation, Lightness)
 * - Real-time color update as you drag
 * - Recent colors tracking
 * - Smooth animations and transitions
 */
export default function TextColorPicker({
  onColorSelect,
  presetColors,
  disabled = false,
  currentColor = '#000000',
}: TextColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedColor, setSelectedColor] = useState(currentColor)
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  
  // Custom color picker state
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(100)
  const [lightness, setLightness] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingHue, setIsDraggingHue] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const huePickerRef = useRef<HTMLDivElement>(null)

  // Convert HSV/HSL to Hex
  const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100
    l /= 100
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs((h / 60) % 2 - 1))
    const m = l - c / 2
    let r = 0, g = 0, b = 0
    
    if (0 <= h && h < 60) { r = c; g = x; b = 0 }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0 }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }
    
    const toHex = (n: number) => {
      const hex = Math.round((n + m) * 255).toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  // Convert Hex to HSL
  const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return { h: 0, s: 100, l: 50 }
    
    let r = parseInt(result[1], 16) / 255
    let g = parseInt(result[2], 16) / 255
    let b = parseInt(result[3], 16) / 255
    
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    const l = (max + min) / 2
    
    if (max === min) {
      h = 0
    } else {
      const d = max - min
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }
    
    return { h: h * 360, s: 100, l: l * 100 }
  }

  // Initialize HSL from currentColor
  useEffect(() => {
    const { h, s, l } = hexToHsl(currentColor)
    setHue(h)
    setSaturation(s)
    setLightness(l)
    setSelectedColor(currentColor)
  }, [currentColor])

  // Initialize recent colors from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('ribbon-recent-colors')
    if (stored) {
      try {
        setRecentColors(JSON.parse(stored))
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  // Handle clicking outside to close dropdown
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [isOpen])

  // Handle color picker drag (saturation & lightness)
  const handleColorPickerDrag = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDragging || !colorPickerRef.current) return
    
    const rect = colorPickerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    
    const newSaturation = x * 100
    const newLightness = (1 - y) * 100
    
    setSaturation(newSaturation)
    setLightness(newLightness)
    
    const newColor = hslToHex(hue, newSaturation, newLightness)
    setSelectedColor(newColor)
    onColorSelect?.(newColor)
  }, [isDragging, hue, onColorSelect])

  // Handle hue picker drag
  const handleHueDrag = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDraggingHue || !huePickerRef.current) return
    
    const rect = huePickerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newHue = x * 360
    
    setHue(newHue)
    const newColor = hslToHex(newHue, saturation, lightness)
    setSelectedColor(newColor)
    onColorSelect?.(newColor)
  }, [isDraggingHue, saturation, lightness, onColorSelect])

  // Global mouse move/up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) handleColorPickerDrag(e)
      if (isDraggingHue) handleHueDrag(e)
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
      setIsDraggingHue(false)
    }
    
    if (isDragging || isDraggingHue) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isDraggingHue, handleColorPickerDrag, handleHueDrag])

  const handleColorSelect = (color: string) => {
    setSelectedColor(color)
    onColorSelect?.(color)
    
    // Update HSL values
    const { h, s, l } = hexToHsl(color)
    setHue(h)
    setSaturation(s)
    setLightness(l)
    
    // Add to recent colors
    const updated = [color, ...recentColors.filter(c => c !== color)].slice(0, 8)
    setRecentColors(updated)
    localStorage.setItem('ribbon-recent-colors', JSON.stringify(updated))
    
    setIsOpen(false)
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 8,
        left: rect.left,
      })
    }
    
    setIsOpen(!isOpen)
  }

  const normalizeColor = (color: string): string => {
    if (color.startsWith('#')) return color.toLowerCase()
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return color.toLowerCase()
    ctx.fillStyle = color
    return ctx.fillStyle.toLowerCase()
  }

  const normalizedSelected = normalizeColor(selectedColor)
  const currentHslColor = hslToHex(hue, saturation, lightness)

  return (
    <div className={styles.containerWrapper} ref={containerRef}>
      <button
        ref={buttonRef}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleButtonClick}
        disabled={disabled}
        className={`${styles.textColorButton} ${isOpen ? styles.isOpen : ''}`}
        title="Text color"
        aria-label="Text color picker"
        aria-expanded={isOpen}
      >
        <span className={styles.colorButtonLabel}>A</span>
        <div
          className={styles.colorBar}
          style={{ backgroundColor: selectedColor }}
        />
      </button>

      {isOpen && (
        <div
          className={styles.dropdownContainer}
          style={{
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
          }}
        >
          {/* Preset Colors */}
          <div className={styles.colorSection}>
            <label className={styles.colorSectionTitle}>Colors</label>
            <div className={styles.colorGrid}>
              {presetColors.map((color, idx) => (
                <button
                  key={`preset-${idx}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleColorSelect(color)}
                  className={`${styles.colorPreset} ${
                    normalizeColor(color) === normalizedSelected ? styles.isSelected : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          {/* Custom Color Picker - Draggable */}
          <div className={styles.customColorSection}>
            <label className={styles.customColorLabel}>Custom Color</label>
            
            {/* Color Preview */}
            <div className={styles.colorPreviewContainer}>
              <div 
                className={styles.colorPreview}
                style={{ backgroundColor: selectedColor }}
              />
              <span className={styles.colorPreviewValue}>{selectedColor.toUpperCase()}</span>
            </div>

            {/* Saturation & Lightness Picker */}
            <div 
              ref={colorPickerRef}
              className={styles.colorPicker}
              style={{ 
                background: `linear-gradient(to right, #fff, ${hslToHex(hue, 100, 50)}),
                            linear-gradient(to top, #000, transparent)`,
                backgroundBlendMode: 'multiply'
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                setIsDragging(true)
                handleColorPickerDrag(e)
              }}
            >
              <div 
                className={styles.colorPickerHandle}
                style={{
                  left: `${saturation}%`,
                  top: `${100 - lightness}%`,
                  backgroundColor: selectedColor
                }}
              />
            </div>

            {/* Hue Slider */}
            <div className={styles.hueSliderContainer}>
              <div 
                ref={huePickerRef}
                className={styles.hueSlider}
                style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setIsDraggingHue(true)
                  handleHueDrag(e)
                }}
              >
                <div 
                  className={styles.hueHandle}
                  style={{ left: `${(hue / 360) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Recent Colors */}
          {recentColors.length > 0 && (
            <>
              <div className={styles.recentColorsSection}>
                <label className={styles.colorSectionTitle}>Recently Used</label>
                <div className={styles.recentColorGrid}>
                  {recentColors.map((color, idx) => (
                    <button
                      key={`recent-${idx}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleColorSelect(color)}
                      className={`${styles.recentColorItem} ${
                        normalizeColor(color) === normalizedSelected ? styles.isSelected : ''
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={`Recent color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}