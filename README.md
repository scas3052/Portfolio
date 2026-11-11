# Jalli Gopichand — Developer Portfolio

A modern, responsive and animated personal portfolio built with **React 19** and **Vite**.

The same project also holds **Gullak**, a private personal-finance book on its own page (`/finance/`) with a completely different look. See [Gullak — personal finance page](#gullak--personal-finance-page). Gullak has its own AI assistant, **Munshi**, which answers questions about your money and turns plain sentences like "spent 250 on lunch" into entries you confirm. See [Munshi — Gullak's AI assistant](#munshi--gullaks-ai-assistant).

## Features

- **Dark / light theme** with a circular reveal transition (View Transitions API). Dark is the default, and the visitor's choice is remembered.
- **Interactive hero** with an animated neural-network canvas, a typewriter role line and a code-editor card.
- **Motion design** using [Motion](https://motion.dev): split-text hero name, hero scroll parallax, 3D pointer tilt on the code window (with a moving glare) and project cards, pointer-parallax badges, magnetic buttons, a cursor glow, a two-row infinite tech marquee, animated nav and filter pills, a scroll progress bar, a back-to-top progress ring, a scroll-filled education timeline, staggered reveals, a rotating CTA border and an aurora backdrop. Everything respects the visitor's *reduced motion* setting.
- **Sections:** About (with animated stats), Skills, filterable Projects, Experience, Education & Certifications, and Contact.
- **Contact options:** one-click email copy and a form that opens the visitor's email app with the message pre-filled.
- **Accessibility:** responsive from 320 px up, keyboard friendly (skip link, visible focus rings, `aria` labels).
- **All content in one file:** [`src/data/portfolio.js`](src/data/portfolio.js).
- **Finance switch** in the navbar that opens Gullak. It can be turned off with one flag (see below).

## Tech stack

| Area      | Tools                                                    |
| --------- | -------------------------------------------------------- |
| Framework | React 19, Vite                                           |
| Animation | Motion (`motion/react`), Canvas 2D                       |
| Styling   | Hand-written CSS with design tokens (custom properties)  |
| Icons     | react-icons (Lucide, Simple Icons, Font Awesome)         |
| Fonts     | Portfolio: Inter, Space Grotesk and JetBrains Mono. Gullak: Bricolage Grotesque, Manrope and Geist Mono (all self-hosted via Fontsource) |
| AI assistant | Free LLM APIs (Groq, OpenRouter, Cerebras, NVIDIA, Mistral, Hugging Face, Gemini) behind a small serverless relay: Vercel or Netlify Functions in production, a Vite plugin in dev and preview |
| Quality   | ESLint (React Hooks + React Refresh rules), Node's built-in test runner |

## Getting started

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+ (the tests need 22.15+).

```bash
npm install       # install dependencies
npm run dev       # start the dev server at http://localhost:5173 (Gullak is at /finance/)
npm run build     # production build into dist/
npm run preview   # preview the production build locally
npm run lint      # lint the source
npm test          # run Munshi's unit tests
```

Munshi, Gullak's assistant, needs a passphrase and at least one free AI key in `.env.local`. Everything else works without them. See [Set it up locally](#set-it-up-locally).

## Editing your content

Everything shown on the site lives in **`src/data/portfolio.js`**:

| Export                          | What it controls                                                    |
| ------------------------------- | ------------------------------------------------------------------- |
| `profile`                       | Name, roles (typewriter), tagline, availability, contact details, links |
| `about`                         | Bio paragraphs, quick facts, stats and "What I do" cards            |
| `skillGroups`, `concepts`       | Skill cards and the "Core concepts" strip                           |
| `marquee`                       | Scrolling tech strip under the hero                                 |
| `projects`, `projectFilters`    | Project cards (title, icon, categories, cover colours, description, optional `highlights`, tech). Add a `repo` link for public code; without one, the card shows a "Built at {`org`} · Proprietary code" badge |
| `experience`                    | Work experience / internships (with an optional `period`)           |
| `education`, `certifications`   | Education timeline and certification cards                          |

### Add a profile photo

1. Put the image in `public/`, for example `public/avatar.jpg`.
2. In `src/data/portfolio.js`, set `avatar: 'avatar.jpg'` on the `profile` object.

Until you add a photo, a gradient "JG" monogram is shown.

### Update the résumé

Replace `public/Jalli_Gopichand_Resume.pdf`. If the file name changes, update `profile.resumeFile`.

### Change colours or fonts

The design tokens (colours, gradients, radii, fonts) for both themes are at the top of `src/styles/global.css`.

## Gullak — personal finance page

Gullak is a private money book that sits next to the portfolio but shares nothing with it visually: a paper-and-ink, sticker-and-stamp look with its own fonts and its own animations. Open it with the **Finance** switch in the portfolio navbar, or go straight to `/finance/`. The page is marked `noindex`, so search engines skip it.

Every money movement is one of eight entry types: spend, income, transfer between your own accounts, EMI payment, lend, borrow, collect (money paid back to you) and repay (money you paid back). The sections work out the rest:

| Section      | What it shows                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Overview     | Net worth, a savings jar that fills with your savings rate, a swipeable deck of heads-up cards (EMIs due soon, budgets running out, money to collect), spending pace against budget, a category treemap, upcoming EMIs, six-month bars and a 26-week spending calendar with no-spend streaks |
| Activity     | The full ledger with search and filters. Tap an entry to edit it, swipe it left to delete it (with undo)       |
| Spending     | Category treemap and ranking, biggest spends, spends by weekday and where income came from                    |
| Accounts     | Bank accounts, cards, wallets and cash as flip cards (tap one to see the month's money in and out), cash on hand and transfers |
| EMIs & loans | Each loan as a punch card with EMIs paid, amount left and interest, plus how the monthly EMI total drops over the next 12 months |
| People       | Who owes you and who you owe on a tilting balance scale, with one-tap settle up and a friendly reminder you can share |
| Plan         | Monthly category budgets with how much is safe to spend each day, and savings goals as jars you add money to   |
| Settings     | Name, theme, PIN, Munshi (the AI assistant), backup and restore, CSV export, sample data and erase              |

Also included:

- **Munshi, an AI assistant** that answers questions about your money and drafts entries from plain sentences, saving nothing until you confirm. See [Munshi — Gullak's AI assistant](#munshi--gullaks-ai-assistant).
- **Amount boxes are calculators:** type `240+65` or `1200/4` and Gullak works it out.
- **Command palette** to search entries and run any action.
- **Privacy mode** hides every amount, for using it in public.
- **Paper (light) and ink (dark) themes**, remembered per browser.
- **Optional 4-digit PIN** that locks Gullak when it opens and after 2 minutes in the background.
- **Small celebrations** (a stamp and a burst of coins) when a goal is reached, a loan is paid off or a friend is settled.
- **Sample data** to explore before adding your own, and a mobile layout with a bottom tab bar.

### Your data

Everything is saved only in this browser's `localStorage` (key `gullak:v1`). Nothing leaves the browser unless Munshi asks the AI something for you (see [what Munshi sends](#privacy)), and every visitor gets their own empty book, so publishing the page never exposes your entries. Clearing site data or switching browser or device starts fresh, so download a JSON backup from **Settings → Backup** now and then; it restores on any device. Entries can also be exported as CSV for Excel or Google Sheets.

The PIN is a privacy curtain, not encryption: it hides the screen, but the data stored in the browser is not encrypted.

### Keyboard shortcuts

| Keys                  | Action                                  |
| --------------------- | --------------------------------------- |
| `Ctrl`/`⌘` + `K` or `/` | Search entries and commands           |
| `N` / `I`             | Log a spend / log income                |
| `A`                   | Ask Munshi                              |
| `Ctrl`/`⌘` + `J`      | Open or close Munshi                    |
| `H`                   | Hide or show amounts                    |
| `T`                   | Paper or ink theme                      |
| `L`                   | Lock (when a PIN is set)                |
| `1` to `8`            | Jump to a section, in sidebar order     |
| `[` / `]`             | Previous / next month                   |
| `?`                   | Show all shortcuts                      |

In a form, `Enter` saves, `Ctrl`/`⌘` + `Enter` saves and starts another entry, and `Esc` closes it. In Munshi, `Enter` sends, `Shift` + `Enter` starts a new line, and `Esc` closes the panel (unsaved drafts stay there).

### Turning it off

Set `FINANCE_ENABLED = false` in [`src/config.js`](src/config.js). The navbar switch disappears, Gullak is left out of the production build and the dev server stops serving Munshi's relay. The Vercel and Netlify relay functions still deploy with the site, but they refuse every request until `AGENT_PASSPHRASE` and a provider key are set, so leave those unset.

## Munshi — Gullak's AI assistant

Munshi lives inside Gullak and never appears on the portfolio. Ask it about your money in plain words, or tell it what happened and it drafts the entries for you.

- **Answers from your own book:** "How much did I spend on food this month?", "Who owes me money?", "How much is left on the bike loan?". It looks the figures up with tools instead of guessing.
- **Plain sentences become draft cards:** "spent 250 on lunch and 120 on an auto", "lent 500 to Ravi", "got salary 72k in HDFC", "paid bike EMI". Nothing is saved until you press **Confirm** on a card or **Confirm all**. Most drafts open in the usual form if you want to change them, a discarded draft can be restored, and everything you confirm can be undone from its toast.
- **Beyond new entries:** it also drafts changes to existing entries, deletions, monthly budgets, money for a savings goal, and new accounts, loans and goals.
- **Quick add:** simple entries like the ones above are read on your device, so they work offline and without a passphrase. If it misread you, press **Ask the AI instead**. Questions and anything unclear go to the AI.
- **Voice:** the mic button types what you say, in English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi or Bengali, where the browser supports speech recognition.

Open it with the red **Munshi** button in the bottom-right corner, `A` or `Ctrl`/`⌘` + `J`, or from the command palette, where typing a question and choosing **Ask "…"** sends it straight to Munshi. It shows up once your book is set up and hides while Gullak is locked.

### How it works

AI providers need a secret API key, and a key must never reach the browser. So Munshi talks to a small relay at `/api/agent` that keeps the keys on the server:

1. Your question goes to the relay with your passphrase. The relay checks the passphrase and the page's origin, so strangers can't use it as a free proxy for your keys.
2. The relay forwards the chat to the first provider that has a key. If one is rate-limited, down or rejects its key, the next one takes over.
3. The model asks for what it needs through read-only tools (overview, entries, accounts, people, loans, budgets, goals and a calculator). Gullak runs them in your browser and sends back only their results.
4. Changes come back as draft cards. The model can't save, edit or delete anything by itself.

The relay code is shared ([`server/agentRelay.js`](server/agentRelay.js)), with a thin wrapper for each host: a Vite plugin in dev and preview, [`api/agent.js`](api/agent.js) on Vercel and [`netlify/functions/agent.mjs`](netlify/functions/agent.mjs) on Netlify. It only ever calls the providers listed below.

### Set it up locally

1. Get a free API key from at least one provider in the [table below](#providers). Groq is tried first by default.
2. Copy [`.env.example`](.env.example) to `.env.local`, then set `AGENT_PASSPHRASE` (12 or more characters) and your key or keys. `.env.local` is git-ignored.
3. Run `npm run dev`. It reads `.env.local` and restarts by itself when the file changes. `npm run build` followed by `npm run preview` runs the relay too.
4. In Gullak, open **Settings → Munshi**, type the same passphrase and press **Unlock Munshi**, then **Test connection**. It tells you which provider and model answered, and how fast.

### Deploy the relay

- **Vercel:** [`api/agent.js`](api/agent.js) is picked up automatically. Add the variables under **Project → Settings → Environment Variables**, then redeploy.
- **Netlify:** [`netlify.toml`](netlify.toml) points Netlify at [`netlify/functions/`](netlify/functions). Add the variables under **Site configuration → Environment variables**, then redeploy.
- **GitHub Pages** and other static hosts can't run functions. Deploy the same repository to Vercel or Netlify just for the relay, set `AGENT_ALLOWED_ORIGINS=https://<you>.github.io` there, and enter the full relay URL (for example `https://<project>.vercel.app/api/agent`) in **Settings → Munshi → Relay address**.

Never prefix these variables with `VITE_`. Vite would bake them into the public JavaScript.

| Variable                | Needed       | What it does                                                                              |
| ----------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `AGENT_PASSPHRASE`      | Yes          | The passphrase you type in Gullak, 12 or more characters. Without it the relay stays off  |
| A provider key          | At least one | Every provider with a key is used, in the order of the table below                        |
| `AGENT_PROVIDERS`       | No           | Comma-separated provider ids that set the order and which providers are used, e.g. `groq,openrouter` |
| `<ID>_MODEL`            | No           | Swaps a provider's model, e.g. `GROQ_MODEL=openai/gpt-oss-20b`                            |
| `AGENT_ALLOWED_ORIGINS` | No           | Other sites allowed to call the relay, comma-separated. Its own site is always allowed    |

### Providers

All of these have free tiers. With more than one key, Munshi keeps working when one provider is busy.

| Provider        | Id           | Key variable                                     | Default model                 | Get a key |
| --------------- | ------------ | ------------------------------------------------ | ----------------------------- | --------- |
| Groq            | `groq`       | `GROQ_API_KEY`                                   | `openai/gpt-oss-120b`         | [console.groq.com/keys](https://console.groq.com/keys) |
| OpenRouter      | `openrouter` | `OPENROUTER_API_KEY`                             | `openrouter/free`, which picks a free model that can use tools | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Cerebras        | `cerebras`   | `CEREBRAS_API_KEY`                               | `gpt-oss-120b`                | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| NVIDIA NIM      | `nvidia`     | `NVIDIA_API_KEY`                                 | `meta/llama-3.3-70b-instruct` | [build.nvidia.com](https://build.nvidia.com) |
| Mistral         | `mistral`    | `MISTRAL_API_KEY`                                | `mistral-small-latest`        | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| Hugging Face    | `hf`         | `HF_TOKEN`                                       | `openai/gpt-oss-120b`         | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| Gemini          | `gemini`     | `GEMINI_API_KEY`                                 | `gemini-3.8-flash`            | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Your own server | `custom`     | `CUSTOM_LLM_BASE_URL`, plus `CUSTOM_LLM_API_KEY` if it needs one | `CUSTOM_LLM_MODEL`, or `llama3.1` | Any OpenAI-compatible server, such as Ollama at `http://localhost:11434/v1`. Local dev only: a deployed relay can't reach your computer |

In **Settings → Munshi → AI provider** you can pin one provider. It is tried first, and the others stay as fallbacks.

### Limits

- Free tiers are rate-limited. When every provider is busy, Munshi says so; try again shortly or add another key.
- One question takes at most 5 rounds with the model, and only the last 8 chat messages go with it. Each reply is capped at 1,500 tokens.
- Vercel (as set in `api/agent.js`) and Netlify stop a function after 60 seconds.

### Privacy

- **What is sent:** your message, the last few chat messages, your name, today's date, the names in your book (accounts, people, loans, goals and categories with a budget, so it can match "Ravi" or "HDFC") and the results of the tools it runs for that question. Never your whole book or a backup.
- **Quick add** entries never leave your device.
- **The relay** stores and logs nothing. Providers may: free tiers can log prompts or use them for training, so read a provider's terms before adding its key.
- **Privacy mode** only hides amounts on screen. It doesn't change what Munshi sends.
- **On this device:** Munshi's settings, the passphrase and the last 50 chat messages are kept in this browser and never go into backups. Turn off **Remember on this device** to keep the passphrase for this tab only, or press **Forget passphrase**. **Erase everything** also clears the chat.

### Tests

`npm test` runs Munshi's unit tests in [`tests/`](tests) with Node's built-in test runner (Node 22.15+). They cover quick add, name matching, building and saving drafts, undo, the chat loop and the relay client. Everything is mocked, so they need no keys or network.

## Project structure

```
public/                 favicon + résumé PDF
finance/index.html      Gullak's page (served at /finance/)
server/                 Munshi's relay (agentRelay.js), its provider list (providers.js) and the Vite dev/preview plugin
api/agent.js            the relay as a Vercel Function
netlify/functions/      the relay as a Netlify Function (netlify.toml holds the build settings)
tests/                  Munshi's unit tests (npm test)
.env.example            relay settings template (copy it to .env.local)
src/
  components/           one component per section (each with its own .css), plus the navbar Finance switch
  data/portfolio.js     all site content
  hooks/                useTheme, useActiveSection, useTypewriter, useMediaQuery, useTilt
  styles/global.css     design tokens, base styles, shared utility classes
  utils/motion.js       shared animation easing
  utils/spotlight.js    cursor "spotlight" effect for cards
  config.js             FINANCE_ENABLED flag
  App.jsx               page layout
  main.jsx              entry point
  finance/              Gullak
    FinanceApp.jsx      app shell, page transitions and keyboard shortcuts
    main.jsx            Gullak's entry point
    views/              the eight sections
    agent/              Munshi: chat loop, tools, prompt, quick add, drafts and saving, relay client
    components/         cards, charts, forms, overlays (sheets, palette, lock screen, toasts), the shell (sidebar, top bar, tab bar) and Munshi's panel (agent/)
    store/              FinanceProvider + reducer (your data), UiProvider (sheets, toasts, theme, privacy, lock)
    lib/                money maths, selectors, insights, dates, storage, backup and CSV, PIN
    hooks/              small shared hooks
    styles/             Gullak's design tokens and styles (agent.css is Munshi's)
```

## Deployment

`vite.config.js` uses `base: './'`, so the build in `dist/` works from any path: a domain root, a sub-folder or GitHub Pages. The build has two pages, `dist/index.html` (the portfolio) and `dist/finance/index.html` (Gullak), and both work on any static host as they are.

- **Vercel / Netlify:** import the repository. Build command `npm run build`, output directory `dist` (`netlify.toml` already sets these for Netlify). To turn on Munshi, add its environment variables (see [Deploy the relay](#deploy-the-relay)). Without them `/api/agent` stays off and everything else works as usual.
- **GitHub Pages:** run `npm run build` and publish the `dist/` folder, for example with the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package (`npx gh-pages -d dist`) or a GitHub Actions Pages workflow. GitHub Pages can't run Munshi's relay, so host the relay on Vercel or Netlify (see [Deploy the relay](#deploy-the-relay)).
