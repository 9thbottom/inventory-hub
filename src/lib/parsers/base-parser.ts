export interface ParserConfig {
  type: 'csv' | 'pdf' | 'excel'
  encoding?: string
  mapping?: Record<string, string>
  rules?: any
}

export interface ParsedProduct {
  productId: string
  boxNumber?: string
  rowNumber?: string
  originalProductId?: string
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

/**
 * 請求書のサマリー情報
 */
export interface InvoiceSummary {
  totalAmount: number        // 請求書の最終請求額
  subtotal?: number          // 小計
  tax?: number              // 消費税
  participationFee?: number  // 参加費
  shippingFee?: number      // 送料
  otherFees?: number        // その他費用
  metadata?: Record<string, any> // 追加情報
}

/**
 * パース結果
 */
export interface ParseResult {
  products: ParsedProduct[]
  invoiceSummary?: InvoiceSummary
}

/**
 * 業者ごとの設定
 */
export interface SupplierConfig {
  // 商品代金の税設定
  productPriceTaxType: 'included' | 'excluded'  // 税込 or 税別
  
  // 手数料の税設定
  commissionTaxType: 'included' | 'excluded'
  
  // 参加費設定
  participationFee?: {
    amount: number
    taxType: 'included' | 'excluded'
  }
  
  // 送料設定
  shippingFee?: {
    amount: number
    taxType: 'included' | 'excluded'
  }
  
  // 消費税率
  taxRate: number  // 例: 0.1 (10%)
}

export abstract class BaseParser {
  abstract parse(fileBuffer: Buffer | string, config?: ParserConfig): Promise<ParsedProduct[] | ParseResult>
  
  protected normalizePrice(value: any): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      // カンマや円記号を削除して数値に変換
      const cleaned = value.replace(/[,¥円]/g, '').trim()
      return parseFloat(cleaned) || 0
    }
    return 0
  }

  /**
   * システム側で計算した請求額を算出
   */
  protected calculateSystemTotal(
    products: ParsedProduct[],
    config: SupplierConfig
  ): number {
    // 商品代金合計
    let productTotal = products.reduce((sum, p) => sum + p.purchasePrice, 0)
    if (config.productPriceTaxType === 'excluded') {
      productTotal *= (1 + config.taxRate)
    }
    
    // 手数料合計
    let commissionTotal = products.reduce((sum, p) => sum + (p.commission || 0), 0)
    if (config.commissionTaxType === 'excluded') {
      commissionTotal *= (1 + config.taxRate)
    }
    
    // 参加費
    let participationFee = config.participationFee?.amount || 0
    if (config.participationFee && config.participationFee.taxType === 'excluded') {
      participationFee *= (1 + config.taxRate)
    }
    
    // 送料
    let shippingFee = config.shippingFee?.amount || 0
    if (config.shippingFee && config.shippingFee.taxType === 'excluded') {
      shippingFee *= (1 + config.taxRate)
    }
    
    return Math.round(productTotal + commissionTotal + participationFee + shippingFee)
  }
}
