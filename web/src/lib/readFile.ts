import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pdfToLines } from './parsers/pdfLines'
import { sniffKind } from './parsers/detect'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function readPdfLines(file: File) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  return pdfToLines(doc)
}

export const fileKind = async (file: File) => sniffKind(new Uint8Array(await file.slice(0, 8).arrayBuffer()))

export const readText = async (file: File) => (await file.text()).replace(/^\uFEFF/, '')

/** First sheet of an .xlsx/.xls, or a CSV/text file, as an array of rows. */
export async function readTable(file: File): Promise<unknown[][]> {
  if (await fileKind(file) === 'text') {
    return Papa.parse<unknown[]>((await readText(file)).trim(), { skipEmptyLines: true }).data
  }
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][]
}
