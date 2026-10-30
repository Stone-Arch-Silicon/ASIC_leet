# ASIC Practice · Stone Arch Silicon

A quiet interview-practice workbench for Digital PD, Analog PD, RTL, and Verification.

- 52 original problems with synthetic report/code fixtures, hints, theory, reference approaches, review checklists, and interview follow-ups.
- 18 numeric answer checks. Coding and design answers are self-reviewed, not executed in the browser.
- 31 command/concept cards across 12 guide topics.
- Lab 3 synthesis; Lab 4 optimization; Lab 5 FSM experiments; Lab 6 scan/ATPG; Lab 7 activity, multi-Vt and clock gating. VCS foundations use organizer notes; Labs 1–2 were not supplied.
- Beyond-lab digital implementation, analog/custom layout, CDC and verification practice, linked to official sources.
- Search and difficulty/type/scope filters, timed interviews, saved notes, and progress export/import.

## Run locally

No build or package install required. With Python 3:

```sh
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. Do not open index.html as a file: content loads through fetch.

## Hosting: members only

The site is served by a Cloudflare Worker at https://asic-leet.sasi-umn.workers.dev. Visitors sign in with GitHub, and only active members of the Stone-Arch-Silicon organization get past the sign-in page. To give someone access, invite them to the organization. To remove access, remove them from it (their session also expires after 7 days).

- `worker/index.js`: the sign-in gate. It asks GitHub for the `read:org` scope only, checks membership once at sign-in, revokes the GitHub token right away, and keeps a signed 7-day session cookie.
- `wrangler.jsonc`: Worker settings. `ALLOWED_ORG` and `GITHUB_CLIENT_ID` are public values. The OAuth client secret is stored only in Cloudflare as the secret `GITHUB_CLIENT_SECRET`.
- The OAuth app is "SASi ASIC Practice" under the organization's Settings, Developer settings, OAuth Apps. Its callback URL must stay `https://asic-leet.sasi-umn.workers.dev/auth/callback`.
- Cloudflare builds from this repository on every push to `main` (build command `python3 make_bundle.py`, then `npx wrangler deploy`).
- Sign out at `/auth/logout`. Tests for the gate: `node tests/worker.test.mjs`.

GitHub Pages is not used: this repository is private, and the organization is on GitHub Free. All asset paths stay relative, so the local server above still works.

## Edit content

- `dist/lab-problems.json`: course-grounded problems L01–L24.
- `dist/advanced-problems.json`: additional problems A01–A28.
- `make_guide.py`: source for `dist/guide.json`; run with Python 3 after editing.
- `dist/app.js`, `dist/style.css`, `dist/index.html`: app, styles, entrypoint.
- `tests/validate.mjs`: schema, source-link and numeric-fixture checks.

Problem fields: id, track, title, level, kind, lab, minutes, prompt, artifact, hint, solution[], rubric[], followups[], theory[], sources[]. Optional: starter, solutionCode, sourceNote, numeric{label,answer,tolerance,unit,explanation}.

Validate with `node tests/validate.mjs` and `node --check dist/app.js`.

## Review and tool scope

Reports are synthetic exercises, not measured silicon or licensed EDA execution. Public vendor links establish methods/tool roles; detailed command syntax must be checked against installed release documentation. Original university handouts, PDKs, libraries, and licensed vendor manuals are not bundled. The guide follows the updated lab corrections, including the disabled FSM encoding command and the corrected Lab 7 activity window/gating style.

Progress is stored locally in the browser (`sasi-practice-v1`). Export it to transfer between devices or before clearing site data. There are no shared accounts, leaderboards, telemetry, remote grading, or EDA-server integration.

The Tcl reference parsers were tested in a Tcl interpreter. SystemVerilog references are instructional and were not run in VCS/Xcelium here.
