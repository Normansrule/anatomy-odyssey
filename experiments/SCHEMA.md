# Experiments data schema

The Experiments page (`site/experiments.html`) is driven by JSON, not by hand-written HTML.
It loads, in this order, and merges the `experiments` arrays:

| File | Owner | Contents |
|---|---|---|
| `site/data/experiments.json` | Levels 0–2 | `levels` metadata for **all** levels (0–4) + experiments `00-*` … `22-*` |
| `site/data/experiments-advanced.json` | Levels 3–4 | experiments `30-*` … `44-*` (optional file; the page works without it) |

If the same `id` appears in both files, the later file wins.

## File shape

```json
{
  "schema": 1,
  "experiments": [ { …experiment… }, { … } ]
}
```

A bare array `[ {…}, {…} ]` is also accepted. `experiments.json` additionally carries a
`levels` array (see below); other files may omit it.

## Experiment object

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Same as the folder name, e.g. `"10-water-bottle-rocket"`. Unique. |
| `level` | integer 0–4 | yes | Ladder rung. First digit of the folder number. |
| `title` | string | yes | Short human title, e.g. `"Water bottle rocket"`. |
| `folder` | string | yes | Folder under `experiments/`, e.g. `"10-water-bottle-rocket"`. Cards link to `https://github.com/Normansrule/cosmic-library/tree/main/experiments/<folder>`. |
| `cost_usd` | `[min, max]` numbers | yes | Typical parts cost in US dollars, excluding tools you probably own. |
| `hours` | number **or** `[min, max]` | yes | Build + first-run time in hours. |
| `difficulty` | integer 1–5 | yes | 1 = kitchen table, 3 = soldering / CAD, 5 = certification-grade. |
| `summary` | string | yes | One or two sentences (≤ 220 characters) shown on the card. |
| `skills` | string[] | yes | 2–6 short skill tags, e.g. `["Newton's third law", "OpenSCAD"]`. |
| `outputs` | string[] | yes | What the build produces. Use these tokens so filters work: `"STL"`, `"SCAD"`, `"PCB"`, `"code"`, `"data"`, `"SVG"`, `"photo"`, `"flight"`, `"radio"`. |
| `stl` | string[] | yes (may be `[]`) | Web paths **relative to `site/`** of printable meshes shown in the 3D viewer, e.g. `"models/10-water-bottle-rocket/nosecone.stl"`. Binary or ASCII STL, each **< 1.5 MB**, units millimetres, Z up. |
| `safety` | string | no | One short line shown in orange on the card when the build has a specific hazard (pressure, cryogen, certified motors…). |
| `tags` | string[] | no | Free-form extra keywords for search. |

Example:

```json
{
  "id": "10-water-bottle-rocket",
  "level": 1,
  "title": "Water bottle rocket",
  "folder": "10-water-bottle-rocket",
  "cost_usd": [25, 45],
  "hours": [4, 6],
  "difficulty": 2,
  "summary": "A 2 L bottle, a PVC pull-string launcher and a pressure gauge…",
  "skills": ["Newton's third law", "OpenSCAD", "3D printing"],
  "outputs": ["STL", "SCAD", "data", "flight"],
  "stl": ["models/10-water-bottle-rocket/nosecone.stl", "models/10-water-bottle-rocket/fincan.stl"],
  "safety": "Max 60 psi, eye protection, remote pull-string release."
}
```

## Level object (only in `experiments.json`)

| Field | Type | Meaning |
|---|---|---|
| `level` | integer | 0–4 |
| `name` | string | e.g. `"Kitchen table"` |
| `stage` | string | Rocket-stage label used by the stack graphic, e.g. `"Pad"`, `"Stage 1"` |
| `budget` | string | e.g. `"under $10"` |
| `blurb` | string | One sentence. |
| `color` | string | CSS custom property name from `codex.css`, e.g. `"--aurora"` |
| `planned` | string[] | optional: folder names shown as "in preparation" cards until an experiment with that `id` is loaded |

## STL files

Put meshes in `site/models/<folder>/`. Keep each file under 1.5 MB (decimate if needed),
watertight, in millimetres. The viewer centres and scales each mesh automatically, so no
particular origin is required.
