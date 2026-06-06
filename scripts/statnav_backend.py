#!/usr/bin/env python3
"""Backend helper for the Statistics Navigator MVP.

The Next.js app owns the user flow and rule engine. This script owns file
parsing, table profiling, table conversion, graph creation, and statistical
execution. It prints JSON to stdout for the API route that called it.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import uuid
import warnings
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
OUTPUT_ROOT = Path(os.environ.get("STATNAV_OUTPUT_DIR", ROOT / "outputs" / "statnav"))
os.environ.setdefault("MPLCONFIGDIR", str(OUTPUT_ROOT / ".matplotlib"))

import numpy as np
import pandas as pd
from scipy import stats


R_SCRIPT = ROOT / "scripts" / "statnav_r_analysis.R"
_PLOTTING: tuple[Any, Any] | None = None


ID_RE = re.compile(r"(subject|mouse|cage|patient|sample|animal|participant|person|donor|well|replicate|id)", re.I)
SUBJECT_RE = re.compile(r"(subject|mouse|cage|patient|sample|animal|participant|donor)", re.I)
TIME_RE = re.compile(r"(time|day|night|session|phase|before|after|visit|week|hour|date|start|end|cycle)", re.I)
GROUP_RE = re.compile(r"(group|treatment|condition|genotype|sex|phase|cohort|drug|dose|arm|strain)", re.I)
COUNT_RE = re.compile(r"(count|number|num|events|cells|reads|frequency|freq)", re.I)
WIDE_TIME_RE = re.compile(r"(day|session|time|week|visit|before|after|phase|t\d+|d\d+|_\d+$|\d+$)", re.I)


def json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return float(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value if isinstance(value, (str, int)) else str(value)


def clean_dataframe_for_json(df: pd.DataFrame, max_rows: int = 8) -> list[dict[str, Any]]:
    preview = df.head(max_rows).copy()
    return [
        {str(column): json_safe(value) for column, value in row.items()}
        for row in preview.to_dict(orient="records")
    ]


def print_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, allow_nan=False))


def get_plotting() -> tuple[Any, Any]:
    global _PLOTTING
    if _PLOTTING is None:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import seaborn as sns

        _PLOTTING = (plt, sns)
    return _PLOTTING


def read_table(path: str | Path) -> pd.DataFrame:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path}")

    suffix = file_path.suffix.lower()
    try:
        if suffix == ".csv":
            df = pd.read_csv(file_path)
        elif suffix == ".xlsx":
            df = pd.read_excel(file_path, engine="openpyxl")
        elif suffix == ".xls":
            raise ValueError(
                "Legacy .xls Excel files are not supported yet. Please save/export the workbook as .xlsx or CSV, then upload it again."
            )
        else:
            raise ValueError("Only CSV and modern Excel .xlsx files are supported in the MVP.")
    except ImportError as exc:
        if suffix == ".xlsx" and "openpyxl" in str(exc):
            raise ValueError(
                "Excel .xlsx upload requires the Python package openpyxl. Install it with `python3 -m pip install openpyxl`, or upload a CSV file."
            ) from exc
        raise
    except ValueError:
        raise
    except Exception as exc:
        if suffix == ".xlsx":
            raise ValueError(
                "I could not read this Excel workbook. Please check that it is a normal .xlsx file, not encrypted/corrupted, or save it as CSV and upload again."
            ) from exc
        if suffix == ".csv":
            raise ValueError(
                "I could not read this CSV file. Please check the delimiter/encoding or save it again as UTF-8 CSV."
            ) from exc
        raise

    df = df.replace(r"^\s*$", np.nan, regex=True)
    df.columns = [str(column).strip() for column in df.columns]
    return df


def numeric_series(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def date_ratio(series: pd.Series, column_name: str) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0

    name_suggests_date = bool(re.search(r"(date|time|start|end)", column_name, re.I))
    if not name_suggests_date and pd.api.types.is_numeric_dtype(non_null):
        return 0.0

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        parsed = pd.to_datetime(non_null, errors="coerce")
    return float(parsed.notna().mean())


def infer_column(series: pd.Series, name: str, total_rows: int) -> dict[str, Any]:
    missing = int(series.isna().sum())
    non_null = series.dropna()
    unique_values = int(non_null.nunique(dropna=True))
    unique_ratio = unique_values / max(1, len(non_null))
    numeric = numeric_series(non_null)
    numeric_ratio = float(numeric.notna().mean()) if len(non_null) else 0.0
    date_like_ratio = date_ratio(non_null, name)
    name_lower = name.lower()

    detected: list[str] = []

    is_subject_id = bool(SUBJECT_RE.search(name)) and (unique_ratio >= 0.15 or unique_values >= 3)
    is_id = bool(ID_RE.search(name)) and (unique_ratio >= 0.25 or unique_values >= 3)
    is_time = bool(TIME_RE.search(name))
    is_group = bool(GROUP_RE.search(name))
    is_date = date_like_ratio >= 0.75
    is_numeric = numeric_ratio >= 0.85
    is_binary = unique_values == 2
    numeric_non_null = numeric.dropna()
    is_integerish = (
        is_numeric
        and len(numeric_non_null) > 0
        and np.all(np.isclose(numeric_non_null, np.round(numeric_non_null)))
    )
    is_count = (
        is_numeric
        and not is_binary
        and is_integerish
        and float(numeric_non_null.min()) >= 0
        and (bool(COUNT_RE.search(name)) or unique_values <= max(20, total_rows // 3))
    )
    is_continuous = is_numeric and not is_binary and not is_count and not (is_id and unique_ratio > 0.7)
    is_categorical = (
        is_binary
        or is_group
        or (not is_numeric and not is_date)
        or (unique_values > 0 and unique_values <= min(25, max(2, total_rows // 2)))
    )

    if is_subject_id:
        detected.append("subject_id_like")
    if is_id:
        detected.append("id_like")
    if is_time:
        detected.append("time_session_like")
    if is_group:
        detected.append("group_treatment_like")
    if is_date:
        detected.append("date_time")
    if is_binary:
        detected.append("binary")
    if is_count:
        detected.append("count_like")
    if is_continuous:
        detected.append("numeric_continuous")
    if is_categorical:
        detected.append("categorical")
    if not detected:
        detected.append("unknown")

    priority = [
        "subject_id_like",
        "time_session_like",
        "group_treatment_like",
        "date_time",
        "binary",
        "count_like",
        "numeric_continuous",
        "id_like",
        "categorical",
        "unknown",
    ]
    primary = next(kind for kind in priority if kind in detected)

    examples = [str(json_safe(value)) for value in non_null.drop_duplicates().head(6).tolist()]
    profile: dict[str, Any] = {
        "name": name,
        "primaryType": primary,
        "detectedTypes": detected,
        "missingValues": missing,
        "missingPercent": round((missing / max(1, total_rows)) * 100, 2),
        "uniqueValues": unique_values,
        "examples": examples,
    }

    if is_numeric:
        clean_numeric = numeric.dropna()
        profile["numericSummary"] = {
            "min": json_safe(clean_numeric.min()) if len(clean_numeric) else None,
            "max": json_safe(clean_numeric.max()) if len(clean_numeric) else None,
            "mean": json_safe(clean_numeric.mean()) if len(clean_numeric) else None,
            "median": json_safe(clean_numeric.median()) if len(clean_numeric) else None,
        }

    if is_categorical or is_binary or is_group:
        counts = non_null.astype(str).value_counts().head(12)
        profile["categoricalSummary"] = {
            "levels": [str(value) for value in counts.index.tolist()],
            "levelCount": unique_values,
            "topCounts": [
                {"value": str(value), "count": int(count)}
                for value, count in counts.items()
            ],
        }

    return profile


def profile_table(path: str, dataset_id: str, original_name: str) -> dict[str, Any]:
    df = read_table(path)
    total_rows = int(len(df))
    total_columns = int(len(df.columns))
    column_profiles = [infer_column(df[column], column, total_rows) for column in df.columns]

    def columns_with(kind: str) -> list[str]:
        return [
            profile["name"]
            for profile in column_profiles
            if kind in profile.get("detectedTypes", [])
        ]

    subject_cols = columns_with("subject_id_like")
    id_cols = columns_with("id_like")
    time_cols = columns_with("time_session_like")
    group_cols = [
        profile["name"]
        for profile in column_profiles
        if "group_treatment_like" in profile.get("detectedTypes", [])
        or (
            "categorical" in profile.get("detectedTypes", [])
            and "subject_id_like" not in profile.get("detectedTypes", [])
            and profile.get("uniqueValues", 999) <= 12
        )
    ]
    numeric_outcomes = [
        profile["name"]
        for profile in column_profiles
        if (
            "numeric_continuous" in profile.get("detectedTypes", [])
            or "count_like" in profile.get("detectedTypes", [])
        )
        and "time_session_like" not in profile.get("detectedTypes", [])
        and "id_like" not in profile.get("detectedTypes", [])
    ]
    count_like = columns_with("count_like")
    binary_cols = columns_with("binary")
    date_cols = columns_with("date_time")

    group_level_counts = []
    for profile in column_profiles:
        categorical = profile.get("categoricalSummary")
        if categorical:
            group_level_counts.append(
                {
                    "column": profile["name"],
                    "levels": int(categorical.get("levelCount", 0)),
                    "examples": categorical.get("levels", [])[:6],
                }
            )

    duplicated_ids = []
    for column in list(dict.fromkeys(subject_cols + id_cols)):
        counts = df[column].dropna().astype(str).value_counts()
        repeated = counts[counts > 1]
        if len(repeated) > 0:
            duplicated_ids.append(
                {
                    "column": column,
                    "duplicatedValueCount": int(len(repeated)),
                    "maxRowsPerValue": int(repeated.max()),
                    "examples": [str(value) for value in repeated.head(6).index.tolist()],
                }
            )

    repeated_measures = bool(duplicated_ids and (time_cols or any(item["maxRowsPerValue"] > 2 for item in duplicated_ids)))

    wide_measure_names = [column for column in numeric_outcomes if WIDE_TIME_RE.search(column)]
    wide_score = 0
    if len(numeric_outcomes) >= 3:
        wide_score += 2
    if len(wide_measure_names) >= 2:
        wide_score += 2
    if len(time_cols) == 0 and len(numeric_outcomes) >= 3:
        wide_score += 1
    if total_columns >= 8 and len(numeric_outcomes) / max(1, total_columns) >= 0.45:
        wide_score += 1

    long_score = 0
    if subject_cols and time_cols and numeric_outcomes:
        long_score += 4
    if repeated_measures:
        long_score += 2
    if numeric_outcomes and group_cols and len(numeric_outcomes) <= 4:
        long_score += 1
    if total_rows > max(20, total_columns * 3):
        long_score += 1

    appears_wide = wide_score >= 3 and wide_score > long_score
    appears_long = long_score >= 3 and long_score >= wide_score
    table_shape = "wide" if appears_wide else "long" if appears_long else "ambiguous"

    missing_cells = int(df.isna().sum().sum())
    rows_with_missing = int(df.isna().any(axis=1).sum())
    duplicated_rows = int(df.duplicated().sum())

    suggestions = []
    warnings = []
    if numeric_outcomes:
        suggestions.append(
            "Possible numeric outcome columns: " + ", ".join(numeric_outcomes[:6])
        )
    else:
        warnings.append("No obvious numeric outcome column was detected.")

    if subject_cols:
        suggestions.append("Possible repeated-unit ID columns: " + ", ".join(subject_cols[:6]))

    if time_cols:
        suggestions.append("Possible time/session columns: " + ", ".join(time_cols[:6]))

    if group_cols:
        suggestions.append("Possible group/treatment/factor columns: " + ", ".join(group_cols[:8]))

    if appears_wide:
        suggestions.append("The table appears wide; many analyses will need one row per observation in long format.")
    elif appears_long:
        suggestions.append("The table appears long/tidy, which is suitable for ANOVA, regression, and mixed models.")
    else:
        suggestions.append("The table shape is ambiguous; confirm whether repeated measurements are spread across columns or rows.")

    if missing_cells:
        warnings.append(f"The table contains {missing_cells} missing cells across {rows_with_missing} rows.")
    if duplicated_rows:
        warnings.append(f"The table contains {duplicated_rows} fully duplicated rows.")
    if repeated_measures:
        warnings.append("Repeated measurements may exist; avoid treating repeated rows as independent.")

    return {
        "datasetId": dataset_id,
        "fileName": original_name,
        "rows": total_rows,
        "columns": total_columns,
        "columnNames": [str(column) for column in df.columns],
        "preview": clean_dataframe_for_json(df),
        "missingCells": missing_cells,
        "rowsWithMissingValues": rows_with_missing,
        "duplicatedRows": duplicated_rows,
        "columnProfiles": column_profiles,
        "groupLevelCounts": group_level_counts,
        "duplicatedIds": duplicated_ids,
        "possibleSubjectIdColumns": subject_cols,
        "possibleTimeColumns": time_cols,
        "possibleGroupColumns": list(dict.fromkeys(group_cols)),
        "numericOutcomeColumns": numeric_outcomes,
        "countLikeColumns": count_like,
        "binaryColumns": binary_cols,
        "dateTimeColumns": date_cols,
        "appearsWide": appears_wide,
        "appearsLong": appears_long,
        "tableShape": table_shape,
        "wideScore": wide_score,
        "longScore": long_score,
        "repeatedMeasuresLikely": repeated_measures,
        "suggestions": suggestions,
        "warnings": warnings,
    }


def load_config(path: str | Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_table_outputs(tables: list[dict[str, Any]], out_dir: Path, stem: str) -> tuple[str | None, str | None]:
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / f"{stem}.csv"
    xlsx_path = out_dir / f"{stem}.xlsx"

    if tables:
        first = pd.DataFrame(tables[0]["rows"])
        if first.empty:
            first = pd.DataFrame({"message": ["No tabular rows were produced."]})
        first.to_csv(csv_path, index=False)
    else:
        pd.DataFrame({"message": ["No tabular rows were produced."]}).to_csv(csv_path, index=False)

    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        if not tables:
            pd.DataFrame({"message": ["No tabular rows were produced."]}).to_excel(writer, sheet_name="Summary", index=False)
        for index, table in enumerate(tables):
            title = re.sub(r"[^A-Za-z0-9_]+", "_", table["title"]).strip("_")[:28] or f"Table_{index + 1}"
            pd.DataFrame(table["rows"]).to_excel(writer, sheet_name=title, index=False)

    return str(csv_path), str(xlsx_path)


def sem(values: pd.Series) -> float | None:
    clean = pd.to_numeric(values, errors="coerce").dropna()
    if len(clean) <= 1:
        return None
    return float(clean.std(ddof=1) / math.sqrt(len(clean)))


def group_summary(df: pd.DataFrame, outcome: str, group_cols: list[str]) -> pd.DataFrame:
    grouped = df.groupby(group_cols, dropna=False)[outcome]
    summary = grouped.agg(["count", "mean", "std", "median", "min", "max"]).reset_index()
    summary["sem"] = grouped.apply(sem).reset_index(drop=True)
    return summary


def dataframe_to_table(title: str, df: pd.DataFrame) -> dict[str, Any]:
    safe = df.replace({np.nan: None})
    rows = [
        {str(column): json_safe(value) for column, value in row.items()}
        for row in safe.to_dict(orient="records")
    ]
    return {
        "title": title,
        "columns": [str(column) for column in safe.columns],
        "rows": rows,
    }


def save_group_graph(df: pd.DataFrame, outcome: str, group: str, out_dir: Path, factor2: str | None = None) -> str:
    plt, sns = get_plotting()
    graph_path = out_dir / "graph.png"
    plt.figure(figsize=(9, 6))
    sns.set_theme(style="whitegrid", font="DejaVu Sans")
    if factor2:
        sns.pointplot(data=df, x=group, y=outcome, hue=factor2, errorbar="se", dodge=True, markers="o")
        sns.stripplot(data=df, x=group, y=outcome, hue=factor2, dodge=True, alpha=0.35, linewidth=0.4, legend=False)
    else:
        sns.violinplot(data=df, x=group, y=outcome, inner=None, color="#d9e7de", linewidth=1)
        sns.stripplot(data=df, x=group, y=outcome, color="#102a43", alpha=0.65, jitter=0.18)
        sns.pointplot(data=df, x=group, y=outcome, errorbar="se", color="#c2573a", markers="D", linestyles="")
    plt.title(f"{outcome} by {group}")
    plt.tight_layout()
    plt.savefig(graph_path, dpi=180)
    plt.close()
    return str(graph_path)


def save_paired_graph(df: pd.DataFrame, outcome: str, group: str, subject: str, out_dir: Path) -> str:
    plt, sns = get_plotting()
    graph_path = out_dir / "graph.png"
    plt.figure(figsize=(8, 6))
    sns.set_theme(style="whitegrid", font="DejaVu Sans")
    for _, unit_df in df.groupby(subject):
        unit_df = unit_df.sort_values(group)
        plt.plot(unit_df[group].astype(str), unit_df[outcome], color="#72818c", alpha=0.35, linewidth=1)
    sns.pointplot(data=df, x=group, y=outcome, errorbar="se", color="#bf5b38", markers="D")
    sns.stripplot(data=df, x=group, y=outcome, color="#102a43", alpha=0.55, jitter=0.08)
    plt.title(f"Paired change in {outcome}")
    plt.tight_layout()
    plt.savefig(graph_path, dpi=180)
    plt.close()
    return str(graph_path)


def save_regression_graph(df: pd.DataFrame, outcome: str, predictor: str, out_dir: Path) -> str:
    plt, sns = get_plotting()
    graph_path = out_dir / "graph.png"
    plt.figure(figsize=(8, 6))
    sns.set_theme(style="whitegrid", font="DejaVu Sans")
    sns.regplot(data=df, x=predictor, y=outcome, scatter_kws={"alpha": 0.7, "color": "#183a54"}, line_kws={"color": "#c2573a"})
    plt.title(f"{outcome} predicted by {predictor}")
    plt.tight_layout()
    plt.savefig(graph_path, dpi=180)
    plt.close()
    return str(graph_path)


def save_lmm_graph(df: pd.DataFrame, outcome: str, group: str | None, time: str, out_dir: Path) -> str:
    plt, sns = get_plotting()
    graph_path = out_dir / "graph.png"
    plt.figure(figsize=(10, 6))
    sns.set_theme(style="whitegrid", font="DejaVu Sans")
    plot_df = df.copy()
    numeric_time = pd.to_numeric(plot_df[time], errors="coerce")
    if numeric_time.notna().mean() >= 0.8:
        plot_df[time] = numeric_time
    if group:
        sns.lineplot(
            data=plot_df,
            x=time,
            y=outcome,
            hue=group,
            estimator="mean",
            errorbar="se",
            marker="o",
            linewidth=2.2,
        )
        plt.title(f"Longitudinal mean +/- SEM: {outcome}")
    else:
        sns.lineplot(data=plot_df, x=time, y=outcome, estimator="mean", errorbar="se", marker="o", linewidth=2.2)
        plt.title(f"Longitudinal mean +/- SEM: {outcome}")
    plt.tight_layout()
    plt.savefig(graph_path, dpi=180)
    plt.close()
    return str(graph_path)


def save_contingency_graph(df: pd.DataFrame, outcome: str, group: str, out_dir: Path) -> str:
    plt, sns = get_plotting()
    graph_path = out_dir / "graph.png"
    counts = pd.crosstab(df[group].astype(str), df[outcome].astype(str), normalize="index").reset_index()
    long_counts = counts.melt(id_vars=group, var_name=outcome, value_name="proportion")
    plt.figure(figsize=(9, 6))
    sns.set_theme(style="whitegrid", font="DejaVu Sans")
    sns.barplot(data=long_counts, x=group, y="proportion", hue=outcome)
    plt.title(f"Proportion of {outcome} by {group}")
    plt.ylim(0, 1)
    plt.tight_layout()
    plt.savefig(graph_path, dpi=180)
    plt.close()
    return str(graph_path)


def clean_analysis_df(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    required = [column for column in columns if column]
    missing = [column for column in required if column not in df.columns]
    if missing:
        raise ValueError("The table is missing required mapped columns: " + ", ".join(missing))
    clean = df.dropna(subset=required).copy()
    return clean


def ci_for_mean_difference(mean_diff: float, se_diff: float, dof: float) -> tuple[float | None, float | None]:
    if not np.isfinite(se_diff) or not np.isfinite(dof) or dof <= 0:
        return None, None
    crit = stats.t.ppf(0.975, dof)
    return float(mean_diff - crit * se_diff), float(mean_diff + crit * se_diff)


def run_unpaired_ttest(df: pd.DataFrame, outcome: str, group: str, out_dir: Path, recommendation: dict[str, Any]) -> dict[str, Any]:
    clean = clean_analysis_df(df, [outcome, group])
    clean[outcome] = pd.to_numeric(clean[outcome], errors="coerce")
    clean = clean.dropna(subset=[outcome])
    levels = [level for level in clean[group].dropna().astype(str).unique().tolist()]
    if len(levels) != 2:
        raise ValueError("Unpaired t-test requires exactly two groups.")

    a = clean.loc[clean[group].astype(str) == levels[0], outcome]
    b = clean.loc[clean[group].astype(str) == levels[1], outcome]
    test = stats.ttest_ind(a, b, equal_var=False, nan_policy="omit")
    mean_diff = float(a.mean() - b.mean())
    se_diff = math.sqrt(float(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b)))
    numerator = (float(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))) ** 2
    denominator = ((float(a.var(ddof=1) / len(a)) ** 2) / (len(a) - 1)) + ((float(b.var(ddof=1) / len(b)) ** 2) / (len(b) - 1))
    dof = numerator / denominator if denominator else np.nan
    ci_low, ci_high = ci_for_mean_difference(mean_diff, se_diff, dof)
    pooled_sd = math.sqrt(((len(a) - 1) * float(a.var(ddof=1)) + (len(b) - 1) * float(b.var(ddof=1))) / max(1, len(a) + len(b) - 2))
    cohen_d = mean_diff / pooled_sd if pooled_sd else None

    summary = group_summary(clean, outcome, [group])
    result = pd.DataFrame(
        [
            {
                "test": "Welch unpaired t-test",
                "group_1": levels[0],
                "group_2": levels[1],
                "mean_difference": mean_diff,
                "ci95_low": ci_low,
                "ci95_high": ci_high,
                "t_statistic": float(test.statistic),
                "df": float(dof) if np.isfinite(dof) else None,
                "p_value": float(test.pvalue),
                "cohens_d": cohen_d,
            }
        ]
    )

    graph_path = save_group_graph(clean, outcome, group, out_dir)
    tables = [dataframe_to_table("Test result", result), dataframe_to_table("Group summary", summary)]
    p_text = f"p = {float(test.pvalue):.4g}"
    return finalize_analysis(
        out_dir=out_dir,
        job_id=out_dir.name,
        analysis_name="Welch unpaired t-test",
        formula=None,
        n_used=len(clean),
        warnings=recommendation.get("warnings", []),
        interpretation=f"The estimated mean difference ({levels[0]} - {levels[1]}) is {mean_diff:.3g}; {p_text}.",
        methods=f"{outcome} was compared between {levels[0]} and {levels[1]} using Welch's unpaired t-test.",
        results=f"{outcome} differed by an estimated {mean_diff:.3g} units between groups ({p_text}).",
        tables=tables,
        graph_path=graph_path,
    )


def run_paired_ttest(df: pd.DataFrame, outcome: str, group: str, subject: str, out_dir: Path, recommendation: dict[str, Any]) -> dict[str, Any]:
    clean = clean_analysis_df(df, [outcome, group, subject])
    clean[outcome] = pd.to_numeric(clean[outcome], errors="coerce")
    clean = clean.dropna(subset=[outcome])
    levels = [level for level in clean[group].dropna().astype(str).unique().tolist()]
    if len(levels) != 2:
        raise ValueError("Paired t-test requires exactly two conditions/timepoints.")

    pivot = clean.pivot_table(index=subject, columns=group, values=outcome, aggfunc="mean")
    pivot = pivot.dropna(subset=levels)
    if len(pivot) < 2:
        raise ValueError("Paired t-test requires at least two complete pairs.")

    diff = pivot[levels[0]] - pivot[levels[1]]
    test = stats.ttest_rel(pivot[levels[0]], pivot[levels[1]], nan_policy="omit")
    mean_diff = float(diff.mean())
    se_diff = float(diff.std(ddof=1) / math.sqrt(len(diff)))
    ci_low, ci_high = ci_for_mean_difference(mean_diff, se_diff, len(diff) - 1)
    dz = mean_diff / float(diff.std(ddof=1)) if float(diff.std(ddof=1)) else None
    result = pd.DataFrame(
        [
            {
                "test": "Paired t-test",
                "condition_1": levels[0],
                "condition_2": levels[1],
                "complete_pairs": int(len(pivot)),
                "mean_paired_difference": mean_diff,
                "ci95_low": ci_low,
                "ci95_high": ci_high,
                "t_statistic": float(test.statistic),
                "df": int(len(diff) - 1),
                "p_value": float(test.pvalue),
                "cohens_dz": dz,
            }
        ]
    )
    summary = group_summary(clean[clean[subject].isin(pivot.index)], outcome, [group])
    graph_path = save_paired_graph(clean[clean[subject].isin(pivot.index)], outcome, group, subject, out_dir)
    tables = [dataframe_to_table("Paired test result", result), dataframe_to_table("Condition summary", summary)]
    p_text = f"p = {float(test.pvalue):.4g}"
    return finalize_analysis(
        out_dir=out_dir,
        job_id=out_dir.name,
        analysis_name="Paired t-test",
        formula=None,
        n_used=int(len(pivot)),
        warnings=recommendation.get("warnings", []),
        interpretation=f"The mean paired difference ({levels[0]} - {levels[1]}) is {mean_diff:.3g}; {p_text}.",
        methods=f"{outcome} was compared across paired {group} levels using a paired t-test with {subject} as the pairing variable.",
        results=f"The paired difference was {mean_diff:.3g} units ({p_text}).",
        tables=tables,
        graph_path=graph_path,
    )


def run_linear_regression(df: pd.DataFrame, outcome: str, predictor: str, out_dir: Path, recommendation: dict[str, Any]) -> dict[str, Any]:
    clean = clean_analysis_df(df, [outcome, predictor])
    clean[outcome] = pd.to_numeric(clean[outcome], errors="coerce")
    clean[predictor] = pd.to_numeric(clean[predictor], errors="coerce")
    clean = clean.dropna(subset=[outcome, predictor])
    if len(clean) < 3:
        raise ValueError("Linear regression requires at least three complete observations.")

    result = stats.linregress(clean[predictor], clean[outcome])
    regression = pd.DataFrame(
        [
            {
                "term": predictor,
                "slope": float(result.slope),
                "intercept": float(result.intercept),
                "r_value": float(result.rvalue),
                "r_squared": float(result.rvalue**2),
                "p_value": float(result.pvalue),
                "slope_std_error": float(result.stderr),
                "intercept_std_error": float(result.intercept_stderr) if result.intercept_stderr is not None else None,
            }
        ]
    )
    graph_path = save_regression_graph(clean, outcome, predictor, out_dir)
    p_text = f"p = {float(result.pvalue):.4g}"
    return finalize_analysis(
        out_dir=out_dir,
        job_id=out_dir.name,
        analysis_name="Linear regression",
        formula=f"{outcome} ~ {predictor}",
        n_used=len(clean),
        warnings=recommendation.get("warnings", []),
        interpretation=f"For each one-unit increase in {predictor}, {outcome} changes by {float(result.slope):.3g} units on average; {p_text}.",
        methods=f"A simple linear regression model was fit: {outcome} ~ {predictor}.",
        results=f"The fitted slope for {predictor} was {float(result.slope):.3g} (R^2 = {float(result.rvalue**2):.3g}, {p_text}).",
        tables=[dataframe_to_table("Regression result", regression)],
        graph_path=graph_path,
    )


def run_categorical_test(df: pd.DataFrame, outcome: str, group: str, out_dir: Path, recommendation: dict[str, Any]) -> dict[str, Any]:
    clean = clean_analysis_df(df, [outcome, group])
    contingency = pd.crosstab(clean[group].astype(str), clean[outcome].astype(str))
    if contingency.shape == (2, 2):
        odds_ratio, p_value = stats.fisher_exact(contingency)
        test_name = "Fisher's exact test"
        statistic = odds_ratio
        statistic_name = "odds_ratio"
    else:
        chi2, p_value, dof, expected = stats.chi2_contingency(contingency)
        test_name = "Chi-square test"
        statistic = chi2
        statistic_name = "chi_square"

    result = pd.DataFrame(
        [
            {
                "test": test_name,
                statistic_name: float(statistic),
                "p_value": float(p_value),
                "rows": int(contingency.shape[0]),
                "columns": int(contingency.shape[1]),
            }
        ]
    )
    table = contingency.reset_index()
    graph_path = save_contingency_graph(clean, outcome, group, out_dir)
    p_text = f"p = {float(p_value):.4g}"
    return finalize_analysis(
        out_dir=out_dir,
        job_id=out_dir.name,
        analysis_name=test_name,
        formula=None,
        n_used=len(clean),
        warnings=recommendation.get("warnings", []),
        interpretation=f"The contingency test compared the distribution of {outcome} across {group}; {p_text}.",
        methods=f"Counts of {outcome} were compared across {group} using {test_name}.",
        results=f"The association between {outcome} and {group} was tested using {test_name} ({p_text}).",
        tables=[dataframe_to_table("Categorical test result", result), dataframe_to_table("Contingency table", table)],
        graph_path=graph_path,
    )


def run_r_analysis(
    analysis_type: str,
    df: pd.DataFrame,
    out_dir: Path,
    recommendation: dict[str, Any],
    outcome: str,
    group: str | None = None,
    factor2: str | None = None,
    predictor: str | None = None,
    subject: str | None = None,
    time: str | None = None,
) -> dict[str, Any]:
    required = [outcome, group, factor2, predictor, subject, time]
    clean = clean_analysis_df(df, [column for column in required if column])
    clean[outcome] = pd.to_numeric(clean[outcome], errors="coerce")
    if predictor:
        clean[predictor] = pd.to_numeric(clean[predictor], errors="coerce")
    if time:
        converted = pd.to_numeric(clean[time], errors="coerce")
        if converted.notna().mean() >= 0.8:
            clean[time] = converted
    clean = clean.dropna(subset=[outcome])

    input_csv = out_dir / "analysis_input.csv"
    clean.to_csv(input_csv, index=False)

    args = [
        "Rscript",
        str(R_SCRIPT),
        analysis_type,
        str(input_csv),
        str(out_dir),
        outcome or "",
        group or "",
        factor2 or "",
        predictor or "",
        subject or "",
        time or "",
    ]
    completed = subprocess.run(args, cwd=str(ROOT), capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            "R analysis failed.\nSTDOUT:\n"
            + completed.stdout
            + "\nSTDERR:\n"
            + completed.stderr
        )

    tables: list[dict[str, Any]] = []
    for csv_path in sorted(out_dir.glob("table_*.csv")):
        title = csv_path.stem.replace("table_", "").replace("_", " ").title()
        table_df = pd.read_csv(csv_path)
        tables.append(dataframe_to_table(title, table_df))

    if not tables:
        tables.append(dataframe_to_table("R output", pd.DataFrame({"message": ["R completed without a table."]})))

    warnings_out = recommendation.get("warnings", [])
    r_warnings_path = out_dir / "r_warnings.txt"
    if r_warnings_path.exists():
        extra = [line.strip() for line in r_warnings_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        warnings_out = list(dict.fromkeys([*warnings_out, *extra]))

    if analysis_type == "one_way_anova":
        analysis_name = "One-way ANOVA"
        formula = f"{outcome} ~ {group}"
        graph_path = save_group_graph(clean, outcome, group or "", out_dir)
        methods = f"{outcome} was analyzed using one-way ANOVA with {group} as the group factor."
        interpretation = f"The ANOVA tests whether mean {outcome} differs among levels of {group}."
        results = extract_primary_pvalue_sentence(tables, "The one-way ANOVA")
    elif analysis_type == "two_way_anova":
        analysis_name = "Two-way ANOVA"
        formula = f"{outcome} ~ {group} * {factor2}"
        graph_path = save_group_graph(clean, outcome, group or "", out_dir, factor2=factor2)
        methods = f"{outcome} was analyzed using two-way ANOVA with {group}, {factor2}, and their interaction."
        interpretation = f"The model tests main effects of {group} and {factor2}, plus whether their effects interact."
        results = extract_primary_pvalue_sentence(tables, "The two-way ANOVA")
    elif analysis_type == "linear_mixed_effects_model":
        analysis_name = "Longitudinal Linear Mixed-Effects Model"
        formula = recommendation.get("suggestedFormula") or f"{outcome} ~ {group} * {time} + (1 | {subject})"
        graph_path = save_lmm_graph(clean, outcome, group, time or "", out_dir)
        methods = (
            f"A linear mixed-effects model was fit using {formula}. "
            f"The random intercept accounts for repeated observations within {subject}."
        )
        interpretation = (
            f"The fixed effects test whether {outcome} differs by {group}, changes over {time}, "
            f"or changes differently over {time} across groups."
        )
        results = extract_primary_pvalue_sentence(tables, "The mixed-effects model")
    else:
        analysis_name = analysis_type.replace("_", " ").title()
        formula = recommendation.get("suggestedFormula")
        graph_path = None
        methods = f"{analysis_name} was run using R."
        interpretation = f"The analysis completed for {outcome}."
        results = extract_primary_pvalue_sentence(tables, f"The {analysis_name}")

    return finalize_analysis(
        out_dir=out_dir,
        job_id=out_dir.name,
        analysis_name=analysis_name,
        formula=formula,
        n_used=len(clean),
        warnings=warnings_out,
        interpretation=interpretation,
        methods=methods,
        results=results,
        tables=tables,
        graph_path=graph_path,
    )


def extract_primary_pvalue_sentence(tables: list[dict[str, Any]], prefix: str) -> str:
    for table in tables:
        for row in table.get("rows", []):
            for key, value in row.items():
                if "p" in key.lower() and value is not None:
                    try:
                        return f"{prefix} produced {key} = {float(value):.4g} for {row.get('term') or row.get('Effect') or row.get('effect') or 'the tested effect'}."
                    except (TypeError, ValueError):
                        continue
    return f"{prefix} completed. Review the output tables for effect-specific p-values."


def finalize_analysis(
    *,
    out_dir: Path,
    job_id: str,
    analysis_name: str,
    formula: str | None,
    n_used: int,
    warnings: list[str],
    interpretation: str,
    methods: str,
    results: str,
    tables: list[dict[str, Any]],
    graph_path: str | None,
) -> dict[str, Any]:
    result_csv, result_xlsx = write_table_outputs(tables, out_dir, "statistical_results")
    payload = {
        "jobId": job_id,
        "analysisName": analysis_name,
        "formula": formula,
        "nUsed": int(n_used),
        "warnings": list(dict.fromkeys(warnings)),
        "interpretation": interpretation,
        "methodsText": methods,
        "resultsText": results,
        "tables": tables,
        "graphPath": graph_path,
        "resultCsvPath": result_csv,
        "resultXlsxPath": result_xlsx,
    }
    with open(out_dir / "result.json", "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False, allow_nan=False)
    return payload


def analyze_table(path: str, out_dir: str, config_path: str) -> dict[str, Any]:
    config = load_config(config_path)
    answers = config["answers"]
    recommendation = config["recommendation"]
    analysis_id = recommendation["id"]
    df = read_table(path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    outcome = answers.get("outcomeColumn")
    group = answers.get("groupColumn")
    factor2 = answers.get("secondaryFactorColumn")
    predictor = answers.get("predictorColumn")
    subject = answers.get("subjectIdColumn")
    time = answers.get("timeColumn")

    if not outcome:
        raise ValueError("Choose an outcome column before running analysis.")

    if analysis_id == "unpaired-t-test":
        if not group:
            raise ValueError("Unpaired t-test requires a group column.")
        return run_unpaired_ttest(df, outcome, group, out, recommendation)
    if analysis_id == "paired-t-test":
        if not group or not subject:
            raise ValueError("Paired t-test requires group/condition and subject ID columns.")
        return run_paired_ttest(df, outcome, group, subject, out, recommendation)
    if analysis_id == "one-way-anova":
        if not group:
            raise ValueError("One-way ANOVA requires a group column.")
        return run_r_analysis("one_way_anova", df, out, recommendation, outcome, group=group)
    if analysis_id == "two-way-anova":
        if not group or not factor2:
            raise ValueError("Two-way ANOVA requires two factor columns.")
        return run_r_analysis("two_way_anova", df, out, recommendation, outcome, group=group, factor2=factor2)
    if analysis_id == "linear-regression":
        if not predictor:
            numeric_columns = [
                column
                for column in df.columns
                if column != outcome and pd.to_numeric(df[column], errors="coerce").notna().mean() >= 0.85
            ]
            if not numeric_columns:
                raise ValueError("Linear regression requires a numeric predictor column.")
            predictor = numeric_columns[0]
        return run_linear_regression(df, outcome, predictor, out, recommendation)
    if analysis_id == "linear-mixed-effects-model":
        if not group or not subject or not time:
            raise ValueError("Mixed-effects model requires group, subject ID, and time/session columns.")
        return run_r_analysis(
            "linear_mixed_effects_model",
            df,
            out,
            recommendation,
            outcome,
            group=group,
            subject=subject,
            time=time,
        )
    if analysis_id in {"fisher-or-chi-square", "chi-square"}:
        if not group:
            raise ValueError("Categorical test requires a group column.")
        return run_categorical_test(df, outcome, group, out, recommendation)

    raise ValueError(f"The MVP runner does not yet support recommendation id: {analysis_id}")


def convert_table(path: str, out_dir: str, config_path: str) -> dict[str, Any]:
    config = load_config(config_path)
    answers = config["answers"]
    profile = config["profile"]
    direction = config["direction"]
    conversion_id = config["conversionId"]
    df = read_table(path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    notes: list[str] = []

    if direction == "wide_to_long":
        value_columns = [column for column in profile.get("numericOutcomeColumns", []) if column in df.columns]
        if answers.get("outcomeColumn") in df.columns and answers.get("outcomeColumn") not in value_columns:
            value_columns.append(answers["outcomeColumn"])
        if not value_columns:
            value_columns = [
                column
                for column in df.columns
                if pd.to_numeric(df[column], errors="coerce").notna().mean() >= 0.85
            ]
        id_columns = [column for column in df.columns if column not in value_columns]
        if not value_columns:
            raise ValueError("No numeric measurement columns were found for wide-to-long conversion.")
        converted = pd.melt(
            df,
            id_vars=id_columns,
            value_vars=value_columns,
            var_name="measurement_name",
            value_name=answers.get("outcomeColumn") or "value",
        )
        extracted = converted["measurement_name"].astype(str).str.extract(r"(\d+)")
        if not extracted.empty and extracted[0].notna().any():
            converted["session_from_column"] = pd.to_numeric(extracted[0], errors="coerce")
            notes.append("A numeric session_from_column was extracted from measurement column names where possible.")
        notes.append("Converted wide data to long format using numeric measurement columns as repeated values.")
    else:
        outcome = answers.get("outcomeColumn")
        time = answers.get("timeColumn")
        if not outcome or not time:
            raise ValueError("Long-to-wide conversion requires an outcome column and a time/session column.")
        index_columns = [
            column
            for column in df.columns
            if column not in {outcome, time}
            and df[column].nunique(dropna=True) <= max(50, len(df) // 2)
        ]
        if not index_columns:
            subject = answers.get("subjectIdColumn")
            index_columns = [subject] if subject in df.columns else [df.columns[0]]
        converted = (
            df.pivot_table(index=index_columns, columns=time, values=outcome, aggfunc="mean")
            .reset_index()
        )
        converted.columns = [
            str(column) if not isinstance(column, tuple) else "_".join(str(part) for part in column if part != "")
            for column in converted.columns
        ]
        converted = converted.rename(
            columns={
                column: f"{outcome}_{column}"
                for column in converted.columns
                if column not in index_columns
            }
        )
        notes.append("Created a wide table using the mean value when multiple rows mapped to the same cell.")

    csv_path = out / "converted_table.csv"
    xlsx_path = out / "converted_table.xlsx"
    converted.to_csv(csv_path, index=False)
    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        converted.to_excel(writer, sheet_name="Converted", index=False)

    return {
        "conversionId": conversion_id,
        "direction": direction,
        "preview": clean_dataframe_for_json(converted),
        "rows": int(len(converted)),
        "columns": int(len(converted.columns)),
        "columnNames": [str(column) for column in converted.columns],
        "csvPath": str(csv_path),
        "xlsxPath": str(xlsx_path),
        "notes": notes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Statistics Navigator backend")
    subparsers = parser.add_subparsers(dest="command", required=True)

    profile_parser = subparsers.add_parser("profile")
    profile_parser.add_argument("path")
    profile_parser.add_argument("--dataset-id", default=str(uuid.uuid4()))
    profile_parser.add_argument("--original-name", default="dataset")

    analyze_parser = subparsers.add_parser("analyze")
    analyze_parser.add_argument("path")
    analyze_parser.add_argument("out_dir")
    analyze_parser.add_argument("config_path")

    convert_parser = subparsers.add_parser("convert")
    convert_parser.add_argument("path")
    convert_parser.add_argument("out_dir")
    convert_parser.add_argument("config_path")

    args = parser.parse_args()

    try:
        if args.command == "profile":
            print_json(profile_table(args.path, args.dataset_id, args.original_name))
        elif args.command == "analyze":
            print_json(analyze_table(args.path, args.out_dir, args.config_path))
        elif args.command == "convert":
            print_json(convert_table(args.path, args.out_dir, args.config_path))
        else:
            raise ValueError(f"Unknown command: {args.command}")
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
