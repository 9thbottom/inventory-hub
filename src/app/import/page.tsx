'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { AuthButton } from '@/components/auth-button'

interface DriveFolder {
  id: string
  folderPath: string
  auctionDate: string
  auctionName: string
  status: string
  lastSyncedAt?: string
  _count: {
    documents: number
  }
}

export default function ImportPage() {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)

  const { data: folders, isLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await fetch('/api/sync/folders')
      if (!res.ok) throw new Error('フォルダ一覧の取得に失敗しました')
      return res.json()
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sync/folders', { method: 'POST' })
      if (!res.ok) throw new Error('同期に失敗しました')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      setSyncing(false)
    },
    onError: () => {
      setSyncing(false)
    },
  })

  const importMutation = useMutation({
    mutationFn: async (folderId: string) => {
      // フォルダ情報を取得
      const folder = folders?.find((f: DriveFolder) => f.id === folderId)
      if (!folder) throw new Error('フォルダが見つかりません')

      // Ore PDFの場合、クライアントサイドでテキストを抽出
      let extractedTexts: Record<string, string> = {}
      
      if (folder.auctionName.toLowerCase().includes('ore') || folder.auctionName.toLowerCase().includes('オーレ')) {
        extractedTexts = await extractOrePdfTexts(folderId)
      }

      // サーバーにインポートリクエストを送信
      const res = await fetch(`/api/sync/import/${folderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedTexts }),
      })
      
      if (!res.ok) throw new Error('取り込みに失敗しました')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      
      // 請求額検証結果を表示
      if (data.invoiceAmount !== null && data.systemAmount !== null) {
        const message = data.hasAmountMismatch
          ? `⚠️ 請求額に差異があります\n\n請求書: ¥${data.invoiceAmount.toLocaleString()}\nシステム: ¥${data.systemAmount.toLocaleString()}\n差額: ¥${data.amountDifference.toLocaleString()}\n\n内容を確認してください。`
          : `✅ 請求額が一致しました\n\n請求額: ¥${data.invoiceAmount.toLocaleString()}`
        
        alert(message)
      }
    },
  })

  /**
   * Ore PDFからクライアントサイドでテキストを抽出
   */
  const extractOrePdfTexts = async (folderId: string): Promise<Record<string, string>> => {
    const extractedTexts: Record<string, string> = {}
    
    try {
      // pdfjs-distを動的にインポート
      const pdfjsLib = await import('pdfjs-dist')
      
      // pdfjs-distのworker設定（ブラウザ用）
      if (typeof window !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      }
      
      // フォルダ内のファイル情報を取得
      const folderRes = await fetch(`/api/sync/folders/${folderId}/files`)
      if (!folderRes.ok) {
        throw new Error('ファイル情報の取得に失敗しました')
      }
      
      const files = await folderRes.json()
      const pdfFiles = files.filter((f: any) =>
        f.mimeType === 'application/pdf' && f.name.includes('Slip')
      )

      // 各PDFファイルを処理
      for (const pdfFile of pdfFiles) {
        try {
          // Google DriveからPDFをダウンロード
          const pdfRes = await fetch(`/api/sync/folders/${folderId}/files/${pdfFile.id}/download`)
          if (!pdfRes.ok) continue

          const arrayBuffer = await pdfRes.arrayBuffer()
          
          // pdfjs-distでテキストを抽出（CMap設定を追加）
          const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
            cMapPacked: true,
          })
          const pdfDocument = await loadingTask.promise
          
          let fullText = ''
          for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum)
            const textContent = await page.getTextContent()
            const pageText = textContent.items.map((item: any) => item.str).join(' ')
            fullText += pageText + '\n'
          }

          extractedTexts[pdfFile.id] = fullText
          
        } catch (error) {
          console.error(`Ore PDF処理エラー: ${pdfFile.name}`, error)
        }
      }
      
    } catch (error) {
      console.error('Ore PDF抽出エラー:', error)
    }

    return extractedTexts
  }

  const handleSync = () => {
    setSyncing(true)
    syncMutation.mutate()
  }

  const handleImport = (folderId: string) => {
    if (confirm('このフォルダのファイルを取り込みますか？')) {
      importMutation.mutate(folderId)
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
        <div className="mb-8 flex justify-between items-start">
          <div className="flex-1">
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
            >
              ← ホームに戻る
            </Link>
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-gray-900">取り込み管理</h1>
            <button
              onClick={handleSync}
              disabled={syncing || syncMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing || syncMutation.isPending ? '同期中...' : 'Driveから同期'}
              </button>
            </div>
          </div>
          <AuthButton />
        </div>

        {syncMutation.isSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">
              同期完了: 新規 {syncMutation.data.new} 件、既存 {syncMutation.data.existing} 件
            </p>
          </div>
        )}

        {syncMutation.isError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">同期に失敗しました</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : !folders || folders.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="mb-4">フォルダが見つかりませんでした</p>
              <p className="text-sm">「Driveから同期」ボタンをクリックしてフォルダを取得してください</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      フォルダパス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      オークション名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日付
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ファイル数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ステータス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {folders.map((folder: DriveFolder) => (
                    <tr key={folder.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {folder.folderPath}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {folder.auctionName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(folder.auctionDate).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {folder._count.documents} 件
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            folder.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : folder.status === 'processing'
                              ? 'bg-yellow-100 text-yellow-800'
                              : folder.status === 'error'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {folder.status === 'completed'
                            ? '完了'
                            : folder.status === 'processing'
                            ? '処理中'
                            : folder.status === 'error'
                            ? 'エラー'
                            : '未処理'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleImport(folder.id)}
                          disabled={
                            folder.status === 'processing' ||
                            importMutation.isPending
                          }
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          取り込み
                        </button>
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
