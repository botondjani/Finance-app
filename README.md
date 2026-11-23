# Personal Finance App

Egyfelhasználós személyes pénzügyi app (PWA). Funkciók: [SPEC.md](SPEC.md).

## Futtatás lokálisan

Kell hozzá: Node 20+, Docker.

```bash
cd web
npm install
npx supabase start --workdir ..        # lokális Postgres + Auth, lefuttatja a migrációt
cp .env.example .env.local             # a kulcsot a `npx supabase status --workdir ..` írja ki
npm run dev                            # http://127.0.0.1:5173
```

Első indításkor a „fiók létrehozása” linkkel regisztrálj. Az első felhasználó után a regisztráció zárva.

## Tesztek

```bash
cd web && npm test
```

## Import

| Forrás | Fájl |
|---|---|
| OTP | számlakivonat PDF |
| Revolut | consolidated statement, Excel (.xlsx) |
| Lightyear | account statement CSV (a pozíciókhoz a teljes időszakot exportáld) |
| Bármi más | CSV / Excel, oszlop-hozzárendeléssel (bankonként elmenthető) |

Valódi kivonatok ne kerüljenek a repóba (`*.pdf`, `*.xlsx` gitignore-ban).
