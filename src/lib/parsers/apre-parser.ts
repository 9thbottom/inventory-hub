import pdf from 'pdf-parse'
import { BaseParser, ParserConfig, ParsedProduct, ParseResult, InvoiceSummary } from './base-parser'

/**
 * Apre（アプレ）専用パーサー
 * PDFから落札明細を解析
 */
export class ApreParser extends BaseParser {
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParseResult> {
    try {
      // 文字列の場合はエラー（ApreはBuffer必須）
      if (typeof fileBuffer === 'string') {
        throw new Error('Apre PDFはBufferが必要です')
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
        console.warn('Apre PDF: 商品データが見つかりませんでした')
      }

      // 請求書のサマリー情報を抽出
      const invoiceSummary = this.extractInvoiceSummary(text)

      return {
        products,
        invoiceSummary,
      }
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
    let previousNo = 0 // 前の商品のNo

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
            // No+金額を分離（前のNoを渡す）
            const { no, price } = this.parseNoAndPrice(noAndPrice, previousNo)

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

                // 次の商品のために現在のNoを記憶
                previousNo = parseInt(no)
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
   * 数量+No+金額の文字列を分離
   * PDFのテキスト抽出では、数量(1桁) + No(1-2桁) + 金額(カンマ区切り)の形式で結合されている
   * 例: "125,000" -> 数量(1) + No(2) + 金額(5,000)
   * 例: "157,000" -> 数量(1) + No(5) + 金額(7,000)
   * 例: "1129,000" -> 数量(1) + No(12) + 金額(9,000)
   *
   * @param noAndPrice 数量+No+金額の文字列
   * @param previousNo 前の商品のNo（連番判定に使用）
   */
  private parseNoAndPrice(noAndPrice: string, previousNo: number = 0): { no: string; price: string } {
    // カンマの位置を見つける
    const commaIndex = noAndPrice.indexOf(',')
    
    if (commaIndex === -1) {
      // カンマがない場合は全体を金額として扱う
      return { no: '0', price: noAndPrice }
    }
    
    const beforeComma = noAndPrice.substring(0, commaIndex)
    const afterComma = noAndPrice.substring(commaIndex + 1)
    
    // カンマの後は必ず3桁
    if (afterComma.length !== 3 || !/^\d{3}$/.test(afterComma)) {
      // 不正な形式
      return { no: '0', price: noAndPrice }
    }
    
    // パターン: 数量(1桁) + No(1-2桁) + 金額
    // カンマの前の桁数に応じて分離
    if (beforeComma.length === 3) {
      // 3桁の場合: 数量(1) + No(1) + 金額の最初の1桁
      // 例: "125,000" -> 数量(1) + No(2) + 金額(5,000)
      const quantity = beforeComma.substring(0, 1)  // 常に1
      const no = beforeComma.substring(1, 2)
      const priceFirst = beforeComma.substring(2)
      const price = `${priceFirst},${afterComma}`
      return { no, price }
    } else if (beforeComma.length === 4) {
      // 4桁の場合: 2つのパターンがある
      // パターンA: 数量(1) + No(1桁) + 金額2桁 → 金額は XX,XXX形式
      // パターンB: 数量(1) + No(2桁) + 金額1桁 → 金額は X,XXX形式
      
      // 両方のパターンを試す
      const noA = parseInt(beforeComma.substring(1, 2))
      const noB = parseInt(beforeComma.substring(1, 3))
      
      // 前のNoから次のNoを推測
      const expectedNo = previousNo + 1
      
      // どちらのパターンが期待値に近いか判定
      const diffA = Math.abs(noA - expectedNo)
      const diffB = Math.abs(noB - expectedNo)
      
      if (diffB < diffA) {
        // パターンB: No=2桁, 金額=1桁
        // 例: "1129,000" -> No=12, 金額=9,000
        const quantity = beforeComma.substring(0, 1)
        const no = beforeComma.substring(1, 3)
        const priceFirst = beforeComma.substring(3)
        const price = `${priceFirst},${afterComma}`
        return { no, price }
      } else {
        // パターンA: No=1桁, 金額=2桁
        // 例: "1229,000" -> No=2, 金額=29,000
        const quantity = beforeComma.substring(0, 1)
        const no = beforeComma.substring(1, 2)
        const priceFirst = beforeComma.substring(2)
        const price = `${priceFirst},${afterComma}`
        return { no, price }
      }
    } else if (beforeComma.length === 5) {
      // 5桁の場合: 数量(1) + No(2) + 金額の最初の2桁
      // 例: "11225,500" -> 数量(1) + No(12) + 金額(25,500)
      const quantity = beforeComma.substring(0, 1)  // 常に1
      const no = beforeComma.substring(1, 3)
      const priceFirst = beforeComma.substring(3)
      const price = `${priceFirst},${afterComma}`
      return { no, price }
    } else if (beforeComma.length === 6) {
      // 6桁の場合: 数量(1) + No(2) + 金額の最初の3桁
      // 例: "122100,000" -> 数量(1) + No(22) + 金額(100,000)
      const quantity = beforeComma.substring(0, 1)  // 常に1
      const no = beforeComma.substring(1, 3)
      const priceFirst = beforeComma.substring(3)
      const price = `${priceFirst},${afterComma}`
      return { no, price }
    } else if (beforeComma.length <= 2) {
      // 1-2桁の場合: Noはなく、全体が金額
      return { no: '0', price: noAndPrice }
    }
    
    // その他の場合は全体を金額として扱う
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

  /**
   * 請求書のサマリー情報を抽出
   * Apreの落札明細PDFから総計を抽出
   */
  private extractInvoiceSummary(text: string): InvoiceSummary | undefined {
    try {
      const lines = text.split('\n')
      
      // 「総計」行を探す
      // パターン: "総計 XXX,XXX XXX,XXX"
      // 最初の金額が落札計、2番目が手数料計
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        
        if (line.startsWith('総計')) {
          // 総計行から金額を抽出
          // 例: "総計 1,234,567 123,456"
          const amounts = line.replace('総計', '').trim().split(/\s+/)
          
          if (amounts.length >= 2) {
            const subtotal = this.normalizePrice(amounts[0]) // 落札計
            const commission = this.normalizePrice(amounts[1]) // 手数料計
            const totalAmount = subtotal + commission
            
            return {
              totalAmount,
              subtotal,
              metadata: {
                commission,
              },
            }
          }
        }
      }
      
      console.warn('Apre PDF: 総計が見つかりませんでした')
      return undefined
    } catch (error) {
      console.error('請求書サマリー抽出エラー:', error)
      return undefined
    }
  }
}
