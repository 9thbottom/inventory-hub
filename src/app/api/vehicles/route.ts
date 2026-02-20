import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

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
