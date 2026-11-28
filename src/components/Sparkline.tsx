/** 작은 추이 그래프 (점수 0~100) */
export function Sparkline({ values, width = 64, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const pad = 2
  const step = (width - pad * 2) / (values.length - 1)
  const y = (v: number) => pad + (1 - v / 100) * (height - pad * 2)
  const points = values.map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const rising = values[values.length - 1] >= values[0]
  return (
    <svg className={`sparkline ${rising ? 'up' : 'down'}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <title>{`점수 추이: ${values.join(' → ')}`}</title>
      <polyline points={points} fill="none" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
