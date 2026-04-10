'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { eventApi, getImageUrl } from '@/lib/api'
import { getStoredToken } from '@/lib/firebase'
import AdminHeader from '@/components/AdminHeader'
import RichTextEditor, { migrateContent } from '@/components/RichTextEditor'
import type { Event, EventPhoto } from '@/types'

interface FormState {
  title: string
  content: string
}

const EMPTY_FORM: FormState = { title: '', content: '' }

interface PendingPhoto {
  file: File
  previewUrl: string
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  color: 'var(--text-main)',
  border: '1px solid var(--border-gold)',
  borderRadius: '6px',
  padding: '8px 14px',
  fontSize: '14px',
  width: '100%',
  fontFamily: 'inherit',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--gold-mid)',
  color: 'var(--bg-base)',
  fontWeight: '700',
  padding: '8px 24px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'inherit',
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'none',
  color: 'var(--text-muted)',
  border: 'none',
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: '14px',
  fontFamily: 'inherit',
}

// 이미지를 WebP로 변환
function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas context 없음'))
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (blob) resolve(blob)
          else reject(new Error('WebP 변환 실패'))
        },
        'image/webp',
        0.85
      )
    }
    img.onerror = reject
    img.src = url
  })
}

// 이벤트별 사진 관리 패널 (기존 이벤트용)
function PhotoPanel({
  event,
  onPhotosChange,
}: {
  event: Event & { photos?: EventPhoto[] }
  onPhotosChange: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<EventPhoto[]>(event.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [photoMsg, setPhotoMsg] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function loadPhotos() {
    const detail = await eventApi.getOne(event.id)
    setPhotos(detail.photos)
  }

  // 패널 열릴 때 최신 사진 목록 로드
  useEffect(() => {
    loadPhotos()
  }, [event.id])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setPhotoMsg('파일을 선택해주세요.'); return }
    setUploading(true)
    setPhotoMsg(null)
    try {
      const webpBlob = await convertToWebP(file)
      const formData = new FormData()
      formData.append('file', webpBlob, 'photo.webp')
      const res = await eventApi.uploadPhoto(event.id, formData)
      if (res.ok) {
        setPhotoMsg('업로드 완료!')
        if (fileRef.current) fileRef.current.value = ''
        setFileName(null)
        await loadPhotos()
        onPhotosChange()
      } else {
        setPhotoMsg('업로드 실패')
      }
    } catch {
      setPhotoMsg('오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  async function handleMovePhoto(photoId: number, direction: 'left' | 'right') {
    if (reordering) return
    const idx = photos.findIndex(p => p.id === photoId)
    if (idx === -1) return
    if (direction === 'left' && idx === 0) return
    if (direction === 'right' && idx === photos.length - 1) return

    const swapIdx = direction === 'left' ? idx - 1 : idx + 1
    const newPhotos = [...photos]
    ;[newPhotos[idx], newPhotos[swapIdx]] = [newPhotos[swapIdx], newPhotos[idx]]

    // 낙관적 업데이트
    setPhotos(newPhotos)
    setReordering(true)
    try {
      await eventApi.reorderPhotos(event.id, newPhotos.map(p => p.id))
      onPhotosChange() // 부모의 thumbnail_key 갱신
    } catch {
      setPhotos(photos) // 실패 시 복원
    } finally {
      setReordering(false)
    }
  }

  async function handleDeletePhoto(photoId: number) {
    if (!confirm('사진을 삭제하시겠습니까?')) return
    await eventApi.deletePhoto(event.id, photoId)
    await loadPhotos()
    onPhotosChange()
  }

  return (
    <div
      className="mt-3 rounded-lg p-4 space-y-3"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dark)' }}
    >
      <p className="text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>
        사진 ({photos.length}장) — 첫 번째 사진이 썸네일로 표시됩니다
      </p>

      {/* 사진 그리드 */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              className="relative rounded overflow-hidden"
              style={{
                aspectRatio: '1',
                border: idx === 0 ? '2px solid var(--gold-mid)' : '1px solid var(--border-dark)',
              }}
            >
              <img
                src={getImageUrl(photo.file_key)}
                alt=""
                className="w-full h-full object-cover"
                style={{ display: 'block' }}
              />
              {idx === 0 && (
                <span
                  style={{
                    position: 'absolute', top: '3px', left: '3px',
                    background: 'var(--gold-mid)', color: 'var(--bg-base)',
                    fontSize: '9px', fontWeight: '700',
                    padding: '1px 5px', borderRadius: '3px',
                  }}
                >
                  썸네일
                </span>
              )}
              <button
                onClick={() => handleDeletePhoto(photo.id)}
                style={{
                  position: 'absolute', top: '3px', right: '3px',
                  background: 'rgba(0,0,0,0.55)', color: '#fff',
                  border: 'none', borderRadius: '3px',
                  fontSize: '11px', cursor: 'pointer',
                  padding: '1px 5px', fontFamily: 'inherit',
                }}
              >
                ✕
              </button>
              {/* 순서 이동 버튼 */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                display: 'flex', justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.45)',
                padding: '1px 3px',
              }}>
                <button
                  type="button"
                  onClick={() => handleMovePhoto(photo.id, 'left')}
                  disabled={idx === 0 || reordering}
                  style={{
                    background: 'none', border: 'none',
                    color: idx === 0 ? 'rgba(255,255,255,0.25)' : '#fff',
                    cursor: idx === 0 ? 'default' : 'pointer',
                    fontSize: '13px', lineHeight: 1,
                    padding: '1px 4px', fontFamily: 'inherit',
                  }}
                >←</button>
                <button
                  type="button"
                  onClick={() => handleMovePhoto(photo.id, 'right')}
                  disabled={idx === photos.length - 1 || reordering}
                  style={{
                    background: 'none', border: 'none',
                    color: idx === photos.length - 1 ? 'rgba(255,255,255,0.25)' : '#fff',
                    cursor: idx === photos.length - 1 ? 'default' : 'pointer',
                    fontSize: '13px', lineHeight: 1,
                    padding: '1px 4px', fontFamily: 'inherit',
                  }}
                >→</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 업로드 폼 */}
      <form onSubmit={handleUpload} className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-gold)',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '13px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
        >
          📁 파일 선택
        </button>
        <span className="text-xs truncate flex-1" style={{ color: fileName ? 'var(--text-main)' : 'var(--text-muted)', minWidth: 0 }}>
          {fileName ?? '선택된 파일 없음'}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          required
          style={{ display: 'none' }}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <button
          type="submit"
          disabled={uploading}
          style={{ ...primaryBtnStyle, padding: '6px 16px', fontSize: '13px', opacity: uploading ? 0.5 : 1 }}
        >
          {uploading ? '업로드 중...' : '사진 추가'}
        </button>
      </form>
      {photoMsg && <p className="text-xs" style={{ color: 'var(--gold-mid)' }}>{photoMsg}</p>}
    </div>
  )
}

