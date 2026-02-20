import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * 商品情報を取得
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

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        supplier: true,
      },
    })

    if (!product) {
      return NextResponse.json(
        { error: '商品が見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('商品取得エラー:', error)
    return NextResponse.json(
      { error: '商品の取得に失敗しました' },
      { status: 500 }
    )
  }
}

/**
 * 商品情報を更新
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
    const { productId, name, purchasePrice, commission } = body

    // 商品の存在確認
    const existing = await prisma.product.findUnique({
      where: { id },
      include: {
        supplier: true,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '商品が見つかりません' },
        { status: 404 }
      )
    }

    // productIdが変更される場合、重複チェック
    if (productId && productId !== existing.productId) {
      const duplicate = await prisma.product.findUnique({
        where: { productId },
      })

      if (duplicate) {
        return NextResponse.json(
          { error: 'この商品IDは既に使用されています' },
          { status: 400 }
        )
      }
    }

    // 更新データの準備
    const updateData: any = {}
    
    if (productId !== undefined) {
      updateData.productId = productId
    }
    if (name !== undefined) {
      updateData.name = name
    }
    if (purchasePrice !== undefined) {
      updateData.purchasePrice = new Decimal(purchasePrice)
    }
    if (commission !== undefined) {
      updateData.commission = commission !== null ? new Decimal(commission) : null
    }

    // 商品を更新
    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        supplier: true,
      },
    })

    // 関連するImportLogのsystemAmountを再計算
    if (existing.auctionName && (purchasePrice !== undefined || commission !== undefined)) {
      const importLog = await prisma.importLog.findFirst({
        where: {
          folderPath: {
            endsWith: existing.auctionName,
          },
        },
      })

      if (importLog) {
        // 同じオークションの全商品を取得
        const products = await prisma.product.findMany({
          where: { auctionName: existing.auctionName },
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

          products.forEach((p: any) => {
            productTotal += Number(p.purchasePrice)
            commissionTotal += Number(p.commission || 0)
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

          // ImportLogを更新（NaNチェック）
          if (!isNaN(systemAmount) && isFinite(systemAmount)) {
            await prisma.importLog.update({
              where: { id: importLog.id },
              data: {
                systemAmount: new Decimal(systemAmount),
                amountDifference: amountDifference !== null && !isNaN(amountDifference) ? new Decimal(amountDifference) : null,
                hasAmountMismatch,
              },
            })
          }
        }
      }
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('商品更新エラー:', error)
    return NextResponse.json(
      { error: '商品の更新に失敗しました' },
      { status: 500 }
    )
  }
}

/**
 * 商品を削除
 */
export async function DELETE(
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

    // 商品の存在確認
    const existing = await prisma.product.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '商品が見つかりません' },
        { status: 404 }
      )
    }

    // 商品を削除
    await prisma.product.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('商品削除エラー:', error)
    return NextResponse.json(
      { error: '商品の削除に失敗しました' },
      { status: 500 }
    )
  }
}
