import pdf from 'pdf-parse'
import { BaseParser, ParserConfig, ParsedProduct } from './base-parser'

/**
 * RevaAuc（リバオク）専用パーサー
 * PDFから精算書の落札商品一覧を解析
 */
export class RevaAucParser extends BaseParser {
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
        console.warn('RevaAuc PDF: 商品データが見つかりませんでした')
      }

      return products
    } catch (error) {
      console.error('RevaAuc PDFパースエラー:', error)
      throw new Error(`RevaAuc PDFファイルの解析に失敗しました: ${error}`)
    }
  }

  /**
   * PDFテキストから商品情報を抽出
   */
  private extractProducts(text: string): ParsedProduct[] {
    const products: ParsedProduct[] = []
    const lines = text.split('\n')

    // 「（A）御落札商品一覧」の後から商品データが始まる
    const startIndex = lines.findIndex(line => line.includes('（A）御落札商品一覧'))
    if (startIndex === -1) {
      console.warn('RevaAuc PDF: 開始マーカー「（A）御落札商品一覧」が見つかりません')
      return products
    }

    let i = startIndex + 1
    const nameLines: string[] = []

    while (i < lines.length) {
      const line = lines[i].trim()

      // 空行はスキップ
      if (!line) {
        i++
        continue
      }

      // 次のセクションや終了マーカーを検出
      if (this.isEndMarker(line)) {
        break
      }

      // スキップすべき行
      if (this.isSkipLine(line)) {
        i++
        continue
      }

      // 価格情報を含む行を検出
      // パターン1: 行全体が価格情報（例: "¥98,000¥2,94011"）
      const priceOnlyMatch = line.match(/^¥([\d,]+)¥([\d,]+)(\d+)(\d+)(.*)$/)
      if (priceOnlyMatch) {
        const [, price, commission, no, quantity, accessories] = priceOnlyMatch

        if (nameLines.length > 0) {
          const name = nameLines.join(' ').trim()
          const brand = this.extractBrand(name)

          products.push({
            productId: no,
            originalProductId: no,
            name,
            purchasePrice: this.normalizePrice(price),
            quantity: parseInt(quantity) || 1,
            commission: this.normalizePrice(commission),
            brand,
            metadata: {
              no,
              accessories: accessories.trim() || undefined,
            },
          })

          // 次の商品のためにリセット
          nameLines.length = 0
        }
        i++
        continue
      }

      // パターン2: 商品名と価格情報が同じ行（例: "プラダ　ガレリアバッグ　パープル¥42,000¥1,26041クロ"）
      const nameWithPriceMatch = line.match(/^(.+?)¥([\d,]+)¥([\d,]+)(\d+)(\d+)(.*)$/)
      if (nameWithPriceMatch) {
        const [, namePart, price, commission, no, quantity, accessories] = nameWithPriceMatch

        // 前の行の商品名と結合
        const fullNameLines = [...nameLines, namePart.trim()]
        const name = fullNameLines.join(' ').trim()
        const brand = this.extractBrand(name)

        products.push({
          productId: no,
          originalProductId: no,
          name,
          purchasePrice: this.normalizePrice(price),
          quantity: parseInt(quantity) || 1,
          commission: this.normalizePrice(commission),
          brand,
          metadata: {
            no,
            accessories: accessories.trim() || undefined,
          },
        })

        // 次の商品のためにリセット
        nameLines.length = 0
        i++
        continue
      }

      // 商品名の一部として追加
      nameLines.push(line)
      i++
    }

    return products
  }

  /**
   * ブランド名を商品名から抽出
   */
  private extractBrand(name: string): string | undefined {
    // 【別展】などのプレフィックスを除去
    const cleanName = name.replace(/^【[^】]+】/, '').trim()
    
    // 最初の単語をブランドとみなす
    const brandMatch = cleanName.match(/^([^\s　]+)/)
    return brandMatch ? brandMatch[1] : undefined
  }

  /**
   * 終了マーカーかどうかを判定
   */
  private isEndMarker(line: string): boolean {
    return (
      line.includes('（B）') ||
      line.includes('御出品') ||
      line.includes('ページ') ||
      /^\d+\s*\/\s*\d+$/.test(line) // ページ番号（例: "2 / 2"）
    )
  }

  /**
   * スキップすべき行かどうかを判定
   */
  private isSkipLine(line: string): boolean {
    const skipPatterns = [
      'ロット番号',
      '品名',
      '落札価格',
      '手数料',
      '数量',
      '付属品',
      '請求書No',
      '御落札商品一覧',
    ]

    return skipPatterns.some(pattern => line.includes(pattern))
  }
}
