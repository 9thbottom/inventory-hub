import { parse } from 'csv-parse/sync'
import { BaseParser, ParserConfig, ParsedProduct, ParseResult } from './base-parser'
import iconv from 'iconv-lite'

export class CSVParser extends BaseParser {
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParseResult> {
    try {
      // 文字列の場合はエラー（CSVはBuffer必須）
      if (typeof fileBuffer === 'string') {
        throw new Error('CSV ParserはBufferが必要です')
      }

      // エンコーディング変換（Shift-JIS対応）
      const encoding = config?.encoding || 'utf-8'
      let content: string
      
      if (encoding.toLowerCase() === 'shift-jis' || encoding.toLowerCase() === 'shift_jis') {
        content = iconv.decode(fileBuffer, 'shift_jis')
      } else {
        content = fileBuffer.toString(encoding as BufferEncoding)
      }

      // CSVをパース
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      })

      // マッピング設定を使用してデータを変換
      const mapping = config?.mapping || {}
      const products: ParsedProduct[] = []

      for (const record of records) {
        try {
          const product: ParsedProduct = {
            productId: this.getMappedValue(record, mapping, 'productId') || '',
            boxNumber: this.getMappedValue(record, mapping, 'boxNumber'),
            rowNumber: this.getMappedValue(record, mapping, 'rowNumber'),
            originalProductId: this.getMappedValue(record, mapping, 'originalProductId'),
            name: this.getMappedValue(record, mapping, 'name') || '',
            description: this.getMappedValue(record, mapping, 'description'),
            purchasePrice: this.normalizePrice(
              this.getMappedValue(record, mapping, 'purchasePrice') || 0
            ),
            commission: this.normalizePrice(
              this.getMappedValue(record, mapping, 'commission') || 0
            ),
            brand: this.getMappedValue(record, mapping, 'brand'),
            rank: this.getMappedValue(record, mapping, 'rank'),
            genre: this.getMappedValue(record, mapping, 'genre'),
            quantity: this.getMappedValue(record, mapping, 'quantity'),
          }

          // マッピングされた全てのフィールドを追加（後処理で使用するため）
          for (const [key, csvColumn] of Object.entries(mapping)) {
            if (record[csvColumn] !== undefined) {
              (product as any)[key] = record[csvColumn]
            }
          }

          // 必須項目のチェック（nameは必須、productIdは後で生成される場合もある）
          if (product.name) {
            products.push(product)
          }
        } catch (error) {
          console.error('レコードのパースエラー:', error, record)
        }
      }

      // CSVには請求書総額情報がないため、商品リストのみを返す
      return {
        products,
      }
    } catch (error) {
      console.error('CSVパースエラー:', error)
      throw new Error(`CSVファイルの解析に失敗しました: ${error}`)
    }
  }

  private getMappedValue(
    record: any,
    mapping: Record<string, string>,
    field: string
  ): any {
    const mappedKey = mapping[field]
    if (mappedKey && record[mappedKey] !== undefined) {
      return record[mappedKey]
    }
    // マッピングがない場合は、フィールド名をそのまま使用
    return record[field]
  }
}
