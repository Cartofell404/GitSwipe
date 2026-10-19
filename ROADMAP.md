# GitSwipe roadmap

**Goal:** the best way to discover open-source repos. In five seconds you know what a repo is and whether it's worth your time.
**Why it exists:** swiping should make you more productive, not less.

**Principles**
- Respect attention: the app should help you stop, not keep you hooked.
- No menus for things that fit on the card. Compact first, responsive always.
- Privacy by default: no accounts, no tracking, everything stays in the browser until login ships.
- Zero build step and zero dependencies for as long as it stays sensible.

---

## Now: polish and trust (do first, all small)

- [x] **Compact action dock.** Six actions in one row under the text, so they can never be taller than the card (`compact-actions.css`).
- [x] **Discord community card + footer link.** One soft in-feed card per ~14 repos, dismissible forever (inline in `app.js`). Needs a real invite in `DISCORD_URL` to switch on.
- [x] **Install command safety.** Today `npm i <repo-name>`, `pip install <repo-name>` etc. can install the wrong package. Use `git clone` for everything, or verify the registry entry points back to this repo first.
- [x] **Privacy text matches reality.** Self-host the font (also faster), or say that Google Fonts receives the visitor's IP.
- [x] **Honest labels.** "Trending" only if it is trending (see Nightly pool). Otherwise "Popular".
- [x] **Icons instead of emoji** on chips and presets, so it looks the same on every device.
- [x] **Content Security Policy** in `index.html`. You render README HTML from strangers, so this is real protection.
- [x] **README matches the app** (presets, filters, dock, Discord).
- [x] Update Privacy & Legal: mention `gitswipe_discord` and any new localStorage keys.

## Next: make every card better

- [ ] **Quality gate:** skip repos with no description, archived repos and empty forks.
- [ ] **Health badge** on the card: Active, Quiet or Archived (from fields the search already returns, so no extra requests).
- [ ] **"Hidden gem" tag** for small, recently active repos with a description and topics.
- [ ] **Double-tap to save** with a small bookmark animation. The signature gesture of this kind of app.
- [ ] **No repeats across sessions:** remember the last few thousand seen repo IDs.
- [ ] **Windowed feed:** remove far-away cards from the page, so long sessions stay fast on phones.
- [ ] **Tap the title or description to open Details**, then drop the separate "Read more" link.
- [ ] **Back / undo** for the last card, and **"Not interested"** to hide a repo or owner.
- [ ] **Keyboard shortcuts:** S save, D details, O open, ? shows the list.
- [ ] **Deep links:** `#owner/repo` opens that repo's details. A link posted in Discord lands inside GitSwipe.
- [ ] **Link previews:** Open Graph and Twitter tags with an image, so shared links look good in Discord and on X.

## Smarter feed (the "best algorithm" track)

- [ ] **Learning tags:** Read more on a repo gives its tags +1, scrolling past with no reaction gives -1. Star or save counts as +2.
- [ ] **One "Familiar <-> Surprising" slider** (temperature) sets how random the feed is. One control instead of a filter panel.
- [ ] **Popular on top, new on top too:** score = popularity + freshness + recent activity + your tags, with variety (never three of the same language in a row).
- [ ] **More like this:** from Details, one tap starts a short feed with the same topics.
- [ ] **Quick feeds** stay, built from real signals (e.g. "Rising AI repos" only if it really sorts by recent growth).

## Anti-doomscroll signature (nobody else has this)

- [ ] **Daily goal + streak:** "Read 5 READMEs today" with a thin progress bar at the top.
- [ ] **Session timer:** choose 10 minutes. At the end a calm stop screen: "You read 4 repos, saved 2. Back to work?"
- [ ] **Weekly recap card** ("12 read, 4 saved, top topic: Rust"), drawn as a shareable image.
- [ ] **Try-it reminder** a few days after you save something you haven't opened.
- [ ] **Collections:** "To try", "For work", "Learning".

## Later: infrastructure

