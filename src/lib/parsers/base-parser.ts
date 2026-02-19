export interface ParserConfig {
  type: 'csv' | 'pdf' | 'excel'
  encoding?: string
  mapping?: Record<string, string>
  rules?: any
}

export interface ParsedProduct {
  productId: string
  name: string
  description?: string
  purchasePrice: number
  brand?: string
  rank?: string
  genre?: string
  quantity?: number
  commission?: number
  metadata?: Record<string, any>
  [key: string]: any
}

export abstract class BaseParser {
  abstract parse(fileBuffer: Buffer, config: ParserConfig): Promise<ParsedProduct[]>
  
  protected normalizePrice(value: any): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      // カンマや円記号を削除して数値に変換
      const cleaned = value.replace(/[,¥円]/g, '').trim()
      return parseFloat(cleaned) || 0
    }
    return 0
  }

}
