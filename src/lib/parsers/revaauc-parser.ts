import pdf from 'pdf-parse'
import { BaseParser, ParserConfig, ParsedProduct, ParseResult, InvoiceSummary } from './base-parser'

/**
 * RevaAuc（リバオク）専用パーサー
 * PDFから精算書の落札商品一覧を解析
 *
 * 注意: pdf-parseライブラリではPDFの表構造が正しく抽出されず、
 * ロット番号列が取得できません。代わりに請求書番号+Noを商品IDとして使用します。
 */
export class RevaAucParser extends BaseParser {
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParseResult> {
    try {
      // 文字列の場合はエラー（RevaAucはBuffer必須）
      if (typeof fileBuffer === 'string') {
        throw new Error('RevaAuc PDFはBufferが必要です')
      }

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

      // 請求書のサマリー情報を抽出
      const invoiceSummary = this.extractInvoiceSummary(text)

      return {
        products,
        invoiceSummary,
      }
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

    // 請求書番号を抽出
    const invoiceNoMatch = text.match(/(\d{8,}_\d+)請求書No/)
    const invoiceNo = invoiceNoMatch ? invoiceNoMatch[1] : 'UNKNOWN'

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
      // パターン: ¥価格¥手数料NoQuantity付属品
      //
      // パターン1: カンマ付き手数料（4桁以上） + 2-3桁NoAndQty
      // パターン2: 3桁手数料 + 2-3桁NoAndQty
      
      let priceMatch = line.match(/^(.*)¥([\d,]+)¥([\d,]+)(\d{2,3})(.*)$/)
      let commission, noAndQty, namePart, price, accessories
      
      if (priceMatch && priceMatch[3].includes(',')) {
        // パターン1: カンマ付き手数料
        [, namePart, price, commission, noAndQty, accessories] = priceMatch
      } else {
        // パターン2: 3桁手数料 + 2-3桁NoAndQty
        priceMatch = line.match(/^(.*)¥([\d,]+)¥(\d{3})(\d{2,3})(.*)$/)
        if (priceMatch) {
          [, namePart, price, commission, noAndQty, accessories] = priceMatch
        }
      }
      
      if (priceMatch && commission && noAndQty) {
        // NoAndQtyから数量（最後の1桁）とNo（残り）を分離
        // 2桁の場合: No(1桁) + 数量(1桁) 例: "11" → No=1, 数量=1
        // 3桁の場合: No(2桁) + 数量(1桁) 例: "101" → No=10, 数量=1
        const quantity = noAndQty.slice(-1)
        const no = noAndQty.slice(0, -1)
        
        // 商品名を構築
        const fullNameLines = (namePart && namePart.trim()) ? [...nameLines, namePart.trim()] : nameLines
        const name = fullNameLines.join(' ').trim()
        
        if (name && namePart !== undefined && price !== undefined && accessories !== undefined) {
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

    console.log(`${products.length}件の商品を抽出`)
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

  /**
   * 請求書のサマリー情報を抽出
   * RevaAucの精算書から振込金額を抽出
   */
  private extractInvoiceSummary(text: string): InvoiceSummary | undefined {
    try {
      // 「振込金額（税込）」を探す
      // パターン1: 同じ行にある場合 "振込金額（税込）: ¥XXX,XXX"
      let totalMatch = text.match(/振込金額[（(]税込[）)]\s*[:：]\s*¥([\d,]+)/)
      
      if (totalMatch) {
        const totalAmount = this.normalizePrice(totalMatch[1])
        console.log(`RevaAuc PDF: 振込金額を抽出（同行） ¥${totalAmount.toLocaleString()}`)
        
        return {
          totalAmount,
          metadata: {
            source: '振込金額（税込）',
          },
        }
      }
      
      // パターン2: 改行で分かれている場合
      // "振込金額（税込）：\n2026年01月27日\n¥1,208,911"
      totalMatch = text.match(/振込金額[（(]税込[）)]\s*[:：]\s*[\r\n]+[^\n]*[\r\n]+\s*¥([\d,]+)/)
      
      if (totalMatch) {
        const totalAmount = this.normalizePrice(totalMatch[1])
        console.log(`RevaAuc PDF: 振込金額を抽出（改行） ¥${totalAmount.toLocaleString()}`)
        
        return {
          totalAmount,
          metadata: {
            source: '振込金額（税込）',
          },
        }
      }
      
      // フォールバック: 「合計金額」パターンも試す
      totalMatch = text.match(/合計金額\s*[:：]?\s*¥([\d,]+)/)
      
      if (totalMatch) {
        const totalAmount = this.normalizePrice(totalMatch[1])
        console.log(`RevaAuc PDF: 合計金額を抽出 ¥${totalAmount.toLocaleString()}`)
        
        return {
          totalAmount,
          metadata: {
            source: '合計金額',
          },
        }
      }
      
      console.warn('RevaAuc PDF: 振込金額・合計金額が見つかりませんでした')
      return undefined
    } catch (error) {
      console.error('請求書サマリー抽出エラー:', error)
      return undefined
    }
  }
}