export default function AdminEventPage() {
  const router = useRouter()
  const [events, setEvents] = useState<(Event & { photos?: EventPhoto[] })[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  // 작성 폼 전용: 사진 미리선택 목록
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const addPhotoRef = useRef<HTMLInputElement>(null)

  // 음악 관련 상태
  const musicRef = useRef<HTMLInputElement>(null)
  const [pendingMusicFile, setPendingMusicFile] = useState<File | null>(null)
  const [deleteMusicOnSave, setDeleteMusicOnSave] = useState(false)

  // 현재 수정 중인 이벤트의 music_key
  const editingEvent = editId !== null ? events.find(e => e.id === editId) : null
  const hasExistingMusic = !!editingEvent?.music_key && !deleteMusicOnSave

  useEffect(() => {
    if (!getStoredToken()) {
      router.push('/admin/login')
      return
    }
    loadEvents()
  }, [])

  // pendingPhotos 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
    }
  }, [pendingPhotos])

  async function loadEvents() {
    setLoading(true)
    try {
      setEvents(await eventApi.getAll())
    } finally {
      setLoading(false)
    }
  }

  function handleAddPendingPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const newPhotos: PendingPhoto[] = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setPendingPhotos(prev => [...prev, ...newPhotos])
    // input 초기화 (같은 파일 재선택 가능하도록)
    if (addPhotoRef.current) addPhotoRef.current.value = ''
  }

  function handleRemovePendingPhoto(idx: number) {
    setPendingPhotos(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  function clearPendingPhotos() {
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
    setPendingPhotos([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      if (editId !== null) {
        await eventApi.update(editId, form)

        // 음악 처리: 삭제 → 업로드 순
        if (deleteMusicOnSave) await eventApi.deleteMusic(editId)
        if (pendingMusicFile) {
          const fd = new FormData()
          fd.append('file', pendingMusicFile, pendingMusicFile.name)
          await eventApi.uploadMusic(editId, fd)
        }

        setMessage('이벤트가 수정되었습니다.')
        setExpandedId(editId)
        setPendingMusicFile(null)
        setDeleteMusicOnSave(false)
        setForm(EMPTY_FORM)
        setEditId(null)
        await loadEvents()
      } else {
        // 1) 이벤트 생성
        const res = await eventApi.create(form)
        if (!res.ok) throw new Error('이벤트 생성 실패')
        const data = await res.json() as { id: number }
        const newId = data.id

        // 2) 음악 업로드 (선택된 경우)
        if (pendingMusicFile) {
          const fd = new FormData()
          fd.append('file', pendingMusicFile, pendingMusicFile.name)
          await eventApi.uploadMusic(newId, fd)
        }

        // 3) 선택된 사진 순서대로 업로드
        if (pendingPhotos.length > 0) {
          for (let i = 0; i < pendingPhotos.length; i++) {
            setUploadProgress(`사진 업로드 중... (${i + 1}/${pendingPhotos.length})`)
            const webpBlob = await convertToWebP(pendingPhotos[i].file)
            const formData = new FormData()
            formData.append('file', webpBlob, 'photo.webp')
            await eventApi.uploadPhoto(newId, formData)
          }
          setUploadProgress(null)
        }

        clearPendingPhotos()
        setPendingMusicFile(null)
        setDeleteMusicOnSave(false)
        setForm(EMPTY_FORM)
        setEditId(null)
        await loadEvents()
        setExpandedId(newId)
        setMessage('이벤트가 작성되었습니다.')
      }
    } catch {
      setMessage('오류가 발생했습니다.')
      setUploadProgress(null)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(event: Event) {
    setEditId(event.id)
    setForm({ title: event.title, content: migrateContent(event.content) })
    clearPendingPhotos()
    setPendingMusicFile(null)
    setDeleteMusicOnSave(false)
    setExpandedId(event.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditId(null)
    setForm(EMPTY_FORM)
    clearPendingPhotos()
    setPendingMusicFile(null)
    setDeleteMusicOnSave(false)
  }

  async function handleToggleStatus(id: number) {
    if (togglingId !== null) return  // 이미 토글 중이면 무시

    setTogglingId(id)

    // 페이드 아웃 완료 시점(175ms)에서 로컬 상태를 낙관적으로 반전
    const flipTimer = window.setTimeout(() => {
      setEvents(prev =>
        prev.map(e =>
          e.id === id
            ? { ...e, status: e.status === 'active' ? 'ended' : 'active' }
            : e
        )
      )
    }, 175)

    // 애니메이션 종료 후 togglingId 해제
    const clearTimer = window.setTimeout(() => {
      setTogglingId(null)
    }, 380)

    try {
      await eventApi.toggleStatus(id)
      // 서버 상태 조용히 동기화 (로딩 표시 없음)
      const fresh = await eventApi.getAll()
      setEvents(fresh)
    } catch {
      // 오류 시 타이머 취소 후 서버 상태로 복원
      window.clearTimeout(flipTimer)
      window.clearTimeout(clearTimer)
      setTogglingId(null)
      const fresh = await eventApi.getAll()
      setEvents(fresh)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이벤트와 모든 사진을 삭제하시겠습니까?')) return

    // 낙관적으로 즉시 목록에서 제거
    const deletedIndex = events.findIndex(e => e.id === id)
    const deletedEvent = events[deletedIndex]
    setEvents(prev => prev.filter(e => e.id !== id))
    if (expandedId === id) setExpandedId(null)
    setMessage(null)

    try {
      const res = await eventApi.delete(id)
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        // 실패 시 원위치로 복원
        setEvents(prev => {
          const next = [...prev]
          next.splice(deletedIndex, 0, deletedEvent)
          return next
        })
        setMessage(`삭제 실패 (${res.status}): ${err.error ?? '알 수 없는 오류'}`)
      }
    } catch {
      // 네트워크 오류 시 원위치로 복원
      setEvents(prev => {
        const next = [...prev]
        next.splice(deletedIndex, 0, deletedEvent)
        return next
      })
      setMessage('삭제 중 네트워크 오류가 발생했습니다.')
    }
  }

  return (
    <>
    <style>{`
      @keyframes badge-fade {
        0%   { opacity: 1;   transform: scale(1); }
        35%  { opacity: 0;   transform: scale(0.9); }
        65%  { opacity: 0;   transform: scale(0.9); }
        100% { opacity: 1;   transform: scale(1); }
      }
    `}</style>
    <div className="space-y-8 max-w-2xl mx-auto">
      <AdminHeader title="이벤트 관리" />

      {/* 작성/수정 폼 */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
          {editId !== null ? '이벤트 수정' : '이벤트 작성'}
        </h2>

        <input
          type="text"
          placeholder="제목"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          style={inputStyle}
        />

        <RichTextEditor
          value={form.content}
          onChange={(html) => setForm({ ...form, content: html })}
          placeholder="이벤트 내용을 입력하세요"
          minRows={6}
        />

        {/* 음악 첨부 */}
        <div className="space-y-2 rounded-lg p-4"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dark)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>
            🎵 음악 첨부 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(선택 · MP3, OGG 등)</span>
          </p>

          {/* 기존 음악 표시 (수정 모드) */}
          {hasExistingMusic && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--gold-mid)' }}>♪ 현재 음악 첨부됨</span>
              <button
                type="button"
                onClick={() => { setDeleteMusicOnSave(true); setPendingMusicFile(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#e05050', fontFamily: 'inherit', padding: '0 4px' }}
              >
                삭제
              </button>
            </div>
          )}

          {/* 선택된 새 파일 표시 */}
          {pendingMusicFile ? (
            <div className="flex items-center gap-2">
              <span className="text-xs truncate" style={{ color: 'var(--text-main)' }}>
                ♪ {pendingMusicFile.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPendingMusicFile(null)
                  if (musicRef.current) musicRef.current.value = ''
                  if (editingEvent?.music_key) setDeleteMusicOnSave(false)
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'inherit', padding: '0 4px', flexShrink: 0 }}
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => musicRef.current?.click()}
              style={{
                background: 'var(--bg-card)', color: 'var(--text-main)',
                border: '1px solid var(--border-gold)', borderRadius: '6px',
                padding: '5px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
            >
              {hasExistingMusic ? '♪ 음악 교체' : '♪ 음악 선택'}
            </button>
          )}

          <input
            ref={musicRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              setPendingMusicFile(file)
              // 기존 음악이 있으면 교체이므로 삭제 플래그 설정
              if (editingEvent?.music_key) setDeleteMusicOnSave(true)
            }}
          />
        </div>

        {/* 사진 추가 — 작성 모드에서만 표시 */}
        {editId === null && (
          <div
            className="space-y-3 rounded-lg p-4"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dark)' }}
          >
            <p className="text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>
              사진 ({pendingPhotos.length}장 선택됨) — 첫 번째 사진이 썸네일로 표시됩니다
            </p>

            {/* 미리보기 그리드 */}
            {pendingPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {pendingPhotos.map((p, idx) => (
                  <div
                    key={idx}
                    className="relative rounded overflow-hidden"
                    style={{
                      aspectRatio: '1',
                      border: idx === 0 ? '2px solid var(--gold-mid)' : '1px solid var(--border-dark)',
                    }}
                  >
                    <img
                      src={p.previewUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ display: 'block' }}
                    />
                    {idx === 0 && (
                      <span
                        style={{
                          position: 'absolute', top: '3px', left: '3px',
                          background: 'var(--gold-mid)', color: 'var(--bg-base)',
                          fontSize: '9px', fontWeight: '700',
                          padding: '1px 5px', borderRadius: '3px',
                        }}
                      >
                        썸네일
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemovePendingPhoto(idx)}
                      style={{
                        position: 'absolute', top: '3px', right: '3px',
                        background: 'rgba(0,0,0,0.55)', color: '#fff',
                        border: 'none', borderRadius: '3px',
                        fontSize: '11px', cursor: 'pointer',
                        padding: '1px 5px', fontFamily: 'inherit',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 파일 선택 버튼 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => addPhotoRef.current?.click()}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-gold)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
              >
                📁 사진 선택
              </button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                여러 장 동시 선택 가능 · 선택 후 미리보기 확인
              </span>
              <input
                ref={addPhotoRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleAddPendingPhoto}
              />
            </div>
          </div>
        )}

        {/* 버튼 영역 */}
        <div className="flex gap-3 items-center">
          <button
            type="submit"
            disabled={saving}
            style={{ ...primaryBtnStyle, opacity: saving ? 0.5 : 1 }}
          >
            {uploadProgress ?? (saving ? '저장 중...' : editId !== null ? '수정 완료' : '작성')}
          </button>
          {editId !== null && (
            <button type="button" onClick={handleCancelEdit} style={ghostBtnStyle}>
              취소
            </button>
          )}
        </div>
        {message && <p className="text-sm" style={{ color: message.startsWith('삭제 실패') || message.startsWith('삭제 중') ? '#ef4444' : 'var(--gold-mid)' }}>{message}</p>}
      </form>

      {/* 이벤트 목록 */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : events.length === 0 ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>등록된 이벤트가 없습니다.</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg px-4 py-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}
            >
              {/* 이벤트 행 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                    style={{
                      background: event.status === 'active' ? 'var(--gold-mid)' : 'var(--border-dark)',
                      color: event.status === 'active' ? 'var(--bg-base)' : 'var(--text-muted)',
                      display: 'inline-block',
                      minWidth: '3.2rem',
                      textAlign: 'center',
                      transformOrigin: 'center',
                      ...(togglingId === event.id
                        ? { animation: 'badge-fade 380ms ease-in-out' }
                        : {}),
                    }}
                  >
                    {event.status === 'active' ? '진행중' : '종료'}
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-main)' }}>
                    {event.thumbnail_key && (
                      <img src="/images/came.svg" alt="" style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                    )}
                    <span className="truncate text-sm">{event.title}</span>
                  </span>
                </div>
                <div className="flex gap-1 ml-4 shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => handleToggleStatus(event.id)}
                    disabled={togglingId !== null}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-gold)',
                      cursor: togglingId !== null ? 'default' : 'pointer',
                      color: 'var(--text-sub)',
                      fontFamily: 'inherit',
                      opacity: togglingId === event.id ? 0.4 : 1,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={e => { if (togglingId === null) e.currentTarget.style.borderColor = 'var(--gold-mid)' }}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
                  >
                    {event.status === 'active' ? '종료로 변경' : '진행중으로 변경'}
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                    className="text-xs"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-sub)', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-sub)')}
                  >
                    사진 관리 {expandedId === event.id ? '▲' : '▼'}
                  </button>
                  <button
                    onClick={() => handleEdit(event)}
                    className="text-xs"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-sub)', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-sub)')}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="text-xs"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    삭제
                  </button>
                </div>
              </div>

              {/* 사진 관리 패널 (토글) */}
              {expandedId === event.id && (
                <PhotoPanel event={event} onPhotosChange={loadEvents} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
    </>
  )
}
