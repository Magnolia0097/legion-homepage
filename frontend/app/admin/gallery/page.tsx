'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { galleryApi } from '@/lib/api'
import { getStoredToken, getAdminRole, getAdminNickname } from '@/lib/firebase'
import AdminHeader from '@/components/AdminHeader'
import PhotoCard from '@/components/PhotoCard'
import type { GalleryMonth, Photo } from '@/types'

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-main)',
  border: '1px solid var(--border-gold)',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '14px',
  width: '100%',
  fontFamily: 'inherit',
  outline: 'none',
}

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return year + '년 ' + parseInt(month) + '월'
}

// ── 슈퍼 관리자 전용 업로드 폼 ──────────────────────────────────────
function SuperAdminUploadForm({
  onSuccess,
}: {
  onSuccess: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const musicRef = useRef<HTMLInputElement>(null)
  const [isFeatured, setIsFeatured] = useState(false)
  const [takenDate, setTakenDate] = useState('')
  const [uploader, setUploader] = useState('')

  // 관리자 닉네임 자동 주입
  useEffect(() => {
    const nick = getAdminNickname()
    if (nick) setUploader(nick)
  }, [])
  const [heroTitle, setHeroTitle] = useState('')
  const [heroDesc, setHeroDesc] = useState('')
  const [description, setDescription] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [musicFileName, setMusicFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [monthInfo, setMonthInfo] = useState<{ count: number; limit: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [musicDragOver, setMusicDragOver] = useState(false)

  useEffect(() => {
    if (!takenDate) { setMonthInfo(null); return }
    const ym = takenDate.slice(0, 7)
    galleryApi.getMonthCount(ym).then(setMonthInfo).catch(() => setMonthInfo(null))
  }, [takenDate])

  function handleFileSelect(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => setFilePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      if (fileRef.current) {
        const dt = new DataTransfer(); dt.items.add(file)
        fileRef.current.files = dt.files
      }
      handleFileSelect(file)
    }
  }

  function handleMusicDrop(e: React.DragEvent) {
    e.preventDefault(); setMusicDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('audio/')) {
      if (musicRef.current) {
        const dt = new DataTransfer(); dt.items.add(file)
        musicRef.current.files = dt.files
      }
      setMusicFileName(file.name)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file || !takenDate) { setMessage({ text: '사진과 날짜를 입력해주세요.', isError: true }); return }
    setUploading(true); setMessage(null)
    try {
      const webpBlob = await convertToWebP(file)
      const formData = new FormData()
      formData.append('file', webpBlob, 'photo.webp')
      formData.append('taken_date', takenDate + '-01')
      formData.append('description', description)
      formData.append('uploader', uploader || '관리자')
      if (isFeatured) {
        formData.append('is_featured', '1')
        if (heroTitle.trim()) formData.append('hero_title', heroTitle.trim())
        if (heroDesc.trim()) formData.append('hero_desc', heroDesc.trim())
        const musicFile = musicRef.current?.files?.[0]
        if (musicFile) formData.append('music', musicFile)
      }
      const res = await galleryApi.upload(formData)
      if (res.ok) {
        const data = await res.json() as { count: number; limit: number }
        const featuredMsg = isFeatured ? ' — ✦ 이달의 모델로 지정됨' : ''
        setMessage({ text: '업로드 완료! (' + data.count + '/' + data.limit + '장)' + featuredMsg, isError: false })
        setMonthInfo({ count: data.count, limit: data.limit })
        setDescription(''); setHeroTitle(''); setHeroDesc('')
        setIsFeatured(false); setFileName(null); setFilePreview(null); setMusicFileName(null)
        if (fileRef.current) fileRef.current.value = ''
        if (musicRef.current) musicRef.current.value = ''
        onSuccess()
      } else {
        const errData = await res.json() as { error?: string }
        setMessage({ text: errData.error ?? '업로드 실패', isError: true })
      }
    } catch { setMessage({ text: '오류가 발생했습니다.', isError: true }) }
    finally { setUploading(false) }
  }

  return (
    <form onSubmit={handleUpload}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)', borderRadius: '16px', overflow: 'hidden' }}>

        {/* 상단: 이달의 모델 토글 */}
        <div style={{
          padding: '18px 24px',
          background: isFeatured ? 'rgba(212,160,23,0.1)' : 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid ' + (isFeatured ? 'rgba(212,160,23,0.25)' : 'var(--border-dark)'),
          transition: 'background 0.2s',
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setIsFeatured(v => !v)}
          >
            {/* 토글 스위치 */}
            <div style={{ position: 'relative', width: '48px', height: '26px', flexShrink: 0 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '13px',
                background: isFeatured ? 'var(--gold-mid)' : 'rgba(128,128,128,0.3)',
                transition: '0.22s',
              }}>
                <div style={{
                  position: 'absolute', top: '4px',
                  left: isFeatured ? '26px' : '4px',
                  width: '18px', height: '18px',
                  background: '#fff', borderRadius: '50%', transition: '0.22s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '0.04em' }}>✦ 이달의 모델로 지정</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>켜면 홈 화면 히어로 이미지가 이 사진으로 자동 교체됩니다</div>
            </div>
            {isFeatured && (
              <span style={{
                marginLeft: 'auto', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                color: '#4ade80', background: 'rgba(74,222,128,0.12)',
                border: '1px solid rgba(74,222,128,0.3)',
                padding: '3px 10px', borderRadius: '100px',
              }}>
                ● 홈 자동 업데이트 활성화됨
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* 기본 정보 */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-mid)', letterSpacing: '0.14em', marginBottom: '10px' }}>기본 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>촬영 날짜</label>
                <input
                  type="month" value={takenDate}
                  onChange={e => setTakenDate(e.target.value)}
                  required style={inputStyle}
                />
                {monthInfo && (
                  <p style={{ fontSize: '11px', marginTop: '4px', color: monthInfo.count >= monthInfo.limit ? '#ef4444' : 'var(--text-muted)' }}>
                    {formatYearMonth(takenDate)}: {monthInfo.count}/{monthInfo.limit}장
                    {monthInfo.count >= monthInfo.limit && ' (한도 초과)'}
                  </p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>업로더</label>
                <input
                  type="text" value={uploader} placeholder="예: Chan"
                  onChange={e => setUploader(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginTop: '10px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>사진 설명 (선택)</label>
              <input
                type="text" value={description} placeholder="간단한 설명..."
                onChange={e => setDescription(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* 대표 사진 드래그 앤 드롭 */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-mid)', letterSpacing: '0.14em', marginBottom: '10px' }}>대표 사진</div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: '2px dashed ' + (dragOver ? 'var(--gold-mid)' : fileName ? 'rgba(212,160,23,0.6)' : 'var(--border-gold)'),
                borderRadius: '12px',
                padding: filePreview ? '0' : '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.18s',
                overflow: 'hidden',
                background: dragOver ? 'rgba(212,160,23,0.06)' : 'transparent',
                minHeight: filePreview ? '0' : '140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {filePreview ? (
                <div style={{ position: 'relative', width: '100%' }}>
                  <img src={filePreview} alt="preview" style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', display: 'block' }} />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: '0.18s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                  >
                    <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>클릭하여 변경</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '10px', opacity: 0.35 }}>📷</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '4px' }}>사진을 드래그하거나 클릭하여 업로드</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>WebP, JPG, PNG · 최대 10MB</div>
                </div>
              )}
            </div>
            <input
              ref={fileRef} type="file" accept="image/*" required
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(f)
              }}
            />
          </div>

          {/* 테마곡 (이달의 모델일 때만) */}
          {isFeatured && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-mid)', letterSpacing: '0.14em', marginBottom: '6px' }}>🎵 테마곡 <span style={{ fontWeight: 400, color: 'var(--text-muted)', letterSpacing: 0 }}>(이달의 모델 한정)</span></div>
              <div
                onClick={() => musicRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setMusicDragOver(true) }}
                onDragLeave={() => setMusicDragOver(false)}
                onDrop={handleMusicDrop}
                style={{
                  border: '2px dashed ' + (musicDragOver ? 'var(--gold-mid)' : musicFileName ? 'rgba(212,160,23,0.6)' : 'var(--border-gold)'),
                  borderRadius: '12px',
                  padding: '28px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                  background: musicDragOver ? 'rgba(212,160,23,0.05)' : 'transparent',
                }}
              >
                {musicFileName ? (
                  <div>
                    <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>🎵</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: 600 }}>{musicFileName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>클릭하여 변경</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '1.8rem', marginBottom: '8px', opacity: 0.3 }}>🎵</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '4px' }}>테마곡을 업로드하세요</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MP3, WAV, OGG · 최대 20MB · 없으면 기본 테마곡 사용</div>
                  </div>
                )}
              </div>
              <input ref={musicRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => setMusicFileName(e.target.files?.[0]?.name ?? null)} />
              <p style={{ fontSize: '11px', color: 'rgba(212,160,23,0.7)', marginTop: '6px' }}>
                💡 이 모델의 갤러리 페이지가 홈 화면에서 이 곡이 재생됩니다.
              </p>
            </div>
          )}

          {/* 홈 화면 텍스트 (이달의 모델일 때만) */}
          {isFeatured && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-mid)', letterSpacing: '0.14em', marginBottom: '10px' }}>홈 화면 표시 텍스트</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>제목</label>
                  <input
                    type="text" value={heroTitle}
                    onChange={e => setHeroTitle(e.target.value)}
                    placeholder="예: 벚날의 두 소녀, 레기온이 꼽히다"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>부제</label>
                  <input
                    type="text" value={heroDesc}
                    onChange={e => setHeroDesc(e.target.value)}
                    placeholder="예: 봄바람이 부는 4월, 레기온이 선정한 모델을 만나보세요."
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 업로드 버튼 */}
          <button
            type="submit"
            disabled={uploading}
            style={{
              width: '100%',
              padding: '14px',
              background: uploading ? 'rgba(212,160,23,0.4)' : 'var(--gold-mid)',
              color: 'var(--bg-base)',
              fontWeight: 800,
              fontSize: '15px',
              border: 'none',
              borderRadius: '10px',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.08em',
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => { if (!uploading) (e.currentTarget.style.background = '#c8901a') }}
            onMouseLeave={e => { if (!uploading) (e.currentTarget.style.background = 'var(--gold-mid)') }}
          >
            {uploading ? '업로드 중...' : isFeatured ? '업로드 → 홈 자동 반영' : '업로드'}
          </button>

          {message && (
            <p style={{ fontSize: '13px', textAlign: 'center', color: message.isError ? '#ef4444' : '#4ade80', fontWeight: 600 }}>
              {message.text}
            </p>
          )}

          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
            * 이미지는 자동으로 WebP 형식으로 변환됩니다.
          </p>
        </div>
      </div>
    </form>
  )
}

