import pdf from 'pdf-parse'
import { InvoiceSummary } from './base-parser'

/**
 * 請求書PDF専用パーサー
 * CSV業者（Daikichi、Otakaraya、EcoRing）およびApre の請求書PDFから総額を抽出
 */
export class InvoicePdfParser {
  /**
   * 請求書PDFから総額を抽出
   */
  async extractInvoiceSummary(fileBuffer: Buffer, supplierName: string): Promise<InvoiceSummary | undefined> {
    try {
      const data = await pdf(fileBuffer)
      const text = data.text

      if (!text || text.trim().length === 0) {
        return undefined
      }

      const supplier = supplierName.toLowerCase()

      // 業者ごとに異なる抽出ロジック
      if (supplier.includes('daikichi') || supplier.includes('大吉')) {
        return this.extractDaikichiInvoice(text)
      } else if (supplier.includes('otakaraya') || supplier.includes('おたからや')) {
        return this.extractOtakarayaInvoice(text)
      } else if (supplier.includes('ecoring') || supplier.includes('エコリング')) {
        return this.extractEcoringInvoice(text)
      } else if (supplier.includes('apre') || supplier.includes('アプレ')) {
        return this.extractApreInvoice(text)
      }

      return undefined
    } catch (error) {
      console.error('請求書PDF解析エラー:', error)
      return undefined
    }
  }

  /**
   * Daikichi請求書から総額を抽出
   * パターン: "合計352,965円"
   */
  private extractDaikichiInvoice(text: string): InvoiceSummary | undefined {
    // "合計XXX円" または "ご請求金額 XXX円" のパターンを探す
    const patterns = [
      /合計\s*([\d,]+)\s*円/,
      /ご請求金額\s*([\d,]+)\s*円/,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const totalAmount = this.normalizePrice(match[1])
        return {
          totalAmount,
          metadata: {
            source: 'Daikichi請求書',
            pattern: pattern.source,
          },
        }
      }
    }

    return undefined
  }

  /**
   * Otakaraya請求書から総額を抽出
   * パターン: "御請求金額 ￥2,033,735"
   */
  private extractOtakarayaInvoice(text: string): InvoiceSummary | undefined {
    // "御請求金額" の後の金額を探す
    const patterns = [
      /御請求金額\s*￥\s*([\d,]+)/,
      /御請求金額御請求金額\s*￥￥\s*([\d,]+)/,  // 重複パターン
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const totalAmount = this.normalizePrice(match[1])
        return {
          totalAmount,
          metadata: {
            source: 'Otakaraya請求書',
            pattern: pattern.source,
          },
        }
      }
    }

    return undefined
  }

  /**
   * EcoRing請求書から総額を抽出
   * パターン: "◎ご請求金額◎エコリングからのお支払額 ¥122,313"
   */
  private extractEcoringInvoice(text: string): InvoiceSummary | undefined {
    console.log('EcoRing請求書テキスト（最初の500文字）:', text.substring(0, 500))
    
    // 改行を含む可能性があるため、sフラグを使用（.が改行にもマッチ）
    const patterns = [
      /ご請求金額[\s\S]*?¥\s*([\d,]+)/,
      /エコリングからのお支払額[\s\S]*?¥\s*([\d,]+)/,
      /お支払額[\s\S]*?¥\s*([\d,]+)/,
      /請求金額[\s\S]*?¥\s*([\d,]+)/,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        console.log(`EcoRing請求額マッチ: パターン=${pattern.source}, 金額=${match[1]}`)
        const totalAmount = this.normalizePrice(match[1])
        return {
          totalAmount,
          metadata: {
            source: 'EcoRing請求書',
            pattern: pattern.source,
          },
        }
      }
    }

    console.warn('EcoRing請求額が見つかりませんでした')
    return undefined
  }

  /**
   * Apre請求書から総額を抽出
   * パターン: "御請求金額 ¥609,952"
   */
  private extractApreInvoice(text: string): InvoiceSummary | undefined {
    console.log('Apre請求書テキスト（最初の500文字）:', text.substring(0, 500))
    
    // パターン1: 最初に出現する¥金額（アプレオークション明細一覧の場合、最初の金額が御請求金額）
    const firstAmountMatch = text.match(/¥\s*([\d,]+)/)
    if (firstAmountMatch) {
      const amount = this.normalizePrice(firstAmountMatch[1])
      // 金額が妥当な範囲（1,000円以上）であることを確認
      if (amount >= 1000) {
        console.log(`Apre請求額マッチ（最初の金額）: ¥${amount.toLocaleString()}`)
        return {
          totalAmount: amount,
          metadata: {
            source: 'Apre請求書（最初の金額）',
          },
        }
      }
    }
    
    // パターン2: 「御請求金額」の後の金額を探す
    const patterns = [
      /御請求金額[\s\S]{0,200}¥\s*([\d,]+)/,  // 200文字以内で金額を探す
      /ご請求金額[\s\S]{0,200}¥\s*([\d,]+)/,
      /請求金額[\s\S]{0,200}¥\s*([\d,]+)/,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        console.log(`Apre請求額マッチ: パターン=${pattern.source}, 金額=${match[1]}`)
        const totalAmount = this.normalizePrice(match[1])
        return {
          totalAmount,
          metadata: {
            source: 'Apre請求書',
            pattern: pattern.source,
          },
        }
      }
    }

    console.warn('Apre請求額が見つかりませんでした')
    return undefined
  }

  /**
   * 価格文字列を数値に変換
   */
  private normalizePrice(value: string): number {
    const cleaned = value.replace(/[,¥円]/g, '').trim()
    return parseFloat(cleaned) || 0
  }
}
