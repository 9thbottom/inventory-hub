import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const auctionName = searchParams.get('auctionName')

    if (!auctionName) {
      return NextResponse.json({ error: 'auctionNameが必要です' }, { status: 400 })
    }

    // folderPathに auctionName が含まれるレコードを検索
    const importLog = await prisma.importLog.findFirst({
      where: {
        folderPath: {
          endsWith: auctionName,
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      select: {
        id: true,
        folderPath: true,
        invoiceAmount: true,
        systemAmount: true,
        amountDifference: true,
        hasAmountMismatch: true,
        startedAt: true,
      },
    })

    return NextResponse.json(importLog)
  } catch (error) {
    console.error('ImportLog取得エラー:', error)
    return NextResponse.json(
      { error: 'ImportLogの取得に失敗しました' },
      { status: 500 }
    )
  }
}
