interface Props {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export default function LegionIcon({ size = 120, className = '', style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* ── 위 구분선 (이중선) ── */}
      <line x1="14" y1="68" x2="186" y2="68" stroke="currentColor" strokeWidth="1.6"/>
      <line x1="14" y1="72" x2="186" y2="72" stroke="currentColor" strokeWidth="1.6"/>

      {/* ── SSD 텍스트 ── */}
      <text
        x="100"
        y="122"
        textAnchor="middle"
        fontSize="46"
        fontWeight="700"
        fontFamily="'Pretendard', 'Noto Sans KR', sans-serif"
        letterSpacing="8"
        dx="4"
        fill="currentColor"
      >성심당</text>

      {/* ── 아래 구분선 (이중선) ── */}
      <line x1="14" y1="142" x2="186" y2="142" stroke="currentColor" strokeWidth="1.6"/>
      <line x1="14" y1="146" x2="186" y2="146" stroke="currentColor" strokeWidth="1.6"/>

      {/* ── AION2 텍스트 ── */}
      <text
        x="100"
        y="170"
        textAnchor="middle"
        fontSize="14"
        fontFamily="'Arial', 'Helvetica', sans-serif"
        letterSpacing="7"
        dx="3.5"
        fill="currentColor"
      >AION2</text>
    </svg>
  )
}
