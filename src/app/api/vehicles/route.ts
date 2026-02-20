import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * 商品一覧を取得
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')
    const supplierId = searchParams.get('supplierId')
    const search = searchParams.get('search')

    const where: any = {}

    if (status) {
      where.status = status
    }

    if (supplierId) {
      where.supplierId = supplierId
    }

    if (search) {
      where.OR = [
        { productId: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [allProducts, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              code: true,
              parserConfig: true,
            },
          },
        },
        // ページネーション前に全件取得してソート
      }),
      prisma.product.count({ where }),
    ])

    // 箱番号と行番号、または商品IDを数値としてソート
    const sortedProducts = allProducts.sort((a: any, b: any) => {
      // 箱番号がある場合は箱番号と行番号でソート
      if (a.boxNumber || b.boxNumber) {
        const boxA = parseInt(a.boxNumber || '0')
        const boxB = parseInt(b.boxNumber || '0')
        
        if (boxA !== boxB) {
          return boxA - boxB
        }
        
        const rowA = parseInt(a.rowNumber || '0')
        const rowB = parseInt(b.rowNumber || '0')
        
        return rowA - rowB
      }
      
      // 箱番号がない場合は商品IDでソート（RevaAucなど）
      const idA = parseInt(a.productId || '0')
      const idB = parseInt(b.productId || '0')
      
      return idA - idB
    })

    // ページネーション適用
    const startIndex = (page - 1) * limit
    const products = sortedProducts.slice(startIndex, startIndex + limit)

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('商品一覧取得エラー:', error)
    return NextResponse.json(
      { error: '商品一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

/**
 * 商品を新規作成
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { productId, name, purchasePrice, commission, supplierId, auctionName } = body

    // 必須フィールドのバリデーション
    if (!productId || !name || purchasePrice === undefined || !supplierId || !auctionName) {
      return NextResponse.json(
        { error: '必須フィールドが不足しています' },
        { status: 400 }
      )
    }

    // 商品IDの重複チェック
    const existing = await prisma.product.findUnique({
      where: { productId },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'この商品IDは既に使用されています' },
        { status: 400 }
      )
    }

    // 業者の存在確認
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: '指定された業者が見つかりません' },
        { status: 404 }
      )
    }

    // 商品を作成
    const product = await prisma.product.create({
      data: {
        productId,
        name,
        purchasePrice: new Decimal(purchasePrice),
        commission: commission !== undefined && commission !== null ? new Decimal(commission) : null,
        supplierId,
        auctionName,
        status: 'in_stock',
      },
      include: {
        supplier: true,
      },
    })

    // ImportLogのsystemAmountを再計算
    const importLog = await prisma.importLog.findFirst({
      where: {
        folderPath: {
          endsWith: auctionName,
        },
      },
    })

    if (importLog) {
      // 同じオークションの全商品を取得
      const products = await prisma.product.findMany({
        where: { auctionName },
        include: {
          supplier: true,
        },
      })

      if (products.length > 0) {
        const supplierConfig = supplier.parserConfig as any
        const taxRate = supplierConfig?.taxRate || 0.1

        // 商品合計と手数料合計を計算
        let productTotal = 0
        let commissionTotal = 0

        products.forEach((p: any) => {
          productTotal += Number(p.purchasePrice)
          commissionTotal += Number(p.commission || 0)
        })

        // 税込に変換
        if (supplierConfig?.productPriceTaxType === 'excluded') {
          productTotal *= (1 + taxRate)
        }
        if (supplierConfig?.commissionTaxType === 'excluded') {
          commissionTotal *= (1 + taxRate)
        }

        // 参加費: ImportLogの値 → 業者設定の順で取得
        let participationFeeAmount = 0
        let participationFeeTax = 'included'

        if (importLog.participationFee !== null) {
          participationFeeAmount = Number(importLog.participationFee)
          participationFeeTax = importLog.participationFeeTaxType || 'included'
        } else if (supplierConfig?.participationFee) {
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
        } else if (supplierConfig?.shippingFee) {
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

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('商品作成エラー:', error)
    return NextResponse.json(
      { error: '商品の作成に失敗しました' },
      { status: 500 }
    )
  }
}
