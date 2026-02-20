import { parse } from 'csv-parse/sync'
import { BaseParser, ParserConfig, ParsedProduct, ParseResult } from './base-parser'
import iconv from 'iconv-lite'

/**
 * Ecoring専用パーサー
 * 2行ヘッダー（英語+日本語）に対応
 */
export class EcoringParser extends BaseParser {
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParseResult> {
    try {
      // 文字列の場合はエラー（EcoringはBuffer必須）
      if (typeof fileBuffer === 'string') {
        throw new Error('Ecoring ParserはBufferが必要です')
      }

      // Shift-JISからUTF-8に変換
      const content = iconv.decode(fileBuffer, 'shift_jis')
      
      // 行を分割して、1行目（英語ヘッダー）と3行目以降（データ）を結合
      const lines = content.split('\n')
      if (lines.length < 3) {
        throw new Error('Ecoring CSVファイルの形式が不正です（最低3行必要）')
      }
      
      // 1行目（英語ヘッダー）+ 3行目以降（データ）を結合
      const csvContent = [lines[0], ...lines.slice(2)].join('\n')
      
      // CSVをパース
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      })

      const products: ParsedProduct[] = []

      for (const record of records) {
        try {
          // 各フィールドを取得
          const buyoutNumber = record.buyout_number
          const receiptNumber = record.receipt_number
          const name = record.item_name
          const memo = record.memo
          const purchasePrice = this.normalizePrice(record.bid_price || 0)
          const commission = this.normalizePrice(record.purchase_commission || 0)
          
          // 画像URLを収集
          const images: string[] = []
          for (let i = 1; i <= 10; i++) {
            const imageKey = `image_${String(i).padStart(2, '0')}`
            const imageUrl = record[imageKey]
            if (imageUrl && imageUrl.trim()) {
              images.push(imageUrl.trim())
            }
          }

          // 商品名から管理番号を抽出（例: (11198_0984)Dior... → 11198_0984）
          let managementNumber = ''
          const nameMatch = name?.match(/^\(([^)]+)\)/)
          if (nameMatch) {
            managementNumber = nameMatch[1]
          }

          if (!name) {
            continue
          }

          const product: ParsedProduct = {
            productId: buyoutNumber ? String(buyoutNumber) : '',
            name,
            purchasePrice,
            commission,
            metadata: {
              buyoutNumber,
              receiptNumber,
              memo,
              managementNumber,
              images,
              purchasePriceTax: this.normalizePrice(record.bid_price_tax || 0),
              commissionTax: this.normalizePrice(record.purchase_commission_tax || 0),
              buyTotal: this.normalizePrice(record.buy_total || 0),
            },
          }

          products.push(product)
        } catch (error) {
          console.error('Ecoringレコードのパースエラー:', error, record)
        }
      }

      // CSVには請求書総額情報がないため、商品リストのみを返す
      return {
        products,
      }
    } catch (error) {
      console.error('EcoringCSVパースエラー:', error)
      throw new Error(`Ecoring CSVファイルの解析に失敗しました: ${error}`)
    }
  }
}