- [ ] **Nightly pool.** A free GitHub Actions job searches once a night with its own authenticated limits and commits a curated `pool.json`. The app loads it first and tops up with live search. Result: instant first card, almost no rate-limit pauses, and a way to make "Trending" true (compare tonight's stars with last night's).
- [ ] **Installable app (PWA):** manifest + service worker, home-screen icon, page loads offline.
- [ ] **Saved repos backup:** Export / Import JSON, "Copy as Markdown list".
- [ ] **Offline reading list:** cache saved repos' READMEs.
- [ ] **Accessibility pass:** screen-reader labels on cards, 44px tap targets, reduced motion, visible focus.
- [ ] **Performance:** lazy-load images, skip rendering off-screen cards, Lighthouse above 90.

## Login with GitHub (future)

Not needed for browsing, so it waits until the app has a reason for accounts.

**What it unlocks**
- Star from the app. Stars queue up and go out **in one GraphQL request** every minute, so they don't waste rate limit.
- Higher limits: searches 10 -> 30 a minute, README loads 60 -> 5,000 an hour.
- Sync saved repos and collections across devices (a private Gist is free and needs no database of ours).
- Personal "because you starred ..." recommendations.

**How (already prototyped earlier)**
1. GitHub OAuth App with the site URL as the callback.
2. Tiny Cloudflare Worker swaps the login code for a token (the client secret never reaches the browser). It stores nothing.
3. `config.js` holds the client ID and Worker URL; empty means "login off", and the token paste option remains.

**Open decisions**
- Scope: starring through a classic OAuth app needs `public_repo`, which lets the app write to all of the user's public repos. A GitHub App can ask for just Starring. Decide before building.
- Update Privacy & Legal first: login adds Cloudflare to the list of parties that see data, and a stored token to localStorage.

## Community and Discord

**Server layout:** `#welcome`, `#rules`, `#announcements`, `#show-your-find`, `#repo-of-the-day`, `#feedback`, `#bugs`, `#dev`, `#off-topic`.
**Basics:** non-expiring invite, a few moderators, clear rules, verification level set to at least "low", and report channels. You are responsible for moderating what your server hosts.
**Ways into the server from the app**
- [x] Footer link
- [x] In-feed community card, once per ~14 repos, never again after one dismissal
- [ ] "Share to Discord" in the Share button (copies a formatted message)
- [ ] After a streak milestone: "7 days. Come tell us what you found."

**Bots and automation (all free tiers)**
- [ ] **Repo of the day:** GitHub Action posts to a Discord webhook every morning.
- [ ] **`/swipe` command:** a Cloudflare Worker posts a random repo.
- [ ] **Community picks:** `picks.json` in the repo, filled by pull requests or a Discord bot, shown as a special feed.
- [ ] Weekly top-saved repos post.

## Brand and business

- [ ] Decide the org name (Existentia is the current favorite). Check the GitHub org, `.com` / `.dev` domain, social handles and look for similar names in software before committing. Not legal advice; ask a professional if it grows.
- [ ] Naming split: org / team name for the company, **GitSwipe** for the product.
- [ ] Custom domain (about $10-15 a year). The `github.io` address is fine until then.
- [ ] If money ever enters (ads, donations, paid features): check tax and registration rules and update the legal text.
- [ ] Keep the "not affiliated with GitHub" line.

## Quality bar before promoting it

**Device test matrix** (browser dev tools is enough): 320x568, 360x640, 390x844, 412x915, 844x390 (landscape), 768x1024, 1366x768, 1920x1080. On each: dock fits, text isn't cut off, footer doesn't cover anything, toast is readable.

- [ ] Lighthouse above 90 (performance, accessibility, best practices)
- [ ] One automated smoke test: page loads, a card renders, scroll moves to the next card
- [ ] Real phone check (iOS Safari and Android Chrome)
- [ ] CSP in place and README rendering still works
- [ ] Privacy & Legal is accurate

## Launch

- [ ] Screenshot or short clip in the README (teaser video exists)
- [ ] Posts: Show HN, dev.to, r/opensource, a few Discord/Slack dev communities
- [ ] Ask early users one question: "What did you find that you wouldn't have searched for?"
- [ ] Privacy-friendly success measures: GitHub stars, Discord joins, saves per session (local only)

## Ideas parking lot

- Themes (light / dark / high-contrast) and a font-size setting
- "Spin the wheel" random feed by language of the day
- Repo comparison: swipe two similar repos side by side
- "Good first issue" feed for people who want to contribute
- Browser extension: new tab shows one repo
- Share a repo as an image card
- Language of the week challenge in Discord
