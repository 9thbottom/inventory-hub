import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * ImportLogを取得
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const { id } = await params

    const importLog = await prisma.importLog.findUnique({
      where: { id },
    })

    if (!importLog) {
      return NextResponse.json(
        { error: 'ImportLogが見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(importLog)
  } catch (error) {
    console.error('ImportLog取得エラー:', error)
    return NextResponse.json(
      { error: 'ImportLogの取得に失敗しました' },
      { status: 500 }
    )
  }
}

/**
 * ImportLogを更新（参加費・送料の編集）
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { 
      participationFee, 
      participationFeeTaxType, 
      shippingFee, 
      shippingFeeTaxType 
    } = body

    // ImportLogの存在確認
    const existing = await prisma.importLog.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'ImportLogが見つかりません' },
        { status: 404 }
      )
    }

    // 更新データの準備
    const updateData: any = {}
    
    if (participationFee !== undefined) {
      updateData.participationFee = participationFee !== null ? new Decimal(participationFee) : null
    }
    if (participationFeeTaxType !== undefined) {
      updateData.participationFeeTaxType = participationFeeTaxType
    }
    if (shippingFee !== undefined) {
      updateData.shippingFee = shippingFee !== null ? new Decimal(shippingFee) : null
    }
    if (shippingFeeTaxType !== undefined) {
      updateData.shippingFeeTaxType = shippingFeeTaxType
    }

    // ImportLogを更新
    const importLog = await prisma.importLog.update({
      where: { id },
      data: updateData,
    })

    // systemAmountを再計算
    // folderPathからauctionNameを取得して、関連する商品と業者設定を取得
    const folderPath = importLog.folderPath
    const auctionName = folderPath.split('/').pop() || ''

    // 商品データを取得
    const products = await prisma.product.findMany({
      where: { auctionName },
      include: {
        supplier: true,
      },
    })

    if (products.length > 0) {
      const supplier = products[0].supplier
      const supplierConfig = supplier.parserConfig as any
      const taxRate = supplierConfig.taxRate || 0.1

      // 商品合計と手数料合計を計算
      let productTotal = 0
      let commissionTotal = 0

      products.forEach((product: any) => {
        productTotal += Number(product.purchasePrice)
        commissionTotal += Number(product.commission || 0)
      })

      // 税込に変換
      if (supplierConfig.productPriceTaxType === 'excluded') {
        productTotal *= (1 + taxRate)
      }
      if (supplierConfig.commissionTaxType === 'excluded') {
        commissionTotal *= (1 + taxRate)
      }

      // 参加費: ImportLogの値 → 業者設定の順で取得
      let participationFeeAmount = 0
      let participationFeeTax = 'included'

      if (importLog.participationFee !== null) {
        participationFeeAmount = Number(importLog.participationFee)
        participationFeeTax = importLog.participationFeeTaxType || 'included'
      } else if (supplierConfig.participationFee) {
        participationFeeAmount = supplierConfig.participationFee.amount
        participationFeeTax = supplierConfig.participationFee.taxType
      }

      if (participationFeeTax === 'excluded') {
        participationFeeAmount *= (1 + taxRate)
      }

      // 送料: ImportLogの値 → 業者設定の順で取得
      let shippingFeeAmount = 0
      let shippingFeeTax = 'included'

      if (importLog.shippingFee !== null) {
        shippingFeeAmount = Number(importLog.shippingFee)
        shippingFeeTax = importLog.shippingFeeTaxType || 'included'
      } else if (supplierConfig.shippingFee) {
        shippingFeeAmount = supplierConfig.shippingFee.amount
        shippingFeeTax = supplierConfig.shippingFee.taxType
      }

      if (shippingFeeTax === 'excluded') {
        shippingFeeAmount *= (1 + taxRate)
      }

      // システム計算額を更新
      const systemAmount = Math.floor(productTotal + commissionTotal + participationFeeAmount + shippingFeeAmount)
      
      // 差額と不一致フラグを更新
      let amountDifference: number | null = null
      let hasAmountMismatch = false
      
      if (importLog.invoiceAmount !== null) {
        amountDifference = Math.abs(Number(importLog.invoiceAmount) - systemAmount)
        hasAmountMismatch = amountDifference >= 1
      }

      // ImportLogを再度更新（NaNチェック）
      if (!isNaN(systemAmount) && isFinite(systemAmount)) {
        const updatedImportLog = await prisma.importLog.update({
          where: { id },
          data: {
            systemAmount: new Decimal(systemAmount),
            amountDifference: amountDifference !== null && !isNaN(amountDifference) ? new Decimal(amountDifference) : null,
            hasAmountMismatch,
          },
        })

        return NextResponse.json(updatedImportLog)
      }
    }

    return NextResponse.json(importLog)
  } catch (error) {
    console.error('ImportLog更新エラー:', error)
    return NextResponse.json(
      { error: 'ImportLogの更新に失敗しました' },
      { status: 500 }
    )
  }
}
