# 請求書総額検証機能

## 概要

PDF請求書から抽出した総額と、システム側で計算した請求額を比較し、差異がある場合にユーザーに通知する機能です。

## 実装内容

### 1. データベーススキーマの拡張

#### ImportLogテーブル
```prisma
model ImportLog {
  // 既存フィールド...
  invoiceAmount     Decimal?    // PDF請求書の総額
  systemAmount      Decimal?    // システム計算の総額
  amountDifference  Decimal?    // 差額
  hasAmountMismatch Boolean     @default(false) // 金額不一致フラグ
}
```

### 2. パーサーの拡張

#### 新しい型定義
- `InvoiceSummary`: 請求書のサマリー情報（総額、小計、税額など）
- `ParseResult`: パース結果（商品リスト + 請求書サマリー）
- `SupplierConfig`: 業者ごとの設定（税設定、参加費、送料など）

#### 対応パーサー
- **ApreParser**: 落札明細PDFから「総計」を抽出
- **OreParser**: 御精算書から「買い合計金額」を抽出
- **RevaAucParser**: 精算書から「合計金額」を抽出
- **InvoicePdfParser**: CSV業者の請求書PDFから総額を抽出
  - **Daikichi**: 「合計XXX円」または「ご請求金額 XXX円」
  - **Otakaraya**: 「御請求金額 ￥XXX」
  - **EcoRing**: 「ご請求金額...¥XXX」

### 3. 業者設定機能

#### 設定項目
- **商品代金**: 税込 / 税別
- **手数料**: 税込 / 税別
- **消費税率**: 例: 10%
- **参加費**（任意）: 金額 + 税込/税別
- **送料**（任意）: 金額 + 税込/税別

#### API
- `GET /api/suppliers/[id]`: 業者情報取得
- `PUT /api/suppliers/[id]`: 業者設定更新
- `DELETE /api/suppliers/[id]`: 業者削除

#### UI
- `/suppliers`: 業者一覧（設定リンク追加）
- `/suppliers/[id]`: 業者詳細・設定画面

### 4. 請求額検証ロジック

#### 計算式
```typescript
システム請求額 = 商品代金合計 + 手数料合計 + 参加費 + 送料

// 各項目に税込/税別設定を適用
if (税別設定) {
  金額 *= (1 + 消費税率)
}
```

#### 検証
- 差額が1円以上の場合、不一致とみなす
- 不一致の場合、`hasAmountMismatch = true`
- 結果は`ImportLog`に記録

### 5. UI表示

#### インポート画面
インポート完了時にアラートで表示：

**一致の場合:**
```
✅ 請求額が一致しました

請求額: ¥1,234,567
```

**不一致の場合:**
```
⚠️ 請求額に差異があります

請求書: ¥1,234,567
システム: ¥1,234,000
差額: ¥567

内容を確認してください。
```

## 使用方法

### 1. 業者設定
1. `/suppliers`にアクセス
2. 対象業者の「設定」をクリック
3. 税設定、参加費、送料を入力
4. 「保存」をクリック

### 2. インポート
1. `/import`にアクセス
2. フォルダを選択して「取り込み」
3. 請求書総額が抽出された場合、自動的に検証
4. 結果がアラートで表示される

## 注意事項

### 業者設定が必要
請求額検証を行うには、事前に業者設定（`parserConfig`）が必要です。設定がない場合、検証はスキップされます。

### PDFフォーマット依存
請求書総額の抽出は、PDFのテキスト構造に依存します。業者ごとにPDFフォーマットが異なるため、各パーサーで適切な正規表現を設定する必要があります。

### 端数処理
消費税計算の端数処理により、1円程度の差異が発生する可能性があります。現在は1円以上の差異を不一致としています。

### ファイル構成
各業者のファイル構成は以下の通りです：

| 業者 | 商品リスト | 請求書 | 対応状況 |
|------|-----------|--------|---------|
| Daikichi | CSV | 別PDF | ✅ 対応済み |
| Otakaraya | CSV | 別PDF | ✅ 対応済み |
| EcoRing | CSV | 別PDF | ✅ 対応済み |
| Apre | PDF（落札明細） | 別PDF（諸費用） | ✅ 対応済み |
| Ore | PDF（1枚、2ページ目以降が商品リスト） | 同一PDF | ✅ 対応済み |
| RevaAuc | PDF（1枚、2ページ目以降が商品リスト） | 同一PDF | ✅ 対応済み |

## 今後の拡張案

1. **詳細な差異分析**
   - どの項目で差異が発生しているか特定
   - 商品ごとの金額チェック

2. **履歴表示**
   - 過去のインポートログを一覧表示
   - 不一致があったケースをフィルタリング

3. **自動修正機能**
   - 軽微な差異の場合、自動で調整
   - 修正履歴の記録

4. **通知機能**
   - 不一致時にメール通知
   - Slack連携

## 関連ファイル

### バックエンド
- `prisma/schema.prisma`: データベーススキーマ
- `src/lib/parsers/base-parser.ts`: 基底パーサーと型定義
- `src/lib/parsers/apre-parser.ts`: Apreパーサー
- `src/lib/parsers/ore-parser.ts`: Oreパーサー
- `src/lib/parsers/revaauc-parser.ts`: RevaAucパーサー
- `src/lib/parsers/invoice-pdf-parser.ts`: 請求書PDF専用パーサー（CSV業者用）
- `src/app/api/sync/import/[folderId]/route.ts`: インポート処理
- `src/app/api/suppliers/[id]/route.ts`: 業者設定API

### フロントエンド
- `src/app/suppliers/page.tsx`: 業者一覧
- `src/app/suppliers/[id]/page.tsx`: 業者詳細・設定
- `src/app/import/page.tsx`: インポート画面

## 処理フロー

### CSV業者（Daikichi、Otakaraya、EcoRing）
1. CSVファイルから商品データを抽出
2. 参照用PDFから請求書を判定（ファイル名に「請求」「invoice」「精算」を含む）
3. InvoicePdfParserで請求書総額を抽出
4. システム側で請求額を計算
5. 請求書総額とシステム請求額を比較

### PDF業者（Apre、Ore、RevaAuc）
1. 商品PDFから商品データと請求書総額を同時に抽出
2. システム側で請求額を計算
3. 請求書総額とシステム請求額を比較
