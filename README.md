# Statistics Navigator for Non-Statisticians

Working Hebrew title: סטטיסטיקה להדיוטות

A Next.js MVP for researchers and students who do not feel confident choosing statistical analyses. The app profiles an uploaded CSV/XLSX table, lets the user describe the experiment in normal lab language, asks only targeted follow-up questions, uses a rule-based recommendation engine, and runs confirmed analyses with Python/R.

## Run Locally

```bash
npm install
npm run dev
```

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

## Dependencies

Node dependencies are in `package.json`.

Python backend expects:

- `pandas`
- `openpyxl`
- `numpy`
- `scipy`
- `matplotlib`
- `seaborn`

R backend expects:

- `lme4`
- `lmerTest`
- `emmeans`
- `openxlsx`

## Documentation

See `docs/statistics-navigator-mvp.md` for implemented scope, current limitations, and test workflow.
