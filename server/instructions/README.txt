# Knowledge pro AI parser

AI parser používá při každém volání **dva zdroje znalostí**:

## 1. Pevná pravidla — soubory v této složce (`server/instructions/*.md`)

- Slouží pro **stabilní, dlouhodobá pravidla**: tón, zakázané fráze, ceník,
  pravidla detekce služeb atd.
- Všechny `.md` soubory se načtou a spojí do system promptu.
- Změny se projeví **okamžitě** (žádný restart serveru).
- Soubory si můžeš dělit: `01-pokyny.md`, `02-pravidla.md`, …

## 2. Učení z reálné komunikace — `server/feedback/log.jsonl`

- Když uživatel klikne **„Kopírovat email"** A má zaškrtnutý **„Zahrnout
  v emailu"**, uloží se JEDEN řádek JSONu: `{clientEmail, finalAnswer, timestamp}`.
- Parser při dalším volání načte **posledních 50 záznamů** a vloží je do
  system promptu jako vzorové páry `KLIENT: ... → ODPOVĚĎ: ...`.
- LLM tak postupně přebírá tvůj styl odpovídání.
- **Soubor je obyčejný textový JSONL** (řádek = záznam). Kdykoliv ho otevři
  a smaž řádky, které nechceš použít jako vzor.

## Co kam patří?

| Druh znalosti | Kam |
|---|---|
| „Vždy vykej." | `instructions/*.md` |
| „Cena za korekturu je 75 Kč/NS." | `instructions/*.md` |
| „Nepoužívej dlouhé pomlčky." | `instructions/*.md` |
| Konkrétní vzor: „klient se ptal X, odpověděl jsem Y" | `feedback/log.jsonl` (automaticky) |

Pokud z log.jsonl uvidíš, že se nějaký vzor opakuje a chceš ho povýšit na
**trvalé pravidlo**, zapiš ho ručně do nějakého `.md` v této složce. Pak ho můžeš
z log.jsonl klidně smazat.

## Pořadí v promptu

```
[base SYSTEM_PROMPT]
=== DALŠÍ POKYNY OD UŽIVATELE APLIKACE ===
[instructions/*.md]
=== PŘEDCHOZÍ POVEDENÉ ODPOVĚDI ===
[feedback/log.jsonl — posledních 50]
```
