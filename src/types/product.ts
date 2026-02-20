export interface Product {
  id: string
  productId: string
  boxNumber?: string
  rowNumber?: string
  name: string
  description?: string
  purchasePrice: number
  commission?: number
  status: string
  auctionName?: string
  supplier: {
    name: string
    parserConfig?: {
      productPriceTaxType?: 'included' | 'excluded'
      commissionTaxType?: 'included' | 'excluded'
      taxRate?: number
      participationFee?: {
        amount: number
        taxType: 'included' | 'excluded'
      }
      shippingFee?: {
        amount: number
        taxType: 'included' | 'excluded'
      }
    }
  }
  createdAt: string
}

export interface ImportLog {
  id: string
  folderPath: string
  invoiceAmount: number | null
  systemAmount: number | null
  amountDifference: number | null
  hasAmountMismatch: boolean
  participationFee: number | null
  participationFeeTaxType: string | null
  shippingFee: number | null
  shippingFeeTaxType: string | null
  startedAt: string
}

export interface EditProductData {
  productId: string
  name: string
  purchasePrice: number
  commission: number
}

export interface EditAuctionFeesData {
  participationFee: number | null
  participationFeeTaxType: 'included' | 'excluded'
  shippingFee: number | null
  shippingFeeTaxType: 'included' | 'excluded'
}
