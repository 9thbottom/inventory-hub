'use client'

import { Product, ImportLog, EditProductData, EditAuctionFeesData } from '@/types/product'

interface EditProductModalProps {
  product: Product
  onSave: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  isLoading: boolean
}

export function EditProductModal({ product, onSave, onCancel, isLoading }: EditProductModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">商品情報を編集</h3>
        <form onSubmit={onSave}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品ID
              </label>
              <input
                type="text"
                name="productId"
                defaultValue={product.productId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品名
              </label>
              <input
                type="text"
                name="name"
                defaultValue={product.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品単価
              </label>
              <input
                type="number"
                name="purchasePrice"
                defaultValue={product.purchasePrice}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                min="0"
                step="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                買い手数料
              </label>
              <input
                type="number"
                name="commission"
                defaultValue={product.commission || 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                min="0"
                step="1"
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isLoading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditAuctionFeesModalProps {
  folderName: string
  importLog: ImportLog
  supplierConfig: any
  onSave: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  isLoading: boolean
}

export function EditAuctionFeesModal({ 
  folderName, 
  importLog, 
  supplierConfig,
  onSave, 
  onCancel, 
  isLoading 
}: EditAuctionFeesModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">{folderName} - 参加費・送料を編集</h3>
        <form onSubmit={onSave}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                参加費
              </label>
              <input
                type="number"
                name="participationFee"
                defaultValue={importLog.participationFee || 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="1"
              />
              <div className="mt-2">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="participationFeeTaxType"
                    value="included"
                    defaultChecked={importLog.participationFeeTaxType === 'included'}
                    className="form-radio"
                  />
                  <span className="ml-2">税込</span>
                </label>
                <label className="inline-flex items-center ml-4">
                  <input
                    type="radio"
                    name="participationFeeTaxType"
                    value="excluded"
                    defaultChecked={importLog.participationFeeTaxType === 'excluded'}
                    className="form-radio"
                  />
                  <span className="ml-2">税別</span>
                </label>
              </div>
              {supplierConfig?.participationFee && (
                <p className="text-xs text-gray-500 mt-1">
                  業者設定: ¥{supplierConfig.participationFee.amount.toLocaleString()} ({supplierConfig.participationFee.taxType === 'included' ? '税込' : '税別'})
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                送料
              </label>
              <input
                type="number"
                name="shippingFee"
                defaultValue={importLog.shippingFee || 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="1"
              />
              <div className="mt-2">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="shippingFeeTaxType"
                    value="included"
                    defaultChecked={importLog.shippingFeeTaxType === 'included'}
                    className="form-radio"
                  />
                  <span className="ml-2">税込</span>
                </label>
                <label className="inline-flex items-center ml-4">
                  <input
                    type="radio"
                    name="shippingFeeTaxType"
                    value="excluded"
                    defaultChecked={importLog.shippingFeeTaxType === 'excluded'}
                    className="form-radio"
                  />
                  <span className="ml-2">税別</span>
                </label>
              </div>
              {supplierConfig?.shippingFee && (
                <p className="text-xs text-gray-500 mt-1">
                  業者設定: ¥{supplierConfig.shippingFee.amount.toLocaleString()} ({supplierConfig.shippingFee.taxType === 'included' ? '税込' : '税別'})
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isLoading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
