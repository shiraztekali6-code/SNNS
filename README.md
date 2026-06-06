# Statistics Navigator for Non-Statisticians

Working Hebrew title: סטטיסטיקה להדיוטות

A Next.js MVP for researchers and students who do not feel confident choosing statistical analyses. The app profiles an uploaded CSV/XLSX table, lets the user describe the experiment in normal lab language, asks only targeted follow-up questions, uses a rule-based recommendation engine, and runs confirmed analyses with Python/R.

## Run Locally

```bash
npm install
python3 -m pip install -r requirements.txt
npm run dev
```

If your shell can find Python but the app shows `spawn python3 ENOENT`, set the
Python executable explicitly in `.env.local`:

```bash
PYTHON_PATH=/Library/Frameworks/Python.framework/Versions/3.11/bin/python3
```

Restart `npm run dev` after changing `.env.local`.

Open:

```text
http://localhost:3000/statistics-navigator
```

If port 3000 is occupied, use the alternate port printed by Next.js.

## Example

Click `Use mouse activity example` in the app, or inspect:

```text
examples/mouse_activity_lmm_long_format.csv
```

The example should recommend:

```text
movement_mean_per_12h ~ group * session_number + (1 | cage_id)
```

Suggested chat prompt:

```text
I measured mouse movement every 12 hours in MIX, R837, and RU521 groups. Each group has two cages. I want to know if the treatment changed movement over time.
```

Suggested graph prompt:

```text
I want one graph for males and one for females, with separate lines for MIX, R837, and RU521 over time and SEM error bars.
```

## Dependencies

Node dependencies are in `package.json`.

Python backend expects:

- `pandas`
- `openpyxl`
- `numpy`
- `scipy`
- `matplotlib`
- `seaborn`

The Next.js API route uses `PYTHON_PATH` when it is set. If `PYTHON_PATH` is not
set, it falls back to `python3`.

Excel upload supports modern `.xlsx` workbooks through `openpyxl`. Legacy `.xls`
files should be saved/exported as `.xlsx` or CSV before upload.

R backend expects:

- `lme4`
- `lmerTest`
- `emmeans`
- `openxlsx`

## Deployment Note

Vercel supports Python as a dedicated Vercel Functions runtime, but this MVP
currently runs Python by spawning a local executable from a Node.js API route.
That is suitable for local development and a traditional server, but for a
reliable Vercel deployment the Python/R analysis work should be moved to a
separate backend/API or rewritten as Python Vercel Functions.

## Documentation

See `docs/statistics-navigator-mvp.md` for implemented scope, current limitations, and test workflow.
