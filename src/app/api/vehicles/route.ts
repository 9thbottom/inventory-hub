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

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          supplier: true,
        },
        orderBy: { productId: 'asc' }, // 商品ID順（元のCSVと合わせる）
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ])

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
