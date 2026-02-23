import Image from 'next/image'
import { getImageUrl } from '@/lib/api'
import type { Photo } from '@/types'

interface Props {
  photo: Photo
  onDelete?: (id: number) => void
}

export default function PhotoCard({ photo, onDelete }: Props) {
  return (
    <div className="relative group rounded-lg overflow-hidden bg-gray-800">
      <Image
        src={getImageUrl(photo.file_key)}
        alt={photo.description ?? ''}
        width={400}
        height={300}
        className="w-full h-48 object-cover"
        unoptimized
      />
      {photo.description && (
        <p className="text-xs text-gray-400 p-2 truncate">{photo.description}</p>
      )}
      {onDelete && (
        <button
          onClick={() => onDelete(photo.id)}
          className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          삭제
        </button>
      )}
    </div>
  )
}
