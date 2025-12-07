# OpenCase UI/UX Design Specifications

## Design Philosophy

OpenCase follows a clean, professional design language focused on:
- **Clarity**: Financial data presented clearly without clutter
- **Trust**: Professional appearance that instills confidence
- **Efficiency**: Quick access to common actions
- **Accessibility**: Readable typography and sufficient contrast

## Brand Identity

### Logo
The OpenCase logo represents a briefcase (case) containing stock charts, symbolizing portfolio management.

Key elements:
- Briefcase shape: Professionalism and organization
- Chart bars: Stock/investment representation
- Growth arrow: Positive returns and growth
- Open lid: Transparency and accessibility

### Color Palette

#### Primary Colors
| Name | Hex | Usage |
|------|-----|-------|
| Indigo 600 | `#4F46E5` | Primary buttons, active states, links |
| Indigo 700 | `#4338CA` | Button hover states |
| Indigo 800 | `#3730A3` | Logo accent, borders |
| Indigo 50 | `#EEF2FF` | Active sidebar items, highlights |
| Indigo 100 | `#E0E7FF` | Light backgrounds |

#### Semantic Colors
| State | Color | Hex | Usage |
|-------|-------|-----|-------|
| Success | Green 500 | `#10B981` | Positive P&L, connected status |
| Success Light | Green 100 | `#D1FAE5` | Success backgrounds |
| Error | Red 500 | `#EF4444` | Negative P&L, errors |
| Error Light | Red 100 | `#FEE2E2` | Error backgrounds |
| Warning | Yellow 500 | `#F59E0B` | Warnings, alerts |
| Warning Light | Yellow 100 | `#FEF3C7` | Warning backgrounds |
| Info | Blue 500 | `#3B82F6` | Information states |

#### Neutral Colors
| Name | Hex | Usage |
|------|-----|-------|
| Gray 50 | `#F9FAFB` | Page background |
| Gray 100 | `#F3F4F6` | Card backgrounds, hover |
| Gray 200 | `#E5E7EB` | Borders, dividers |
| Gray 400 | `#9CA3AF` | Placeholder text |
| Gray 500 | `#6B7280` | Secondary text |
| Gray 600 | `#4B5563` | Body text |
| Gray 700 | `#374151` | Headings |
| Gray 900 | `#111827` | Primary text |
| White | `#FFFFFF` | Cards, modals |

