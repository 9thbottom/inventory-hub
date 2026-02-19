import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * オークション名で商品を一括削除
 */
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const auctionName = searchParams.get('auctionName')

    if (!auctionName) {
      return NextResponse.json(
        { error: 'auctionNameパラメータが必要です' },
        { status: 400 }
      )
    }

    // 該当する商品を削除
    const result = await prisma.product.deleteMany({
      where: {
        auctionName,
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `${result.count}件の商品を削除しました`,
    })
  } catch (error) {
    console.error('商品削除エラー:', error)
    return NextResponse.json(
      { error: '商品の削除に失敗しました' },
      { status: 500 }
    )
  }
}
