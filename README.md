# Jalli Gopichand — Developer Portfolio 

A modern, responsive and animated personal portfolio built with **React 19** and **Vite**.

The same project also holds **Gullak**, a private personal-finance book on its own page (`/finance/`) with a completely different look. See [Gullak — personal finance page](#gullak--personal-finance-page). Gullak has its own AI assistant, **Munshi**, which answers questions about your money and turns plain sentences like "spent 250 on lunch" into entries you confirm. See [Munshi — Gullak's AI assistant](#munshi--gullaks-ai-assistant). The book can also sync across all your browsers and devices through a free Firebase project. See [Cloud sync (Firebase)](#cloud-sync-firebase).

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
| Cloud sync | Firebase on the free Spark plan: Authentication (Google sign-in) and Cloud Firestore, loaded only once sync is used |
| Quality   | ESLint (React Hooks + React Refresh rules), Node's built-in test runner |

## Getting started

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+ (the tests need 22.15+).

```bash
npm install       # install dependencies
npm run dev       # start the dev server at http://localhost:5173 (Gullak is at /finance/)
npm run build     # production build into dist/
npm run preview   # preview the production build locally
npm run lint      # lint the source
npm test          # run the unit tests (Munshi, cloud sync and payment capture)
npm run dev:app   # the Android app's screens in the browser, with sample payments (http://localhost:5174)
npm run build:app # Gullak alone into dist-app/, for the Android app
```

Munshi, Gullak's assistant, needs a passphrase and at least one free AI key in `.env.local`. Everything else works without them. See [Set it up locally](#set-it-up-locally). Cloud sync is optional too: it only appears once the `VITE_FIREBASE_*` variables are set. See [Cloud sync (Firebase)](#cloud-sync-firebase). For the phone app, see [Gullak Android app](#gullak-android-app).

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
| Settings     | Name, theme, PIN, backup and restore, CSV export, sync across devices, Munshi (the AI assistant), sample data and erase |

Also included:

- **Munshi, an AI assistant** that answers questions about your money and drafts entries from plain sentences, saving nothing until you confirm. See [Munshi — Gullak's AI assistant](#munshi--gullaks-ai-assistant).
- **Optional sync across devices:** sign in with Google and the same book shows up in every browser and on every device, kept in your own free Firebase project that only your account can open. See [Cloud sync (Firebase)](#cloud-sync-firebase).
- **Amount boxes are calculators:** type `240+65` or `1200/4` and Gullak works it out.
- **Command palette** to search entries and run any action.
- **Privacy mode** hides every amount, for using it in public.
- **Paper (light) and ink (dark) themes**, remembered per browser.
- **Optional 4-digit PIN** that locks Gullak when it opens and after 2 minutes in the background.
- **Small celebrations** (a stamp and a burst of coins) when a goal is reached, a loan is paid off or a friend is settled.
- **Sample data** to explore before adding your own, and a mobile layout with a bottom tab bar.

### Your data

Your book is saved in this browser's `localStorage` (key `gullak:v1`), so Gullak opens instantly and works offline. Nothing leaves the browser unless Munshi asks the AI something for you (see [what Munshi sends](#privacy)) or you turn on sync, and every visitor gets their own empty book, so publishing the page never exposes your entries.

To see the same book in another browser or on another device, turn on [cloud sync](#cloud-sync-firebase). Without it, clearing site data or switching browser or device starts fresh. Either way, download a JSON backup from **Settings → Backup** now and then; it restores on any device. Entries can also be exported as CSV for Excel or Google Sheets.

The PIN is a privacy curtain, not encryption: it hides the screen, but the data stored in the browser is not encrypted. With sync on, the PIN travels with the book, so every synced device asks for it.

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

## Cloud sync (Firebase)

Gullak can keep one book across every browser and device you use. You sign in with Google, and the book is mirrored to Cloud Firestore in your own Firebase project on the free **Spark** plan, which is plenty for one person's money book. Sync is optional. Until the project's settings are in the build there's no sign-in button anywhere and Gullak works exactly as before, and the Firebase code only downloads for someone who actually uses sync.

### How sync works

- **Each browser keeps a working copy.** Gullak still reads and writes `localStorage`, so it opens instantly and works offline. Every change is sent to the cloud in the background. Changes made offline wait on the device, even if you close the tab, and go up once you're back online.
- **Other devices update live.** An entry added on your phone shows up on your laptop within seconds. If two devices change the same thing, the change that reaches the cloud last wins.
- **Only you get in.** The Firestore rules let in only the Google account you list in them. Anyone else who signs in on your site is told sync is private, signed out again, and nothing on their device changes.
- **Turning it on:** open **Settings → Sync → Turn on sync** (or **Sign in to sync** on the welcome screen, or the cloud badge in the top bar) and press **Continue with Google**. What happens next depends on where your entries are:
  - If the cloud is empty, this device's book is uploaded.
  - If this device is empty, the cloud book comes down.
  - If both have entries, you choose: **Use the cloud book**, **Merge both**, or press and hold **Replace the cloud book** to give every device this one's book. You can download a backup of either book first.
- **What syncs:** entries, accounts, loans, people, goals, budgets, your name and the PIN. Hiding amounts, the paper or ink theme, and Munshi's settings and chat stay on each device.
- **Signing out:** **Settings → Sync → Sign out of this device** keeps the book in the cloud and removes it from this browser, along with Munshi's chat. If some changes haven't reached the cloud yet, Gullak waits a few seconds for them and asks before anything is lost.
- **Forgot the PIN on a synced device?** The PIN syncs, so it can't be reset from one device alone. Choose **Forgot PIN?** on the lock screen, then **Confirm with Google** to remove the PIN on every device, or press and hold **Remove from this device** to take the book off just this one.
- **Restoring a backup, loading the sample data and erasing everything** on a synced device also change the cloud and every other synced device. Gullak says so before you confirm.
- **The status** shows as a cloud badge in the top bar and in **Settings → Sync**, with the account, when it last synced, how many changes are waiting, and a button for whatever needs fixing.

### Set up sync

1. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com). Google Analytics isn't needed. New projects start on the free Spark plan, so no billing account is involved.
2. **Register a web app:** in **Project settings → General → Your apps**, add a **Web** app (`</>`). Firebase Hosting isn't needed. Keep the `firebaseConfig` values it shows; you can find them there again later.
3. **Turn on Google sign-in:** in **Authentication → Sign-in method**, add **Google**, enable it, pick a support email and save. Then in **Authentication → Settings → Authorized domains**, add the domain your site runs on (for example `your-site.netlify.app` or your own domain). `localhost` is already there for development.
4. **Create the database:** in **Firestore Database**, choose **Create database**. Pick the **Standard** edition if asked, a location near you (it can't be changed later) and **production mode**.
5. **Deploy the security rules** with the Firebase CLI:

   ```bash
   cp firestore.rules.example firestore.rules   # then put your Google email, in lower case, in owners()
   npx firebase-tools login
   npx firebase-tools deploy --only firestore --project your-project-id
   ```

   Your `firestore.rules` copy is git-ignored, so your email stays out of the repository. The same command deploys [`firestore.indexes.json`](firestore.indexes.json), which switches off search indexes that sync never uses so writes stay small. Until the rules are deployed, production mode refuses every request.
6. **Give the site the project's settings.** For development, put the values from step 2 in `.env.local` (see [`.env.example`](.env.example)):

   ```ini
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_APP_ID=...
   ```

   For the live site, add the same variables in Netlify (**Site configuration → Environment variables**) or Vercel (**Project → Settings → Environment Variables**) and redeploy. Vite builds them into the page, so a change only takes effect after the next build. They aren't secrets: they only name your project, and the rules from step 5 decide who gets in.
7. **Turn it on, once per device:** open Gullak, go to **Settings → Sync → Turn on sync** and press **Continue with Google**. Do the same on each browser and device you use.

If sign-in fails, Gullak says why. The usual causes are a blocked popup, a site domain missing from **Authorized domains** (step 3), or Google sign-in not being enabled.

### Spark plan limits

The Spark plan never bills you. If a daily limit runs out, Firebase refuses requests until it resets around midnight Pacific time. Gullak then shows **Daily limit reached**, keeps working on each device, and sends the waiting changes after the reset.

| Spark plan allows         | How Gullak uses it                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| 50,000 reads a day        | Opening Gullak reads the whole book once: one document for accounts, loans, people, goals, budgets and settings, plus one per month of entries. Live updates then read only what changed |
| 20,000 writes a day       | About one per change                                                                                    |
| 1 GiB stored              | Years of entries take a few megabytes. Each month of entries is one document, and Firestore's 1 MiB per document leaves room for a few thousand entries a month |
| 10 GiB downloaded a month | Each open downloads the book once                                                                       |

### Who can see your book

- Only the Google account(s) listed in `firestore.rules` can read or write the cloud book, and each one only reaches its own folder (`users/<uid>/book`). Visitors who never sign in never talk to Firebase.
- Google encrypts Firestore data at rest, but it isn't end-to-end encrypted: whoever manages the Firebase project can read the book in the Firebase console. Keep the project in your own Google account.
- The PIN syncs as the same hash Gullak keeps in the browser, never as the digits. It's still a privacy curtain, not encryption.
- Firebase remembers the sign-in in the browser so sync keeps working. On a device you don't own, sign out when you're done.

### Turning sync off

- **On one device:** **Settings → Sync → Sign out of this device**. The book stays in the cloud for your other devices.
- **For the whole site:** remove the `VITE_FIREBASE_*` variables and redeploy. The sign-in button disappears. Devices that were syncing show **Sync unavailable** but keep their book and any changes that hadn't reached the cloud yet, and those go up if you add the variables back. Signing out from that state removes the book from the device, so download a backup first.
- **To delete the cloud copy:** use **Settings → Danger zone → Erase everything** on a synced device, which empties the book everywhere, or delete the Firebase project.

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

`npm test` runs the unit tests in [`tests/`](tests) with Node's built-in test runner (Node 22.15+). Munshi's (`tests/agent/`) cover quick add, name matching, building and saving drafts, undo, the chat loop and the relay client. The [cloud sync](#cloud-sync-firebase) tests (`tests/cloud/`, `tests/store/`) cover how the book is split into documents, merging, the offline queue, live updates, linking, signing out and the forgotten-PIN flow, against an in-memory stand-in for Firestore. The [Android app](#gullak-android-app) tests (`tests/inbox/`, `tests/agent/spends.test.mjs`, `tests/server/`) cover the SMS, notification and bank email parser, account matching, category suggestions, transfer pairing, statement import (CSV, Excel and HTML exports), the weekly balance check, Munshi's filing tools and `/api/app`. Everything is mocked, so they need no keys, Firebase project or network. The Java side of the parser has its own tests (`native/android/app/src/test/`), run by Gradle in GitHub Actions.

## Gullak Android app

Gullak (not the portfolio) also comes as an Android app. It's the same Gullak, with your book synced through the same Google sign-in, plus things a website can't do:

- **Payments are caught for you.** Bank SMS (as they arrive, plus a catch-up scan of the inbox), payment notifications from Google Pay, PhonePe, Paytm, slice, CRED, BHIM, Navi, super.money, MobiKwik, YONO SBI, ICICI iMobile and the HDFC Bank app, and bank emails are kept as *unfiled spends*. Any other app can be added in Settings → Payment capture → **Add another app**. Nothing goes into your book until you say what it was.
- **Bank emails count too.** Some accounts email you instead of texting (slice does). Gullak reads the notification Gmail or Outlook shows for an email from a sender listed in Settings → Payment capture → **Bank emails** (slice is listed out of the box; add any other bank's sender there) and catches the payment in it. Every other email is ignored.
- **Accounts that tell you nothing are covered too.** For an account that sends no SMS, no app alert and no email, **Import a statement** reads the bank's CSV or Excel export whenever you like and adds only what Gullak doesn't have yet, and the **weekly balance check** asks what your bank shows and points out money Gullak never heard about.
- **It asks what each one was for.** Right after a payment, a notification asks "₹500 at Swiggy, what was it for?" and you can reply from the notification ("dinner, split with Ravi"). When you open Gullak, Home shows "3 unfiled spends · tap to file", and every card asks the same question. Your answer files the payment into the right category, and Gullak remembers the category for next time.
- **Munshi does the filing.** Tell Munshi in plain words: "the 1,200 at Amazon was a gift for Amma", "split the Swiggy one with Ravi", "Uber is always Transport". It drafts the entries, splits, sets aside what isn't a spend and remembers rules. You confirm each draft.

### How it's built

- `npm run build:app` builds Gullak on its own into `dist-app/` (from `app/index.html` and `vite.app.config.js`). The website build (`npm run build`) is unchanged: app-only code lives in `src/finance/app/` and `src/finance/inbox/` and never loads on the website.
- [Capacitor 8](https://capacitorjs.com) wraps `dist-app/` as an Android app. `android/` is generated, not committed: `npm run android:prepare` creates it from Capacitor's template and copies Gullak's native code from `native/android/` over it.
- The native code (`native/android/app/src/main/java/com/scas3052/gullak/`) has the SMS receiver and inbox scan, the notification listener (payment apps, and mail apps for bank emails), "Share to Gullak", the "what was it for?" notification with Reply, the weekly balance reminder (`BalanceReminder.java`) and a small SQLite store of unfiled spends on the phone.
- The apps whose notifications are read are listed once, in `PaymentApps.java`; apps added in Settings are read the same way. There's no per-app parser: one parser reads every app's alerts, and an app only needs a rule when its wording is unusual. Mail apps (Gmail, Outlook, Samsung Email, Yahoo Mail) are listed there too, but only emails from the senders in Settings → Bank emails are read; `MailSenders.java` does the matching.
- `SpendMerger.java` decides when messages are one payment: an SMS, an app alert, a bank email and a statement line for the same amount merge (an email up to two hours after the others, unless it names another account or bank), and so do two different apps' alerts (Google Pay and the bank's own app both reporting one payment) unless they name different accounts or payees. Two messages from the same place never merge without a shared reference number.
- The parser exists twice, `PaymentParser.java` on the phone and `src/finance/inbox/parse.js` for the tests and the browser preview. Both are tested against the same examples in `native/android/app/src/test/resources/payment-fixtures.txt` (bank SMS, app alerts, bank emails and shared text); add a new bank, app or email format there and both sides must handle it.
- Statements are read in the web code (`src/finance/inbox/statement.js`, and `xlsx.js` for Excel files without a library), checked against the book and the payments already caught, and only the new lines go to the phone's store. The balance check is in `balance.js`.
- GitHub Actions builds, tests and signs the APK. `scripts/upload-apk.mjs` publishes it to Vercel Blob, and `/api/app` ([`api/app.js`](api/app.js)) tells the website and the app which build is newest.

### One-time setup

**Vercel**

1. Storage → Create → **Blob**, with **Public** access (it can't be changed later), and connect it to this project.
2. Add `https://localhost` to `AGENT_ALLOWED_ORIGINS` (comma-separated with any others), so the app can reach Munshi's relay. Redeploy.

**GitHub** → Settings → Secrets and variables → Actions

3. Secret `ANDROID_KEYSTORE_PASSWORD`: a strong password (12+ characters). Save it in your password manager too.
4. Actions → **Android signing key** → Run workflow. Follow the run's summary: paste the artifact's `.txt` into the secret `ANDROID_KEYSTORE_BASE64`, back up the `.jks` file and the password somewhere other than the office laptop, then delete the artifact. Note the SHA-1 it shows.
5. Secret `BLOB_READ_WRITE_TOKEN`: Vercel → Storage → your Blob store → the token shown under `.env.local`.
6. Variables: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (the same values as the website), `VITE_GOOGLE_WEB_CLIENT_ID` (step 8) and `GULLAK_SITE_URL` (your site, e.g. `https://your-site.vercel.app`).

**Firebase console**

7. Project settings → Your apps → Add app → **Android**, package name `com.scas3052.gullak`, then add the SHA-1 (and SHA-256) from step 4. You don't need its `google-services.json`.
8. Authentication → Sign-in method → Google → Web SDK configuration → copy the **Web client ID** into the `VITE_GOOGLE_WEB_CLIENT_ID` variable.
9. If your Firebase API key has website restrictions (Google Cloud console → Credentials), allow `localhost` too.
10. Turn on cloud sync on the website, so your book is in the cloud before you first sign in on the app.

**Then**

11. Run `npm install` (it adds Capacitor to `package-lock.json`), commit and push. Actions → **Android app** → Run workflow publishes the first APK.

The signing key and the app id (`com.scas3052.gullak`) are permanent. Android only installs an update that's signed with the same key, so if the key is lost, the app has to be uninstalled and installed again (with sync on, your book comes back).

### Install it on your phone

1. Open the Gullak site in Chrome on the phone → Settings → About → **Get the Android app** → Download.
2. If Play Protect blocks it: Play Store → your profile → Play Protect → ⚙ → pause scanning for now.
3. Open the downloaded file → allow Chrome to install apps → Install.
4. Settings → Apps → Gullak → ⋮ → **Allow restricted settings**. Android needs this before an app installed from Chrome can read SMS or notifications.
5. Open Gullak → sign in with Google → Settings → **Payment capture** → allow SMS, notification access and notifications, and pick how far back to look (none, 7 or 30 days). Add any other app that tells you about payments with **Add another app**, check **Bank emails** lists the sender of your bank's emails (slice is there already), and switch on the **weekly balance check** for accounts that send no alerts.
6. If a bank emails you (slice does), make sure the phone notifies you about those emails: Gullak can only read emails that show a notification. Gmail notifies for the Primary tab by default, so if they land in Updates, open one in Gmail on a computer → ⋮ → **Filter messages like these** → **Create filter** → Categorise as **Primary**.
7. Turn Play Protect back on. For Gullak, turn off "Pause app activity if unused". On Xiaomi, Oppo or Vivo phones, also allow Autostart.

**Updates:** once a day the app checks the site, and Home shows "Update available" when there's a newer build. Tapping it downloads the APK in Chrome, and it installs over the app with your data kept.

### Permissions and privacy

- **SMS:** only messages from bank sender ids (like `VM-HDFCBK`) are read; personal texts, OTPs, offers and reminders are skipped. The SMS text stays on the phone and is deleted once the payment is filed or set aside.
- **Notification access:** only the payment and bank apps listed in Settings → Payment capture, and the ones you add there. Every other app's notifications are ignored without being read; Gullak only notes which apps post notifications (their package names, never what they say) so Add another app can list them first.
- **Bank emails:** Gullak reads the new-mail notification (the sender, the subject and the first lines your mail app shows), never your mailbox, and only for the senders listed under Bank emails. For every other email it looks at nothing but the sender's name. Like an SMS, the text stays on the phone and is deleted once the payment is filed or set aside. Settings shows when the last email from a listed sender came and whether it was a payment, never what it said.
- **Statements and balance checks:** the statement file is read on the phone and isn't kept; only the new lines become unfiled spends. Balance checks stay on the phone.
- **Munshi** sees the parsed details (amount, payee, the account's last digits, time) and your notes, never the SMS itself.
- **Sync:** filed entries sync like any other entry. Unfiled spends and learned rules stay on the phone.
- The APK holds no secrets: the Firebase web config is public by design, and Munshi's relay still needs your passphrase.

### Troubleshooting

- **"Restricted setting" when turning on SMS or notification access:** do step 4 of the install.
- **Google sign-in says the app isn't registered:** Firebase doesn't have the signing key's SHA-1. Add the fingerprints from the signing-key run (the Android app run's summary shows them too).
- **Munshi can't connect in the app:** `https://localhost` is missing from `AGENT_ALLOWED_ORIGINS`, or `GULLAK_SITE_URL` wasn't set when the APK was built.
- **"The app isn't published from this site yet":** run the Android app workflow. Publishing needs the release key and `BLOB_READ_WRITE_TOKEN`.
- **A payment didn't show up:** phones that close background apps can miss an SMS as it arrives; the catch-up scan finds it next time you open Gullak. For a bank format Gullak doesn't know yet, share the SMS to Gullak (Share → Gullak), and add an example to `payment-fixtures.txt`. If an app's payments never show up, check it's switched on (or added) in Settings → Payment capture, and that its notifications aren't turned off in Android's settings: Gullak can't see notifications Android doesn't show.
- **An account sends no SMS and no app alert:** if it emails you, add its sender under Settings → Payment capture → Bank emails. If it doesn't, import its statement when you need to, or switch on the weekly balance check for it.
- **A bank's emails don't show up:** Gullak only sees emails the phone notifies you about. In the Gmail app, Settings → your account → Notifications must be **All** (High priority only skips most bank emails), and the emails must be in Primary (install step 6) or in a label with notifications on. The sender's name has to match the one listed under Bank emails: Settings shows the last email Gullak saw from a listed sender. If it says "not a payment, skipped" for a real payment, share the email's text to Gullak and add an example to `payment-fixtures.txt`.
- **A statement won't import:** download it as CSV or Excel (.xlsx). Old .xls files need saving as .xlsx first; PDF statements can't be read yet.
- **Play Protect removed the app:** install it again from the site. With sync on, your book comes back.

### Working on the app

- `npm run dev:app` opens the app in the browser at http://localhost:5174 with sample captured payments, so the review screens work without a phone.
- To build an APK yourself (needs Node 22+, JDK 21 and the Android SDK): `npm run build:app && npm run android:prepare`, then `cd android && ./gradlew testDebugUnitTest assembleDebug`.
- The **Android app** workflow runs on every push that touches the app: lint, the Node tests, both builds, the Java parser tests and a signed APK (attached to the run). Running it by hand, or pushing a tag like `gullak-v1.2.0`, also publishes that APK to the site. The version code is the run number.
- `/api/app` is a Vercel Function; Netlify deploys don't have it.

## Project structure

```
public/                 favicon + résumé PDF
finance/index.html      Gullak's page (served at /finance/)
app/                    Gullak's page for the Android app (npm run build:app → dist-app/)
native/android/         the app's native code, icons and Java tests, copied over the generated android/ project
capacitor.config.json   Capacitor settings for the app
scripts/                android-prepare.mjs (creates android/), upload-apk.mjs (publishes an APK to Vercel Blob)
.github/workflows/      android.yml (test, build, sign and publish the APK), android-signing-key.yml (run once)
server/                 Munshi's relay (agentRelay.js), its provider list (providers.js), the Vite dev/preview plugin and appRelease.js (/api/app)
api/agent.js            the relay as a Vercel Function
api/app.js              the newest Android build, for the site's download button and the app's update check
netlify/functions/      the relay as a Netlify Function (netlify.toml holds the build settings)
tests/                  unit tests for Munshi, cloud sync and the app's payment capture (npm test)
.env.example            settings template for the relay and cloud sync (copy it to .env.local)
firebase.json           Firebase CLI config for deploying the Firestore rules and indexes
firestore.rules.example cloud sync security rules (copy to firestore.rules and add your email)
firestore.indexes.json  turns off Firestore indexes that sync doesn't need
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
    app/                the Android app's shell: entry point, native chrome, Google sign-in, sharing and update checks
    inbox/              captured payments: parser, account and category matching, rules, the review sheet and Settings → Payment capture
    views/              the eight sections
    agent/              Munshi: chat loop, tools, prompt, quick add, drafts and saving, relay client
    cloud/              cloud sync: Firebase loader, document layout, merging, offline queue, sync engine and sign-in/out
    components/         cards, charts, forms, overlays (sheets, palette, lock screen, toasts), the shell (sidebar, top bar, tab bar), Munshi's panel (agent/) and the sync screens (cloud/)
    store/              FinanceProvider + reducer + bookStore (your data), CloudProvider (sync), UiProvider (sheets, toasts, theme, privacy, lock)
    lib/                money maths, selectors, insights, dates, storage, backup and CSV, PIN
    hooks/              small shared hooks
    styles/             Gullak's design tokens and styles (agent.css is Munshi's)
```

## Deployment

`vite.config.js` uses `base: './'`, so the build in `dist/` works from any path: a domain root, a sub-folder or GitHub Pages. The build has two pages, `dist/index.html` (the portfolio) and `dist/finance/index.html` (Gullak), and both work on any static host as they are.

- **Vercel / Netlify:** import the repository. Build command `npm run build`, output directory `dist` (`netlify.toml` already sets these for Netlify). To turn on Munshi, add its environment variables (see [Deploy the relay](#deploy-the-relay)). Without them `/api/agent` stays off and everything else works as usual.
- **GitHub Pages:** run `npm run build` and publish the `dist/` folder, for example with the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package (`npx gh-pages -d dist`) or a GitHub Actions Pages workflow. GitHub Pages can't run Munshi's relay, so host the relay on Vercel or Netlify (see [Deploy the relay](#deploy-the-relay)).
- **Cloud sync** works on any of these hosts. Set the `VITE_FIREBASE_*` variables where the site is built (the host's environment variables, or `.env.local` when building yourself), and add the site's domain to Firebase's **Authorized domains**. See [Set up sync](#set-up-sync).
