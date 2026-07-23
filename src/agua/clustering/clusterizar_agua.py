#!/usr/bin/env python3
"""
Clustering exploratorio dos contadores de agua.

Este script usa os CSVs ja gerados pela deteccao em tempo real:
  results/agua/realtime/alerts/analise_agua_YYYY-MM-DD.csv

Para cada contador, constroi um perfil horario medio com 24 valores em
percentagem do consumo total. Depois aplica PCA e K-Means para separar os
contadores por forma de consumo, nao apenas por volume absoluto.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score


SRC_ROOT = Path(__file__).resolve().parents[2]
if str(SRC_ROOT) not in sys.path:
    sys.path.append(str(SRC_ROOT))

from config.paths import (  # noqa: E402
    AGUA_ALERTS_DIR,
    AGUA_CLUSTERS_ATRIBUIDOS_PATH,
    AGUA_CLUSTERS_PATH,
    INTERACTIVE_AGUA_PCA_HTML,
    RESULTS_AGUA_CLUSTERING_DIR,
    RESULTS_AGUA_FEATURES_DIR,
    RESULTS_AGUA_MODELS_DIR,
)


FILENAME_RE = re.compile(r"analise_agua_(\d{4}-\d{2}-\d{2})\.csv$")
HOUR_COLUMNS = [f"f{i + 1:02d}_pct_hora_{i:02d}" for i in range(24)]
DEFAULT_N_CLUSTERS = 2
DEFAULT_MIN_DIAS = 5
DEFAULT_MIN_TOTAL_M3 = 0.1
DEFAULT_MIN_HORAS_ATIVAS = 6
RANDOM_STATE = 42


@dataclass(frozen=True)
class Params:
    data_inicio: Optional[date]
    data_fim: Optional[date]
    n_clusters: int
    min_dias: int
    min_total_m3: float
    min_horas_ativas: int


def parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Data invalida: {value}. Usa YYYY-MM-DD."
        ) from exc


def date_from_filename(path: Path) -> Optional[date]:
    match = FILENAME_RE.match(path.name)
    if not match:
        return None
    return date.fromisoformat(match.group(1))


def analysis_files(
    data_inicio: Optional[date],
    data_fim: Optional[date],
) -> list[tuple[date, Path]]:
    files: list[tuple[date, Path]] = []
    for path in sorted(AGUA_ALERTS_DIR.glob("analise_agua_*.csv")):
        data = date_from_filename(path)
        if data is None:
            continue
        if data_inicio and data < data_inicio:
            continue
        if data_fim and data > data_fim:
            continue
        files.append((data, path))
    return files


def load_analysis(files: list[tuple[date, Path]]) -> pd.DataFrame:
    frames = []
    required = {"CPE", "hora", "consumo_real"}

    for data, path in files:
        df = pd.read_csv(path, dtype={"CPE": str})
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"{path} nao tem as colunas obrigatorias: {sorted(missing)}")

        cols = ["CPE", "hora", "consumo_real"]
        if "veredicto" in df.columns:
            cols.append("veredicto")
        tmp = df[cols].copy()
        tmp["data"] = data
        tmp["CPE"] = tmp["CPE"].astype(str).str.strip()
        tmp["hora"] = pd.to_numeric(tmp["hora"], errors="coerce")
        tmp["consumo_real"] = pd.to_numeric(tmp["consumo_real"], errors="coerce")
        tmp = tmp.dropna(subset=["CPE", "hora", "consumo_real"])
        tmp = tmp[(tmp["hora"] >= 0) & (tmp["hora"] <= 23)]
        tmp["hora"] = tmp["hora"].astype(int)
        tmp["consumo_real"] = tmp["consumo_real"].clip(lower=0)
        frames.append(tmp)

    if not frames:
        return pd.DataFrame(columns=["CPE", "hora", "consumo_real", "data"])

    return pd.concat(frames, ignore_index=True)


def build_features(
    rows: pd.DataFrame,
    min_dias: int,
    min_total_m3: float,
    min_horas_ativas: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if rows.empty:
        return pd.DataFrame(columns=HOUR_COLUMNS), pd.DataFrame()

    hourly = (
        rows.groupby(["CPE", "hora"], as_index=False)["consumo_real"]
        .sum()
        .pivot(index="CPE", columns="hora", values="consumo_real")
        .reindex(columns=range(24), fill_value=0)
        .fillna(0)
    )

    total = hourly.sum(axis=1)
    horas_ativas = (hourly > 0).sum(axis=1)
    dias = rows.groupby("CPE")["data"].nunique()
    horas = rows.groupby("CPE")[["data", "hora"]].apply(
        lambda g: g.drop_duplicates().shape[0]
    )
    desvio_col = (
        rows["veredicto"].eq("desvio")
        if "veredicto" in rows.columns
        else pd.Series(False, index=rows.index)
    )
    desvios = rows.assign(_desvio=desvio_col).groupby("CPE")["_desvio"].sum()

    valid = (total >= min_total_m3) & (dias >= min_dias) & (horas_ativas >= min_horas_ativas)
    hourly = hourly.loc[valid]
    total = total.loc[valid]
    horas_ativas = horas_ativas.loc[valid]
    dias = dias.loc[valid]
    horas = horas.loc[valid]
    desvios = desvios.reindex(hourly.index, fill_value=0)

    if hourly.empty:
        return pd.DataFrame(columns=HOUR_COLUMNS), pd.DataFrame()

    features = hourly.div(total, axis=0).mul(100)
    features.columns = HOUR_COLUMNS
    features.index.name = "CPE"

    def pct_for(hours: list[int]) -> pd.Series:
        return hourly.reindex(columns=hours, fill_value=0).sum(axis=1).div(total).mul(100)

    metadata = pd.DataFrame(index=features.index)
    metadata["dias_com_dados"] = dias.astype(int)
    metadata["horas_com_dados"] = horas.astype(int)
    metadata["horas_ativas"] = horas_ativas.astype(int)
    metadata["consumo_total_m3"] = total.round(4)
    metadata["consumo_medio_dia_m3"] = (total / dias).round(4)
    metadata["pct_madrugada"] = pct_for([0, 1, 2, 3, 4, 5, 6]).round(2)
    metadata["pct_laboral"] = pct_for([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]).round(2)
    metadata["pct_noite"] = pct_for([18, 19, 20, 21, 22, 23]).round(2)
    metadata["hora_pico"] = hourly.idxmax(axis=1).astype(int)
    metadata["pct_hora_pico"] = features.max(axis=1).round(2)
    metadata["desvios_no_periodo"] = desvios.astype(int)
    metadata.index.name = "CPE"

    return features, metadata


def describe_excluded(
    rows: pd.DataFrame,
    included: pd.Index,
    min_dias: int,
    min_total_m3: float,
    min_horas_ativas: int,
) -> pd.DataFrame:
    if rows.empty:
        return pd.DataFrame(
            columns=["CPE", "dias_com_dados", "horas_ativas", "consumo_total_m3", "motivo"]
        )

    hourly = (
        rows.groupby(["CPE", "hora"], as_index=False)["consumo_real"]
        .sum()
        .pivot(index="CPE", columns="hora", values="consumo_real")
        .reindex(columns=range(24), fill_value=0)
        .fillna(0)
    )
    total = hourly.sum(axis=1)
    horas_ativas = (hourly > 0).sum(axis=1)
    dias = rows.groupby("CPE")["data"].nunique()

    included_set = set(included)
    excluded = []
    for cpe in sorted(set(rows["CPE"]) - included_set):
        motivos = []
        dias_cpe = int(dias.get(cpe, 0))
        total_cpe = float(total.get(cpe, 0.0))
        if dias_cpe < min_dias:
            motivos.append(f"menos de {min_dias} dias com dados")
        if total_cpe < min_total_m3:
            motivos.append("consumo total muito baixo")
        if int(horas_ativas.get(cpe, 0)) < min_horas_ativas:
            motivos.append(f"menos de {min_horas_ativas} horas com consumo")
        excluded.append(
            {
                "CPE": cpe,
                "dias_com_dados": dias_cpe,
                "horas_ativas": int(horas_ativas.get(cpe, 0)),
                "consumo_total_m3": round(total_cpe, 4),
                "motivo": " + ".join(motivos) or "excluido",
            }
        )

    return pd.DataFrame(excluded)


def cluster_features(
    features: pd.DataFrame,
    n_clusters: int,
) -> tuple[pd.Series, pd.DataFrame, PCA, KMeans, Optional[float]]:
    n_samples = len(features)
    if n_samples < 2:
        raise ValueError("Sao precisos pelo menos 2 contadores para calcular PCA.")

    k = max(1, min(n_clusters, n_samples))
    x = features[HOUR_COLUMNS].to_numpy(dtype=float)

    pca = PCA(n_components=2, random_state=RANDOM_STATE)
    coords = pca.fit_transform(x)

    if k == 1:
        labels = np.zeros(n_samples, dtype=int)
        kmeans = KMeans(n_clusters=1, n_init=1, random_state=RANDOM_STATE)
        kmeans.fit(x)
        score = None
    else:
        kmeans = KMeans(n_clusters=k, n_init=30, random_state=RANDOM_STATE)
        labels = kmeans.fit_predict(x)
        score = float(silhouette_score(x, labels)) if n_samples > k else None

    clusters = pd.Series(labels.astype(int), index=features.index, name="cluster")
    pca_df = pd.DataFrame(
        {
            "PC1": coords[:, 0],
            "PC2": coords[:, 1],
            "cluster": clusters.astype(int).values,
        },
        index=features.index,
    )
    pca_df.index.name = "CPE"
    return clusters, pca_df, pca, kmeans, score


def summarize_clusters(
    features: pd.DataFrame,
    metadata: pd.DataFrame,
    clusters: pd.Series,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    joined = features.join(metadata).join(clusters)

    perfil_medio = joined.groupby("cluster")[HOUR_COLUMNS].mean().round(3)
    perfil_medio.index.name = "cluster"

    rows = []
    for cluster, group in joined.groupby("cluster"):
        profile = perfil_medio.loc[cluster]
        pico_col = profile.idxmax()
        pico_hora = int(pico_col.rsplit("_", 1)[-1])
        rows.append(
            {
                "cluster": int(cluster),
                "n_contadores": int(len(group)),
                "consumo_total_m3": round(float(group["consumo_total_m3"].sum()), 4),
                "consumo_medio_dia_m3": round(float(group["consumo_medio_dia_m3"].mean()), 4),
                "dias_medios_com_dados": round(float(group["dias_com_dados"].mean()), 1),
                "pct_madrugada": round(float(group["pct_madrugada"].mean()), 2),
                "pct_laboral": round(float(group["pct_laboral"].mean()), 2),
                "pct_noite": round(float(group["pct_noite"].mean()), 2),
                "hora_pico_media": pico_hora,
                "pct_hora_pico_media": round(float(profile.max()), 2),
            }
        )

    summary = pd.DataFrame(rows).sort_values("cluster")
    return summary, perfil_medio


def csv_preview_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def make_interactive_html(
    records: list[dict],
    summary: list[dict],
    pc1_var: float,
    pc2_var: float,
    data_inicio: date,
    data_fim: date,
    silhouette: Optional[float],
) -> str:
    data_json = json_dumps(records)
    summary_json = json_dumps(summary)
    silhouette_text = "n/a" if silhouette is None else f"{silhouette:.3f}"
    generated = date.today().isoformat()

    return f"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Explorador PCA - Clusters de Agua</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #f5f7fb;
    color: #17202a;
  }}
  header {{
    padding: 24px 28px 14px;
    background: #fff;
    border-bottom: 1px solid #dde5ef;
  }}
  h1 {{ margin: 0 0 6px; font-size: 24px; }}
  .sub {{ color: #6b7787; line-height: 1.5; font-size: 14px; }}
  main {{
    max-width: 1320px;
    margin: 0 auto;
    padding: 22px;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr);
    gap: 18px;
  }}
  .panel {{
    background: #fff;
    border: 1px solid #dde5ef;
    border-radius: 12px;
    box-shadow: 0 12px 34px rgba(20, 33, 61, .08);
    overflow: hidden;
  }}
  .panel-head {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid #e4ebf3;
  }}
  .panel-head h2 {{ margin: 0; font-size: 17px; }}
  .hint {{ color: #8a96a6; font-size: 13px; font-weight: 650; }}
  .body {{ padding: 16px 18px 18px; }}
  .filters {{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }}
  button {{
    border: 1px solid #ccd7e4;
    border-radius: 999px;
    background: #fff;
    color: #445063;
    font-weight: 750;
    padding: 8px 12px;
    cursor: pointer;
  }}
  button.active {{
    color: #fff;
    background: var(--c, #357edd);
    border-color: var(--c, #357edd);
  }}
  button.secondary {{
    border-radius: 8px;
    background: #f6f8fb;
  }}
  .chart-wrap {{
    width: 100%;
    overflow: hidden;
  }}
  svg {{ width: 100%; height: auto; display: block; }}
  .grid {{ stroke: #dbe4ee; stroke-dasharray: 3 6; }}
  .axis {{ stroke: #8794a5; stroke-width: 1.3; }}
  .label {{
    fill: #617083;
    font-size: 12px;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  }}
  circle.point {{
    cursor: pointer;
    transition: stroke-width .15s ease, opacity .15s ease;
  }}
  circle.point:hover,
  circle.point.selected {{
    stroke: #111827;
    stroke-width: 2.4;
  }}
  .stats {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }}
  .stat {{
    border: 1px solid #dbe4ee;
    border-radius: 10px;
    background: #f8fafc;
    padding: 12px;
  }}
  .stat small {{
    display: block;
    color: #7a8798;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }}
  .stat b {{ display: block; margin-top: 4px; font-size: 22px; }}
  .summary-grid {{
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
  }}
  .summary-row {{
    display: grid;
    grid-template-columns: 98px 1fr auto;
    align-items: center;
    gap: 10px;
    border: 1px solid #dbe4ee;
    border-left: 4px solid var(--c);
    border-radius: 9px;
    padding: 10px;
    background: color-mix(in srgb, var(--c) 8%, white);
  }}
  .summary-row b {{ font-size: 18px; }}
  .detail {{
    min-height: 162px;
    border: 1px solid #dbe4ee;
    border-radius: 10px;
    padding: 14px;
    background: #fbfcfe;
  }}
  .detail h3 {{ margin: 0 0 8px; }}
  .detail-grid {{
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin: 12px 0;
  }}
  .metric {{
    border: 1px solid #e0e7f0;
    border-radius: 8px;
    padding: 9px;
    background: #fff;
  }}
  .metric small {{
    display: block;
    color: #7a8798;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }}
  .metric b {{ display: block; margin-top: 4px; }}
  select {{
    width: 100%;
    border: 1px solid #ccd7e4;
    border-radius: 8px;
    padding: 8px 10px;
    font-weight: 700;
    background: #fff;
  }}
  .bars {{ margin-top: 14px; }}
  .bar {{
    display: grid;
    grid-template-columns: 42px 1fr 54px;
    align-items: center;
    gap: 8px;
    margin: 7px 0;
    font-size: 12px;
    color: #5f6f82;
  }}
  .track {{
    height: 10px;
    border-radius: 999px;
    background: #e8eef5;
    overflow: hidden;
  }}
  .fill {{
    height: 100%;
    background: var(--c);
    border-radius: inherit;
  }}
  .download {{
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }}
  @media(max-width: 900px) {{
    main {{ grid-template-columns: 1fr; padding: 14px; }}
    .stats {{ grid-template-columns: 1fr; }}
  }}
</style>
</head>
<body>
<header>
  <h1>Explorador PCA - clusters de agua</h1>
  <div class="sub">
    Baseado nas analises de {data_inicio} a {data_fim}. Como o historico ainda e curto, estes clusters devem ser lidos como uma primeira segmentacao exploratoria.<br>
    PC1: {pc1_var:.1f}% da variancia · PC2: {pc2_var:.1f}% da variancia · silhouette: {silhouette_text} · gerado em {generated}.
  </div>
</header>
<main>
  <section class="panel">
    <div class="panel-head">
      <h2>Projecao PCA dos contadores</h2>
      <span class="hint">clica num ponto para ver o contador</span>
    </div>
    <div class="body">
      <div class="filters" id="filters"></div>
      <div class="chart-wrap" id="chart"></div>
      <div class="download">
        <button class="secondary" id="downloadCsv">Descarregar CSV</button>
      </div>
    </div>
  </section>
  <aside class="panel">
    <div class="panel-head">
      <h2>Resumo</h2>
      <span class="hint">perfil horario em %</span>
    </div>
    <div class="body">
      <div class="stats">
        <div class="stat"><small>Contadores</small><b id="totalCounters">0</b></div>
        <div class="stat"><small>Clusters</small><b id="totalClusters">0</b></div>
        <div class="stat"><small>Dias usados</small><b>{(data_fim - data_inicio).days + 1}</b></div>
      </div>
      <div class="summary-grid" id="summary"></div>
      <div class="detail" id="detail">
        <h3>Escolhe um ponto</h3>
        <p class="sub">Ao clicar num contador aparecem PC1, PC2, cluster e perfil horario.</p>
      </div>
    </div>
  </aside>
</main>
<script>
const RAW_DATA = {data_json};
const SUMMARY = {summary_json};
const COLORS = ["#4C97D4", "#F5A623", "#4CAF50", "#E74C3C", "#9B59B6", "#1ABC9C"];
const STORAGE_KEY = "agua_pca_cluster_edits_v1";
let activeClusters = new Set();
let selectedId = null;

function color(cluster){{
  const n = Number(cluster);
  return COLORS[Number.isFinite(n) ? n % COLORS.length : 0];
}}
function nice(n, dec=1){{
  return Number(n).toLocaleString("pt-PT", {{minimumFractionDigits: dec, maximumFractionDigits: dec}});
}}
function loadManual(){{
  try {{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{{}}"); }}
  catch(e) {{ return {{}}; }}
}}
function saveManual(manual){{
  localStorage.setItem(STORAGE_KEY, JSON.stringify(manual));
}}
const manual = loadManual();
const data = RAW_DATA.map(d => ({{
  ...d,
  baseCluster: String(d.cluster),
  cluster: manual[d.cpe] !== undefined ? String(manual[d.cpe]) : String(d.cluster),
}}));
const clusters = [...new Set(data.map(d => String(d.cluster)))].sort((a,b)=>a.localeCompare(b, "pt", {{numeric:true}}));
clusters.forEach(c => activeClusters.add(c));

function escapeHtml(value){{
  return String(value ?? "").replace(/[&<>"']/g, ch=>({{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}}[ch]));
}}
function csvCell(value){{
  const text = String(value ?? "");
  return /[",\\r\\n]/.test(text) ? `"${{text.replace(/"/g, '""')}}"` : text;
}}
function renderFilters(){{
  const counts = new Map();
  data.forEach(d => counts.set(String(d.cluster), (counts.get(String(d.cluster)) || 0) + 1));
  document.getElementById("filters").innerHTML = clusters.map(c => `
    <button type="button" class="${{activeClusters.has(c) ? "active" : ""}}" style="--c:${{color(c)}}" data-cluster="${{c}}">
      Cluster ${{c}} | ${{counts.get(c) || 0}}
    </button>
  `).join("");
  document.querySelectorAll("#filters button").forEach(btn => {{
    btn.addEventListener("click", () => {{
      const c = btn.dataset.cluster;
      if(activeClusters.has(c)) activeClusters.delete(c);
      else activeClusters.add(c);
      render();
    }});
  }});
}}
function scale(values, minPad=.12){{
  let min = Math.min(...values), max = Math.max(...values);
  if(min === max) {{ min -= 1; max += 1; }}
  const pad = (max - min) * minPad;
  return [min - pad, max + pad];
}}
function renderChart(){{
  const visible = data.filter(d => activeClusters.has(String(d.cluster)));
  const chart = document.getElementById("chart");
  if(!visible.length){{
    chart.innerHTML = "<p class='sub'>Nenhum contador para os filtros escolhidos.</p>";
    return;
  }}
  const W = 820, H = 500, padL = 60, padR = 28, padT = 28, padB = 54;
  const xs = visible.map(d => d.pc1), ys = visible.map(d => d.pc2);
  const [xmin, xmax] = scale(xs), [ymin, ymax] = scale(ys, .18);
  const iw = W - padL - padR, ih = H - padT - padB;
  const X = v => padL + (v - xmin) / (xmax - xmin) * iw;
  const Y = v => padT + (1 - (v - ymin) / (ymax - ymin)) * ih;
  const ticks = (min,max,n=5) => Array.from({{length:n}}, (_,i)=>min+i/(n-1)*(max-min));
  let svg = `<svg viewBox="0 0 ${{W}} ${{H}}" role="img" aria-label="PCA dos contadores de agua">`;
  ticks(xmin,xmax).forEach(v => {{
    const x = X(v);
    svg += `<line class="grid" x1="${{x}}" y1="${{padT}}" x2="${{x}}" y2="${{padT+ih}}"/>`;
    svg += `<text class="label" x="${{x}}" y="${{H-22}}" text-anchor="middle">${{nice(v,1)}}</text>`;
  }});
  ticks(ymin,ymax).forEach(v => {{
    const y = Y(v);
    svg += `<line class="grid" x1="${{padL}}" y1="${{y}}" x2="${{padL+iw}}" y2="${{y}}"/>`;
    svg += `<text class="label" x="${{padL-10}}" y="${{y+4}}" text-anchor="end">${{nice(v,1)}}</text>`;
  }});
  if(xmin < 0 && xmax > 0) svg += `<line class="axis" x1="${{X(0)}}" y1="${{padT}}" x2="${{X(0)}}" y2="${{padT+ih}}"/>`;
  if(ymin < 0 && ymax > 0) svg += `<line class="axis" x1="${{padL}}" y1="${{Y(0)}}" x2="${{padL+iw}}" y2="${{Y(0)}}"/>`;
  visible.forEach(d => {{
    const sel = d.cpe === selectedId ? " selected" : "";
    svg += `<circle class="point${{sel}}" data-cpe="${{escapeHtml(d.cpe)}}"
      cx="${{X(d.pc1).toFixed(1)}}" cy="${{Y(d.pc2).toFixed(1)}}" r="5.5"
      fill="${{color(d.cluster)}}" fill-opacity=".88" stroke="#fff" stroke-width="1.2">
      <title>${{escapeHtml(d.cpe)}} - Cluster ${{escapeHtml(d.cluster)}}</title>
    </circle>`;
  }});
  svg += `<text class="label" x="${{padL+iw/2}}" y="${{H-6}}" text-anchor="middle">PC1</text>`;
  svg += `<text class="label" x="18" y="${{padT+ih/2}}" text-anchor="middle" transform="rotate(-90 18 ${{padT+ih/2}})">PC2</text>`;
  svg += "</svg>";
  chart.innerHTML = svg;
  chart.querySelectorAll("circle.point").forEach(circle => {{
    circle.addEventListener("click", () => {{
      selectedId = circle.dataset.cpe;
      renderDetail();
      renderChart();
    }});
  }});
}}
function renderSummary(){{
  const counts = new Map();
  data.forEach(d => counts.set(String(d.cluster), (counts.get(String(d.cluster)) || 0) + 1));
  document.getElementById("totalCounters").textContent = data.length;
  document.getElementById("totalClusters").textContent = clusters.length;
  document.getElementById("summary").innerHTML = clusters.map(c => {{
    const row = SUMMARY.find(s => String(s.cluster) === String(c)) || {{}};
    return `<div class="summary-row" style="--c:${{color(c)}}">
      <span>Cluster ${{c}}</span>
      <b>${{counts.get(c) || 0}}</b>
      <small>pico ${{String(row.hora_pico_media ?? "-").padStart(2,"0")}}h</small>
    </div>`;
  }}).join("");
}}
function renderDetail(){{
  const d = data.find(x => x.cpe === selectedId);
  const detail = document.getElementById("detail");
  if(!d) return;
  const max = Math.max(...d.perfil, 1);
  detail.innerHTML = `
    <h3>${{escapeHtml(d.cpe)}}</h3>
    <div class="detail-grid">
      <div class="metric"><small>Cluster</small><b style="color:${{color(d.cluster)}}">Cluster ${{escapeHtml(d.cluster)}}</b></div>
      <div class="metric"><small>Total</small><b>${{nice(d.total,3)}} m3</b></div>
      <div class="metric"><small>PC1</small><b>${{nice(d.pc1,2)}}</b></div>
      <div class="metric"><small>PC2</small><b>${{nice(d.pc2,2)}}</b></div>
      <div class="metric"><small>Dias</small><b>${{d.dias}}</b></div>
      <div class="metric"><small>Hora pico</small><b>${{String(d.pico_hora).padStart(2,"0")}}h</b></div>
    </div>
    <label for="clusterEdit"><b>Editar cluster</b></label>
    <select id="clusterEdit">${{clusters.map(c => `<option value="${{c}}" ${{String(d.cluster)===String(c) ? "selected" : ""}}>Cluster ${{c}}</option>`).join("")}}</select>
    <div class="bars">
      ${{d.perfil.map((v,i)=>`<div class="bar"><span>${{String(i).padStart(2,"0")}}h</span><div class="track"><div class="fill" style="--c:${{color(d.cluster)}};width:${{Math.max(1, v/max*100).toFixed(1)}}%"></div></div><span>${{nice(v,1)}}%</span></div>`).join("")}}
    </div>`;
  document.getElementById("clusterEdit").addEventListener("change", e => {{
    d.cluster = String(e.target.value);
    manual[d.cpe] = d.cluster;
    saveManual(manual);
    render();
    selectedId = d.cpe;
    renderDetail();
  }});
}}
function downloadCsv(){{
  const lines = ["CPE,cluster"];
  data.slice().sort((a,b)=>a.cpe.localeCompare(b.cpe)).forEach(d => {{
    lines.push(`${{csvCell(d.cpe)}},${{csvCell(d.cluster)}}`);
  }});
  const blob = new Blob([lines.join("\\r\\n") + "\\r\\n"], {{type:"text/csv;charset=utf-8"}});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clusters_contador_atribuidos.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}}
function render(){{
  renderFilters();
  renderSummary();
  renderChart();
}}
document.getElementById("downloadCsv").addEventListener("click", downloadCsv);
render();
</script>
</body>
</html>
"""


