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
  
  // 丸め設定
  roundingConfig?: {
    // 計算タイミング
    // 'per_item': 商品ごとに税込計算して丸める
    // 'subtotal': 商品合計、手数料合計を個別に丸めてから合算
    // 'total': 全てを合算してから最後に1回だけ丸める（デフォルト）
    calculationType: 'per_item' | 'subtotal' | 'total'
    
    // 丸めモード
    // 'floor': 切り捨て（デフォルト）
    // 'ceil': 切り上げ
    // 'round': 四捨五入
    roundingMode: 'floor' | 'ceil' | 'round'
  }
}

/**
 * 丸め処理を実行
 */
export function applyRounding(value: number, mode: 'floor' | 'ceil' | 'round'): number {
  switch (mode) {
    case 'floor':
      return Math.floor(value)
    case 'ceil':
      return Math.ceil(value)
    case 'round':
      return Math.round(value)
    default:
      return Math.floor(value)
  }
}

/**
 * 業者設定に基づいて請求額を計算
 *
 * @param products 商品リスト
 * @param config 業者設定
 * @param participationFee 参加費
 * @param participationFeeTaxType 参加費の税設定
 * @param shippingFee 送料
 * @param shippingFeeTaxType 送料の税設定
 * @returns 計算された請求額
 */
export function calculateInvoiceAmount(
  products: Array<{ purchasePrice: number; commission: number }>,
  config: SupplierConfig,
  participationFee: number,
  participationFeeTaxType: 'included' | 'excluded',
  shippingFee: number,
  shippingFeeTaxType: 'included' | 'excluded'
): number {
  const taxRate = config.taxRate ?? 0.1
  const roundingConfig = config.roundingConfig || {
    calculationType: 'total',
    roundingMode: 'floor'
  }
  
  const { calculationType, roundingMode } = roundingConfig
  
  // 計算タイプによって処理を分岐
  if (calculationType === 'per_item') {
    // 商品ごとに計算
    let total = 0
    
    for (const product of products) {
      let itemPrice = product.purchasePrice
      let itemCommission = product.commission || 0
      
      // 税込変換 + 丸め
      if (config.productPriceTaxType === 'excluded') {
        itemPrice = applyRounding(itemPrice * (1 + taxRate), roundingMode)
      }
      if (config.commissionTaxType === 'excluded') {
        itemCommission = applyRounding(itemCommission * (1 + taxRate), roundingMode)
      }
      
      total += itemPrice + itemCommission
    }
    
    // 参加費・送料
    let participationFeeWithTax = participationFee
    if (participationFeeTaxType === 'excluded') {
      participationFeeWithTax = applyRounding(participationFee * (1 + taxRate), roundingMode)
    }
    
    let shippingFeeWithTax = shippingFee
    if (shippingFeeTaxType === 'excluded') {
      shippingFeeWithTax = applyRounding(shippingFee * (1 + taxRate), roundingMode)
    }
    
    return applyRounding(total + participationFeeWithTax + shippingFeeWithTax, roundingMode)
    
  } else if (calculationType === 'subtotal') {
    // 小計ごとに計算
    let productSubtotal = 0
    let commissionSubtotal = 0
    
    for (const product of products) {
      productSubtotal += product.purchasePrice
      commissionSubtotal += product.commission || 0
    }
    
    // 小計ごとに税込変換 + 丸め
    if (config.productPriceTaxType === 'excluded') {
      productSubtotal = applyRounding(productSubtotal * (1 + taxRate), roundingMode)
    }
    if (config.commissionTaxType === 'excluded') {
      commissionSubtotal = applyRounding(commissionSubtotal * (1 + taxRate), roundingMode)
    }
    
    // 参加費・送料
    let participationFeeWithTax = participationFee
    if (participationFeeTaxType === 'excluded') {
      participationFeeWithTax = applyRounding(participationFee * (1 + taxRate), roundingMode)
    }
    
    let shippingFeeWithTax = shippingFee
    if (shippingFeeTaxType === 'excluded') {
      shippingFeeWithTax = applyRounding(shippingFee * (1 + taxRate), roundingMode)
    }
    
    return applyRounding(
      productSubtotal + commissionSubtotal + participationFeeWithTax + shippingFeeWithTax,
      roundingMode
    )
    
  } else {
    // 'total': 合計してから計算（デフォルト）
    let productSubtotal = 0
    let commissionSubtotal = 0
    
    for (const product of products) {
      productSubtotal += product.purchasePrice
      commissionSubtotal += product.commission || 0
    }
    
    // 税込変換（丸めない）
    if (config.productPriceTaxType === 'excluded') {
      productSubtotal *= (1 + taxRate)
    }
    if (config.commissionTaxType === 'excluded') {
      commissionSubtotal *= (1 + taxRate)
    }
    
    // 参加費・送料
    let participationFeeWithTax = participationFee
    if (participationFeeTaxType === 'excluded') {
      participationFeeWithTax *= (1 + taxRate)
    }
    
    let shippingFeeWithTax = shippingFee
    if (shippingFeeTaxType === 'excluded') {
      shippingFeeWithTax *= (1 + taxRate)
    }
    
    // 最後に1回だけ丸める
    return applyRounding(
      productSubtotal + commissionSubtotal + participationFeeWithTax + shippingFeeWithTax,
      roundingMode
    )
  }
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
   * @deprecated 新しい calculateInvoiceAmount 関数を使用してください
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
