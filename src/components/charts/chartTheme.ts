export const CHART_COLORS = [
  '#800020',
  '#D4A017',
  '#2E7D6B',
  '#3B6FB6',
  '#8A8D93',
]

export const AXIS_TEXT = '#8A8D93'
export const GRID_LINE = 'rgba(128,128,128,0.2)'

export const TOOLTIP_STYLE = {
  background: 'rgba(20,20,24,0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: '#fff',
  fontSize: 12,
}

export interface SeriesDef {
  key: string
  label: string
  color?: string
}

export function seriesColor(s: SeriesDef, index: number): string {
  return s.color || CHART_COLORS[index % CHART_COLORS.length]
}
