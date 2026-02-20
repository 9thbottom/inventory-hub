import { BaseParser } from './base-parser'
import { CSVParser } from './csv-parser'
import { PDFParser } from './pdf-parser'
import { DaikichiParser } from './daikichi-parser'
import { OtakarayaParser } from './otakaraya-parser'
import { EcoringParser } from './ecoring-parser'
import { ApreParser } from './apre-parser'
import { RevaAucParser } from './revaauc-parser'
import { OreParser } from './ore-parser'
import { TimelessParser } from './timeless-parser'

export class ParserFactory {
  /**
   * ファイルタイプと業者名に基づいて適切なParserを返す
   * @param fileType ファイルのMIMEタイプ
   * @param supplierName 業者名（オプション）
   */
  static getParser(fileType: string, supplierName?: string): BaseParser {
    const type = fileType.toLowerCase()
    
    // CSVファイルの場合、業者名に応じて専用Parserを返す
    if (type.includes('csv') || type === 'text/csv') {
      if (supplierName) {
        const normalizedName = supplierName.toLowerCase()
        
        if (normalizedName.includes('daikichi') || normalizedName.includes('大吉')) {
          return new DaikichiParser()
        }
        
        if (normalizedName.includes('otakaraya') || normalizedName.includes('おたからや')) {
          return new OtakarayaParser()
        }
        
        if (normalizedName.includes('ecoring')) {
          return new EcoringParser()
        }
        
        if (normalizedName.includes('timeless') || normalizedName.includes('タイムレス')) {
          return new TimelessParser()
        }
      }
      
      // デフォルトのCSVParser
      return new CSVParser()
    }
    
    if (type.includes('pdf') || type === 'application/pdf') {
      if (supplierName) {
        const normalizedName = supplierName.toLowerCase()
        
        if (normalizedName.includes('apre') || normalizedName.includes('アプレ')) {
          return new ApreParser()
        }
        
        if (normalizedName.includes('revaauc') || normalizedName.includes('リバオク') || normalizedName.includes('レバオク')) {
          return new RevaAucParser()
        }
        
        if (normalizedName.includes('ore') || normalizedName.includes('オーレ')) {
          return new OreParser()
        }
        
        if (normalizedName.includes('timeless') || normalizedName.includes('タイムレス')) {
          return new TimelessParser()
        }
      }
      
      // デフォルトのPDFParser
      return new PDFParser()
    }
    
    throw new Error(`サポートされていないファイル形式です: ${fileType}`)
  }

  static isSupported(fileType: string): boolean {
    const type = fileType.toLowerCase()
    return type.includes('csv') || type.includes('pdf')
  }
}
