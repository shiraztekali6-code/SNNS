# Statistics Navigator for Non-Statisticians MVP

Working Hebrew title: סטטיסטיקה להדיוטות

This MVP lives at `/statistics-navigator`. It is intentionally not a blind AI test picker. The app separates:

- Data table profiling
- Guided experiment-design interview
- Rule-based recommendation engine
- Table conversion helper
- Python/R analysis backend
- Plain-language explanation/reporting layer

## Run Locally

```bash
npm install
npm run dev
```

Next.js will use `http://localhost:3000` if available. In the current workspace, port 3000 was occupied, so the dev server used:

```text
http://localhost:3001/statistics-navigator
```

Production build check:

```bash
npm run build
```

## Scientific Dependencies

No new npm package is required for the MVP beyond the existing Next.js/React dependencies.

Python packages used by `scripts/statnav_backend.py`:

- `pandas`
- `openpyxl`
- `numpy`
- `scipy`
- `matplotlib`
- `seaborn`

R packages used by `scripts/statnav_r_analysis.R`:

- `lme4`
- `lmerTest`
- `emmeans`
- `openxlsx`

The current machine already has these available for the tested MVP paths.

## Example Dataset

Built-in example:

```text
examples/mouse_activity_lmm_long_format.csv
```

Columns include:

- `cage_id`
- `sex`
- `group`
- `phase`
- `day_night`
- `session_number`
- `movement_mean_per_12h`

Expected recommendation:

```text
Longitudinal Linear Mixed-Effects Model
movement_mean_per_12h ~ group * session_number + (1 | cage_id)
```

The app explains that:

- `movement_mean_per_12h` is continuous.
- `group` is categorical.
- `session_number` is longitudinal time.
- `cage_id` identifies repeated measurements.
- `(1 | cage_id)` accounts for repeated cage-level measurements.

## Implemented Now

- Upload CSV/XLSX through `/api/statnav/upload`.
- Preview table, row/column counts, column names, missing values, duplicated rows, and detected column types.
- Data profiler detects likely numeric outcomes, categorical/binary variables, ID-like columns, subject/sample/cage IDs, time/session columns, group/treatment columns, count-like variables, wide vs long structure, and repeated measures.
- Guided questionnaire maps outcome, group, second factor, predictor, repeated unit, time/session, paired/independent design, replicate type, research goal, non-parametric preference, desired outputs, and notes.
- Rule-based recommendation engine supports MVP recommendations for t-tests, ANOVA, mixed models, regression, categorical tests, and non-parametric alternatives as guidance.
- Analysis execution currently supports:
  - Welch unpaired t-test
  - Paired t-test
  - One-way ANOVA
  - Two-way ANOVA
  - Linear regression
  - Linear mixed-effects model
  - Chi-square/Fisher categorical tests
- Graph generation currently supports:
  - Violin/points/mean +/- SEM group plot
  - Paired before/after line plot
  - Longitudinal mean +/- SEM line graph
  - Scatter plot with regression line
  - Contingency bar plot
- Table conversion helper supports wide-to-long and long-to-wide where enough column mapping exists.
- Results page includes statistical tables, graph, warnings, interpretation, Methods text, Results text, and downloadable CSV/XLSX/PNG outputs.

## Outputs

Runtime files are written under:

```text
outputs/statnav/
```

Important subfolders:

- `outputs/statnav/uploads`
- `outputs/statnav/jobs`
- `outputs/statnav/conversions`

The `outputs/` folder is intentionally git-ignored.

## Known MVP Gaps

- The explanation layer is rule-grounded/template-based in this MVP. A future LLM route can be added, but it should never silently override the rule engine.
- Normality, variance, residual, and influence diagnostics are not yet shown in the UI.
- Non-parametric tests are recommended but not all are executable yet.
- Logistic regression is recommended as guidance for binary outcomes but not yet executable in this MVP.
- Complex mixed models may need random slopes, nested random effects, offsets, GLMMs, or custom contrasts.
- Technical replicate handling needs a stronger workflow for summarizing or nesting before analysis.
- Table conversion needs a richer UI for manually choosing ID columns and measurement columns in messy wide datasets.
- Excel export is basic and should later include formatted sheets, notes, and graph embedding.
