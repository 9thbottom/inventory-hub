'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
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
      const res = await fetch(`/api/sync/import/${folderId}`, { method: 'POST' })
      if (!res.ok) throw new Error('取り込みに失敗しました')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })

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