def make_interactive_html_plotly(
    records: list[dict],
    summary: list[dict],
    pc1_var: float,
    pc2_var: float,
    data_inicio: date,
    data_fim: date,
    silhouette: Optional[float],
) -> str:
    data_json = json_dumps(records)
    summary_json = json_dumps(summary)
    silhouette_text = "n/a" if silhouette is None else f"{silhouette:.3f}"
    generated = date.today().isoformat()
    dias_usados = (data_fim - data_inicio).days + 1

    template = r"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Explorador PCA - Clusters de Água</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #F0F2F5;
    color: #2C3E50;
    min-height: 100vh;
  }
  h1 {
    text-align: center;
    padding: 22px 20px 8px;
    font-size: 1.4rem;
    font-weight: 700;
    color: #1A252F;
    letter-spacing: -0.3px;
  }
  .subtitle {
    text-align: center;
    color: #7F8C8D;
    font-size: 0.85rem;
    margin: 0 auto 18px;
    line-height: 1.55;
    max-width: 920px;
  }
  .container {
    display: flex;
    gap: 16px;
    padding: 0 20px 24px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .panel {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  #pca-panel { flex: 1.1; min-width: 0; }
  #profile-panel { flex: 1; min-width: 0; }
  .panel-header {
    padding: 14px 18px 10px;
    border-bottom: 1px solid #ECF0F1;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .panel-header h2 {
    font-size: 0.95rem;
    font-weight: 600;
    color: #2C3E50;
  }
  .badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
    letter-spacing: 0.3px;
  }
  #selected-badge { display: none; }
  .panel-body { padding: 4px; }
  #profile-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 380px;
    color: #BDC3C7;
    gap: 12px;
  }
  #profile-placeholder svg { opacity: 0.4; }
  #profile-placeholder p { font-size: 0.9rem; text-align: center; line-height: 1.5; }
  #stats-bar {
    display: flex;
    gap: 10px;
    padding: 10px 18px;
    border-top: 1px solid #ECF0F1;
    flex-wrap: wrap;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 90px;
  }
  .stat-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #95A5A6;
    font-weight: 600;
  }
  .stat-value {
    font-size: 0.9rem;
    font-weight: 700;
    color: #2C3E50;
  }
  #info-bar {
    display: none;
    padding: 10px 18px;
    border-top: 1px solid #ECF0F1;
    gap: 10px;
    flex-wrap: wrap;
  }
  #peak-info {
    font-size: 0.82rem;
    color: #555;
    padding: 8px 18px;
    border-top: 1px solid #ECF0F1;
    display: none;
    line-height: 1.6;
  }
  #peak-info b { color: #E74C3C; }
  #edit-cluster-trigger {
    display: none;
    border: 1px solid #DDE4EA;
    background: white;
    color: #2C3E50;
    padding: 4px 9px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 700;
  }
  #edit-cluster-trigger:hover { background: #F5F7FA; }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(26, 37, 47, 0.38);
    padding: 24px;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    width: min(440px, 100%);
    background: white;
    border-radius: 14px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.25);
    overflow: hidden;
  }
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 18px 20px 12px;
    border-bottom: 1px solid #ECF0F1;
  }
  .modal-header h3 {
    font-size: 1rem;
    color: #1A252F;
    margin-bottom: 4px;
  }
  .modal-header p {
    font-size: 0.82rem;
    color: #7F8C8D;
    line-height: 1.4;
  }
  .modal-close {
    border: 0;
    background: #F5F7FA;
    color: #7F8C8D;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    cursor: pointer;
    font-size: 1.1rem;
    line-height: 1;
  }
  .modal-body {
    padding: 18px 20px 6px;
  }
  .modal-body label {
    display: block;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #7F8C8D;
    margin-bottom: 8px;
  }
  #cluster-select {
    width: 100%;
    border: 1px solid #DDE4EA;
    border-radius: 9px;
    padding: 9px 10px;
    font-weight: 700;
    color: #2C3E50;
    background: white;
  }
  .edit-btn {
    border: 1px solid #DDE4EA;
    background: white;
    color: #2C3E50;
    padding: 7px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .edit-btn.primary {
    border-color: #2C3E50;
    background: #2C3E50;
    color: white;
  }
  .edit-btn:hover { filter: brightness(0.97); }
  .header-download { margin-left: auto; }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    padding: 14px 20px 18px;
  }
  #edit-status {
    margin-top: 8px;
    font-size: 0.78rem;
    color: #7F8C8D;
    line-height: 1.5;
  }
  #edit-status b { color: #2C3E50; }
  @media(max-width: 900px) {
    .container { flex-direction: column; padding: 0 12px 20px; }
  }
