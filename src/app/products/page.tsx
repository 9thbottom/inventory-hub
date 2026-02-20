'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { AuthButton } from '@/components/auth-button'
import { EditProductModal, EditAuctionFeesModal } from '@/components/edit-modals'
import { Product, ImportLog, EditProductData, EditAuctionFeesData } from '@/types/product'

interface GroupedProducts {
  [auctionName: string]: Product[]
}

export default function ProductsPage() {
  const { data: session, status } = useSession()
  const [search, setSearch] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [importLogs, setImportLogs] = useState<Record<string, ImportLog>>({})
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingAuctionFees, setEditingAuctionFees] = useState<{ folderName: string; importLog: ImportLog; supplierConfig: any } | null>(null)
  const queryClient = useQueryClient()

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

  // ImportLogデータを取得
  const fetchImportLogs = async () => {
    const logs: Record<string, ImportLog> = {}
    for (const folderName of Object.keys(groupedProducts)) {
      if (folderName === '未分類') continue
      try {
        const res = await fetch(`/api/import-logs?auctionName=${encodeURIComponent(folderName)}`)
        if (res.ok) {
          const log = await res.json()
          if (log) {
            logs[folderName] = log
          }
        }
      } catch (error) {
        console.error(`ImportLog取得エラー (${folderName}):`, error)
      }
    }
    setImportLogs(logs)
  }

  // 商品データが読み込まれたらImportLogを取得
  if (data?.products && Object.keys(importLogs).length === 0 && Object.keys(groupedProducts).length > 0) {
    fetchImportLogs()
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

  const deleteMutation = useMutation({
    mutationFn: async (auctionName: string) => {
      const res = await fetch(`/api/products/delete-by-auction?auctionName=${encodeURIComponent(auctionName)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('削除に失敗しました')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditProductData }) => {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('商品の更新に失敗しました')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setEditingProduct(null)
      setImportLogs({})
    },
  })

  const updateAuctionFeesMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditAuctionFeesData }) => {
      const res = await fetch(`/api/import-logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('参加費・送料の更新に失敗しました')
      return res.json()
    },
    onSuccess: () => {
      setEditingAuctionFees(null)
      setImportLogs({})
      // 商品データも再取得して画面を更新
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const handleDelete = (folderName: string) => {
    if (window.confirm(`「${folderName}」の商品をすべて削除しますか？\nこの操作は取り消せません。`)) {
      deleteMutation.mutate(folderName)
    }
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
  }

  const handleSaveProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingProduct) return

    const formData = new FormData(e.currentTarget)
    const data: EditProductData = {
      productId: formData.get('productId') as string,
      name: formData.get('name') as string,
      purchasePrice: Number(formData.get('purchasePrice')),
      commission: Number(formData.get('commission')),
    }

    updateProductMutation.mutate({ id: editingProduct.id, data })
  }

  const handleEditAuctionFees = (folderName: string, importLog: ImportLog, supplierConfig: any) => {
    const defaultParticipationFee = importLog.participationFee !== null
      ? Number(importLog.participationFee)
      : supplierConfig?.participationFee?.amount || 0
    const defaultParticipationFeeTaxType = importLog.participationFeeTaxType || supplierConfig?.participationFee?.taxType || 'included'
    const defaultShippingFee = importLog.shippingFee !== null
      ? Number(importLog.shippingFee)
      : supplierConfig?.shippingFee?.amount || 0
    const defaultShippingFeeTaxType = importLog.shippingFeeTaxType || supplierConfig?.shippingFee?.taxType || 'included'

    setEditingAuctionFees({
      folderName,
      supplierConfig,
      importLog: {
        ...importLog,
        participationFee: defaultParticipationFee,
        participationFeeTaxType: defaultParticipationFeeTaxType,
        shippingFee: defaultShippingFee,
        shippingFeeTaxType: defaultShippingFeeTaxType,
      },
    })
  }

  const handleSaveAuctionFees = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingAuctionFees) return

    const formData = new FormData(e.currentTarget)
    const data: EditAuctionFeesData = {
      participationFee: formData.get('participationFee') ? Number(formData.get('participationFee')) : null,
      participationFeeTaxType: formData.get('participationFeeTaxType') as 'included' | 'excluded',
      shippingFee: formData.get('shippingFee') ? Number(formData.get('shippingFee')) : null,
      shippingFeeTaxType: formData.get('shippingFeeTaxType') as 'included' | 'excluded',
    }

    updateAuctionFeesMutation.mutate({ id: editingAuctionFees.importLog.id, data })
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
                
                // 業者の税設定を取得
                const supplierConfig = products[0]?.supplier?.parserConfig
                const productPriceTaxType = supplierConfig?.productPriceTaxType || 'excluded'
                const commissionTaxType = supplierConfig?.commissionTaxType || 'excluded'
                const taxRate = supplierConfig?.taxRate || 0.1
                
                // ImportLogから参加費・送料を取得
                const importLog = importLogs[folderName]
                
                // 参加費: ImportLogの値 → 業者設定の順で取得
                let participationFee = 0
                let participationFeeTaxType = 'included'
                if (importLog?.participationFee !== null && importLog?.participationFee !== undefined) {
                  participationFee = Number(importLog.participationFee)
                  participationFeeTaxType = importLog.participationFeeTaxType || 'included'
                } else if (supplierConfig?.participationFee) {
                  participationFee = supplierConfig.participationFee.amount
                  participationFeeTaxType = supplierConfig.participationFee.taxType
                }
                
                // 送料: ImportLogの値 → 業者設定の順で取得
                let shippingFee = 0
                let shippingFeeTaxType = 'included'
                if (importLog?.shippingFee !== null && importLog?.shippingFee !== undefined) {
                  shippingFee = Number(importLog.shippingFee)
                  shippingFeeTaxType = importLog.shippingFeeTaxType || 'included'
                } else if (supplierConfig?.shippingFee) {
                  shippingFee = supplierConfig.shippingFee.amount
                  shippingFeeTaxType = supplierConfig.shippingFee.taxType
                }
                
                // 商品合計を計算（業者の税設定に基づく）
                const productTotal = products.reduce((sum, p) => {
                  const purchasePrice = Number(p.purchasePrice)
                  const commission = Number(p.commission || 0)
                  
                  // 税込の場合はそのまま、税別の場合は税を加算
                  const priceWithTax = productPriceTaxType === 'included'
                    ? purchasePrice
                    : Math.floor(purchasePrice * (1 + taxRate))
                  const commissionWithTax = commissionTaxType === 'included'
                    ? commission
                    : Math.floor(commission * (1 + taxRate))
                  
                  return sum + priceWithTax + commissionWithTax
                }, 0)
                
                // ImportLogから最終請求額を取得
                const finalInvoiceAmount = importLog?.systemAmount ? Number(importLog.systemAmount) : productTotal
                const hasAmountMismatch = importLog?.hasAmountMismatch || false

                return (
                  <div key={folderName} className="bg-white rounded-lg shadow overflow-hidden">
                    {/* フォルダヘッダー */}
                    <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <button
                        onClick={() => toggleFolder(folderName)}
                        className="flex-1 flex items-center gap-4"
                      >
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
                          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            {folderName}
                            {hasAmountMismatch && (
                              <span className="text-yellow-600" title="請求額が一致しません">
                                ⚠️
                              </span>
                            )}
                          </h2>
                          <div className="text-sm text-gray-500">
                            <p className="mb-1">{products.length}件</p>
                            <div className="flex items-center gap-4 flex-wrap">
                              <span>商品合計: ¥{productTotal.toLocaleString()}</span>
                              
                              {/* 参加費 */}
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (importLog) {
                                    handleEditAuctionFees(folderName, importLog, supplierConfig)
                                  }
                                }}
                                className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                                title="クリックして編集"
                              >
                                <span>参加費: ¥{participationFee.toLocaleString()}</span>
                                <span className="text-xs">({participationFeeTaxType === 'included' ? '税込' : '税別'})</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </span>
                              
                              {/* 送料 */}
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (importLog) {
                                    handleEditAuctionFees(folderName, importLog, supplierConfig)
                                  }
                                }}
                                className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                                title="クリックして編集"
                              >
                                <span>送料: ¥{shippingFee.toLocaleString()}</span>
                                <span className="text-xs">({shippingFeeTaxType === 'included' ? '税込' : '税別'})</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </span>
                              
                              <span className={hasAmountMismatch ? 'text-yellow-600 font-semibold' : ''}>
                                最終請求額: ¥{finalInvoiceAmount.toLocaleString()}
                              </span>
                              {importLog?.invoiceAmount && (
                                <span className="text-xs text-gray-400">
                                  (PDF請求額: ¥{Number(importLog.invoiceAmount).toLocaleString()})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500">
                          {products[0]?.supplier.name}
                        </div>
                        <button
                          onClick={() => handleDelete(folderName)}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    {/* 商品テーブル */}
                    {isExpanded && (
                      <div className="border-t border-gray-200">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  在庫ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  商品ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  商品名
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                  商品({productPriceTaxType === 'included' ? '税込' : '税別'})
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                  手数料({commissionTaxType === 'included' ? '税込' : '税別'})
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                  合計(税込)
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  状態
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  登録日
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  操作
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {products.map((product: Product) => {
                                const purchasePrice = Number(product.purchasePrice)
                                const commission = Number(product.commission || 0)
                                
                                // 業者の税設定に基づいて合計を計算
                                const priceWithTax = productPriceTaxType === 'included'
                                  ? purchasePrice
                                  : Math.floor(purchasePrice * (1 + taxRate))
                                const commissionWithTax = commissionTaxType === 'included'
                                  ? commission
                                  : Math.floor(commission * (1 + taxRate))
                                const totalWithTax = priceWithTax + commissionWithTax
                                
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
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                      <button
                                        onClick={() => handleEditProduct(product)}
                                        className="text-blue-600 hover:text-blue-800"
                                      >
                                        編集
                                      </button>
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

      {/* モーダル */}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onSave={handleSaveProduct}
          onCancel={() => setEditingProduct(null)}
          isLoading={updateProductMutation.isPending}
        />
      )}

      {editingAuctionFees && (
        <EditAuctionFeesModal
          folderName={editingAuctionFees.folderName}
          importLog={editingAuctionFees.importLog}
          supplierConfig={editingAuctionFees.supplierConfig}
          onSave={handleSaveAuctionFees}
          onCancel={() => setEditingAuctionFees(null)}
          isLoading={updateAuctionFeesMutation.isPending}
        />
      )}
    </div>
  )
}
