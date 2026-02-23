'use client'

import { useEffect, useState } from 'react'
import { memberApi } from '@/lib/api'
import type { Member } from '@/types'

const ROLE_ORDER: Record<string, number> = { '단장': 0, '부단장': 1, '단원': 2 }
const ROLE_BADGE: Record<string, string> = {
  단장: 'bg-amber-500 text-black',
  부단장: 'bg-blue-600 text-white',
  단원: 'bg-gray-700 text-gray-200',
}

export default function HomePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    memberApi.getAll()
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const grouped = members.reduce<Record<string, Member[]>>((acc, m) => {
    ;(acc[m.role] ??= []).push(m)
    return acc
  }, {})

  const roles = Object.keys(grouped).sort(
    (a, b) => (ROLE_ORDER[a] ?? 99) - (ROLE_ORDER[b] ?? 99)
  )

  return (
    <div className="space-y-10">
      {/* 레기온 소개 */}
      <section className="text-center py-10 border-b border-gray-800">
        <h1 className="text-4xl font-bold text-amber-400 mb-3">⚔ 우리 레기온</h1>
        <p className="text-gray-400 text-lg">아이온2를 함께하는 레기온입니다.</p>
      </section>

      {/* 멤버 목록 */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-6">멤버 목록</h2>
        {loading ? (
          <p className="text-gray-500">불러오는 중...</p>
        ) : members.length === 0 ? (
          <p className="text-gray-500">등록된 멤버가 없습니다.</p>
        ) : (
          <div className="space-y-6">
            {roles.map((role) => (
              <div key={role}>
                <h3 className="text-sm text-gray-500 uppercase tracking-widest mb-3">{role}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {grouped[role]?.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3"
                    >
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${ROLE_BADGE[member.role] ?? 'bg-gray-700 text-gray-200'}`}
                      >
                        {member.role}
                      </span>
                      <span className="text-white font-medium">{member.nickname}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
