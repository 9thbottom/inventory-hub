import pdf from 'pdf-parse'
import { BaseParser, ParserConfig, ParsedProduct } from './base-parser'

/**
 * Ore（日本時計オークション）専用パーサー
 * PDFから御精算書の買い合計明細を解析
 */
export class OreParser extends BaseParser {
  async parse(fileBuffer: Buffer, config?: ParserConfig): Promise<ParsedProduct[]> {
    try {
      // バッファの検証
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('PDFファイルが空です')
      }

      // PDFからテキストを抽出
      const data = await pdf(fileBuffer)
      const text = data.text

      if (!text || text.trim().length === 0) {
        throw new Error('PDFからテキストを抽出できませんでした')
      }

      // 商品データを抽出
      const products = this.extractProducts(text)

      if (products.length === 0) {
        console.warn('Ore PDF: 商品データが見つかりませんでした')
      }

      return products
    } catch (error) {
      console.error('Ore PDFパースエラー:', error)
      throw new Error(`Ore PDFファイルの解析に失敗しました: ${error}`)
    }
  }

  /**
   * PDFテキストから商品情報を抽出
   */
  private extractProducts(text: string): ParsedProduct[] {
    const products: ParsedProduct[] = []

    console.log('Ore PDF: 抽出されたテキスト長:', text.length)
    console.log('Ore PDF: テキストの最初の500文字:', text.substring(0, 500))

    // 「【買い明細】」または「通番号」マーカーを探す
    let startIndex = text.indexOf('【買い明細】')
    if (startIndex === -1) {
      startIndex = text.indexOf('通番号')
      if (startIndex === -1) {
        console.warn('Ore PDF: 開始マーカーが見つかりません')
        console.log('Ore PDF: 全テキスト:', text)
        return products
      }
    }

    console.log('Ore PDF: 開始マーカー位置:', startIndex)

    // 開始マーカー以降のテキストを取得
    const dataSection = text.substring(startIndex)
    
    // 終了マーカーまでのテキストを取得
    const endMarker = '買い合計件数'
    const endIndex = dataSection.indexOf(endMarker)
    const productSection = endIndex !== -1 ? dataSection.substring(0, endIndex) : dataSection

    console.log('Ore PDF: 商品セクション長:', productSection.length)
    console.log('Ore PDF: 商品セクションの最初の1000文字:', productSection.substring(0, 1000))

    // 商品行のパターン: "1618   18   ｸﾘｽﾁｬﾝﾃﾞｨｵｰﾙ ｼｮﾙﾀﾞｰ   -18,000   -2,430 -13.5%"
    // 通番号(4桁) 商品番号(1-2桁) 商品名 落札金額 手数料 料率
    const productPattern = /(\d{4})\s+(\d{1,2})\s+(.+?)\s+-\s*([\d,]+)\s+-\s*([\d,]+)\s+-13\.5%/g

    let match
    let matchCount = 0
    while ((match = productPattern.exec(productSection)) !== null) {
      matchCount++
      const serialNo = match[1]
      const productNo = match[2]
      const name = match[3].trim()
      const price = match[4]
      const commission = match[5]

      console.log(`Ore PDF: マッチ${matchCount}:`, { serialNo, productNo, name, price, commission })

      const brand = this.extractBrand(name)

      products.push({
        productId: `${serialNo}-${productNo}`,
        originalProductId: productNo,
        name,
        purchasePrice: this.normalizePrice(price),
        quantity: 1,
        commission: this.normalizePrice(commission),
        brand,
        metadata: {
          serialNo,
          productNo,
        },
      })
    }

    console.log(`Ore PDF: ${products.length}件の商品を抽出`)
    return products
  }

  /**
   * ブランド名を商品名から抽出
   */
  private extractBrand(name: string): string | undefined {
    // 最初の単語をブランドとみなす
    // カタカナのブランド名を抽出（例: "ルイヴィトン"）
    const brandMatch = name.match(/^([ァ-ヴー]+)/)
    if (brandMatch) {
      return brandMatch[1]
    }

    // スペース区切りの最初の単語
    const words = name.split(/\s+/)
    if (words.length > 0) {
      return words[0]
    }

    return undefined
  }

  /**
   * スキップすべき行かどうかを判定
   */
  private isSkipLine(line: string): boolean {
    const skipPatterns = [
      '通番号',
      '商品番号',
      '商品名',
      '落札金額',
      '手数料',
      '料率',
      '御精算書',
      '日本時計オークション',
      '店名',
      '【買い明細】',
    ]

    return skipPatterns.some(pattern => line.includes(pattern))
  }
}
