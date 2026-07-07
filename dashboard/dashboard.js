"use strict";

/* ════════ Configuração de caminhos (relativos à raiz servida) ════════ */
const DATASETS = {
  energia: {
    label: "Energia",
    subtitle: "CMMaia · Energia · Deteção em tempo real",
    unit: "kWh",
    hasPrediction: true,
    paths: {
      alerts:      "../results/energia/realtime/alerts/analise_energia_{d}.csv",
      predictions: "../results/energia/realtime/predictions/previsao_energia_{d}.csv",
      quality:     "../results/energia/realtime/analysis/qualidade_previsoes_energia.csv",
    }
  },
  agua: {
    label: "Água",
    subtitle: "CMMaia · Água · Deteção em tempo real",
    unit: "m³",
    hasPrediction: false,
    paths: {
      alerts:      "../results/agua/realtime/alerts/analise_agua_{d}.csv",
      predictions: [],
      quality:     [],
    }
  }
};
let ACTIVE_DATASET = "energia";
let PATHS = DATASETS[ACTIVE_DATASET].paths;
const CALENDAR_START_DATE = "2026-05-19";
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
  document.title = `Monitorização de Consumo · ${cfg.label} · CMMaia`;
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
    s += `<circle cx="${x(zc).toFixed(1)}" cy="${(midY+jit).toFixed(1)}" r="${rad}" fill="${fill}" fill-opacity="${op}">`
       + `<title>${r.cpe}${horaTxt}  ·  z=${r.z>0?"+":""}${nice(r.z,2)}  ·  ${r.veredicto}</title></circle>`;
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
     </div>` + s;
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

function emptyMsg(t){ return `<div class="empty"><p>${t}</p></div>`; }
function emptyCmd(title,sub,cmd){
  return `<div class="empty"><h4>${title}</h4><p>${sub}</p><code>${cmd}</code></div>`;
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
  if(!res){
    ALERT_STATE = { rows:[], reincidencias:new Map(), sparkHistory:new Map() };
    setDayStatus("nodata", "sem dados");
    $("#ontemSub").textContent = "Não foi encontrada nenhuma análise para este dia.";
    $("#statCards").style.display="none";
    $("#stripWrap").innerHTML = emptyCmd(
      "Sem dados de retrospetiva",
      "O programa ainda não gravou nenhuma análise, ou os ficheiros não estão acessíveis.",
      "python src/energia/realtime/detetar_anomalias.py --modo baze");
    $("#alertWrap").innerHTML = "";
    return;
  }
  const rows = parseCSV(res.text).map(r=>({
    cpe:r.CPE, cluster:r.cluster, tipo:r.tipo_dia,
    hora:r.hora==="" || r.hora===undefined ? null : +r.hora,
    real:+r.consumo_real, hab:+r.consumo_habitual, std:+r.std,
    z:+r.z_score, veredicto:r.veredicto, direcao:r.direcao,
    confianca:r.confianca, ndias:+r.n_dias_tipo, threshold:+r.threshold,
  }));
  const thr = rows.length ? rows[0].threshold : 2.0;
  const desvios = rows.filter(r=>r.veredicto==="desvio");
  const alta = desvios.filter(r=>r.confianca==="alta");
  const baixa = desvios.filter(r=>r.confianca==="baixa");
  const normal = rows.length - desvios.length;
  const cpesAnalisados = new Set(rows.map(r=>r.cpe)).size;

  updateDayStatus(desvios.length, alta.length, baixa.length);

  $("#ontemSub").innerHTML =
    `Dia analisado: <b>${prettyDate(res.date)}</b> (${tipoLabel(rows[0]?.tipo)}). ` +
    `Cada CPE é comparado com o seu próprio histórico — um desvio significa que consumiu ` +
    `de forma invulgar <b>para ele próprio</b>, não em relação aos outros.`;

  // cards
  const cards = $("#statCards"); cards.style.display="";
  setCard(cards,0,cpesAnalisados,`${rows.length} pontos CPE/hora`);
  setCard(cards,1,normal, rows.length? (Math.round(normal/rows.length*100)+"% dos pontos"):"");
  setCard(cards,2,alta.length,"pontos a verificar");
  setCard(cards,3,baixa.length,"pontos com pouco histórico");

  renderStrip($("#stripWrap"), rows, thr);

  // alertas ordenados
  const ord = [...alta, ...baixa].sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));
  $("#alertTitle").textContent = desvios.length ? `Desvios detetados (${desvios.length})` : "Desvios detetados";
  const wrap = $("#alertWrap");
  if(!ord.length){
    wrap.innerHTML = `<div class="allclear"><div class="big">✓ Tudo normal</div>
      <div class="small">Nenhum CPE consumiu de forma invulgar ontem.</div></div>`;
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
        <span class="chip">${cl}</span>${hourChip}${lowc}${repeatChip}
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
    $("#amanhaSub").textContent = "Ainda não há previsão gravada.";
    cards.style.display="none";
    $("#hourlyPredWrap").innerHTML = "";
    $("#topPredWrap").innerHTML = emptyCmd(
      "Sem previsão disponível",
      "A previsão do próximo dia é gerada pelo programa de deteção.",
      "python src/energia/realtime/detetar_anomalias.py --modo baze");
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
    $("#qualSub").textContent = "Ainda não há histórico de qualidade.";
    const msg = emptyCmd("Sem validações ainda",
      "A validação preenche-se sozinha: cada dia, o programa compara as previsões anteriores com o consumo real que entretanto chegou. Volta aqui depois de alguns dias.",
      "python src/energia/realtime/detetar_anomalias.py --modo baze");
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
