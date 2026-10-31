# Jak se každá změna kontroluje / How every change is checked
*Totéž platí pro pracovní koutek jako pro zbytek Brianu. / The same holds for the job corner as for the rest of Brian.*

## Testy / Tests

Brian má 105 sad testů v jednom seznamu (`.github/workflows/tests.yml`), a jedna změna kódu přichází vždy s testem, který před ní padá a po ní prochází. Rychlá kontrola, asi dvě minuty, běží před každým sloučením na větvi a hned po něm na čerstvém mainu; celý běh všech sad se dělá jednou před každým vydáním. GitHubu se nevěří: jeho vlastní kontroly jsou vypnuté a verdikt dává skript `tools/check-main.sh`, který končí řádkem „VERDICT:".

*Brian has 105 test suites in one list, and a change to code always comes with a test that fails before it and passes after it. The fast check, about two minutes, runs before every merge on the branch and again right after it on fresh main; the full run of every suite happens once before each release. GitHub is not trusted: its own checks are off and the verdict comes from the script `tools/check-main.sh`, which ends with a line "VERDICT:".*

Pracovní koutek hlídá pět vlastních sad, které jsou ve složce `tests/` k přečtení: profil a plán učení, cvičný pohovor, hledání inzerátů se stropem tří denně, denní krok učení a to, co z nalezené práce smí vidět Leo. Každá otevírá skutečnou aplikaci se smyšlenými daty a kontroluje i to, co nesmí odejít z telefonu; tady samy neběží, protože potřebují zbytek Brianu. *The job corner is guarded by five suites of its own, in `tests/` to read: the profile and learning plan, the practice interview, the ad search with its cap of three a day, the daily learning step, and what Leo may see of a found job. Each opens the real app with made-up data and also checks what must not leave the phone; they do not run here, because they need the rest of Brian.*

## Nezávislá kontrola / Independent review

Každý kus práce dostane před sloučením jednu nezávislou kontrolu jinou AI relací, která nic nestaví, jen čte celý rozdíl a kód kolem něj, spouští testy v oddělené kopii a zkouší věci rozbít. U bezpečnosti, peněz a majitelových dat běží na vyšší úrovni. Opravy po ní prověří testy a rychlá kontrola. Každá taková kontrola má vlastní zápis: co četla, co spustila, co našla a co z toho bylo opraveno před sloučením. Kontrola druhým modelem jiné firmy je zapsaný nápad, zatím nezavedený.

*Every piece of work gets one independent review by a separate AI session before it merges; that session builds nothing, reads the whole diff and the code around it, runs the tests in a separate copy and tries to break things. For security, money and the owner's data it runs at a higher level. Fixes after it are checked by the tests and the fast check. Every such review has its own record: what it read, what it ran, what it found and what was fixed before the merge. A review by a second company's model is a recorded idea, not yet in place.*

## Bezpečnost a peníze / Security and money

Brian prošel několika samostatnými bezpečnostními čteními, zaměřenými na to, co může opustit telefon, kdo může projít dveřmi k AI a co se stane, když klíč unikne. Z nich vzešlo mimo jiné: dveře k AI pustí jen text, jehož první řádek napsal telefon; soukromá jména se nahrazují, než cokoli odejde; každá služba má psaný strop a denní limit; jeden vypínač zastaví AI celou. Žádný klíč, skutečné jméno ani skutečný záznam není v žádném repozitáři, a tento repozitář byl před nahráním prohledán na klíče, e-maily a adresy serverů.

*Brian went through several separate security readings, focused on what can leave the phone, who can pass the AI door and what happens if a key leaks. Among what came out of them: the AI door passes only text whose first line the phone wrote; private names are replaced before anything leaves; every service has a written ceiling and a daily cap; one switch stops the AI entirely. No key, real name or real record is in any repository, and this repository was scanned for keys, emails and server addresses before it was pushed.*

## Do živé aplikace / Into the live app

Nic se nedostane do živé aplikace jinak než z majitelova počítače, jeho vlastními napsanými slovy, se zálohou předem, zkouškou na testovací kopii a předchozí verzí připravenou k návratu. *Nothing reaches the live app except from the owner's computer, on his own typed words, with a backup first, a rehearsal on a test copy and the previous version kept for rollback.*
