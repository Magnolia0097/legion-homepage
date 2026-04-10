export default function Footer() {
  return (
    <footer
      className="mt-auto pb-20 md:pb-0"
      style={{
        background: 'var(--bg-header)',
        borderTop: '1px solid var(--gold-dark)',
        color: 'var(--text-muted)',
      }}
    >
      <div className="max-w-4xl mx-auto px-6 py-5 text-center space-y-1">
        <p className="text-sm tracking-wider" style={{ color: 'var(--text-muted)' }}>
          ✦ &nbsp; © 2026 나니아 성심당 · All rights reserved &nbsp; ✦
        </p>
        <p style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: '10px', lineHeight: '1.6' }}>
          본 웹사이트는 아이온2 나니아 서버의 &apos;성심당&apos; 레기온 커뮤니티 공간이며,
          실제 제과업체인 (주)로쏘 성심당과는 어떠한 관련도 없음을 알려드립니다. &nbsp;·&nbsp; 개발자 · magnolia0097@gmail.com
        </p>
      </div>
    </footer>
  )
}
