import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * 業者情報を取得
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

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: '業者が見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(supplier)
  } catch (error) {
    console.error('業者取得エラー:', error)
    return NextResponse.json(
      { error: '業者の取得に失敗しました' },
      { status: 500 }
    )
  }
}

/**
 * 業者情報を更新
 */
export async function PUT(
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
    const { name, code, parserConfig, isActive } = body

    // 業者の存在確認
    const existing = await prisma.supplier.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '業者が見つかりません' },
        { status: 404 }
      )
    }

    // 業者情報を更新
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(parserConfig !== undefined && { parserConfig }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json(supplier)
  } catch (error) {
    console.error('業者更新エラー:', error)
    return NextResponse.json(
      { error: '業者の更新に失敗しました' },
      { status: 500 }
    )
  }
}

/**
 * 業者を削除
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

    // 業者の存在確認
    const existing = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: '業者が見つかりません' },
        { status: 404 }
      )
    }

    // 商品が紐付いている場合は削除不可
    if (existing._count.products > 0) {
      return NextResponse.json(
        { error: `この業者には${existing._count.products}件の商品が紐付いています。削除できません。` },
        { status: 400 }
      )
    }

    // 業者を削除
    await prisma.supplier.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('業者削除エラー:', error)
    return NextResponse.json(
      { error: '業者の削除に失敗しました' },
      { status: 500 }
    )
  }
}
