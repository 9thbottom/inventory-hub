import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { downloadFile } from '@/lib/google-drive'
import { ParserFactory } from '@/lib/parsers/parser-factory'
import { prisma } from '@/lib/prisma'

/**
 * 指定フォルダのファイルを処理して商品データを取り込み
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const { folderId } = await params

    // フォルダ情報を取得
    const folder = await prisma.driveFolder.findUnique({
      where: { id: folderId },
      include: { documents: true },
    })

    if (!folder) {
      return NextResponse.json(
        { error: 'フォルダが見つかりません' },
        { status: 404 }
      )
    }

    // ステータスを処理中に更新
    await prisma.driveFolder.update({
      where: { id: folderId },
      data: { status: 'processing' },
    })

    // インポートログを作成
    const importLog = await prisma.importLog.create({
      data: {
        folderPath: folder.folderPath,
        status: 'processing',
      },
    })

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    }

    // フォルダ内のファイルを処理
    // 注: 実際の実装では、Google Drive APIでファイル一覧を取得する必要があります
    // ここでは簡略化のため、既存のdocumentsを使用
    
    try {
      // TODO: Google Drive APIでファイル一覧を取得
      // const files = await listFiles(folder.driveFolderId)
      
      // 仮の実装: 処理成功として記録
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: {
          status: 'success',
          itemsProcessed: results.processed,
          itemsSuccess: results.success,
          itemsFailed: results.failed,
          completedAt: new Date(),
          errorDetails: results.errors.length > 0 ? results.errors : undefined,
        },
      })

      await prisma.driveFolder.update({
        where: { id: folderId },
        data: {
          status: 'completed',
          lastSyncedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        ...results,
      })
    } catch (error) {
      console.error('インポート処理エラー:', error)
      
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: {
          status: 'error',
          completedAt: new Date(),
          errorDetails: [String(error)],
        },
      })

      await prisma.driveFolder.update({
        where: { id: folderId },
        data: { status: 'error' },
      })

      throw error
    }
  } catch (error) {
    console.error('インポートエラー:', error)
    return NextResponse.json(
      { error: 'インポート処理に失敗しました', details: String(error) },
      { status: 500 }
    )
  }
}
