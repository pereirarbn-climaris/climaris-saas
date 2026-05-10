# Climaris Design System

Sistema de design padronizado para todas as páginas da aplicação Climaris.

---

## 1. Paleta de Cores

### Cores Primárias
| Token | Valor Light | Valor Dark | Uso |
|-------|-------------|------------|-----|
| `--color-primary` | `#0284c7` | `#38bdf8` | Botões, links, ações principais |
| `--color-primary-hover` | `#0369a1` | `#7dd3fc` | Hover em elementos primários |
| `--color-primary-light` | `#0ea5e9` | `#0ea5e9` | Gradientes, destaques |

### Cores de Texto
| Token | Valor Light | Valor Dark | Uso |
|-------|-------------|------------|-----|
| `--color-text` | `#0f172a` | `#f1f5f9` | Texto principal |
| `--color-text-muted` | `#64748b` | `#94a3b8` | Texto secundário, labels |
| `--color-text-subtle` | `#94a3b8` | `#64748b` | Placeholders, hints |

### Cores de Superfície
| Token | Valor Light | Valor Dark | Uso |
|-------|-------------|------------|-----|
| `--color-surface` | `#f8fafc` | `#0f172a` | Background da página |
| `--color-surface-elevated` | `#ffffff` | `#1e293b` | Cards, modais, dropdowns |
| `--color-border` | `#e2e8f0` | `#334155` | Bordas, divisores |

### Cores Semânticas
| Token | Valor | Uso |
|-------|-------|-----|
| `--color-success` | `#15803d` | Status ativo, confirmações |
| `--color-success-light` | `#22c55e` | Badges de sucesso |
| `--color-error` | `#b91c1c` | Erros, ações destrutivas |
| `--color-error-light` | `#ef4444` | Badges de erro |
| `--color-warning` | `#d97706` | Alertas, pendências |
| `--color-warning-light` | `#f59e0b` | Badges de aviso |

### Cores de Gradiente (Hero)
```css
--color-hero-start: #0ea5e9;
--color-hero-mid: #0284c7;
--color-hero-end: #0369a1;
```

---

## 2. Tipografia

### Família de Fontes
- **Sans-serif (padrão):** Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif
- **Next.js (v0-referencia):** Geist, Geist Mono

### Tamanhos de Fonte
| Token | Tamanho | Uso |
|-------|---------|-----|
| `--font-size-xs` | `0.6875rem` (11px) | Labels pequenos, badges |
| `--font-size-sm` | `0.75rem` (12px) | Texto secundário, captions |
| `--font-size-base` | `0.875rem` (14px) | Texto padrão do app |
| `--font-size-md` | `0.9375rem` (15px) | Texto enfatizado |
| `--font-size-lg` | `1rem` (16px) | Títulos de seção |
| `--font-size-xl` | `1.125rem` (18px) | Títulos de card |
| `--font-size-2xl` | `1.25rem` (20px) | Títulos de página |
| `--font-size-3xl` | `1.5rem` (24px) | Títulos grandes |
| `--font-size-4xl` | `2rem` (32px) | Hero titles |

### Pesos de Fonte
| Token | Peso | Uso |
|-------|------|-----|
| `--font-weight-normal` | `400` | Texto corrido |
| `--font-weight-medium` | `500` | Links, botões secundários |
| `--font-weight-semibold` | `600` | Labels, subtítulos |
| `--font-weight-bold` | `700` | Títulos, valores |

### Line Heights
| Token | Valor | Uso |
|-------|-------|-----|
| `--line-height-tight` | `1.25` | Títulos |
| `--line-height-normal` | `1.5` | Texto padrão |
| `--line-height-relaxed` | `1.625` | Texto longo |

---

## 3. Espaçamento

### Escala de Espaçamento
| Token | Valor | Uso |
|-------|-------|-----|
| `--space-1` | `0.25rem` (4px) | Gaps mínimos |
| `--space-2` | `0.5rem` (8px) | Entre elementos inline |
| `--space-3` | `0.75rem` (12px) | Padding interno pequeno |
| `--space-4` | `1rem` (16px) | Gap padrão |
| `--space-5` | `1.25rem` (20px) | Padding de cards |
| `--space-6` | `1.5rem` (24px) | Margin entre seções |
| `--space-8` | `2rem` (32px) | Espaçamento grande |
| `--space-10` | `2.5rem` (40px) | Espaçamento XL |
| `--space-12` | `3rem` (48px) | Espaçamento XXL |

