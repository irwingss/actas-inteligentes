import React, { useState, useRef, useEffect } from 'react'
import { Move, Maximize2 } from 'lucide-react'

/**
 * Leyenda cartográfica profesional para modo de presentación
 * Draggable, resizable, con redistribución automática de columnas
 */
export function CartographicLegend({ 
  mapTitle = 'Mapa de Capas',
  codigoAccion = '',
  expediente = '',
  categories = [], // [{ key, name, color, layerName, visible, isSurvey }]
  onToggleCategory
}) {
  // Estados para posición y tamaño
  const [position, setPosition] = useState(() => ({
    x: window.innerWidth - 320, // Esquina inferior derecha
    y: window.innerHeight - 250
  }))
  const [size, setSize] = useState({ width: 300, height: 'auto' })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0, mouseX: 0, mouseY: 0 })
  
  const legendRef = useRef(null)
  
  const visibleCategories = categories.filter(c => c.visible !== false)
  
  if (visibleCategories.length === 0 && !mapTitle && !codigoAccion && !expediente) {
    return null
  }
  
  // Agrupar categorías por capa
  const categoryGroups = {}
  visibleCategories.forEach(cat => {
    const layerKey = cat.isSurvey ? '__survey__' : cat.layerName
    if (!categoryGroups[layerKey]) {
      categoryGroups[layerKey] = {
        layerName: cat.isSurvey ? cat.name : cat.layerName,
        categories: [],
        isSurvey: cat.isSurvey
      }
    }
    if (!cat.isSurvey) {
      categoryGroups[layerKey].categories.push(cat)
    }
  })
  
  // Calcular columnas basado en ANCHO disponible (responsive)
  const getColumnCount = (itemCount, availableWidth) => {
    const minColWidth = 120 // Ancho mínimo por columna
    const maxCols = Math.min(5, Math.floor(availableWidth / minColWidth))
    
    if (itemCount <= 4 || maxCols === 1) return 1
    if (itemCount <= 8 || maxCols === 2) return 2
    if (itemCount <= 15 || maxCols === 3) return 3
    if (itemCount <= 25 || maxCols === 4) return 4
    return 5
  }
  
  // Handlers de drag
  const handleMouseDown = (e) => {
    if (e.target.closest('.resize-handle') || e.target.closest('.no-drag')) return
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
    
    if (isResizing) {
      const deltaX = e.clientX - resizeStart.mouseX
      const deltaY = e.clientY - resizeStart.mouseY
      
      setSize({
        width: Math.max(200, Math.min(window.innerWidth * 0.58, resizeStart.width + deltaX)),
        height: Math.max(150, Math.min(window.innerHeight * 0.58, resizeStart.height + deltaY))
      })
    }
  }
  
  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(false)
  }
  
  const handleResizeStart = (e) => {
    e.stopPropagation()
    setIsResizing(true)
    const rect = legendRef.current.getBoundingClientRect()
    setResizeStart({
      width: rect.width,
      height: rect.height,
      mouseX: e.clientX,
      mouseY: e.clientY
    })
  }
  
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, dragStart, resizeStart])
  
  return (
    <div 
      ref={legendRef}
      className="bg-white rounded-md shadow-2xl border-2 border-slate-700 overflow-hidden relative"
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: size.width,
        height: size.height === 'auto' ? 'auto' : `${size.height}px`,
        maxWidth: '58vw',
        maxHeight: '58vh',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: 1000
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header compacto con título, logo e icono de arrastre */}
      <div className="px-3 py-2 bg-white border-b-2 border-slate-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Icono de arrastre */}
            <Move className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" title="Arrastrar para mover" />
            
            <div className="flex-1 min-w-0">
              <h3 className="text-[11px] font-bold text-slate-900 leading-tight uppercase tracking-wider">
                {mapTitle || 'Leyenda del Mapa'}
              </h3>
            
            {/* Metadatos compactos */}
            {(codigoAccion || expediente) && (
              <div className="mt-1 space-y-0.5 text-[9px] leading-tight">
                {codigoAccion && (
                  <div className="flex gap-1">
                    <span className="font-semibold text-slate-700">CA:</span>
                    <span className="text-slate-600">{codigoAccion}</span>
                  </div>
                )}
                {expediente && (
                  <div className="flex gap-1">
                    <span className="font-semibold text-slate-700">EXP:</span>
                    <span className="text-slate-600">{expediente}</span>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
          
          {/* Logo OEFA */}
          <div className="flex-shrink-0 no-drag">
            <img 
              src="./logo_oefa_light.png" 
              alt="OEFA" 
              className="h-10 w-auto object-contain"
            />
          </div>
        </div>
      </div>
      
      {/* Simbología - Estilo mapa impreso con scroll si necesario */}
      <div 
        className="px-3 py-2 bg-white overflow-y-auto"
        style={{
          maxHeight: size.height === 'auto' ? 'none' : `calc(${size.height}px - 100px)`
        }}
      >
        <div className="text-[9px] font-bold text-slate-900 uppercase tracking-wider mb-2 border-b border-slate-400 pb-1">
          Simbología
        </div>
        
        {/* Puntos Survey123 (si existen) */}
        {visibleCategories.some(c => c.isSurvey) && (
          <div className="mb-3">
            {visibleCategories.filter(c => c.isSurvey).map(survey => (
              <div key={survey.key} className="flex items-center gap-1.5">
                <svg width="10" height="14" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
                  <path 
                    d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" 
                    fill={survey.color}
                    stroke="#1e293b" 
                    strokeWidth="2"
                  />
                  <circle cx="12.5" cy="12.5" r="5" fill="#fff" opacity="0.9"/>
                </svg>
                <span className="text-[9px] text-slate-900 font-medium">{survey.name}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Capas con categorías agrupadas */}
        {Object.entries(categoryGroups).map(([layerKey, group]) => {
          if (group.isSurvey || group.categories.length === 0) return null
          
          const columnCount = getColumnCount(group.categories.length, size.width)
          const gridClass = 
            columnCount === 1 ? 'grid-cols-1' :
            columnCount === 2 ? 'grid-cols-2' :
            columnCount === 3 ? 'grid-cols-3' :
            columnCount === 4 ? 'grid-cols-4' :
            'grid-cols-5'
          
          return (
            <div key={layerKey} className="mb-3 last:mb-0">
              {/* Título de la capa (solo una vez) */}
              <div className="text-[9px] font-bold text-slate-900 mb-1 uppercase tracking-wide">
                {group.layerName}
              </div>
              
              {/* Grid de categorías en columnas */}
              <div className={`grid ${gridClass} gap-x-3 gap-y-0.5`}>
                {group.categories.map(cat => (
                  <div key={cat.key} className="flex items-center gap-1.5 min-w-0">
                    {/* Símbolo compacto */}
                    <div
                      className="w-3 h-2.5 rounded-sm border border-slate-600 flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    
                    {/* Nombre compacto */}
                    <span className="text-[8px] text-slate-800 leading-tight truncate">
                      {cat.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Handle de resize (esquina inferior derecha) */}
      <div
        className="resize-handle absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize hover:bg-slate-200 transition-colors"
        onMouseDown={handleResizeStart}
        title="Arrastrar para redimensionar"
      >
        <Maximize2 className="w-3 h-3 text-slate-500 absolute bottom-0.5 right-0.5" />
      </div>
    </div>
  )
}
