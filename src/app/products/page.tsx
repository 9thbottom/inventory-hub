'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { AuthButton } from '@/components/auth-button'

interface Product {
  id: string
  productId: string
  boxNumber?: string
  rowNumber?: string
  name: string
  description?: string
  purchasePrice: number
  commission?: number
  status: string
  auctionName?: string
  supplier: {
    name: string
  }
  createdAt: string
}

interface GroupedProducts {
  [auctionName: string]: Product[]
}

export default function ProductsPage() {
  const { data: session, status } = useSession()
  const [search, setSearch] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '1000', // 全件取得してクライアント側でグループ化
      })
      if (search) params.append('search', search)
      
      const res = await fetch(`/api/vehicles?${params}`)
      if (!res.ok) throw new Error('商品一覧の取得に失敗しました')
      return res.json()
    },
  })

  // 参照フォルダごとにグループ化
  const groupedProducts: GroupedProducts = {}
  if (data?.products) {
    data.products.forEach((product: Product) => {
      const folderName = product.auctionName || '未分類'
      if (!groupedProducts[folderName]) {
        groupedProducts[folderName] = []
      }
      groupedProducts[folderName].push(product)
    })
  }

  const toggleFolder = (folderName: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderName)) {
      newExpanded.delete(folderName)
    } else {
      newExpanded.add(folderName)
    }
    setExpandedFolders(newExpanded)
  }

  const toggleAll = () => {
    if (expandedFolders.size === Object.keys(groupedProducts).length) {
      setExpandedFolders(new Set())
    } else {
      setExpandedFolders(new Set(Object.keys(groupedProducts)))
    }
  }

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
        <div className="mb-6 flex gap-4">
          <input
            type="text"
            placeholder="商品ID、商品名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={toggleAll}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {expandedFolders.size === Object.keys(groupedProducts).length ? '全て閉じる' : '全て開く'}
          </button>
        </div>

        {/* フォルダごとのアコーディオン */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            読み込み中...
          </div>
        ) : Object.keys(groupedProducts).length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            商品が見つかりませんでした
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedProducts)
              .sort(([a], [b]) => b.localeCompare(a)) // 新しい順にソート
              .map(([folderName, products]) => {
                const isExpanded = expandedFolders.has(folderName)
                // PDFの計算方法に合わせる: 全商品の小計を合計してから消費税を計算
                const subtotalSum = products.reduce((sum, p) => {
                  const purchasePrice = Number(p.purchasePrice)
                  const commission = Number(p.commission || 0)
                  return sum + purchasePrice + commission
                }, 0)
                const totalPrice = subtotalSum + Math.floor(subtotalSum * 0.1)

                return (
                  <div key={folderName} className="bg-white rounded-lg shadow overflow-hidden">
                    {/* フォルダヘッダー */}
                    <button
                      onClick={() => toggleFolder(folderName)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <svg
                          className={`w-5 h-5 text-gray-500 transition-transform ${
                            isExpanded ? 'transform rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <div className="text-left">
                          <h2 className="text-lg font-semibold text-gray-900">
                            {folderName}
                          </h2>
                          <p className="text-sm text-gray-500">
                            {products.length}件 / 合計 ¥{totalPrice.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {products[0]?.supplier.name}
                      </div>
                    </button>

                    {/* 商品テーブル */}
                    {isExpanded && (
                      <div className="border-t border-gray-200">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Inventory ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  商品ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  商品名
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  商品単価（税別）
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  買い手数料（税別）
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  合計金額（税込）
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
                              {products.map((product: Product) => {
                                const purchasePrice = Number(product.purchasePrice)
                                const commission = Number(product.commission || 0)
                                const subtotal = purchasePrice + commission
                                const totalWithTax = Math.floor(subtotal * 1.1)
                                
                                return (
                                  <tr key={product.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      {product.id.slice(0, 8)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {product.productId}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                      {product.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                      ¥{purchasePrice.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                      ¥{commission.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                                      ¥{totalWithTax.toLocaleString()}
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
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