### Espaçamento de Página
```css
--space-page: clamp(1rem, 4vw, 1.75rem);
```

### Safe Areas (Mobile)
```css
--space-safe-top: env(safe-area-inset-top, 0px);
--space-safe-right: env(safe-area-inset-right, 0px);
--space-safe-bottom: env(safe-area-inset-bottom, 0px);
--space-safe-left: env(safe-area-inset-left, 0px);
```

---

## 4. Border Radius

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | `0.375rem` (6px) | Badges, chips |
| `--radius-md` | `0.5rem` (8px) | Inputs pequenos |
| `--radius-lg` | `0.75rem` (12px) | Botões, inputs |
| `--radius-xl` | `1rem` (16px) | Cards |
| `--btn-radius` | `0.625rem` (10px) | Botões |
| `--input-radius` | `0.625rem` (10px) | Inputs |
| `--card-radius` | `1rem` (16px) | Cards |
| `--badge-radius` | `999px` | Badges pill |

---

## 5. Sombras

### Card Shadows
```css
--card-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04);
--card-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.06);
```

### Button Shadow (Primary)
```css
box-shadow: 0 2px 8px rgba(14, 165, 233, 0.25);
/* hover */
box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);
```

---

## 6. Ícones

### Tamanhos Padronizados
| Token | Tamanho | Uso |
|-------|---------|-----|
| `--icon-size-xs` | `0.875rem` (14px) | Ícones inline muito pequenos |
| `--icon-size-sm` | `1rem` (16px) | Ícones de busca, inputs |
| `--icon-size-base` | `1.125rem` (18px) | Ícones de navegação |
| `--icon-size-md` | `1.25rem` (20px) | Ícones de tabela, botões |
| `--icon-size-lg` | `1.375rem` (22px) | Ícones de stat cards |
| `--icon-size-xl` | `1.5rem` (24px) | Ícones grandes |
| `--icon-size-2xl` | `2rem` (32px) | Ícones hero |

### Stroke Width
```css
--icon-stroke: 1.75;
```

### Biblioteca Padrão
- **Frontend (React):** Ícones SVG customizados em `NavIcons.tsx`
- **v0-referencia (Next.js):** Lucide React

### Padrão de SVG
```tsx
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
```

---

## 7. Componentes

### Botões

#### Botão Primário
```css
height: var(--btn-height-md);        /* 44px */
padding: 0 var(--btn-padding-md);    /* 0 1.25rem */
border-radius: var(--btn-radius);    /* 10px */
background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-primary) 100%);
color: #ffffff;
font-size: var(--font-size-base);
font-weight: var(--font-weight-semibold);
```

#### Botão Secundário
```css
height: var(--btn-height-md);
padding: 0 var(--btn-padding-base);
border: 1px solid var(--color-border);
border-radius: var(--btn-radius);
background: var(--color-surface-elevated);
color: var(--color-text);
font-weight: var(--font-weight-medium);
```

#### Tamanhos de Botão
| Token | Altura |
|-------|--------|
| `--btn-height-sm` | `2rem` (32px) |
| `--btn-height-base` | `2.5rem` (40px) |
| `--btn-height-md` | `2.75rem` (44px) |
| `--btn-height-lg` | `3rem` (48px) |

### Inputs

```css
height: var(--input-height);         /* 44px */
padding: 0 var(--input-padding-x);   /* 0 0.875rem */
border: var(--input-border);         /* 1px solid var(--color-border) */
border-radius: var(--input-radius);  /* 10px */
background: var(--input-bg);         /* var(--color-surface-elevated) */
font-size: var(--font-size-base);
```

#### Focus State
```css
border-color: var(--color-primary);
box-shadow: 0 0 0 3px var(--color-focus-ring);
```

### Cards

