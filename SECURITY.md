# Security

Please report security problems privately, through GitHub's **Report a vulnerability** (Security > Advisories) on this repository, rather than in a public issue. Include the steps to reproduce and what you expected to happen.

## Design

Victoria Votes 2026 is a static website. There is nothing to sign in to and no server of ours to attack.

- **Static, no backend.** The site is plain files on GitHub Pages. The browser reads results straight from a public, read-only ArcGIS Online view of the Victorian Electoral Commission (VEC) results feed. Nothing is written back.
- **No sign-in, no user data sent.** There are no accounts, no forms, no cookies and no analytics. A few display choices (light or dark, whether a panel is minimised) are remembered in your own browser and never sent anywhere. The only requests are for the site's own files and for results. A request for results carries what any web request carries (your IP address and browser details, to the host that serves it) and nothing about you or your choices.
- **Content Security Policy.** The built site carries a strict policy as a meta tag: scripts, styles, fonts and images come only from the site itself, and the only outside host the page may talk to is the one serving the results (plus an optional static pointer file). No inline scripts, no `eval`, no framing of other pages, no forms.
- **Data sources fixed at build.** Which service the site reads is set when it is built. A public build refuses to build if it points anywhere but the public results view (never a development or trial service), and the page ignores any address-bar setting that would change its source.
- **Kill switch.** The results view carries a status row. If results look wrong, the operator sets it to held or offline and every open page shows the last confirmed figures or an offline notice, without a new release.
- **Provisional results.** Results on election night are provisional. The site says so and credits the VEC.
- **Dependencies.** Few, pinned in `package-lock.json`, and listed with their licences in [LICENSES.md](LICENSES.md).
