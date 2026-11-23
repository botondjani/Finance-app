export interface PdfLine { page: number; y: number; items: { x: number; str: string }[] }

interface TextItemLike { str: string; transform: number[] }
interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

/** Groups pdf.js text items into visual lines (top to bottom, left to right). */
export async function pdfToLines(doc: PdfDocLike): Promise<PdfLine[]> {
  const lines: PdfLine[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const pageLines: PdfLine[] = []
    for (const it of content.items as TextItemLike[]) {
      if (!it.str || !it.str.trim()) continue
      const x = it.transform[4], y = it.transform[5]
      let line = pageLines.find(l => Math.abs(l.y - y) < 2)
      if (!line) pageLines.push(line = { page: p, y, items: [] })
      line.items.push({ x, str: it.str })
    }
    pageLines.sort((a, b) => b.y - a.y)
    for (const l of pageLines) l.items.sort((a, b) => a.x - b.x)
    lines.push(...pageLines)
  }
  return lines
}
