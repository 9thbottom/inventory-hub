'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { AuthButton } from '@/components/auth-button'
import { useState } from 'react'

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
  const queryClient = useQueryClient()
  const [isAddingSupplier, setIsAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierCode, setNewSupplierCode] = useState('')
  
  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers')
      if (!res.ok) throw new Error('業者一覧の取得に失敗しました')
      return res.json()
    },
  })

  const addSupplierMutation = useMutation({
    mutationFn: async (data: { name: string; code: string }) => {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '業者の追加に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setIsAddingSupplier(false)
      setNewSupplierName('')
      setNewSupplierCode('')
    },
  })

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSupplierName.trim() || !newSupplierCode.trim()) {
      alert('業者名とコードを入力してください')
      return
    }
    addSupplierMutation.mutate({
      name: newSupplierName.trim(),
      code: newSupplierCode.trim().toUpperCase(),
    })
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
            <h1 className="text-3xl font-bold text-gray-900">業者管理</h1>
          </div>
          <AuthButton />
        </div>

        {/* 業者追加フォーム */}
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          {!isAddingSupplier ? (
            <button
              onClick={() => setIsAddingSupplier(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              + 新規業者追加
            </button>
          ) : (
            <form onSubmit={handleAddSupplier} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    業者名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="例: Ore"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                    コード <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="code"
                    value={newSupplierCode}
                    onChange={(e) => setNewSupplierCode(e.target.value.toUpperCase())}
                    placeholder="例: ORE"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addSupplierMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {addSupplierMutation.isPending ? '追加中...' : '追加'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingSupplier(false)
                    setNewSupplierName('')
                    setNewSupplierCode('')
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                >
                  キャンセル
                </button>
              </div>
              {addSupplierMutation.isError && (
                <div className="text-red-600 text-sm">
                  エラー: {addSupplierMutation.error.message}
                </div>
              )}
            </form>
          )}
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
