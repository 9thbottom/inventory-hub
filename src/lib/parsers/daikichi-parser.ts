import { CSVParser } from './csv-parser'
import { ParserConfig, ParseResult } from './base-parser'

/**
 * 大吉（Daikichi）専用パーサー
 * CSVParserを拡張して大吉固有の処理を追加
 */
export class DaikichiParser extends CSVParser {
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParseResult> {
    // 大吉のデフォルト設定
    const daikichiConfig: ParserConfig = {
      type: 'csv',
      encoding: 'shift-jis',
      mapping: {
        boxNumber: '箱番号',
        rowNumber: '行番号',
        originalProductId: '商品番号',
        name: '商品名',
        purchasePrice: '商品単価（税別）',
        commission: '買い手数料（税別）',
        brand: 'ブランド',
        rank: 'ランク',
        genre: 'ジャンル',
        quantity: '数量',
      },
      ...config,
    }

    const result = await super.parse(fileBuffer, daikichiConfig)

    // 大吉固有の後処理: 商品IDを箱番号-行番号の形式に変換
    const products = result.products.map(product => ({
      ...product,
      productId: `${product.boxNumber}-${product.rowNumber}`, // B024-7 の形式
      // 追加情報を含める
      metadata: {
        originalProductId: product.originalProductId,
        brand: product.brand,
        rank: product.rank,
        genre: product.genre,
        quantity: product.quantity,
      },
    }))

    return {
      products,
      invoiceSummary: result.invoiceSummary,
    }
  }
}
