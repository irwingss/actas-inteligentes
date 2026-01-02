import React, { useEffect, useCallback, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Undo,
  Redo,
  Subscript,
  Superscript,
  Minus,
  X,
  FileText
} from 'lucide-react'

// Extensión personalizada para notas al pie
import { Node, mergeAttributes } from '@tiptap/core'

const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  
  addAttributes() {
    return {
      number: {
        default: 1,
      },
      content: {
        default: '',
      },
    }
  },
  
  parseHTML() {
    return [{ tag: 'span[data-footnote]' }]
  },
  
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-footnote': node.attrs.number,
        'class': 'footnote-marker',
        'title': node.attrs.content,
      }),
      `[${node.attrs.number}]`,
    ]
  },
  
  addCommands() {
    return {
      insertFootnote: (attrs) => ({ commands, state }) => {
        // Contar notas al pie existentes para auto-numerar
        let count = 0
        state.doc.descendants((node) => {
          if (node.type.name === 'footnote') count++
        })
        return commands.insertContent({
          type: this.name,
          attrs: { ...attrs, number: count + 1 },
        })
      },
    }
  },
})

// Botón de la toolbar
const ToolbarButton = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      p-1.5 rounded transition-colors
      ${active 
        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 pink:bg-pink-100 pink:text-[#ff0075]' 
        : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b] hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100'
      }
      ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
    `}
  >
    {children}
  </button>
)

// Separador vertical
const Divider = () => (
  <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 pink:bg-pink-300 mx-1" />
)

// Modal para nota al pie
const FootnoteModal = ({ isOpen, onClose, onConfirm }) => {
  const [footnoteText, setFootnoteText] = useState('')
  
  if (!isOpen) return null
  
  const handleConfirm = () => {
    if (footnoteText.trim()) {
      onConfirm(footnoteText.trim())
      setFootnoteText('')
    }
  }
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleConfirm()
    }
    if (e.key === 'Escape') {
      onClose()
      setFootnoteText('')
    }
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => { onClose(); setFootnoteText('') }}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Insertar Nota al Pie
            </h3>
          </div>
          <button
            onClick={() => { onClose(); setFootnoteText('') }}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a] mb-2">
            Contenido de la nota al pie:
          </label>
          <textarea
            value={footnoteText}
            onChange={(e) => setFootnoteText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe el contenido de la nota al pie..."
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg 
                       bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-[#0f172a]
                       focus:ring-2 focus:ring-blue-500 pink:focus:ring-pink-500 focus:border-transparent
                       resize-none"
            rows={3}
            autoFocus
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            💡 Presiona Enter para confirmar o Escape para cancelar
          </p>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 pink:border-pink-200 bg-slate-50 dark:bg-slate-900/50 pink:bg-pink-50 rounded-b-xl">
          <button
            onClick={() => { onClose(); setFootnoteText('') }}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]
                       hover:bg-slate-200 dark:hover:bg-slate-700 pink:hover:bg-pink-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!footnoteText.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 
                       disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Insertar Nota
          </button>
        </div>
      </div>
    </div>
  )
}

export const RichTextEditor = ({ 
  value = '', 
  onChange, 
  placeholder = 'Escribe aquí...',
  minHeight = '150px',
  className = ''
}) => {
  const [showFootnoteModal, setShowFootnoteModal] = useState(false)
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // No necesitamos headings para obligaciones
        codeBlock: false,
        code: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
      Footnote,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      // Retornamos HTML para almacenar
      const html = editor.getHTML()
      onChange?.(html)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
        style: `min-height: ${minHeight}; font-family: Arial, sans-serif;`,
      },
    },
  })

  // Sincronizar valor externo - con verificación más robusta
  useEffect(() => {
    if (!editor) return
    
    // Comparar contenido normalizado para evitar actualizaciones innecesarias
    const currentContent = editor.getHTML()
    const newContent = value || ''
    
    // Solo actualizar si el contenido es realmente diferente
    // Ignorar diferencias menores como espacios en blanco
    const normalizedCurrent = currentContent.replace(/<p><\/p>/g, '').trim()
    const normalizedNew = newContent.replace(/<p><\/p>/g, '').trim()
    
    if (normalizedCurrent !== normalizedNew) {
      // Usar setTimeout para evitar race conditions con el estado de React
      const timeoutId = setTimeout(() => {
        editor.commands.setContent(newContent, false)
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [value, editor])

  // Función para insertar nota al pie (ahora usa modal)
  const insertFootnote = useCallback((content) => {
    if (content) {
      editor?.chain().focus().insertFootnote({ content }).run()
      setShowFootnoteModal(false)
    }
  }, [editor])
  
  // Función para abrir modal de nota al pie
  const openFootnoteModal = useCallback(() => {
    setShowFootnoteModal(true)
  }, [])
  
  // Obtener notas al pie del contenido actual
  const currentFootnotes = React.useMemo(() => {
    if (!editor) return []
    const footnotes = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'footnote') {
        footnotes.push({
          number: node.attrs.number,
          content: node.attrs.content
        })
      }
    })
    return footnotes.sort((a, b) => a.number - b.number)
  }, [editor?.state.doc])

  if (!editor) {
    return (
      <div className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg" style={{ minHeight }} />
    )
  }

  return (
    <div className={`border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg overflow-hidden bg-white dark:bg-slate-700 pink:bg-white ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 dark:border-slate-600 pink:border-pink-200 bg-slate-50 dark:bg-slate-800 pink:bg-pink-50">
        {/* Deshacer / Rehacer */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rehacer (Ctrl+Y)"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
        
        <Divider />
        
        {/* Formato de texto */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Negrita (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Cursiva (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Subrayado (Ctrl+U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        
        <Divider />
        
        {/* Alineación */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title="Alinear izquierda"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title="Centrar"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title="Alinear derecha"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
          title="Justificar"
        >
          <AlignJustify className="w-4 h-4" />
        </ToolbarButton>
        
        <Divider />
        
        {/* Listas */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Lista con viñetas"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Lista numerada"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        
        <Divider />
        
        {/* Indentación - Funciona solo dentro de listas */}
        <ToolbarButton
          onClick={() => {
            // Si no estamos en una lista, primero crear una
            if (!editor.isActive('bulletList') && !editor.isActive('orderedList')) {
              editor.chain().focus().toggleBulletList().run()
            } else {
              editor.chain().focus().sinkListItem('listItem').run()
            }
          }}
          title="Aumentar sangría (crea lista si es necesario)"
        >
          <Indent className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            if (editor.can().liftListItem('listItem')) {
              editor.chain().focus().liftListItem('listItem').run()
            }
          }}
          disabled={!editor.can().liftListItem('listItem')}
          title="Disminuir sangría"
        >
          <Outdent className="w-4 h-4" />
        </ToolbarButton>
        
        <Divider />
        
        {/* Línea horizontal */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Línea horizontal"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>
        
        {/* Nota al pie */}
        <ToolbarButton
          onClick={openFootnoteModal}
          title="Insertar nota al pie"
        >
          <Superscript className="w-4 h-4" />
        </ToolbarButton>
      </div>
      
      {/* Editor */}
      <div className="p-3">
        <EditorContent editor={editor} />
      </div>
      
      {/* Sección de Notas al Pie */}
      {currentFootnotes.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-600 pink:border-pink-200 bg-slate-50 dark:bg-slate-800 pink:bg-pink-50 px-3 py-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Notas al pie ({currentFootnotes.length})
          </div>
          <div className="space-y-1">
            {currentFootnotes.map((fn) => (
              <div key={fn.number} className="flex items-start gap-2 text-xs">
                <span className="text-blue-600 dark:text-blue-400 font-semibold flex-shrink-0">
                  [{fn.number}]
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {fn.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Modal de Nota al Pie */}
      <FootnoteModal
        isOpen={showFootnoteModal}
        onClose={() => setShowFootnoteModal(false)}
        onConfirm={insertFootnote}
      />
      
      {/* Estilos inline para el editor */}
      <style>{`
        .ProseMirror {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.5;
          color: inherit;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p {
          margin: 0 0 0.5em 0;
        }
        .ProseMirror p:last-child {
          margin-bottom: 0;
        }
        
        /* Estilos de listas - IMPORTANTE: visibilidad de bullets y números */
        .ProseMirror ul {
          padding-left: 1.5em;
          margin: 0.5em 0;
          list-style-type: disc !important;
        }
        .ProseMirror ul ul {
          list-style-type: circle !important;
        }
        .ProseMirror ul ul ul {
          list-style-type: square !important;
        }
        .ProseMirror ol {
          padding-left: 1.5em;
          margin: 0.5em 0;
          list-style-type: decimal !important;
        }
        .ProseMirror ol ol {
          list-style-type: lower-alpha !important;
        }
        .ProseMirror ol ol ol {
          list-style-type: lower-roman !important;
        }
        .ProseMirror li {
          margin: 0.25em 0;
          display: list-item !important;
        }
        .ProseMirror li p {
          margin: 0;
          display: inline;
        }
        /* Asegurar que los marcadores de lista sean visibles */
        .ProseMirror ul li::marker,
        .ProseMirror ol li::marker {
          color: #374151;
        }
        .dark .ProseMirror ul li::marker,
        .dark .ProseMirror ol li::marker {
          color: #d1d5db;
        }
        
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 1em 0;
        }
        .footnote-marker {
          color: #2563eb;
          font-size: 0.75em;
          vertical-align: super;
          cursor: help;
          font-weight: 600;
          background: #dbeafe;
          padding: 0 3px;
          border-radius: 2px;
        }
        .dark .ProseMirror {
          color: #e2e8f0;
        }
        .dark .ProseMirror p.is-editor-empty:first-child::before {
          color: #64748b;
        }
        .dark .ProseMirror hr {
          border-top-color: #475569;
        }
        .dark .footnote-marker {
          background: #1e3a5f;
        }
        /* Pink mode - texto oscuro sobre fondo blanco/rosa */
        .pink .ProseMirror {
          color: #0f172a;
        }
        .pink .ProseMirror p.is-editor-empty:first-child::before {
          color: #64748b;
        }
        .pink .ProseMirror hr {
          border-top-color: #f9a8d4;
        }
        .pink .ProseMirror ul li::marker,
        .pink .ProseMirror ol li::marker {
          color: #0f172a;
        }
        .pink .footnote-marker {
          color: #ff0075;
          background: #fce7f3;
        }
      `}</style>
    </div>
  )
}

// Función helper para extraer notas al pie del HTML
export const extractFootnotes = (html) => {
  const footnotes = []
  const regex = /data-footnote="(\d+)" title="([^"]+)"/g
  let match
  while ((match = regex.exec(html)) !== null) {
    footnotes.push({
      number: parseInt(match[1]),
      content: match[2],
    })
  }
  return footnotes.sort((a, b) => a.number - b.number)
}

// Función helper para convertir HTML del editor a formato Word-compatible
export const toWordFormat = (html) => {
  // Reemplazar notas al pie por formato Word
  let wordHtml = html
  const footnotes = extractFootnotes(html)
  
  // Reemplazar marcadores de notas al pie
  footnotes.forEach((fn) => {
    wordHtml = wordHtml.replace(
      new RegExp(`<span[^>]*data-footnote="${fn.number}"[^>]*>\\[${fn.number}\\]</span>`, 'g'),
      `<sup style="color: blue;">[${fn.number}]</sup>`
    )
  })
  
  // Agregar sección de notas al pie al final si hay alguna
  if (footnotes.length > 0) {
    wordHtml += '<hr style="margin-top: 2em;"/>'
    wordHtml += '<div style="font-size: 10px;">'
    footnotes.forEach((fn) => {
      wordHtml += `<p><sup>[${fn.number}]</sup> ${fn.content}</p>`
    })
    wordHtml += '</div>'
  }
  
  return wordHtml
}

export default RichTextEditor
