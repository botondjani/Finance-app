import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pdfToLines } from './parsers/pdfLines'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function readPdfLines(file: File) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  return pdfToLines(doc)
}

/** First sheet of an .xlsx/.xls/.csv as an array of rows. */
export async function readTable(file: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(file.name)) {
    return Papa.parse<unknown[]>((await file.text()).trim(), { skipEmptyLines: true }).data
  }
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][]
}
