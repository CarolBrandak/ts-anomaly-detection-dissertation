import sys
import pandas as pd
import numpy as np
import joblib
import json
from pathlib import Path
from sklearn.decomposition import PCA
 
# Permite importar módulos internos de src/
SRC_ROOT = Path(__file__).resolve().parents[2]
if str(SRC_ROOT) not in sys.path:
    sys.path.append(str(SRC_ROOT))

from config.paths import (
    RESULTS_FEATURES_DIR,
    RESULTS_CLUSTERING_DIR,
    RESULTS_MODELS_DIR,
    INTERACTIVE_PCA_HTML,
)
 
features = pd.read_csv(RESULTS_FEATURES_DIR / "features_setA.csv", index_col=0)
clusters = pd.read_csv(RESULTS_CLUSTERING_DIR / "clusters_cpe.csv", index_col=0)
 
df = features.join(clusters[["cluster"]], how="inner")
df_clean = df[df["cluster"] != "outlier"].copy()
 
feat_cols = [c for c in df_clean.columns if c != "cluster"]
X         = df_clean[feat_cols].values
 
pca_path = RESULTS_MODELS_DIR / "pca.pkl"

if pca_path.exists():
    pca    = joblib.load(pca_path)
    coords = pca.transform(X)
    print(f"PCA carregado de {pca_path}")
else:
    pca    = PCA(n_components=2, random_state=42)
    coords = pca.fit_transform(X)
    print("PCA calculado de raiz")
 
pc1_var = pca.explained_variance_ratio_[0] * 100
pc2_var = pca.explained_variance_ratio_[1] * 100
 
horas       = list(range(24))
hora_labels = [f"{h}h" for h in horas]
 
cluster_means = {}
for cid in df_clean["cluster"].unique():
    subset = df_clean[df_clean["cluster"] == cid][feat_cols]
    cluster_means[str(cid)] = subset.mean().values.tolist()
 
records = []
for i, (cpe, row) in enumerate(df_clean.iterrows()):
    cluster_id = str(int(row["cluster"]))
    records.append({
        "cpe"     : cpe,
        "cluster" : cluster_id,
        "pc1"     : round(float(coords[i, 0]), 4),
        "pc2"     : round(float(coords[i, 1]), 4),
        "perfil"  : [round(float(row[c]), 3) for c in feat_cols],
    })
 
cluster_ids = sorted(df_clean["cluster"].unique(), key=lambda x: int(x))
palette     = ["#4C97D4", "#F5A623", "#4CAF50", "#E74C3C", "#9B59B6",
               "#1ABC9C", "#E67E22", "#3498DB", "#2ECC71", "#E91E63"]
color_map   = {str(int(cid)): palette[i % len(palette)]
               for i, cid in enumerate(cluster_ids)}
 
data_json         = json.dumps(records, ensure_ascii=False)
cluster_means_json = json.dumps(cluster_means, ensure_ascii=False)
color_map_json    = json.dumps(color_map, ensure_ascii=False)
hora_labels_json  = json.dumps(hora_labels)
pc1_var_json      = json.dumps(round(pc1_var, 1))
pc2_var_json      = json.dumps(round(pc2_var, 1))
 
# Gerar HTML
html_template = r"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Explorador PCA — Clusters de Consumo CPE</title>
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
    margin-bottom: 18px;
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
</style>
</head>
<body>
 
<h1>Explorador PCA — Clusters de Consumo CPE</h1>
<p class="subtitle">
  PC1 explica <strong>PC1_VAR%</strong> da variância &nbsp;·&nbsp;
  PC2 explica <strong>PC2_VAR%</strong> &nbsp;·&nbsp;
  <b>Click: perfil horário individual</b>
</p>
 
<div class="container">
  <!-- Painel esquerdo: scatter PCA -->
  <div class="panel" id="pca-panel">
    <div class="panel-header">
      <h2>Projeção PCA (K-Means)</h2>
    </div>
    <div class="panel-body">
      <div id="scatter-plot" style="height:500px;"></div>
    </div>
    <div id="stats-bar">
      <!-- preenchido por JS -->
    </div>
  </div>
 
  <!-- Painel direito: perfil horário -->
  <div class="panel" id="profile-panel">
    <div class="panel-header">
      <h2 id="profile-title">Perfil Horário</h2>
      <span class="badge" id="selected-badge"></span>
    </div>
    <div class="panel-body">
      <div id="profile-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4l3 3"/>
        </svg>
        <p>Clica num ponto do scatter<br>para ver o perfil horário desse CPE<br>comparado com a média do cluster.</p>
      </div>
      <div id="profile-chart" style="display:none; height:430px;"></div>
    </div>
    <div id="info-bar"></div>
    <div id="peak-info"></div>
  </div>
