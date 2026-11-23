# Personal Finance App – Specifikáció (v1)

Egyfelhasználós személyes pénzügyi app.

## Alap
- Web app (PWA), mobilon is használható.
- Belépés: email + jelszó; regisztráció az első felhasználó után tiltva.
- Backend: Supabase (Postgres + RLS + Auth). Fejlesztés lokális Supabase-zel, később felhőbe deployolható.
- Pénznem: minden HUF-ban számolva.
- Stack: React + TypeScript + Vite, Recharts a grafikonokhoz.

## Számlák
- Több számla (pl. OTP folyószámla, Revolut, készpénz, megtakarítás), nyitóegyenleggel.
- Aktuális egyenleg a tranzakciókból számolva.
- Átvezetés típus: számlák közti mozgás, nem számít bevételnek/kiadásnak.

## Tranzakciók
- Kézi felvitel, szerkesztés, törlés.
- Lista szűréssel: időszak, számla, kategória, címke, szabad szöveg.
- Egyszintű kategóriák + szabad címkék (pl. `#nyaralás2026`).
- Speciális „Befektetés” kategória: bankszámláról befektetésre utalt összeg nem számít kiadásnak, nem terheli a budgetet, a dashboardon megtakarításként jelenik meg.

## Import
- Előre beállított formátum: OTP, Revolut.
- Általános CSV: oszlop-hozzárendelés (dátum, összeg, leírás, ...).
- Revolut deviza tételek: HUF-ra váltás importkor napi árfolyammal (ECB / Frankfurter API); eredeti összeg és deviza megőrizve.
- Duplikátum automatikus kiszűrése (dátum + összeg + leírás + számla), összesítőben jelezve.
- Auto-kategorizálás korábbi tételekből tanulva (azonos partner → azonos kategória).
- Átvezetés automatikus párosítása: azonos összeg ±2 napon belül két saját számla között → javaslat, felhasználói jóváhagyással.

## Budget
- Kategóriánkénti fix havi keret, hónaponként felülírható.
- Túllépés jelzése. Nincs maradék-átvitel.

## Dashboard
- Havi bevétel / kiadás / megtakarítás, előző hónaphoz viszonyítva.
- Kiadás kategóriánként (választható időszak).
- Számlaegyenlegek és nettó vagyon alakulása időben.
- Megtakarítási célok haladása.
- Portfólió értéke és trendje.

## Megtakarítási célok
- Cél = egy számla egyenlege (pl. „Autó, 2 000 000 Ft” egy megtakarítási számlához kötve).
- Opcionális határidő → szükséges havi megtakarítás kiszámítása.

## Ismétlődő tételek
- Csak felismerés: előfizetések / havi fix költségek listája a tranzakciós mintákból.

## Befektetések (külön modul)
- Eszköztípusok: részvény/ETF, állampapír (MÁP+, PMÁP, ...), kripto, egyéb (nyugdíjpénztár, TBSZ, ingatlan).
- Lightyear: CSV importból pozíciók (ticker, darabszám, befektetett tőke); árfolyam / érték kézi frissítéssel. EUR/USD → HUF átváltás ugyanazzal az árfolyamforrással.
- Minden más eszköz: időszakonként (pl. havonta) kézzel beírt aktuális érték.
- Portfólió trend grafikon; befektetett tőke vs. aktuális érték, ahol ismert.
- Beleszámít a nettó vagyonba.

## Nincs a v1-ben
- Többdevizás számlák, alkategóriák.
- Automatikus ismétlődő tétel rögzítés, budget-átvitel.
- Banki API-kapcsolat.
- Automatikus árfolyam befektetésekhez, osztalék-/hozamszámítás, más broker importja.

## Sikerkritériumok
- Valós OTP és Revolut kivonat importja hibátlanul lefut; újraimportálás nem hoz létre duplikátumot.
- Számlaegyenlegek egyeznek a banki egyenleggel.
- Lightyear import pozíciói egyeznek a Lightyear felületén látottakkal (darabszám, befektetett tőke).
- Dashboard számai egyeznek egy kézi ellenőrzéssel.

## Nyitott pont
- Anonimizált minta-exportok szükségesek: OTP, Revolut, Lightyear (az importerek ezek alapján készülnek).
