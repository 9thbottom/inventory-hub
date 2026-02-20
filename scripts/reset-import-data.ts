import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('商品データとインポートログをリセットします...')

  // 商品データを削除（Documentも連鎖削除される）
  const deletedProducts = await prisma.product.deleteMany({})
  console.log(`✅ ${deletedProducts.count}件の商品を削除しました`)

  // インポートログを削除
  const deletedLogs = await prisma.importLog.deleteMany({})
  console.log(`✅ ${deletedLogs.count}件のインポートログを削除しました`)

  // DriveFolderのステータスをリセット
  const updatedFolders = await prisma.driveFolder.updateMany({
    data: {
      status: 'pending',
      lastSyncedAt: null,
    },
  })
  console.log(`✅ ${updatedFolders.count}件のフォルダステータスをリセットしました`)

  // Documentを削除
  const deletedDocuments = await prisma.document.deleteMany({})
  console.log(`✅ ${deletedDocuments.count}件のドキュメントを削除しました`)

  console.log('\n✨ リセット完了！業者情報は保持されています。')
}

main()
  .catch((e) => {
    console.error('エラー:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