</style>
</head>
<body>

<h1>Explorador PCA - Clusters de Água</h1>
<p class="subtitle">
  Baseado nas análises de <strong>__DATA_INICIO__</strong> a <strong>__DATA_FIM__</strong>
  (__DIAS_USADOS__ dias). Como o histórico ainda é curto, estes clusters devem ser lidos como uma primeira segmentação exploratória.<br>
  PC1 explica <strong>__PC1_VAR__%</strong> da variância ·
  PC2 explica <strong>__PC2_VAR__%</strong> ·
  silhouette: <strong>__SILHOUETTE__</strong> · gerado em __GENERATED__.
</p>

<div class="container">
  <div class="panel" id="pca-panel">
    <div class="panel-header">
      <h2>Projeção PCA (K-Means)</h2>
      <button type="button" class="edit-btn header-download" id="download-clusters-top">Descarregar CSV</button>
    </div>
    <div class="panel-body">
      <div id="scatter-plot" style="height:500px;"></div>
    </div>
    <div id="stats-bar"></div>
  </div>

  <div class="panel" id="profile-panel">
    <div class="panel-header">
      <h2 id="profile-title">Perfil Horário</h2>
      <span class="badge" id="selected-badge"></span>
      <button type="button" id="edit-cluster-trigger">Editar</button>
    </div>
    <div class="panel-body">
      <div id="profile-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4l3 3"/>
        </svg>
        <p>Clica num ponto do scatter<br>para ver o perfil horário desse contador<br>comparado com a média do cluster.</p>
      </div>
      <div id="profile-chart" style="display:none; height:430px;"></div>
    </div>
    <div id="info-bar"></div>
    <div id="peak-info"></div>
  </div>
