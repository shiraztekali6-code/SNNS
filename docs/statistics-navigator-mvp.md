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
- Default chat-guided intake asks the user to describe the experiment in free text and infers a structured design from the table profile plus that description.
- Targeted follow-up engine asks only missing safety-critical questions, such as whether repeated cage/sample IDs are independent biological replicates or technical splits.
- Advanced mode keeps manual design definition available without making it the default path.
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

## Chat-Guided Flow

1. Upload a CSV/XLSX table or load the mouse activity example.
2. Read the plain-language data summary.
3. In the chat box, describe the experiment in normal lab language.
4. Review the assistant interpretation card.
5. Answer one follow-up question if the design is still unsafe to recommend.
6. Review the recommendation card and run the analysis if supported.

Example description:

```text
I measured mouse movement every 12 hours in MIX, R837, and RU521 groups. Each group has two cages. I want to know if the treatment changed movement over time.
```

Expected follow-up:

```text
Are the cage_id values independent biological replicates, or technical splits of the same group?
```

If the user selects independent replicates, the app recommends:

```text
Longitudinal Linear Mixed-Effects Model
movement_mean_per_12h ~ group * session_number + (1 | cage_id)
```

If the user selects technical splits, the app recommends combining technical replicates first before treatment testing.

## Rule-Based vs Assistant-Like Parts

Rule-based:

- `scripts/statnav_backend.py` table profiling, conversion, graphing, and Python-side tests.
- `scripts/statnav_r_analysis.R` ANOVA and mixed-effects model execution.
- `src/lib/statnav/followup_question_engine.ts` targeted missing-question logic.
- `src/lib/statnav/statistical_decision_engine.ts` final recommendation guardrails, including technical replicate handling.
- `src/lib/statnav/recommendation-engine.ts` statistical recommendation rules.

Assistant-like placeholder:

- `src/lib/statnav/experiment_interpreter.ts` uses deterministic text/profile heuristics to mimic an AI/statistics assistant. It does not call an LLM yet.
- The interpretation card explains the inferred design in friendly language.

To add real AI later, replace or augment `interpretExperimentDescription()` with an LLM call that returns the same `ExperimentDesign` shape, then compare the AI output against the rule-based decision engine instead of silently overriding it.

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
