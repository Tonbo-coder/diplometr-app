# Deploy na Fly.io

Tento návod tě provede prvním nasazením + budoucími deployi.

## Co potřebuješ jednorázově nainstalovat

1. **flyctl** (Fly.io CLI):
   ```powershell
   # Windows PowerShell
   iwr https://fly.io/install.ps1 -useb | iex
   ```
   Restartuj terminál nebo přidej Fly do PATH (`$env:Path += ";$home\.fly\bin"`).

2. **Účet na Fly.io** (https://fly.io/app/sign-up). Vyžaduje kreditní kartu, ale
   pro náš objem se vejdeš do měsíčního kreditu $5 zdarma.

3. Přihlásit se:
   ```powershell
   fly auth login
   ```

## První deploy

V kořeni projektu (`C:\Users\jsem\Claude_weby\App\Diplometr`):

```powershell
# 1) Vytvoř aplikaci (jednou)
fly launch --no-deploy --name diplometr --region fra --copy-config --yes

# 2) Vytvoř persistent volume (jednou)
fly volumes create diplometr_data --size 1 --region fra --yes

# 3) Nastav secrets (jednou — odpovídá tomu, co je teď v server/.env)
fly secrets set `
  CLOUDCONVERT_API_KEY="tvuj_cloudconvert_klic" `
  ANTHROPIC_API_KEY="tvuj_anthropic_klic" `
  APP_PASSWORD="tvoje_heslo_pro_kolegy"

# (poznámka: pokud nyní testuješ s STUB_PHYSICAL_PAGES=50, nepřidávej ho
#  v produkci — chceš reálný počet stran z CloudConvertu)

# 4) Deploy
fly deploy
```

Po deploy dostaneš URL typu `https://diplometr.fly.dev`. Otevři, prohlížeč
požádá o login → vlož **libovolné jméno** + **heslo z APP_PASSWORD**.

## Budoucí update kódu

Po jakékoliv změně v kódu:

```powershell
fly deploy
```

Trvá ~2-4 minuty.

## Užitečné příkazy

```powershell
fly logs                         # živé logy serveru
fly status                       # stav appky
fly ssh console                  # přihlásit se do běžícího kontejneru
fly secrets list                 # seznam secrets (bez hodnot)
fly volumes list                 # seznam volumes
fly machine restart              # restart appky
```

## Editace knowledge na produkci

Knowledge soubory (`instructions/*.md`) jsou po prvním startu zkopírovány na
persistent volume `/data/instructions/`. Editace:

```powershell
fly ssh console
# uvnitř kontejneru:
cd /data/instructions
vi 01-pokyny.md         # uloží se okamžitě, parser je přečte při dalším volání
```

Alternativa: editovat lokálně v repu, commitnout, `fly deploy` — ale POZOR,
to NEPŘEPÍŠE soubory na volume (jen bundled verzi v image, která se kopíruje
jen při prvním startu, když je `/data/instructions` prázdné).

## Co když chci úplně reset knowledge?

```powershell
fly ssh console
rm -rf /data/instructions /data/feedback
exit
fly machine restart
```

Po restartu se bundled verze zkopíruje znovu.

## Kde jsou knowledge a feedback v produkci?

| Cesta | Co tam je |
|---|---|
| `/data/instructions/*.md` | Pevná pravidla pro AI (editovatelné přes `fly ssh`) |
| `/data/feedback/log.jsonl` | Vzorové páry KLIENT → ODPOVĚĎ (auto-zápis) |

Obojí přežije deploy i restart díky volumu `diplometr_data`.
