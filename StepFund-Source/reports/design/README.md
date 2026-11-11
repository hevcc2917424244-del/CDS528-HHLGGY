# StepFund 0.5.1 visual refresh

The interface uses warm ivory surfaces, dark forest-green navigation, restrained red accents, editorial headings and flat ledger rules. Original SVGs provide the step-shaped brand mark, action arrow, button engraving, milestone diagram and corner-cut ledger border. Text stays in HTML and is translated by the existing language switch; graphics never replace an interactive control or its accessible name.

## Assets and provenance

- `public/identity/step-mark.svg`: original geometric brand mark, also used as the favicon.
- `public/identity/action-arrow.svg`: original project-opening arrow.
- `public/identity/button-engraving.svg`: subtle, original primary-button decoration.
- `public/identity/ledger-frame.svg`: original scalable border for funding and creation summaries.
- `public/identity/progress-print.svg`: original decorative funding / verification / release diagram.
- `public/identity/{technology,education,community}-cover.png`: original illustrations generated using the built-in `image_gen.imagegen` tool. Full final prompts are in `asset-prompts.json`.

The illustrations are decorative category covers, not documentary photographs, user uploads, or evidence of delivery. All assets are bundled locally. This visual refresh does not remove the project's AI-assistance disclosure.

## Review

With a local app or portable server running, execute `node scripts/visual-review.cjs`. Set `STEPFUND_URL` to select the local server; the default is `http://127.0.0.1:5173`. The review uses isolated browser data and blocks external HTTP requests. It captures English and Chinese screens at 1440, 768, 390 and 360 CSS-pixel widths, checks horizontal overflow and broken images, and records runtime exceptions. It does not exercise real wallet signatures or external storage uploads.

Screenshots and `visual-review.json` accompany this file. The portable release was reviewed at `http://127.0.0.1:5292`. Existing browser regression tests cover practice creation, contribution, voting, refunds, evidence hashing and language persistence. See `../validation-0.5.1.json` for the release validation summary.
