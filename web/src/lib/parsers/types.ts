export interface ParsedTx {
  date: string            // YYYY-MM-DD
  amount: number          // HUF, negative = outflow
  description: string
  counterparty: string    // normalized name used for category learning
  origAmount?: number
  origCurrency?: string
  bankCategory?: string   // category reported by the bank (e.g. Revolut "Exchange")
}

export interface ParsedSection {
  key: string             // e.g. "OTP 11773030-00885728", "Revolut EUR"
  currency: string        // currency of the account/pocket
  openingBalance?: number // HUF
  closingBalance?: number // HUF
  rows: ParsedTx[]
}

export interface ParseResult {
  source: string
  sections: ParsedSection[]
  warnings: string[]
}
