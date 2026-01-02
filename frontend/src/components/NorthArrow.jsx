import React, { useState, useEffect } from 'react'
import { Move } from 'lucide-react'

/**
 * Brújula/North Arrow profesional para mapas
 * Draggable, posicionada en esquina superior izquierda por defecto
 */
export function NorthArrow({ className = '' }) {
  // Estado para posición draggable
  const [position, setPosition] = useState({ x: 20, y: 80 }) // Esquina superior izquierda
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // Handlers de drag
  const handleMouseDown = (e) => {
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }
  
  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }
  
  const handleMouseUp = () => {
    setIsDragging(false)
  }
  
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart])
  
  return (
    <div 
      className={`${className}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: 999
      }}
      onMouseDown={handleMouseDown}
      title="Arrastrar para mover"
    >
      {/* Contenedor con hover para indicar draggable */}
      <div className="relative group">
        {/* Icono de arrastre (visible al hover) */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded px-1 py-0.5 shadow">
          <Move className="w-3 h-3 text-slate-600" />
        </div>
        
        {/* Rosa de los vientos */}
        <svg width="60" height="60" viewBox="0 0 60 60" className="drop-shadow-lg">
          {/* Círculo exterior con fondo blanco opaco */}
          <circle cx="30" cy="30" r="28" fill="white" fillOpacity="0.95" stroke="#334155" strokeWidth="2" />
          
          {/* Puntos cardinales (N, S, E, W) */}
          <text x="30" y="10" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#dc2626">N</text>
          <text x="30" y="54" textAnchor="middle" fontSize="8" fill="#475569">S</text>
          <text x="52" y="34" textAnchor="middle" fontSize="8" fill="#475569">E</text>
          <text x="8" y="34" textAnchor="middle" fontSize="8" fill="#475569">W</text>
          
          {/* Flecha Norte (roja) */}
          <path
            d="M 30 8 L 25 30 L 30 28 L 35 30 Z"
            fill="#dc2626"
            stroke="#7f1d1d"
            strokeWidth="0.5"
          />
          
          {/* Flecha Sur (blanca con borde) */}
          <path
            d="M 30 52 L 35 30 L 30 32 L 25 30 Z"
            fill="white"
            stroke="#334155"
            strokeWidth="0.5"
          />
          
          {/* Líneas de división (sutiles) */}
          <line x1="30" y1="4" x2="30" y2="14" stroke="#94a3b8" strokeWidth="0.5" />
          <line x1="30" y1="46" x2="30" y2="56" stroke="#94a3b8" strokeWidth="0.5" />
          <line x1="4" y1="30" x2="14" y2="30" stroke="#94a3b8" strokeWidth="0.5" />
          <line x1="46" y1="30" x2="56" y2="30" stroke="#94a3b8" strokeWidth="0.5" />
        </svg>
      </div>
    </div>
  )
}
