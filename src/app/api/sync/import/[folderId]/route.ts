import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { downloadFile, listFiles } from '@/lib/google-drive'
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

    try {
      // Google Drive APIでファイル一覧を取得
      const files = await listFiles(folder.driveFolderId)
      
      // 業者情報を取得（フォルダ名から業者名を抽出）
      const supplierName = folder.auctionName
      
      // ファイルを分類
      const csvFiles = files.filter(f =>
        f.name.toLowerCase().endsWith('.csv')
      )
      
      const pdfFiles = files.filter(f =>
        f.mimeType.includes('pdf')
      )
      
      // Apreの場合、「落札明細」PDFを商品データとして処理
      const productPdfFiles = pdfFiles.filter(f =>
        f.name.includes('落札明細') &&
        (supplierName.toLowerCase().includes('apre') || supplierName.includes('アプレ'))
      )
      
      // その他のPDFは参照用
      const referencePdfFiles = pdfFiles.filter(f =>
        !productPdfFiles.includes(f)
      )

      console.log(`処理対象: CSV ${csvFiles.length}件, 商品PDF ${productPdfFiles.length}件, 参照PDF ${referencePdfFiles.length}件`)

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
          
          // 業者名に応じた適切なパーサーを取得
          const parser = ParserFactory.getParser(csvFile.mimeType, supplier.name)
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
                  productId: product.productId, // B024-7 の形式
                  boxNumber: product.boxNumber,
                  rowNumber: product.rowNumber,
                  name: product.name,
                  description: product.description || `${product.brand || ''} ${product.genre || ''}`.trim(),
                  purchasePrice: product.purchasePrice,
                  commission: product.commission || 0,
                  supplierId: supplier.id,
                  auctionDate: folder.auctionDate,
                  auctionName: folder.folderPath.split('/').pop() || folder.auctionName, // フォルダ名全体 (0111_Daikichi)
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

      // 商品データを含むPDFファイルを処理（Apreの落札明細など）
      for (const pdfFile of productPdfFiles) {
        try {
          console.log(`PDF処理中: ${pdfFile.name}`)
          
          // ファイルをダウンロード
          const buffer = await downloadFile(pdfFile.id)
          
          // 業者名に応じた適切なパーサーを取得
          const parser = ParserFactory.getParser(pdfFile.mimeType, supplier.name)
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
                  boxNumber: product.boxNumber,
                  rowNumber: product.rowNumber,
                  name: product.name,
                  description: product.description || `${product.brand || ''} ${product.metadata?.accessories || ''}`.trim(),
                  purchasePrice: product.purchasePrice,
                  commission: product.commission || 0,
                  supplierId: supplier.id,
                  auctionDate: folder.auctionDate,
                  auctionName: folder.folderPath.split('/').pop() || folder.auctionName,
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

          // PDFファイルの処理完了を記録
          await prisma.document.create({
            data: {
              fileName: pdfFile.name,
              fileType: 'pdf',
              driveFileId: pdfFile.id,
              filePath: `${folder.folderPath}/${pdfFile.name}`,
              driveFolderId: folder.id,
              processedAt: new Date(),
            },
          })
        } catch (fileError) {
          console.error(`PDF処理エラー: ${pdfFile.name}`, fileError)
          results.errors.push(`${pdfFile.name}: ${String(fileError)}`)
        }
      }

      // 参照用PDFファイルは記録のみ
      for (const pdfFile of referencePdfFiles) {
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
