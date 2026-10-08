/**
 * Climaris Design System - Design Tokens
 * 
 * Tokens de design para uso programático em TypeScript.
 * Estes valores espelham as CSS variables definidas em index.css.
 * 
 * @see DESIGN_SYSTEM.md para documentação completa
 */

// ============================================
// TAMANHOS DE FONTE
// ============================================
export const fontSizes = {
  xs: '0.6875rem',    // 11px - labels pequenos, badges
  sm: '0.75rem',      // 12px - texto secundário, captions
  base: '0.875rem',   // 14px - texto padrão do app
  md: '0.9375rem',    // 15px - texto enfatizado
  lg: '1rem',         // 16px - títulos de seção
  xl: '1.125rem',     // 18px - títulos de card
  '2xl': '1.25rem',   // 20px - títulos de página
  '3xl': '1.5rem',    // 24px - títulos grandes
  '4xl': '2rem',      // 32px - hero titles
} as const

// ============================================
// PESOS DE FONTE
// ============================================
export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

// ============================================
// LINE HEIGHTS
// ============================================
export const lineHeights = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.625,
} as const

// ============================================
// TAMANHOS DE ÍCONE
// ============================================
export const iconSizes = {
  xs: '0.875rem',     // 14px - ícones inline muito pequenos
  sm: '1rem',         // 16px - ícones de busca, inputs
  base: '1.125rem',   // 18px - ícones de navegação
  md: '1.25rem',      // 20px - ícones de tabela, botões
  lg: '1.375rem',     // 22px - ícones de stat cards
  xl: '1.5rem',       // 24px - ícones grandes
  '2xl': '2rem',      // 32px - ícones hero
} as const

// ============================================
// STROKE WIDTH DE ÍCONE
// ============================================
export const iconStroke = 1.75

// ============================================
// ESPAÇAMENTO
// ============================================
export const spacing = {
  1: '0.25rem',       // 4px
  2: '0.5rem',        // 8px
  3: '0.75rem',       // 12px
  4: '1rem',          // 16px
  5: '1.25rem',       // 20px
  6: '1.5rem',        // 24px
  8: '2rem',          // 32px
  10: '2.5rem',       // 40px
  12: '3rem',         // 48px
} as const

// ============================================
// BORDER RADIUS
// ============================================
export const radii = {
  sm: '0.375rem',     // 6px
  md: '0.5rem',       // 8px
  lg: '0.75rem',      // 12px
  xl: '1rem',         // 16px
  btn: '0.625rem',    // 10px
  input: '0.625rem',  // 10px
  card: '1rem',       // 16px
  badge: '999px',     // pill
} as const

// ============================================
// ALTURAS DE BOTÃO
// ============================================
export const buttonHeights = {
  sm: '2rem',         // 32px
  base: '2.5rem',     // 40px
  md: '2.75rem',      // 44px - touch target
  lg: '3rem',         // 48px
} as const

// ============================================
// ALTURA DE INPUT
// ============================================
export const inputHeight = '2.75rem' // 44px - touch target

// ============================================
// TAMANHOS DE AVATAR
// ============================================
export const avatarSizes = {
  sm: '2rem',         // 32px
  base: '2.5rem',     // 40px
  lg: '3rem',         // 48px
} as const

// ============================================
// ALTURA DE BADGE
// ============================================
export const badgeHeight = '1.5rem' // 24px

// ============================================
// TABELA
// ============================================
export const tableRowHeight = '3.5rem' // 56px

// ============================================
// TOUCH TARGET MÍNIMO
// ============================================
export const touchTargetMin = '2.75rem' // 44px

// ============================================
// DURAÇÃO DE ANIMAÇÃO
// ============================================
export const motionDuration = {
  fast: '0.15s',
  slow: '0.25s',
} as const

// ============================================
// EASING DE ANIMAÇÃO
// ============================================
export const motionEasing = 'cubic-bezier(0.4, 0, 0.2, 1)'

// ============================================
// BREAKPOINTS
// ============================================
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1200,
  '2xl': 1400,
} as const

// ============================================
// CORES DE AVATAR (gradientes)
// ============================================
export const avatarColors = [
  'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',   // blue
  'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',   // green
  'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',   // purple
  'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',   // orange
  'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',   // pink
  'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',   // teal
] as const

/**
 * Retorna uma cor de avatar baseada em uma string (ex: nome)
 */
export function getAvatarColor(str: string): string {
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
}

/**
 * Retorna as iniciais de um nome (máximo 2 caracteres)
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
