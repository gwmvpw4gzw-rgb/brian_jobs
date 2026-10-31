# Postav si to do svého druhého mozku
*Build it into your own second brain*

Lidí, kteří mají svůj „druhý mozek", je hodně: v Notion, v Obsidianu, v Apple Notes, v hromadě souborů, nebo ve vlastní aplikaci jako já. Pracovní koutek není nic, co by muselo být zrovna v Brianu. Je to recept. Tady je tak, jak bych ho řekl AI agentovi, aby mi ho postavil do toho, co už mám.

*Many people have a "second brain": in Notion, Obsidian, Apple Notes, a pile of files, or their own app like me. The job corner is not something that has to live in Brian. It is a recipe. Here it is the way I would say it to an AI agent so that it builds it into what I already have.*

## 1. Co musí tvůj mozek už vědět / What your brain must already know

- Kdo jsi v práci, pár vět. *Who you are at work, a few sentences.*
- Tvoje dovednosti s úrovní (umím použít, učím se, chci). *Your skills with a level.*
- Historie práce a certifikáty. *Work history and certificates.*
- Cíle na rok a na tři roky. *One-year and three-year goals.*
- Kolik máš dnes času, pokud chceš, aby ti učení plánoval. *How much time you have today, if you want it to plan your learning.*

Plat, poznámky o lidech a životopis jako celek do receptu nepatří. Nikam je neposílej.

## 2. Čtyři věci, které dělá AI / The four things the AI does

Každá je jeden jasný požadavek s jasným vstupem a výstupem. Obyčejnými slovy, tak jak jsem je říkal já:

1. **Co mám a co mi chybí.** „Tady je inzerát a tady moje dovednosti a cíle. Napiš tři odstavce: co z požadavků splňuju, co ne, a co se mám naučit první. Nic si nevymýšlej; když v mých dovednostech něco není, řekni, že to tam není." Výsledek se uloží k inzerátu, aby se neplatilo dvakrát.
2. **Plán učení.** Ze seznamu „co mi chybí" udělej úkoly „Nauč se X", každý s jednou větou, co je první krok. (Tohle jde i bez AI.)
3. **Cvičný pohovor.** „Tady je inzerát a můj profil. Dej mi pět otázek, které by u pohovoru padly." Po mých odpovědích: „Řekni, co fungovalo a co doplnit. Ukazuj jen na zkušenosti, které mám v profilu. Nikdy nevymýšlej rok, nástroj ani certifikát. Když k otázce nic nemám, řekni to a poraď, jak odpovědět pravdivě."
4. **Kde se ucházet.** „Tady jsou moje cíle a dovednosti, bez jména. Najdi na webu asi pět aktuálních inzerátů, které sedí, a ke každému napiš, proč." Nejvýš třikrát denně.

## 3. Co dělá tvůj mozek sám, bez AI / What your brain does by itself

- Každé ráno nabídne jeden krok z plánu učení a po odškrtnutí posune postup u té mezery.
- Když máš dnes víc volného času, nabídne delší blok učení.
- Drží žádosti ve fázích a po pár dnech bez odpovědi připomene follow-up.
- Pamatuje si, které inzeráty se ti líbily a proč.

## 4. Pravidla, která bych nevynechal / Rules I would not skip

- Do AI jde jen to, co ten jeden požadavek potřebuje. Nikdy jméno, plat, životopis, poznámky o lidech.
- Každá odpověď AI je návrh. Potvrdíš, nebo zahodíš. Nic se neposílá samo.
- Denní strop na počet volání a měsíční strop na peníze, napsaný tam, kde ho vidíš.
- Jeden vypínač, který AI vypne celou, a všechno ostatní dál funguje.
- Pokud si to necháváš stavět AI agentem: každá změna na vlastní větvi s testem, a nezávislá kontrola, než to pustíš k sobě.

## 5. Jak to říct agentovi / How to tell the agent

Zkopíruj body 1 až 4, přidej „postav to do [tvůj druhý mozek], nejdřív bez AI částí, pak po jedné s testem", a chtěj po něm, aby se nejdřív zeptal na všechno, co neví. Tak vznikl i tenhle koutek.

*Copy points 1 to 4, add "build this into [your second brain], first the parts without AI, then one AI part at a time with a test", and ask it to first ask you everything it does not know. That is how this corner came about too.*

## 6. Nemáš žádnou aplikaci? Stačí model / No app at all? A model is enough

Recept nepotřebuje Briana ani žádný „druhý mozek". Funguje v obyčejném chatu s jakýmkoli modelem: Claude, jiný model v prohlížeči, nebo model, který běží u tebe doma (třeba přes Ollamu), takže tvoje data zůstanou u tebe. Založ si jeden textový soubor `profil.txt` s body z části 1 (bez platu a bez jména) a používej tyhle tři zprávy:

*The recipe needs neither Brian nor any second brain. It works in a plain chat with any model: Claude, another model in the browser, or a model running at home (through Ollama, for example), so your data stays with you. Keep one text file `profil.txt` with the points from part 1 (no salary, no name) and use these three messages:*

**Co mám a co mi chybí / What I have and what I miss**

> Tady je můj profil a tady inzerát. Napiš tři krátké odstavce: co z požadavků splňuju, co ne, a co se mám naučit první. Nic si nevymýšlej; když v profilu něco není, napiš, že to tam není. Na konec přidej seznam „Nauč se: …" s jedním prvním krokem u každé položky.

**Cvičný pohovor / Interview practice**

> Tady je můj profil a inzerát. Dej mi pět otázek, které by u pohovoru nejspíš padly, jednu po druhé; po každé mé odpovědi počkej na další. Až odpovím na všech pět, napiš, co fungovalo a co doplnit. Ukazuj jen na to, co mám v profilu. Nikdy nevymýšlej rok, nástroj ani certifikát; když k otázce nic nemám, řekni to a poraď, jak odpovědět pravdivě.

**Kde se ucházet / Where to apply**

> Tady jsou moje cíle a dovednosti, bez jména. Když umíš hledat na webu, najdi asi pět aktuálních inzerátů, které sedí, a ke každému napiš jednou větou proč. Když hledat neumíš, řekni mi místo toho, jaké názvy pozic a jaká klíčová slova mám hledat sám.

Denní krok učení si pak dělej sám: každé ráno jedna položka ze seznamu „Nauč se", a odškrtni ji. Pravidla z části 4 platí i tady, hlavně: do chatu nikdy nedávej plat, jméno ani celý životopis, a každou odpověď ber jako návrh.
