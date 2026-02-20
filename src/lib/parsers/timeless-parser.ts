import pdf from 'pdf-parse'
import { parse } from 'csv-parse/sync'
import iconv from 'iconv-lite'
import { BaseParser, ParserConfig, ParsedProduct, ParseResult, InvoiceSummary } from './base-parser'

/**
 * Timeless（タイムレス）専用パーサー
 * - CSV: 商品明細（仕入れ明細表）
 * - PDF: 請求書（計算書）
 */
export class TimelessParser extends BaseParser {
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParseResult> {
    try {
      // 文字列の場合はエラー
      if (typeof fileBuffer === 'string') {
        throw new Error('Timeless ParserはBufferが必要です')
      }

      // ファイルタイプを判定
      const isPDF = this.isPDFBuffer(fileBuffer)

      if (isPDF) {
        // PDFの場合は請求書サマリーのみを抽出
        return await this.parsePDF(fileBuffer)
      } else {
        // CSVの場合は商品明細を抽出
        return await this.parseCSV(fileBuffer, config)
      }
    } catch (error) {
      console.error('Timelessパースエラー:', error)
      throw new Error(`Timelessファイルの解析に失敗しました: ${error}`)
    }
  }

  /**
   * BufferがPDFかどうかを判定
   */
  private isPDFBuffer(buffer: Buffer): boolean {
    // PDFファイルは "%PDF-" で始まる
    return buffer.slice(0, 5).toString() === '%PDF-'
  }

  /**
   * CSV（商品明細）をパース
   */
  private async parseCSV(fileBuffer: Buffer, config?: ParserConfig): Promise<ParseResult> {
    try {
      // Shift-JISでデコード
      const content = iconv.decode(fileBuffer, 'shift_jis')

      // CSVをパース
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      })

      const products: ParsedProduct[] = []

      for (const record of records) {
        try {
          // CSVのカラム:
          // No, 商品番号, ブランド名, 商品名, 付属品, 備考, 金額(税抜), 金額(税込), 手数料(税抜), 手数料(税込)
          
          const productId = record['商品番号'] || ''
          const brand = record['ブランド名'] || ''
          const name = record['商品名'] || ''
          const accessories = record['付属品'] || ''
          const remarks = record['備考'] || ''
          const priceExcludingTax = this.normalizePrice(record['金額(税抜)'] || 0)
          const priceIncludingTax = this.normalizePrice(record['金額(税込)'] || 0)
          const commissionExcludingTax = this.normalizePrice(record['手数料(税抜)'] || 0)
          const commissionIncludingTax = this.normalizePrice(record['手数料(税込)'] || 0)

          // 商品名とブランド名を結合
          const fullName = brand ? `${brand} ${name}` : name

          if (fullName && productId) {
            products.push({
              productId,
              originalProductId: productId,
              name: fullName,
              brand,
              purchasePrice: priceIncludingTax, // 税込価格を使用
              commission: commissionIncludingTax, // 税込手数料を使用
              quantity: 1,
              metadata: {
                accessories,
                remarks,
                priceExcludingTax,
                priceIncludingTax,
                commissionExcludingTax,
                commissionIncludingTax,
              },
            })
          }
        } catch (error) {
          console.error('Timeless CSVレコードのパースエラー:', error, record)
        }
      }

      return {
        products,
      }
    } catch (error) {
      console.error('Timeless CSVパースエラー:', error)
      throw new Error(`Timeless CSVファイルの解析に失敗しました: ${error}`)
    }
  }

  /**
   * PDF（請求書）をパース
   */
  private async parsePDF(fileBuffer: Buffer): Promise<ParseResult> {
    try {
      // PDFからテキストを抽出
      const data = await pdf(fileBuffer)
      const text = data.text

      if (!text || text.trim().length === 0) {
        throw new Error('PDFからテキストを抽出できませんでした')
      }

      // 請求書のサマリー情報を抽出
      const invoiceSummary = this.extractInvoiceSummary(text)

      return {
        products: [], // PDFには商品明細がないため空配列
        invoiceSummary,
      }
    } catch (error) {
      console.error('Timeless PDFパースエラー:', error)
      throw new Error(`Timeless PDFファイルの解析に失敗しました: ${error}`)
    }
  }

  /**
   * 請求書のサマリー情報を抽出
   * 
   * PDFフォーマット例:
   * 仕入計 (税込)711,700
   * 仕入手数料計 (税込)21,351
   * 参加費 (税込)3,000
   * < 仕入合計 (税込)>736,051
   * 【領収金額】736,051
   * 貴社お支払金額736,051
   */
  private extractInvoiceSummary(text: string): InvoiceSummary | undefined {
    try {
      const lines = text.split('\n')
      
      let subtotal = 0 // 仕入計
      let commission = 0 // 仕入手数料計
      let participationFee = 0 // 参加費
      let totalAmount = 0 // 最終請求額

      for (const line of lines) {
        const trimmedLine = line.trim()

        // 仕入計 (税込)
        const subtotalMatch = trimmedLine.match(/仕入計\s*\(税込\)\s*([\d,]+)/)
        if (subtotalMatch) {
          subtotal = this.normalizePrice(subtotalMatch[1])
          console.log(`Timeless PDF: 仕入計=${subtotal}`)
        }

        // 仕入手数料計 (税込)
        const commissionMatch = trimmedLine.match(/仕入手数料計\s*\(税込\)\s*([\d,]+)/)
        if (commissionMatch) {
          commission = this.normalizePrice(commissionMatch[1])
          console.log(`Timeless PDF: 仕入手数料計=${commission}`)
        }

        // 参加費 (税込)
        const participationFeeMatch = trimmedLine.match(/参加費\s*\(税込\)\s*([\d,]+)/)
        if (participationFeeMatch) {
          participationFee = this.normalizePrice(participationFeeMatch[1])
          console.log(`Timeless PDF: 参加費=${participationFee}`)
        }

        // 貴社お支払金額（最終請求額）
        const totalMatch = trimmedLine.match(/貴社お支払金額\s*([\d,]+)/)
        if (totalMatch) {
          totalAmount = this.normalizePrice(totalMatch[1])
          console.log(`Timeless PDF: 貴社お支払金額=${totalAmount}`)
        }
      }

      if (totalAmount > 0) {
        return {
          totalAmount,
          subtotal: subtotal > 0 ? subtotal : undefined,
          participationFee: participationFee > 0 ? participationFee : undefined,
          metadata: {
            commission: commission > 0 ? commission : undefined,
          },
        }
      }

      console.warn('Timeless PDF: 請求額が見つかりませんでした')
      return undefined
    } catch (error) {
      console.error('Timeless請求書サマリー抽出エラー:', error)
      return undefined
    }
  }
}
