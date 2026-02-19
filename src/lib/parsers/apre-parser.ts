import pdf from 'pdf-parse'
import { BaseParser, ParserConfig, ParsedProduct } from './base-parser'

/**
 * Apre（アプレ）専用パーサー
 * PDFから落札明細を解析
 */
export class ApreParser extends BaseParser {
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
        console.warn('Apre PDF: 商品データが見つかりませんでした')
      }

      return products
    } catch (error) {
      console.error('Apre PDFパースエラー:', error)
      throw new Error(`Apre PDFファイルの解析に失敗しました: ${error}`)
    }
  }

  /**
   * PDFテキストから商品情報を抽出
   */
  private extractProducts(text: string): ParsedProduct[] {
    const products: ParsedProduct[] = []
    const lines = text.split('\n')

    // 「株式会社アプレ」の後から商品データが始まる
    const startIndex = lines.findIndex(line => line.includes('株式会社アプレ'))
    if (startIndex === -1) {
      console.warn('Apre PDF: 開始マーカー「株式会社アプレ」が見つかりません。PDFフォーマットが異なる可能性があります。')
      return products
    }

    let i = startIndex + 1

    while (i < lines.length) {
      const line = lines[i].trim()

      // 手数料の行を検出（カンマ区切りの数字）
      if (/^\d{1,3}(?:,\d{3})*$/.test(line)) {
        const commission = line

        // 次の4行を取得: 行番、箱番、No+金額、品名
        if (i + 4 < lines.length) {
          const rowNumber = lines[i + 1].trim()
          const boxNumber = lines[i + 2].trim()
          const noAndPrice = lines[i + 3].trim()

          // 箱番号が3桁の数字であることを確認
          if (/^\d{3}$/.test(boxNumber) && /^\d+$/.test(rowNumber)) {
            // No+金額を分離
            const { no, price } = this.parseNoAndPrice(noAndPrice)

            if (no && price) {
              // 品名を取得（次の行から、次の手数料行まで）
              const { name, accessories, nextIndex } = this.extractName(lines, i + 4)

              if (name) {
                // ブランド名を商品名から抽出（最初の単語をブランドとみなす）
                const brandMatch = name.match(/^([^\s　]+)/)
                const brand = brandMatch ? brandMatch[1] : undefined

                products.push({
                  productId: `${boxNumber}-${rowNumber}`,
                  boxNumber,
                  rowNumber,
                  originalProductId: no,
                  name,
                  purchasePrice: this.normalizePrice(price),
                  quantity: 1, // PDFには数量フィールドがないため1とする
                  commission: this.normalizePrice(commission),
                  brand,
                  metadata: {
                    no,
                    accessories,
                    boxNumber,
                    rowNumber,
                  },
                })
              }

              i = nextIndex
              continue
            }
          }
        }
      }

      i++
    }

    return products
  }

  /**
   * No+金額の文字列を分離
   * 例: "1121,000" -> { no: "1", price: "21,000" }
   */
  private parseNoAndPrice(noAndPrice: string): { no: string; price: string } {
    // パターン1: 1-2桁のNo + カンマ区切りの金額
    // 例: "1121,000" -> No=1, 金額=121,000 または No=11, 金額=21,000
    
    // 最初の1桁または2桁をNoとして試す
    // 金額は通常3桁ごとにカンマが入るため、残りの部分が妥当な金額形式かチェック
    
    // 1桁のNoを試す
    if (noAndPrice.length > 1) {
      const no1 = noAndPrice.substring(0, 1)
      const price1 = noAndPrice.substring(1)
      
      // 金額が妥当な形式か（数字とカンマのみ、適切な桁数）
      if (/^\d{1,3}(?:,\d{3})*$/.test(price1)) {
        return { no: no1, price: price1 }
      }
    }
    
    // 2桁のNoを試す
    if (noAndPrice.length > 2) {
      const no2 = noAndPrice.substring(0, 2)
      const price2 = noAndPrice.substring(2)
      
      if (/^\d{1,3}(?:,\d{3})*$/.test(price2)) {
        return { no: no2, price: price2 }
      }
    }

    // どちらも該当しない場合、全体を金額として扱う
    return { no: '0', price: noAndPrice }
  }

  /**
   * 品名と付属品を抽出
   */
  private extractName(
    lines: string[],
    startIndex: number
  ): { name: string; accessories?: string; nextIndex: number } {
    const nameLines: string[] = []
    let accessories: string | undefined
    let j = startIndex

    while (j < lines.length) {
      const nextLine = lines[j].trim()

      // 次の商品の手数料行を検出
      if (/^\d{1,3}(?:,\d{3})*$/.test(nextLine)) {
        break
      }

      // 付属品を検出
      if (/^(錠|箱|シール|タグなし)$/.test(nextLine)) {
        accessories = nextLine
        j++
        break
      }

      // 不要な行をスキップ
      if (
        nextLine &&
        !this.isSkipLine(nextLine) &&
        !/^\d+$/.test(nextLine) // 単独の数字行をスキップ
      ) {
        nameLines.push(nextLine)
      }

      j++
    }

    const name = nameLines.join(' ').trim()
    return { name, accessories, nextIndex: j }
  }

  /**
   * スキップすべき行かどうかを判定
   */
  private isSkipLine(line: string): boolean {
    const skipPatterns = [
      'ページ',
      '開催日',
      '落札計',
      '手数料計',
      '総計',
      'ナインスボトム',
      '金      額',
      '株式会社アプレ',
      '登録番号',
      'T8030001037849',
      '落 札 明 細',
      '消費税',
      'ブランド',
      '箱番',
      '行番',
      '手数料付属品',
      '品           名',
      '数量No',
      '落札(10%対象)',
      '手数料(10%対象)',
    ]

    return skipPatterns.some(pattern => line.includes(pattern))
  }
}
