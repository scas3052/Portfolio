# Jalli Gopichand — Developer Portfolio

A modern, responsive and animated personal portfolio built with **React 19** and **Vite**.

The same project also holds **Gullak**, a private personal-finance book on its own page (`/finance/`) with a completely different look. See [Gullak — personal finance page](#gullak--personal-finance-page).

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
| Quality   | ESLint (React Hooks + React Refresh rules)               |

## Getting started

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+.

```bash
npm install       # install dependencies
npm run dev       # start the dev server at http://localhost:5173 (Gullak is at /finance/)
npm run build     # production build into dist/
npm run preview   # preview the production build locally
npm run lint      # lint the source
```

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
| Settings     | Name, theme, PIN, backup and restore, CSV export, sample data and erase                                         |

Also included:

- **Amount boxes are calculators:** type `240+65` or `1200/4` and Gullak works it out.
- **Command palette** to search entries and run any action.
- **Privacy mode** hides every amount, for using it in public.
- **Paper (light) and ink (dark) themes**, remembered per browser.
- **Optional 4-digit PIN** that locks Gullak when it opens and after 2 minutes in the background.
- **Small celebrations** (a stamp and a burst of coins) when a goal is reached, a loan is paid off or a friend is settled.
- **Sample data** to explore before adding your own, and a mobile layout with a bottom tab bar.

### Your data

Everything is saved only in this browser's `localStorage` (key `gullak:v1`). Nothing is sent anywhere, and every visitor gets their own empty book, so publishing the page never exposes your entries. Clearing site data or switching browser or device starts fresh, so download a JSON backup from **Settings → Backup** now and then; it restores on any device. Entries can also be exported as CSV for Excel or Google Sheets.

The PIN is a privacy curtain, not encryption: it hides the screen, but the data stored in the browser is not encrypted.

### Keyboard shortcuts

| Keys                  | Action                                  |
| --------------------- | --------------------------------------- |
| `Ctrl`/`⌘` + `K` or `/` | Search entries and commands           |
| `N` / `I`             | Log a spend / log income                |
| `H`                   | Hide or show amounts                    |
| `T`                   | Paper or ink theme                      |
| `L`                   | Lock (when a PIN is set)                |
| `1` to `8`            | Jump to a section, in sidebar order     |
| `[` / `]`             | Previous / next month                   |
| `?`                   | Show all shortcuts                      |

In a form, `Enter` saves, `Ctrl`/`⌘` + `Enter` saves and starts another entry, and `Esc` closes it.

### Turning it off

Set `FINANCE_ENABLED = false` in [`src/config.js`](src/config.js). The navbar switch disappears and Gullak is left out of the production build.

## Project structure

```
public/                 favicon + résumé PDF
finance/index.html      Gullak's page (served at /finance/)
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
    components/         cards, charts, forms, overlays (sheets, palette, lock screen, toasts) and the shell (sidebar, top bar, tab bar)
    store/              FinanceProvider + reducer (your data), UiProvider (sheets, toasts, theme, privacy, lock)
    lib/                money maths, selectors, insights, dates, storage, backup and CSV, PIN
    hooks/              small shared hooks
    styles/             Gullak's design tokens and styles
```

## Deployment

`vite.config.js` uses `base: './'`, so the build in `dist/` works from any path: a domain root, a sub-folder or GitHub Pages. The build has two pages, `dist/index.html` (the portfolio) and `dist/finance/index.html` (Gullak), and both work on any static host as they are.

- **Vercel / Netlify:** import the repository. Build command `npm run build`, output directory `dist`.
- **GitHub Pages:** run `npm run build` and publish the `dist/` folder, for example with the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package (`npx gh-pages -d dist`) or a GitHub Actions Pages workflow.
