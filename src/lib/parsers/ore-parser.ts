import { BaseParser, ParserConfig, ParsedProduct } from './base-parser'

/**
 * Ore（日本時計オークション）専用パーサー
 * PDFから御精算書の買い合計明細を解析
 */
export class OreParser extends BaseParser {
  /**
   * PDFバッファまたは抽出済みテキストから商品データを解析
   */
  async parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParsedProduct[]> {
    try {
      let text: string

      // 文字列が渡された場合は、既に抽出済みのテキストとして扱う
      if (typeof fileBuffer === 'string') {
        text = fileBuffer
      } else {
        // Bufferの場合は、サーバーサイドでの処理（現在は未対応）
        throw new Error('Ore PDFはクライアントサイドでテキスト抽出が必要です')
      }

      if (!text || text.trim().length === 0) {
        throw new Error('テキストが空です')
      }

      // 商品データを抽出
      const products = this.extractProducts(text)

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

    // 「【買い明細】」または「通番号」マーカーを探す
    let startIndex = text.indexOf('【買い明細】')
    if (startIndex === -1) {
      startIndex = text.indexOf('通番号')
      if (startIndex === -1) {
        return products
      }
    }

    // 開始マーカー以降のテキストを取得
    const dataSection = text.substring(startIndex)
    
    // 終了マーカーまでのテキストを取得
    const endMarker = '買い合計件数'
    const endIndex = dataSection.indexOf(endMarker)
    const productSection = endIndex !== -1 ? dataSection.substring(0, endIndex) : dataSection

    // 商品行のパターン: "1618   18   ｸﾘｽﾁｬﾝﾃﾞｨｵｰﾙ ｼｮﾙﾀﾞｰ   -18,000   -2,430 -13.5%"
    // 通番号(4桁) 商品番号(1-2桁) 商品名 落札金額 手数料 料率
    const productPattern = /(\d{4})\s+(\d{1,2})\s+(.+?)\s+-\s*([\d,]+)\s+-\s*([\d,]+)\s+-13\.5%/g

    let match
    while ((match = productPattern.exec(productSection)) !== null) {
      const serialNo = match[1]
      const productNo = match[2]
      const rawName = match[3].trim()
      // 半角カタカナを全角カタカナに変換
      const name = this.convertHalfWidthToFullWidth(rawName)
      const price = match[4]
      const commission = match[5]

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

  /**
   * 半角カタカナを全角カタカナに変換
   */
  private convertHalfWidthToFullWidth(str: string): string {
    const halfWidthKana = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｬｭｮｯｰﾞﾟ'
    const fullWidthKana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォャュョッー゛゜'
    
    let result = ''
    for (let i = 0; i < str.length; i++) {
      const char = str[i]
      const index = halfWidthKana.indexOf(char)
      
      if (index !== -1) {
        const fullChar = fullWidthKana[index]
        
        // 濁点・半濁点の処理
        if (i + 1 < str.length) {
          const nextChar = str[i + 1]
          if (nextChar === 'ﾞ') {
            // 濁点
            const dakutenMap: { [key: string]: string } = {
              'カ': 'ガ', 'キ': 'ギ', 'ク': 'グ', 'ケ': 'ゲ', 'コ': 'ゴ',
              'サ': 'ザ', 'シ': 'ジ', 'ス': 'ズ', 'セ': 'ゼ', 'ソ': 'ゾ',
              'タ': 'ダ', 'チ': 'ヂ', 'ツ': 'ヅ', 'テ': 'デ', 'ト': 'ド',
              'ハ': 'バ', 'ヒ': 'ビ', 'フ': 'ブ', 'ヘ': 'ベ', 'ホ': 'ボ',
              'ウ': 'ヴ'
            }
            result += dakutenMap[fullChar] || fullChar
            i++ // 濁点をスキップ
            continue
          } else if (nextChar === 'ﾟ') {
            // 半濁点
            const handakutenMap: { [key: string]: string } = {
              'ハ': 'パ', 'ヒ': 'ピ', 'フ': 'プ', 'ヘ': 'ペ', 'ホ': 'ポ'
            }
            result += handakutenMap[fullChar] || fullChar
            i++ // 半濁点をスキップ
            continue
          }
        }
        
        result += fullChar
      } else {
        result += char
      }
    }
    
    return result
  }
}
