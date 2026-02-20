import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDriveClient } from '@/lib/google-drive'

/**
 * Google DriveからPDFファイルをダウンロード
 */
export async function GET(
  request: Request,
  { params }: { params: { folderId: string; fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { fileId } = await params

    // Google Driveクライアントを取得
    const drive = await getDriveClient()

    // ファイルをダウンロード
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    )

    // PDFファイルとして返す
    return new NextResponse(response.data as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="file.pdf"`,
      },
    })
  } catch (error) {
    console.error('PDFダウンロードエラー:', error)
    return NextResponse.json(
      { error: 'PDFのダウンロードに失敗しました' },
      { status: 500 }
    )
  }
}
