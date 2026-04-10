// Resend API를 통한 이메일 전송 유틸리티
// wrangler secret put RESEND_API_KEY  /  wrangler secret put RESEND_FROM_EMAIL 으로 설정

export async function sendWelcomeEmail(opts: {
  apiKey: string
  from: string
  to: string
  nickname: string
  siteUrl?: string
}): Promise<void> {
  const { apiKey, from, to, nickname, siteUrl = 'https://nania-ssimdang.pages.dev' } = opts

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #1a1208; color: #f0dca0; border-radius: 12px;">
      <h1 style="color: #d4a017; font-size: 22px; margin-bottom: 8px;">나니아 성심당 가입 완료</h1>
      <p style="color: #b8956a; font-size: 14px; margin-bottom: 24px;">아이온2 레기온 나니아 성심당 홈페이지</p>
      <hr style="border: none; border-top: 1px solid rgba(212,160,23,0.3); margin-bottom: 24px;" />
      <p style="margin-bottom: 8px;">안녕하세요, <strong style="color: #f5c842;">${nickname}</strong> 님!</p>
      <p style="margin-bottom: 24px; line-height: 1.7; color: #c8b48a;">
        나니아 성심당 레기온 홈페이지에 등록되셨습니다.<br />
        아래 링크에서 Google 계정으로 로그인하시면 공지사항·이벤트·사진첩에 댓글을 달 수 있습니다.
      </p>
      <a href="${siteUrl}/login"
         style="display: inline-block; padding: 12px 28px; background: #d4a017; color: #1a1208;
                text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px;">
        로그인하러 가기
      </a>
      <p style="margin-top: 32px; font-size: 12px; color: #7a5a20;">
        이 메일은 나니아 성심당 관리자에 의해 자동 발송된 안내 메일입니다.
      </p>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: '[나니아 성심당] 회원 가입이 완료되었습니다',
      html,
    }),
  })
}
