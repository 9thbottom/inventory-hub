import { parse } from 'csv-parse/sync'
import { BaseParser, ParserConfig, ParsedProduct } from './base-parser'
import iconv from 'iconv-lite'

export class CSVParser extends BaseParser {
  async parse(fileBuffer: Buffer, config: ParserConfig): Promise<ParsedProduct[]> {
    try {
      // エンコーディング変換（Shift-JIS対応）
      const encoding = config.encoding || 'utf-8'
      let content: string
      
      if (encoding.toLowerCase() === 'shift-jis' || encoding.toLowerCase() === 'shift_jis') {
        content = iconv.decode(fileBuffer, 'shift_jis')
      } else {
        content = fileBuffer.toString(encoding)
      }

      // CSVをパース
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      })

      // マッピング設定を使用してデータを変換
      const mapping = config.mapping || {}
      const products: ParsedProduct[] = []

      for (const record of records) {
        try {
          const product: ParsedProduct = {
            productId: this.getMappedValue(record, mapping, 'productId') || '',
            name: this.getMappedValue(record, mapping, 'name') || '',
            description: this.getMappedValue(record, mapping, 'description'),
            purchasePrice: this.normalizePrice(
              this.getMappedValue(record, mapping, 'purchasePrice') || 0
            ),
          }

          // 必須項目のチェック
          if (product.productId && product.name) {
            products.push(product)
          }
        } catch (error) {
          console.error('レコードのパースエラー:', error, record)
        }
      }

      return products
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
