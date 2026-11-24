import { Link } from 'react-router-dom'

const TERMS: [string, string][] = [
  ['Bevétel', 'Minden pénz, ami bejött a számláidra (fizetés, ösztöndíj, utalás valakitől) – kivéve a saját számláid közötti átvezetéseket.'],
  ['Kiadás', 'Minden pénz, amit elköltöttél. A visszatérítések (pl. egy visszavitt termék ára) csökkentik. Az átvezetések és a befektetésre utalt pénz nem kiadás.'],
  ['Megtakarítás', 'Bevétel mínusz kiadás az adott hónapban. Ha pozitív, többet kerestél, mint amennyit elköltöttél.'],
  ['Ebből befektetve', 'A megtakarításból ennyit utaltál befektetésre (a „Befektetés” kategóriájú tételek, pl. Lightyear befizetés).'],
  ['Átvezetés', 'Pénzmozgás a saját számláid között (pl. OTP → Revolut feltöltés, HUF → EUR váltás). Nem bevétel és nem kiadás, csak áthelyezés.'],
  ['Nettó vagyon', 'Az összes számlád egyenlege plusz a befektetéseid legutóbb rögzített értéke.'],
  ['Nyitóegyenleg', 'A számla egyenlege az első importált tétel előtt. Importnál a kivonatból automatikusan kitöltöm.'],
  ['Kategorizálatlan', 'Olyan tétel, aminek még nincs kategóriája. A „Rendezés” oldalon partnerenként egyszerre besorolhatod őket.'],
  ['Alap keret (budget)', 'Kategóriánkénti havi költési limit, ami minden hónapra érvényes.'],
  ['Csak ebben a hónapban (budget)', 'Egy adott hónapra felülírja az alap keretet (pl. decemberben több jut ajándékra).'],
  ['Megtakarítási cél', 'Egy összeg, amit egy számlán gyűjtesz. A haladás a számla egyenlege.'],
  ['Befektetési cél', 'Egy összeg, amit a befektetéseiddel érnél el. A haladás egy eszköz vagy a teljes portfólió értéke.'],
  ['Portfólió értéke', 'A befektetéseid legutóbb rögzített értéke. Lightyear PDF kivonatból automatikusan, máshol kézzel adod meg.'],
  ['Befektetett tőke', 'Mennyi saját pénzt tettél be összesen a számlanyitás óta (befizetések mínusz kivétek). Egyszer kell megadnod, utána az importált befizetésekkel továbbvezetem.'],
  ['Eredmény', 'Portfólió értéke mínusz befektetett tőke: ennyit nyertél (vagy vesztettél).'],
  ['Ismétlődő tétel', 'Olyan kiadás, ami nagyjából havonta, hasonló összeggel visszatér (pl. előfizetések).'],
  ['Duplikátum', 'Már korábban importált tétel. Ha ugyanazt a kivonatot (vagy átfedő időszakot) újra feltöltöd, ezeket kihagyom.'],
]

export default function Help() {
  return (
    <>
      <h1>Súgó</h1>
      <div className="card">
        <h2>Így használd</h2>
        <ol className="steps">
          <li><b>Töltsd fel a kivonataidat</b> az <Link to="/import">Import</Link> oldalon. Elég kiválasztani a fájlt, a bankot magától felismerem.
            <div className="small muted">OTP: PDF kivonat · Revolut: kivonat PDF-ben vagy Excelben · Lightyear: PDF vagy CSV · más bank: CSV/Excel.</div></li>
          <li><b>Rendezd a kategóriákat</b> a <Link to="/categorize">Rendezés</Link> oldalon. Az ismert boltokat automatikusan besorolom, a többit partnerenként egy kattintással.</li>
          <li><b>Hagyd jóvá az átvezetéseket</b> (Import oldal alja), hogy a számlák közti mozgás ne torzítsa a kiadásokat.</li>
          <li><b>Állíts be havi keretet</b> a <Link to="/budget">Budget</Link> oldalon, és <b>tűzz ki célokat</b> a <Link to="/goals">Célok</Link> oldalon.</li>
          <li>Havonta töltsd fel az új kivonatokat – a korábbi döntéseidből tanulok, egyre kevesebb kézi munka lesz.</li>
        </ol>
      </div>
      <div className="card">
        <h2>Fogalmak</h2>
        <dl className="glossary">
          {TERMS.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
        </dl>
      </div>
    </>
  )
}
