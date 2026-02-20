import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * フォルダ内のファイル情報を取得
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { folderId } = await params

    // フォルダ情報を取得
    const folder = await prisma.driveFolder.findUnique({
      where: { id: folderId },
      include: {
        documents: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            driveFileId: true,
          },
        },
      },
    })

    if (!folder) {
      return NextResponse.json({ error: 'フォルダが見つかりません' }, { status: 404 })
    }

    // ファイル情報を返す（mimeTypeを追加）
    const files = folder.documents.map((doc: any) => ({
      id: doc.driveFileId,
      name: doc.fileName,
      mimeType: doc.fileType === 'csv' ? 'text/csv' : 'application/pdf',
    }))

    return NextResponse.json(files)
  } catch (error) {
    console.error('ファイル情報取得エラー:', error)
    return NextResponse.json(
      { error: 'ファイル情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}
