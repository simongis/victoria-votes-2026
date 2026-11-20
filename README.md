# Victoria Votes 2026

**Live results for the 2026 Victorian state election (Legislative Assembly), made easy to read.**

### [Open the site](https://simongis.github.io/victoria-votes-2026/)

The election is on Saturday 28 November 2026. This site shows the count as it comes in: which party leads in each of the 88 seats, how the vote has moved since 2022, the polling places, and what could still change. It is a map and a hex "cartogram" where every seat is the same size, plus a few ways to explore the numbers.

> **Provisional results.** Figures on election night are provisional and change as votes are counted. Data sourced from the Victorian Electoral Commission. This is an independent project: it is not run or endorsed by the VEC, and the VEC's own site is the official source.

## How it works

- A static website (React, Vite and TypeScript). It runs entirely in your browser; there is no server of ours, no sign-in and no tracking.
- It reads a public, read-only ArcGIS Online view that holds the latest snapshot of the VEC results feed, and checks it politely every half a minute or so.
- Data from before the count (boundaries, past results, demographics) is built into the site as static files.

More on security in [SECURITY.md](SECURITY.md). Data sources, fonts and software licences are in [LICENSES.md](LICENSES.md).

## Build it yourself

```
npm ci
npm run check                                  # typecheck, lint, tests
npm run build                                  # apps/web/dist
BASE_PATH=/victoria-votes-2026/ npm run build  # the Pages build (the path matters)
```

Node 22 or later. The public build reads the real results view, so it shows whatever that view holds.

## Feedback

Please [raise an issue](../../issues) if something looks wrong or confusing.
