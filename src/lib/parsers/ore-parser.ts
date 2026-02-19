import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import path from 'path'
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

      // pdfjs-distを使用してPDFからテキストを抽出
      const text = await this.extractTextWithPdfjs(fileBuffer)

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
   * pdfjs-distを使用してPDFからテキストを抽出
   */
  private async extractTextWithPdfjs(fileBuffer: Buffer): Promise<string> {
    try {
      // CMapの設定（日本語フォント対応）
      const cMapUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/')
      
      // PDFドキュメントを読み込む
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBuffer),
        useSystemFonts: true,
        cMapUrl: cMapUrl,
        cMapPacked: true,
      })
      
      const pdfDocument = await loadingTask.promise
      let fullText = ''
      
      // 全ページのテキストを抽出
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum)
        const textContent = await page.getTextContent()
        
        // テキストアイテムを結合
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
        
        fullText += pageText + '\n'
      }
      
      return fullText
    } catch (error) {
      console.error('pdfjs-distでのテキスト抽出エラー:', error)
      throw error
    }
  }

  /**
   * PDFテキストから商品情報を抽出
   */
  private extractProducts(text: string): ParsedProduct[] {
    const products: ParsedProduct[] = []

    // 「【買い明細】」の後から商品データが始まる
    const startMarker = '【買い明細】'
    const startIndex = text.indexOf(startMarker)
    if (startIndex === -1) {
      console.warn('Ore PDF: 開始マーカー「【買い明細】」が見つかりません')
      return products
    }

    // 開始マーカー以降のテキストを取得
    const dataSection = text.substring(startIndex + startMarker.length)
    
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
      const name = match[3].trim()
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

    console.log(`${products.length}件の商品を抽出`)
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
