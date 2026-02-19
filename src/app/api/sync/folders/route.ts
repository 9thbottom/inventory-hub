import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getFolderStructure, parseFolderName } from '@/lib/google-drive'
import { prisma } from '@/lib/prisma'

/**
 * Google DriveのInventoryフォルダをスキャンして、
 * 新規フォルダをデータベースに登録
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!rootFolderId) {
      return NextResponse.json(
        { error: 'GOOGLE_DRIVE_FOLDER_IDが設定されていません' },
        { status: 500 }
      )
    }

    // Inventoryフォルダ配下の構造を取得
    // 想定: Inventory/2026/01/0111_Daikichi
    const folders = await getFolderStructure(rootFolderId)
    
    const results = {
      total: 0,
      new: 0,
      existing: 0,
      errors: [] as string[],
    }

    for (const folder of folders) {
      results.total++
      
      try {
        // フォルダパスから年月を抽出
        const pathParts = folder.path.split('/')
        if (pathParts.length < 3) {
          results.errors.push(`無効なフォルダ構造: ${folder.path}`)
          continue
        }

        const year = pathParts[0] // 2026
        const month = pathParts[1] // 01
        const folderName = pathParts[2] // 0111_Daikichi

        const parsed = parseFolderName(folderName, year, month)
        if (!parsed) {
          results.errors.push(`フォルダ名の解析失敗: ${folderName}`)
          continue
        }

        // データベースに登録（既存の場合はスキップ）
        const existing = await prisma.driveFolder.findUnique({
          where: { driveFolderId: folder.id },
        })

        if (existing) {
          results.existing++
          continue
        }

        await prisma.driveFolder.create({
          data: {
            folderPath: folder.path,
            driveFolderId: folder.id,
            auctionDate: parsed.date,
            auctionName: parsed.auctionName,
            status: 'pending',
          },
        })

        results.new++
      } catch (error) {
        console.error(`フォルダ処理エラー: ${folder.path}`, error)
        results.errors.push(`${folder.path}: ${error}`)
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('フォルダスキャンエラー:', error)
    return NextResponse.json(
      { error: 'フォルダのスキャンに失敗しました', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * 登録済みフォルダ一覧を取得
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const folders = await prisma.driveFolder.findMany({
      orderBy: { auctionDate: 'desc' },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    })

    return NextResponse.json(folders)
  } catch (error) {
    console.error('フォルダ一覧取得エラー:', error)
    return NextResponse.json(
      { error: 'フォルダ一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}
