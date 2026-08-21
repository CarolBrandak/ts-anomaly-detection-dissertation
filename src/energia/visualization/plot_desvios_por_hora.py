"""Gera o gráfico agregado dos desvios horários de energia."""

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[3]
ALERTS_DIR = PROJECT_ROOT / "results" / "energia" / "realtime" / "alerts"
OUTPUT_DIR = PROJECT_ROOT / "results" / "energia" / "realtime" / "analysis"
DATES = pd.date_range("2026-08-06", "2026-08-11", freq="D")


def load_results() -> pd.DataFrame:
    frames = []
    for date in DATES:
        path = ALERTS_DIR / f"analise_energia_{date:%Y-%m-%d}.csv"
        if not path.exists():
            raise FileNotFoundError(f"Ficheiro não encontrado: {path}")
        frames.append(pd.read_csv(path))

    results = pd.concat(frames, ignore_index=True)
    required = {"hora", "veredicto", "direcao"}
    missing = required.difference(results.columns)
    if missing:
        raise ValueError(f"Colunas em falta: {', '.join(sorted(missing))}")
    return results


def aggregate_deviations(results: pd.DataFrame) -> pd.DataFrame:
    deviations = results.loc[results["veredicto"].eq("desvio")].copy()
    counts = (
        deviations.groupby(["hora", "direcao"])
        .size()
        .unstack(fill_value=0)
        .reindex(range(24), fill_value=0)
    )
    return counts.reindex(columns=["abaixo", "acima"], fill_value=0)


def create_plot(counts: pd.DataFrame) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    hours = counts.index
    below = counts["abaixo"]
    above = counts["acima"]
    totals = below + above

    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.bar(
        hours,
        below,
        width=0.78,
        color="#3274A1",
        label="Abaixo do esperado",
    )
    ax.bar(
        hours,
        above,
        width=0.78,
        bottom=below,
        color="#D1495B",
        label="Acima do esperado",
    )

    for hour, total in totals.items():
        ax.text(hour, total + 1.2, str(int(total)), ha="center", va="bottom", fontsize=8)

    ax.set_title("Desvios de energia por hora (6–11 de agosto de 2026)")
    ax.set_xlabel("Hora")
    ax.set_ylabel("Número de desvios")
    ax.set_xticks(range(24))
    ax.set_xlim(-0.7, 23.7)
    ax.set_ylim(0, totals.max() * 1.18)
    ax.grid(axis="y", linestyle="--", linewidth=0.7, alpha=0.35)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, ncols=2, loc="upper right")

    fig.tight_layout()
    for extension in ("pdf", "png"):
        output = OUTPUT_DIR / f"desvios_energia_por_hora.{extension}"
        fig.savefig(output, dpi=300, bbox_inches="tight")
        print(output)
    plt.close(fig)


if __name__ == "__main__":
    create_plot(aggregate_deviations(load_results()))
