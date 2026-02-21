import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { downloadFile, listFiles } from '@/lib/google-drive'
import { ParserFactory } from '@/lib/parsers/parser-factory'
import { prisma } from '@/lib/prisma'
import { ParseResult, SupplierConfig, calculateInvoiceAmount } from '@/lib/parsers/base-parser'
import { Decimal } from '@prisma/client/runtime/library'
import { InvoicePdfParser } from '@/lib/parsers/invoice-pdf-parser'

/**
 * 指定フォルダのファイルを処理して商品データを取り込み
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  const { folderId } = await params
  let importLogId: string | null = null

  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }
    
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
    importLogId = importLog.id

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

      // Ore用: documentsテーブルにファイル情報を保存
      const isOre = supplierName.toLowerCase().includes('ore') || supplierName.toLowerCase().includes('オーレ')
      if (isOre) {
        console.log('Ore: documentsテーブルにファイル情報を保存')
        for (const file of [...productPdfFiles, ...referencePdfFiles]) {
          await prisma.document.upsert({
            where: {
              driveFileId: file.id,
            },
            update: {
              fileName: file.name,
              fileType: file.mimeType.includes('pdf') ? 'pdf' : 'csv',
            },
            create: {
              driveFileId: file.id,
              fileName: file.name,
              fileType: file.mimeType.includes('pdf') ? 'pdf' : 'csv',
              filePath: `${folder.folderPath}/${file.name}`,
              driveFolderId: folder.id,
            },
          })
        }
        console.log(`${productPdfFiles.length + referencePdfFiles.length}件のファイル情報を保存しました`)
      }

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
          const supplierConfig = supplier.parserConfig as any
          const isOre =
            supplier.name.toLowerCase().includes('ore') ||
            supplier.name.toLowerCase().includes('オーレ') ||
            supplier.name.toLowerCase().includes('日本時計') ||
            (supplierConfig && supplierConfig.parser === 'ore')
          const hasExtractedText = extractedTexts[pdfFile.id]
          
          console.log(`業者名: ${supplier.name}, isOre: ${isOre}, hasExtractedText: ${!!hasExtractedText}`)
          
          if (isOre && hasExtractedText) {
            console.log(`Ore: 抽出済みテキストを使用`)
            parseResult = await parser.parse(extractedTexts[pdfFile.id])
          } else if (isOre && !hasExtractedText) {
            console.warn(`Ore PDFですが、抽出済みテキストがありません。スキップします。`)
            continue
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

      // 参照用PDFファイルから請求書総額を抽出
      // Apreの場合は商品PDFから抽出した金額を上書きする
      const supplierNameLower = supplier.name.toLowerCase()
      const isApre = supplierNameLower.includes('apre') || supplierNameLower.includes('アプレ')
      
      if ((results.invoiceAmount === null || isApre) && referencePdfFiles.length > 0) {
        const invoicePdfParser = new InvoicePdfParser()
        
        // ファイルを優先順位でソート
        const sortedFiles = [...referencePdfFiles].sort((a, b) => {
          const aName = a.name.toLowerCase()
          const bName = b.name.toLowerCase()
          
          if (isApre) {
            // Apreの場合: 「明細一覧」を最優先
            const aIsTarget = aName.includes('明細一覧') || aName.includes('オークション明細')
            const bIsTarget = bName.includes('明細一覧') || bName.includes('オークション明細')
            if (aIsTarget && !bIsTarget) return -1
            if (!aIsTarget && bIsTarget) return 1
          }
          
          // その他: 「請求」を含むファイルを優先
          const aIsInvoice = aName.includes('請求') || aName.includes('invoice')
          const bIsInvoice = bName.includes('請求') || bName.includes('invoice')
          if (aIsInvoice && !bIsInvoice) return -1
          if (!aIsInvoice && bIsInvoice) return 1
          
          return 0
        })
        
        for (const pdfFile of sortedFiles) {
          try {
            // 請求書と思われるPDFを判定
            const fileName = pdfFile.name.toLowerCase()
            const isInvoicePdf =
              fileName.includes('請求') ||
              fileName.includes('invoice') ||
              fileName.includes('精算') ||
              fileName.includes('明細一覧') ||
              fileName.includes('オークション明細') ||
              (fileName.endsWith('.pdf') && !fileName.includes('落札明細') && !fileName.includes('注文'))

            if (isInvoicePdf) {
              console.log(`請求書PDF処理中: ${pdfFile.name}`)
              
              // ファイルをダウンロード
              const buffer = await downloadFile(pdfFile.id)
              
              // 業者名に応じた適切なパーサーを取得してPDFをパース
              const pdfParser = ParserFactory.getParser(pdfFile.mimeType, supplier.name)
              const pdfParseResult = await pdfParser.parse(buffer)
              
              // ParseResultから請求書サマリーを取得
              const invoiceSummary = Array.isArray(pdfParseResult)
                ? undefined
                : pdfParseResult.invoiceSummary
              
              if (invoiceSummary && invoiceSummary.totalAmount) {
                results.invoiceAmount = invoiceSummary.totalAmount
                console.log(`請求書総額を抽出: ¥${invoiceSummary.totalAmount.toLocaleString()} (${pdfFile.name})`)
                break // 最初に見つかった請求書総額を使用
              } else {
                // 業者固有のパーサーで取得できない場合は汎用パーサーを試す
                const fallbackSummary = await invoicePdfParser.extractInvoiceSummary(buffer, supplier.name)
                if (fallbackSummary) {
                  results.invoiceAmount = fallbackSummary.totalAmount
                  console.log(`請求書総額を抽出（汎用パーサー）: ¥${fallbackSummary.totalAmount.toLocaleString()} (${pdfFile.name})`)
                  break
                }
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

      // 請求額の検証（業者設定がある場合は常に実行）
      const supplierConfig = supplier.parserConfig as SupplierConfig | null
      
      console.log('=== 業者設定 ===')
      console.log(JSON.stringify(supplierConfig, null, 2))
      
      if (supplierConfig) {
        // taxRateのデフォルト値を設定（未定義の場合は10%）
        const taxRate = supplierConfig.taxRate ?? 0.1
        console.log(`税率: ${(taxRate * 100).toFixed(1)}%`)
        
        // 取り込んだ全商品を取得
        const importedProducts = await prisma.product.findMany({
          where: {
            supplierId: supplier.id,
            auctionDate: folder.auctionDate,
          },
        })

        // 参加費: ImportLogの値 → 業者設定の順で取得
        let participationFee = 0
        let participationFeeTaxType: 'included' | 'excluded' = 'included'
        
        if (importLog.participationFee !== null && importLog.participationFee !== undefined) {
          const fee = Number(importLog.participationFee)
          if (!isNaN(fee)) {
            participationFee = fee
            participationFeeTaxType = (importLog.participationFeeTaxType as 'included' | 'excluded') || 'included'
            console.log(`参加費設定: ImportLog優先 ¥${participationFee} (${participationFeeTaxType})`)
          }
        } else if (supplierConfig.participationFee) {
          participationFee = supplierConfig.participationFee.amount || 0
          participationFeeTaxType = supplierConfig.participationFee.taxType || 'included'
          console.log(`参加費設定: 業者設定 ${JSON.stringify(supplierConfig.participationFee)}`)
        } else {
          console.log(`参加費設定: なし`)
        }

        // 送料: ImportLogの値 → 業者設定の順で取得
        let shippingFee = 0
        let shippingFeeTaxType: 'included' | 'excluded' = 'included'
        
        if (importLog.shippingFee !== null && importLog.shippingFee !== undefined) {
          const fee = Number(importLog.shippingFee)
          if (!isNaN(fee)) {
            shippingFee = fee
            shippingFeeTaxType = (importLog.shippingFeeTaxType as 'included' | 'excluded') || 'included'
            console.log(`送料設定: ImportLog優先 ¥${shippingFee} (${shippingFeeTaxType})`)
          }
        } else if (supplierConfig.shippingFee) {
          shippingFee = supplierConfig.shippingFee.amount || 0
          shippingFeeTaxType = supplierConfig.shippingFee.taxType || 'included'
          console.log(`送料設定: 業者設定 ${JSON.stringify(supplierConfig.shippingFee)}`)
        } else {
          console.log(`送料設定: なし`)
        }

        // 共通計算関数を使用してシステム請求額を計算
        const productsForCalculation = importedProducts.map((p: any) => ({
          purchasePrice: Number(p.purchasePrice),
          commission: Number(p.commission || 0)
        }))

        console.log(`=== 計算開始 ===`)
        console.log(`商品数: ${productsForCalculation.length}`)
        console.log(`参加費: ¥${participationFee.toLocaleString()} (${participationFeeTaxType})`)
        console.log(`送料: ¥${shippingFee.toLocaleString()} (${shippingFeeTaxType})`)
        console.log(`丸め設定: ${JSON.stringify(supplierConfig.roundingConfig || { calculationType: 'total', roundingMode: 'floor' })}`)

        const systemAmount = calculateInvoiceAmount(
          productsForCalculation,
          supplierConfig,
          participationFee,
          participationFeeTaxType,
          shippingFee,
          shippingFeeTaxType
        )
        results.systemAmount = systemAmount
        
        console.log(`=== システム計算額 ===`)
        console.log(`合計: ¥${systemAmount.toLocaleString()}`)

        // 請求書総額が取得できた場合のみ比較
        if (results.invoiceAmount !== null) {
          const amountDifference = Math.abs(results.invoiceAmount - systemAmount)
          const hasAmountMismatch = amountDifference >= 1 // 1円以上の差異を不一致とみなす

          results.amountDifference = amountDifference
          results.hasAmountMismatch = hasAmountMismatch

          if (hasAmountMismatch) {
            console.warn(`⚠️ 請求額不一致: 請求書=${results.invoiceAmount}, システム=${systemAmount}, 差額=${amountDifference}`)
          } else {
            console.log(`✅ 請求額一致: ¥${results.invoiceAmount.toLocaleString()}`)
          }
        } else {
          // 請求書総額が取得できなかった場合は不一致として扱う
          results.hasAmountMismatch = true
          console.warn(`⚠️ 請求書総額が取得できませんでした。システム計算額: ¥${systemAmount.toLocaleString()}`)
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
          invoiceAmount: results.invoiceAmount !== null && !isNaN(results.invoiceAmount) && isFinite(results.invoiceAmount)
            ? new Decimal(results.invoiceAmount) : null,
          systemAmount: results.systemAmount !== null && !isNaN(results.systemAmount) && isFinite(results.systemAmount)
            ? new Decimal(results.systemAmount) : null,
          amountDifference: results.amountDifference !== null && !isNaN(results.amountDifference) && isFinite(results.amountDifference)
            ? new Decimal(results.amountDifference) : null,
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
    
    // エラー時にステータスを確実にerrorに戻す
    try {
      await prisma.driveFolder.update({
        where: { id: folderId },
        data: { status: 'error' },
      })
      
      if (importLogId) {
        await prisma.importLog.update({
          where: { id: importLogId },
          data: {
            status: 'error',
            completedAt: new Date(),
            errorDetails: [String(error)],
          },
        })
      }
    } catch (updateError) {
      console.error('ステータス更新エラー:', updateError)
    }
    
    return NextResponse.json(
      { error: 'インポート処理に失敗しました', details: String(error) },
      { status: 500 }
    )
  }
}
