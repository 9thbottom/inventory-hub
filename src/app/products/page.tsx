'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { AuthButton } from '@/components/auth-button'

interface Product {
  id: string
  productId: string
  name: string
  description?: string
  purchasePrice: number
  status: string
  supplier: {
    name: string
  }
  createdAt: string
}

export default function ProductsPage() {
  const { data: session, status } = useSession()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })
      if (search) params.append('search', search)
      
      const res = await fetch(`/api/vehicles?${params}`)
      if (!res.ok) throw new Error('商品一覧の取得に失敗しました')
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
            <h1 className="text-3xl font-bold text-gray-900">商品一覧</h1>
          </div>
          <AuthButton />
        </div>

        {/* 検索バー */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="商品ID、商品名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 商品テーブル */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : data?.products?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              商品が見つかりませんでした
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      商品ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      商品名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      仕入れ元
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      価格
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ステータス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      登録日
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data?.products?.map((product: Product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {product.productId}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {product.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.supplier.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ¥{Number(product.purchasePrice).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            product.status === 'in_stock'
                              ? 'bg-green-100 text-green-800'
                              : product.status === 'sold'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {product.status === 'in_stock'
                            ? '在庫'
                            : product.status === 'sold'
                            ? '売却済'
                            : '予約中'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(product.createdAt).toLocaleDateString('ja-JP')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ページネーション */}
          {data?.pagination && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  前へ
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= data.pagination.totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  次へ
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    全 <span className="font-medium">{data.pagination.total}</span> 件中{' '}
                    <span className="font-medium">
                      {(page - 1) * data.pagination.limit + 1}
                    </span>{' '}
                    -{' '}
                    <span className="font-medium">
                      {Math.min(page * data.pagination.limit, data.pagination.total)}
                    </span>{' '}
                    件を表示
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      前へ
                    </button>
                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      {page} / {data.pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page >= data.pagination.totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      次へ
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
