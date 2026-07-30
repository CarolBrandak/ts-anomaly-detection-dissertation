"use strict";

/* ════════ Configuração de caminhos (relativos à raiz servida) ════════ */
const DATASETS = {
  energia: {
    label: "Energia",
    subtitle: "CMMaia · Energia · Deteção em tempo real",
    unit: "kWh",
    hasPrediction: true,
    defaultThreshold: 3.0,
    entitySingular: "CPE",
    entityPlural: "CPEs",
    pointLabel: "pontos CPE/hora",
    runCommand: "python src/energia/realtime/detetar_anomalias.py --modo baze",
    titles: {
      analysisTitle: "Análise do dia",
      analysedLabel: "CPEs analisados",
      stripTitle: "Distribuição dos desvios por CPE",
      stripHint: "cada ponto é um CPE · a faixa verde é o intervalo considerado normal",
      alertTitle: "Desvios detetados",
      alertHint: "cartões ordenados pelo tamanho do desvio · scroll dentro do painel",
      navDistribuicao: "Distribuição dos desvios",
      navDesvios: "Desvios detetados",
      navComparacao: "Real vs previsão",
      compareKicker: "Comparação",
      compareTitle: "Real vs previsão",
      compareSub: "Mostra os dias reais anteriores e a previsão do dia analisado, permitindo comparar com o real quando esse dia já tem dados.",
      comparePanelTitle: "Real vs previsão por CPE",
      comparePanelHint: "linha contínua = real · tracejado = previsão · faixa = intervalo esperado",
      navPca: "PCA do dia",
      pcaTitle: "Exploração PCA do dia",
      pcaPanelTitle: "Perfil horário dos CPEs no dia",
      pcaPanelHint: "cor = cluster histórico · contorno = CPE com desvio nesse dia",
    },
    footerHint: `Se quiseres forçar uma nova análise de energia, corre o programa
        <code>src/energia/realtime/detetar_anomalias.py</code> e atualiza a página.`,
    messages: {
      missingAnalysisTitle: "Sem dados de energia",
      missingAnalysisText: "O programa ainda não gravou nenhuma análise de energia para este dia, ou os ficheiros não estão acessíveis.",
      missingPredictionTitle: "Sem previsão disponível",
      missingPredictionText: "A previsão de energia do próximo dia é gerada pelo programa de deteção.",
      missingQualityTitle: "Sem validações ainda",
      missingQualityText: "A validação preenche-se sozinha: cada dia, o programa compara as previsões anteriores com o consumo real que entretanto chegou. Volta aqui depois de alguns dias.",
    },
    paths: {
      alerts:      "../results/energia/realtime/alerts/analise_energia_{d}.csv",
      predictions: "../results/energia/realtime/predictions/previsao_energia_{d}.csv",
      pcaFeatures: "../results/energia/features/features_setA.csv",
      pcaClusters: "../results/energia/clustering/clusters_cpe.csv",
      pcaAssignedClusters: "../results/energia/clustering/clusters_cpe_atribuidos.csv",
      pcaCoords:   "../results/energia/clustering/pca_clusters_cpe.csv"
    },
    pcaAssignedFilename: "clusters_cpe_atribuidos.csv",
    pcaExplorerHref: "../results/energia/interactive_pca_clusters.html",
    pcaExplorerText: "Consulta os clusters históricos dos CPEs com base no perfil horário médio de consumo."
  },
  agua: {
    label: "Água",
    subtitle: "CMMaia · Água · Deteção em tempo real",
    unit: "m³",
    hasPrediction: false,
    defaultThreshold: 2.0,
    entitySingular: "contador",
    entityPlural: "contadores",
    pointLabel: "pontos contador/hora",
    runCommand: "python src/agua/realtime/detetar_anomalias.py --modo baze",
    titles: {
      analysisTitle: "Análise da água",
      analysedLabel: "Contadores analisados",
      stripTitle: "Distribuição dos desvios por contador",
      stripHint: "cada ponto é um contador de água · a faixa verde é o intervalo considerado normal",
      alertTitle: "Desvios de água detetados",
      alertHint: "cartões de água ordenados pelo tamanho do desvio · scroll dentro do painel",
      navDistribuicao: "Distribuição da água",
      navDesvios: "Desvios de água",
      navComparacao: "Consumo da água",
      compareKicker: "Consumo",
      compareTitle: "Consumo da água",
      compareSub: "Mostra o consumo horário real dos contadores apenas no dia analisado.",
      comparePanelTitle: "Consumo real por contador",
      comparePanelHint: "linha contínua = consumo real do dia · sem previsão de água",
      navPca: "PCA da água",
      pcaTitle: "Exploração PCA da água no dia",
      pcaPanelTitle: "Perfil horário dos contadores no dia",
      pcaPanelHint: "cor = cluster da água · contorno = contador com desvio nesse dia",
    },
    footerHint: `Para aparecerem dados de água, primeiro é preciso recolher e analisar os dados dos contadores.
        Lembrete: <code>python src/agua/realtime/detetar_anomalias.py --modo baze</code>.`,
    messages: {
      missingAnalysisTitle: "Sem dados de água",
      missingAnalysisText: "Ainda não existem ficheiros de análise de água para este dia. Primeiro é preciso recolher os dados de água.",
      missingPredictionTitle: "Previsão de água não configurada",
      missingPredictionText: "A dashboard está preparada para alternar para Água, mas a previsão de água ainda não foi ativada.",
      missingQualityTitle: "Sem validações de água",
      missingQualityText: "Ainda não existem validações de água para apresentar.",
    },
    paths: {
      alerts:      "../results/agua/realtime/alerts/analise_agua_{d}.csv",
      pcaFeatures: "../results/agua/features/features_setA.csv",
      pcaClusters: "../results/agua/clustering/clusters_contador.csv",
      pcaAssignedClusters: "../results/agua/clustering/clusters_contador_atribuidos.csv",
      pcaCoords:   "../results/agua/clustering/pca_clusters_contador.csv"
    },
    pcaAssignedFilename: "clusters_contador_atribuidos.csv",
    pcaExplorerHref: "../results/agua/interactive_pca_clusters.html",
    pcaExplorerText: "Consulta os clusters exploratórios dos contadores com base no perfil horário médio de água."
  }
};
let ACTIVE_DATASET = "energia";
let PATHS = DATASETS[ACTIVE_DATASET].paths;
const CALENDAR_START_DATE = "2026-05-01"; // data a partir da qual há análises disponíveis
const REINCIDENCIA_DIAS = 6; // dias anteriores a verificar para reincidência
const SPARKLINE_DIAS = 6; // 6 dias anteriores + dia escolhido = 7 dias
const FORECAST_CONTEXT_DAYS = 4; // dias reais antes do dia previsto
const WATER_NIGHT_HOURS = [0, 1, 2, 3, 4, 5, 6];
const WATER_NIGHT_THRESHOLD_M3 = 0.01; // 10 litros
const WATER_NIGHT_MIN_CONSECUTIVE_HOURS = 3;

