import pdf from 'pdf-parse'
import { BaseParser, ParserConfig, ParsedProduct } from './base-parser'

/**
 * RevaAuc（リバオク）専用パーサー
 * PDFから精算書の落札商品一覧を解析
 *
 * 注意: pdf-parseライブラリではPDFの表構造が正しく抽出されず、
 * ロット番号列が取得できません。代わりに請求書番号+Noを商品IDとして使用します。
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

    console.log('=== RevaAuc PDF 解析開始 ===')
    console.log('総行数:', lines.length)

    // 請求書番号を抽出
    const invoiceNoMatch = text.match(/(\d{8,}_\d+)請求書No/)
    const invoiceNo = invoiceNoMatch ? invoiceNoMatch[1] : 'UNKNOWN'
    console.log('請求書番号:', invoiceNo)

    // 「（A）御落札商品一覧」の後から商品データが始まる
    const startIndex = lines.findIndex(line => line.includes('（A）御落札商品一覧'))
    if (startIndex === -1) {
      console.warn('RevaAuc PDF: 開始マーカー「（A）御落札商品一覧」が見つかりません')
      return products
    }

    console.log('開始位置:', startIndex)

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
      // 価格情報を含む行を検出
      // パターン: ¥価格¥手数料NoQuantity付属品
      // 手数料は3-5桁、その後にNo(1-2桁)+数量(1桁)が続く
      const priceMatch = line.match(/^(.*)¥([\d,]+)¥(\d{3,5})(\d{2,3})(.*)$/)
      if (priceMatch) {
        const [, namePart, price, commission, noAndQty, accessories] = priceMatch
        
        // NoAndQtyから数量（最後の1桁）とNo（残り）を分離
        // 2桁の場合: No(1桁) + 数量(1桁) 例: "11" → No=1, 数量=1
        // 3桁の場合: No(2桁) + 数量(1桁) 例: "101" → No=10, 数量=1
        const quantity = noAndQty.slice(-1)
        const no = noAndQty.slice(0, -1)
        
        console.log(`[解析] 手数料="${commission}", NoAndQty="${noAndQty}" → No="${no}", 数量="${quantity}"`)
        
        // 商品名を構築
        const fullNameLines = namePart.trim() ? [...nameLines, namePart.trim()] : nameLines
        const name = fullNameLines.join(' ').trim()
        
        if (name) {
          const brand = this.extractBrand(name)
          
          // 商品IDはNoを使用
          const productId = no

          products.push({
            productId,
            originalProductId: no,
            name,
            purchasePrice: this.normalizePrice(price),
            quantity: parseInt(quantity) || 1,
            commission: this.normalizePrice(commission),
            brand,
            metadata: {
              no,
              invoiceNo,
              accessories: accessories.trim() || undefined,
            },
          })

          // 次の商品のためにリセット
          nameLines.length = 0
        }
        i++
        continue
      }

      // 商品名の一部として追加
      nameLines.push(line)
      i++
    }

    console.log(`=== 抽出完了: ${products.length}件 ===`)
    products.forEach((p, i) => {
      console.log(`商品${i + 1}: No=${p.originalProductId}, 名前=${p.name.substring(0, 30)}..., 価格=¥${p.purchasePrice}, 手数料=¥${p.commission}`)
    })

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
