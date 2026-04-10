'use client'

import { useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minRows?: number
}

// **bold** 레거시 포맷 → <strong> 변환 (기존 데이터 마이그레이션)
export function migrateContent(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

// 표시용: **bold** 변환 후 XSS 위험 태그/속성 제거
export function renderHtml(text: string): string {
  const html = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // 브라우저 환경에서만 DOMPurify 실행 (SSR 시에는 그대로 반환)
  if (typeof window === 'undefined') return html
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'u', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li'],
    // style 허용: contenteditable이 생성하는 인라인 스타일(color, font-family 등) 보존
    // DOMPurify가 CSS expression() 등 위험한 스타일은 자동 차단
    ALLOWED_ATTR: ['style'],
  })
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '내용을 입력하세요',
  minRows = 5,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)

  // 외부 value 변경 시 에디터 동기화 (수정 모드 전환, 폼 초기화 등)
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (el.innerHTML !== value) {
      el.innerHTML = value
    }
  }, [value])

  function execCommand(cmd: string) {
    editorRef.current?.focus()
    document.execCommand(cmd, false)
    onChange(editorRef.current?.innerHTML ?? '')
  }

  function handleInput() {
    onChange(editorRef.current?.innerHTML ?? '')
  }

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>'

  return (
    <div
      style={{
        border: '1px solid var(--border-gold)',
        borderRadius: '6px',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        width: '100%',
      }}
    >
      {/* 툴바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-dark)',
          background: 'var(--bg-base)',
        }}
      >
        <button
          type="button"
          onClick={() => execCommand('bold')}
          title="굵게 (Ctrl+B)"
          style={{
            background: 'none',
            border: '1px solid var(--border-gold)',
            borderRadius: '4px',
            padding: '2px 9px',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer',
            color: 'var(--text-main)',
            fontFamily: 'inherit',
            lineHeight: '1.5',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
        >
          B
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '2px' }}>
          텍스트 선택 후 B · Ctrl+B
        </span>
      </div>

      {/* 에디터 영역 */}
      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          style={{
            color: 'var(--text-main)',
            padding: '8px 14px',
            fontSize: '14px',
            fontFamily: 'inherit',
            minHeight: `${minRows * 1.75}em`,
            outline: 'none',
            lineHeight: '1.75',
            wordBreak: 'break-word',
          }}
        />
        {isEmpty && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '14px',
              color: 'var(--text-muted)',
              fontSize: '14px',
              fontFamily: 'inherit',
              pointerEvents: 'none',
              userSelect: 'none',
              lineHeight: '1.75',
            }}
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  )
}
