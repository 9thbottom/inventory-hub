import { CSVParser } from './csv-parser'
import { ParserConfig, ParseResult } from './base-parser'

/**
 * おたからや（Otakaraya）専用パーサー
 * CSVParserを拡張しておたからや固有の処理を追加
 */
export class OtakarayaParser extends CSVParser {
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParseResult> {
    // おたからやのデフォルト設定
    const otakarayaConfig: ParserConfig = {
      type: 'csv',
      encoding: 'utf-8', // UTF-8 BOM付き
      mapping: {
        line: 'ライン',
        tagNumber: '札番',
        genre: '商品ジャンル',
        brand: 'ブランド',
        name: '商品名',
        gemName: '宝石名',
        shapeName: '形状名',
        carat: 'カラット数',
        rank: 'ランク',
        purchasePrice: '落札金額（税抜）',
        commission: '手数料（税抜）',
        subtotal: '小計（税抜）',
      },
      ...config,
    }

    const result = await super.parse(fileBuffer, otakarayaConfig)

    // おたからや固有の後処理: 商品IDを札番に設定
    const products = result.products.map(product => {
      const record = product as any
      
      // マッピングされたフィールドから値を取得
      const tagNumber = record.tagNumber
      const line = record.line
      const gemName = record.gemName
      const shapeName = record.shapeName
      const carat = record.carat

      return {
        ...product,
        productId: tagNumber ? String(tagNumber) : '', // 札番をproductIdに設定
        // 追加情報を含める
        metadata: {
          line,
          tagNumber,
          brand: product.brand,
          rank: product.rank,
          genre: product.genre,
          gemName,
          shapeName,
          carat,
        },
      }
    })

    return {
      products,
      invoiceSummary: result.invoiceSummary,
    }
  }
}
