import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('フォルダステータスをリセットします...')

  // 処理中またはエラー状態のフォルダをpendingに戻す
  const updated = await prisma.driveFolder.updateMany({
    where: {
      OR: [
        { status: 'processing' },
        { status: 'error' },
      ],
    },
    data: {
      status: 'pending',
    },
  })

  console.log(`✅ ${updated.count}件のフォルダステータスをリセットしました`)
}

main()
  .catch((e) => {
    console.error('エラー:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
