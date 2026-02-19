import { CSVParser } from './csv-parser'
import { ParserConfig, ParsedProduct } from './base-parser'

/**
 * 大吉（Daikichi）専用パーサー
 * CSVParserを拡張して大吉固有の処理を追加
 */
export class DaikichiParser extends CSVParser {
  async parse(fileBuffer: Buffer, config?: ParserConfig): Promise<ParsedProduct[]> {
    // 大吉のデフォルト設定
    const daikichiConfig: ParserConfig = {
      type: 'csv',
      encoding: 'shift-jis',
      mapping: {
        productId: '商品番号',
        name: '商品名',
        purchasePrice: '商品単価（税別）',
        brand: 'ブランド',
        rank: 'ランク',
        genre: 'ジャンル',
        quantity: '数量',
        commission: '買い手数料（税別）',
      },
      ...config,
    }

    const products = await super.parse(fileBuffer, daikichiConfig)

    // 大吉固有の後処理
    return products.map(product => ({
      ...product,
      // 追加情報を含める
      metadata: {
        brand: product.brand,
        rank: product.rank,
        genre: product.genre,
        quantity: product.quantity,
        commission: product.commission,
      },
    }))
  }
}
