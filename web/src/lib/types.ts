export type AccountKind = 'checking' | 'savings' | 'cash' | 'other'
export type CategoryKind = 'expense' | 'income' | 'investment'
export type AssetType = 'stock_etf' | 'bond' | 'crypto' | 'other'

export interface Account { id: string; name: string; kind: AccountKind; opening_balance: number; archived: boolean }
export interface Category { id: string; name: string; kind: CategoryKind }
export interface Tx {
  id: string; account_id: string; date: string; amount: number; description: string; counterparty: string
  category_id: string | null; tags: string[]; note: string | null; is_transfer: boolean; transfer_peer_id: string | null
  orig_amount: number | null; orig_currency: string | null; import_batch_id: string | null
}
export interface Budget { id: string; category_id: string; month: string | null; amount: number }
export interface Goal { id: string; name: string; target_amount: number; account_id: string; deadline: string | null }
export interface Asset { id: string; name: string; type: AssetType; source: 'manual' | 'lightyear' }
export interface Valuation { id: string; asset_id: string; date: string; value: number; invested: number | null }

export const ACCOUNT_KINDS: Record<AccountKind, string> = { checking: 'Folyószámla', savings: 'Megtakarítás', cash: 'Készpénz', other: 'Egyéb' }
export const CATEGORY_KINDS: Record<CategoryKind, string> = { expense: 'Kiadás', income: 'Bevétel', investment: 'Befektetés' }
export const ASSET_TYPES: Record<AssetType, string> = { stock_etf: 'Részvény / ETF', bond: 'Állampapír', crypto: 'Kripto', other: 'Egyéb' }
