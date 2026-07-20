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
      pcaCoords:   "../results/energia/clustering/pca_clusters_cpe.csv"
    }
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
      alerts:      "../results/agua/realtime/alerts/analise_agua_{d}.csv"
    }
  }
};
let ACTIVE_DATASET = "energia";
let PATHS = DATASETS[ACTIVE_DATASET].paths;
const CALENDAR_START_DATE = "2026-05-01"; // data a partir da qual há análises disponíveis
const REINCIDENCIA_DIAS = 6; // dias anteriores a verificar para reincidência
const SPARKLINE_DIAS = 6; // 6 dias anteriores + dia escolhido = 7 dias

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

let DAILY_PCA_MODEL_PROMISE = null;
const DAILY_CLUSTER_STORAGE_KEY = "energia_daily_pca_manual_clusters_v1";
const DAILY_CLUSTER_COLORS = {
  "0":"#4C97D4",
  "1":"#F5A623",
  "2":"#4CAF50",
  "outlier":"#7F8C8D",
  "sem cluster":"#8A94A1",
};

function readDailyClusterOverrides(){
  try{
    return JSON.parse(localStorage.getItem(DAILY_CLUSTER_STORAGE_KEY) || "{}");
  }catch(e){
    return {};
  }
}
function writeDailyClusterOverrides(overrides){
  localStorage.setItem(DAILY_CLUSTER_STORAGE_KEY, JSON.stringify(overrides));
}
function setDailyClusterOverride(cpe, cluster){
  const overrides = readDailyClusterOverrides();
  if(cluster){
    overrides[cpe] = String(cluster);
  }else{
    delete overrides[cpe];
  }
  writeDailyClusterOverrides(overrides);
}
function clusterLabel(cluster){
  if(cluster === "sem cluster") return "sem cluster";
  if(cluster === "outlier") return "outlier";
  return `Cluster ${cluster}`;
}
function clusterValue(cluster){
  const value = String(cluster ?? "");
  return value && value !== "sem cluster" && value.toLowerCase() !== "nan"
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
    const cfg = DATASETS.energia;
    const [featuresRes, clustersRes, coordsRes] = await Promise.all([
      fetchFixed(cfg.paths.pcaFeatures),
      fetchFixed(cfg.paths.pcaClusters),
      fetchFixed(cfg.paths.pcaCoords),
    ]);
    if(!featuresRes || !clustersRes) return null;

    const clusters = new Map();
    parseCSV(clustersRes.text).forEach(r=>{
      if(r.CPE) clusters.set(r.CPE, r.cluster || "");
    });
    const availableClusters = [...new Set([...clusters.values()]
      .filter(c=>c && c !== "outlier")
      .map(c=>String(c)))]
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
        cluster: clusters.get(r.CPE) || "",
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

    return {mean, pc1, pc2, clusters, availableClusters};
  })();

  return DAILY_PCA_MODEL_PROMISE;
}
function buildDailyProfiles(rows, clusterMap, overrides, availableClusters){
  const byCpe = new Map();
  const validClusters = new Set(availableClusters.map(String));
  rows.forEach(r=>{
    const cpe = r.CPE;
    const hora = +r.hora;
    const real = +r.consumo_real;
    if(!cpe || !Number.isInteger(hora) || hora < 0 || hora > 23 || !Number.isFinite(real)) return;
    const rowCluster = r.cluster && String(r.cluster).toLowerCase() !== "nan" ? String(r.cluster) : "";
    const mapCluster = clusterMap.get(cpe) || "";
    const rawCluster = rowCluster || mapCluster || "";
    const baseCluster = rawCluster && String(rawCluster).toLowerCase() !== "nan"
      ? String(rawCluster)
      : "sem cluster";
    const manualCluster = validClusters.has(String(overrides[cpe])) ? String(overrides[cpe]) : "";
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
      cluster: r.cluster || "sem cluster",
      baseCluster: r.baseCluster,
      manualCluster: r.manualCluster,
      canEditCluster: r.canEditCluster,
    }));
}
async function renderPcaDia(rows, dateStr){
  const wrap = $("#dailyPcaWrap");
  const sub = $("#pcaDiaSub");
  if(!wrap || !sub) return;

  if(ACTIVE_DATASET !== "energia"){
    wrap.innerHTML = "";
    return;
  }
  if(!rows || !rows.length){
    sub.textContent = "Sem analise de energia para projetar neste dia.";
    wrap.innerHTML = emptyMsg("Sem dados suficientes para PCA diario.");
    return;
  }

  wrap.innerHTML = '<div class="spinner"></div>';
  const model = await loadDailyPcaModel();
  if(ACTIVE_DATASET !== "energia") return;
  if(!model){
    sub.textContent = "Nao foi possivel carregar os ficheiros de PCA.";
    wrap.innerHTML = emptyMsg("Faltam os ficheiros de features ou clusters.");
    return;
  }

  const profiles = buildDailyProfiles(
    rows,
    model.clusters,
    readDailyClusterOverrides(),
    model.availableClusters,
  );
  if(profiles.length < 3){
    sub.textContent = "Sem CPEs suficientes com perfil horario completo para este dia.";
    wrap.innerHTML = emptyMsg("Sem dados suficientes para PCA diario.");
    return;
  }

  const points = profiles.map(p=>({
    ...p,
    ...projectVector(p.perfil, model),
  }));

  const withDeviation = points.filter(p=>p.desvios > 0).length;
  sub.innerHTML =
    `Dia analisado: <b>${prettyDate(dateStr)}</b>. ` +
    `${points.length} CPEs projetados; ${withDeviation} com pelo menos um desvio no dia.`;
  renderDailyPcaScatter(wrap, points, model.availableClusters);
}
function renderDailyPcaScatter(container, points, availableClusters, selectedCpe=null){
  const W=920, H=360, padL=56, padR=24, padT=28, padB=50;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  const colors = DAILY_CLUSTER_COLORS;
  const xs = points.map(p=>p.pc1), ys = points.map(p=>p.pc2);
  let xmin=Math.min(...xs), xmax=Math.max(...xs), ymin=Math.min(...ys), ymax=Math.max(...ys);
  if(xmin===xmax){ xmin-=1; xmax+=1; }
  if(ymin===ymax){ ymin-=1; ymax+=1; }
  const padx=(xmax-xmin)*0.12, pady=(ymax-ymin)*0.16;
  xmin-=padx; xmax+=padx; ymin-=pady; ymax+=pady;
  const X = v => padL + (v-xmin)/(xmax-xmin)*innerW;
  const Y = v => padT + (1-(v-ymin)/(ymax-ymin))*innerH;
  const tickVals = (min,max,n=5)=>Array.from({length:n},(_,i)=>min+i/(n-1)*(max-min));

  let s = svgEl(W,H);
  tickVals(xmin,xmax).forEach(v=>{
    const x=X(v);
    s += `<line class="grid-line" x1="${x}" y1="${padT}" x2="${x}" y2="${padT+innerH}"/>`;
    s += `<text x="${x}" y="${H-padB+22}" font-size="10.5" text-anchor="middle">${nice(v,1)}</text>`;
  });
  tickVals(ymin,ymax).forEach(v=>{
    const y=Y(v);
    s += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${padL+innerW}" y2="${y}"/>`;
    s += `<text x="${padL-10}" y="${y+4}" font-size="10.5" text-anchor="end">${nice(v,1)}</text>`;
  });
  if(xmin < 0 && xmax > 0){
    s += `<line x1="${X(0)}" y1="${padT}" x2="${X(0)}" y2="${padT+innerH}" stroke="var(--ink-3)" stroke-width="1.2" opacity=".55"/>`;
  }
  if(ymin < 0 && ymax > 0){
    s += `<line x1="${padL}" y1="${Y(0)}" x2="${padL+innerW}" y2="${Y(0)}" stroke="var(--ink-3)" stroke-width="1.2" opacity=".55"/>`;
  }

  points
    .map((p,i)=>({p,i}))
    .sort((a,b)=>a.p.desvios-b.p.desvios)
    .forEach(({p,i})=>{
      const fill = colors[p.cluster] || colors["sem cluster"];
      const hasDeviation = p.desvios > 0;
      const stroke = hasDeviation ? "var(--high)" : "#FFFFFF";
      const strokeW = hasDeviation ? 2.4 : 1.2;
      const radius = 5;
      const conf = p.baixa && p.baixa === p.desvios ? "baixa confianca" : "alta/normal";
      s += `<circle class="pca-point clickable-point" data-point-index="${i}" tabindex="0"
              cx="${X(p.pc1).toFixed(1)}" cy="${Y(p.pc2).toFixed(1)}" r="${radius.toFixed(1)}"
              fill="${fill}" fill-opacity=".86" stroke="${stroke}" stroke-width="${strokeW}">
              <title>${escapeHtml(p.cpe)} · ${clusterLabel(p.cluster)} · ${p.hours}h · ${p.desvios} desvios · z max ${p.maxZ>=0?"+":""}${nice(p.maxZ,2)} · ${conf}</title>
            </circle>`;
    });
  s += `<text x="${padL+innerW/2}" y="${H-10}" font-size="11" text-anchor="middle">PC1</text>`;
  s += `<text x="16" y="${padT+innerH/2}" font-size="11" text-anchor="middle" transform="rotate(-90 16 ${padT+innerH/2})">PC2</text>`;
  s += `</svg>`;

  const clusters = [...new Set(points.map(p=>p.cluster))].sort((a,b)=>String(a).localeCompare(String(b), "pt", {numeric:true}));
  const legendClusters = clusters.map(c=>
    `<span><i style="background:${colors[c] || colors["sem cluster"]}"></i>${clusterLabel(c)}</span>`
  ).join("");
  const legend = `<div class="legend pca-legend">
      ${legendClusters}
      <span><i class="outline-dot"></i>com desvio no dia</span>
    </div>`;
  container.innerHTML = legend + s +
    `<div class="point-detail muted-detail">Clica num ponto para ver o detalhe do CPE.</div>` +
    renderDailyClusterEditor(points, availableClusters);
  wireDailyPcaDetails(container, points, availableClusters);
  wireDailyClusterEditor(container, points, availableClusters);
  if(selectedCpe){
    showDailyPcaPointDetail(container, points, availableClusters, selectedCpe);
  }
}

function renderDailyPcaPointDetail(p, availableClusters){
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
        <span class="point-kicker">CPE</span>
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
  const valid = new Set(availableClusters.map(String));
  const point = points.find(p=>p.cpe === cpe);
  if(!point) return;

  const chosen = valid.has(String(cluster)) ? String(cluster) : "";
  setDailyClusterOverride(cpe, chosen);
  point.manualCluster = chosen;
  point.cluster = chosen || point.baseCluster;
  renderDailyPcaScatter(container, points, availableClusters, cpe);
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
      <span>${editable.length} CPE${editable.length===1?"":"s"} sem cluster normal</span>
    </div>
    <div class="pca-edit-list">${rows}</div>
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
  const cl = (r.cluster && r.cluster!=="" && r.cluster.toLowerCase()!=="nan") ? `Cluster ${r.cluster}` : "sem cluster";
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

  const reincidencias = aRes ? await fetchReincidencias(selectedDate) : new Map();
  const sparkHistory = aRes ? await fetchSparklineHistory(selectedDate, alertCpes) : new Map();

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
