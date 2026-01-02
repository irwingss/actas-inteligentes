import { useState, useEffect } from 'react'

export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved && ['light', 'dark', 'pink'].includes(saved)) {
      return saved
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    const root = window.document.documentElement
    // Remove all theme classes
    root.classList.remove('dark', 'pink')
    
    // Add the current theme class
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'pink') {
      root.classList.add('pink')
    }
    
    localStorage.setItem('theme', theme)
  }, [theme])

  const cycleTheme = () => {
    setTheme(current => {
      if (current === 'light') return 'dark'
      if (current === 'dark') return 'pink'
      return 'light'
    })
  }

  return [theme, cycleTheme, setTheme]
}

// Mantener compatibilidad con código antiguo
export const useDarkMode = () => {
  const [theme, cycleTheme] = useTheme()
  const isDark = theme === 'dark'
  const toggle = cycleTheme
  return [isDark, toggle]
}
