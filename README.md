# Pracovní koutek v Brianu / Brian's job corner

**Část soukromého plánovače Brian, přihlášená do AI výzvy pro Česko 2026, a recept, jak si stejný koutek postavit do vlastního druhého mozku.** Tento repozitář je ukázka a návod, ne samostatná aplikace: obsahuje zdrojové soubory pracovního koutku tak, jak běží uvnitř Brianu, a obrázky ze zkušební kopie se smyšlenými daty. Celý Brian, včetně jeho serveru a testů, zůstává v soukromém repozitáři, protože je to osobní aplikace jednoho člověka.

*Part of the private planner Brian, entered in the AI Challenge for Czechia 2026. This repository is a sample, not a standalone app: it holds the job corner's source files as they run inside Brian, and pictures from the test copy with made-up data. All of Brian, with its server and tests, stays in a private repository, because it is one person's personal app.*

## O Brianu / About Brian

Brian je soukromý plánovač života jednoho člověka: úkoly, kalendář, lidé, domácnost, kuchyně, knihovna a práce v jedné aplikaci na telefonu a počítači. Data žijí v telefonu a synchronizují se jen mezi vlastními zařízeními přes malý vlastní server; žádný účet, žádný cizí cloud, žádné reklamy. Na Brianu sedí Leo, hlasový asistent, který ví jen to, co mu majitel dovolil (zdraví a soukromá jména nikdy), a Atlas, místo, kde majitel vidí, co AI agenti právě stavějí, kolik to stojí a která pravidla platí.

Brian vznikl tak, že majitel, který neumí programovat, mluvil s AI agenty obyčejnými slovy a oni stavěli podle psaných pravidel: každá změna na vlastní větvi, s testem, s nezávislou kontrolou jinou AI relací, a do živé aplikace jen z jeho počítače se zálohou a zkouškou na testovací kopii. Pracovní koutek je jedna část Brianu: sleduje, co majitel umí, co mu chybí a co se učí, a když chce, hledá i práci.

*Brian is one person's private life planner: tasks, calendar, people, home, kitchen, library and work in one app on the phone and the computer. The data lives on the phone and syncs only between the owner's own devices through a small server of their own; no account, no third-party cloud, no ads. On top of Brian sit Leo, a voice assistant that knows only what the owner allowed (never health or private names), and Atlas, the place where the owner sees what the AI agents are building, what it costs and which rules apply. Brian came about by the owner, who cannot program, talking to AI agents in ordinary words while they built under written rules: every change on its own branch, with a test, with an independent review by another AI session, and into the live app only from his computer with a backup and a rehearsal on a test copy. The job corner is one part of Brian: it tracks what the owner can do, what they miss and what they are learning, and looks for jobs when they want.*

## Čím se liší / What is different

Většina nástrojů na hledání práce s AI píše za člověka: životopis, dopis, žádost. Brian jde schválně jinudy. Nepíše za mě. Řekne mi, co umím, co mi chybí a co se mám naučit první, rozloží to na denní kroky a nechá mě pohovor vyzkoušet nahlas. A není to zvláštní program na práci, ale koutek v plánovači, kde už mám svůj čas, svoje učení a svoje lidi. *Most AI job tools write for the person: the CV, the letter, the application. Brian deliberately goes another way. It does not write for me. It tells me what I can do, what I miss and what to learn first, breaks that into daily steps and lets me try the interview out loud. And it is not a separate job program but a corner in the planner where my time, my learning and my people already are.*

## Co koutek dělá / What the corner does

1. **Co mám a co mi chybí.** Jedno klepnutí na uloženém inzerátu pošle inzerát a dovednosti z profilu do AI, nikdy jméno, plat ani životopis, a uloží odpověď u inzerátu. *What I have and what I miss: one tap on a saved ad sends the ad and the skills from the profile to the AI, never the name, salary or CV, and keeps the answer on the ad.*
2. **Plán učení v malých krocích.** Mezery se stanou plánem a Today každé ráno nabídne jeden krok. Bez AI. *A learning plan in small steps: the gaps become a plan and Today offers one step each morning. No AI.*
3. **Cvičný pohovor s Leem.** Pět pravděpodobných otázek k inzerátu, odpovědi vlastními slovy, pak co fungovalo a co doplnit. Zpětná vazba smí ukazovat jen na to, co má člověk v profilu zapsané. *Interview practice with Leo: five likely questions for the ad, answers in your own words, then what worked and what to add. The feedback may only point to what the profile states.*
4. **Kde se ucházet.** Tlačítko pošle jen cíle a dovednosti do AI s vyhledáváním a vrátí asi pět inzerátů; nejvýš tři hledání denně. *Where to apply: the button sends only goals and skills to the AI with search and returns about five ads; at most three searches a day.*
5. **Denní hledání a Leo se ptá.** Jednou denně Brian hledá sám a Leo se nahlas zeptá, jestli chci jít do toho. *Daily search, and Leo asks out loud whether I want to go for it.*

## Co tu najdeš / What is here

- [ARCHITECTURE.md](ARCHITECTURE.md): jak je Brian postavený, jeho oblasti, a kde v něm sedí pracovní koutek, s obrázkem. *How Brian is built and where the job corner sits, with a picture.*
- [CHECKS.md](CHECKS.md): jak se každá změna kontroluje: testy, nezávislá kontrola, bezpečnostní čtení, cesta do živé aplikace. *How every change is checked: tests, independent review, security readings, the way into the live app.*
- [BUILD-IT-YOURSELF.md](BUILD-IT-YOURSELF.md): recept, jak si stejný koutek nechat postavit do vlastního druhého mozku, obyčejnými slovy, a tři hotové zprávy pro obyčejný chat s jakýmkoli modelem, i s tím, který běží u tebe doma. *A recipe for having the same corner built into your own second brain, in ordinary words, and three ready messages for a plain chat with any model, including one running at home.*

## Soubory / Files

- `code/career-profile.js`: profil, historie, dovednosti, cíle a plán učení. *Profile, history, skills, goals and the learning plan.*
- `code/interview-practice.js`: cvičný pohovor. *Interview practice.*
- `code/learn-dose.js`: denní krok učení na Today. *The daily learning step on Today.*
- `tests/`: pět sad testů koutku, k přečtení; co kontrolují je v [CHECKS.md](CHECKS.md). *Five test suites of the corner, to read; what they check is in CHECKS.md.*
- `pictures/`: obrazovky ze zkušební kopie (profil, inzerát s porovnáním a pohovorem, Kde se ucházet, Žádosti se scoutem, Leo se ptá na nalezenou práci), všechna data smyšlená. *Screens from the test copy, all data made up.*

Soubory se odkazují na zbytek Brianu (`index.html`, `store.js`, server v `proxy/`), takže samy o sobě neběží. *The files refer to the rest of Brian, so they do not run on their own.*

## Soukromí a hranice / Privacy and limits

Žádný účet, žádný cizí cloud, vlastní malý server s klíči, denními limity a vypínačem. Do AI nikdy nejde jméno, plat ani životopis; čtení životopisu je vypnuté, dokud ho majitel nezapne. Zpětná vazba nesmí vymyslet rok, nástroj ani certifikát. Každá změna má test a nezávislou kontrolu; aplikace má přes šedesát sad testů. *No account, no third-party cloud, a small server of one's own with keys, daily caps and an off switch. Name, salary and CV never go to the AI; CV reading is off until the owner turns it on. The feedback may not invent a year, a tool or a certificate. Every change has a test and an independent review; the app has over sixty test suites.*
