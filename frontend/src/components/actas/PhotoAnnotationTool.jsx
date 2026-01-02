import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Circle, 
  Square,
  MoveRight,
  Type,
  Trash2, 
  Undo2,
  Redo2,
  Check, 
  X as XIcon,
  Palette,
  Minus,
  Plus,
  MousePointer2,
  Move,
  GripVertical
} from 'lucide-react'

// Tipos de herramientas disponibles
const TOOLS = {
  ELLIPSE: 'ellipse',
  RECTANGLE: 'rectangle',
  BACKGROUND: 'background',
  ARROW: 'arrow',
  TEXT: 'text'
}

/**
 * Herramienta de anotación completa para fotos
 * Soporta: Círculos/Óvalos, Rectángulos, Flechas y Texto
 */
export const PhotoAnnotationTool = ({
  imageUrl,
  imageWidth,
  imageHeight,
  annotations = [],
  onAnnotationsChange,
  isActive = false,
  onClose
}) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const imageContainerRef = useRef(null)
  const textInputRef = useRef(null)
  
  // Herramienta activa
  const [activeTool, setActiveTool] = useState(TOOLS.ELLIPSE)
  
  // Estado de dibujo
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState(null)
  const [currentShape, setCurrentShape] = useState(null)
  const [localAnnotations, setLocalAnnotations] = useState(annotations)
  
  // Estado para texto
  const [showTextInput, setShowTextInput] = useState(false)
  const [textInputScreenPosition, setTextInputScreenPosition] = useState({ x: 0, y: 0 })
  const [textValue, setTextValue] = useState('')
  const [editingAnnotationId, setEditingAnnotationId] = useState(null) // ID de anotación siendo editada
  const [pendingTextPosition, setPendingTextPosition] = useState(null) // Posición para nuevo texto
  
  // Estado para redimensionar caja de texto
  const [textBoxSize, setTextBoxSize] = useState({ width: 280, height: 100 })
  const [isResizingTextBox, setIsResizingTextBox] = useState(false)
  const [resizeStart, setResizeStart] = useState(null)
  
  // Estado para arrastrar anotaciones (todas, no solo texto)
  const [selectedAnnotation, setSelectedAnnotation] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  // Estado para redimensionar formas
  const [isResizingShape, setIsResizingShape] = useState(false)
  const [resizeHandle, setResizeHandle] = useState(null) // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
  const [resizeStartData, setResizeStartData] = useState(null)
  
  // Historial para undo/redo (soporta eliminaciones)
  const [undoHistory, setUndoHistory] = useState([])
  const [redoHistory, setRedoHistory] = useState([])
  
  // Configuración del trazo
  const [strokeColor, setStrokeColor] = useState('#ff0000')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [fontSize, setFontSize] = useState(24)
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.5) // 50% por defecto, rango 0.5-1.0
  
  // Dimensiones del canvas
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)
  
  // Colores disponibles
  const availableColors = [
    '#ff0000', // Rojo
    '#ff6600', // Naranja
    '#ffff00', // Amarillo
    '#00ff00', // Verde
    '#00ffff', // Cian
    '#0066ff', // Azul
    '#ff00ff', // Magenta
    '#ffffff', // Blanco
    '#000000', // Negro
  ]

  // Calcular dimensiones del canvas cuando cambia la imagen
  useEffect(() => {
    if (!containerRef.current || !imageWidth || !imageHeight) return
    
    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    
    const maxWidth = containerRect.width
    const maxHeight = containerRect.height - 140 // Espacio para toolbars
    
    const scaleX = maxWidth / imageWidth
    const scaleY = maxHeight / imageHeight
    const newScale = Math.min(scaleX, scaleY, 1)
    
    setScale(newScale)
    setCanvasDimensions({
      width: imageWidth * newScale,
      height: imageHeight * newScale
    })
  }, [imageWidth, imageHeight])

  // Sincronizar anotaciones locales con las props
  useEffect(() => {
    setLocalAnnotations(annotations)
  }, [annotations])

  // Redibujar canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Dibujar todas las anotaciones guardadas
    localAnnotations.forEach(ann => {
      const isSelected = selectedAnnotation && ann.id === selectedAnnotation.id
      if (ann.type === TOOLS.TEXT) {
        drawText(ctx, ann, scale, isSelected)
      } else {
        drawAnnotation(ctx, ann, scale, isSelected)
      }
    })
    
    // Dibujar la forma actual si está en proceso
    if (currentShape) {
      drawAnnotation(ctx, currentShape, scale, false)
    }
  }, [localAnnotations, currentShape, scale, canvasDimensions, selectedAnnotation])

  // Focus en input de texto cuando se muestra
  useEffect(() => {
    if (showTextInput && textInputRef.current) {
      textInputRef.current.focus()
    }
  }, [showTextInput])

  // Atajos de teclado
  useEffect(() => {
    if (!isActive) return
    
    const handleKeyDown = (e) => {
      // No manejar atajos si estamos escribiendo texto
      if (showTextInput) return
      
      switch (e.key) {
        case '1':
          setActiveTool(TOOLS.ELLIPSE)
          break
        case '2':
          setActiveTool(TOOLS.RECTANGLE)
          break
        case '3':
          setActiveTool(TOOLS.BACKGROUND)
          break
        case '4':
          setActiveTool(TOOLS.ARROW)
          break
        case '5':
          setActiveTool(TOOLS.TEXT)
          break
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleUndo()
          }
          break
        case 'y':
        case 'Y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleRedo()
          }
          break
        case 'Escape':
          if (!showTextInput) {
            handleCancel()
          }
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, showTextInput, localAnnotations, undoHistory, redoHistory])

  // Manejar redimensionamiento a nivel de documento (para que funcione fuera del canvas)
  useEffect(() => {
    if (!isResizingShape) return
    
    const handleDocumentMouseMove = (e) => {
      if (!resizeHandle || !resizeStartData) return
      
      const mouseX = e.clientX
      const mouseY = e.clientY
      const deltaX = (mouseX - resizeStartData.mouseX) / scale
      const deltaY = (mouseY - resizeStartData.mouseY) / scale
      const ann = resizeStartData.annotation
      const type = ann.type || TOOLS.ELLIPSE
      
      let updatedAnn = { ...ann }
      
      if (type === TOOLS.ELLIPSE) {
        switch (resizeHandle) {
          case 'n':
            updatedAnn.ry = Math.max(5, ann.ry - deltaY)
            updatedAnn.cy = ann.cy + deltaY / 2
            break
          case 's':
            updatedAnn.ry = Math.max(5, ann.ry + deltaY)
            updatedAnn.cy = ann.cy + deltaY / 2
            break
          case 'e':
            updatedAnn.rx = Math.max(5, ann.rx + deltaX)
            updatedAnn.cx = ann.cx + deltaX / 2
            break
          case 'w':
            updatedAnn.rx = Math.max(5, ann.rx - deltaX)
            updatedAnn.cx = ann.cx + deltaX / 2
            break
        }
      } else if (type === TOOLS.RECTANGLE || type === TOOLS.BACKGROUND) {
        switch (resizeHandle) {
          case 'nw':
            updatedAnn.x = ann.x + deltaX
            updatedAnn.y = ann.y + deltaY
            updatedAnn.width = Math.max(10, ann.width - deltaX)
            updatedAnn.height = Math.max(10, ann.height - deltaY)
            break
          case 'ne':
            updatedAnn.y = ann.y + deltaY
            updatedAnn.width = Math.max(10, ann.width + deltaX)
            updatedAnn.height = Math.max(10, ann.height - deltaY)
            break
          case 'sw':
            updatedAnn.x = ann.x + deltaX
            updatedAnn.width = Math.max(10, ann.width - deltaX)
            updatedAnn.height = Math.max(10, ann.height + deltaY)
            break
          case 'se':
            updatedAnn.width = Math.max(10, ann.width + deltaX)
            updatedAnn.height = Math.max(10, ann.height + deltaY)
            break
          case 'n':
            updatedAnn.y = ann.y + deltaY
            updatedAnn.height = Math.max(10, ann.height - deltaY)
            break
          case 's':
            updatedAnn.height = Math.max(10, ann.height + deltaY)
            break
          case 'e':
            updatedAnn.width = Math.max(10, ann.width + deltaX)
            break
          case 'w':
            updatedAnn.x = ann.x + deltaX
            updatedAnn.width = Math.max(10, ann.width - deltaX)
            break
        }
      }
      
      setLocalAnnotations(prev => prev.map(a => 
        a.id === ann.id ? updatedAnn : a
      ))
      setSelectedAnnotation(updatedAnn)
    }
    
    const handleDocumentMouseUp = () => {
      setIsResizingShape(false)
      setResizeHandle(null)
      setResizeStartData(null)
    }
    
    document.addEventListener('mousemove', handleDocumentMouseMove)
    document.addEventListener('mouseup', handleDocumentMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
    }
  }, [isResizingShape, resizeHandle, resizeStartData, scale])

  // Función unificada para dibujar cualquier tipo de anotación
  const drawAnnotation = (ctx, ann, currentScale, isSelected = false) => {
    const color = ann.strokeColor || '#ff0000'
    const width = ann.strokeWidth || 3
    
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    switch (ann.type) {
      case TOOLS.ELLIPSE:
      case undefined: // Compatibilidad con anotaciones antiguas sin type
        drawEllipse(ctx, ann, currentScale, isSelected)
        break
      case TOOLS.RECTANGLE:
        drawRectangle(ctx, ann, currentScale, isSelected)
        break
      case TOOLS.BACKGROUND:
        drawBackground(ctx, ann, currentScale, isSelected)
        break
      case TOOLS.ARROW:
        drawArrow(ctx, ann, currentScale, isSelected)
        break
      case TOOLS.TEXT:
        drawText(ctx, ann, currentScale, isSelected)
        break
    }
  }

  // Dibujar elipse
  const drawEllipse = (ctx, ellipse, currentScale, isSelected = false) => {
    const { cx, cy, rx, ry, strokeColor } = ellipse
    
    const scaledCx = cx * currentScale
    const scaledCy = cy * currentScale
    const scaledRx = Math.abs(rx) * currentScale
    const scaledRy = Math.abs(ry) * currentScale
    
    if (scaledRx < 1 || scaledRy < 1) return
    
    ctx.beginPath()
    ctx.ellipse(scaledCx, scaledCy, scaledRx, scaledRy, 0, 0, 2 * Math.PI)
    ctx.stroke()
    
    // Indicador de selección
    if (isSelected) {
      ctx.save()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.beginPath()
      ctx.ellipse(scaledCx, scaledCy, scaledRx + 6, scaledRy + 6, 0, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }
  }

  // Dibujar rectángulo (sin fondo)
  const drawRectangle = (ctx, rect, currentScale, isSelected = false) => {
    const { x, y, width, height } = rect
    
    const scaledX = x * currentScale
    const scaledY = y * currentScale
    const scaledWidth = width * currentScale
    const scaledHeight = height * currentScale
    
    // Solo borde, sin fondo
    ctx.beginPath()
    ctx.rect(scaledX, scaledY, scaledWidth, scaledHeight)
    ctx.stroke()
    
    // Indicador de selección
    if (isSelected) {
      ctx.save()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.strokeRect(scaledX - 4, scaledY - 4, scaledWidth + 8, scaledHeight + 8)
      ctx.setLineDash([])
      ctx.restore()
    }
  }
  
  // Dibujar fondo (rectángulo con relleno)
  const drawBackground = (ctx, rect, currentScale, isSelected = false) => {
    const { x, y, width, height, strokeColor, opacity } = rect
    
    const scaledX = x * currentScale
    const scaledY = y * currentScale
    const scaledWidth = width * currentScale
    const scaledHeight = height * currentScale
    
    // Fondo con transparencia configurable (50%-100%)
    ctx.save()
    ctx.globalAlpha = opacity || 0.5
    ctx.fillStyle = strokeColor || '#ff0000'
    ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight)
    ctx.restore()
    
    // Borde
    ctx.beginPath()
    ctx.rect(scaledX, scaledY, scaledWidth, scaledHeight)
    ctx.stroke()
    
    // Indicador de selección
    if (isSelected) {
      ctx.save()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.strokeRect(scaledX - 4, scaledY - 4, scaledWidth + 8, scaledHeight + 8)
      ctx.setLineDash([])
      ctx.restore()
    }
  }

  // Dibujar flecha con punta triangular
  const drawArrow = (ctx, arrow, currentScale, isSelected = false) => {
    const { startX, startY, endX, endY, strokeWidth: width } = arrow
    
    const scaledStartX = startX * currentScale
    const scaledStartY = startY * currentScale
    const scaledEndX = endX * currentScale
    const scaledEndY = endY * currentScale
    
    // Calcular ángulo de la flecha
    const angle = Math.atan2(scaledEndY - scaledStartY, scaledEndX - scaledStartX)
    
    // Tamaño de la punta proporcional al grosor
    const headLength = Math.max(15, (width || 3) * 4)
    const headWidth = headLength * 0.6
    
    // Línea principal (hasta antes de la punta)
    const lineEndX = scaledEndX - Math.cos(angle) * headLength * 0.8
    const lineEndY = scaledEndY - Math.sin(angle) * headLength * 0.8
    
    ctx.beginPath()
    ctx.moveTo(scaledStartX, scaledStartY)
    ctx.lineTo(lineEndX, lineEndY)
    ctx.stroke()
    
    // Punta triangular (rellena)
    const tip1X = scaledEndX - headLength * Math.cos(angle - Math.PI / 6)
    const tip1Y = scaledEndY - headLength * Math.sin(angle - Math.PI / 6)
    const tip2X = scaledEndX - headLength * Math.cos(angle + Math.PI / 6)
    const tip2Y = scaledEndY - headLength * Math.sin(angle + Math.PI / 6)
    
    ctx.beginPath()
    ctx.moveTo(scaledEndX, scaledEndY)
    ctx.lineTo(tip1X, tip1Y)
    ctx.lineTo(tip2X, tip2Y)
    ctx.closePath()
    ctx.fill()
    
    // Indicador de selección
    if (isSelected) {
      ctx.save()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      // Dibujar bounding box
      const minX = Math.min(scaledStartX, scaledEndX) - 6
      const minY = Math.min(scaledStartY, scaledEndY) - 6
      const maxX = Math.max(scaledStartX, scaledEndX) + 6
      const maxY = Math.max(scaledStartY, scaledEndY) + 6
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
      ctx.setLineDash([])
      ctx.restore()
    }
  }

  // Dibujar texto (con soporte para saltos de línea)
  const drawText = (ctx, textAnn, currentScale, isSelected = false) => {
    const { x, y, text, fontSize: size, strokeColor: color } = textAnn
    
    const scaledX = x * currentScale
    const scaledY = y * currentScale
    const scaledSize = (size || 24) * currentScale
    const lineHeight = scaledSize * 1.2 // Espaciado entre líneas
    
    ctx.font = `bold ${scaledSize}px Arial, sans-serif`
    ctx.fillStyle = color || '#ff0000'
    ctx.textBaseline = 'top'
    
    // Dividir texto por saltos de línea y dibujar cada línea
    const lines = (text || '').split('\n')
    let maxWidth = 0
    
    lines.forEach((line, index) => {
      ctx.fillText(line, scaledX, scaledY + index * lineHeight)
      const metrics = ctx.measureText(line)
      if (metrics.width > maxWidth) maxWidth = metrics.width
    })
    
    // Dibujar indicador de selección si está seleccionado
    if (isSelected) {
      const totalHeight = lines.length * lineHeight
      const padding = 4
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.strokeRect(
        scaledX - padding,
        scaledY - padding,
        maxWidth + padding * 2,
        totalHeight + padding * 2
      )
      ctx.setLineDash([])
      
      // Icono de mover
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(scaledX - padding - 16, scaledY - padding, 14, 14)
      ctx.fillStyle = 'white'
      ctx.font = '10px Arial'
      ctx.fillText('⋮⋮', scaledX - padding - 14, scaledY - padding + 10)
    }
  }
  
  // Detectar si el click está sobre cualquier anotación
  const findAnnotationAtPoint = (pos) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    
    const ctx = canvas.getContext('2d')
    const padding = 10
    
    // Buscar de atrás hacia adelante (las más recientes primero)
    for (let i = localAnnotations.length - 1; i >= 0; i--) {
      const ann = localAnnotations[i]
      const type = ann.type || TOOLS.ELLIPSE
      
      switch (type) {
        case TOOLS.TEXT: {
          const scaledSize = (ann.fontSize || 24) * scale
          const lineHeight = scaledSize * 1.2
          ctx.font = `bold ${scaledSize}px Arial, sans-serif`
          
          // Calcular dimensiones considerando múltiples líneas
          const lines = (ann.text || '').split('\n')
          let maxWidth = 0
          lines.forEach(line => {
            const metrics = ctx.measureText(line)
            if (metrics.width > maxWidth) maxWidth = metrics.width
          })
          const totalHeight = lines.length * lineHeight
          
          const scaledX = ann.x * scale
          const scaledY = ann.y * scale
          
          if (
            pos.x * scale >= scaledX - padding - 20 &&
            pos.x * scale <= scaledX + maxWidth + padding &&
            pos.y * scale >= scaledY - padding &&
            pos.y * scale <= scaledY + totalHeight + padding
          ) {
            return { annotation: ann, index: i }
          }
          break
        }
        case TOOLS.ELLIPSE: {
          const { cx, cy, rx, ry } = ann
          // Check if point is inside ellipse (with padding)
          const dx = (pos.x - cx) / (rx + padding / scale)
          const dy = (pos.y - cy) / (ry + padding / scale)
          if (dx * dx + dy * dy <= 1) {
            return { annotation: ann, index: i }
          }
          break
        }
        case TOOLS.RECTANGLE:
        case TOOLS.BACKGROUND: {
          const { x, y, width, height } = ann
          if (
            pos.x >= x - padding / scale &&
            pos.x <= x + width + padding / scale &&
            pos.y >= y - padding / scale &&
            pos.y <= y + height + padding / scale
          ) {
            return { annotation: ann, index: i }
          }
          break
        }
        case TOOLS.ARROW: {
          const { startX, startY, endX, endY } = ann
          // Check if point is near arrow line or within bounding box
          const minX = Math.min(startX, endX) - padding / scale
          const minY = Math.min(startY, endY) - padding / scale
          const maxX = Math.max(startX, endX) + padding / scale
          const maxY = Math.max(startY, endY) + padding / scale
          
          if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
            // Check distance to line segment
            const dist = distanceToLineSegment(pos.x, pos.y, startX, startY, endX, endY)
            if (dist < 15 / scale) {
              return { annotation: ann, index: i }
            }
          }
          break
        }
      }
    }
    return null
  }
  
  // Función auxiliar para calcular distancia a segmento de línea
  const distanceToLineSegment = (px, py, x1, y1, x2, y2) => {
    const A = px - x1
    const B = py - y1
    const C = x2 - x1
    const D = y2 - y1
    
    const dot = A * C + B * D
    const lenSq = C * C + D * D
    let param = -1
    
    if (lenSq !== 0) param = dot / lenSq
    
    let xx, yy
    
    if (param < 0) {
      xx = x1
      yy = y1
    } else if (param > 1) {
      xx = x2
      yy = y2
    } else {
      xx = x1 + param * C
      yy = y1 + param * D
    }
    
    const dx = px - xx
    const dy = py - yy
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Obtener posición del mouse en coordenadas de imagen original
  const getMousePosition = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    
    return { x, y }
  }, [scale])

  // Calcular posición óptima para popup
  const calculatePopupPosition = (clientX, clientY) => {
    const popupWidth = textBoxSize.width + 20
    const popupHeight = textBoxSize.height + 80
    const padding = 10
    
    let screenX = clientX + 10
    let screenY = clientY + 10
    
    if (screenX + popupWidth > window.innerWidth - padding) {
      screenX = clientX - popupWidth - 10
    }
    if (screenY + popupHeight > window.innerHeight - padding) {
      screenY = clientY - popupHeight - 10
    }
    
    screenX = Math.max(padding, screenX)
    screenY = Math.max(padding, screenY)
    
    return { x: screenX, y: screenY }
  }

  // Abrir editor de texto (nuevo o existente)
  const openTextEditor = (e, existingAnnotation = null) => {
    const screenPos = calculatePopupPosition(e.clientX, e.clientY)
    setTextInputScreenPosition(screenPos)
    
    if (existingAnnotation) {
      // Editando texto existente
      setEditingAnnotationId(existingAnnotation.id)
      setTextValue(existingAnnotation.text || '')
      setStrokeColor(existingAnnotation.strokeColor || '#ff0000')
      setPendingTextPosition(null)
    } else {
      // Nuevo texto
      const pos = getMousePosition(e)
      setEditingAnnotationId(null)
      setTextValue('')
      setPendingTextPosition({ x: pos.x, y: pos.y })
    }
    
    setShowTextInput(true)
  }

  // Calcular offset de arrastre según tipo de anotación
  const calculateDragOffset = (pos, ann) => {
    const type = ann.type || TOOLS.ELLIPSE
    switch (type) {
      case TOOLS.TEXT:
      case TOOLS.RECTANGLE:
      case TOOLS.BACKGROUND:
        return { x: pos.x - ann.x, y: pos.y - ann.y }
      case TOOLS.ELLIPSE:
        return { x: pos.x - ann.cx, y: pos.y - ann.cy }
      case TOOLS.ARROW:
        return { x: pos.x - ann.startX, y: pos.y - ann.startY }
      default:
        return { x: 0, y: 0 }
    }
  }
  
  // Iniciar dibujo
  const handleMouseDown = useCallback((e) => {
    // No hacer nada si estamos redimensionando (el handle maneja su propio evento)
    if (!isActive || showTextInput || isResizingShape) return
    
    const pos = getMousePosition(e)
    
    // Primero verificar si estamos clickeando en una anotación existente
    const annAtPoint = findAnnotationAtPoint(pos)
    
    if (annAtPoint) {
      const ann = annAtPoint.annotation
      const type = ann.type || TOOLS.ELLIPSE
      
      // Doble click para editar texto
      if (type === TOOLS.TEXT && e.detail === 2) {
        openTextEditor(e, ann)
        return
      }
      
      // Click simple: seleccionar y preparar para arrastrar
      setSelectedAnnotation(ann)
      setIsDragging(true)
      setDragOffset(calculateDragOffset(pos, ann))
      return
    }
    
    // Deseleccionar si clickeamos fuera
    if (selectedAnnotation && !annAtPoint) {
      setSelectedAnnotation(null)
    }
    
    if (activeTool === TOOLS.TEXT) {
      // Para texto nuevo: requiere DOBLE clic para evitar pop-ups accidentales
      if (e.detail === 2) {
        openTextEditor(e, null)
      }
      return
    }
    
    setIsDrawing(true)
    setStartPoint(pos)
    
    // Inicializar forma según herramienta
    switch (activeTool) {
      case TOOLS.ELLIPSE:
        setCurrentShape({
          type: TOOLS.ELLIPSE,
          cx: pos.x,
          cy: pos.y,
          rx: 0,
          ry: 0,
          strokeColor,
          strokeWidth
        })
        break
      case TOOLS.RECTANGLE:
        setCurrentShape({
          type: TOOLS.RECTANGLE,
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          strokeColor,
          strokeWidth
        })
        break
      case TOOLS.BACKGROUND:
        setCurrentShape({
          type: TOOLS.BACKGROUND,
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          strokeColor,
          strokeWidth
        })
        break
      case TOOLS.ARROW:
        setCurrentShape({
          type: TOOLS.ARROW,
          startX: pos.x,
          startY: pos.y,
          endX: pos.x,
          endY: pos.y,
          strokeColor,
          strokeWidth
        })
        break
    }
  }, [isActive, activeTool, getMousePosition, strokeColor, strokeWidth, fontSize, showTextInput, selectedAnnotation])

  // Actualizar forma mientras se arrastra
  const handleMouseMove = useCallback((e) => {
    // Si estamos redimensionando, el useEffect a nivel de documento se encarga
    if (isResizingShape) return
    
    // Manejar arrastre de anotación seleccionada
    if (isDragging && selectedAnnotation) {
      const pos = getMousePosition(e)
      const newX = pos.x - dragOffset.x
      const newY = pos.y - dragOffset.y
      const type = selectedAnnotation.type || TOOLS.ELLIPSE
      
      // Actualizar posición según tipo de anotación
      setLocalAnnotations(prev => prev.map(ann => {
        if (ann.id !== selectedAnnotation.id) return ann
        
        switch (type) {
          case TOOLS.TEXT:
          case TOOLS.RECTANGLE:
          case TOOLS.BACKGROUND:
            return { ...ann, x: newX, y: newY }
          case TOOLS.ELLIPSE:
            return { ...ann, cx: newX, cy: newY }
          case TOOLS.ARROW: {
            // Mover ambos puntos de la flecha
            const dx = newX - ann.startX
            const dy = newY - ann.startY
            return { 
              ...ann, 
              startX: newX, 
              startY: newY,
              endX: ann.endX + dx,
              endY: ann.endY + dy
            }
          }
          default:
            return ann
        }
      }))
      
      // Actualizar referencia de selección
      setSelectedAnnotation(prev => {
        if (!prev) return null
        switch (type) {
          case TOOLS.TEXT:
          case TOOLS.RECTANGLE:
          case TOOLS.BACKGROUND:
            return { ...prev, x: newX, y: newY }
          case TOOLS.ELLIPSE:
            return { ...prev, cx: newX, cy: newY }
          case TOOLS.ARROW: {
            const dx = newX - prev.startX
            const dy = newY - prev.startY
            return { 
              ...prev, 
              startX: newX, 
              startY: newY,
              endX: prev.endX + dx,
              endY: prev.endY + dy
            }
          }
          default:
            return prev
        }
      })
      return
    }
    
    if (!isDrawing || !startPoint || showTextInput) return
    
    const pos = getMousePosition(e)
    
    switch (activeTool) {
      case TOOLS.ELLIPSE:
        const cx = (startPoint.x + pos.x) / 2
        const cy = (startPoint.y + pos.y) / 2
        const rx = Math.abs(pos.x - startPoint.x) / 2
        const ry = Math.abs(pos.y - startPoint.y) / 2
        setCurrentShape({
          type: TOOLS.ELLIPSE,
          cx, cy, rx, ry,
          strokeColor,
          strokeWidth
        })
        break
      case TOOLS.RECTANGLE:
        setCurrentShape({
          type: TOOLS.RECTANGLE,
          x: Math.min(startPoint.x, pos.x),
          y: Math.min(startPoint.y, pos.y),
          width: Math.abs(pos.x - startPoint.x),
          height: Math.abs(pos.y - startPoint.y),
          strokeColor,
          strokeWidth
        })
        break
      case TOOLS.BACKGROUND:
        setCurrentShape({
          type: TOOLS.BACKGROUND,
          x: Math.min(startPoint.x, pos.x),
          y: Math.min(startPoint.y, pos.y),
          width: Math.abs(pos.x - startPoint.x),
          height: Math.abs(pos.y - startPoint.y),
          strokeColor,
          strokeWidth,
          opacity: backgroundOpacity
        })
        break
      case TOOLS.ARROW:
        setCurrentShape({
          type: TOOLS.ARROW,
          startX: startPoint.x,
          startY: startPoint.y,
          endX: pos.x,
          endY: pos.y,
          strokeColor,
          strokeWidth
        })
        break
    }
  }, [isDrawing, startPoint, activeTool, getMousePosition, strokeColor, strokeWidth, showTextInput, isDragging, selectedAnnotation, dragOffset])

  // Finalizar dibujo
  const handleMouseUp = useCallback(() => {
    // Si estamos redimensionando, el useEffect a nivel de documento se encarga
    if (isResizingShape) return
    
    // Terminar arrastre de texto
    if (isDragging) {
      setIsDragging(false)
      return
    }
    
    if (!isDrawing || !currentShape) return
    
    // Verificar tamaño mínimo según tipo
    let isValid = false
    switch (currentShape.type) {
      case TOOLS.ELLIPSE:
        isValid = currentShape.rx > 5 && currentShape.ry > 5
        break
      case TOOLS.RECTANGLE:
      case TOOLS.BACKGROUND:
        isValid = Math.abs(currentShape.width) > 5 && Math.abs(currentShape.height) > 5
        break
      case TOOLS.ARROW:
        const dx = currentShape.endX - currentShape.startX
        const dy = currentShape.endY - currentShape.startY
        isValid = Math.sqrt(dx * dx + dy * dy) > 10
        break
    }
    
    if (isValid) {
      const newAnnotation = {
        ...currentShape,
        id: Date.now(),
        imageWidth,
        imageHeight
      }
      setLocalAnnotations(prev => [...prev, newAnnotation])
      // Auto-seleccionar el elemento recién creado
      setSelectedAnnotation(newAnnotation)
    }
    
    setIsDrawing(false)
    setStartPoint(null)
    setCurrentShape(null)
  }, [isDrawing, currentShape, imageWidth, imageHeight, isDragging])

  // Confirmar texto
  const handleTextSubmit = () => {
    const trimmedText = textValue.trim()
    if (!trimmedText) {
      handleTextCancel()
      return
    }
    
    if (editingAnnotationId) {
      // Actualizar anotación existente
      setLocalAnnotations(prev => prev.map(ann => 
        ann.id === editingAnnotationId
          ? { ...ann, text: trimmedText, strokeColor, fontSize }
          : ann
      ))
    } else if (pendingTextPosition) {
      // Crear nueva anotación
      setLocalAnnotations(prev => [...prev, {
        type: TOOLS.TEXT,
        x: pendingTextPosition.x,
        y: pendingTextPosition.y,
        text: trimmedText,
        strokeColor,
        fontSize,
        id: Date.now(),
        imageWidth,
        imageHeight
      }])
    }
    
    // Limpiar estado
    setShowTextInput(false)
    setTextValue('')
    setEditingAnnotationId(null)
    setPendingTextPosition(null)
  }

  // Cancelar texto
  const handleTextCancel = () => {
    setShowTextInput(false)
    setTextValue('')
    setEditingAnnotationId(null)
    setPendingTextPosition(null)
  }
  
  // Cambiar color de anotación seleccionada (funciona para TODOS los tipos)
  const handleColorChange = (color) => {
    setStrokeColor(color)
    
    // Si hay una anotación seleccionada (cualquier tipo), actualizar su color
    if (selectedAnnotation) {
      setLocalAnnotations(prev => prev.map(ann =>
        ann.id === selectedAnnotation.id
          ? { ...ann, strokeColor: color }
          : ann
      ))
      // Actualizar referencia de selección
      setSelectedAnnotation(prev => prev ? { ...prev, strokeColor: color } : null)
    }
  }
  
  // Cambiar tamaño de fuente (y actualizar texto seleccionado si existe)
  const handleFontSizeChange = (newSize) => {
    setFontSize(newSize)
    
    // Si hay una anotación de texto seleccionada, actualizar su tamaño
    if (selectedAnnotation && selectedAnnotation.type === TOOLS.TEXT) {
      setLocalAnnotations(prev => prev.map(ann =>
        ann.id === selectedAnnotation.id
          ? { ...ann, fontSize: newSize }
          : ann
      ))
      // Actualizar referencia de selección
      setSelectedAnnotation(prev => prev ? { ...prev, fontSize: newSize } : null)
    }
  }
  
  // Cambiar opacidad del fondo (y actualizar fondo seleccionado si existe)
  const handleOpacityChange = (newOpacity) => {
    setBackgroundOpacity(newOpacity)
    
    // Si hay un fondo seleccionado, actualizar su opacidad
    if (selectedAnnotation && selectedAnnotation.type === TOOLS.BACKGROUND) {
      setLocalAnnotations(prev => prev.map(ann =>
        ann.id === selectedAnnotation.id
          ? { ...ann, opacity: newOpacity }
          : ann
      ))
      // Actualizar referencia de selección
      setSelectedAnnotation(prev => prev ? { ...prev, opacity: newOpacity } : null)
    }
  }
  
  // Iniciar redimensionamiento de caja de texto
  const handleResizeMouseDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizingTextBox(true)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: textBoxSize.width,
      height: textBoxSize.height
    })
  }
  
  // Manejar redimensionamiento
  useEffect(() => {
    if (!isResizingTextBox || !resizeStart) return
    
    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y
      
      // Calcular nuevo tamaño con límites
      const newWidth = Math.max(180, Math.min(450, resizeStart.width + deltaX))
      const newHeight = Math.max(80, Math.min(250, resizeStart.height + deltaY))
      
      setTextBoxSize({ width: newWidth, height: newHeight })
    }
    
    const handleMouseUp = () => {
      setIsResizingTextBox(false)
      setResizeStart(null)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingTextBox, resizeStart])

  // Manejar teclas en input de texto
  // Enter = nueva línea, Escape = cancelar, botón = guardar
  const handleTextKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleTextCancel()
    }
    // Enter normal permite salto de línea (comportamiento por defecto del textarea)
    // No hay atajo de teclado para guardar - solo el botón
  }

  // Eliminar anotación seleccionada
  const handleDeleteSelected = () => {
    if (!selectedAnnotation) return
    
    // Guardar en historial para poder deshacer
    setUndoHistory(prev => [...prev, { type: 'delete', annotation: selectedAnnotation }])
    
    // Eliminar la anotación
    setLocalAnnotations(prev => prev.filter(ann => ann.id !== selectedAnnotation.id))
    setSelectedAnnotation(null)
  }
  
  // Deshacer última acción (incluyendo eliminaciones)
  const handleUndo = () => {
    // Primero verificar si hay algo en el historial de undo (eliminaciones)
    if (undoHistory.length > 0) {
      const lastAction = undoHistory[undoHistory.length - 1]
      if (lastAction.type === 'delete') {
        // Restaurar la anotación eliminada
        setLocalAnnotations(prev => [...prev, lastAction.annotation])
        setUndoHistory(prev => prev.slice(0, -1))
        // Guardar en redo para poder rehacer
        setRedoHistory(prev => [...prev, { type: 'delete', annotation: lastAction.annotation }])
        return
      }
      if (lastAction.type === 'clear') {
        // Restaurar todas las anotaciones eliminadas
        setLocalAnnotations(lastAction.annotations)
        setUndoHistory(prev => prev.slice(0, -1))
        setRedoHistory(prev => [...prev, { type: 'clear', annotations: lastAction.annotations }])
        return
      }
    }
    
    // Si no hay historial, eliminar última anotación añadida
    if (localAnnotations.length > 0) {
      const lastAnn = localAnnotations[localAnnotations.length - 1]
      // Guardar en historial para poder restaurar
      setUndoHistory(prev => [...prev, { type: 'add', annotation: lastAnn }])
      setLocalAnnotations(prev => prev.slice(0, -1))
      // Guardar en redo para poder rehacer
      setRedoHistory(prev => [...prev, { type: 'add', annotation: lastAnn }])
    }
  }
  
  // Rehacer última acción deshecha
  const handleRedo = () => {
    if (redoHistory.length === 0) return
    
    const lastRedo = redoHistory[redoHistory.length - 1]
    setRedoHistory(prev => prev.slice(0, -1))
    
    if (lastRedo.type === 'add') {
      // Volver a añadir la anotación
      setLocalAnnotations(prev => [...prev, lastRedo.annotation])
    } else if (lastRedo.type === 'delete') {
      // Volver a eliminar la anotación
      setLocalAnnotations(prev => prev.filter(ann => ann.id !== lastRedo.annotation.id))
      setUndoHistory(prev => [...prev, { type: 'delete', annotation: lastRedo.annotation }])
    } else if (lastRedo.type === 'clear') {
      // Volver a limpiar todo
      setUndoHistory(prev => [...prev, { type: 'clear', annotations: [...localAnnotations] }])
      setLocalAnnotations([])
      setSelectedAnnotation(null)
    }
  }

  // Limpiar todas las anotaciones
  const handleClearAll = () => {
    // Guardar todas las anotaciones en historial
    if (localAnnotations.length > 0) {
      setUndoHistory(prev => [...prev, { type: 'clear', annotations: [...localAnnotations] }])
      // Limpiar redo cuando se hace una nueva acción
      setRedoHistory([])
    }
    setLocalAnnotations([])
    setSelectedAnnotation(null)
  }

  // Guardar cambios
  const handleSave = () => {
    if (onAnnotationsChange) {
      onAnnotationsChange(localAnnotations)
    }
    if (onClose) {
      onClose()
    }
  }

  // Cancelar sin guardar
  const handleCancel = () => {
    setLocalAnnotations(annotations)
    if (onClose) {
      onClose()
    }
  }

  // Obtener cursor según herramienta
  const getCursor = () => {
    if (showTextInput) return 'default'
    if (isDragging) return 'grabbing'
    if (selectedAnnotation) return 'grab'
    switch (activeTool) {
      case TOOLS.TEXT:
        return 'text'
      default:
        return 'crosshair'
    }
  }
  
  // Calcular posición del botón de eliminar para el elemento seleccionado
  const getDeleteButtonPosition = () => {
    if (!selectedAnnotation) return null
    const type = selectedAnnotation.type || TOOLS.ELLIPSE
    
    switch (type) {
      case TOOLS.TEXT: {
        const canvas = canvasRef.current
        if (!canvas) return null
        const ctx = canvas.getContext('2d')
        const scaledSize = (selectedAnnotation.fontSize || 24) * scale
        ctx.font = `bold ${scaledSize}px Arial, sans-serif`
        const metrics = ctx.measureText(selectedAnnotation.text || '')
        return {
          x: selectedAnnotation.x * scale + metrics.width + 8,
          y: selectedAnnotation.y * scale - 12
        }
      }
      case TOOLS.ELLIPSE: {
        return {
          x: (selectedAnnotation.cx + selectedAnnotation.rx) * scale + 8,
          y: (selectedAnnotation.cy - selectedAnnotation.ry) * scale - 12
        }
      }
      case TOOLS.RECTANGLE:
      case TOOLS.BACKGROUND: {
        return {
          x: (selectedAnnotation.x + selectedAnnotation.width) * scale + 8,
          y: selectedAnnotation.y * scale - 12
        }
      }
      case TOOLS.ARROW: {
        const maxX = Math.max(selectedAnnotation.startX, selectedAnnotation.endX)
        const minY = Math.min(selectedAnnotation.startY, selectedAnnotation.endY)
        return {
          x: maxX * scale + 8,
          y: minY * scale - 12
        }
      }
      default:
        return null
    }
  }
  
  // Calcular posiciones de los handles de redimensionamiento para el elemento seleccionado
  const getResizeHandles = () => {
    if (!selectedAnnotation) return []
    const type = selectedAnnotation.type || TOOLS.ELLIPSE
    const handleSize = 8
    
    switch (type) {
      case TOOLS.ELLIPSE: {
        const { cx, cy, rx, ry } = selectedAnnotation
        const scaledCx = cx * scale
        const scaledCy = cy * scale
        const scaledRx = rx * scale
        const scaledRy = ry * scale
        return [
          { id: 'n', x: scaledCx - handleSize/2, y: scaledCy - scaledRy - handleSize/2, cursor: 'ns-resize' },
          { id: 's', x: scaledCx - handleSize/2, y: scaledCy + scaledRy - handleSize/2, cursor: 'ns-resize' },
          { id: 'e', x: scaledCx + scaledRx - handleSize/2, y: scaledCy - handleSize/2, cursor: 'ew-resize' },
          { id: 'w', x: scaledCx - scaledRx - handleSize/2, y: scaledCy - handleSize/2, cursor: 'ew-resize' },
        ]
      }
      case TOOLS.RECTANGLE:
      case TOOLS.BACKGROUND: {
        const { x, y, width, height } = selectedAnnotation
        const scaledX = x * scale
        const scaledY = y * scale
        const scaledW = width * scale
        const scaledH = height * scale
        return [
          { id: 'nw', x: scaledX - handleSize/2, y: scaledY - handleSize/2, cursor: 'nwse-resize' },
          { id: 'ne', x: scaledX + scaledW - handleSize/2, y: scaledY - handleSize/2, cursor: 'nesw-resize' },
          { id: 'sw', x: scaledX - handleSize/2, y: scaledY + scaledH - handleSize/2, cursor: 'nesw-resize' },
          { id: 'se', x: scaledX + scaledW - handleSize/2, y: scaledY + scaledH - handleSize/2, cursor: 'nwse-resize' },
          { id: 'n', x: scaledX + scaledW/2 - handleSize/2, y: scaledY - handleSize/2, cursor: 'ns-resize' },
          { id: 's', x: scaledX + scaledW/2 - handleSize/2, y: scaledY + scaledH - handleSize/2, cursor: 'ns-resize' },
          { id: 'e', x: scaledX + scaledW - handleSize/2, y: scaledY + scaledH/2 - handleSize/2, cursor: 'ew-resize' },
          { id: 'w', x: scaledX - handleSize/2, y: scaledY + scaledH/2 - handleSize/2, cursor: 'ew-resize' },
        ]
      }
      default:
        return []
    }
  }
  
  // Iniciar redimensionamiento
  const handleResizeStart = (handleId, e) => {
    e.stopPropagation()
    if (!selectedAnnotation) return
    
    setIsResizingShape(true)
    setResizeHandle(handleId)
    setResizeStartData({
      mouseX: e.clientX,
      mouseY: e.clientY,
      annotation: { ...selectedAnnotation }
    })
  }

  // Contar por tipo
  const countByType = (type) => {
    if (type === TOOLS.ELLIPSE) {
      return localAnnotations.filter(a => a.type === TOOLS.ELLIPSE || !a.type).length
    }
    return localAnnotations.filter(a => a.type === type).length
  }

  if (!isActive) return null

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-50 flex flex-col bg-black/95"
    >
      {/* Toolbar Principal */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-slate-800 to-slate-900 border-b border-white/10">
        <div className="flex items-center gap-2">
          {/* Título */}
          <div className="flex items-center gap-2 text-white mr-4">
            <MousePointer2 className="w-5 h-5 text-blue-400" />
            <span className="font-semibold">Herramienta de Anotación</span>
          </div>
          
          {/* Selector de herramientas */}
          <div className="flex items-center bg-black/30 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTool(TOOLS.ELLIPSE)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
                activeTool === TOOLS.ELLIPSE 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title="Círculo/Óvalo (1)"
            >
              <Circle className="w-4 h-4" />
              <span className="text-sm font-medium">Círculo</span>
            </button>
            
            <button
              onClick={() => setActiveTool(TOOLS.RECTANGLE)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
                activeTool === TOOLS.RECTANGLE 
                  ? 'bg-green-600 text-white shadow-lg' 
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title="Rectángulo sin fondo (2)"
            >
              <Square className="w-4 h-4" />
              <span className="text-sm font-medium">Rectángulo</span>
            </button>
            
            <button
              onClick={() => setActiveTool(TOOLS.BACKGROUND)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
                activeTool === TOOLS.BACKGROUND 
                  ? 'bg-teal-600 text-white shadow-lg' 
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title="Fondo con relleno (3)"
            >
              <div className="w-4 h-4 rounded-sm bg-current opacity-80" />
              <span className="text-sm font-medium">Fondo</span>
            </button>
            
            <button
              onClick={() => setActiveTool(TOOLS.ARROW)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
                activeTool === TOOLS.ARROW 
                  ? 'bg-orange-600 text-white shadow-lg' 
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title="Flecha (4)"
            >
              <MoveRight className="w-4 h-4" />
              <span className="text-sm font-medium">Flecha</span>
            </button>
            
            <button
              onClick={() => setActiveTool(TOOLS.TEXT)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
                activeTool === TOOLS.TEXT 
                  ? 'bg-purple-600 text-white shadow-lg' 
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title="Texto (5)"
            >
              <Type className="w-4 h-4" />
              <span className="text-sm font-medium">Texto</span>
            </button>
          </div>
        </div>
        
        {/* Acciones */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={localAnnotations.length === 0 && undoHistory.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Deshacer última acción (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
            <span className="text-sm">Deshacer</span>
          </button>
          
          <button
            onClick={handleRedo}
            disabled={redoHistory.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Rehacer última acción (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
            <span className="text-sm">Rehacer</span>
          </button>
          
          <button
            onClick={handleClearAll}
            disabled={localAnnotations.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Borrar todo"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm">Limpiar</span>
          </button>
          
          <div className="w-px h-8 bg-white/20 mx-2" />
          
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
          >
            <XIcon className="w-4 h-4" />
            <span className="text-sm">Cancelar</span>
          </button>
          
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-all shadow-lg shadow-green-600/30"
          >
            <Check className="w-4 h-4" />
            <span className="text-sm">Guardar</span>
          </button>
        </div>
      </div>
      
      {/* Toolbar Secundario - Opciones de estilo */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-white/5">
        <div className="flex items-center gap-6">
          {/* Selector de color */}
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-white/50" />
            <span className="text-xs text-white/50 mr-1">
              Color{selectedAnnotation ? ' (texto seleccionado)' : ''}:
            </span>
            <div className="flex items-center gap-1">
              {availableColors.map(color => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                    strokeColor === color 
                      ? 'border-white scale-110 ring-2 ring-white/30' 
                      : 'border-white/20 hover:border-white/50'
                  }`}
                  style={{ backgroundColor: color }}
                  title={selectedAnnotation ? `Cambiar color del texto a ${color}` : color}
                />
              ))}
            </div>
            {selectedAnnotation && (
              <span className="text-[10px] text-blue-400 ml-2">
                Selecciona el texto y da click para cambiar color
              </span>
            )}
          </div>
          
          {/* Grosor del trazo - solo para formas, no texto */}
          {activeTool !== TOOLS.TEXT && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Grosor:</span>
              <button
                onClick={() => setStrokeWidth(w => Math.max(1, w - 1))}
                className="p-1 rounded hover:bg-white/10 text-white/70 transition-colors"
                title="Reducir grosor"
              >
                <Minus className="w-3 h-3" />
              </button>
              <div className="w-12 h-6 flex items-center justify-center bg-black/30 rounded text-white/90 text-xs font-mono">
                {strokeWidth}px
              </div>
              <button
                onClick={() => setStrokeWidth(w => Math.min(12, w + 1))}
                className="p-1 rounded hover:bg-white/10 text-white/70 transition-colors"
                title="Aumentar grosor"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
          
          {/* Opacidad del fondo - solo para herramienta Fondo o fondo seleccionado */}
          {(activeTool === TOOLS.BACKGROUND || (selectedAnnotation && selectedAnnotation.type === TOOLS.BACKGROUND)) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">
                Opacidad{selectedAnnotation?.type === TOOLS.BACKGROUND ? ' (fondo seleccionado)' : ''}:
              </span>
              <input
                type="range"
                min="50"
                max="100"
                value={Math.round((selectedAnnotation?.opacity || backgroundOpacity) * 100)}
                onChange={(e) => handleOpacityChange(parseInt(e.target.value) / 100)}
                className="w-20 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className={`w-12 h-6 flex items-center justify-center rounded text-xs font-mono ${
                selectedAnnotation?.type === TOOLS.BACKGROUND ? 'bg-blue-600/30 text-blue-300' : 'bg-black/30 text-white/90'
              }`}>
                {Math.round((selectedAnnotation?.opacity || backgroundOpacity) * 100)}%
              </div>
            </div>
          )}
          
          {/* Tamaño de fuente - solo para texto */}
          {activeTool === TOOLS.TEXT && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">
                Tamaño{selectedAnnotation ? ' (texto seleccionado)' : ''}:
              </span>
              <button
                onClick={() => {
                  const currentSize = selectedAnnotation?.fontSize || fontSize
                  handleFontSizeChange(Math.max(12, currentSize - 4))
                }}
                className="p-1 rounded hover:bg-white/10 text-white/70 transition-colors"
                title="Reducir tamaño"
              >
                <Minus className="w-3 h-3" />
              </button>
              <div className={`w-14 h-6 flex items-center justify-center rounded text-xs font-mono ${
                selectedAnnotation ? 'bg-blue-600/30 text-blue-300' : 'bg-black/30 text-white/90'
              }`}>
                {selectedAnnotation?.fontSize || fontSize}px
              </div>
              <button
                onClick={() => {
                  const currentSize = selectedAnnotation?.fontSize || fontSize
                  handleFontSizeChange(Math.min(72, currentSize + 4))
                }}
                className="p-1 rounded hover:bg-white/10 text-white/70 transition-colors"
                title="Aumentar tamaño"
              >
                <Plus className="w-3 h-3" />
              </button>
              {selectedAnnotation && (
                <span className="text-[10px] text-blue-400 ml-1">
                 Selecciona el texto y cambia el tamaño con + o -
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Contador de anotaciones */}
        <div className="flex items-center gap-3 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <Circle className="w-3 h-3" />
            {countByType(TOOLS.ELLIPSE)}
          </span>
          <span className="flex items-center gap-1">
            <Square className="w-3 h-3" />
            {countByType(TOOLS.RECTANGLE)}
          </span>
          <span className="flex items-center gap-1">
            <MoveRight className="w-3 h-3" />
            {countByType(TOOLS.ARROW)}
          </span>
          <span className="flex items-center gap-1">
            <Type className="w-3 h-3" />
            {countByType(TOOLS.TEXT)}
          </span>
          <span className="text-white/30 mx-1">|</span>
          <span className="text-white/70 font-medium">
            Total: {localAnnotations.length}
          </span>
        </div>
      </div>
      
      {/* Área de dibujo */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-slate-950/50">
        <div 
          ref={imageContainerRef}
          className="relative shadow-2xl rounded-lg"
          style={{ width: canvasDimensions.width, height: canvasDimensions.height }}
        >
          {/* Imagen de fondo */}
          <img
            src={imageUrl}
            alt="Foto para anotar"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
          
          {/* Canvas para dibujo */}
          <canvas
            ref={canvasRef}
            width={canvasDimensions.width}
            height={canvasDimensions.height}
            className="absolute inset-0"
            style={{ cursor: getCursor() }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          
          {/* Botón de eliminar para elemento seleccionado */}
          {selectedAnnotation && !isDragging && !isResizingShape && (() => {
            const pos = getDeleteButtonPosition()
            if (!pos) return null
            return (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteSelected()
                }}
                className="absolute w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 z-10"
                style={{ left: pos.x, top: pos.y }}
                title="Eliminar elemento (se puede deshacer)"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )
          })()}
          
          {/* Handles de redimensionamiento para elemento seleccionado */}
          {selectedAnnotation && !isDragging && (() => {
            const handles = getResizeHandles()
            if (handles.length === 0) return null
            return handles.map(handle => (
              <div
                key={handle.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleResizeStart(handle.id, e)
                }}
                className="absolute w-3 h-3 bg-blue-500 border-2 border-white rounded-sm z-30 hover:bg-blue-400 hover:scale-125 transition-transform"
                style={{ 
                  left: handle.x - 2, 
                  top: handle.y - 2, 
                  cursor: handle.cursor 
                }}
                title="Arrastrar para redimensionar"
              />
            ))
          })()}
          
        </div>
        
        {/* Input de texto flotante - fuera del contenedor de imagen para evitar overflow */}
        {showTextInput && (
          <div
            className="fixed z-50"
            style={{
              left: textInputScreenPosition.x,
              top: textInputScreenPosition.y,
            }}
          >
            <div 
              className="bg-slate-800 rounded-lg shadow-2xl border border-white/20 p-3 relative select-none"
              style={{ width: textBoxSize.width }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <div 
                  className="w-4 h-4 rounded-full border border-white/30 flex-shrink-0"
                  style={{ backgroundColor: strokeColor }}
                />
                <span className="text-[10px] text-white/50">
                  {editingAnnotationId ? 'Editando texto' : 'Nuevo texto'}
                </span>
                <span className="text-[10px] text-white/30 ml-auto">
                  {textBoxSize.width}x{textBoxSize.height}
                </span>
              </div>
              <textarea
                ref={textInputRef}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder="Escribe aquí."
                className="w-full bg-slate-900 text-white px-3 py-2.5 rounded-lg border border-white/20 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 placeholder:text-white/30 resize-none overflow-auto"
                style={{ 
                  height: textBoxSize.height,
                  fontSize: '14px',
                  lineHeight: 1.5
                }}
              />
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-[10px] text-white/40">Enter = nueva línea • Esc = cancelar</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleTextCancel}
                    className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textValue.trim()}
                    className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors font-medium"
                  >
                    {editingAnnotationId ? 'Guardar' : 'Añadir'}
                  </button>
                </div>
              </div>
              
              {/* Handle de redimensionamiento en esquina inferior derecha */}
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute -bottom-1 -right-1 w-5 h-5 cursor-se-resize group"
                title="Arrastra para redimensionar"
              >
                <svg 
                  className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors absolute bottom-0 right-0"
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                >
                  <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Instrucciones contextuales */}
      <div className="px-4 py-2.5 bg-gradient-to-t from-slate-900 to-slate-900/80 text-center border-t border-white/5">
        <p className="text-white/60 text-xs">
          {activeTool === TOOLS.ELLIPSE && !selectedAnnotation && 'Click y arrastra para dibujar un círculo u óvalo • Click en elemento existente para mover'}
          {activeTool === TOOLS.RECTANGLE && !selectedAnnotation && 'Click y arrastra para dibujar un rectángulo sin fondo • Click en elemento existente para mover'}
          {activeTool === TOOLS.BACKGROUND && !selectedAnnotation && 'Click y arrastra para dibujar un fondo con relleno • Click en elemento existente para mover'}
          {activeTool === TOOLS.ARROW && !selectedAnnotation && 'Click y arrastra para dibujar una flecha • Click en elemento existente para mover'}
          {activeTool === TOOLS.TEXT && !selectedAnnotation && 'Doble click para añadir texto • Doble click en texto existente para editar'}
          {selectedAnnotation && `Arrastra para mover • Click en X para eliminar • Tipo: ${selectedAnnotation.type || 'ellipse'}`}
          <span className="text-white/30 mx-2">•</span>
          <span className="text-white/40">Atajos: 1-5 herramientas, Ctrl+Z deshacer, Ctrl+Y rehacer</span>
        </p>
      </div>
    </div>
  )
}

export default PhotoAnnotationTool
