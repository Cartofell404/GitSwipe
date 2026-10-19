# GitSwipe

**A swipeable feed of random GitHub repositories.** Scroll, read the README, open the good ones, save the rest for later.

[**Live demo**](https://cartofell404.github.io/GitSwipe/)

GitHub is great for searching for something you already know. GitSwipe is for finding things you didn't know to look for: one full-screen repo at a time, with the stats, topics and README one tap away.

It's a static site. No backend, no build step, no dependencies, no tracking, no accounts.

## Features

- **Mixed discovery feed.** Every batch blends popular, mid-size and hidden-gem repos across languages and ages, so the feed never clumps around one kind of project.
- **Clone command in one tap.** Every card copies a ready `git clone <url>` line. No guessed package names: `npm i something` can quietly install a different project, so GitSwipe doesn't guess.
- **One-row action dock.** Stars, Save, Details, Share, Clone and Open sit in a single row under the text, so the buttons can never be taller than the card.
- **Community card.** Once every ~14 repos a soft Discord invitation appears. Join or dismiss it and it never comes back.
- **Snap scrolling.** One repo per screen, infinite scroll, works on phones and desktop.
- **Details view.** Banner, stats, topics, license, dates and the rendered README, without leaving the app.
- **Share.** Native share sheet where the platform has one, clipboard copy everywhere else.
- **Star count up front.** Every card shows the repo's GitHub star count in big; the Open button takes you straight to the repo.
- **Save for later.** Saved repos live in your browser and open from the side panel.
- **Keyboard friendly.** Up and Down arrows (or PageUp and PageDown) move card to card, Esc closes panels.
- **Rate-limit aware.** If GitHub's limit is hit, GitSwipe pauses, says when it will resume, and continues on its own.

## Try it

Open the **[live demo](https://cartofell404.github.io/GitSwipe/)**. There is nothing to install.

| Action | How |
| --- | --- |
| Next / previous repo | Swipe or scroll, or press Down / Up |
| Save | Save button on the card, then open the bookmark in the top bar |
| Read more | Details button or "Read more" on the card |
| Open on GitHub | The big Open button on the card |
| Copy clone command | Terminal button on the card dock |
| Share a repo | Share button on the card dock |
| New random feed | Shuffle button in the top bar |
| Join the Discord | Community card in the feed, or the footer link once configured |
| Privacy & Legal | Link in the footer |

## Run it locally

Optional, only needed if you want to hack on it. There is no install and no build.

```sh
python3 -m http.server 4173
# then open http://localhost:4173
```

Any static server works (`npx serve`, nginx, and so on). You can also just open `index.html` in a browser.

## Deploy your own

GitSwipe is plain static files, so any static host works.

**GitHub Pages:** push the files to a repo, then Settings, Pages, deploy from the `main` branch, root folder. Your site appears at `https://<you>.github.io/<repo>/` after a minute or two. Cloudflare Pages and Netlify work the same way.

## How it works

- GitHub's search can't sort randomly, so each query randomizes the language, star range, age, an extra qualifier, the sort order and the result page. Results are dealt round-robin across popularity tiers.
- Data comes straight from GitHub's API in your browser: repository search, plus the README via `/repos/{owner}/{repo}/readme`.
- README HTML from GitHub is sanitized before display, and relative links and images are resolved to GitHub URLs.
- A Content Security Policy in `index.html` caps what the page may load, which matters because README HTML comes from strangers.
- Saved repos live in `localStorage` under `gitswipe_*` keys, along with the community-card choice (`gitswipe_discord`).
- The Discord community card is off until you set a real invite in `app.js` (`DISCORD_URL`).

## Privacy

The full text is in the app under **Privacy & Legal** in the footer. Short version:

- No analytics, no cookies, no server of ours. Your browser talks directly to `api.github.com`.
- Saved repos are stored in your browser's `localStorage` and never leave your device.
- No Google and no trackers: the display font is self-hosted. The only outside requests go to GitHub, which is where the data comes from (its API, plus its image servers for avatars, banners and README images), so GitHub can see your IP address.
- Hosting is GitHub Pages, which keeps normal server logs. See the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

## Project structure

```
index.html          page shell: feed, top bar, panels, dialogs and the legal footer
styles.css          all styling
compact-actions.css the one-row action dock (drop-in layout layer, loaded last)
app.js              search, feed, saving, details, the Discord community card
fonts/              self-hosted display font (bricolage-grotesque-latin.woff2)
ROADMAP.md          what's planned next
LICENSE.md          MIT
```

## Contributing

Issues and pull requests are welcome. Please keep it dependency-free with no build step.

## License

[MIT](LICENSE.md). GitSwipe is an independent project and is not affiliated with GitHub. GitHub is a trademark of GitHub, Inc.
