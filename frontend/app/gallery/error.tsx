'use client'

export default function GalleryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="text-center py-16 space-y-4">
      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
        사진첩을 불러오는 중 오류가 발생했습니다.
      </p>
      <button
        onClick={reset}
        style={{
          background: 'none',
          border: '1px solid var(--border-gold)',
          borderRadius: '6px',
          padding: '6px 18px',
          fontSize: '13px',
          color: 'var(--gold-mid)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        다시 시도
      </button>
    </div>
  )
}
