import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Inventory Hub
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            中古品輸出在庫管理システム
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <Link
              href="/products"
              className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
            >
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                商品一覧
              </h2>
              <p className="text-gray-600">
                仕入れ商品の一覧を表示・管理
              </p>
            </Link>

            <Link
              href="/import"
              className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
            >
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                取り込み管理
              </h2>
              <p className="text-gray-600">
                Google Driveから商品データを取り込み
              </p>
            </Link>

            <Link
              href="/suppliers"
              className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
            >
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                業者管理
              </h2>
              <p className="text-gray-600">
                仕入れ業者とパーサー設定を管理
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