</div>
 
<script>
// Dados embutidos
const DATA          = DATA_JSON;
const CLUSTER_MEANS = CLUSTER_MEANS_JSON;
const COLOR_MAP     = COLOR_MAP_JSON;
const HORA_LABELS   = HORA_LABELS_JSON;
 
// Construir scatter PCA
function buildScatter() {
  const clusterIds = [...new Set(DATA.map(d => d.cluster))].sort();
  const traces = clusterIds.map(cid => {
    const pts = DATA.filter(d => d.cluster === cid);
    return {
      type: "scatter",
      mode: "markers",
      name: `Cluster ${cid}`,
      x: pts.map(d => d.pc1),
      y: pts.map(d => d.pc2),
      text: pts.map(d => d.cpe),
      customdata: pts.map(d => ({cpe: d.cpe, cluster: d.cluster, perfil: d.perfil})),
      hovertemplate:
        "<b>%{text}</b><br>" +
        "Cluster %{customdata.cluster}<br>" +
        "PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>",
      marker: {
        size: 11,
        color: COLOR_MAP[cid],
        line: { width: 1.5, color: "white" },
        opacity: 0.88
      }
    };
  });
 
  const layout = {
    xaxis: {
      title: { text: `PC1 (PC1_VAR% variância)`, font: { size: 12 } },
      gridcolor: "#ECF0F1", zeroline: false
    },
    yaxis: {
      title: { text: `PC2 (PC2_VAR% variância)`, font: { size: 12 } },
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
 
  // Estatísticas por cluster na barra inferior
  const statsBar = document.getElementById("stats-bar");
  statsBar.innerHTML = clusterIds.map(cid => {
    const n = DATA.filter(d => d.cluster === cid).length;
    return `<div class="stat">
      <span class="stat-label" style="color:${COLOR_MAP[cid]}">Cluster ${cid}</span>
      <span class="stat-value">${n} CPEs</span>
    </div>`;
  }).join("") + `<div class="stat" style="margin-left:auto">
    <span class="stat-label">Total</span>
    <span class="stat-value">${DATA.length} CPEs</span>
  </div>`;
 
  // Click handler
  document.getElementById("scatter-plot").on("plotly_click", function(evtData) {
    const pt = evtData.points[0];
    const cd = pt.customdata;
    showProfile(cd.cpe, cd.cluster, cd.perfil);
 
    // Destacar ponto clicado: aumentar tamanho
    const traceIdx = clusterIds.indexOf(cd.cluster);
    const pts      = DATA.filter(d => d.cluster === cd.cluster);
    const ptIdx    = pts.findIndex(d => d.cpe === cd.cpe);
    const sizes    = pts.map((_, i) => i === ptIdx ? 18 : 11);
    const opacities = pts.map((_, i) => i === ptIdx ? 1 : 0.88);
    Plotly.restyle("scatter-plot",
      { "marker.size": [sizes], "marker.opacity": [opacities] },
      [traceIdx]
    );
    // Reset outros clusters para tamanho normal
    clusterIds.forEach((c, ti) => {
      if (c !== cd.cluster) {
        const n = DATA.filter(d => d.cluster === c).length;
        Plotly.restyle("scatter-plot",
          { "marker.size": [Array(n).fill(11)], "marker.opacity": [Array(n).fill(0.88)] },
          [ti]
        );
      }
    });
  });
}
 
// Mostrar perfil horário
function showProfile(cpe, cluster, perfil) {
  document.getElementById("profile-placeholder").style.display = "none";
  document.getElementById("profile-chart").style.display = "block";
  document.getElementById("info-bar").style.display     = "flex";
  document.getElementById("peak-info").style.display    = "block";
 
  const badge = document.getElementById("selected-badge");
  badge.style.display    = "inline-block";
  badge.style.background = hexToRgba(COLOR_MAP[cluster], 0.15);
  badge.style.color      = COLOR_MAP[cluster];
  badge.textContent      = `Cluster ${cluster}`;
 
  document.getElementById("profile-title").textContent = cpe;
 
  const clusterMean = CLUSTER_MEANS[cluster];
  const desvios     = perfil.map((v, i) => v - clusterMean[i]);
  const maxDev      = Math.max(...desvios.map(Math.abs));
  const peakHora    = desvios.indexOf(Math.max(...desvios));
  const troughHora  = desvios.indexOf(Math.min(...desvios));
 
  // Cores das barras de desvio: vermelho se acima, azul se abaixo
  const barColors = desvios.map(d =>
    d > 0 ? hexToRgba(COLOR_MAP[cluster], 0.85) : "#95A5A6"
  );
 
  const traces = [
    // Área ±std estimada (aproximar com banda)
    {
      type: "scatter", mode: "lines", name: `Cluster ${cluster} média`,
      x: HORA_LABELS, y: clusterMean,
      line: { color: "#7F8C8D", width: 2.5, dash: "dot" },
      hovertemplate: "Cluster %{y:.2f}%<extra>Cluster média</extra>"
    },
    // Perfil do CPE — linha
    {
      type: "scatter", mode: "lines+markers",
      name: cpe,
      x: HORA_LABELS, y: perfil,
      line: { color: COLOR_MAP[cluster], width: 2.8 },
      marker: { size: 7, color: COLOR_MAP[cluster], line: { color: "white", width: 1.5 } },
      fill: "tonexty",
      fillcolor: hexToRgba(COLOR_MAP[cluster], 0.12),
      hovertemplate: `${cpe}: %{y:.2f}%<extra></extra>`
    },
    // Barras de desvio (sub-gráfico visual — usando secondary axis trick via 2nd trace group)
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
      title: { text: "% do consumo diário", font: { size: 12 } },
      gridcolor: "#ECF0F1"
    },
    hovermode: "x unified",
    plot_bgcolor: "#FAFBFC",
    paper_bgcolor: "white",
    margin: { l: 55, r: 20, t: 20, b: 65 },
    font: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", size: 11 },
    shapes: [
      // linha vertical na hora de maior desvio
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
        text: `+${desvios[peakHora].toFixed(1)}pp`,
        showarrow: true, arrowhead: 2, arrowcolor: "#E74C3C",
        font: { size: 11, color: "#E74C3C", weight: "bold" },
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "#E74C3C", borderwidth: 1, borderpad: 3,
        arrowsize: 0.8
      }
    ]
  };
 
  const config = { responsive: true, displaylogo: false };
  Plotly.react("profile-chart", traces, layout, config);
 
  // Info bar
  const sumCpe     = perfil.reduce((a, b) => a + b, 0).toFixed(1);
  const noturno    = perfil.slice(0, 7).reduce((a, b) => a + b, 0).toFixed(1);
  const diurno     = perfil.slice(8, 20).reduce((a, b) => a + b, 0).toFixed(1);
  const clNot      = clusterMean.slice(0, 7).reduce((a, b) => a + b, 0).toFixed(1);
  const clDia      = clusterMean.slice(8, 20).reduce((a, b) => a + b, 0).toFixed(1);
 
  document.getElementById("info-bar").innerHTML = `
    <div class="stat">
      <span class="stat-label">Soma total</span>
      <span class="stat-value">${sumCpe}%</span>
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
      <span class="stat-label">Cluster diurno</span>
      <span class="stat-value">${clDia}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Max desvio</span>
      <span class="stat-value" style="color:#E74C3C">${maxDev.toFixed(2)}pp</span>
    </div>
  `;
 
  // Peak info
  const dirPeak   = desvios[peakHora]   > 0 ? "acima"  : "abaixo";
  const dirTrough = desvios[troughHora] > 0 ? "acima"  : "abaixo";
  document.getElementById("peak-info").innerHTML =
    `Maior desvio em <b>${HORA_LABELS[peakHora]}</b>: ` +
    `<b>${Math.abs(desvios[peakHora]).toFixed(2)}pp</b> ${dirPeak} da média do cluster &nbsp;|&nbsp; ` +
    `Maior deficit em <b>${HORA_LABELS[troughHora]}</b>: ` +
    `<b>${Math.abs(desvios[troughHora]).toFixed(2)}pp</b> ${dirTrough}`;
}
 
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
 
// Init
buildScatter();
</script>
</body>
</html>
"""
 
# Substituir placeholders com dados reais
html_out = html_template \
    .replace("DATA_JSON",          data_json) \
    .replace("CLUSTER_MEANS_JSON", cluster_means_json) \
    .replace("COLOR_MAP_JSON",     color_map_json) \
    .replace("HORA_LABELS_JSON",   hora_labels_json) \
    .replace("PC1_VAR",            str(round(pc1_var, 1))) \
    .replace("PC2_VAR",            str(round(pc2_var, 1)))
 
INTERACTIVE_PCA_HTML.parent.mkdir(parents=True, exist_ok=True)

with open(INTERACTIVE_PCA_HTML, "w", encoding="utf-8") as f:
    f.write(html_out)
 
print(f"\n    Ficheiro gerado: {INTERACTIVE_PCA_HTML.resolve()}")
print(f"      Abre no browser (Chrome/Firefox) — funciona offline, sem servidor.")
print(f"\n    Funcionalidades:")
print(f"      • Hover sobre qualquer ponto → nome do CPE")
print(f"      • Click → perfil horário individual vs média do cluster")
print(f"      • Toolbar Plotly → zoom, pan, reset, download PNG")
