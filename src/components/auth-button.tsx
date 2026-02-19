'use client'

import { signIn, signOut, useSession } from 'next-auth/react'

export function AuthButton() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return <div className="text-sm text-gray-600">読み込み中...</div>
  }

  if (session) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">
          {session.user?.email}
        </span>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
        >
          ログアウト
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => signIn('google')}
      className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg"
    >
      Googleでログイン
    </button>
  )
}
