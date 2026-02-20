import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { downloadFile, listFiles } from '@/lib/google-drive'
import { ParserFactory } from '@/lib/parsers/parser-factory'
import { prisma } from '@/lib/prisma'
import { ParseResult, SupplierConfig } from '@/lib/parsers/base-parser'
import { Decimal } from '@prisma/client/runtime/library'
import { InvoicePdfParser } from '@/lib/parsers/invoice-pdf-parser'

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
    
    // リクエストボディから抽出済みテキストを取得（Ore PDF用）
    const body = await request.json().catch(() => ({}))
    const extractedTexts = body.extractedTexts || {}

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
      invoiceAmount: null as number | null,
      systemAmount: null as number | null,
      amountDifference: null as number | null,
      hasAmountMismatch: false,
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
      
      // 業者ごとに商品PDFを判定
      const productPdfFiles = pdfFiles.filter(f => {
        const fileName = f.name.toLowerCase()
        const supplier = supplierName.toLowerCase()
        
        // Apre: 落札明細PDF
        if ((supplier.includes('apre') || supplier.includes('アプレ')) && f.name.includes('落札明細')) {
          return true
        }
        
        // RevaAuc: 精算書PDF
        if ((supplier.includes('revaauc') || supplier.includes('リバオク') || supplier.includes('レバオク')) && f.name.includes('精算書')) {
          return true
        }

        // Ore: Slip（御精算書）PDF
        if ((supplier.includes('ore') || supplier.includes('オーレ')) && f.name.includes('Slip')) {
          return true
        }

        return false
      })
      
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
          const parseResult = await parser.parse(buffer)
          
          // ParseResultから商品リストを取得
          const products = Array.isArray(parseResult) ? parseResult : parseResult.products
          
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
                // 既存の商品を更新
                console.log(`更新: ${product.productId}`)
                await prisma.product.update({
                  where: { productId: product.productId },
                  data: {
                    boxNumber: product.boxNumber,
                    rowNumber: product.rowNumber,
                    name: product.name,
                    description: product.description || `${product.brand || ''} ${product.genre || ''}`.trim(),
                    purchasePrice: product.purchasePrice,
                    commission: product.commission || 0,
                    auctionDate: folder.auctionDate,
                    auctionName: folder.folderPath.split('/').pop() || folder.auctionName,
                  },
                })
              } else {
                // 新規商品を作成
                console.log(`新規作成: ${product.productId}`)
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
              }

              results.success++
            } catch (productError) {
              console.error(`商品保存エラー: ${product.productId}`, productError)
              results.failed++
              results.errors.push(`${product.productId}: ${String(productError)}`)
            }
          }

          // CSVファイルの処理完了を記録（既存の場合は更新）
          await prisma.document.upsert({
            where: { driveFileId: csvFile.id },
            create: {
              fileName: csvFile.name,
              fileType: 'csv',
              driveFileId: csvFile.id,
              filePath: `${folder.folderPath}/${csvFile.name}`,
              driveFolderId: folder.id,
              processedAt: new Date(),
            },
            update: {
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
          
          // 業者名に応じた適切なパーサーを取得
          const parser = ParserFactory.getParser(pdfFile.mimeType, supplier.name)
          
          // Oreの場合、クライアントから抽出済みテキストを使用
          let parseResult
          const isOre = supplier.name.toLowerCase().includes('ore') || supplier.name.toLowerCase().includes('オーレ')
          const hasExtractedText = extractedTexts[pdfFile.id]
          
          if (isOre && hasExtractedText) {
            parseResult = await parser.parse(extractedTexts[pdfFile.id])
          } else {
            // ファイルをダウンロード
            const buffer = await downloadFile(pdfFile.id)
            parseResult = await parser.parse(buffer)
          }
          
          // ParseResultから商品リストと請求書情報を取得
          const products = Array.isArray(parseResult) ? parseResult : parseResult.products
          const invoiceSummary = Array.isArray(parseResult) ? undefined : parseResult.invoiceSummary
          
          console.log(`${products.length}件の商品を抽出`)
          results.processed += products.length

          // 請求書の総額を記録（最初のPDFのみ）
          if (invoiceSummary && results.invoiceAmount === null) {
            results.invoiceAmount = invoiceSummary.totalAmount
            console.log(`請求書総額: ¥${invoiceSummary.totalAmount.toLocaleString()}`)
          }

          // 商品データを保存
          for (const product of products) {
            try {
              // 重複チェック
              const existing = await prisma.product.findUnique({
                where: { productId: product.productId },
              })

              if (existing) {
                // 既存の商品を更新
                console.log(`更新: ${product.productId}`)
                await prisma.product.update({
                  where: { productId: product.productId },
                  data: {
                    boxNumber: product.boxNumber,
                    rowNumber: product.rowNumber,
                    name: product.name,
                    description: product.description || `${product.brand || ''} ${product.metadata?.accessories || ''}`.trim(),
                    purchasePrice: product.purchasePrice,
                    commission: product.commission || 0,
                    auctionDate: folder.auctionDate,
                    auctionName: folder.folderPath.split('/').pop() || folder.auctionName,
                  },
                })
              } else {
                // 新規商品を作成
                console.log(`新規作成: ${product.productId}`)
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
              }

              results.success++
            } catch (productError) {
              console.error(`商品保存エラー: ${product.productId}`, productError)
              results.failed++
              results.errors.push(`${product.productId}: ${String(productError)}`)
            }
          }

          // PDFファイルの処理完了を記録（既存の場合は更新）
          await prisma.document.upsert({
            where: { driveFileId: pdfFile.id },
            create: {
              fileName: pdfFile.name,
              fileType: 'pdf',
              driveFileId: pdfFile.id,
              filePath: `${folder.folderPath}/${pdfFile.name}`,
              driveFolderId: folder.id,
              processedAt: new Date(),
            },
            update: {
              processedAt: new Date(),
            },
          })
        } catch (fileError) {
          console.error(`PDF処理エラー: ${pdfFile.name}`, fileError)
          results.errors.push(`${pdfFile.name}: ${String(fileError)}`)
        }
      }

      // 参照用PDFファイルから請求書総額を抽出（CSV業者用）
      if (results.invoiceAmount === null && referencePdfFiles.length > 0) {
        const invoicePdfParser = new InvoicePdfParser()
        
        for (const pdfFile of referencePdfFiles) {
          try {
            // 請求書と思われるPDFを判定
            const fileName = pdfFile.name.toLowerCase()
            const isInvoicePdf =
              fileName.includes('請求') ||
              fileName.includes('invoice') ||
              fileName.includes('精算') ||
              (fileName.endsWith('.pdf') && !fileName.includes('明細') && !fileName.includes('注文'))

            if (isInvoicePdf) {
              console.log(`請求書PDF処理中: ${pdfFile.name}`)
              
              // ファイルをダウンロード
              const buffer = await downloadFile(pdfFile.id)
              
              // 請求書総額を抽出
              const invoiceSummary = await invoicePdfParser.extractInvoiceSummary(buffer, supplier.name)
              
              if (invoiceSummary) {
                results.invoiceAmount = invoiceSummary.totalAmount
                console.log(`請求書総額を抽出: ¥${invoiceSummary.totalAmount.toLocaleString()} (${pdfFile.name})`)
                break // 最初に見つかった請求書総額を使用
              }
            }

            // PDFを記録
            await prisma.document.upsert({
              where: { driveFileId: pdfFile.id },
              create: {
                fileName: pdfFile.name,
                fileType: 'pdf',
                driveFileId: pdfFile.id,
                filePath: `${folder.folderPath}/${pdfFile.name}`,
                driveFolderId: folder.id,
                // processedAt: null（参照用として保存のみ）
              },
              update: {
                // 参照用PDFは更新しない
              },
            })
          } catch (pdfError) {
            console.error(`PDF記録エラー: ${pdfFile.name}`, pdfError)
          }
        }
      }

      // 請求額の検証（請求書総額が取得できた場合）
      if (results.invoiceAmount !== null) {
        // 業者設定を取得
        const supplierConfig = supplier.parserConfig as SupplierConfig | null
        
        if (supplierConfig) {
          // 取り込んだ全商品を取得
          const importedProducts = await prisma.product.findMany({
            where: {
              supplierId: supplier.id,
              auctionDate: folder.auctionDate,
            },
          })

          // システム側で請求額を計算
          let productTotal = 0
          let commissionTotal = 0

          for (const product of importedProducts) {
            productTotal += Number(product.purchasePrice)
            commissionTotal += Number(product.commission || 0)
          }

          // 税込計算
          if (supplierConfig.productPriceTaxType === 'excluded') {
            productTotal *= (1 + supplierConfig.taxRate)
          }
          if (supplierConfig.commissionTaxType === 'excluded') {
            commissionTotal *= (1 + supplierConfig.taxRate)
          }

          // 参加費
          let participationFee = supplierConfig.participationFee?.amount || 0
          if (supplierConfig.participationFee && supplierConfig.participationFee.taxType === 'excluded') {
            participationFee *= (1 + supplierConfig.taxRate)
          }

          // 送料
          let shippingFee = supplierConfig.shippingFee?.amount || 0
          if (supplierConfig.shippingFee && supplierConfig.shippingFee.taxType === 'excluded') {
            shippingFee *= (1 + supplierConfig.taxRate)
          }

          const systemAmount = Math.round(productTotal + commissionTotal + participationFee + shippingFee)
          const amountDifference = Math.abs(results.invoiceAmount - systemAmount)
          const hasAmountMismatch = amountDifference > 1 // 1円以上の差異を不一致とみなす

          results.systemAmount = systemAmount
          results.amountDifference = amountDifference
          results.hasAmountMismatch = hasAmountMismatch

          if (hasAmountMismatch) {
            console.warn(`⚠️ 請求額不一致: 請求書=${results.invoiceAmount}, システム=${systemAmount}, 差額=${amountDifference}`)
          } else {
            console.log(`✅ 請求額一致: ¥${results.invoiceAmount.toLocaleString()}`)
          }
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
          invoiceAmount: results.invoiceAmount !== null ? new Decimal(results.invoiceAmount) : null,
          systemAmount: results.systemAmount !== null ? new Decimal(results.systemAmount) : null,
          amountDifference: results.amountDifference !== null ? new Decimal(results.amountDifference) : null,
          hasAmountMismatch: results.hasAmountMismatch,
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
