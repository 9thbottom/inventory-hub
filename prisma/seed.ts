import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('シードデータを投入中...')

  // 大吉（Daikichi）業者を登録
  const daikichi = await prisma.supplier.upsert({
    where: { code: 'DAIKICHI' },
    update: {},
    create: {
      name: 'Daikichi',
      code: 'DAIKICHI',
      parserConfig: {
        type: 'csv',
        encoding: 'shift-jis',
        mapping: {
          productId: '商品番号',
          name: '商品名',
          purchasePrice: '商品単価（税別）',
          brand: 'ブランド',
          rank: 'ランク',
          genre: 'ジャンル',
          quantity: '数量',
          commission: '買い手数料（税別）',
        },
      },
      isActive: true,
    },
  })

  console.log('✓ Daikichi業者を登録:', daikichi.id)

  // おたからや（Otakaraya）業者を登録
  const otakaraya = await prisma.supplier.upsert({
    where: { code: 'OTAKARAYA' },
    update: {},
    create: {
      name: 'Otakaraya',
      code: 'OTAKARAYA',
      parserConfig: {
        type: 'csv',
        encoding: 'utf-8',
        mapping: {
          productId: '札番',
          name: '商品名',
          purchasePrice: '落札金額（税抜）',
          brand: 'ブランド',
          rank: 'ランク',
          genre: '商品ジャンル',
          line: 'ライン',
        },
      },
      isActive: true,
    },
  })

  console.log('✓ Otakaraya業者を登録:', otakaraya.id)

  // エコリング（Ecoring）業者を登録
  const ecoring = await prisma.supplier.upsert({
    where: { code: 'ECORING' },
    update: {},
    create: {
      name: 'Ecoring',
      code: 'ECORING',
      parserConfig: {
        type: 'csv',
        encoding: 'shift-jis',
        skipRows: 1, // 英語ヘッダーをスキップ
        mapping: {
          productId: '商品番号',
          name: '商品名',
          purchasePrice: '落札額',
          description: 'メモ',
        },
      },
      isActive: true,
    },
  })

  console.log('✓ Ecoring業者を登録:', ecoring.id)

  // アプレ（Apre）業者を登録
  const apre = await prisma.supplier.upsert({
    where: { code: 'APRE' },
    update: {},
    create: {
      name: 'Apre',
      code: 'APRE',
      parserConfig: {
        type: 'pdf',
        // PDF解析は今後実装
      },
      isActive: true,
    },
  })

  console.log('✓ Apre業者を登録:', apre.id)

  console.log('シードデータの投入が完了しました')
}

main()
  .catch((e) => {
    console.error('シードエラー:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
