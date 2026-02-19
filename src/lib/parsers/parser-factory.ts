import { BaseParser } from './base-parser'
import { CSVParser } from './csv-parser'
import { PDFParser } from './pdf-parser'

export class ParserFactory {
  static getParser(fileType: string): BaseParser {
    const type = fileType.toLowerCase()
    
    if (type.includes('csv') || type === 'text/csv') {
      return new CSVParser()
    }
    
    if (type.includes('pdf') || type === 'application/pdf') {
      return new PDFParser()
    }
    
    throw new Error(`サポートされていないファイル形式です: ${fileType}`)
  }

  static isSupported(fileType: string): boolean {
    const type = fileType.toLowerCase()
    return type.includes('csv') || type.includes('pdf')
  }
}
