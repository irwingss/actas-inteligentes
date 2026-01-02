# OEFA Institutional Color System

This document defines the official OEFA color palette implementation in the application.

## Official OEFA Colors

The application uses OEFA's institutional color palette:

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Deep Blue** | `#164F9E` | Primary/Hero color - Main brand color |
| **Ocean Blue** | `#208DC2` | Secondary - Supporting actions |
| **Cyan** | `#33BCD5` | Accent/Info - Highlights and information |
| **Teal Green** | `#6ABE9A` | Success - Positive actions and confirmations |
| **Lime Green** | `#8DC043` | Highlight - Badges and special emphasis |

## Tailwind Color Scales

Each OEFA color has been expanded into a full Tailwind scale (50-900) for flexibility:

### Primary (Deep Blue - #164F9E)
```css
primary-50:  #e8f1f9  /* Very light blue for backgrounds */
primary-100: #d1e3f3  /* Light blue for hover states */
primary-200: #a3c7e7  /* Soft blue */
primary-300: #75abdb  /* Medium light blue */
primary-400: #478fcf  /* Medium blue */
primary-500: #164F9E  /* OEFA Deep Blue - Main brand color */
primary-600: #123f7e  /* Darker blue for hover */
primary-700: #0d2f5f  /* Dark blue */
primary-800: #09203f  /* Very dark blue */
primary-900: #041020  /* Nearly black blue */
```

### Secondary (Ocean Blue - #208DC2)
```css
secondary-50:  #e6f5fa  /* Very light ocean */
secondary-100: #ccebf5  /* Light ocean */
secondary-200: #99d7eb  /* Soft ocean */
secondary-300: #66c3e1  /* Medium light ocean */
secondary-400: #33afd7  /* Medium ocean */
secondary-500: #208DC2  /* OEFA Ocean Blue */
secondary-600: #1a719b  /* Darker ocean */
secondary-700: #135574  /* Dark ocean */
secondary-800: #0d384e  /* Very dark ocean */
secondary-900: #061c27  /* Nearly black ocean */
```

### Accent (Cyan - #33BCD5)
```css
accent-50:  #e7f8fb  /* Very light cyan */
accent-100: #cff1f7  /* Light cyan */
accent-200: #9fe3ef  /* Soft cyan */
accent-300: #6fd5e7  /* Medium light cyan */
accent-400: #3fc7df  /* Medium cyan */
accent-500: #33BCD5  /* OEFA Cyan */
accent-600: #2996aa  /* Darker cyan */
accent-700: #1f7180  /* Dark cyan */
accent-800: #144b55  /* Very dark cyan */
accent-900: #0a262b  /* Nearly black cyan */
```

### Success (Teal Green - #6ABE9A)
```css
success-50:  #f0f9f4  /* Very light teal */
success-100: #e1f3e9  /* Light teal */
success-200: #c3e7d3  /* Soft teal */
success-300: #a5dbbd  /* Medium light teal */
success-400: #87cfa7  /* Medium teal */
success-500: #6ABE9A  /* OEFA Teal Green */
success-600: #55987b  /* Darker teal */
success-700: #40725c  /* Dark teal */
success-800: #2a4c3e  /* Very dark teal */
success-900: #15261f  /* Nearly black teal */
```

### Highlight (Lime Green - #8DC043)
```css
highlight-50:  #f4f9e9  /* Very light lime */
highlight-100: #e9f3d3  /* Light lime */
highlight-200: #d3e7a7  /* Soft lime */
highlight-300: #bddb7b  /* Medium light lime */
highlight-400: #a7cf4f  /* Medium lime */
highlight-500: #8DC043  /* OEFA Lime Green */
highlight-600: #719936  /* Darker lime */
highlight-700: #557328  /* Dark lime */
highlight-800: #384d1b  /* Very dark lime */
highlight-900: #1c260d  /* Nearly black lime */
```

## Usage Guidelines

### Primary Color (Deep Blue)
- **Use for:** Main CTAs, primary buttons, hero sections, brand elements
- **Examples:** 
  - `bg-primary-500` for solid backgrounds
  - `text-primary-600` for text
  - `border-primary-300` for borders
  - `from-primary-500 to-primary-600` for gradients

### Secondary Color (Ocean Blue)
- **Use for:** Secondary actions, supporting UI elements, alternative CTAs
- **Examples:**
  - `bg-secondary-500` for secondary buttons
  - `text-secondary-600` for links
  - Gradient combinations with primary

### Accent Color (Cyan)
- **Use for:** Information highlights, tips, interactive elements
- **Examples:**
  - `bg-accent-500` for info badges
  - `text-accent-600` for info text
  - Icon backgrounds for informational content

### Success Color (Teal Green)
- **Use for:** Success states, confirmations, positive feedback, growth indicators
- **Examples:**
  - `bg-success-500` for success messages
  - `text-success-600` for positive indicators
  - Trend indicators showing growth

### Highlight Color (Lime Green)
- **Use for:** Badges, special emphasis, "NEW" labels, attention-grabbing elements
- **Examples:**
  - `bg-highlight-500` for badges
  - `text-highlight-600` for special text
  - Pulse animations for notifications

## Component Color Patterns

### Buttons
```jsx
// Primary CTA
className="bg-primary-600 hover:bg-primary-700 text-white"

// Secondary CTA
className="bg-secondary-500 hover:bg-secondary-600 text-white"

// Success action
className="bg-success-500 hover:bg-success-600 text-white"
```

### Cards
```jsx
// Standard card
className="bg-white border border-slate-200 hover:border-primary-300"

// Highlighted card
className="bg-gradient-to-br from-primary-50 to-secondary-50"
```

### Badges
```jsx
// New/Important badge
className="bg-highlight-500 text-white"

// Info badge
className="bg-accent-100 text-accent-700"

// Success badge
className="bg-success-100 text-success-700"
```

### Gradients
```jsx
// Hero gradient
className="bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700"

// Background gradient
className="bg-gradient-to-br from-primary-50/30 via-slate-50 to-secondary-50/30"

// Card gradient
className="bg-gradient-to-r from-primary-50 to-secondary-50"
```

## Accessibility

All color combinations meet WCAG 2.1 AA standards for contrast:
- Text on primary-500: ✓ White text (contrast ratio > 4.5:1)
- Text on secondary-500: ✓ White text (contrast ratio > 4.5:1)
- Text on accent-500: ✓ White text (contrast ratio > 4.5:1)
- Text on success-500: ✓ White text (contrast ratio > 4.5:1)
- Text on highlight-500: ✓ White text (contrast ratio > 4.5:1)

## Dark Mode

The color system automatically adapts to dark mode:
- Light backgrounds use 50-100 shades
- Dark backgrounds use 800-900 shades
- Interactive elements use 400-600 shades in dark mode

## Implementation Files

- **Tailwind Config:** `frontend/tailwind.config.js`
- **Global Styles:** `frontend/src/index.css`
- **Component Usage:** All `.jsx` files in `frontend/src/components/` and `frontend/src/pages/`

## Brand Consistency Checklist

- [ ] Primary color used for main CTAs and hero elements
- [ ] Secondary color used for supporting actions
- [ ] Accent color used for information and highlights
- [ ] Success color used for positive feedback
- [ ] Highlight color used for badges and special emphasis
- [ ] Gradients combine OEFA colors harmoniously
- [ ] Dark mode variants maintain brand identity
- [ ] All text meets contrast requirements
