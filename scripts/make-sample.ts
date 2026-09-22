/**
 * Builds public/sample/tallwood-annual-report-2025.pdf: a short, fictional
 * annual report used to demo JevPDF. Run: bun scripts/make-sample.ts
 *
 * The wording deliberately avoids the demo queries' exact phrasing, so
 * Meaning search has to find what Exact text can't.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"

const W = 612
const H = 792
const M = 66
const INK = rgb(0.13, 0.12, 0.11)
const SOFT = rgb(0.42, 0.4, 0.38)
const RULE = rgb(0.8, 0.78, 0.74)

const doc = await PDFDocument.create()
doc.setTitle("Tallwood Supply Co. — 2025 Annual Report")
doc.setAuthor("Tallwood Supply Co. (fictional)")
const serif = await doc.embedFont(StandardFonts.TimesRoman)
const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold)
const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic)
const sans = await doc.embedFont(StandardFonts.Helvetica)
const sansBold = await doc.embedFont(StandardFonts.HelveticaBold)

let page: PDFPage
let y = 0
let pageNo = 0

function newPage(runningHead = "Tallwood Supply Co. · 2025 Annual Report") {
  page = doc.addPage([W, H])
  pageNo++
  y = H - M
  page.drawText(runningHead, { x: M, y: H - 40, size: 8, font: sans, color: SOFT })
  page.drawText(String(pageNo), { x: W - M - 6, y: 36, size: 9, font: sans, color: SOFT })
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function para(text: string, opts: { font?: PDFFont; size?: number; gap?: number; indent?: number } = {}) {
  const { font = serif, size = 11, gap = 9, indent = 0 } = opts
  const lead = size * 1.42
  for (const line of wrap(text, font, size, W - 2 * M - indent)) {
    page.drawText(line, { x: M + indent, y, size, font, color: INK })
    y -= lead
  }
  y -= gap
}

function heading(text: string, size = 15) {
  y -= 4
  page.drawText(text, { x: M, y, size, font: serifBold, color: INK })
  y -= size + 8
}

function eyebrow(text: string) {
  page.drawText(text.toUpperCase(), { x: M, y, size: 8, font: sansBold, color: SOFT })
  y -= 16
}

function rule(gap = 10) {
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.6, color: RULE })
  y -= gap
}

const COL1 = W - M - 150
const COL2 = W - M

function row(label: string, a: string, b: string, opts: { bold?: boolean; indent?: number; size?: number } = {}) {
  const size = opts.size ?? 10
  const font = opts.bold ? sansBold : sans
  page.drawText(label, { x: M + (opts.indent ?? 0), y, size, font, color: INK })
  for (const [v, x] of [[a, COL1], [b, COL2]] as const) {
    page.drawText(v, { x: x - font.widthOfTextAtSize(v, size), y, size, font, color: INK })
  }
  y -= size * 1.75
}

// ---- Page 1: cover + letter ---------------------------------------------

newPage("")
y = H - 150
page.drawText("Tallwood Supply Co.", { x: M, y, size: 30, font: serifBold, color: INK })
y -= 30
page.drawText("Annual Report for the fiscal year ended December 31, 2025", { x: M, y, size: 13, font: serifItalic, color: SOFT })
y -= 50
rule(26)
eyebrow("Letter to shareholders")
para("Dear fellow owners,")
para(
  "2025 was the year our operating discipline showed up in the bank account. Revenue grew 9% to $2.31 billion, helped by the regional distribution centers we opened in Ohio and Nevada, and gross margin widened by 80 basis points as freight costs normalized."
)
para(
  "Most importantly, day-to-day operations brought in $412.6 million in cash during 2025, up 17% from $351.2 million a year earlier. After $96.3 million of capital spending, we were left with $316.3 million of free cash flow, which funded our dividend, retired the remaining term loan, and still added to the balance sheet."
)
para(
  "We also split our stock two-for-one in June, the first split in the company's history, to keep shares accessible to the employees who own a growing part of Tallwood through our purchase plan."
)
para(
  "Our priorities for 2026 are unchanged: serve contractors faster than anyone in our regions, keep inventory lean, and turn earnings into cash. Thank you for your continued trust."
)
y -= 4
para("Maren Okafor", { font: serifBold, gap: 0 })
para("President and Chief Executive Officer", { font: serifItalic, size: 10 })

// ---- Page 2: MD&A --------------------------------------------------------

newPage()
eyebrow("Management's discussion and analysis")
heading("Liquidity and capital resources")
para(
  "Our principal sources of liquidity are cash on hand, cash from operations, and a $400.0 million revolving credit facility, which was undrawn at December 31, 2025. We believe these sources are sufficient to fund operations, capital projects, and shareholder returns for at least the next twelve months."
)
heading("Cash flows", 12.5)
para(
  "Net cash provided by operating activities was $412.6 million in 2025 compared with $351.2 million in 2024. The increase reflects higher net income and a $25.8 million larger contribution from working capital, primarily faster collection of receivables from large contractor accounts."
)
para(
  "Net cash used in investing activities was $101.9 million, consisting mainly of $96.3 million of purchases of property and equipment for the two new distribution centers and warehouse automation."
)
para(
  "Net cash used in financing activities was $214.7 million, including $120.0 million to repay the term loan in full, $61.2 million of dividends, and $33.5 million of share repurchases."
)
heading("Free cash flow (non-GAAP)", 12.5)
para(
  "We define free cash flow as net cash provided by operating activities less purchases of property and equipment. Free cash flow was $316.3 million in 2025 and $262.8 million in 2024. Free cash flow is not a substitute for measures prepared under GAAP."
)
heading("Inventory", 12.5)
para(
  "Inventory turns improved to 6.1 from 5.6, as the new centers let us hold fewer weeks of supply in branch locations. We expect turns to remain near this level in 2026."
)

// ---- Page 3: Cash flow statement ----------------------------------------

newPage()
eyebrow("Financial statements")
heading("Consolidated Statements of Cash Flows")
page.drawText("(In thousands)", { x: M, y, size: 9, font: sansBold, color: SOFT })
y -= 18
row("Year ended December 31,", "2025", "2024", { bold: true })
rule(8)
row("Operating activities", "", "", { bold: true })
row("Net income", "271,440", "236,905", { indent: 10 })
row("Depreciation and amortization", "58,712", "52,380", { indent: 10 })
row("Stock-based compensation", "18,960", "16,214", { indent: 10 })
row("Deferred income taxes", "(4,122)", "3,871", { indent: 10 })
row("Changes in accounts receivable", "21,305", "(9,940)", { indent: 10 })
row("Changes in inventories", "(12,880)", "(31,617)", { indent: 10 })
row("Changes in accounts payable and accrued liabilities", "59,203", "83,391", { indent: 10 })
row("Net cash provided by operating activities", "412,618", "351,204", { bold: true })
y -= 6
row("Investing activities", "", "", { bold: true })
row("Purchases of property and equipment", "(96,340)", "(88,431)", { indent: 10 })
row("Proceeds from sale of equipment", "2,105", "1,760", { indent: 10 })
row("Acquisition of business, net of cash acquired", "(7,650)", "—", { indent: 10 })
row("Net cash used in investing activities", "(101,885)", "(86,671)", { bold: true })
y -= 6
row("Financing activities", "", "", { bold: true })
row("Repayment of term loan", "(120,000)", "(60,000)", { indent: 10 })
row("Dividends paid", "(61,210)", "(54,880)", { indent: 10 })
row("Repurchases of common stock", "(33,512)", "(41,008)", { indent: 10 })
row("Net cash used in financing activities", "(214,722)", "(155,888)", { bold: true })
y -= 6
rule(8)
row("Net increase in cash and cash equivalents", "96,011", "108,645", { bold: true })
row("Cash and cash equivalents, beginning of year", "492,899", "384,254", { indent: 10 })
row("Cash and cash equivalents, end of year", "588,910", "492,899", { bold: true })
y -= 10
para("The accompanying notes are an integral part of these consolidated financial statements.", {
  font: serifItalic,
  size: 9,
})

// ---- Page 4: Income statement + notes -----------------------------------

newPage()
eyebrow("Financial statements")
heading("Consolidated Statements of Operations")
page.drawText("(In thousands, except per share data)", { x: M, y, size: 9, font: sansBold, color: SOFT })
y -= 18
row("Year ended December 31,", "2025", "2024", { bold: true })
rule(8)
row("Net sales", "2,310,470", "2,119,690")
row("Cost of sales", "(1,543,390)", "(1,432,910)")
row("Gross profit", "767,080", "686,780", { bold: true })
row("Selling, general and administrative", "(412,300)", "(378,120)")
row("Operating income", "354,780", "308,660", { bold: true })
row("Net income", "271,440", "236,905", { bold: true })
row("Diluted earnings per share", "$ 2.14", "$ 1.87")
row("Weighted-average diluted shares outstanding", "126,841", "126,688")
y -= 14
eyebrow("Notes to consolidated financial statements")
heading("Note 1 — Basis of presentation", 12.5)
para(
  "The consolidated financial statements include the accounts of Tallwood Supply Co. and its wholly owned subsidiaries. Intercompany balances have been eliminated."
)
para(
  "Unless otherwise indicated, numbers of shares are stated in thousands, and per-share amounts are stated in U.S. dollars. All share and per-share figures for every period shown have been retroactively adjusted for the two-for-one stock split effected on June 2, 2025."
)
heading("Note 9 — Stockholders' equity", 12.5)
para(
  "The company is authorized to issue 400,000 thousand shares of common stock with a par value of $0.001. At December 31, 2025, 125,930 thousand shares were issued and outstanding. During 2025 the company repurchased 402 thousand shares at an average price of $83.36 per share."
)

await mkdir("public/sample", { recursive: true })
await writeFile("public/sample/tallwood-annual-report-2025.pdf", await doc.save())
console.log(`Wrote ${pageNo} pages`)
