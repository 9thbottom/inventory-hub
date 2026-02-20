'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AuthButton } from '@/components/auth-button'
import { useState, useEffect } from 'react'
import { SupplierConfig } from '@/lib/parsers/base-parser'

interface Supplier {
  id: string
  name: string
  code: string
  isActive: boolean
  parserConfig: SupplierConfig | null
  _count: {
    products: number
  }
}

export default function SupplierDetailPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const supplierId = params.id as string

  const [isEditing, setIsEditing] = useState(false)
  const [config, setConfig] = useState<SupplierConfig>({
    productPriceTaxType: 'excluded',
    commissionTaxType: 'excluded',
    taxRate: 0.1,
  })

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: async () => {
      const res = await fetch(`/api/suppliers/${supplierId}`)
      if (!res.ok) throw new Error('業者情報の取得に失敗しました')
      return res.json() as Promise<Supplier>
    },
  })

  // 業者データが読み込まれたら設定を初期化
  useEffect(() => {
    if (supplier?.parserConfig) {
      setConfig(supplier.parserConfig)
    }
  }, [supplier])

  const updateSupplierMutation = useMutation({
    mutationFn: async (data: { parserConfig: SupplierConfig }) => {
      const res = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '業者設定の更新に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setIsEditing(false)
      alert('設定を保存しました')
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateSupplierMutation.mutate({ parserConfig: config })
  }

  if (status === 'loading' || isLoading) {
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

  if (!supplier) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            業者が見つかりません
          </h2>
          <Link
            href="/suppliers"
            className="text-blue-600 hover:text-blue-800"
          >
            ← 業者一覧に戻る
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <Link
              href="/suppliers"
              className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
            >
              ← 業者一覧に戻る
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{supplier.name}</h1>
            <p className="text-gray-600 mt-2">コード: {supplier.code}</p>
            <p className="text-gray-600">商品数: {supplier._count.products}件</p>
          </div>
          <AuthButton />
        </div>

        {/* 業者設定フォーム */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">請求額計算設定</h2>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                編集
              </button>
            )}
          </div>

          {!isEditing ? (
            // 表示モード
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  商品代金
                </label>
                <p className="text-gray-900">
                  {config.productPriceTaxType === 'included' ? '税込' : '税別'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  手数料
                </label>
                <p className="text-gray-900">
                  {config.commissionTaxType === 'included' ? '税込' : '税別'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  消費税率
                </label>
                <p className="text-gray-900">{(config.taxRate * 100).toFixed(1)}%</p>
              </div>

              {config.participationFee && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    参加費
                  </label>
                  <p className="text-gray-900">
                    ¥{config.participationFee.amount.toLocaleString()} 
                    ({config.participationFee.taxType === 'included' ? '税込' : '税別'})
                  </p>
                </div>
              )}

              {config.shippingFee && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    送料
                  </label>
                  <p className="text-gray-900">
                    ¥{config.shippingFee.amount.toLocaleString()} 
                    ({config.shippingFee.taxType === 'included' ? '税込' : '税別'})
                  </p>
                </div>
              )}
            </div>
          ) : (
            // 編集モード
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品代金 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="excluded"
                      checked={config.productPriceTaxType === 'excluded'}
                      onChange={(e) => setConfig({ ...config, productPriceTaxType: e.target.value as 'included' | 'excluded' })}
                      className="mr-2"
                    />
                    税別
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="included"
                      checked={config.productPriceTaxType === 'included'}
                      onChange={(e) => setConfig({ ...config, productPriceTaxType: e.target.value as 'included' | 'excluded' })}
                      className="mr-2"
                    />
                    税込
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  手数料 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="excluded"
                      checked={config.commissionTaxType === 'excluded'}
                      onChange={(e) => setConfig({ ...config, commissionTaxType: e.target.value as 'included' | 'excluded' })}
                      className="mr-2"
                    />
                    税別
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="included"
                      checked={config.commissionTaxType === 'included'}
                      onChange={(e) => setConfig({ ...config, commissionTaxType: e.target.value as 'included' | 'excluded' })}
                      className="mr-2"
                    />
                    税込
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="taxRate" className="block text-sm font-medium text-gray-700 mb-1">
                  消費税率 (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="taxRate"
                  step="0.1"
                  min="0"
                  max="100"
                  value={isNaN(config.taxRate) ? 10 : config.taxRate * 100}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value)
                    setConfig({ ...config, taxRate: isNaN(value) ? 0.1 : value / 100 })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">追加費用（任意）</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        checked={!!config.participationFee}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConfig({ ...config, participationFee: { amount: 0, taxType: 'excluded' } })
                          } else {
                            const { participationFee, ...rest } = config
                            setConfig(rest)
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">参加費を設定</span>
                    </label>
                    {config.participationFee && (
                      <div className="ml-6 space-y-2">
                        <input
                          type="number"
                          placeholder="金額"
                          value={isNaN(config.participationFee.amount) ? 0 : config.participationFee.amount}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value)
                            setConfig({
                              ...config,
                              participationFee: { ...config.participationFee!, amount: isNaN(value) ? 0 : value }
                            })
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                        <div className="flex gap-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="excluded"
                              checked={config.participationFee.taxType === 'excluded'}
                              onChange={(e) => setConfig({
                                ...config,
                                participationFee: { ...config.participationFee!, taxType: e.target.value as 'included' | 'excluded' }
                              })}
                              className="mr-2"
                            />
                            税別
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="included"
                              checked={config.participationFee.taxType === 'included'}
                              onChange={(e) => setConfig({
                                ...config,
                                participationFee: { ...config.participationFee!, taxType: e.target.value as 'included' | 'excluded' }
                              })}
                              className="mr-2"
                            />
                            税込
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        checked={!!config.shippingFee}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConfig({ ...config, shippingFee: { amount: 0, taxType: 'excluded' } })
                          } else {
                            const { shippingFee, ...rest } = config
                            setConfig(rest)
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">送料を設定</span>
                    </label>
                    {config.shippingFee && (
                      <div className="ml-6 space-y-2">
                        <input
                          type="number"
                          placeholder="金額"
                          value={isNaN(config.shippingFee.amount) ? 0 : config.shippingFee.amount}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value)
                            setConfig({
                              ...config,
                              shippingFee: { ...config.shippingFee!, amount: isNaN(value) ? 0 : value }
                            })
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                        <div className="flex gap-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="excluded"
                              checked={config.shippingFee.taxType === 'excluded'}
                              onChange={(e) => setConfig({
                                ...config,
                                shippingFee: { ...config.shippingFee!, taxType: e.target.value as 'included' | 'excluded' }
                              })}
                              className="mr-2"
                            />
                            税別
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="included"
                              checked={config.shippingFee.taxType === 'included'}
                              onChange={(e) => setConfig({
                                ...config,
                                shippingFee: { ...config.shippingFee!, taxType: e.target.value as 'included' | 'excluded' }
                              })}
                              className="mr-2"
                            />
                            税込
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={updateSupplierMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {updateSupplierMutation.isPending ? '保存中...' : '保存'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    if (supplier.parserConfig) {
                      setConfig(supplier.parserConfig)
                    }
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                >
                  キャンセル
                </button>
              </div>

              {updateSupplierMutation.isError && (
                <div className="text-red-600 text-sm">
                  エラー: {updateSupplierMutation.error.message}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