```css
background: var(--color-surface-elevated);
border-radius: var(--card-radius);   /* 16px */
padding: var(--card-padding);        /* 20px */
border: 1px solid var(--color-border);
box-shadow: var(--card-shadow);
```

### Avatares

| Token | Tamanho |
|-------|---------|
| `--avatar-size-sm` | `2rem` (32px) |
| `--avatar-size-base` | `2.5rem` (40px) |
| `--avatar-size-lg` | `3rem` (48px) |

#### Cores de Avatar
```css
.avatarBlue   { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
.avatarGreen  { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
.avatarPurple { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
.avatarOrange { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); }
.avatarPink   { background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); }
.avatarTeal   { background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); }
```

### Badges/Status

```css
height: var(--badge-height);         /* 24px */
padding: 0 var(--badge-padding-x);   /* 0 0.625rem */
border-radius: var(--badge-radius);  /* 999px */
font-size: var(--badge-font-size);   /* 11px */
font-weight: var(--font-weight-bold);
text-transform: uppercase;
letter-spacing: 0.03em;
```

#### Status Ativo
```css
background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
color: #15803d;
border: 1px solid #86efac;
```

#### Status Inativo
```css
background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
color: #92400e;
border: 1px solid #fcd34d;
```

### Tabelas

```css
--table-row-height: 3.5rem;          /* 56px */
--table-cell-padding-x: 1rem;
--table-cell-padding-y: 0.75rem;
--table-header-bg: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
```

#### Header de Tabela
```css
font-size: var(--font-size-xs);
font-weight: var(--font-weight-bold);
color: var(--color-text-muted);
text-transform: uppercase;
letter-spacing: 0.05em;
```

---

## 8. Animações

### Duração
```css
--motion-duration: 0.15s;       /* Transições rápidas */
--motion-duration-slow: 0.25s;  /* Transições lentas */
```

### Easing
```css
--motion-easing: cubic-bezier(0.4, 0, 0.2, 1);
```

### Redução de Movimento
```css
@media (prefers-reduced-motion: reduce) {
  --motion-duration: 0.01ms;
}
```

---

## 9. Layout

### Touch Target Mínimo
```css
--touch-target-min: 2.75rem;  /* 44px */
```

### Larguras Máximas de Conteúdo
```css
--content-max-form: 26rem;    /* Forms */
--content-max-hero: 26rem;    /* Hero sections */
```

### Stats Grid
```css
/* Desktop: 4 colunas */
grid-template-columns: repeat(4, 1fr);
gap: var(--space-5);

/* Tablet: 2 colunas */
@media (max-width: 1200px) {
  grid-template-columns: repeat(2, 1fr);
}

/* Mobile: 1 coluna */
@media (max-width: 640px) {
  grid-template-columns: 1fr;
  gap: var(--space-3);
}
```

---

## 10. Breakpoints

| Nome | Valor | Uso |
|------|-------|-----|
| Mobile | `< 640px` | Layout de 1 coluna |
| Tablet | `640px - 1024px` | Layout de 2 colunas |
| Desktop | `1024px - 1200px` | Layout padrão |
| Wide | `> 1200px` | Layout completo |

---

## 11. Dark Mode

O sistema suporta dark mode automaticamente via `prefers-color-scheme`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #f1f5f9;
    --color-surface: #0f172a;
    --color-surface-elevated: #1e293b;
    --color-border: #334155;
    --color-primary: #38bdf8;
    /* ... */
  }
}
```

---

## 12. Uso Prático

### Importando os Tokens

**Frontend (React/Vite):**
```tsx
import './index.css';
// Tokens disponíveis via CSS variables
```

**Next.js (v0-referencia):**
```tsx
// layout.tsx
import './globals.css';
// Usar classes Tailwind que mapeiam para tokens
```

### Exemplo de Uso em CSS Modules
```css
.card {
  background: var(--color-surface-elevated);
  border-radius: var(--card-radius);
  padding: var(--card-padding);
  border: 1px solid var(--color-border);
}

.title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}
```

### Exemplo de Uso com Tailwind (v0-referencia)
```tsx
<div className="bg-card rounded-lg p-5 border border-border">
  <h1 className="text-xl font-bold text-foreground">
    Título
  </h1>
</div>
```
