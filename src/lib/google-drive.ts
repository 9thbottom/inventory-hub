import { google } from 'googleapis'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function getDriveClient() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    throw new Error('認証が必要です')
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  // セッションからアクセストークンを取得
  // 注: 実際の実装では、Accountテーブルからトークンを取得する必要があります
  oauth2Client.setCredentials({
    access_token: session.accessToken as string,
    refresh_token: session.refreshToken as string,
  })

  return google.drive({ version: 'v3', auth: oauth2Client })
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime: string
  modifiedTime: string
  size?: string
}

export interface DriveFolder {
  id: string
  name: string
  path: string
  files: DriveFile[]
}

/**
 * 指定フォルダ内のサブフォルダ一覧を取得
 */
export async function listFolders(parentFolderId: string): Promise<DriveFolder[]> {
  const drive = await getDriveClient()
  
  const response = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, createdTime, modifiedTime)',
    orderBy: 'name',
  })

  return (response.data.files || []).map(folder => ({
    id: folder.id!,
    name: folder.name!,
    path: folder.name!,
    files: [],
  }))
}

/**
 * 指定フォルダ内のファイル一覧を取得
 */
export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const drive = await getDriveClient()
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)',
    orderBy: 'name',
  })

  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    mimeType: file.mimeType!,
    createdTime: file.createdTime!,
    modifiedTime: file.modifiedTime!,
    size: file.size || undefined,
  }))
}

/**
 * ファイルをダウンロード
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = await getDriveClient()
  
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  return Buffer.from(response.data as ArrayBuffer)
}

/**
 * フォルダ構造を再帰的に取得
 * 例: 2026/01/0111_Daikichi のような構造
 */
export async function getFolderStructure(
  rootFolderId: string,
  basePath: string = ''
): Promise<DriveFolder[]> {
  const folders = await listFolders(rootFolderId)
  const result: DriveFolder[] = []

  for (const folder of folders) {
    const fullPath = basePath ? `${basePath}/${folder.name}` : folder.name
    const files = await listFiles(folder.id)
    
    result.push({
      ...folder,
      path: fullPath,
      files,
    })

    // サブフォルダがある場合は再帰的に取得
    const subFolders = await listFolders(folder.id)
    if (subFolders.length > 0) {
      const subResults = await getFolderStructure(folder.id, fullPath)
      result.push(...subResults)
    }
  }

  return result
}

/**
 * フォルダパスから日付とオークション名を抽出
 * 例: "0111_Daikichi" -> { date: "2026-01-11", auctionName: "Daikichi" }
 */
export function parseFolderName(folderName: string, year: string, month: string) {
  const match = folderName.match(/^(\d{4})_(.+)$/)
  
  if (!match) {
    return null
  }

  const [, mmdd, auctionName] = match
  const monthPart = mmdd.substring(0, 2)
  const dayPart = mmdd.substring(2, 4)
  
  return {
    date: new Date(`${year}-${monthPart}-${dayPart}`),
    auctionName: auctionName.trim(),
  }
}