/* ════════ Utilitários ════════ */
const $ = s => document.querySelector(s);
function fmtDate(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function nice(n,dec=1){
  if(n===null||n===undefined||isNaN(n)) return "—";
  return Number(n).toLocaleString("pt-PT",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function tipoLabel(t){ return (t||"").replace(/_/g," "); }
function prettyDate(iso){
  const m=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const p=iso.split("-"); if(p.length!==3) return iso;
  return `${parseInt(p[2],10)} ${m[parseInt(p[1],10)-1]}`;
}
function addDaysStr(dateStr, n){
  const [y,m,d] = dateStr.split("-").map(Number);
  const x = new Date(y, m-1, d);
  x.setDate(x.getDate()+n);
  return fmtDate(x);
}
function activeDataset(){ return DATASETS[ACTIVE_DATASET]; }
function unitLabel(){ return activeDataset().unit; }
function valueWithUnit(n, dec=1){ return `${nice(n, dec)} ${unitLabel()}`; }
function compareEntityId(a,b){
  return String(a).localeCompare(String(b), "pt", {numeric:true, sensitivity:"base"});
}
function normaliseSearchText(value){
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
function matchesEntitySearch(id, query){
  const q = normaliseSearchText(query).trim();
  return !q || normaliseSearchText(id).includes(q);
}
function chartAxisDomain(values){
  const nums = values.filter(v=>v !== null && Number.isFinite(v));
  const fallbackSpan = unitLabel() === "m³" ? 0.01 : 1;
  if(!nums.length) return {ymin:0, ymax:fallbackSpan, decimals:unitLabel() === "m³" ? 3 : 1};

  const minVal = Math.min(...nums);
  const maxVal = Math.max(...nums);
  let ymin = minVal < 0 ? minVal : 0;
  let ymax = maxVal;

  if(ymin === ymax){
    const span = Math.max(Math.abs(ymax) * 0.2, fallbackSpan);
    ymin = ymin < 0 ? ymin - span : 0;
    ymax = ymax + span;
  }else{
    const pad = Math.max((ymax - ymin) * 0.12, fallbackSpan * 0.08);
    ymin = ymin < 0 ? ymin - pad : 0;
    ymax = ymax + pad;
  }

  if(ymax <= ymin) ymax = ymin + fallbackSpan;
  const range = Math.abs(ymax - ymin);
  const decimals = range < 0.02 ? 3 : range < 0.2 ? 2 : range < 2 ? 1 : 0;
  return {ymin, ymax, decimals};
}
function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch=>({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
}
function asTemplates(template){
  if(!template) return [];
  return Array.isArray(template) ? template : [template];
}
function formatTemplate(template, dateStr){
  const t = asTemplates(template)[0];
  return t ? t.replace("{d}", dateStr) : "sem ficheiro configurado";
}
function applyDatasetUI(){
  const cfg = activeDataset();
  $("#dashboardSubtitle").textContent = cfg.subtitle;
  const runHint = $("#runHint");
  if(runHint) runHint.innerHTML = cfg.footerHint;
  const pcaExplorerText = $("#pcaExplorerText");
  if(pcaExplorerText) pcaExplorerText.textContent = cfg.pcaExplorerText || "";
  const pcaExplorerLink = $("#pcaExplorerLink");
  if(pcaExplorerLink) pcaExplorerLink.href = cfg.pcaExplorerHref || "#";
  Object.entries(cfg.titles).forEach(([id, text])=>{
    const el = $(`#${id}`);
    if(el) el.textContent = text;
  });
  document.title = `Monitorização de Consumo · ${cfg.label} · CMMaia`;
  document.body.dataset.dataset = ACTIVE_DATASET;
  document.body.classList.toggle("sem-previsao", !cfg.hasPrediction);
  document.querySelectorAll(".dataset-btn").forEach(btn=>{
    const active = btn.dataset.dataset === ACTIVE_DATASET;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}
async function setDataset(key){
  if(!DATASETS[key] || key === ACTIVE_DATASET) return;
  ACTIVE_DATASET = key;
  PATHS = DATASETS[ACTIVE_DATASET].paths;
  DAILY_PCA_MODEL_PROMISE = null;
  DAILY_PCA_CLUSTER_FILTERS = null;
  DAILY_PCA_DEVIATION_FILTERS = null;
  DAILY_PCA_VIEW_DOMAIN = null;
  applyDatasetUI();
  showLoading();
  await buildDayCalendar();
}

/* CSV robusto (lida com campos entre aspas) */
function parseCSV(text){
  const lines = text.replace(/\uFEFF/g,"").trim().split(/\r?\n/);
  if(!lines.length) return [];
  const headers = splitLine(lines[0]);
  return lines.slice(1).filter(l=>l.length).map(line=>{
    const cells = splitLine(line); const o={};
    headers.forEach((h,i)=> o[h.trim()] = (cells[i]??"").trim());
    return o;
  });
}
function splitLine(line){
  const out=[]; let cur="", q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(q){ if(c==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if(c===","){out.push(cur);cur="";} else if(c==='"'){q=true;} else cur+=c; }
  }
  out.push(cur); return out;
}
function csvCell(value){
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
async function saveTextAsFile(filename, text){
  if(window.showSaveFilePicker){
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "CSV",
          accept: {"text/csv": [".csv"]},
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return "saved";
    }catch(e){
      if(e && e.name === "AbortError") return "cancelled";
    }
  }

  const blob = new Blob([text], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "download";
}

/* Procura o ficheiro mais recente recuando dia a dia */
async function fetchByDate(template, dateStr){
  for(const t of asTemplates(template)){
    const url = t.replace("{d}", dateStr);
    try{
      const r = await fetch(url, {cache:"no-store"});
      if(r.ok){
        return {date:dateStr, url, text:await r.text()};
      }
    }catch(e){}
  }
  return null;
}

async function fetchReincidencias(dateStr, diasBack=REINCIDENCIA_DIAS){
  const hist = new Map();

  for(let i=1; i<=diasBack; i++){
    const ds = addDaysStr(dateStr, -i);
    const res = await fetchByDate(PATHS.alerts, ds);

    if(!res) continue;

    try{
      const rows = parseCSV(res.text);
      const vistosNoDia = new Set();

      rows.forEach(r=>{
        if(r.veredicto === "desvio" && r.CPE && !vistosNoDia.has(r.CPE)){
          vistosNoDia.add(r.CPE);
          const atual = hist.get(r.CPE) || {count:0, dates:[]};
          atual.count += 1;
          atual.dates.push(ds);
          hist.set(r.CPE, atual);
        }
      });
    }catch(e){}
  }

  return hist;
}

async function fetchSparklineHistory(dateStr, cpes, diasBack=SPARKLINE_DIAS){
  const hist = new Map();

  cpes.forEach(cpe=>{
    hist.set(cpe, []);
  });

  for(let i=diasBack; i>=0; i--){
    const ds = addDaysStr(dateStr, -i);
    const res = await fetchByDate(PATHS.alerts, ds);

    if(!res) continue;

    try{
      const rows = parseCSV(res.text);
      const diaVals = new Map();

      rows.forEach(r=>{
        if(cpes.has(r.CPE) && r.consumo_real !== ""){
          const v = +r.consumo_real;

          if(!isNaN(v)){
            const vals = diaVals.get(r.CPE) || [];
            vals.push(v);
            diaVals.set(r.CPE, vals);
          }
        }
      });
      diaVals.forEach((vals, cpe)=>{
        hist.get(cpe).push({
          date: ds,
          value: vals.reduce((a,b)=>a+b,0) / vals.length,
          offset: i
        });
      });
    }catch(e){}
  }

  return hist;
}

function renderSparkline(points, up){
  const vals = points
    .filter(p=>p && !isNaN(p.value))
    .sort((a,b)=>b.offset-a.offset);

  if(!vals.length){
    return `<div class="spark-empty">sem histórico</div>`;
  }

  const W = 150, H = 52, padX = 8, padY = 8;
  const innerW = W - padX*2;
  const innerH = H - padY*2 - 8;

  let min = Math.min(...vals.map(p=>p.value));
  let max = Math.max(...vals.map(p=>p.value));

  if(min === max){
    min -= 1;
    max += 1;
  }

  const X = p => padX + ((SPARKLINE_DIAS - p.offset) / SPARKLINE_DIAS) * innerW;
  const Y = p => padY + (1 - ((p.value - min) / (max - min))) * innerH;

  const pts = vals.map(p=>[X(p), Y(p), p]);

  const path = pts.length > 1
    ? `M${pts.map(p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")}`
    : "";

  const color = up ? "var(--high)" : "var(--low)";

  let s = `<svg class="sparkline" viewBox="0 0 ${W} ${H}" role="img">`;

  s += `<line class="spark-grid" x1="${padX}" y1="${padY + innerH}" x2="${W - padX}" y2="${padY + innerH}"/>`;

  if(path){
    s += `<path d="${path}" fill="none" stroke="var(--ink-3)" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  pts.forEach(([x,y,p],idx)=>{
    const isLast = idx === pts.length - 1;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isLast ? 3.6 : 2.6}"
          fill="${isLast ? color : "var(--ink-4)"}">
          <title>${prettyDate(p.date)} · ${valueWithUnit(p.value)}</title>
        </circle>`;
  });

  s += `<text x="${padX}" y="${H-2}" font-size="9.5" text-anchor="start">${vals.length}/7 dias</text>`;
  s += `<text x="${W-padX}" y="${H-2}" font-size="9.5" text-anchor="end">${valueWithUnit(vals[vals.length-1].value,0)}</text>`;
  s += `</svg>`;

  return s;
}

async function fileExists(template, dateStr){
  for(const t of asTemplates(template)){
    const url = t.replace("{d}", dateStr);
    try{
      const r = await fetch(url, {cache:"no-store"});
      if(r.ok) return true;
    }catch(e){}
  }
  return false;
}

let CALENDAR = null;

async function buildDayCalendar(){
  setDayStatus("loading", "A carregar…");

  const picker = $("#dayPicker");
  picker.disabled = false;
  const today = new Date();
  const availableDates = [];

  const start = new Date(CALENDAR_START_DATE);
  const end = new Date(today);

  for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)){
    const ds = fmtDate(d);
    const hasAnalysis = await fileExists(PATHS.alerts, ds);

    if(hasAnalysis){
      availableDates.push(ds);
    }
  }

  if(CALENDAR){
    CALENDAR.destroy();
    CALENDAR = null;
  }

  if(!availableDates.length){
    picker.value = "";
    picker.disabled = true;
    setDayStatus("nodata", "sem dados");
    renderOntem(null);
    renderAmanha(null, null);
    const todayStr = fmtDate(today);
    renderForecastComparison([], null, todayStr);
    renderPcaDia(null, todayStr);
    $("#srcAnalise").innerHTML =
      `Retrospetiva: <code>${formatTemplate(PATHS.alerts, todayStr)} (não encontrado)</code>`;
    $("#srcPrev").innerHTML =
      activeDataset().hasPrediction
        ? `Previsão: <code>${formatTemplate(PATHS.predictions, addDaysStr(todayStr, 1))} (não encontrado)</code>`
        : `Previsão: <code>não configurada para ${activeDataset().label}</code>`;
    return;
  }

  CALENDAR = flatpickr(picker, {
    locale: flatpickr.l10ns.pt,
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/Y",
    defaultDate: availableDates[availableDates.length - 1],
    minDate: CALENDAR_START_DATE,
    maxDate: fmtDate(today),
    enable: availableDates,
    allowInput: false,
    disableMobile: true,
    onChange: function(selectedDates, dateStr){
      if(!dateStr) return;
      showLoading();
      loadAll(dateStr);
    }
  });

  loadAll(availableDates[availableDates.length - 1]);
}

async function fetchFixed(url){
  for(const u of asTemplates(url)){
    try{
      const r = await fetch(u,{cache:"no-store"});
      if(r.ok) return {url:u, text:await r.text()};
    }catch(e){}
  }
  return null;
}

/* ════════ SVG helpers ════════ */
const NS="http://www.w3.org/2000/svg";
function svgEl(w,h){
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img">`;
}

/* Strip plot dos z-scores */
function renderStrip(container, rows, threshold){
  if(!rows.length){ container.innerHTML = emptyMsg("Sem dados para mostrar."); return; }
  const W=920, H=240, padL=46, padR=24, padT=28, padB=46;
  const innerW = W-padL-padR, innerH = H-padT-padB;
  const zs = rows.map(r=>r.z);
  let maxAbs = Math.max(threshold+0.5, ...zs.map(Math.abs));
  maxAbs = Math.min(Math.ceil(maxAbs), 10);
  const x = z => padL + (z+maxAbs)/(2*maxAbs)*innerW;
  const midY = padT + innerH/2;

  let s = svgEl(W,H);
  // faixa normal
  s += `<rect x="${x(-threshold)}" y="${padT}" width="${x(threshold)-x(-threshold)}" height="${innerH}"
         fill="var(--normal-soft)" stroke="var(--normal)" stroke-opacity=".25" rx="8"/>`;
  // ticks inteiros
  for(let t=-maxAbs;t<=maxAbs;t++){
    s += `<line class="grid-line" x1="${x(t)}" y1="${padT}" x2="${x(t)}" y2="${padT+innerH}"/>`;
    s += `<text x="${x(t)}" y="${H-padB+18}" font-size="11" text-anchor="middle">${t>0?"+":""}${t}</text>`;
  }
  // linha zero
  s += `<line x1="${x(0)}" y1="${padT-4}" x2="${x(0)}" y2="${padT+innerH}" stroke="var(--ink-3)" stroke-width="1.5"/>`;
  // limiares
  [[-threshold,"var(--low)"],[threshold,"var(--high)"]].forEach(([tv,c])=>{
    s += `<line x1="${x(tv)}" y1="${padT}" x2="${x(tv)}" y2="${padT+innerH}" stroke="${c}" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>`;
  });
  // pontos (jitter determinístico)
  rows.forEach((r,i)=>{
    const zc = Math.max(-maxAbs, Math.min(maxAbs, r.z));
    const jit = ((i*73)%100/100 - .5) * (innerH*0.7);
    let fill="var(--lowconf)", op=".55", rad=4;
    if(r.z>threshold){ fill="var(--high)"; op=".9"; rad=5; }
    else if(r.z<-threshold){ fill="var(--low)"; op=".9"; rad=5; }
    const horaTxt = r.hora===null ? "" : `  ·  ${String(r.hora).padStart(2,"0")}h`;
    s += `<circle class="strip-point clickable-point" data-point-index="${i}" tabindex="0"
              cx="${x(zc).toFixed(1)}" cy="${(midY+jit).toFixed(1)}" r="${rad}"
              fill="${fill}" fill-opacity="${op}">`
       + `<title>${escapeHtml(r.cpe)}${horaTxt}  ·  z=${r.z>0?"+":""}${nice(r.z,2)}  ·  ${r.veredicto}</title></circle>`;
  });
  // rótulos extremos
  s += `<text x="${padL}" y="18" font-size="11" text-anchor="start" fill="var(--low)">← consumiu menos</text>`;
  s += `<text x="${W-padR}" y="18" font-size="11" text-anchor="end" fill="var(--high)">consumiu mais →</text>`;
  s += `</svg>`;
  container.innerHTML =
    `<div class="legend">
       <span><i style="background:var(--normal)"></i>dentro do normal (|z| ≤ ${threshold})</span>
       <span><i style="background:var(--high)"></i>acima do limiar</span>
       <span><i style="background:var(--low)"></i>abaixo do limiar</span>
     </div>` + s + `<div class="point-detail muted-detail">Clica num ponto para ver o detalhe.</div>`;
  wireStripPointDetails(container, rows);
}

function renderStripPointDetail(r){
  const up = r.direcao === "acima";
  const pct = (r.real-r.hab)/Math.max(Math.abs(r.hab),0.001)*100;
  const cluster = ACTIVE_DATASET === "energia" && r.cluster && String(r.cluster).toLowerCase() !== "nan"
    ? `Cluster ${escapeHtml(r.cluster)}`
    : activeDataset().entitySingular;
  const hora = r.hora===null ? "sem hora" : `${String(r.hora).padStart(2,"0")}h`;
  return `<div class="point-detail">
    <div class="point-detail-head">
      <div>
        <span class="point-kicker">${cluster}</span>
        <h4>${escapeHtml(r.cpe)}</h4>
      </div>
      <span class="chip">${hora}</span>
    </div>
    <div class="point-detail-grid">
      <div><span>Real</span><b class="${up ? "acc-up" : "acc-down"}">${valueWithUnit(r.real)}</b></div>
      <div><span>Habitual</span><b>${nice(r.hab)} ± ${nice(r.std)} ${unitLabel()}</b></div>
      <div><span>z-score</span><b>${r.z>0?"+":""}${nice(r.z,2)}</b></div>
      <div><span>Desvio</span><b class="${up ? "acc-up" : "acc-down"}">${pct>0?"+":""}${nice(pct,0)}%</b></div>
      <div><span>Estado</span><b>${escapeHtml(r.veredicto)}</b></div>
      <div><span>Confiança</span><b>${escapeHtml(r.confianca || "—")}</b></div>
    </div>
  </div>`;
}

function wireStripPointDetails(container, rows){
  function show(circle){
    const idx = +circle.dataset.pointIndex;
    const row = rows[idx];
    const detail = container.querySelector(".point-detail");
    if(!detail) return;
    if(!row) return;
    container.querySelectorAll(".strip-point.is-selected").forEach(p=>p.classList.remove("is-selected"));
    circle.classList.add("is-selected");
    detail.outerHTML = renderStripPointDetail(row);
  }

  container.querySelectorAll(".strip-point").forEach(circle=>{
    circle.addEventListener("click", ()=>show(circle));
    circle.addEventListener("keydown", e=>{
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        show(circle);
      }
    });
  });
}

/* Line chart genérico (1+ séries) */
function renderLines(container, labels, series, opts={}){
  if(!labels.length){ container.innerHTML = emptyMsg("Ainda sem histórico suficiente."); return; }
  const W=920, H=300, padL=52, padR=18, padT=20, padB=44;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  const all = series.flatMap(s=>s.data).filter(v=>!isNaN(v));
  const refs = (opts.refs||[]).map(r=>r.v);
  let ymin = Math.min(...all, ...refs), ymax = Math.max(...all, ...refs);
  if(opts.y0) ymin = Math.min(ymin,0);
  if(ymin===ymax){ ymax+=1; ymin-=1; }
  const padY=(ymax-ymin)*0.12; ymin-=padY; ymax+=padY;
  if(opts.clamp01){ ymin=Math.max(ymin,0); ymax=Math.min(ymax,105); }
  const n=labels.length;
  const X = i => n===1 ? padL+innerW/2 : padL + i/(n-1)*innerW;
  const Y = v => padT + (1-(v-ymin)/(ymax-ymin))*innerH;

  let s = svgEl(W,H);
  // grelha + eixo Y
  const steps=5;
  for(let k=0;k<=steps;k++){
    const v = ymin + k/steps*(ymax-ymin), yy=Y(v);
    s += `<line class="grid-line" x1="${padL}" y1="${yy}" x2="${padL+innerW}" y2="${yy}"/>`;
    s += `<text x="${padL-10}" y="${yy+4}" font-size="11" text-anchor="end">${nice(v,opts.ydec??0)}${opts.ysuffix||""}</text>`;
  }
  // linhas de referência (ex. 68% / 95%)
  (opts.refs||[]).forEach(r=>{
    s += `<line x1="${padL}" y1="${Y(r.v)}" x2="${padL+innerW}" y2="${Y(r.v)}" stroke="${r.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity=".55"/>`;
    s += `<text x="${padL+innerW}" y="${Y(r.v)-6}" font-size="10.5" text-anchor="end" fill="${r.color}">${r.label}</text>`;
  });
  // rótulos X (no máx ~8)
  const stepX = Math.ceil(n/8);
  labels.forEach((lb,i)=>{
    if(i%stepX===0 || i===n-1){
      s += `<text x="${X(i)}" y="${H-padB+18}" font-size="10.5" text-anchor="middle">${prettyDate(lb)}</text>`;
    }
  });
  s += `<line class="axis-line" x1="${padL}" y1="${padT+innerH}" x2="${padL+innerW}" y2="${padT+innerH}"/>`;
  // séries
  series.forEach(se=>{
    const pts = se.data.map((v,i)=> isNaN(v)?null:[X(i),Y(v)]).filter(Boolean);
    if(pts.length>1){
      s += `<path d="M${pts.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L")}"
             fill="none" stroke="${se.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    se.data.forEach((v,i)=>{ if(!isNaN(v))
      s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${n>20?2.6:3.6}" fill="${se.color}">`
         + `<title>${prettyDate(labels[i])} · ${se.name}: ${nice(v,opts.ydec??1)}${opts.ysuffix||""}</title></circle>`;
    });
  });
  s += `</svg>`;
  const leg = `<div class="legend">` +
    series.map(se=>`<span style="color:${se.color}"><i style="background:${se.color}"></i><span style="color:var(--ink-2)">${se.name}</span></span>`).join("") +
    (opts.refs||[]).map(r=>`<span style="color:${r.color}"><i class="dotline"></i><span style="color:var(--ink-2)">${r.label}</span></span>`).join("") +
    `</div>`;
  container.innerHTML = leg + s;
}

function renderHourlyProfile(container, rows){
  if(!rows.length){ container.innerHTML = emptyMsg("Sem previsão horária para mostrar."); return; }
  const horas = Array.from({length:24}, (_,i)=>i);
  const vals = horas.map(h=>rows.filter(r=>r.hora===h).reduce((a,r)=>a+(r.prev||0),0));
  const W=920, H=300, padL=52, padR=18, padT=22, padB=44;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  let ymax = Math.max(...vals, 1);
  ymax *= 1.15;
  const X = i => padL + (i + 0.5) / 24 * innerW;
  const Y = v => padT + (1 - v / ymax) * innerH;
  const barW = innerW / 24 * 0.62;

  let s = svgEl(W,H);
  for(let k=0;k<=5;k++){
    const v = k/5*ymax, yy=Y(v);
    s += `<line class="grid-line" x1="${padL}" y1="${yy}" x2="${padL+innerW}" y2="${yy}"/>`;
    s += `<text x="${padL-10}" y="${yy+4}" font-size="11" text-anchor="end">${nice(v,0)}</text>`;
  }
  vals.forEach((v,i)=>{
    const x = X(i)-barW/2, y=Y(v), h=padT+innerH-y;
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h,1).toFixed(1)}"
            rx="4" fill="var(--pred)" opacity=".82">
            <title>${String(i).padStart(2,"0")}h · ${valueWithUnit(v)}</title>
          </rect>`;
  });
  horas.forEach(h=>{
    if(h % 3 === 0 || h === 23){
      s += `<text x="${X(h)}" y="${H-padB+18}" font-size="10.5" text-anchor="middle">${String(h).padStart(2,"0")}h</text>`;
    }
  });
  s += `<line class="axis-line" x1="${padL}" y1="${padT+innerH}" x2="${padL+innerW}" y2="${padT+innerH}"/>`;
  s += `</svg>`;
  container.innerHTML =
    `<div class="legend"><span style="color:var(--pred)"><i style="background:var(--pred)"></i><span style="color:var(--ink-2)">consumo previsto por hora</span></span></div>` + s;
}
let FORECAST_COMPARE_STATE = {
  cpes:[],
  data:new Map(),
  selected:"",
  search:"",
  dates:[],
  dateTypes:new Map(),
  mode:"forecast",
  coverage:null,
  forecastDate:null,
  forecastStart:0,
};

function _emptyHourlyArrays(totalPoints=24){
  return {
    real:Array(totalPoints).fill(null),
    prev:Array(totalPoints).fill(null),
    lo:Array(totalPoints).fill(null),
    hi:Array(totalPoints).fill(null),
    std:Array(totalPoints).fill(null),
  };
}

function _ensureCompareRow(map, cpe, totalPoints=24){
  if(!map.has(cpe)) map.set(cpe, _emptyHourlyArrays(totalPoints));
  return map.get(cpe);
}

function _forecastWindowDates(dateStr){
  return Array.from(
    {length:FORECAST_CONTEXT_DAYS + 1},
    (_,i)=>addDaysStr(dateStr, i - FORECAST_CONTEXT_DAYS)
  );
}

async function fetchForecastComparisonRealDays(dateStr, selectedRows){
  const dates = _forecastWindowDates(dateStr);
  const days = await Promise.all(dates.map(async ds=>{
    if(ds === dateStr) return {date:ds, rows:selectedRows || []};
    try{
      const res = await fetchByDate(PATHS.alerts, ds);
      return {date:ds, rows:res ? parseCSV(res.text) : []};
    }catch(e){
      return {date:ds, rows:[]};
    }
  }));
  return days;
}

function _normaliseForecastRealDays(realInput, dateStr){
  if(!realInput) return [];
  if(realInput.length && realInput[0] && Object.prototype.hasOwnProperty.call(realInput[0], "rows")){
    return realInput;
  }
  return realInput.length ? [{date:dateStr, rows:realInput}] : [];
}

function _forecastTipoDiaLabel(tipo){
  if(tipo === "fim_semana") return "fim de semana";
  if(tipo === "dia_util") return "dia util";
  return tipoLabel(tipo);
}

function _forecastDateLabel(dateStr, dateTypes){
  const tipo = dateTypes && dateTypes.get(dateStr);
  return tipo ? `${prettyDate(dateStr)} (${_forecastTipoDiaLabel(tipo)})` : prettyDate(dateStr);
}

function _missingHourIndexes(values, start=0, count=24){
  const missing = [];
  for(let i=start; i<start+count; i++){
    if(!Number.isFinite(values[i])) missing.push(i - start);
  }
  return missing;
}

function _hourList(hours){
  return hours.map(h=>`${String(h).padStart(2,"0")}h`).join(", ");
}

function _negativeConsumptionHours(values){
  return values
    .map((v,h)=>({hour:h, value:v}))
    .filter(p=>Number.isFinite(p.value) && p.value < 0);
}

function _continuousNightConsumptionRuns(values){
  const runs = [];
  let current = [];
  WATER_NIGHT_HOURS.forEach(h=>{
    const v = values[h];
    if(Number.isFinite(v) && v > WATER_NIGHT_THRESHOLD_M3){
      current.push({hour:h, value:v});
    }else{
      if(current.length >= WATER_NIGHT_MIN_CONSECUTIVE_HOURS) runs.push(current);
      current = [];
    }
  });
  if(current.length >= WATER_NIGHT_MIN_CONSECUTIVE_HOURS) runs.push(current);
  return runs;
}

function _formatHourValueList(points){
  return points
    .map(p=>`${String(p.hour).padStart(2,"0")}h (${nice(p.value,3)} m³)`)
    .join(", ");
}

function _formatNightRuns(runs){
  return runs.map(run=>{
    const first = run[0].hour;
    const last = run[run.length - 1].hour;
    const maxLiters = Math.max(...run.map(p=>p.value * 1000));
    return `${String(first).padStart(2,"0")}h-${String(last).padStart(2,"0")}h (máx. ${nice(maxLiters,0)} L/h)`;
  }).join("; ");
}

function _coverageSummary(data){
  const rows = [...data.entries()].map(([cpe,item])=>{
    const missingHours = _missingHourIndexes(item.real);
    const negativeHours = _negativeConsumptionHours(item.real);
    const nightRuns = _continuousNightConsumptionRuns(item.real);
    return {
      cpe,
      hoursWithData: 24 - missingHours.length,
      missingHours,
      negativeHours,
      nightRuns,
    };
  });
  const incomplete = rows.filter(r=>r.missingHours.length > 0);
  const negativeConsumption = rows.filter(r=>r.negativeHours.length > 0);
  const continuousNightConsumption = rows.filter(r=>r.nightRuns.length > 0);
  const zeroConsumption = rows.filter(r=>{
    const values = (data.get(r.cpe)?.real || []).filter(Number.isFinite);
    return values.length && values.every(v=>Math.abs(v) < 0.000001);
  });
  return {
    total: rows.length,
    complete: rows.length - incomplete.length,
    incomplete,
    negativeConsumption,
    continuousNightConsumption,
    zeroConsumption,
  };
}

function _hourlyPath(values, X, Y){
  const parts = [];
  let active = false;
  values.forEach((v,i)=>{
    if(v === null || !Number.isFinite(v)){
      active = false;
      return;
    }
    parts.push(`${active ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`);
    active = true;
  });
  return parts.join(" ");
}

function _hourlyBandPath(lo, hi, X, Y){
  const upper = [], lower = [];
  hi.forEach((v,i)=>{
    if(v !== null && Number.isFinite(v) && lo[i] !== null && Number.isFinite(lo[i])){
      upper.push([X(i), Y(v)]);
      lower.push([X(i), Y(Math.max(0, lo[i]))]);
    }
  });
  if(upper.length < 2) return "";
  return `M${upper.map(p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")} ` +
    `L${lower.reverse().map(p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")} Z`;
}

function _compareMetrics(item, start=0, count=24){
  const pares = [];
  for(let i=start; i<start+count; i++){
    const real = item.real[i], prev = item.prev[i];
    if(Number.isFinite(real) && Number.isFinite(prev)) pares.push({real, prev});
  }
  if(!pares.length) return {n:0, mae:null, mape:null, rmse:null};
  const abs = pares.map(p=>Math.abs(p.real-p.prev));
  const mae = abs.reduce((a,b)=>a+b,0)/abs.length;
  const rmse = Math.sqrt(pares.reduce((a,p)=>a+Math.pow(p.real-p.prev,2),0)/pares.length);
  const validMape = pares.filter(p=>Math.abs(p.real) > 0.001);
  const mape = validMape.length
    ? validMape.reduce((a,p)=>a+Math.abs((p.real-p.prev)/p.real),0)/validMape.length*100
    : null;
  return {n:pares.length, mae, mape, rmse};
}

function renderForecastComparison(realInput, predictionRes, dateStr){
  const wrap = $("#forecastCompareWrap");
  if(!wrap) return;
  const cfg = activeDataset();
  if(!cfg.hasPrediction){
    renderDailyConsumptionOnly(realInput, dateStr);
    return;
  }
  const realDays = _normaliseForecastRealDays(realInput, dateStr);
  if(!realDays.length || !realDays.some(d=>d.rows && d.rows.length)){
    wrap.innerHTML = emptyMsg("Sem consumo real para construir a janela dos ultimos dias.");
    return;
  }
  if(!predictionRes){
    wrap.innerHTML = emptyCmd(
      "Sem previsao para comparar",
      `Nao encontrei a previsao guardada para ${prettyDate(dateStr)}.`,
      formatTemplate(PATHS.predictions, dateStr)
    );
    return;
  }

  const predRows = parseCSV(predictionRes.text);
  const hasHourlyPrediction = predRows.some(r=>r.hora !== "" && r.hora !== undefined);
  if(!hasHourlyPrediction){
    wrap.innerHTML = emptyMsg("Esta previsao e diaria e nao tem detalhe por hora para desenhar este grafico.");
    return;
  }

  const dates = _forecastWindowDates(dateStr);
  const dateIndex = new Map(dates.map((d,i)=>[d,i]));
  const totalPoints = dates.length * 24;
  const forecastStart = (dates.length - 1) * 24;
  const dateTypes = new Map();
  const data = new Map();
  realDays.forEach(day=>{
    const dayIdx = dateIndex.get(day.date);
    if(dayIdx === undefined || !day.rows) return;
    const tipoDia = day.rows.find(r=>r.tipo_dia)?.tipo_dia;
    if(tipoDia) dateTypes.set(day.date, tipoDia);
    day.rows.forEach(r=>{
      const cpe = r.CPE;
      const h = +r.hora;
      const real = +r.consumo_real;
      if(!cpe || !Number.isInteger(h) || h < 0 || h > 23 || !Number.isFinite(real)) return;
      _ensureCompareRow(data, cpe, totalPoints).real[dayIdx * 24 + h] = real;
    });
  });
  predRows.forEach(r=>{
    if(r.tipo_dia && !dateTypes.has(dateStr)) dateTypes.set(dateStr, r.tipo_dia);
    const cpe = r.CPE;
    const h = +r.hora;
    const prev = +r.previsao;
    if(!cpe || !Number.isInteger(h) || h < 0 || h > 23 || !Number.isFinite(prev)) return;
    const idx = forecastStart + h;
    const item = _ensureCompareRow(data, cpe, totalPoints);
    item.prev[idx] = prev;
    item.std[idx] = +r.std;
    item.lo[idx] = Number.isFinite(+r.low_2sigma) ? +r.low_2sigma : prev - 2*(+r.std || 0);
    item.hi[idx] = Number.isFinite(+r.high_2sigma) ? +r.high_2sigma : prev + 2*(+r.std || 0);
  });

  const cpes = [...data.entries()]
    .filter(([,item])=>item.real.some(Number.isFinite) && item.prev.some(Number.isFinite))
    .map(([cpe,item])=>{
      const total = item.real.reduce((a,v)=>a+(Number.isFinite(v)?v:0),0);
      const m = _compareMetrics(item, forecastStart, 24);
      return {cpe, total, mae:m.mae ?? -1};
    })
    .sort((a,b)=>compareEntityId(a.cpe, b.cpe))
    .map(x=>x.cpe);

  if(!cpes.length){
    wrap.innerHTML = emptyMsg("Nao ha CPEs com consumo real e previsao horaria no mesmo dia.");
    return;
  }

  FORECAST_COMPARE_STATE = {
    cpes,
    data,
    selected: cpes.includes(FORECAST_COMPARE_STATE.selected) ? FORECAST_COMPARE_STATE.selected : cpes[0],
    search:"",
    dates,
    dateTypes,
    mode:"forecast",
    coverage:null,
    forecastDate: dateStr,
    forecastStart,
  };
  drawForecastComparison();
}

function renderDailyConsumptionOnly(analysisRows, dateStr){
  const wrap = $("#forecastCompareWrap");
  if(!wrap) return;
  const rows = Array.isArray(analysisRows) ? analysisRows : [];
  if(!rows.length){
    wrap.innerHTML = emptyMsg(`Sem consumo real para mostrar neste dia.`);
    return;
  }

  const totalPoints = 24;
  const dateTypes = new Map();
  const tipoDia = rows.find(r=>r.tipo_dia)?.tipo_dia;
  if(tipoDia) dateTypes.set(dateStr, tipoDia);

  const data = new Map();
  rows.forEach(r=>{
    const cpe = r.CPE;
    const h = +r.hora;
    const real = +r.consumo_real;
    if(!cpe || !Number.isInteger(h) || h < 0 || h > 23 || !Number.isFinite(real)) return;
    _ensureCompareRow(data, cpe, totalPoints).real[h] = real;
  });

  const cpes = [...data.entries()]
    .filter(([,item])=>item.real.some(Number.isFinite))
    .map(([cpe,item])=>({
      cpe,
      total:item.real.reduce((a,v)=>a+(Number.isFinite(v)?v:0),0),
    }))
    .sort((a,b)=>compareEntityId(a.cpe, b.cpe))
    .map(x=>x.cpe);

  if(!cpes.length){
    wrap.innerHTML = emptyMsg(`Sem ${activeDataset().entityPlural.toLowerCase()} com consumo real neste dia.`);
    return;
  }

  FORECAST_COMPARE_STATE = {
    cpes,
    data,
    selected: cpes.includes(FORECAST_COMPARE_STATE.selected) ? FORECAST_COMPARE_STATE.selected : cpes[0],
    search:"",
    dates:[dateStr],
    dateTypes,
    mode:"real-only",
    coverage:_coverageSummary(data),
    forecastDate:null,
    forecastStart:0,
  };
  drawForecastComparison();
}

function drawForecastComparison(){
  const wrap = $("#forecastCompareWrap");
  const state = FORECAST_COMPARE_STATE;
  const item = state.data.get(state.selected);
  if(!wrap || !item) return;

  const cfg = activeDataset();
  const isForecastMode = state.mode !== "real-only";
  const W=920, H=390, padL=56, padR=24, padT=64, padB=56;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  const totalPoints = item.real.length;
  const lastIdx = Math.max(totalPoints - 1, 1);
  const forecastStart = state.forecastStart || 0;
  const values = [...item.real, ...item.prev, ...item.lo.map(v=>Number.isFinite(v)?Math.max(0,v):v), ...item.hi]
    .filter(v=>v !== null && Number.isFinite(v));
  const yAxis = chartAxisDomain(values);
  const ymin = yAxis.ymin;
  const ymax = yAxis.ymax;
  const X = idx => padL + idx/lastIdx*innerW;
  const Y = v => padT + (1-(v-ymin)/(ymax-ymin))*innerH;
  const metrics = isForecastMode ? _compareMetrics(item, forecastStart, 24) : null;
  const realVals = item.real.filter(Number.isFinite);
  const realTotal = realVals.reduce((a,b)=>a+b,0);
  const realAvg = realVals.length ? realTotal / realVals.length : null;
  const realMax = realVals.length ? Math.max(...realVals) : null;
  const pointLabel = idx=>{
    const d = state.dates[Math.floor(idx/24)] || state.forecastDate || "";
    return `${_forecastDateLabel(d, state.dateTypes)} ${String(idx % 24).padStart(2,"0")}h`;
  };

  let s = svgEl(W,H);
  if(isForecastMode && totalPoints > 24){
    const forecastX = X(forecastStart);
    s += `<rect x="${forecastX.toFixed(1)}" y="${padT}" width="${(X(lastIdx)-forecastX).toFixed(1)}"
      height="${innerH}" fill="var(--pred-soft)" opacity=".28">
      <title>Dia previsto: ${escapeHtml(_forecastDateLabel(state.forecastDate, state.dateTypes))}</title>
    </rect>`;
  }
  for(let k=0;k<=5;k++){
    const v = ymin + k/5*(ymax-ymin), yy=Y(v);
    s += `<line class="grid-line" x1="${padL}" y1="${yy}" x2="${padL+innerW}" y2="${yy}"/>`;
    s += `<text x="${padL-10}" y="${yy+4}" font-size="11" text-anchor="end">${nice(v,yAxis.decimals)}</text>`;
  }
  if(ACTIVE_DATASET === "agua" && ymin < 0 && ymax > 0){
    const zeroY = Y(0);
    s += `<line class="zero-line" x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${padL+innerW}" y2="${zeroY.toFixed(1)}">
      <title>Linha do zero</title>
    </line>`;
    s += `<text class="zero-label" x="${padL+innerW-4}" y="${zeroY-6}" font-size="11" text-anchor="end">0</text>`;
  }
  if(isForecastMode){
    state.dates.forEach((d, dayIdx)=>{
      const startIdx = dayIdx * 24;
      const x = X(startIdx);
      const isForecast = startIdx === forecastStart;
      s += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT+innerH}"
        stroke="${isForecast ? "var(--pred)" : "var(--line-2)"}" stroke-width="${isForecast ? 1.8 : 1}"
        stroke-dasharray="${isForecast ? "5 5" : "2 6"}" opacity="${isForecast ? .9 : .75}"/>`;
      const centerIdx = Math.min(startIdx + 11.5, lastIdx);
      s += `<text x="${X(centerIdx).toFixed(1)}" y="${H-padB+24}" font-size="11"
        text-anchor="middle">${escapeHtml(_forecastDateLabel(d, state.dateTypes))}</text>`;
    });
  }else{
    [0,3,6,9,12,15,18,21,23].forEach(h=>{
      s += `<line class="grid-line" x1="${X(h)}" y1="${padT}" x2="${X(h)}" y2="${padT+innerH}" opacity=".55"/>`;
      s += `<text x="${X(h)}" y="${H-padB+24}" font-size="11" text-anchor="middle">${String(h).padStart(2,"0")}h</text>`;
    });
  }
  s += `<line x1="${X(lastIdx).toFixed(1)}" y1="${padT}" x2="${X(lastIdx).toFixed(1)}" y2="${padT+innerH}"
    stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2 6" opacity=".75"/>`;

  if(isForecastMode){
    const bandPath = _hourlyBandPath(item.lo, item.hi, X, Y);
    if(bandPath){
      s += `<path d="${bandPath}" fill="var(--pred-soft)" stroke="none" opacity=".88">
        <title>Intervalo esperado da previsao (+/-2 sigma)</title>
      </path>`;
      const hiPath = _hourlyPath(item.hi, X, Y);
      const loPath = _hourlyPath(item.lo.map(v=>Number.isFinite(v)?Math.max(0,v):v), X, Y);
      s += `<path d="${hiPath}" fill="none" stroke="var(--pred)" stroke-width="1.2" stroke-dasharray="3 5" opacity=".55"/>`;
      s += `<path d="${loPath}" fill="none" stroke="var(--pred)" stroke-width="1.2" stroke-dasharray="3 5" opacity=".55"/>`;
    }
  }

  const realPath = _hourlyPath(item.real, X, Y);
  if(isForecastMode){
    const predPath = _hourlyPath(item.prev, X, Y);
    s += `<path d="${predPath}" fill="none" stroke="var(--pred)" stroke-width="2.6"
          stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="8 7"/>`;
  }
  s += `<path d="${realPath}" fill="none" stroke="var(--ink)" stroke-width="2.8"
        stroke-linejoin="round" stroke-linecap="round"/>`;

  item.real.forEach((real,idx)=>{
    if(Number.isFinite(real)){
      s += `<circle cx="${X(idx).toFixed(1)}" cy="${Y(real).toFixed(1)}" r="2.5"
        fill="var(--ink)">
        <title>${pointLabel(idx)} real: ${valueWithUnit(real)}</title>
      </circle>`;
    }
  });
  if(isForecastMode){
    item.prev.forEach((prev,idx)=>{
      if(Number.isFinite(prev)){
        s += `<circle cx="${X(idx).toFixed(1)}" cy="${Y(prev).toFixed(1)}" r="3.2"
          fill="var(--paper-2)" stroke="var(--pred)" stroke-width="1.6">
          <title>${pointLabel(idx)} previsao: ${valueWithUnit(prev)}</title>
        </circle>`;
      }
    });
  }

  s += `<text x="${padL+innerW/2}" y="${H-10}" font-size="11" text-anchor="middle">${isForecastMode ? `${FORECAST_CONTEXT_DAYS} dias reais + dia previsto` : "hora do dia"}</text>`;
  s += `<text x="16" y="${padT+innerH/2}" font-size="11" text-anchor="middle" transform="rotate(-90 16 ${padT+innerH/2})">${unitLabel()}</text>`;
  s += `</svg>`;

  const searchTerm = state.search || "";
  const searchMatches = searchTerm.trim()
    ? state.cpes.filter(cpe=>matchesEntitySearch(cpe, searchTerm))
    : state.cpes;
  const listedCpes = searchMatches.length
    ? searchMatches
    : (state.selected ? [state.selected] : []);
  const options = [
    ...(!searchMatches.length && searchTerm.trim()
      ? [`<option value="" disabled>Sem resultados</option>`]
      : []),
    ...listedCpes.map(cpe=>
    `<option value="${escapeHtml(cpe)}"${cpe===state.selected ? " selected" : ""}>${escapeHtml(cpe)}</option>`
    )
  ].join("");
  const mape = !metrics || metrics.mape === null ? "-" : `${nice(metrics.mape,1)}%`;
  const selectorLabel = cfg.entitySingular === "CPE" ? "CPE" : "CONTADOR";
  const legendHtml = isForecastMode
    ? `<span><i class="real"></i> real</span><span><i class="pred"></i> previsao</span>`
    : `<span><i class="real"></i> consumo real</span>`;
  const metricsHtml = isForecastMode
    ? `<span>Contexto real: <b>${escapeHtml(_forecastDateLabel(state.dates[0], state.dateTypes))} - ${escapeHtml(_forecastDateLabel(state.dates[state.dates.length-2], state.dateTypes))}</b></span>
      <span>Dia previsto: <b>${escapeHtml(_forecastDateLabel(state.forecastDate, state.dateTypes))}</b></span>
      <span>Horas comparadas: <b>${metrics.n}</b></span>
      <span>MAE: <b>${metrics.mae===null ? "-" : valueWithUnit(metrics.mae)}</b></span>
      <span>RMSE: <b>${metrics.rmse===null ? "-" : valueWithUnit(metrics.rmse)}</b></span>
      <span>MAPE: <b>${mape}</b></span>`
    : `<span>Dia: <b>${escapeHtml(_forecastDateLabel(state.dates[0], state.dateTypes))}</b></span>
      <span>Horas com dados: <b>${realVals.length}</b></span>
      <span>Horas sem dados: <b>${24 - realVals.length}</b></span>
      <span>Total: <b>${valueWithUnit(realTotal)}</b></span>
      <span>Média/hora: <b>${realAvg===null ? "-" : valueWithUnit(realAvg)}</b></span>
      <span>Máximo: <b>${realMax===null ? "-" : valueWithUnit(realMax)}</b></span>`;
  const selectedMissingHours = _missingHourIndexes(item.real);
  const selectedNegativeHours = _negativeConsumptionHours(item.real);
  const selectedNightRuns = _continuousNightConsumptionRuns(item.real);
  const coverage = state.coverage;
  const missingHoursText = selectedMissingHours.length
    ? _hourList(selectedMissingHours)
    : "";
  const negativePreview = coverage?.negativeConsumption?.slice(0, 6)
    .map(r=>escapeHtml(r.cpe)).join(", ");
  const nightPreview = coverage?.continuousNightConsumption?.slice(0, 6)
    .map(r=>escapeHtml(r.cpe)).join(", ");
  const warningHtml = !isForecastMode ? `
    <div class="forecast-warnings">
      <div class="forecast-warning-group counter-scope">
        <div class="forecast-warning-title">Avisos do contador selecionado</div>
        <div class="forecast-warning ${selectedMissingHours.length ? "warn" : "ok"}">
          <strong>${selectedMissingHours.length ? "Dados incompletos neste contador" : "Dados completos neste contador"}</strong>
          <span>${selectedMissingHours.length
            ? `Faltam ${selectedMissingHours.length} hora(s): ${missingHoursText}.`
            : "Existem registos para as 24 horas do dia."}</span>
        </div>
        ${ACTIVE_DATASET === "agua" && selectedNightRuns.length ? `
          <div class="forecast-warning warn">
            <strong>Consumo noturno contínuo acima de 10 L</strong>
            <span>Este contador teve consumo superior a 10 L/h durante pelo menos ${WATER_NIGHT_MIN_CONSECUTIVE_HOURS} horas seguidas no período noturno: ${_formatNightRuns(selectedNightRuns)}.</span>
          </div>` : ""}
        ${selectedNegativeHours.length ? `
          <div class="forecast-warning danger">
            <strong>Consumo negativo detetado</strong>
            <span>Este contador tem valores negativos em ${selectedNegativeHours.length} hora(s): ${_formatHourValueList(selectedNegativeHours)}.</span>
          </div>` : ""}
      </div>
      ${(ACTIVE_DATASET === "agua" && coverage?.continuousNightConsumption?.length) || coverage?.negativeConsumption?.length ? `
        <div class="forecast-warning-group day-scope">
          <div class="forecast-warning-title">Avisos gerais do dia</div>
          ${ACTIVE_DATASET === "agua" && coverage?.continuousNightConsumption?.length ? `
            <div class="forecast-warning warn">
              <strong>Possível consumo noturno contínuo</strong>
              <span>${coverage.continuousNightConsumption.length} contador(es) têm pelo menos ${WATER_NIGHT_MIN_CONSECUTIVE_HOURS} horas noturnas seguidas acima de 10 L/h.${nightPreview ? ` Exemplos: ${nightPreview}.` : ""}</span>
            </div>` : ""}
          ${coverage?.negativeConsumption?.length ? `
            <div class="forecast-warning danger">
              <strong>Valores negativos no dia</strong>
              <span>${coverage.negativeConsumption.length} contador(es) têm pelo menos uma hora com consumo negativo.${negativePreview ? ` Exemplos: ${negativePreview}.` : ""}</span>
            </div>` : ""}
        </div>` : ""}
    </div>` : "";
  wrap.innerHTML = `
    <div class="forecast-chart-box">
      <div class="forecast-cpe-picker">
        <span>${selectorLabel}</span>
        <input id="forecastCpeSearch" type="search"
          placeholder="Pesquisar..."
          value="${escapeHtml(searchTerm)}"
          aria-label="Pesquisar ${escapeHtml(cfg.entitySingular)}">
        <select id="forecastCpeSelect" aria-label="Escolher ${escapeHtml(cfg.entitySingular)} para ver o consumo">
          ${options}
        </select>
        <em>${searchMatches.length}/${state.cpes.length}</em>
      </div>
      <div class="forecast-legend" aria-hidden="true">
        ${legendHtml}
      </div>
      ${s}
    </div>
    <div class="forecast-metrics">
      ${metricsHtml}
    </div>
    ${warningHtml}`;

  $("#forecastCpeSelect").addEventListener("change", e=>{
    if(!e.target.value) return;
    FORECAST_COMPARE_STATE.selected = e.target.value;
    drawForecastComparison();
  });
  $("#forecastCpeSearch").addEventListener("input", e=>{
    const cursor = e.target.selectionStart ?? e.target.value.length;
    const query = e.target.value;
    const matches = query.trim()
      ? FORECAST_COMPARE_STATE.cpes.filter(cpe=>matchesEntitySearch(cpe, query))
      : FORECAST_COMPARE_STATE.cpes;
    FORECAST_COMPARE_STATE.search = query;
    if(query.trim() && matches.length){
      const exact = matches.find(cpe=>normaliseSearchText(cpe) === normaliseSearchText(query).trim());
      FORECAST_COMPARE_STATE.selected = exact || matches[0];
    }
    drawForecastComparison();
    requestAnimationFrame(()=>{
      const input = $("#forecastCpeSearch");
      if(input){
        input.focus();
        input.setSelectionRange(cursor, cursor);
      }
    });
  });
}

let DAILY_PCA_MODEL_PROMISE = null;
const DAILY_CLUSTER_STORAGE_VERSION = "daily_pca_manual_clusters_v1";
let DAILY_PCA_CLUSTER_FILTERS = null;
let DAILY_PCA_DEVIATION_FILTERS = null;
let DAILY_PCA_CLUSTER_EXPORT_BASE = new Map();
let DAILY_PCA_VIEW_DOMAIN = null;
let DAILY_PCA_SUPPRESS_CLICK = false;
const DAILY_CLUSTER_COLORS = {
  "0":"#4C97D4",
  "1":"#F5A623",
  "2":"#4CAF50",
  "outlier":"#7F8C8D",
  "sem cluster":"#8A94A1",
};

function readDailyClusterOverrides(){
  try{
    return JSON.parse(localStorage.getItem(dailyClusterStorageKey()) || "{}");
  }catch(e){
    return {};
  }
}
function writeDailyClusterOverrides(overrides){
  localStorage.setItem(dailyClusterStorageKey(), JSON.stringify(overrides));
}
function dailyClusterStorageKey(){
  return `${ACTIVE_DATASET}_${DAILY_CLUSTER_STORAGE_VERSION}`;
}
function countDailyClusterOverrides(){
  return Object.keys(readDailyClusterOverrides()).length;
}
function setDailyClusterOverride(cpe, cluster){
  const overrides = readDailyClusterOverrides();
  const normalized = normalizeCluster(cluster);
  if(normalized && normalized !== "sem cluster"){
    overrides[cpe] = normalized;
  }else{
    delete overrides[cpe];
  }
  writeDailyClusterOverrides(overrides);
}
function normalizeCluster(cluster){
  const raw = String(cluster ?? "").trim();
  if(!raw || raw.toLowerCase() === "nan") return "";
  if(raw === "sem cluster") return "sem cluster";
  if(raw.toLowerCase() === "outlier") return "outlier";
  const numeric = Number(raw.replace(",", "."));
  if(Number.isFinite(numeric) && Number.isInteger(numeric)) return String(numeric);
  return raw;
}
function clusterLabel(cluster){
  const value = clusterValue(cluster);
  if(value === "sem cluster") return "sem cluster";
  if(value === "outlier") return "outlier";
  return `Cluster ${value}`;
}
function clusterValue(cluster){
  const value = normalizeCluster(cluster);
  return value && value !== "sem cluster"
    ? value
    : "sem cluster";
}
function clusterChipLabel(cluster){
  const value = clusterValue(cluster);
  return value === "sem cluster" ? value : `Cluster ${value}`;
}
function clusterColor(cluster){
  return DAILY_CLUSTER_COLORS[clusterValue(cluster)] || DAILY_CLUSTER_COLORS["sem cluster"];
}
function pcaClusterCountMap(points){
  const counts = new Map();
  points.forEach(p=>{
    const key = clusterValue(p.cluster);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}
function pcaSortedClusters(values){
  return [...new Set(values.map(clusterValue))]
    .filter(c=>c && c !== "sem cluster")
    .sort((a,b)=>String(a).localeCompare(String(b), "pt", {numeric:true}));
}
function updateDailyPcaDescription(dateStr, points){
  const sub = $("#pcaDiaSub");
  if(!sub) return;

  const counts = pcaClusterCountMap(points);
  const clusters = pcaSortedClusters([...counts.keys()]);
  const semCluster = counts.get("sem cluster") || 0;
  const withDeviation = points.filter(p=>p.desvios > 0).length;
  const parts = clusters.map(c=>
    `<span class="pca-inline-count">${clusterLabel(c)}: <b>${counts.get(c) || 0}</b></span>`
  );
  if(semCluster){
    parts.push(`<span class="pca-inline-count">sem cluster: <b>${semCluster}</b></span>`);
  }

  sub.innerHTML =
    `Dia analisado: <b>${prettyDate(dateStr)}</b>. ` +
    `${points.length} ${activeDataset().entityPlural.toLowerCase()} projetados; ${withDeviation} com pelo menos um desvio no dia. ` +
    `<span class="pca-inline-counts">${parts.join(" · ")}</span>`;
}
function normalizeDailyPcaFilterValue(value){
  if(!value || value === "all") return "";
  if(value === "sem-cluster") return "sem cluster";
  return clusterValue(value);
}
function dailyPcaAvailableClusterFilters(points, availableClusters){
  const options = pcaSortedClusters(availableClusters)
    .filter(c=>points.some(p=>clusterValue(p.cluster) === c));
  if(points.some(p=>clusterValue(p.cluster) === "sem cluster")){
    options.push("sem cluster");
  }
  return options;
}
function resolveDailyPcaClusterFilters(points, availableClusters){
  const validClusters = dailyPcaAvailableClusterFilters(points, availableClusters);
  if(DAILY_PCA_CLUSTER_FILTERS === null) return validClusters;
  const validSet = new Set(validClusters);
  return [...new Set(DAILY_PCA_CLUSTER_FILTERS.map(normalizeDailyPcaFilterValue))]
    .filter(c=>c && validSet.has(c));
}
function dailyPcaAvailableDeviationFilters(points){
  const options = [];
  if(points.some(p=>p.desvios > 0)) options.push("with");
  if(points.some(p=>p.desvios === 0)) options.push("without");
  return options;
}
function resolveDailyPcaDeviationFilters(points){
  const validFilters = dailyPcaAvailableDeviationFilters(points);
  if(DAILY_PCA_DEVIATION_FILTERS === null) return validFilters;
  const validSet = new Set(validFilters);
  return [...new Set(DAILY_PCA_DEVIATION_FILTERS)]
    .filter(f=>validSet.has(f));
}
function dailyPcaClusterSelectionText(activeClusterFilters, availableClusterFilters){
  if(!activeClusterFilters.length) return "nenhum cluster selecionado";
  if(activeClusterFilters.length === availableClusterFilters.length) return "todos os clusters";
  if(activeClusterFilters.length === 1){
    const c = activeClusterFilters[0];
    return c === "sem cluster" ? "sem cluster" : clusterLabel(c);
  }
  return "os clusters selecionados";
}
function pcaFilterText(label, count){
  return `${label} <span class="pca-filter-pipe">|</span> <b>${count}</b>`;
}
function dailyPcaEmptyText(activeClusterFilters, activeDeviationFilters, availableClusterFilters){
  if(!activeDeviationFilters.length) return "Sem filtros de desvio selecionados.";
  const alvo = dailyPcaClusterSelectionText(activeClusterFilters, availableClusterFilters);
  return `Sem ${activeDataset().entityPlural.toLowerCase()} em ${alvo} para este dia.`;
}
function dailyPcaMatchesCluster(point, activeClusterFilters){
  return activeClusterFilters.includes(clusterValue(point.cluster));
}
function dailyPcaMatchesDeviation(point, activeDeviationFilters){
  return (point.desvios > 0 && activeDeviationFilters.includes("with"))
    || (point.desvios === 0 && activeDeviationFilters.includes("without"));
}

function dailyPcaDefaultDomain(points){
  const xs = points.map(p=>p.pc1), ys = points.map(p=>p.pc2);
  let xmin=Math.min(...xs), xmax=Math.max(...xs), ymin=Math.min(...ys), ymax=Math.max(...ys);
  if(xmin===xmax){ xmin-=1; xmax+=1; }
  if(ymin===ymax){ ymin-=1; ymax+=1; }
  const padx=(xmax-xmin)*0.12, pady=(ymax-ymin)*0.16;
  return {xmin:xmin-padx, xmax:xmax+padx, ymin:ymin-pady, ymax:ymax+pady};
}

function dailyPcaDomainRanges(domain){
  return {x:domain.xmax-domain.xmin, y:domain.ymax-domain.ymin};
}

function dailyPcaClampZoom(domain, baseDomain){
  const base = dailyPcaDomainRanges(baseDomain);
  const current = dailyPcaDomainRanges(domain);
  const minX = base.x / 80;
  const minY = base.y / 80;
  const maxX = base.x;
  const maxY = base.y;
  const cx = (domain.xmin + domain.xmax) / 2;
  const cy = (domain.ymin + domain.ymax) / 2;
  const w = Math.min(Math.max(current.x, minX), maxX);
  const h = Math.min(Math.max(current.y, minY), maxY);
  let xmin = cx - w/2;
  let xmax = cx + w/2;
  let ymin = cy - h/2;
  let ymax = cy + h/2;

  if(w >= base.x){
    xmin = baseDomain.xmin;
    xmax = baseDomain.xmax;
  }else{
    if(xmin < baseDomain.xmin){ xmax += baseDomain.xmin - xmin; xmin = baseDomain.xmin; }
    if(xmax > baseDomain.xmax){ xmin -= xmax - baseDomain.xmax; xmax = baseDomain.xmax; }
  }

  if(h >= base.y){
    ymin = baseDomain.ymin;
    ymax = baseDomain.ymax;
  }else{
    if(ymin < baseDomain.ymin){ ymax += baseDomain.ymin - ymin; ymin = baseDomain.ymin; }
    if(ymax > baseDomain.ymax){ ymin -= ymax - baseDomain.ymax; ymax = baseDomain.ymax; }
  }

  return {xmin, xmax, ymin, ymax};
}

function dailyPcaScreenToData(evt, svg, domain, dims){
  const rect = svg.getBoundingClientRect();
  const sx = (evt.clientX - rect.left) / rect.width * dims.W;
  const sy = (evt.clientY - rect.top) / rect.height * dims.H;
  const px = Math.min(Math.max(sx, dims.padL), dims.padL + dims.innerW);
  const py = Math.min(Math.max(sy, dims.padT), dims.padT + dims.innerH);
  return {
    sx,
    sy,
    x: domain.xmin + (px - dims.padL) / dims.innerW * (domain.xmax - domain.xmin),
    y: domain.ymax - (py - dims.padT) / dims.innerH * (domain.ymax - domain.ymin),
  };
}

function renderDailyPcaFilters(
  points,
  availableClusters,
  activeClusterFilters=DAILY_PCA_CLUSTER_FILTERS,
  activeDeviationFilters=DAILY_PCA_DEVIATION_FILTERS
){
  const clusterOptions = dailyPcaAvailableClusterFilters(points, availableClusters);
  const deviationOptions = dailyPcaAvailableDeviationFilters(points);
  activeClusterFilters = activeClusterFilters === null ? clusterOptions : activeClusterFilters;
  activeDeviationFilters = activeDeviationFilters === null ? deviationOptions : activeDeviationFilters;
  const pointsForClusterCounts = points.filter(p=>dailyPcaMatchesDeviation(p, activeDeviationFilters));
  const pointsForStatusCounts = points.filter(p=>dailyPcaMatchesCluster(p, activeClusterFilters));
  const counts = pcaClusterCountMap(pointsForClusterCounts);
  const withDeviation = pointsForStatusCounts.filter(p=>p.desvios > 0).length;
  const withoutDeviation = pointsForStatusCounts.length - withDeviation;
  const clusterButtons = clusterOptions.map(c=>{
      const count = counts.get(c) || 0;
      const selected = activeClusterFilters.includes(c) ? " is-active" : "";
      const dataFilter = c === "sem cluster" ? "sem-cluster" : c;
      return `<button type="button" class="pca-filter-btn${selected}" data-filter="${escapeHtml(dataFilter)}"
          style="--cluster-color:${clusterColor(c)}">${pcaFilterText(clusterLabel(c), count)}</button>`;
    });

  const statusButtons = [
    deviationOptions.includes("with")
      ? `<button type="button" class="pca-filter-btn${activeDeviationFilters.includes("with") ? " is-active" : ""}" data-status="with"
          style="--cluster-color:var(--high)">${pcaFilterText("Com desvios", withDeviation)}</button>`
      : "",
    deviationOptions.includes("without")
      ? `<button type="button" class="pca-filter-btn${activeDeviationFilters.includes("without") ? " is-active" : ""}" data-status="without"
          style="--cluster-color:var(--ok)">${pcaFilterText("Sem desvios", withoutDeviation)}</button>`
      : ""
  ].filter(Boolean);

  return `<div class="pca-filter-panel" aria-label="Filtrar PCA do dia">
    <div class="pca-filter-group">
      <div class="pca-filter-head">
        <span class="pca-filter-label">Clusters</span>
        <button type="button" class="pca-filter-action" data-select-all="clusters">Selecionar todos</button>
      </div>
      <div class="pca-filter-bar">${clusterButtons.join("")}</div>
    </div>
    <div class="pca-filter-group">
      <div class="pca-filter-head">
        <span class="pca-filter-label">Desvios</span>
      </div>
      <div class="pca-filter-bar">${statusButtons.join("")}</div>
    </div>
  </div>`;
}

function dot(a,b){ return a.reduce((s,v,i)=>s+v*b[i],0); }
function norm(v){ return Math.sqrt(dot(v,v)); }
function matVec(m,v){ return m.map(row=>dot(row,v)); }
function normalize(v){
  const n = norm(v);
  return n ? v.map(x=>x/n) : v.map(()=>0);
}
function subtractProjection(v, base){
  const k = dot(v, base);
  return v.map((x,i)=>x-k*base[i]);
}
function powerIteration(matrix, seedShift=0, orthogonalTo=null){
  const n = matrix.length;
  let v = normalize(Array.from({length:n}, (_,i)=>Math.sin((i+1)*(seedShift+1)) + 0.2));
  for(let iter=0; iter<80; iter++){
    let next = matVec(matrix, v);
    if(orthogonalTo) next = subtractProjection(next, orthogonalTo);
    const size = norm(next);
    if(!size) break;
    v = next.map(x=>x/size);
  }
  return v;
}
function covariance(rows, dims){
  const cov = Array.from({length:dims}, ()=>Array(dims).fill(0));
  rows.forEach(row=>{
    for(let i=0;i<dims;i++){
      for(let j=i;j<dims;j++){
        cov[i][j] += row[i] * row[j];
      }
    }
  });
  const div = Math.max(rows.length-1, 1);
  for(let i=0;i<dims;i++){
    for(let j=i;j<dims;j++){
      cov[i][j] /= div;
      cov[j][i] = cov[i][j];
    }
  }
  return cov;
}
function deflate(matrix, lambda, vector){
  return matrix.map((row,i)=>row.map((v,j)=>v - lambda*vector[i]*vector[j]));
}
function correlation(a,b){
  const n = Math.min(a.length,b.length);
  if(!n) return 0;
  const ma = a.reduce((s,v)=>s+v,0)/n;
  const mb = b.reduce((s,v)=>s+v,0)/n;
  let num=0, da=0, db=0;
  for(let i=0;i<n;i++){
    const xa=a[i]-ma, xb=b[i]-mb;
    num += xa*xb; da += xa*xa; db += xb*xb;
  }
  return da && db ? num/Math.sqrt(da*db) : 0;
}
function projectVector(values, model){
  const centered = values.map((v,i)=>v-model.mean[i]);
  return {
    pc1: dot(centered, model.pc1),
    pc2: dot(centered, model.pc2),
  };
}
async function loadDailyPcaModel(){
  if(DAILY_PCA_MODEL_PROMISE) return DAILY_PCA_MODEL_PROMISE;

  DAILY_PCA_MODEL_PROMISE = (async()=>{
    const cfg = activeDataset();
    if(!cfg.paths.pcaFeatures || !cfg.paths.pcaClusters) return null;
    const [featuresRes, clustersRes, assignedClustersRes, coordsRes] = await Promise.all([
      fetchFixed(cfg.paths.pcaFeatures),
      fetchFixed(cfg.paths.pcaClusters),
      fetchFixed(cfg.paths.pcaAssignedClusters),
      fetchFixed(cfg.paths.pcaCoords),
    ]);
    if(!featuresRes || !clustersRes) return null;

    const clusters = new Map();
    const historicalClusters = new Map();
    const assignedClusters = new Map();
    parseCSV(clustersRes.text).forEach(r=>{
      if(!r.CPE) return;
      const cluster = normalizeCluster(r.cluster);
      clusters.set(r.CPE, cluster);
      historicalClusters.set(r.CPE, cluster);
    });
    if(assignedClustersRes){
      parseCSV(assignedClustersRes.text).forEach(r=>{
        if(!r.CPE) return;
        const assigned = normalizeCluster(r.cluster);
        if(assigned && assigned !== "outlier" && assigned !== "sem cluster"){
          assignedClusters.set(r.CPE, assigned);
          clusters.set(r.CPE, assigned);
        }
      });
    }
    const availableClusters = [...new Set([...clusters.values()]
      .map(normalizeCluster)
      .filter(c=>c && c !== "outlier" && c !== "sem cluster"))]
      .sort((a,b)=>String(a).localeCompare(String(b), "pt", {numeric:true}));

    const featureRows = parseCSV(featuresRes.text);
    const featureCols = featureRows.length
      ? Object.keys(featureRows[0]).filter(c=>/^f\d+_pct_hora_/.test(c)).sort()
      : [];
    if(featureCols.length !== 24) return null;

    const records = featureRows
      .filter(r=>r.CPE && clusters.get(r.CPE) !== "outlier")
      .map(r=>({
        cpe: r.CPE,
        values: featureCols.map(c=>+r[c]),
        cluster: normalizeCluster(clusters.get(r.CPE)),
      }))
      .filter(r=>r.values.every(v=>Number.isFinite(v)));
    if(records.length < 3) return null;

    const dims = featureCols.length;
    const mean = Array(dims).fill(0);
    records.forEach(r=>r.values.forEach((v,i)=>{ mean[i]+=v; }));
    for(let i=0;i<dims;i++) mean[i] /= records.length;

    const centered = records.map(r=>r.values.map((v,i)=>v-mean[i]));
    const cov = covariance(centered, dims);
    let pc1 = powerIteration(cov, 0);
    const lambda1 = dot(pc1, matVec(cov, pc1));
    const cov2 = deflate(cov, lambda1, pc1);
    let pc2 = powerIteration(cov2, 3, pc1);

    if(coordsRes){
      const coordMap = new Map();
      parseCSV(coordsRes.text).forEach(r=>{
        if(r.CPE && Number.isFinite(+r.PC1) && Number.isFinite(+r.PC2)){
          coordMap.set(r.CPE, {pc1:+r.PC1, pc2:+r.PC2});
        }
      });
      const computed = records.map(r=>projectVector(r.values, {mean, pc1, pc2}));
      const common1 = [], ref1 = [], common2 = [], ref2 = [];
      records.forEach((r,i)=>{
        const ref = coordMap.get(r.cpe);
        if(!ref) return;
        common1.push(computed[i].pc1); ref1.push(ref.pc1);
        common2.push(computed[i].pc2); ref2.push(ref.pc2);
      });
      if(correlation(common1, ref1) < 0) pc1 = pc1.map(v=>-v);
      if(correlation(common2, ref2) < 0) pc2 = pc2.map(v=>-v);
    }

    return {mean, pc1, pc2, clusters, historicalClusters, assignedClusters, availableClusters};
  })();

  return DAILY_PCA_MODEL_PROMISE;
}
function buildDailyProfiles(rows, clusterMap, overrides, availableClusters){
  const byCpe = new Map();
  const validClusters = new Set(availableClusters.map(normalizeCluster));
  rows.forEach(r=>{
    const cpe = r.CPE;
    const hora = +r.hora;
    const real = +r.consumo_real;
    if(!cpe || !Number.isInteger(hora) || hora < 0 || hora > 23 || !Number.isFinite(real)) return;
    const rowCluster = normalizeCluster(r.cluster);
    const mapCluster = normalizeCluster(clusterMap.get(cpe));
    const rawCluster = rowCluster || mapCluster || "";
    const baseCluster = clusterValue(rawCluster);
    const overrideCluster = normalizeCluster(overrides[cpe]);
    const manualCluster = validClusters.has(overrideCluster) ? overrideCluster : "";
    const item = byCpe.get(cpe) || {
      cpe,
      horas: Array(24).fill(0),
      hoursSeen: new Set(),
      total: 0,
      desvios: 0,
      baixa: 0,
      maxAbsZ: 0,
      maxZ: 0,
      baseCluster,
      manualCluster,
      cluster: manualCluster || baseCluster,
      canEditCluster: !validClusters.has(baseCluster),
    };
    const safeReal = Math.max(real, 0);
    item.horas[hora] += safeReal;
    item.hoursSeen.add(hora);
    item.total += safeReal;
    const z = +r.z_score;
    if(r.veredicto === "desvio"){
      item.desvios += 1;
      if(r.confianca === "baixa") item.baixa += 1;
    }
    if(Number.isFinite(z) && Math.abs(z) > item.maxAbsZ){
      item.maxAbsZ = Math.abs(z);
      item.maxZ = z;
    }
    byCpe.set(cpe, item);
  });

  return [...byCpe.values()]
    .filter(r=>r.total > 0 && r.hoursSeen.size >= 6)
    .map(r=>({
      cpe: r.cpe,
      perfil: r.horas.map(v=>v/r.total*100),
      total: r.total,
      hours: r.hoursSeen.size,
      desvios: r.desvios,
      baixa: r.baixa,
      maxAbsZ: r.maxAbsZ,
      maxZ: r.maxZ,
      cluster: clusterValue(r.cluster),
      baseCluster: r.baseCluster,
      manualCluster: r.manualCluster,
      canEditCluster: r.canEditCluster,
    }));
}
async function renderPcaDia(rows, dateStr){
  const wrap = $("#dailyPcaWrap");
  const sub = $("#pcaDiaSub");
  if(!wrap || !sub) return;

  const cfg = activeDataset();
  if(!rows || !rows.length){
    sub.textContent = `Sem analise de ${cfg.label.toLowerCase()} para projetar neste dia.`;
    wrap.innerHTML = emptyMsg("Sem dados suficientes para PCA diario.");
    return;
  }

  wrap.innerHTML = '<div class="spinner"></div>';
  const model = await loadDailyPcaModel();
  if(!model){
    sub.textContent = "Nao foi possivel carregar os ficheiros de PCA.";
    wrap.innerHTML = emptyMsg("Faltam os ficheiros de features ou clusters.");
    return;
  }
  DAILY_PCA_CLUSTER_EXPORT_BASE = new Map(model.clusters);

  const profiles = buildDailyProfiles(
    rows,
    model.clusters,
    readDailyClusterOverrides(),
    model.availableClusters,
  );
  if(profiles.length < 3){
    sub.textContent = `Sem ${cfg.entityPlural.toLowerCase()} suficientes com perfil horario completo para este dia.`;
    wrap.innerHTML = emptyMsg("Sem dados suficientes para PCA diario.");
    return;
  }

  const points = profiles.map(p=>({
    ...p,
    ...projectVector(p.perfil, model),
  }));

  wrap.dataset.dateStr = dateStr;
  DAILY_PCA_VIEW_DOMAIN = null;
  updateDailyPcaDescription(dateStr, points);
  renderDailyPcaScatter(wrap, points, model.availableClusters);
}
function renderDailyPcaScatter(container, points, availableClusters, selectedCpe=null){
  const W=920, H=360, padL=56, padR=24, padT=28, padB=50;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  const colors = DAILY_CLUSTER_COLORS;
  updateDailyPcaDescription(container.dataset.dateStr || "", points);

  const activeClusterFilters = resolveDailyPcaClusterFilters(points, availableClusters);
  const activeDeviationFilters = resolveDailyPcaDeviationFilters(points);
  const availableClusterFilters = dailyPcaAvailableClusterFilters(points, availableClusters);
  DAILY_PCA_CLUSTER_FILTERS = activeClusterFilters;
  DAILY_PCA_DEVIATION_FILTERS = activeDeviationFilters;
  const visiblePoints = points.filter(p=>{
    return dailyPcaMatchesCluster(p, activeClusterFilters)
      && dailyPcaMatchesDeviation(p, activeDeviationFilters);
  });
  const controls = renderDailyPcaFilters(points, availableClusters, activeClusterFilters, activeDeviationFilters);

  if(!visiblePoints.length){
    container.innerHTML = controls + emptyMsg(dailyPcaEmptyText(activeClusterFilters, activeDeviationFilters, availableClusterFilters)) +
      `<div class="point-detail muted-detail">Escolhe outro filtro para ver pontos no PCA.</div>` +
      renderDailyClusterEditor(points, availableClusters);
    wireDailyPcaFilters(container, points, availableClusters);
    wireDailyClusterEditor(container, points, availableClusters);
    return;
  }

  const baseDomain = dailyPcaDefaultDomain(visiblePoints);
  const currentDomain = DAILY_PCA_VIEW_DOMAIN
    ? dailyPcaClampZoom(DAILY_PCA_VIEW_DOMAIN, baseDomain)
    : baseDomain;
  DAILY_PCA_VIEW_DOMAIN = currentDomain;
  const {xmin, xmax, ymin, ymax} = currentDomain;
  const X = v => padL + (v-xmin)/(xmax-xmin)*innerW;
  const Y = v => padT + (1-(v-ymin)/(ymax-ymin))*innerH;
  const tickVals = (min,max,n=5)=>Array.from({length:n},(_,i)=>min+i/(n-1)*(max-min));

  let s = `<svg class="chart pca-zoom-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="PCA do dia">
    <defs>
      <clipPath id="dailyPcaPlotClip">
        <rect x="${padL}" y="${padT}" width="${innerW}" height="${innerH}"></rect>
      </clipPath>
    </defs>`;
  let plotLayer = `<g class="pca-pan-layer" clip-path="url(#dailyPcaPlotClip)">`;
  let tickLabels = "";
  tickVals(xmin,xmax).forEach(v=>{
    const x=X(v);
    plotLayer += `<line class="grid-line" x1="${x}" y1="${padT}" x2="${x}" y2="${padT+innerH}"/>`;
    tickLabels += `<text x="${x}" y="${H-padB+22}" font-size="10.5" text-anchor="middle">${nice(v,1)}</text>`;
  });
  tickVals(ymin,ymax).forEach(v=>{
    const y=Y(v);
    plotLayer += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${padL+innerW}" y2="${y}"/>`;
    tickLabels += `<text x="${padL-10}" y="${y+4}" font-size="10.5" text-anchor="end">${nice(v,1)}</text>`;
  });
  if(xmin < 0 && xmax > 0){
    plotLayer += `<line x1="${X(0)}" y1="${padT}" x2="${X(0)}" y2="${padT+innerH}" stroke="var(--ink-3)" stroke-width="1.2" opacity=".55"/>`;
  }
  if(ymin < 0 && ymax > 0){
    plotLayer += `<line x1="${padL}" y1="${Y(0)}" x2="${padL+innerW}" y2="${Y(0)}" stroke="var(--ink-3)" stroke-width="1.2" opacity=".55"/>`;
  }

  plotLayer += `<g class="pca-points-layer">`;
  visiblePoints
    .map(p=>({p, i:points.indexOf(p)}))
    .sort((a,b)=>a.p.desvios-b.p.desvios)
    .forEach(({p,i})=>{
      const fill = colors[clusterValue(p.cluster)] || colors["sem cluster"];
      const hasDeviation = p.desvios > 0;
      const stroke = hasDeviation ? "var(--high)" : "#FFFFFF";
      const strokeW = hasDeviation ? 2.4 : 1.2;
      const radius = 5;
      const conf = p.baixa && p.baixa === p.desvios ? "baixa confianca" : "alta/normal";
      plotLayer += `<circle class="pca-point clickable-point" data-point-index="${i}" tabindex="0"
              cx="${X(p.pc1).toFixed(1)}" cy="${Y(p.pc2).toFixed(1)}" r="${radius.toFixed(1)}"
              fill="${fill}" fill-opacity=".86" stroke="${stroke}" stroke-width="${strokeW}">
              <title>${escapeHtml(p.cpe)} · ${clusterLabel(p.cluster)} · ${p.hours}h · ${p.desvios} desvios · z max ${p.maxZ>=0?"+":""}${nice(p.maxZ,2)} · ${conf}</title>
            </circle>`;
    });
  plotLayer += `</g></g>`;
  s += plotLayer + tickLabels;
  s += `<text x="${padL+innerW/2}" y="${H-10}" font-size="11" text-anchor="middle">PC1</text>`;
  s += `<text x="16" y="${padT+innerH/2}" font-size="11" text-anchor="middle" transform="rotate(-90 16 ${padT+innerH/2})">PC2</text>`;
  s += `</svg>`;

  const clusters = [...new Set(visiblePoints.map(p=>clusterValue(p.cluster)))]
    .sort((a,b)=>String(a).localeCompare(String(b), "pt", {numeric:true}));
  const legendClusters = clusters.map(c=>
    `<span><i style="background:${colors[clusterValue(c)] || colors["sem cluster"]}"></i>${clusterLabel(c)}</span>`
  ).join("");
  const legend = `<div class="legend pca-legend">
      ${legendClusters}
      <span><i class="outline-dot"></i>com desvio no dia</span>
    </div>`;
  const zoomTools = `<div class="pca-zoom-tools">
      <button type="button" class="pca-zoom-reset" data-pca-zoom-reset>Repor zoom</button>
    </div>`;
  container.innerHTML = controls + legend + zoomTools + s +
    `<div class="point-detail muted-detail">Clica num ponto para ver o detalhe do ${activeDataset().entitySingular}.</div>` +
    renderDailyClusterEditor(points, availableClusters);
  wireDailyPcaFilters(container, points, availableClusters);
  wireDailyPcaZoom(container, points, availableClusters, baseDomain, {W,H,padL,padR,padT,padB,innerW,innerH});
  wireDailyPcaDetails(container, points, availableClusters);
  wireDailyClusterEditor(container, points, availableClusters);
  if(selectedCpe && visiblePoints.some(p=>p.cpe === selectedCpe)){
    showDailyPcaPointDetail(container, points, availableClusters, selectedCpe);
  }
}

function wireDailyPcaZoom(container, points, availableClusters, baseDomain, dims){
  const svg = container.querySelector(".pca-zoom-chart");
  const reset = container.querySelector("[data-pca-zoom-reset]");
  if(!svg) return;

  reset?.addEventListener("click", ()=>{
    DAILY_PCA_VIEW_DOMAIN = null;
    renderDailyPcaScatter(container, points, availableClusters);
  });

  svg.addEventListener("wheel", e=>{
    e.preventDefault();
    const domain = DAILY_PCA_VIEW_DOMAIN || baseDomain;
    const focus = dailyPcaScreenToData(e, svg, domain, dims);
    const factor = e.deltaY < 0 ? 0.92 : 1.08;
    const width = (domain.xmax - domain.xmin) * factor;
    const height = (domain.ymax - domain.ymin) * factor;
    const rx = (focus.x - domain.xmin) / (domain.xmax - domain.xmin);
    const ry = (focus.y - domain.ymin) / (domain.ymax - domain.ymin);
    DAILY_PCA_VIEW_DOMAIN = dailyPcaClampZoom({
      xmin: focus.x - width * rx,
      xmax: focus.x + width * (1-rx),
      ymin: focus.y - height * ry,
      ymax: focus.y + height * (1-ry),
    }, baseDomain);
    renderDailyPcaScatter(container, points, availableClusters);
  }, {passive:false});

  let drag = null;
  let dragFrame = null;
  const renderDragDomain = domain=>{
    if(dragFrame) cancelAnimationFrame(dragFrame);
    dragFrame = requestAnimationFrame(()=>{
      DAILY_PCA_VIEW_DOMAIN = domain;
      renderDailyPcaScatter(container, points, availableClusters);
      dragFrame = null;
    });
  };
  const moveDrag = e=>{
    if(!drag) return;
    e.preventDefault();
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const width = drag.domain.xmax - drag.domain.xmin;
    const height = drag.domain.ymax - drag.domain.ymin;
    const shiftX = -dx / dims.innerW * width;
    const shiftY = dy / dims.innerH * height;
    const nextDomain = dailyPcaClampZoom({
      xmin: drag.domain.xmin + shiftX,
      xmax: drag.domain.xmax + shiftX,
      ymin: drag.domain.ymin + shiftY,
      ymax: drag.domain.ymax + shiftY,
    }, baseDomain);
    drag.nextDomain = nextDomain;
    drag.moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    renderDragDomain(nextDomain);
  };
  const endDrag = ()=>{
    if(!drag) return;
    if(dragFrame){
      cancelAnimationFrame(dragFrame);
      dragFrame = null;
    }
    if(drag.nextDomain){
      DAILY_PCA_VIEW_DOMAIN = dailyPcaClampZoom(drag.nextDomain, baseDomain);
    }
    if(drag.moved){
      DAILY_PCA_SUPPRESS_CLICK = true;
      setTimeout(()=>{ DAILY_PCA_SUPPRESS_CLICK = false; }, 0);
    }
    drag = null;
    document.body.classList.remove("pca-is-panning");
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    renderDailyPcaScatter(container, points, availableClusters);
  };

  svg.addEventListener("pointerdown", e=>{
    if(e.button !== 0) return;
    if(e.target?.classList?.contains("pca-point")) return;
    e.preventDefault();
    drag = {
      x:e.clientX,
      y:e.clientY,
      domain:{...(DAILY_PCA_VIEW_DOMAIN || baseDomain)},
    };
    document.body.classList.add("pca-is-panning");
    window.addEventListener("pointermove", moveDrag, {passive:false});
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  });
}

function wireDailyPcaFilters(container, points, availableClusters){
  container.querySelectorAll(".pca-filter-action").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(btn.dataset.selectAll === "clusters"){
        DAILY_PCA_CLUSTER_FILTERS = null;
      }else if(btn.dataset.selectAll === "desvios"){
        DAILY_PCA_DEVIATION_FILTERS = null;
      }
      renderDailyPcaScatter(container, points, availableClusters);
    });
  });

  container.querySelectorAll(".pca-filter-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(btn.disabled) return;
      if(btn.dataset.status !== undefined){
        const options = dailyPcaAvailableDeviationFilters(points);
        const selected = new Set(DAILY_PCA_DEVIATION_FILTERS === null
          ? options
          : resolveDailyPcaDeviationFilters(points));
        const status = btn.dataset.status;
        if(selected.has(status)){
          selected.delete(status);
        }else if(options.includes(status)){
          selected.add(status);
        }
        DAILY_PCA_DEVIATION_FILTERS = selected.size === options.length ? null : [...selected];
      }else{
        const options = dailyPcaAvailableClusterFilters(points, availableClusters);
        const selected = new Set(DAILY_PCA_CLUSTER_FILTERS === null
          ? options
          : resolveDailyPcaClusterFilters(points, availableClusters));
        const normalized = normalizeDailyPcaFilterValue(btn.dataset.filter);
        if(selected.has(normalized)){
          selected.delete(normalized);
        }else if(options.includes(normalized)){
          selected.add(normalized);
        }
        DAILY_PCA_CLUSTER_FILTERS = selected.size === options.length ? null : [...selected];
      }
      renderDailyPcaScatter(container, points, availableClusters);
    });
  });
}

function renderDailyPcaPointDetail(p, availableClusters){
  const cfg = activeDataset();
  const current = clusterValue(p.cluster);
  const options = availableClusters
    .map(c=>{
      const value = String(c);
      const selected = value === current ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>Cluster ${escapeHtml(value)}</option>`;
    })
    .join("");
  const noClusterSelected = current === "sem cluster" ? " selected" : "";
  const resetDisabled = p.manualCluster ? "" : " disabled";
  const chipText = clusterChipLabel(p.cluster);

  return `<div class="point-detail">
    <div class="point-detail-head">
      <div>
        <span class="point-kicker">${escapeHtml(cfg.entitySingular)}</span>
        <h4>${escapeHtml(p.cpe)}</h4>
      </div>
      <span class="cluster-chip" style="--cluster-color:${clusterColor(p.cluster)}">${escapeHtml(chipText)}</span>
    </div>
    <div class="point-detail-grid">
      <div><span>PC1</span><b>${nice(p.pc1,2)}</b></div>
      <div><span>PC2</span><b>${nice(p.pc2,2)}</b></div>
      <div class="point-detail-edit">
        <label for="dailyDetailCluster">Editar cluster</label>
        <select id="dailyDetailCluster" class="daily-cluster-select daily-detail-cluster-select"
            data-cpe="${escapeHtml(p.cpe)}" aria-label="Editar cluster de ${escapeHtml(p.cpe)}">
          ${options}
        </select>
        <button type="button" class="pca-edit-reset daily-detail-reset"
          data-cpe="${escapeHtml(p.cpe)}"${resetDisabled}>Repor</button>
      </div>
    </div>
  </div>`;
}

function showDailyPcaPointDetail(container, points, availableClusters, cpe){
  const idx = points.findIndex(p=>p.cpe === cpe);
  const point = points[idx];
  const detail = container.querySelector(".point-detail");
  if(idx < 0 || !point || !detail) return;

  container.querySelectorAll(".pca-point.is-selected").forEach(p=>p.classList.remove("is-selected"));
  const circle = container.querySelector(`.pca-point[data-point-index="${idx}"]`);
  if(circle) circle.classList.add("is-selected");
  detail.outerHTML = renderDailyPcaPointDetail(point, availableClusters);
  wireDailyPcaDetailEditor(container, points, availableClusters);
}

function applyDailyClusterManual(container, points, availableClusters, cpe, cluster){
  const valid = new Set(availableClusters.map(normalizeCluster));
  const point = points.find(p=>p.cpe === cpe);
  if(!point) return;

  const incoming = normalizeCluster(cluster);
  const chosen = valid.has(incoming) ? incoming : "";
  setDailyClusterOverride(cpe, chosen);
  point.manualCluster = chosen;
  point.cluster = chosen || point.baseCluster;
  renderDailyPcaScatter(container, points, availableClusters, cpe);
}

function buildAssignedClustersCsv(points, availableClusters){
  const valid = new Set(availableClusters.map(normalizeCluster));
  const rows = new Map();

  DAILY_PCA_CLUSTER_EXPORT_BASE.forEach((cluster, cpe)=>{
    const normalized = normalizeCluster(cluster);
    if(cpe && valid.has(normalized)) rows.set(cpe, normalized);
  });

  points.forEach(p=>{
    const normalized = normalizeCluster(p.cluster);
    if(p.cpe && valid.has(normalized)) rows.set(p.cpe, normalized);
  });

  Object.entries(readDailyClusterOverrides()).forEach(([cpe, cluster])=>{
    const normalized = normalizeCluster(cluster);
    if(cpe && valid.has(normalized)) rows.set(cpe, normalized);
  });

  const body = [...rows.entries()]
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([cpe, cluster])=>`${csvCell(cpe)},${csvCell(cluster)}`);
  return ["CPE,cluster", ...body].join("\r\n") + "\r\n";
}
function setClusterSaveStatus(container, text, mode="info"){
  const status = container.querySelector(".pca-save-status");
  if(!status) return;
  status.textContent = text;
  status.dataset.mode = mode;
}
async function saveAssignedClustersCsv(container, points, availableClusters){
  const btn = container.querySelector(".pca-save-clusters");
  if(btn) btn.disabled = true;
  setClusterSaveStatus(container, "A preparar CSV...", "info");

  try{
    const csv = buildAssignedClustersCsv(points, availableClusters);
    const result = await saveTextAsFile(activeDataset().pcaAssignedFilename || "clusters_atribuidos.csv", csv);
    if(result === "saved"){
      setClusterSaveStatus(container, "CSV guardado.", "ok");
    }else if(result === "download"){
      setClusterSaveStatus(container, "CSV descarregado.", "ok");
    }else{
      setClusterSaveStatus(container, "Gravacao cancelada.", "info");
    }
  }catch(e){
    console.error(e);
    setClusterSaveStatus(container, "Nao foi possivel guardar o CSV.", "error");
  }finally{
    if(btn) btn.disabled = false;
  }
}

function wireDailyPcaDetailEditor(container, points, availableClusters){
  const select = container.querySelector(".daily-detail-cluster-select");
  if(select){
    select.addEventListener("change", ()=>{
      applyDailyClusterManual(container, points, availableClusters, select.dataset.cpe, select.value);
    });
  }

  const reset = container.querySelector(".daily-detail-reset");
  if(reset){
    reset.addEventListener("click", ()=>{
      applyDailyClusterManual(container, points, availableClusters, reset.dataset.cpe, "");
    });
  }
}

function wireDailyPcaDetails(container, points, availableClusters){
  function show(circle){
    if(DAILY_PCA_SUPPRESS_CLICK) return;
    const idx = +circle.dataset.pointIndex;
    const point = points[idx];
    if(!point) return;
    showDailyPcaPointDetail(container, points, availableClusters, point.cpe);
  }

  container.querySelectorAll(".pca-point").forEach(circle=>{
    circle.addEventListener("click", ()=>show(circle));
    circle.addEventListener("keydown", e=>{
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        show(circle);
      }
    });
  });
}

function renderDailyClusterEditor(points, availableClusters){
  const editable = points
    .filter(p=>p.canEditCluster || p.manualCluster)
    .sort((a,b)=>a.cpe.localeCompare(b.cpe));
  const manualCount = countDailyClusterOverrides();

  if(!editable.length) return "";

  const options = availableClusters
    .map(c=>`<option value="${c}">Cluster ${c}</option>`)
    .join("");

  const rows = editable.map(p=>{
    const manual = p.manualCluster || "";
    const original = clusterLabel(p.baseCluster);
    return `<div class="pca-edit-row">
      <div class="pca-edit-id">
        <span>${p.cpe}</span>
        <small>original: ${original}</small>
      </div>
      <select class="daily-cluster-select" data-cpe="${p.cpe}" aria-label="Escolher cluster para ${p.cpe}">
        <option value="">sem cluster</option>
        ${options}
      </select>
      <button type="button" class="pca-edit-reset" data-cpe="${p.cpe}" ${manual ? "" : "disabled"}>Repor</button>
    </div>`.replace(`value="${manual}"`, `value="${manual}" selected`);
  }).join("");

  return `<div class="pca-cluster-editor">
    <div class="pca-editor-head">
      <h4>Atribuição manual de clusters</h4>
      <div class="pca-editor-actions">
        <span>${manualCount} alteração${manualCount===1?"":"es"} manual${manualCount===1?"":"is"}</span>
        <button type="button" class="pca-save-clusters">Guardar CSV</button>
      </div>
    </div>
    <div class="pca-edit-list">${rows}</div>
    <div class="pca-save-status" aria-live="polite"></div>
  </div>`;
}

function wireDailyClusterEditor(container, points, availableClusters){
  container.querySelectorAll(".daily-cluster-select").forEach(select=>{
    if(select.classList.contains("daily-detail-cluster-select")) return;
    select.addEventListener("change", ()=>{
      applyDailyClusterManual(container, points, availableClusters, select.dataset.cpe, select.value);
    });
  });

  container.querySelectorAll(".pca-edit-reset").forEach(btn=>{
    if(btn.classList.contains("daily-detail-reset")) return;
    btn.addEventListener("click", ()=>{
      applyDailyClusterManual(container, points, availableClusters, btn.dataset.cpe, "");
    });
  });

  const saveBtn = container.querySelector(".pca-save-clusters");
  if(saveBtn){
    saveBtn.addEventListener("click", ()=>saveAssignedClustersCsv(container, points, availableClusters));
  }
}

function emptyMsg(t){ return `<div class="empty"><p>${t}</p></div>`; }
function emptyCmd(title,sub,cmd){
  return `<div class="empty"><h4>${title}</h4><p>${sub}</p>${cmd ? `<code>${cmd}</code>` : ""}</div>`;
}

/* ════════ Renderização das secções ════════ */

function setDayStatus(mode, text){
  const box = $("#dayStatus");
  const label = $("#dayStatusText");
  if(!box || !label) return;
  box.className = `day-status ${mode}`;
  label.textContent = text;
}

function updateDayStatus(totalAlertas, alta, baixa){
  if(totalAlertas === 0){
    setDayStatus("ok", "0 alertas");
  }else if(totalAlertas <= 10){
    setDayStatus("warn", `${totalAlertas} alertas`);
  }else{
    setDayStatus("danger", `${totalAlertas} alertas`);
  }
}

function renderOntem(res, reincidencias = new Map(), sparkHistory = new Map()){
  const cfg = activeDataset();
  if(!res){
    ALERT_STATE = { rows:[], reincidencias:new Map(), sparkHistory:new Map() };
    setDayStatus("nodata", "sem dados");
    $("#ontemSub").textContent = `Não foi encontrada nenhuma análise de ${cfg.label.toLowerCase()} para este dia.`;
    $("#statCards").style.display="none";
    $("#stripWrap").innerHTML = emptyCmd(
      cfg.messages.missingAnalysisTitle,
      cfg.messages.missingAnalysisText,
      cfg.runCommand);
    $("#alertTitle").textContent = cfg.titles.alertTitle;
    $("#alertWrap").innerHTML = emptyMsg(`Sem desvios de ${cfg.label.toLowerCase()} para mostrar.`);
    return;
  }
  const rows = parseCSV(res.text).map(r=>({
    cpe:r.CPE, cluster:r.cluster, tipo:r.tipo_dia,
    hora:r.hora==="" || r.hora===undefined ? null : +r.hora,
    real:+r.consumo_real, hab:+r.consumo_habitual, std:+r.std,
    z:+r.z_score, veredicto:r.veredicto, direcao:r.direcao,
    confianca:r.confianca, ndias:+r.n_dias_tipo, threshold:+r.threshold,
  }));
  const thr = Number.isFinite(rows[0]?.threshold) ? rows[0].threshold : cfg.defaultThreshold;
  const desvios = rows.filter(r=>r.veredicto==="desvio");
  const alta = desvios.filter(r=>r.confianca==="alta");
  const baixa = desvios.filter(r=>r.confianca==="baixa");
  const normal = rows.length - desvios.length;
  const cpesAnalisados = new Set(rows.map(r=>r.cpe)).size;

  updateDayStatus(desvios.length, alta.length, baixa.length);

  const entitySingular = cfg.entitySingular;
  const entityPlural = cfg.entityPlural;

  $("#ontemSub").innerHTML =
    `Dia analisado: <b>${prettyDate(res.date)}</b> (${tipoLabel(rows[0]?.tipo)}). ` +
    `Cada ${entitySingular} é comparado com o seu próprio histórico — um desvio significa que consumiu ` +
    `de forma invulgar <b>para ele próprio</b>, não em relação aos outros ${entityPlural}.`;

  // cards
  const cards = $("#statCards"); cards.style.display="";
  setCard(cards,0,cpesAnalisados,`${rows.length} ${cfg.pointLabel}`);
  setCard(cards,1,normal, rows.length? (Math.round(normal/rows.length*100)+"% dos pontos"):"");
  setCard(cards,2,alta.length,"pontos a verificar");
  setCard(cards,3,baixa.length,"pontos com pouco histórico");

  renderStrip($("#stripWrap"), rows, thr);

  // alertas ordenados
  const ord = [...alta, ...baixa].sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));
  $("#alertTitle").textContent = desvios.length ? `${cfg.titles.alertTitle} (${desvios.length})` : cfg.titles.alertTitle;
  const wrap = $("#alertWrap");
  if(!ord.length){
    wrap.innerHTML = `<div class="allclear"><div class="big">✓ Tudo normal</div>
      <div class="small">Nenhum ${entitySingular} consumiu de forma invulgar ontem.</div></div>`;
    return;
  }
  ALERT_STATE = {
    rows: ord,
    reincidencias,
    sparkHistory
  };
  renderAlertCards();
}

let ALERT_STATE = { rows:[], reincidencias:new Map(), sparkHistory:new Map() };

function renderAlertCards(){
  const wrap = $("#alertWrap");
  const {rows, reincidencias, sparkHistory} = ALERT_STATE;
  if(!rows.length){ wrap.innerHTML = emptyMsg("Sem desvios para mostrar."); return; }

  wrap.innerHTML =
    `<div class="alert-summary">
       <span>${rows.length} ${rows.length===1 ? "desvio detetado" : "desvios detetados"}</span>
     </div>
     <div class="alert-scroll">
       ${rows.map(r=>renderAlertCard(r, reincidencias, sparkHistory)).join("")}
     </div>`;
}

function renderAlertCard(r, reincidencias, sparkHistory){
  const up = r.direcao==="acima";
  const pct = (r.real-r.hab)/Math.max(Math.abs(r.hab),0.001)*100;
  const cl = clusterLabel(r.cluster);
  const clusterChip = ACTIVE_DATASET === "energia" ? `<span class="chip">${cl}</span>` : "";
  const hourChip = r.hora===null ? "" : `<span class="chip">${String(r.hora).padStart(2,"0")}h</span>`;
  const lowc = r.confianca==="baixa" ? `<span class="chip" style="background:var(--accent-soft);color:var(--accent)">baixa confiança</span>` : "";
  const rec = reincidencias.get(r.cpe);
  const repeatChip = rec && rec.count > 0
    ? `<span class="chip repeat" title="Também esteve em alerta em ${rec.dates.map(prettyDate).join(", ")}">${rec.count + 1}ª vez esta semana</span>`
    : "";
  const spark = renderSparkline(sparkHistory.get(r.cpe) || [], up);

  return `<div class="alert ${up?"up":"down"}">
    <div class="ico">${up?"🔴":"🔵"}</div>
    <div class="body">
      <div class="r1">
        <span class="cpe">${r.cpe}</span>
        ${clusterChip}${hourChip}${lowc}${repeatChip}
      </div>
      <div class="desc">${up?"Consumiu <b>mais</b>":"Consumiu <b>menos</b>"} do que o habitual ${r.hora===null?"":"às " + String(r.hora).padStart(2,"0") + "h"}.</div>
      <div class="nums">
        <div><span class="k">Real</span><span class="v ${up?"acc-up":"acc-down"}">${valueWithUnit(r.real)}</span></div>
        <div><span class="k">Habitual</span><span class="v">${nice(r.hab)} ± ${nice(r.std)} ${unitLabel()}</span></div>
        <div><span class="k">Desvio</span><span class="v ${up?"acc-up":"acc-down"}">${pct>0?"+":""}${nice(pct,0)}%</span></div>
        <div><span class="k">z-score</span><span class="v">${r.z>0?"+":""}${nice(r.z,2)}</span></div>
        <div><span class="k">Histórico</span><span class="v">${r.ndias} obs.</span></div>
      </div>
    </div>
    <div class="spark-box">
      <div class="spark-title">últimos 7 dias</div>
      ${spark}
    </div>
  </div>`;
}

function setCard(container, idx, value, meta){
  const card = container.children[idx];
  card.querySelector(".num").textContent = (typeof value==="number") ? value.toLocaleString("pt-PT") : value;
  const m = card.querySelector(".meta");
  if(meta){ if(m){ m.textContent=meta; } else { const e=document.createElement("div"); e.className="meta"; e.textContent=meta; card.appendChild(e);} }
}

/* estado da tabela de previsão (pesquisa + ordenação) */
let PRED_STATE = { rows:[], date:null, sortKey:"prev", sortDir:-1, query:"" };

function renderAmanha(res, activeCpes){
  const cards = $("#predCards");
  if(!res){
    const cfg = activeDataset();
    $("#amanhaSub").textContent = "Ainda não há previsão gravada.";
    cards.style.display="none";
    $("#hourlyPredWrap").innerHTML = "";
    $("#topPredWrap").innerHTML = emptyCmd(
      cfg.messages.missingPredictionTitle,
      cfg.messages.missingPredictionText,
      cfg.runCommand);
    $("#allPredWrap").innerHTML = "";
    return;
  }
  let rows = parseCSV(res.text).map(r=>({cpe:r.CPE, data:r.data, tipo:r.tipo_dia,
    hora:r.hora==="" || r.hora===undefined ? null : +r.hora,
    prev:+r.previsao, std:+r.std,
    lo:+r.low_2sigma, hi:+r.high_2sigma, conf:r.confianca}));

  // Filtrar pelos CPEs ativos (os que reportaram ontem), se a lista existir
  const set = activeCpes && activeCpes.size ? activeCpes : null;
  const rowsActive = set ? rows.filter(r=>set.has(r.cpe)) : rows;

  const total = rowsActive.reduce((a,r)=>a+(r.prev||0),0);
  const totalStd = rowsActive.reduce((a,r)=>a+(r.std||0),0);
  const cpesPrevistos = new Set(rowsActive.map(r=>r.cpe)).size;
  const tipo = (rowsActive[0]||rows[0])?.tipo;

  $("#amanhaSub").innerHTML = `Estimativa para <b>${prettyDate(res.date)}</b> (${tipoLabel(tipo)}), ` +
    `com base na média histórica de cada CPE em dias do mesmo tipo.` +
    (set ? ` A mostrar os <b>${cpesPrevistos}</b> CPEs que reportaram ontem.` : "");
  cards.style.display="";
  setCard(cards,0, valueWithUnit(total,0), `± ${valueWithUnit(totalStd,0)} no total`);
  setCard(cards,1, cpesPrevistos, set? "ativos (reportaram ontem)":"previsão por contador");
  setCard(cards,2, tipoLabel(tipo), "feriados têm regra própria");

  renderHourlyProfile($("#hourlyPredWrap"), rowsActive.filter(r=>r.hora !== null));

  // Grafico top-10 (dos ativos), agregado pelo total diario previsto
  const porCpe = new Map();
  rowsActive.forEach(r=>{
    const atual = porCpe.get(r.cpe) || {cpe:r.cpe, prev:0};
    atual.prev += r.prev || 0;
    porCpe.set(r.cpe, atual);
  });
  const top = [...porCpe.values()].sort((a,b)=>b.prev-a.prev).slice(0,10);
  const max = top.length?top[0].prev:1;
  $("#topPredWrap").innerHTML = top.map(r=>`
    <div class="barrow">
      <span class="nm" title="${r.cpe}">${r.cpe.slice(-12)}</span>
      <div class="track"><div class="fill" style="width:${(r.prev/max*100).toFixed(1)}%"></div></div>
      <span class="vl">${valueWithUnit(r.prev)}</span>
    </div>`).join("") +
    `<div class="legend" style="margin-top:12px"><span style="color:var(--ink-4)">totais horários somados para ${prettyDate(res.date)}</span></div>`;

  // Tabela completa (pesquisável + ordenável)
  PRED_STATE = { rows:rowsActive, date:res.date, sortKey:"prev", sortDir:-1, query:"" };
  $("#predTableHint").textContent = set
    ? "linhas CPE/hora dos CPEs que reportaram ontem · clica nos títulos para ordenar"
    : "linhas CPE/hora previstas · clica nos títulos para ordenar";
  drawPredTable();
}

function drawPredTable(){
  const wrap = $("#allPredWrap");
  const {rows, query, sortKey, sortDir, date} = PRED_STATE;
  if(!rows.length){ wrap.innerHTML = emptyMsg("Sem CPEs para mostrar."); return; }

  const q = query.trim().toUpperCase();
  let view = q ? rows.filter(r=>r.cpe.toUpperCase().includes(q)) : rows.slice();
  view.sort((a,b)=>{
    const va=a[sortKey], vb=b[sortKey];
    if(typeof va==="string") return sortDir*va.localeCompare(vb);
    return sortDir*((va||0)-(vb||0));
  });

  const arrow = k => sortKey===k ? (sortDir<0?" ▾":" ▴") : "";
  const head = `<tr>
    <th data-k="cpe" style="cursor:pointer">CPE${arrow("cpe")}</th>
    <th data-k="hora" style="cursor:pointer">Hora${arrow("hora")}</th>
    <th data-k="prev" style="cursor:pointer">Previsto (${unitLabel()})${arrow("prev")}</th>
    <th data-k="std" style="cursor:pointer">± σ${arrow("std")}</th>
    <th>Intervalo provável (±2σ)</th>
    <th data-k="conf" style="cursor:pointer">Confiança${arrow("conf")}</th>
  </tr>`;
  const body = view.map(r=>{
    const conf = r.conf==="alta"
      ? `<span class="chip" style="background:var(--normal-soft);color:var(--normal)">alta</span>`
      : `<span class="chip" style="background:var(--accent-soft);color:var(--accent)">baixa</span>`;
    const lo = Math.max(0, r.lo);
    return `<tr>
      <td>${r.cpe}</td>
      <td>${r.hora === null ? "dia" : String(r.hora).padStart(2,"0") + "h"}</td>
      <td>${nice(r.prev)}</td>
      <td style="color:var(--ink-3)">${nice(r.std)}</td>
      <td style="color:var(--ink-3)">${nice(lo)} – ${nice(r.hi)}</td>
      <td>${conf}</td>
    </tr>`;
  }).join("");

  wrap.innerHTML =
    `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
       <input id="predSearch" type="search" placeholder="procurar CPE…" value="${query}"
         style="flex:1;min-width:200px;font-family:var(--font-mono);font-size:13px;
                padding:9px 12px;border:1px solid var(--line-2);border-radius:9px;
                background:var(--paper-2);color:var(--ink);outline:none"/>
       <span style="font-size:12.5px;color:var(--ink-4);font-weight:500">
         ${view.length} de ${rows.length} CPEs${q?` · filtro "${query}"`:""}
       </span>
     </div>
     <div class="tablewrap" style="max-height:460px;overflow-y:auto">
       <table><thead>${head}</thead><tbody>${body}</tbody></table>
     </div>
     <div class="legend" style="margin-top:12px"><span style="color:var(--ink-4)">
       o intervalo ±2σ é a margem onde o consumo real deve cair em ~95% dos dias
     </span></div>`;

  // listeners
  const inp = $("#predSearch");
  inp.addEventListener("input", e=>{
    PRED_STATE.query = e.target.value;
    const pos = e.target.selectionStart;
    drawPredTable();
    const ni = $("#predSearch"); ni.focus(); try{ni.setSelectionRange(pos,pos);}catch(_){}
  });
  wrap.querySelectorAll("th[data-k]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const k = th.getAttribute("data-k");
      if(PRED_STATE.sortKey===k){ PRED_STATE.sortDir*=-1; }
      else { PRED_STATE.sortKey=k; PRED_STATE.sortDir = (k==="cpe"||k==="conf")?1:-1; }
      drawPredTable();
    });
  });
}

function renderQualidade(res){
  if(!res){
    const cfg = activeDataset();
    $("#qualSub").textContent = "Ainda não há histórico de qualidade.";
    const msg = emptyCmd(
      cfg.messages.missingQualityTitle,
      cfg.messages.missingQualityText,
      cfg.runCommand);
    $("#errChartWrap").innerHTML = msg;
    $("#covChartWrap").innerHTML = "";
    $("#qualTableWrap").innerHTML = "";
    return;
  }
  let rows = parseCSV(res.text).map(r=>({
    data:r.data, tipo:r.tipo_dia, n:+r.n_cpes,
    mae:+r.MAE, mape:+r.MAPE, rmse:+r.RMSE,
    p1:+r.pct_em_1sigma, p2:+r.pct_em_2sigma,
  })).filter(r=>r.data).sort((a,b)=>a.data<b.data?-1:1);

  if(!rows.length){ renderQualidade(null); return; }
  const labels = rows.map(r=>r.data);
  const anyPartial = rows.some(r=>r.n<100);

  $("#qualSub").innerHTML =
    `${rows.length} ${rows.length===1?"dia validado":"dias validados"}. ` +
    `Em média, as previsões erram <b>${valueWithUnit(avg(rows,"mae"))}</b> por CPE; ` +
    `<b>${nice(avg(rows,"p2"),0)}%</b> dos consumos reais caíram dentro do intervalo previsto ` +
    `<b>(±2σ)</b> — o esperado é ~95%.`;

  // gráfico erro
  renderLines($("#errChartWrap"), labels, [
    {name:"MAE",  data:rows.map(r=>r.mae),  color:"var(--high)"},
    {name:"RMSE", data:rows.map(r=>r.rmse), color:"var(--pred)"},
  ], {y0:true, ydec:1, ysuffix:` ${unitLabel()}`});

  // gráfico cobertura
  renderLines($("#covChartWrap"), labels, [
    {name:"dentro de ±1σ", data:rows.map(r=>r.p1), color:"var(--normal)"},
    {name:"dentro de ±2σ", data:rows.map(r=>r.p2), color:"var(--low)"},
  ], {ydec:0, ysuffix:"%", clamp01:true, refs:[
    {v:68,color:"var(--normal)",label:"esperado 68%"},
    {v:95,color:"var(--low)",label:"esperado 95%"},
  ]});

  // tabela
  $("#qualTableHint").textContent = anyPartial
    ? "dias marcados têm cobertura parcial do BaZe (menos CPEs)"
    : "";
  const head = `<tr><th>Dia</th><th>Tipo</th><th>CPEs</th><th>MAE</th><th>MAPE</th><th>RMSE</th><th>em ±1σ</th><th>em ±2σ</th></tr>`;
  const body = rows.map(r=>{
    const partial = r.n<100;
    const c1 = r.p1>=60 && r.p1<=80 ? "good":"";
    const c2 = r.p2>=90 ? "good":"warn";
    return `<tr class="${partial?"partial":""}">
      <td>${prettyDate(r.data)}${partial?'<span class="badge-partial">parcial</span>':''}</td>
      <td style="text-align:left;color:var(--ink-3)">${tipoLabel(r.tipo)}</td>
      <td>${r.n}</td>
      <td>${nice(r.mae)}</td>
      <td>${nice(r.mape,1)}%</td>
      <td>${nice(r.rmse)}</td>
      <td class="${c1}">${nice(r.p1,0)}%</td>
      <td class="${c2}">${nice(r.p2,0)}%</td>
    </tr>`;
  }).join("");
  $("#qualTableWrap").innerHTML = `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function avg(rows,key){ const v=rows.map(r=>r[key]).filter(x=>!isNaN(x)); return v.reduce((a,b)=>a+b,0)/(v.length||1); }

/* ════════ Boot ════════ */
function tickClock(){
  const now=new Date();
  const dd=["dom","seg","ter","qua","qui","sex","sáb"][now.getDay()];
  $("#clock").textContent = `${dd} ${fmtDate(now)} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
}

async function loadAll(dateStr){
  const selectedDate = dateStr || $("#dayPicker").value || fmtDate(new Date());

  $("#dayPicker").value = selectedDate;

  // Retrospetiva: carrega exatamente analise_YYYY-MM-DD.csv
  const aRes = await fetchByDate(PATHS.alerts, selectedDate);

  let aRows = [];
  let alertCpes = new Set();

  if(aRes){
    try{
      aRows = parseCSV(aRes.text);
      alertCpes = new Set(
        aRows
          .filter(r=>r.veredicto === "desvio")
          .map(r=>r.CPE)
          .filter(Boolean)
      );
    }catch(e){}
  }

  const hasPrediction = activeDataset().hasPrediction;
  const comparePredictionPromise = hasPrediction && aRes
    ? fetchByDate(PATHS.predictions, selectedDate)
    : Promise.resolve(null);
  const forecastRealDaysPromise = hasPrediction && aRes
    ? fetchForecastComparisonRealDays(selectedDate, aRows)
    : Promise.resolve(aRows);
  const reincidenciasPromise = aRes ? fetchReincidencias(selectedDate) : Promise.resolve(new Map());
  const sparkHistoryPromise = aRes ? fetchSparklineHistory(selectedDate, alertCpes) : Promise.resolve(new Map());

  const [comparePredictionRes, forecastRealDays] = await Promise.all([
    comparePredictionPromise,
    forecastRealDaysPromise,
  ]);
  try{
    renderForecastComparison(forecastRealDays, comparePredictionRes, selectedDate);
  }catch(e){
    console.error(e);
    const wrap = $("#forecastCompareWrap");
    if(wrap) wrap.innerHTML = emptyMsg("Nao foi possivel desenhar a comparacao real vs previsao.");
  }

  const [reincidencias, sparkHistory] = await Promise.all([
    reincidenciasPromise,
    sparkHistoryPromise,
  ]);

  renderOntem(aRes, reincidencias, sparkHistory);
  await renderPcaDia(aRows, selectedDate);

  $("#srcAnalise").innerHTML =
    `Retrospetiva: <code>${aRes ? aRes.url : formatTemplate(PATHS.alerts, selectedDate) + " (não encontrado)"}</code>`;

  // CPEs ativos = os que aparecem na análise desse dia
  let activeCpes = null;
  if(aRows.length){
    activeCpes = new Set(aRows.map(r=>r.CPE).filter(Boolean));
  }

  if(activeDataset().hasPrediction){
    const predictionDate = addDaysStr(selectedDate, 1);
    const pRes = await fetchByDate(PATHS.predictions, predictionDate);
    renderAmanha(pRes, activeCpes);

    $("#srcPrev").innerHTML =
      `Previsão: <code>${pRes ? pRes.url : formatTemplate(PATHS.predictions, predictionDate) + " (não encontrado)"}</code>`;
  }else{
    renderAmanha(null, activeCpes);
    $("#srcPrev").innerHTML =
      `Previsão: <code>não configurada para ${activeDataset().label}</code>`;
  }
}


function showLoading(){
  setDayStatus("loading", "A carregar…");

  document.querySelectorAll(".panel-body").forEach(p=>{
    if(
      p.querySelector(".empty") ||
      p.querySelector(".alert") ||
      p.querySelector("svg") ||
      p.querySelector(".barrow") ||
      p.querySelector("table") ||
      p.querySelector(".allclear")
    ){
      p.innerHTML = '<div class="spinner"></div>';
    }
  });
}

$("#refresh").addEventListener("click", ()=>{
  DAILY_PCA_MODEL_PROMISE = null;
  showLoading();
  loadAll($("#dayPicker").value);
});

document.querySelectorAll(".dataset-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>setDataset(btn.dataset.dataset));
});

applyDatasetUI();
tickClock();
setInterval(tickClock, 30000);

buildDayCalendar();