</div>

<div class="modal-backdrop" id="cluster-modal" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cluster-modal-title">
    <div class="modal-header">
      <div>
        <h3 id="cluster-modal-title">Editar cluster</h3>
        <p id="cluster-modal-subtitle">Escolhe o cluster correto para este contador.</p>
      </div>
      <button type="button" class="modal-close" id="close-cluster-modal" aria-label="Fechar">x</button>
    </div>
    <div class="modal-body">
      <label for="cluster-select">Novo cluster</label>
      <select id="cluster-select"></select>
      <div id="edit-status"></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="edit-btn" id="reset-cluster">Repor original</button>
      <button type="button" class="edit-btn primary" id="apply-cluster">Aplicar</button>
    </div>
  </div>
</div>

<script>
const DATA = __DATA_JSON__;
const SUMMARY = __SUMMARY_JSON__;
const PALETTE = ["#4C97D4", "#F5A623", "#4CAF50", "#E74C3C", "#9B59B6", "#1ABC9C"];
const HORA_LABELS = Array.from({length: 24}, (_, h) => `${h}h`);
const STORAGE_KEY = "agua_interactive_pca_cluster_edits_v1";
const ORIGINAL_CLUSTERS = Object.fromEntries(DATA.map(d => [d.cpe, String(d.cluster)]));