// ── 일반 관리자 업로드 폼 ──────────────────────────────────────────
function BasicUploadForm({ onSuccess }: { onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [takenDate, setTakenDate] = useState('')
  const [description, setDescription] = useState('')
  const [uploaderNick, setUploaderNick] = useState('관리자')

  useEffect(() => {
    const nick = getAdminNickname()
    if (nick) setUploaderNick(nick)
  }, [])
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [monthInfo, setMonthInfo] = useState<{ count: number; limit: number } | null>(null)

  useEffect(() => {
    if (!takenDate) { setMonthInfo(null); return }
    const ym = takenDate.slice(0, 7)
    galleryApi.getMonthCount(ym).then(setMonthInfo).catch(() => setMonthInfo(null))
  }, [takenDate])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file || !takenDate) { setMessage({ text: '사진과 날짜를 입력해주세요.', isError: true }); return }
    setUploading(true); setMessage(null)
    try {
      const webpBlob = await convertToWebP(file)
      const formData = new FormData()
      formData.append('file', webpBlob, 'photo.webp')
      formData.append('taken_date', takenDate + '-01')
      formData.append('description', description)
      formData.append('uploader', uploaderNick)
      const res = await galleryApi.upload(formData)
      if (res.ok) {
        const data = await res.json() as { count: number; limit: number }
        setMessage({ text: '업로드 완료! (' + data.count + '/' + data.limit + '장)', isError: false })
        setMonthInfo({ count: data.count, limit: data.limit })
        setDescription(''); setFileName(null)
        if (fileRef.current) fileRef.current.value = ''
        onSuccess()
      } else {
        const errData = await res.json() as { error?: string }
        setMessage({ text: errData.error ?? '업로드 실패', isError: true })
      }
    } catch { setMessage({ text: '오류가 발생했습니다.', isError: true }) }
    finally { setUploading(false) }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-4 rounded-lg p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>사진 업로드</h2>
      <div className="space-y-1">
        <input type="month" value={takenDate} onChange={e => setTakenDate(e.target.value)} required style={{ ...inputStyle, borderRadius: '6px', padding: '8px 14px' }} />
        {monthInfo && (
          <p className="text-xs" style={{ color: monthInfo.count >= monthInfo.limit ? '#ef4444' : 'var(--text-muted)' }}>
            {formatYearMonth(takenDate)} 업로드 현황: {monthInfo.count}/{monthInfo.limit}장
            {monthInfo.count >= monthInfo.limit && ' — 이번 달 한도에 도달했습니다'}
          </p>
        )}
      </div>
      <input type="text" placeholder="사진 설명 (선택)" value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, borderRadius: '6px', padding: '8px 14px' }} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()}
          style={{ background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-gold)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          📁 사진 선택
        </button>
        <span className="text-sm truncate" style={{ color: fileName ? 'var(--text-main)' : 'var(--text-muted)' }}>
          {fileName ?? '선택된 사진 없음'}
        </span>
        <input ref={fileRef} type="file" accept="image/*" required style={{ display: 'none' }} onChange={e => setFileName(e.target.files?.[0]?.name ?? null)} />
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>* 이미지는 자동으로 WebP 형식으로 변환됩니다.</p>
      <button type="submit" disabled={uploading}
        style={{ background: 'var(--gold-mid)', color: 'var(--bg-base)', fontWeight: 700, padding: '8px 24px', borderRadius: '6px', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '14px', fontFamily: 'inherit', opacity: uploading ? 0.5 : 1 }}>
        {uploading ? '업로드 중...' : '업로드'}
      </button>
      {message && <p className="text-sm" style={{ color: message.isError ? '#ef4444' : 'var(--gold-mid)' }}>{message.text}</p>}
    </form>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function AdminGalleryPage() {
  const router = useRouter()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [months, setMonths] = useState<GalleryMonth[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])

  useEffect(() => {
    if (!getStoredToken()) { router.push('/admin/login'); return }
    setIsSuperAdmin(getAdminRole() === 'super')
    loadMonths()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMonths() {
    const data = await galleryApi.getMonths()
    setMonths(data)
  }

  async function loadPhotos(month: string) {
    setSelectedMonth(month)
    const data = await galleryApi.getByMonth(month)
    setPhotos(data)
  }

  async function handleDelete(id: number) {
    if (!confirm('사진을 삭제하시겠습니까?')) return
    await galleryApi.delete(id)
    if (selectedMonth) await loadPhotos(selectedMonth)
    await loadMonths()
  }

  async function handleUploadSuccess() {
    await loadMonths()
    if (selectedMonth) await loadPhotos(selectedMonth)
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <AdminHeader title="사진 관리" />

      {isSuperAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <a href="/gallery/models"
            style={{ fontSize: '13px', color: 'var(--gold-mid)', textDecoration: 'none', border: '1px solid var(--border-gold)', borderRadius: '6px', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
          >
            ✦ 이달의 모델 아카이브 →
          </a>
        </div>
      )}

      {/* 업로드 폼: 슈퍼 관리자는 새 UI, 일반 관리자는 기존 UI */}
      {isSuperAdmin
        ? <SuperAdminUploadForm onSuccess={handleUploadSuccess} />
        : <BasicUploadForm onSuccess={handleUploadSuccess} />
      }

      {/* 월별 사진 보기 */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>월별 사진 보기</h2>
        {months.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>등록된 사진이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {months.map(({ year_month, count }) => (
              <button key={year_month} onClick={() => loadPhotos(year_month)}
                className="px-4 py-2 rounded text-sm font-medium transition-colors"
                style={selectedMonth === year_month
                  ? { background: 'var(--gold-mid)', color: 'var(--bg-base)', border: '1px solid var(--gold-mid)', cursor: 'pointer', fontFamily: 'inherit' }
                  : { background: 'var(--bg-card)', color: 'var(--text-sub)', border: '1px solid var(--border-gold)', cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={e => { if (selectedMonth !== year_month) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--gold-mid)' }}
                onMouseLeave={e => { if (selectedMonth !== year_month) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-gold)' }}
              >
                {formatYearMonth(year_month)} ({count}장)
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedMonth && (
        <div className="space-y-4">
          <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>
            {formatYearMonth(selectedMonth)} 사진 ({photos.length}장)
          </h3>
          {photos.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>사진이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {photos.map(photo => (
                <PhotoCard key={photo.id} photo={photo} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas context 없음'))
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url)
        if (blob) resolve(blob); else reject(new Error('WebP 변환 실패'))
      }, 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}