#### Theme Colors (Basket Categories)
| Theme | Background | Text |
|-------|------------|------|
| Technology | `bg-blue-100` | `text-blue-800` |
| Banking | `bg-green-100` | `text-green-800` |
| Healthcare | `bg-red-100` | `text-red-800` |
| Consumer | `bg-purple-100` | `text-purple-800` |
| Automobile | `bg-orange-100` | `text-orange-800` |
| Index | `bg-indigo-100` | `text-indigo-800` |
| Dividend | `bg-yellow-100` | `text-yellow-800` |
| Growth | `bg-pink-100` | `text-pink-800` |

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             'Helvetica Neue', Arial, sans-serif;
```

### Type Scale
| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 2rem (32px) | Bold (700) | 1.25 |
| H2 | 1.5rem (24px) | Semibold (600) | 1.3 |
| H3 | 1.25rem (20px) | Semibold (600) | 1.4 |
| Body | 1rem (16px) | Normal (400) | 1.5 |
| Small | 0.875rem (14px) | Normal (400) | 1.5 |
| Caption | 0.75rem (12px) | Medium (500) | 1.4 |

### Financial Numbers
- Use monospace or tabular figures for financial data
- Right-align numeric columns in tables
- Format currency: INR (Indian Rupee) with locale formatting
- Show P&L with +/- prefix and color coding

## Layout System

### Page Structure
```
+----------------------------------------------------------+
|                        Navbar (64px)                      |
+----------------------------------------------------------+
|           |                                               |
|  Sidebar  |              Main Content                     |
|  (256px)  |              (flex-1)                         |
|           |                                               |
|           |                                               |
+----------------------------------------------------------+
```

### Spacing Scale
| Name | Size | Usage |
|------|------|-------|
| xs | 4px | Tight spacing, inline elements |
| sm | 8px | Related elements |
| md | 16px | Default padding |
| lg | 24px | Section spacing |
| xl | 32px | Large sections |
| 2xl | 48px | Page sections |

### Grid System
- 12-column grid for responsive layouts
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Container max-width: 1280px

## Component Specifications

### Cards
```
Border Radius: 12px (rounded-xl)
Shadow: 0 1px 3px rgba(0,0,0,0.1)
Background: White
Padding: 24px
```

### Buttons

#### Primary Button
```
Background: Indigo 600
Text: White
Padding: 8px 16px
Border Radius: 8px
Hover: Indigo 700
Active: Indigo 800
```

#### Secondary Button
```
Background: White
Border: 1px Gray 300
Text: Gray 700
Hover: Gray 50 background
```

#### Danger Button
```
Background: Red 600
Text: White
Hover: Red 700
```

### Form Inputs
```
Border: 1px Gray 300
Border Radius: 8px
Padding: 8px 16px
Focus: Ring 2px Indigo 500
Height: 40px
```

### Modals
```
Background: White
Border Radius: 12px
Shadow: 0 25px 50px rgba(0,0,0,0.25)
Overlay: Black 50% opacity
Max Width: 448px (sm), 768px (md), 1024px (lg)
Padding: 32px
```

### Tables
```
Header Background: Gray 50
Header Text: Gray 500, uppercase, 12px
Row Hover: Gray 50
Cell Padding: 12px 16px
Border: 1px Gray 200 (bottom)
```

### Badges/Pills
```
Border Radius: 9999px (full)
Padding: 4px 12px
Font Size: 12px
Font Weight: 500
```

## Navigation

### Top Navigation
- Fixed position, z-index 40
- Height: 64px
- Background: White with shadow
- Contains: Logo, broker indicator, user menu

### Sidebar Navigation
- Width: 256px on desktop, hidden on mobile
- Background: White
- Active item: Indigo 50 background, Indigo 600 text
- Hover: Gray 50 background

### Navigation Items
| View | Icon | Label |
|------|------|-------|
| Dashboard | `fa-chart-pie` | Dashboard |
| Baskets | `fa-boxes` | My Baskets |
| Investments | `fa-wallet` | Investments |
| Holdings | `fa-hand-holding-usd` | Holdings |
| Explore | `fa-compass` | Explore |
| SIP | `fa-calendar-check` | SIP |
| Alerts | `fa-bell` | Alerts |
| Orders | `fa-receipt` | Orders |

## Page Layouts

### Landing Page
- Hero section with gradient background (#667eea to #764ba2)
- Feature cards in 3-column grid
- How it works: 3-step process
- Template preview section
- Login/Signup modals

### Dashboard
- Summary cards (4-column grid)
- My Baskets list (left half)
- Active Investments list (right half)

### Basket Creation
- 3-column header (name/search, weighting, investment)
- Stock list with weight adjustment
- Action buttons at bottom

### Investment Detail
- Summary metrics at top
- Stock holdings table
- P&L breakdown

## Interaction Patterns

### Loading States
- Skeleton loaders for cards
- Spinner with pulse animation
- Disabled buttons during submission

### Notifications
- Toast notifications (top-right)
- Auto-dismiss after 3 seconds
- Color-coded by type (success, error, warning, info)

### Empty States
- Centered layout
- Large muted icon
- Descriptive text
- Call-to-action button

### Form Validation
- Inline error messages below inputs
- Red border on invalid fields
- Submit button disabled until valid

## Responsive Design

### Desktop (1024px+)
- Full sidebar visible
- Multi-column layouts
- Large cards with detailed info

### Tablet (768px - 1023px)
- Collapsible sidebar
- 2-column grids
- Condensed navigation

### Mobile (< 768px)
- Hidden sidebar (hamburger menu)
- Single-column layout
- Bottom navigation bar
- Full-width cards

## Animation Guidelines

### Transitions
```css
transition: all 0.2s ease;
```

### Card Hover
```css
transform: translateY(-4px);
box-shadow: 0 12px 24px rgba(0,0,0,0.15);
```

### Loading Spinner
```css
animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
```

## Accessibility

### Contrast Ratios
- Normal text: minimum 4.5:1
- Large text: minimum 3:1
- Interactive elements: minimum 3:1

### Focus States
- Visible focus ring on all interactive elements
- Skip to main content link
- Keyboard navigable

### Screen Readers
- Proper heading hierarchy
- ARIA labels on icons
- Alt text on images
