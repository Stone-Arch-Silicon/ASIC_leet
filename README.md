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

## GitHub Pages in Stone-Arch-Silicon/ASIC_leet

Copy this project into that repository, retaining any existing files you need. The included `.github/workflows/pages.yml` publishes `dist` using GitHub Actions on pushes to `main` or manual dispatch. In repository **Settings → Pages → Source**, choose **GitHub Actions**. Repository permissions and Pages availability are controlled by GitHub/the organization. No repository or Pages settings were changed as part of creating this package.

All asset paths are relative, so a project URL such as `/ASIC_leet/` works. The hosting-specific `.openai` directory is intentionally excluded from the downloadable package.

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
