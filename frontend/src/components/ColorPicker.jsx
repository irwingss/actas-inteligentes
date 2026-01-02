import React, { useState, useRef, useEffect } from 'react'
import { X, Check } from 'lucide-react'

/**
 * Color picker 2D avanzado con selector de hue y saturación/luminosidad
 * Ahora funciona como popover posicionado desde el elemento que lo invoca
 */
export function ColorPicker({ 
  initialColor = '#3b82f6',
  categoryName = 'Categoría',
  onSave,
  onClose,
  anchorEl = null // Elemento desde el cual posicionar el popover
}) {
  // Parsear HSL string (ej: "hsl(120, 70%, 45%)")
  const parseHsl = (hslString) => {
    const match = hslString.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
    if (match) {
      return {
        h: parseInt(match[1]),
        s: parseInt(match[2]),
        l: parseInt(match[3])
      }
    }
    return null
  }
  
  // Convertir HEX a HSL
  const hexToHsl = (hex) => {
    // Asegurar que el hex tenga el formato correcto
    if (!hex || !hex.startsWith('#')) return { h: 220, s: 70, l: 50 }
    
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h, s, l = (max + min) / 2
    
    if (max === min) {
      h = s = 0
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }
    
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    }
  }
  
  const hslToHex = (h, s, l) => {
    l /= 100
    const a = s * Math.min(l, 1 - l) / 100
    const f = n => {
      const k = (n + h / 30) % 12
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
      return Math.round(255 * color).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }
  
  // Detectar formato del color inicial y convertir a HSL
  const getInitialHsl = () => {
    if (initialColor.startsWith('hsl')) {
      return parseHsl(initialColor) || { h: 220, s: 70, l: 50 }
    } else if (initialColor.startsWith('#')) {
      return hexToHsl(initialColor)
    }
    return { h: 220, s: 70, l: 50 }
  }
  
  const initialHsl = getInitialHsl()
  const [hue, setHue] = useState(initialHsl.h)
  const [saturation, setSaturation] = useState(initialHsl.s)
  const [lightness, setLightness] = useState(initialHsl.l)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  
  const [isDraggingSL, setIsDraggingSL] = useState(false)
  const [isDraggingHue, setIsDraggingHue] = useState(false)
  const slPickerRef = useRef(null)
  const huePickerRef = useRef(null)
  
  const currentColor = hslToHex(hue, saturation, lightness)
  
  // Calcular posición del popover basado en el elemento ancla
  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect()
      const popoverWidth = 280
      const popoverHeight = 360
      
      let top = rect.bottom + 8
      let left = rect.left
      
      // Ajustar si se sale de la pantalla por la derecha
      if (left + popoverWidth > window.innerWidth) {
        left = window.innerWidth - popoverWidth - 16
      }
      
      // Ajustar si se sale de la pantalla por abajo
      if (top + popoverHeight > window.innerHeight) {
        top = rect.top - popoverHeight - 8
      }
      
      setPosition({ top, left })
    }
  }, [anchorEl])
  
  // Manejar movimiento en selector 2D (saturación/luminosidad)
  const handleSLMove = (e) => {
    if (!slPickerRef.current) return
    
    const rect = slPickerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
    
    const newSaturation = Math.round((x / rect.width) * 100)
    const newLightness = Math.round(100 - (y / rect.height) * 100)
    
    setSaturation(newSaturation)
    setLightness(newLightness)
  }
  
  // Manejar movimiento en selector de hue
  const handleHueMove = (e) => {
    if (!huePickerRef.current) return
    
    const rect = huePickerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const newHue = Math.round((x / rect.width) * 360)
    
    setHue(newHue)
  }
  
  // Event listeners para drag
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingSL) handleSLMove(e)
      if (isDraggingHue) handleHueMove(e)
    }
    
    const handleMouseUp = () => {
      setIsDraggingSL(false)
      setIsDraggingHue(false)
    }
    
    if (isDraggingSL || isDraggingHue) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSL, isDraggingHue])
  
  const handleSave = () => {
    onSave(currentColor)
    onClose()
  }
  
  return (
    <>
      {/* Overlay transparente para detectar clicks fuera */}
      <div 
        className="fixed inset-0 z-[10000]" 
        onClick={onClose}
      />
      
      {/* Popover del color picker */}
      <div 
        className="fixed z-[10001] bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: '280px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header compacto */}
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {categoryName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors ml-2"
          >
            <X className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Selector de Hue (gradiente de colores) */}
          <div>
            <label className="block text-[10px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Tono
            </label>
            <div
              ref={huePickerRef}
              className="relative h-5 rounded cursor-crosshair border border-slate-300 dark:border-slate-600"
              style={{
                background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
              }}
              onMouseDown={(e) => {
                setIsDraggingHue(true)
                handleHueMove(e)
              }}
            >
              {/* Indicador de posición */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white border border-slate-900 shadow-sm"
                style={{ left: `${(hue / 360) * 100}%`, transform: 'translateX(-50%)' }}
              />
            </div>
          </div>
          
          {/* Selector 2D (Saturación y Luminosidad) */}
          <div>
            <label className="block text-[10px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Saturación y Brillo
            </label>
            <div
              ref={slPickerRef}
              className="relative w-full aspect-square rounded cursor-crosshair border border-slate-300 dark:border-slate-600 overflow-hidden"
              style={{
                background: `
                  linear-gradient(to top, black, transparent),
                  linear-gradient(to right, white, hsl(${hue}, 100%, 50%))
                `
              }}
              onMouseDown={(e) => {
                setIsDraggingSL(true)
                handleSLMove(e)
              }}
            >
              {/* Indicador de posición */}
              <div
                className="absolute w-3 h-3 border-2 border-white rounded-full shadow-md"
                style={{
                  left: `${saturation}%`,
                  top: `${100 - lightness}%`,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)'
                }}
              />
            </div>
          </div>
          
          {/* Vista previa y valor HEX */}
          <div className="flex items-center gap-2">
            {/* Cuadro de vista previa */}
            <div
              className="w-10 h-10 rounded border-2 border-slate-300 dark:border-slate-600 flex-shrink-0 shadow-sm"
              style={{ backgroundColor: currentColor }}
            />
            
            {/* Valor HEX editable */}
            <div className="flex-1">
              <input
                type="text"
                value={currentColor}
                onChange={(e) => {
                  const hex = e.target.value
                  if (/^#[0-9A-F]{6}$/i.test(hex)) {
                    const hsl = hexToHsl(hex)
                    setHue(hsl.h)
                    setSaturation(hsl.s)
                    setLightness(hsl.l)
                  }
                }}
                className="w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                placeholder="#3b82f6"
              />
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
          >
            <Check className="w-3 h-3" />
            Aplicar
          </button>
        </div>
      </div>
    </>
  )
}
