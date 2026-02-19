'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { AuthButton } from '@/components/auth-button'

interface Supplier {
  id: string
  name: string
  code: string
  isActive: boolean
  _count: {
    products: number
  }
}

export default function SuppliersPage() {
  const { data: session, status } = useSession()
  
  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers')
      if (!res.ok) throw new Error('業者一覧の取得に失敗しました')
      return res.json()
    },
  })

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            ログインが必要です
          </h2>
          <AuthButton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
            >
              ← ホームに戻る
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">業者管理</h1>
          </div>
          <AuthButton />
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : !suppliers || suppliers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              業者が登録されていません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      業者名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      コード
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      商品数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ステータス
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {suppliers.map((supplier: Supplier) => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {supplier.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {supplier.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {supplier._count.products} 件
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            supplier.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {supplier.isActive ? '有効' : '無効'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
