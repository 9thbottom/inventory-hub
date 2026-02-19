import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { downloadFile, listFiles } from '@/lib/google-drive'
import { DaikichiParser } from '@/lib/parsers/daikichi-parser'
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

    try {
      // Google Drive APIでファイル一覧を取得
      const files = await listFiles(folder.driveFolderId)
      
      // ファイルを分類
      const csvFiles = files.filter(f =>
        f.name.toLowerCase().includes('daikichi') &&
        f.name.toLowerCase().endsWith('.csv')
      )
      
      const pdfFiles = files.filter(f =>
        f.mimeType.includes('pdf')
      )

      console.log(`処理対象: CSV ${csvFiles.length}件, PDF ${pdfFiles.length}件`)

      // 業者情報を取得（フォルダ名から業者名を抽出）
      const supplierName = folder.auctionName
      const supplier = await prisma.supplier.findFirst({
        where: {
          OR: [
            { name: { contains: supplierName, mode: 'insensitive' } },
            { code: supplierName.toUpperCase() },
          ],
        },
      })

      if (!supplier) {
        throw new Error(`業者が見つかりません: ${supplierName}`)
      }

      // CSVファイルを処理
      for (const csvFile of csvFiles) {
        try {
          console.log(`処理中: ${csvFile.name}`)
          
          // ファイルをダウンロード
          const buffer = await downloadFile(csvFile.id)
          
          // パーサーで解析
          const parser = new DaikichiParser()
          const products = await parser.parse(buffer)
          
          console.log(`${products.length}件の商品を抽出`)
          results.processed += products.length

          // 商品データを保存
          for (const product of products) {
            try {
              // 重複チェック
              const existing = await prisma.product.findUnique({
                where: { productId: product.productId },
              })

              if (existing) {
                console.log(`スキップ（既存）: ${product.productId}`)
                results.failed++
                results.errors.push(`商品ID ${product.productId} は既に登録されています`)
                continue
              }

              // 商品を保存
              await prisma.product.create({
                data: {
                  productId: product.productId,
                  name: product.name,
                  description: product.description || `${product.brand || ''} ${product.genre || ''}`.trim(),
                  purchasePrice: product.purchasePrice,
                  supplierId: supplier.id,
                  auctionDate: folder.auctionDate,
                  auctionName: folder.auctionName,
                  status: 'in_stock',
                },
              })

              results.success++
            } catch (productError) {
              console.error(`商品保存エラー: ${product.productId}`, productError)
              results.failed++
              results.errors.push(`${product.productId}: ${String(productError)}`)
            }
          }

          // CSVファイルの処理完了を記録
          await prisma.document.create({
            data: {
              fileName: csvFile.name,
              fileType: 'csv',
              driveFileId: csvFile.id,
              filePath: `${folder.folderPath}/${csvFile.name}`,
              driveFolderId: folder.id,
              processedAt: new Date(),
            },
          })
        } catch (fileError) {
          console.error(`ファイル処理エラー: ${csvFile.name}`, fileError)
          results.errors.push(`${csvFile.name}: ${String(fileError)}`)
        }
      }

      // PDFファイルは記録のみ（ダウンロード不要）
      for (const pdfFile of pdfFiles) {
        try {
          await prisma.document.create({
            data: {
              fileName: pdfFile.name,
              fileType: 'pdf',
              driveFileId: pdfFile.id,
              filePath: `${folder.folderPath}/${pdfFile.name}`,
              driveFolderId: folder.id,
              // processedAt: null（参照用として保存のみ）
            },
          })
        } catch (pdfError) {
          console.error(`PDF記録エラー: ${pdfFile.name}`, pdfError)
        }
      }

      // インポートログを更新
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: {
          status: results.failed > 0 && results.success === 0 ? 'error' :
                 results.failed > 0 ? 'partial' : 'success',
          itemsProcessed: results.processed,
          itemsSuccess: results.success,
          itemsFailed: results.failed,
          completedAt: new Date(),
          errorDetails: results.errors.length > 0 ? results.errors : undefined,
        },
      })

      // フォルダステータスを更新
      await prisma.driveFolder.update({
        where: { id: folderId },
        data: {
          status: 'completed',
          lastSyncedAt: new Date(),
        },
      })

      return NextResponse.json({
        ...results,
        success: true,
        message: `${results.success}件の商品を取り込みました`,
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
