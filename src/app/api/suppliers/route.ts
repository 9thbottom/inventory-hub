import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * 業者一覧を取得
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })

    return NextResponse.json(suppliers)
  } catch (error) {
    console.error('業者一覧取得エラー:', error)
    return NextResponse.json(
      { error: '業者一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

/**
 * 業者を登録
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
    const { name, code, parserConfig } = body

    if (!name || !code) {
      return NextResponse.json(
        { error: '業者名とコードは必須です' },
        { status: 400 }
      )
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        code,
        parserConfig: parserConfig || {},
      },
    })

    return NextResponse.json(supplier)
  } catch (error) {
    console.error('業者登録エラー:', error)
    return NextResponse.json(
      { error: '業者の登録に失敗しました' },
      { status: 500 }
    )
  }
}