let SELECTED_CPE = null;
let CLUSTER_EDITS = {};
let CLUSTER_MEANS = {};

function availableClusterIds() {
  return [...new Set(DATA.map(d => String(d.cluster)))]
    .sort((a, b) => Number(a) - Number(b));
}

function colorFor(cluster) {
  const ids = availableClusterIds();
  const idx = Math.max(0, ids.indexOf(String(cluster)));
  return PALETTE[idx % PALETTE.length];
}

function computeClusterMeans() {
  const means = {};
  const nHoras = DATA[0]?.perfil.length || HORA_LABELS.length;

  availableClusterIds().forEach(cid => {
    const pts = DATA.filter(d => String(d.cluster) === cid);
    means[cid] = Array.from({length: nHoras}, (_, i) =>
      pts.reduce((acc, d) => acc + Number(d.perfil[i] || 0), 0) / Math.max(pts.length, 1)
    );
  });

  return means;
}

function loadSavedEdits() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    Object.entries(saved).forEach(([cpe, cluster]) => {
      const row = DATA.find(d => d.cpe === cpe);
      if (!row) return;
      row.cluster = String(cluster);
      if (row.cluster !== ORIGINAL_CLUSTERS[cpe]) {
        CLUSTER_EDITS[cpe] = row.cluster;
      }
    });
  } catch (_) {
    CLUSTER_EDITS = {};
  }
}

