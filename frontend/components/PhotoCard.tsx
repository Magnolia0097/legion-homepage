import Image from 'next/image'
import { getImageUrl } from '@/lib/api'
import type { Photo } from '@/types'

interface Props {
  photo: Photo
  onDelete?: (id: number) => void
  onClick?: (url: string) => void
}

export default function PhotoCard({ photo, onDelete, onClick }: Props) {
  const url = getImageUrl(photo.file_key)
  return (
    <div
      className="relative group rounded-lg overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-dark)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={() => onClick?.(url)}
    >
      <Image
        src={url}
        alt={photo.description ?? ''}
        width={400}
        height={300}
        className="w-full h-48 object-cover transition-transform duration-200 group-hover:scale-105"
        unoptimized
      />
      {photo.description && (
        <p className="text-xs p-2 truncate" style={{ color: 'var(--text-sub)' }}>
          {photo.description}
        </p>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(photo.id) }}
          className="absolute top-2 right-2 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#c0392b', color: '#fff' }}
        >
          삭제
        </button>
      )}
    </div>
  )
}
