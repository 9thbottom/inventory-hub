# Inventory Hub - 中古品輸出在庫管理システム

中古品輸出ビジネスの仕入れ商品を管理するためのシステムです。Google Driveに保存された仕入れ書類から商品情報を自動取得し、ウェブ管理画面で一覧表示します。

## 主な機能

- **Google Drive連携**: Inventoryフォルダから自動的にファイルを取得
- **商品管理**: 仕入れ商品の一覧表示・検索・フィルタリング
- **取り込み管理**: Driveフォルダのスキャンとファイル取り込み
- **業者管理**: 仕入れ業者の登録とパーサー設定

## 技術スタック

- **フロントエンド**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **バックエンド**: Next.js API Routes
- **データベース**: PostgreSQL (Prisma ORM)
- **認証**: NextAuth.js (Google OAuth)
- **外部API**: Google Drive API

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local`ファイルを作成し、以下の環境変数を設定してください:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/inventory_hub"

# Google OAuth
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_DRIVE_FOLDER_ID="your-folder-id"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"
```

### 3. データベースのセットアップ

```bash
# Prisma Clientの生成
npx prisma generate

# マイグレーションの実行
npx prisma migrate dev
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

## Google Drive APIの設定

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. Google Drive APIを有効化
3. OAuth 2.0クライアントIDを作成
4. 承認済みのリダイレクトURIに `http://localhost:3000/api/auth/callback/google` を追加
5. InventoryフォルダをGoogleアカウントと共有

## Vercelへのデプロイ

### 1. GitHubリポジトリにpush

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-username/inventory-hub.git
git push -u origin main
```

### 2. Vercelプロジェクトの作成

1. [Vercel Dashboard](https://vercel.com/dashboard)にアクセス
2. GitHubリポジトリをインポート
3. 環境変数を設定
4. デプロイ

### 3. Vercel Postgresの作成

1. Vercel Dashboard → Storage → Create Database → Postgres
2. プロジェクトに接続
3. 環境変数が自動設定されます

### 4. データベースマイグレーション

```bash
# Vercel環境でマイグレーション実行
npx prisma migrate deploy
```

## フォルダ構造

```
Inventory/
└── 2026/
    └── 01/
        ├── 0111_Daikichi/
        │   ├── 請求書.pdf
        │   └── 商品リスト.csv
        └── 0115_AnotherAuction/
            └── ...
```

## ライセンス

MIT