function saveEdits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CLUSTER_EDITS));
  } catch (_) {}
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadClustersCsv() {
  const lines = ["CPE,cluster"];
  DATA
    .slice()
    .sort((a, b) => a.cpe.localeCompare(b.cpe))
    .forEach(d => lines.push(`${csvEscape(d.cpe)},${csvEscape(d.cluster)}`));

  const blob = new Blob([lines.join("\n") + "\n"], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clusters_contador_atribuidos.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function updateEditStatus(message) {
  const status = document.getElementById("edit-status");
  const n = Object.keys(CLUSTER_EDITS).length;
  const suffix = n
    ? `<br><b>${n}</b> ${n === 1 ? "alteração guardada" : "alterações guardadas"} neste browser.`
    : "<br>Sem alterações guardadas.";
  status.innerHTML = `${message || ""}${suffix}`;
}

function updateClusterEditor(cpe) {
  const row = DATA.find(d => d.cpe === cpe);
  if (!row) return;

  const select = document.getElementById("cluster-select");
  const trigger = document.getElementById("edit-cluster-trigger");
  trigger.style.display = "inline-flex";

  select.innerHTML = availableClusterIds().map(cid =>
    `<option value="${cid}" ${cid === String(row.cluster) ? "selected" : ""}>Cluster ${cid}</option>`
  ).join("");

  document.getElementById("cluster-modal-subtitle").textContent =
    `${cpe} está atualmente no Cluster ${row.cluster}.`;

  const original = ORIGINAL_CLUSTERS[cpe];
  const message = String(row.cluster) === original
    ? `Cluster atual: <b>${row.cluster}</b>.`
    : `Cluster atual: <b>${row.cluster}</b>. Original: <b>${original}</b>.`;
  updateEditStatus(message);
}

function openClusterModal() {
  if (!SELECTED_CPE) return;
  updateClusterEditor(SELECTED_CPE);
  const modal = document.getElementById("cluster-modal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("cluster-select").focus();
}

function closeClusterModal() {
  const modal = document.getElementById("cluster-modal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function setCluster(cpe, newCluster) {
  const row = DATA.find(d => d.cpe === cpe);
  if (!row) return;

  row.cluster = String(newCluster);
  if (row.cluster === ORIGINAL_CLUSTERS[cpe]) {
    delete CLUSTER_EDITS[cpe];
  } else {
    CLUSTER_EDITS[cpe] = row.cluster;
  }

  saveEdits();
  CLUSTER_MEANS = computeClusterMeans();
  buildScatter();
  showProfile(row.cpe, row.cluster, row.perfil);
  closeClusterModal();
}

function nice(n, dec=1) {
  return Number(n || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildScatter() {
  const clusterIds = availableClusterIds();
  const traces = clusterIds.map(cid => {
    const pts = DATA.filter(d => String(d.cluster) === cid);
    return {
      type: "scatter",
      mode: "markers",
      name: `Cluster ${cid}`,
      x: pts.map(d => d.pc1),
      y: pts.map(d => d.pc2),
      text: pts.map(d => d.cpe),
      customdata: pts.map(d => ({cpe: d.cpe, cluster: String(d.cluster), perfil: d.perfil})),
      hovertemplate:
        "<b>%{text}</b><br>" +
        "Cluster %{customdata.cluster}<br>" +
        "PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>",
      marker: {
        size: 11,
        color: colorFor(cid),
        line: { width: 1.5, color: "white" },
        opacity: 0.88
      }
    };
  });

  const layout = {
    xaxis: {
      title: { text: `PC1 (__PC1_VAR__% variância)`, font: { size: 12 } },
      gridcolor: "#ECF0F1", zeroline: false
    },
    yaxis: {
      title: { text: `PC2 (__PC2_VAR__% variância)`, font: { size: 12 } },
      gridcolor: "#ECF0F1", zeroline: false
    },
    legend: { bgcolor: "rgba(255,255,255,0.9)", bordercolor: "#ECF0F1", borderwidth: 1 },
    hovermode: "closest",
    plot_bgcolor: "#FAFBFC",
    paper_bgcolor: "white",
    margin: { l: 55, r: 20, t: 20, b: 55 },
    font: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }
  };

  const config = { responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d"] };

  Plotly.newPlot("scatter-plot", traces, layout, config);

  const statsBar = document.getElementById("stats-bar");
  statsBar.innerHTML = clusterIds.map(cid => {
    const n = DATA.filter(d => String(d.cluster) === cid).length;
    return `<div class="stat">
      <span class="stat-label" style="color:${colorFor(cid)}">Cluster ${cid}</span>
      <span class="stat-value">${n} contadores</span>
    </div>`;
  }).join("") + `<div class="stat" style="margin-left:auto">
    <span class="stat-label">Total</span>
    <span class="stat-value">${DATA.length} contadores</span>
  </div>`;

  document.getElementById("scatter-plot").on("plotly_click", function(evtData) {
    const pt = evtData.points[0];
    const cd = pt.customdata;
    showProfile(cd.cpe, cd.cluster, cd.perfil);

    const traceIdx = clusterIds.indexOf(String(cd.cluster));
    const pts = DATA.filter(d => String(d.cluster) === String(cd.cluster));
    const ptIdx = pts.findIndex(d => d.cpe === cd.cpe);
    const sizes = pts.map((_, i) => i === ptIdx ? 18 : 11);
    const opacities = pts.map((_, i) => i === ptIdx ? 1 : 0.88);
    Plotly.restyle("scatter-plot",
      { "marker.size": [sizes], "marker.opacity": [opacities] },
      [traceIdx]
    );
    clusterIds.forEach((c, ti) => {
      if (c !== String(cd.cluster)) {
        const n = DATA.filter(d => String(d.cluster) === c).length;
        Plotly.restyle("scatter-plot",
          { "marker.size": [Array(n).fill(11)], "marker.opacity": [Array(n).fill(0.88)] },
          [ti]
        );
      }
    });
  });
}

function showProfile(cpe, cluster, perfil) {
  SELECTED_CPE = cpe;
  cluster = String(cluster);
  document.getElementById("profile-placeholder").style.display = "none";
  document.getElementById("profile-chart").style.display = "block";
  document.getElementById("info-bar").style.display = "flex";
  document.getElementById("peak-info").style.display = "block";

  const row = DATA.find(d => d.cpe === cpe);
  const color = colorFor(cluster);
  const badge = document.getElementById("selected-badge");
  badge.style.display = "inline-block";
  badge.style.background = hexToRgba(color, 0.15);
  badge.style.color = color;
  badge.textContent = `Cluster ${cluster}`;

  document.getElementById("profile-title").textContent = cpe;
  updateClusterEditor(cpe);

  const clusterMean = CLUSTER_MEANS[cluster];
  const desvios = perfil.map((v, i) => v - clusterMean[i]);
  const maxDev = Math.max(...desvios.map(Math.abs));
  const peakHora = desvios.indexOf(Math.max(...desvios));
  const troughHora = desvios.indexOf(Math.min(...desvios));

  const traces = [
    {
      type: "scatter", mode: "lines",
      name: `Cluster ${cluster} média`,
      x: HORA_LABELS, y: clusterMean,
      line: { color: "#7F8C8D", width: 2.5, dash: "dot" },
      hovertemplate: "Cluster %{y:.2f}%<extra>Média do cluster</extra>"
    },
    {
      type: "scatter", mode: "lines+markers",
      name: cpe,
      x: HORA_LABELS, y: perfil,
      line: { color, width: 2.8 },
      marker: { size: 7, color, line: { color: "white", width: 1.5 } },
      fill: "tonexty",
      fillcolor: hexToRgba(color, 0.12),
      hovertemplate: `${cpe}: %{y:.2f}%<extra></extra>`
    }
  ];

  const layout = {
    showlegend: true,
    legend: { x: 0.01, y: 0.99, bgcolor: "rgba(255,255,255,0.9)",
              bordercolor: "#ECF0F1", borderwidth: 1, font: { size: 11 } },
    xaxis: {
      title: { text: "Hora do dia", font: { size: 12 } },
      gridcolor: "#ECF0F1", tickangle: -45
    },
    yaxis: {
      title: { text: "% do consumo do período", font: { size: 12 } },
      gridcolor: "#ECF0F1"
    },
    hovermode: "x unified",
    plot_bgcolor: "#FAFBFC",
    paper_bgcolor: "white",
    margin: { l: 55, r: 20, t: 20, b: 65 },
    font: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", size: 11 },
    shapes: [
      {
        type: "line", x0: peakHora, x1: peakHora,
        y0: 0, y1: 1, yref: "paper",
        line: { color: "#E74C3C", width: 1.5, dash: "dash" }
      }
    ],
    annotations: [
      {
        x: HORA_LABELS[peakHora],
        y: Math.max(perfil[peakHora], clusterMean[peakHora]),
        text: `${desvios[peakHora] > 0 ? "+" : ""}${desvios[peakHora].toFixed(1)}pp`,
        showarrow: true, arrowhead: 2, arrowcolor: "#E74C3C",
        font: { size: 11, color: "#E74C3C", weight: "bold" },
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "#E74C3C", borderwidth: 1, borderpad: 3,
        arrowsize: 0.8
      }
    ]
  };

  Plotly.react("profile-chart", traces, layout, { responsive: true, displaylogo: false });

  const noturno = perfil.slice(0, 7).reduce((a, b) => a + b, 0).toFixed(1);
  const diurno = perfil.slice(8, 20).reduce((a, b) => a + b, 0).toFixed(1);
  const clNot = clusterMean.slice(0, 7).reduce((a, b) => a + b, 0).toFixed(1);
  const clDia = clusterMean.slice(8, 20).reduce((a, b) => a + b, 0).toFixed(1);

  document.getElementById("info-bar").innerHTML = `
    <div class="stat">
      <span class="stat-label">Consumo total</span>
      <span class="stat-value">${nice(row?.total, 3)} m3</span>
    </div>
    <div class="stat">
      <span class="stat-label">Dias usados</span>
      <span class="stat-value">${row?.dias ?? "-"}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Noturno (0-7h)</span>
      <span class="stat-value" style="color:${parseFloat(noturno) > parseFloat(clNot) ? '#E74C3C' : '#3498DB'}">${noturno}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Cluster noturno</span>
      <span class="stat-value">${clNot}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Diurno (8-20h)</span>
      <span class="stat-value" style="color:${parseFloat(diurno) > parseFloat(clDia) ? '#E74C3C' : '#3498DB'}">${diurno}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Max desvio</span>
      <span class="stat-value" style="color:#E74C3C">${maxDev.toFixed(2)}pp</span>
    </div>
  `;

  const dirPeak = desvios[peakHora] > 0 ? "acima" : "abaixo";
  const dirTrough = desvios[troughHora] > 0 ? "acima" : "abaixo";
  document.getElementById("peak-info").innerHTML =
    `Maior desvio em <b>${HORA_LABELS[peakHora]}</b>: ` +
    `<b>${Math.abs(desvios[peakHora]).toFixed(2)}pp</b> ${dirPeak} da média do cluster &nbsp;|&nbsp; ` +
    `Maior diferença negativa em <b>${HORA_LABELS[troughHora]}</b>: ` +
    `<b>${Math.abs(desvios[troughHora]).toFixed(2)}pp</b> ${dirTrough}`;
}

document.getElementById("edit-cluster-trigger").addEventListener("click", openClusterModal);
document.getElementById("close-cluster-modal").addEventListener("click", closeClusterModal);
document.getElementById("cluster-modal").addEventListener("click", evt => {
  if (evt.target.id === "cluster-modal") closeClusterModal();
});
document.addEventListener("keydown", evt => {
  if (evt.key === "Escape") closeClusterModal();
});
document.getElementById("apply-cluster").addEventListener("click", () => {
  if (!SELECTED_CPE) return;
  setCluster(SELECTED_CPE, document.getElementById("cluster-select").value);
});
document.getElementById("reset-cluster").addEventListener("click", () => {
  if (!SELECTED_CPE) return;
  setCluster(SELECTED_CPE, ORIGINAL_CLUSTERS[SELECTED_CPE]);
});
document.getElementById("download-clusters-top").addEventListener("click", downloadClustersCsv);

loadSavedEdits();
CLUSTER_MEANS = computeClusterMeans();
buildScatter();
</script>
</body>
</html>
"""

    return (
        template
        .replace("__DATA_JSON__", data_json)
        .replace("__SUMMARY_JSON__", summary_json)
        .replace("__DATA_INICIO__", data_inicio.isoformat())
        .replace("__DATA_FIM__", data_fim.isoformat())
        .replace("__DIAS_USADOS__", str(dias_usados))
        .replace("__PC1_VAR__", str(round(pc1_var, 1)))
        .replace("__PC2_VAR__", str(round(pc2_var, 1)))
        .replace("__SILHOUETTE__", silhouette_text)
        .replace("__GENERATED__", generated)
    )


def save_outputs(
    features: pd.DataFrame,
    metadata: pd.DataFrame,
    clusters: pd.Series,
    pca_df: pd.DataFrame,
    pca: PCA,
    kmeans: KMeans,
    summary: pd.DataFrame,
    perfil_medio: pd.DataFrame,
    rows: pd.DataFrame,
    excluded: pd.DataFrame,
    data_inicio: date,
    data_fim: date,
    silhouette: Optional[float],
) -> list[Path]:
    RESULTS_AGUA_FEATURES_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_AGUA_CLUSTERING_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_AGUA_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    outputs: list[Path] = []

    features_path = RESULTS_AGUA_FEATURES_DIR / "features_setA.csv"
    features.to_csv(features_path, index=True, index_label="CPE")
    outputs.append(features_path)

    features_full_path = RESULTS_AGUA_FEATURES_DIR / "features_contador.csv"
    features.join(metadata).to_csv(features_full_path, index=True, index_label="CPE")
    outputs.append(features_full_path)

    clusters_full = features.join(clusters)
    clusters_full.to_csv(AGUA_CLUSTERS_PATH, index=True, index_label="CPE")
    outputs.append(AGUA_CLUSTERS_PATH)

    assigned = clusters.astype(int).reset_index()
    assigned.columns = ["CPE", "cluster"]
    assigned.to_csv(AGUA_CLUSTERS_ATRIBUIDOS_PATH, index=False)
    outputs.append(AGUA_CLUSTERS_ATRIBUIDOS_PATH)

    pca_path = RESULTS_AGUA_CLUSTERING_DIR / "pca_clusters_contador.csv"
    pca_df.to_csv(pca_path, index=True, index_label="CPE")
    outputs.append(pca_path)

    summary_path = RESULTS_AGUA_CLUSTERING_DIR / "cluster_summary.csv"
    summary.to_csv(summary_path, index=False)
    outputs.append(summary_path)

    perfil_path = RESULTS_AGUA_CLUSTERING_DIR / "cluster_perfis_medios.csv"
    perfil_medio.to_csv(perfil_path, index=True, index_label="cluster")
    outputs.append(perfil_path)

    meta_path = RESULTS_AGUA_CLUSTERING_DIR / "metadata_contadores.csv"
    metadata.join(clusters).to_csv(meta_path, index=True, index_label="CPE")
    outputs.append(meta_path)

    excluded_path = RESULTS_AGUA_CLUSTERING_DIR / "contadores_sem_cluster.csv"
    excluded.to_csv(excluded_path, index=False)
    outputs.append(excluded_path)

    joblib.dump(pca, RESULTS_AGUA_MODELS_DIR / "pca_agua.pkl")
    outputs.append(RESULTS_AGUA_MODELS_DIR / "pca_agua.pkl")

    joblib.dump(kmeans, RESULTS_AGUA_MODELS_DIR / "kmeans_agua.pkl")
    outputs.append(RESULTS_AGUA_MODELS_DIR / "kmeans_agua.pkl")

    pca_records = pca_df.join(metadata).reset_index()
    records = []
    for row in pca_records.itertuples(index=False):
        perfil = features.loc[row.CPE, HOUR_COLUMNS].round(3).tolist()
        records.append(
            {
                "cpe": row.CPE,
                "cluster": int(row.cluster),
                "pc1": round(float(row.PC1), 4),
                "pc2": round(float(row.PC2), 4),
                "perfil": [float(v) for v in perfil],
                "total": round(float(row.consumo_total_m3), 4),
                "dias": int(row.dias_com_dados),
                "horas": int(row.horas_com_dados),
                "pico_hora": int(row.hora_pico),
                "pico_pct": round(float(row.pct_hora_pico), 2),
            }
        )

    html = make_interactive_html_plotly(
        records=records,
        summary=summary.to_dict(orient="records"),
        pc1_var=float(pca.explained_variance_ratio_[0] * 100),
        pc2_var=float(pca.explained_variance_ratio_[1] * 100),
        data_inicio=data_inicio,
        data_fim=data_fim,
        silhouette=silhouette,
    )
    INTERACTIVE_AGUA_PCA_HTML.write_text(html, encoding="utf-8")
    outputs.append(INTERACTIVE_AGUA_PCA_HTML)

    used_rows_path = RESULTS_AGUA_CLUSTERING_DIR / "dados_usados_clustering.csv"
    rows.to_csv(used_rows_path, index=False)
    outputs.append(used_rows_path)

    return outputs


def parse_args() -> Params:
    parser = argparse.ArgumentParser(
        description="Criar clusters dos contadores de agua a partir das analises horarias."
    )
    parser.add_argument("--data-inicio", type=parse_date, default=None, help="Primeiro dia a usar YYYY-MM-DD")
    parser.add_argument("--data-fim", type=parse_date, default=None, help="Ultimo dia a usar YYYY-MM-DD")
    parser.add_argument("--clusters", type=int, default=DEFAULT_N_CLUSTERS, help="Numero de clusters K-Means")
    parser.add_argument("--min-dias", type=int, default=DEFAULT_MIN_DIAS, help="Minimo de dias com dados por contador")
    parser.add_argument(
        "--min-horas-ativas",
        type=int,
        default=DEFAULT_MIN_HORAS_ATIVAS,
        help="Minimo de horas diferentes com consumo por contador",
    )
    parser.add_argument(
        "--min-total-m3",
        type=float,
        default=DEFAULT_MIN_TOTAL_M3,
        help="Consumo total minimo no periodo para incluir o contador",
    )
    args = parser.parse_args()

    if args.data_inicio and args.data_fim and args.data_fim < args.data_inicio:
        parser.error("--data-fim nao pode ser anterior a --data-inicio.")
    if args.clusters < 1:
        parser.error("--clusters tem de ser pelo menos 1.")
    if args.min_dias < 1:
        parser.error("--min-dias tem de ser pelo menos 1.")
    if args.min_horas_ativas < 1:
        parser.error("--min-horas-ativas tem de ser pelo menos 1.")

    return Params(
        data_inicio=args.data_inicio,
        data_fim=args.data_fim,
        n_clusters=args.clusters,
        min_dias=args.min_dias,
        min_total_m3=args.min_total_m3,
        min_horas_ativas=args.min_horas_ativas,
    )


def main() -> int:
    params = parse_args()

    files = analysis_files(params.data_inicio, params.data_fim)
    if not files:
        print("Nao encontrei ficheiros analise_agua_YYYY-MM-DD.csv para o intervalo pedido.")
        return 2

    data_inicio = files[0][0]
    data_fim = files[-1][0]
    print("Clustering de agua")
    print(f"  Ficheiros: {len(files)}")
    print(f"  Periodo:   {data_inicio} -> {data_fim}")
    print(f"  Clusters:  {params.n_clusters}")
    print(f"  Min dias:  {params.min_dias}")
    print(f"  Min horas ativas: {params.min_horas_ativas}")

    rows = load_analysis(files)
    print(f"  Linhas lidas: {len(rows):,}".replace(",", "."))
    print(f"  Contadores lidos: {rows['CPE'].nunique() if not rows.empty else 0}")

    features, metadata = build_features(
        rows=rows,
        min_dias=params.min_dias,
        min_total_m3=params.min_total_m3,
        min_horas_ativas=params.min_horas_ativas,
    )
    if features.empty:
        print("Sem contadores suficientes para clusterizar com estes filtros.")
        return 3

    excluded = describe_excluded(
        rows=rows,
        included=features.index,
        min_dias=params.min_dias,
        min_total_m3=params.min_total_m3,
        min_horas_ativas=params.min_horas_ativas,
    )
    clusters, pca_df, pca, kmeans, silhouette = cluster_features(features, params.n_clusters)
    summary, perfil_medio = summarize_clusters(features, metadata, clusters)

    outputs = save_outputs(
        features=features,
        metadata=metadata,
        clusters=clusters,
        pca_df=pca_df,
        pca=pca,
        kmeans=kmeans,
        summary=summary,
        perfil_medio=perfil_medio,
        rows=rows,
        excluded=excluded,
        data_inicio=data_inicio,
        data_fim=data_fim,
        silhouette=silhouette,
    )

    print("")
    print("Resultado:")
    print(f"  Contadores usados: {len(features)}")
    print(f"  Contadores sem cluster: {len(excluded)}")
    for row in summary.itertuples(index=False):
        print(
            f"  Cluster {row.cluster}: {row.n_contadores} contadores "
            f"(pico medio: {int(row.hora_pico_media):02d}h)"
        )
    if silhouette is not None:
        print(f"  Silhouette: {silhouette:.3f}")
    print("")
    print("Ficheiros gerados:")
    for path in outputs:
        print(f"  - {csv_preview_path(path)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
