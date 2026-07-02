#!/usr/bin/env python3
"""
detetar_anomalias.py — Monitorização diária do consumo energético (CMMaia).

Responde a três perguntas, por esta ordem:
  1. RETROSPETIVA  — "Como foi ontem?"  (deteta desvios via z-score)
  2. PREDIÇÃO     — "O que esperar amanhã?"  (média histórica + ±1σ/±2σ)
  3. VALIDAÇÃO    — "Quão boas foram as previsões anteriores?"  (MAE/RMSE/cobertura)
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
import warnings
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import holidays
import numpy as np
import pandas as pd

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from config.paths import (
    RESULTS_DIR, CLUSTERING_DIR, REALTIME_DIR, ALERTS_DIR, PLOTS_DIR,
    LOGS_DIR, PREDICTIONS_DIR, ANALYSIS_DIR, CLUSTERS_PATH, ZIP_FALLBACK_PATH,
)
from data.baze_loader import carregar_ontem, CPES_CONFIG

warnings.filterwarnings("ignore")


# Parâmetros
THRESHOLD_POR_TIPO = {
    "dia_util"  : 2.0,
    "fim_semana": 2.5,
    "feriado"   : 3.0,
}
MIN_HIST_IDEAL       = 10    # dias do mesmo tipo para confiança "alta"
MIN_HIST_ABSOLUTO    = 2     # mínimo absoluto para usar o CPE/hora
Z_CAP                = 10.0  # limite de |z|
STD_MIN_FRAC         = 0.10  # std mínimo = 10% do habitual
STD_ABSOLUTO         = 0.3   # piso absoluto para evitar div/0
BASELINE_WINDOW_DAYS = 60    # janela móvel para captar sazonalidade
MIN_HORAS_DIA_COMPLETO = 18  # evita escolher dias ainda quase vazios


class Cor:
    RESET, NEGRITO, DIM = "\033[0m", "\033[1m", "\033[2m"
    VERMELHO, VERDE, AMARELO = "\033[91m", "\033[92m", "\033[93m"
    AZUL, CIANO, ROXO, CINZENTO = "\033[94m", "\033[96m", "\033[95m", "\033[90m"


# DATACLASSES

@dataclass
class Parametros:
    data_alvo:         Optional[date]
    modo_dados:        str  = "baze"
    gerar_plots:       bool = False
    quiet:             bool = False
    so_alta_confianca: bool = False
    sem_predicao:      bool = False
    sem_validacao:     bool = False


@dataclass
class ResultadoCPE:
    cpe:              str
    data:             date
    hora:             int
    cluster:          Optional[int]
    tipo_dia:         str
    consumo_real:     float
    consumo_esperado: float
    std_esperado:     float
    z_score:          float
    z_real:           float
    veredicto:        str
    direcao:          str
    n_dias_tipo:      int
    confianca:        str
    fonte_baseline:   str
    threshold:        float


@dataclass
class Previsao:
    cpe:            str
    data:           date
    hora:           int
    tipo_dia:       str
    previsao:       float
    std:            float
    low_1sigma:     float
    high_1sigma:    float
    low_2sigma:     float
    high_2sigma:    float
    n_dias:         int
    confianca:      str
    fonte_baseline: str


# LOGGING

def configurar_logging(quiet: bool = False) -> logging.Logger:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / f"deteccao_{datetime.now():%Y%m%d}.log"

    logger = logging.getLogger("detetar_anomalias")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))
    fh.setLevel(logging.DEBUG)
    logger.addHandler(fh)

    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter("%(message)s"))
    ch.setLevel(logging.WARNING if quiet else logging.INFO)
    logger.addHandler(ch)

    return logger


# CARREGAMENTO DE DADOS

def carregar_dados_baze(logger: logging.Logger) -> pd.DataFrame:
    logger.info(f"{Cor.CIANO}→ A pedir dados ao BaZe "
                f"({len(CPES_CONFIG)} CPEs)...{Cor.RESET}")
    df = carregar_ontem(CPES_CONFIG, usar_cache=False)

    if df.empty:
        logger.error(f"{Cor.VERMELHO}Sem dados retornados pelo BaZe.{Cor.RESET}")
        logger.error("       Verifica a ligação à rede da CMMaia.")
        sys.exit(3)
    return df


def agregar_para_hora(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["tstamp"] = pd.to_datetime(df["tstamp"])
    df["data"] = df["tstamp"].dt.date
    df["hora"] = df["tstamp"].dt.hour

    df_hora = (
        df.groupby(["CPE", "data", "hora"], as_index=False)
        .agg(
            PotActiva=("PotActiva", "sum"),
            n_registos=("PotActiva", "size"),
        )
    )
    df_hora["tstamp"] = (
        pd.to_datetime(df_hora["data"].astype(str))
        + pd.to_timedelta(df_hora["hora"], unit="h")
    )
    return df_hora


def carregar_dados_zip(logger: logging.Logger) -> pd.DataFrame:
    if not ZIP_FALLBACK_PATH.exists():
        logger.error(f"{Cor.VERMELHO}ZIP não encontrado: "
                     f"{ZIP_FALLBACK_PATH}{Cor.RESET}")
        sys.exit(2)

    logger.info(f"{Cor.CIANO}→ A ler ZIP histórico...{Cor.RESET}")
    with zipfile.ZipFile(ZIP_FALLBACK_PATH) as z:
        with z.open(z.namelist()[0]) as f:
            df = pd.read_csv(f)

    return agregar_para_hora(df)


def carregar_dados(modo: str, logger: logging.Logger) -> pd.DataFrame:
    df = carregar_dados_baze(logger) if modo == "baze" \
         else carregar_dados_zip(logger)

    if "PotActiva" not in df.columns:
        logger.error(f"{Cor.VERMELHO}Coluna 'PotActiva' não encontrada nos "
                     f"dados. Colunas: {list(df.columns)}{Cor.RESET}")
        sys.exit(2)

    df = agregar_para_hora(df)
    return df.sort_values(["CPE", "data", "hora"]).reset_index(drop=True)


def carregar_clusters(logger: logging.Logger) -> dict:
    if not CLUSTERS_PATH.exists():
        logger.info(f"  {Cor.AMARELO}Sem ficheiro de clusters — "
                    f"análise sem essa informação de contexto.{Cor.RESET}")
        return {}

    clusters = pd.read_csv(CLUSTERS_PATH, index_col=0)
    clusters = clusters[clusters["cluster"] != "outlier"].copy()
    clusters["cluster"] = clusters["cluster"].astype(int)
    return clusters["cluster"].to_dict()


# CLASSIFICAÇÃO DE TIPO DE DIA

class ClassificadorDia:
    def __init__(self, anos):
        self.feriados = holidays.Portugal(years=anos)

    def __call__(self, d) -> str:
        if d in self.feriados:
            return "feriado"
        if pd.Timestamp(d).dayofweek >= 5:
            return "fim_semana"
        return "dia_util"

    def nome_feriado(self, d) -> Optional[str]:
        return self.feriados.get(d)


def escolher_data_alvo(df: pd.DataFrame) -> date:
    horas_por_dia = df.groupby("data")["hora"].nunique().sort_index()
    dias_completos = horas_por_dia[horas_por_dia >= MIN_HORAS_DIA_COMPLETO]
    if not dias_completos.empty:
        return dias_completos.index[-1]
    return max(df["data"].unique())


# ANÁLISE — baseline por CPE com janela móvel

def analisar_cpe(
    cpe: str,
    data_alvo: date,
    hora: int,
    tipo_dia: str,
    df_cpe: pd.DataFrame,
    cluster_id: Optional[int],
) -> Optional[ResultadoCPE]:
    consumo_hora = df_cpe[
        (df_cpe["data"] == data_alvo)
        & (df_cpe["hora"] == hora)
    ]["PotActiva"]
    if consumo_hora.empty:
        return None
    consumo_real = float(consumo_hora.iloc[0])

    threshold = THRESHOLD_POR_TIPO[tipo_dia]
    janela_inicio = data_alvo - timedelta(days=BASELINE_WINDOW_DAYS)

    df_hist_tipo = df_cpe[
        (df_cpe["data"] != data_alvo)
        & (df_cpe["hora"] == hora)
        & (df_cpe["tipo_dia"] == tipo_dia)
        & (df_cpe["data"] >= janela_inicio)
    ]
    n_dias_tipo = len(df_hist_tipo)

    if n_dias_tipo >= MIN_HIST_IDEAL:
        df_hist = df_hist_tipo
        confianca = "alta"
        fonte_baseline = f"histórico {tipo_dia}"
    elif n_dias_tipo >= MIN_HIST_ABSOLUTO:
        df_hist = df_hist_tipo
        confianca = "baixa"
        fonte_baseline = f"histórico {tipo_dia} (poucos dados)"
    else:
        # Fallback: histórico recente do CPE (sem filtrar por tipo de dia)
        df_hist = df_cpe[
            (df_cpe["data"] != data_alvo)
            & (df_cpe["hora"] == hora)
            & (df_cpe["data"] >= janela_inicio)
        ]
        if len(df_hist) < MIN_HIST_ABSOLUTO:
            return None
        confianca = "baixa"
        fonte_baseline = f"fallback ({BASELINE_WINDOW_DAYS}d recentes)"

    n_hist_usado = len(df_hist)
    media = float(df_hist["PotActiva"].mean())
    std   = float(df_hist["PotActiva"].std())
    if pd.isna(std):
        std = 0.0
    std = max(std, abs(media) * STD_MIN_FRAC, STD_ABSOLUTO)

    z        = (consumo_real - media) / std
    z_capped = float(np.clip(z, -Z_CAP, Z_CAP))

    veredicto = "desvio" if abs(z_capped) > threshold else "normal"
    direcao   = "acima" if z_capped > 0 else "abaixo"

    return ResultadoCPE(
        cpe=cpe, data=data_alvo, hora=hora,
        cluster=cluster_id, tipo_dia=tipo_dia,
        consumo_real=round(consumo_real, 2),
        consumo_esperado=round(media, 2),
        std_esperado=round(std, 2),
        z_score=round(z_capped, 2),
        z_real=round(z, 2),
        veredicto=veredicto, direcao=direcao,
        n_dias_tipo=n_hist_usado,
        confianca=confianca,
        fonte_baseline=fonte_baseline,
        threshold=threshold,
    )


# PREDIÇÃO — projeção do baseline para o dia seguinte

def prever_cpe(
    cpe: str,
    data_prever: date,
    hora: int,
    tipo_dia: str,
    df_cpe: pd.DataFrame,
) -> Optional[Previsao]:
    df_cpe = df_cpe[
        (df_cpe["data"] != data_prever)
        & (df_cpe["hora"] == hora)
    ]
    if df_cpe.empty:
        return None

    janela_inicio = data_prever - timedelta(days=BASELINE_WINDOW_DAYS)
    df_cpe = df_cpe[df_cpe["data"] >= janela_inicio]
    if df_cpe.empty:
        return None

    df_hist_tipo = df_cpe[df_cpe["tipo_dia"] == tipo_dia]
    n_tipo = len(df_hist_tipo)

    if n_tipo >= MIN_HIST_IDEAL:
        df_hist = df_hist_tipo
        confianca = "alta"
        fonte = f"histórico {tipo_dia}"
    elif n_tipo >= MIN_HIST_ABSOLUTO:
        df_hist = df_hist_tipo
        confianca = "baixa"
        fonte = f"histórico {tipo_dia} (poucos dados)"
    else:
        df_hist = df_cpe
        if len(df_hist) < MIN_HIST_ABSOLUTO:
            return None
        confianca = "baixa"
        fonte = "fallback (todo histórico)"

    media = float(df_hist["PotActiva"].mean())
    std   = float(df_hist["PotActiva"].std())
    if pd.isna(std):
        std = 0.0
    std = max(std, abs(media) * STD_MIN_FRAC, STD_ABSOLUTO)

    return Previsao(
        cpe=cpe, data=data_prever, hora=hora, tipo_dia=tipo_dia,
        previsao=round(media, 2),
        std=round(std, 2),
        low_1sigma=round(media - std, 2),
        high_1sigma=round(media + std, 2),
        low_2sigma=round(media - 2 * std, 2),
        high_2sigma=round(media + 2 * std, 2),
        n_dias=len(df_hist),
        confianca=confianca,
        fonte_baseline=fonte,
    )


# OUTPUT — RETROSPETIVA

def imprimir_cabecalho(
    params: Parametros, tipo_dia: str, nome_feriado: Optional[str],
    n_cpes: int, logger: logging.Logger
):
    tipo_str = tipo_dia.replace("_", " ")
    if nome_feriado:
        tipo_str += f" ({nome_feriado})"
    threshold = THRESHOLD_POR_TIPO[tipo_dia]

    largura = 70
    logger.info("")
    logger.info(f"{Cor.NEGRITO}{'═' * largura}{Cor.RESET}")
    logger.info(f"{Cor.NEGRITO}  DETEÇÃO DE ANOMALIAS — {params.data_alvo}{Cor.RESET}")
    logger.info(f"{Cor.NEGRITO}{'═' * largura}{Cor.RESET}")
    logger.info(f"  {Cor.DIM}Tipo de dia:{Cor.RESET}  {tipo_str}")
    logger.info(f"  {Cor.DIM}Fonte:{Cor.RESET}        {params.modo_dados.upper()}")
    logger.info(f"  {Cor.DIM}CPEs c/ dados:{Cor.RESET} {n_cpes}")
    logger.info(f"  {Cor.DIM}Threshold:{Cor.RESET}    |z| > {threshold} "
                f"{Cor.DIM}(adaptativo a este tipo de dia){Cor.RESET}")
    logger.info("")


def imprimir_resumo(
    n_normal: int, n_desvio_alta: int, n_desvio_baixa: int,
    n_sem_hist: int, elapsed: float, logger: logging.Logger
):
    total = n_normal + n_desvio_alta + n_desvio_baixa

    logger.info(f"{Cor.NEGRITO}─── Resumo ─────────────────────────────────────{Cor.RESET}")
    logger.info(f"  {Cor.VERDE}● Normal{Cor.RESET}                "
                f"{n_normal:4d} {Cor.DIM}({n_normal / max(total, 1) * 100:5.1f}%){Cor.RESET}")
    logger.info(f"  {Cor.VERMELHO}● Desvio (alta confiança){Cor.RESET} "
                f"{n_desvio_alta:4d} {Cor.DIM}({n_desvio_alta / max(total, 1) * 100:5.1f}%){Cor.RESET}")
    logger.info(f"  {Cor.AMARELO}● Desvio (baixa confiança){Cor.RESET} "
                f"{n_desvio_baixa:3d} {Cor.DIM}({n_desvio_baixa / max(total, 1) * 100:5.1f}%){Cor.RESET}")
    if n_sem_hist > 0:
        logger.info(f"  {Cor.CINZENTO}● Sem histórico suficiente{Cor.RESET} "
                    f"{n_sem_hist:3d}")
    logger.info(f"  {Cor.DIM}Tempo: {elapsed:.1f}s{Cor.RESET}")
    logger.info("")


def _imprimir_bloco_desvio(r: ResultadoCPE, logger: logging.Logger):
    if r.direcao == "acima":
        icone, cor = "🔴", Cor.VERMELHO
        desc = f"consumiu MAIS que o habitual às {r.hora:02d}h"
    else:
        icone, cor = "🔵", Cor.AZUL
        desc = f"consumiu MENOS que o habitual às {r.hora:02d}h"

    pct = ((r.consumo_real - r.consumo_esperado)
           / max(abs(r.consumo_esperado), 0.001) * 100)
    cluster_str = f"Cluster {r.cluster}" if r.cluster is not None else "sem cluster"
    z_str = f"{r.z_score:+.2f}" + ("⁺" if abs(r.z_real) > Z_CAP else "")

    logger.info(
        f"  {icone} {cor}{Cor.NEGRITO}{r.cpe}{Cor.RESET}"
        f"  {Cor.DIM}[{cluster_str}]{Cor.RESET}"
    )
    logger.info(f"     {desc}")
    logger.info(
        f"     {Cor.DIM}Real:{Cor.RESET} {r.consumo_real:.1f} kWh   "
        f"{Cor.DIM}Habitual:{Cor.RESET} {r.consumo_esperado:.1f} "
        f"± {r.std_esperado:.1f} kWh   "
        f"{Cor.DIM}z:{Cor.RESET} {z_str}   "
        f"{Cor.DIM}desvio:{Cor.RESET} {pct:+.0f}%   "
        f"{Cor.DIM}({r.n_dias_tipo} obs. {r.tipo_dia}){Cor.RESET}"
    )
    logger.info("")


def imprimir_alertas(
    alertas: list[ResultadoCPE], logger: logging.Logger,
    so_alta_confianca: bool
):
    alta  = sorted([a for a in alertas if a.confianca == "alta"],
                   key=lambda r: -abs(r.z_score))
    baixa = sorted([a for a in alertas if a.confianca == "baixa"],
                   key=lambda r: -abs(r.z_score))

    if not alta and not baixa:
        logger.info(f"{Cor.VERDE}{Cor.NEGRITO}  ✓ Tudo normal — "
                    f"sem desvios hoje.{Cor.RESET}")
        logger.info("")
        return

    if alta:
        logger.info(f"{Cor.NEGRITO}─── Desvios de ALTA confiança "
                    f"({len(alta)}) ───────────────────{Cor.RESET}")
        logger.info("")
        for r in alta:
            _imprimir_bloco_desvio(r, logger)

    if baixa and not so_alta_confianca:
        logger.info(f"{Cor.NEGRITO}{Cor.AMARELO}─── Desvios de BAIXA confiança "
                    f"({len(baixa)}) ──────────────{Cor.RESET}")
        logger.info(f"  {Cor.DIM}(poucos dados históricos — verificar manualmente){Cor.RESET}")
        logger.info("")
        for r in baixa:
            _imprimir_bloco_desvio(r, logger)
    elif baixa and so_alta_confianca:
        logger.info(f"  {Cor.DIM}(+ {len(baixa)} desvios de baixa confiança "
                    f"omitidos por --so-alta-confianca){Cor.RESET}")
        logger.info("")


# OUTPUT — PREDIÇÃO

def imprimir_resumo_predicao(
    previsoes: list[Previsao], data_prever: date, tipo_prever: str,
    nome_feriado: Optional[str], logger: logging.Logger
):
    largura = 70
    tipo_str = tipo_prever.replace("_", " ")
    if nome_feriado:
        tipo_str += f" ({nome_feriado})"

    logger.info(f"{Cor.NEGRITO}{'═' * largura}{Cor.RESET}")
    logger.info(f"{Cor.NEGRITO}  PREDIÇÃO — {data_prever} {Cor.RESET}"
                f"{Cor.DIM}({tipo_str}){Cor.RESET}")
    logger.info(f"{Cor.NEGRITO}{'═' * largura}{Cor.RESET}")

    if not previsoes:
        logger.info(f"  {Cor.AMARELO}Sem CPEs com histórico suficiente "
                    f"para prever.{Cor.RESET}")
        logger.info("")
        return

    n_alta  = sum(1 for p in previsoes if p.confianca == "alta")
    n_baixa = sum(1 for p in previsoes if p.confianca == "baixa")
    n_cpes = len({p.cpe for p in previsoes})
    total_prev = sum(p.previsao for p in previsoes)
    total_std  = sum(p.std for p in previsoes)

    logger.info(f"  {Cor.ROXO}● CPEs previstos{Cor.RESET}        {n_cpes:4d} "
                f"{Cor.DIM}(alta: {n_alta}, baixa: {n_baixa}){Cor.RESET}")
    logger.info(f"  {Cor.ROXO}● Consumo total previsto{Cor.RESET} "
                f"{total_prev:7.1f} kWh {Cor.DIM}(±{total_std:.1f}){Cor.RESET}")
    logger.info("")


def exportar_previsoes(
    previsoes: list[Previsao], data_prever: date, logger: logging.Logger
) -> Optional[Path]:
    if not previsoes:
        return None

    rows = [{
        "CPE"            : p.cpe,
        "data"           : p.data,
        "hora"           : p.hora,
        "tipo_dia"       : p.tipo_dia,
        "previsao"       : p.previsao,
        "std"            : p.std,
        "low_1sigma"     : p.low_1sigma,
        "high_1sigma"    : p.high_1sigma,
        "low_2sigma"     : p.low_2sigma,
        "high_2sigma"    : p.high_2sigma,
        "n_dias"         : p.n_dias,
        "confianca"      : p.confianca,
        "fonte_baseline" : p.fonte_baseline,
    } for p in previsoes]

    df = pd.DataFrame(rows)
    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    out = PREDICTIONS_DIR / f"previsao_{data_prever}.csv"
    df.to_csv(out, index=False)
    logger.info(f"  {Cor.DIM}Previsão guardada:{Cor.RESET} {out}")
    logger.info("")
    return out


# VALIDAÇÃO — confronta previsões passadas com o consumo real

def validar_previsoes(
    df: pd.DataFrame, logger: logging.Logger
) -> Optional[pd.DataFrame]:
    largura = 70
    logger.info(f"{Cor.NEGRITO}{'═' * largura}{Cor.RESET}")
    logger.info(f"{Cor.NEGRITO}  VALIDAÇÃO — qualidade das previsões anteriores{Cor.RESET}")
    logger.info(f"{Cor.NEGRITO}{'═' * largura}{Cor.RESET}")

    if not PREDICTIONS_DIR.exists():
        logger.info(f"  {Cor.DIM}Ainda não há previsões para validar.{Cor.RESET}")
        logger.info("")
        return None

    ficheiros = sorted(PREDICTIONS_DIR.glob("previsao_*.csv"))
    if not ficheiros:
        logger.info(f"  {Cor.DIM}Ainda não há previsões para validar.{Cor.RESET}")
        logger.info("")
        return None

    validacoes = []
    n_pendentes = 0

    for f in ficheiros:
        try:
            data_prevista = date.fromisoformat(f.stem.replace("previsao_", ""))
        except ValueError:
            continue

        reais = df[df["data"] == data_prevista]
        if reais.empty:
            n_pendentes += 1
            continue

        try:
            df_p = pd.read_csv(f)
        except Exception:
            continue

        cols_necessarias = {"CPE", "previsao", "low_1sigma", "high_1sigma",
                            "low_2sigma", "high_2sigma"}
        if not cols_necessarias.issubset(df_p.columns):
            continue

        if "hora" in df_p.columns and "hora" in reais.columns:
            merge = df_p.merge(
                reais[["CPE", "hora", "PotActiva"]].rename(
                    columns={"PotActiva": "real"}
                ),
                on=["CPE", "hora"], how="inner"
            )
        else:
            reais_diarios = (
                reais.groupby("CPE", as_index=False)["PotActiva"]
                .sum()
                .rename(columns={"PotActiva": "real"})
            )
            merge = df_p.merge(reais_diarios, on="CPE", how="inner")
        if merge.empty:
            continue

        merge["erro"]      = merge["real"] - merge["previsao"]
        merge["erro_abs"]  = merge["erro"].abs()
        merge["dentro_1s"] = ((merge["real"] >= merge["low_1sigma"]) &
                              (merge["real"] <= merge["high_1sigma"]))
        merge["dentro_2s"] = ((merge["real"] >= merge["low_2sigma"]) &
                              (merge["real"] <= merge["high_2sigma"]))

        tipo_dia = merge["tipo_dia"].iloc[0] if "tipo_dia" in merge.columns else "?"

        validacoes.append({
            "data"      : data_prevista,
            "tipo_dia"  : tipo_dia,
            "n_cpes"    : merge["CPE"].nunique(),
            "n_pontos"  : len(merge),
            "MAE"       : round(merge["erro_abs"].mean(), 2),
            "MAPE"      : round(merge["erro_abs"].mean() /
                                merge["real"].clip(lower=0.01).mean() * 100, 1),
            "RMSE"      : round(float(np.sqrt((merge["erro"] ** 2).mean())), 2),
            "pct_em_1sigma": round(merge["dentro_1s"].mean() * 100, 1),
            "pct_em_2sigma": round(merge["dentro_2s"].mean() * 100, 1),
        })

    if not validacoes:
        msg = f"  {Cor.DIM}Sem consumo real disponível para validar ainda"
        if n_pendentes:
            msg += f" ({n_pendentes} previsão(ões) pendente(s))"
        logger.info(msg + f".{Cor.RESET}")
        logger.info("")
        return None

    df_val = pd.DataFrame(validacoes).sort_values("data").reset_index(drop=True)

    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    out = ANALYSIS_DIR / "qualidade_previsoes.csv"
    df_val.to_csv(out, index=False)

    ult = df_val.iloc[-1]
    logger.info(f"  {Cor.DIM}Dias validados:{Cor.RESET} {len(df_val)}"
                + (f"   {Cor.DIM}pendentes:{Cor.RESET} {n_pendentes}"
                   if n_pendentes else ""))
    logger.info(f"  {Cor.DIM}Último ({ult['data']}):{Cor.RESET} "
                f"MAE {ult['MAE']:.2f} kWh   RMSE {ult['RMSE']:.2f}   "
                f"em ±1σ {ult['pct_em_1sigma']:.0f}% "
                f"{Cor.DIM}(esperado ~68%){Cor.RESET}   "
                f"em ±2σ {ult['pct_em_2sigma']:.0f}% "
                f"{Cor.DIM}(esperado ~95%){Cor.RESET}")
    if len(df_val) > 1:
        logger.info(f"  {Cor.DIM}Média acumulada:{Cor.RESET} "
                    f"MAE {df_val['MAE'].mean():.2f} kWh   "
                    f"RMSE {df_val['RMSE'].mean():.2f}   "
                    f"em ±1σ {df_val['pct_em_1sigma'].mean():.0f}%   "
                    f"em ±2σ {df_val['pct_em_2sigma'].mean():.0f}%")
    logger.info(f"  {Cor.DIM}CSV:{Cor.RESET} {out}")
    logger.info("")
    return df_val


# GRÁFICOS (opcionais)

def gerar_grafico_alerta(r: ResultadoCPE, df_cpe: pd.DataFrame) -> Path:
    import matplotlib.pyplot as plt

    df_cpe = df_cpe[df_cpe["hora"] == r.hora].sort_values("data")
    threshold = r.threshold

    fig, ax = plt.subplots(figsize=(14, 5), facecolor="#FAFBFC")
    ax.set_facecolor("#FAFBFC")

    if len(df_cpe) > 0:
        datas = pd.to_datetime(df_cpe["data"])
        ax.plot(datas, df_cpe["PotActiva"],
                color="#3498DB", linewidth=1.5, alpha=0.7,
                marker="o", markersize=3, label="Histórico deste CPE")

    ax.axhline(r.consumo_esperado, color="#2ECC71", linewidth=2,
               linestyle="--", label=f"Habitual ({r.consumo_esperado:.1f} kWh)")
    ax.axhspan(r.consumo_esperado - r.std_esperado,
               r.consumo_esperado + r.std_esperado,
               alpha=0.15, color="#2ECC71", label="±1σ")
    ax.axhspan(r.consumo_esperado - threshold * r.std_esperado,
               r.consumo_esperado + threshold * r.std_esperado,
               alpha=0.08, color="#F39C12",
               label=f"±{threshold}σ (limiar)")

    cor_ponto = "#E74C3C" if r.direcao == "acima" else "#3498DB"
    ax.plot(pd.Timestamp(r.data), r.consumo_real,
            marker="*", markersize=18, color=cor_ponto, zorder=5,
            label=f"{r.data}: {r.consumo_real:.1f} kWh (z={r.z_score:+.2f})")

    pct = ((r.consumo_real - r.consumo_esperado)
           / max(abs(r.consumo_esperado), 0.001) * 100)
    cluster_str = f"Cluster {r.cluster}" if r.cluster is not None else "sem cluster"
    conf_str = "" if r.confianca == "alta" else "  ⚠ baixa confiança"

    ax.set_title(
        f"{r.cpe}  |  {r.data} {r.hora:02d}h  ({r.tipo_dia.replace('_', ' ')})  |  "
        f"{cluster_str}  |  DESVIO {pct:+.0f}%{conf_str}",
        fontweight="bold", fontsize=12,
        color="#E74C3C" if r.direcao == "acima" else "#3498DB"
    )
    ax.set_xlabel("Data")
    ax.set_ylabel("Consumo (kWh)")
    ax.legend(loc="upper left", fontsize=9)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    out = PLOTS_DIR / f"alerta_{r.cpe}_{r.data}_{r.hora:02d}h.png"
    plt.savefig(out, dpi=130, bbox_inches="tight", facecolor="#FAFBFC")
    plt.close(fig)
    return out


# EXPORTAÇÃO — RETROSPETIVA

def exportar_resultados(
    resultados: list[ResultadoCPE], data_alvo: date, logger: logging.Logger
) -> Path:
    rows = [{
        "CPE"              : r.cpe,
        "hora"             : r.hora,
        "cluster"          : r.cluster,
        "tipo_dia"         : r.tipo_dia,
        "consumo_real"     : r.consumo_real,
        "consumo_habitual" : r.consumo_esperado,
        "std"              : r.std_esperado,
        "z_score"          : r.z_score,
        "z_real"           : r.z_real,
        "veredicto"        : r.veredicto,
        "direcao"          : r.direcao,
        "confianca"        : r.confianca,
        "n_dias_tipo"      : r.n_dias_tipo,
        "fonte_baseline"   : r.fonte_baseline,
        "threshold"        : r.threshold,
    } for r in resultados]

    df = pd.DataFrame(rows)
    ALERTS_DIR.mkdir(parents=True, exist_ok=True)
    out = ALERTS_DIR / f"analise_{data_alvo}.csv"
    df.to_csv(out, index=False)
    logger.info(f"  {Cor.DIM}CSV:{Cor.RESET} {out}")
    return out


# MAIN

def parse_args() -> Parametros:
    p = argparse.ArgumentParser(
        description="Monitorização diária de consumo (BaZe/CMMaia): "
                    "retrospetiva + predição + validação"
    )
    p.add_argument("--data", type=str, default=None, metavar="YYYY-MM-DD",
                   help="Data a analisar (default: ontem)")
    p.add_argument("--modo", type=str, default="baze", choices=["baze", "zip"],
                   help="Fonte de dados (default: baze)")
    p.add_argument("--plots", action="store_true",
                   help="Gerar gráficos para CPEs com desvio")
    p.add_argument("--quiet", action="store_true",
                   help="Modo silencioso (só warnings/erros na consola)")
    p.add_argument("--so-alta-confianca", action="store_true",
                   help="Mostrar/contar apenas desvios de alta confiança")
    p.add_argument("--sem-predicao", action="store_true",
                   help="Não gerar a previsão do dia seguinte")
    p.add_argument("--sem-validacao", action="store_true",
                   help="Não validar previsões anteriores")

    args = p.parse_args()

    if args.data:
        try:
            data_alvo = date.fromisoformat(args.data)
        except ValueError:
            print(f"{Cor.VERMELHO}Data inválida: '{args.data}'. "
                  f"Formato: YYYY-MM-DD{Cor.RESET}", file=sys.stderr)
            sys.exit(2)
    else:
        data_alvo = None

    return Parametros(
        data_alvo=data_alvo,
        modo_dados=args.modo,
        gerar_plots=args.plots,
        quiet=args.quiet,
        so_alta_confianca=args.so_alta_confianca,
        sem_predicao=args.sem_predicao,
        sem_validacao=args.sem_validacao,
    )


def main() -> int:
    inicio = time.time()
    params = parse_args()
    logger = configurar_logging(quiet=params.quiet)

    if sys.platform == "win32":
        import os
        os.system("")  # ativa cores ANSI no Windows 10+

    try:
        # 1. Dados
        df = carregar_dados(params.modo_dados, logger)
        if params.data_alvo is None:
            params.data_alvo = escolher_data_alvo(df)
            # Back-test honesto: nunca usar dados posteriores ao dia analisado
            df = df[df["data"] <= params.data_alvo]

        # 2. Clusters (contexto opcional)
        cluster_map = carregar_clusters(logger)

        # 3. Tipo de dia
        data_prever = params.data_alvo + timedelta(days=1)
        anos = sorted({d.year for d in df["data"].unique()}
                      | {params.data_alvo.year, data_prever.year})
        classificador = ClassificadorDia(anos)
        df["tipo_dia"] = df["data"].map(classificador)

        tipo_alvo    = classificador(params.data_alvo)
        nome_feriado = classificador.nome_feriado(params.data_alvo)

        df_alvo = df[df["data"] == params.data_alvo]
        cpes_com_dados = df_alvo["CPE"].unique()
        pontos_alvo = df_alvo[["CPE", "hora"]].drop_duplicates()
        imprimir_cabecalho(params, tipo_alvo, nome_feriado,
                           len(cpes_com_dados), logger)

        if len(cpes_com_dados) == 0:
            logger.error(f"{Cor.VERMELHO}Sem dados para "
                         f"{params.data_alvo}.{Cor.RESET}")
            return 3

        grupos = dict(tuple(df.groupby("CPE")))

        # 4. PARTE 1 — Retrospetiva
        logger.info(f"{Cor.CIANO}→ A analisar {len(cpes_com_dados)} "
                    f"CPEs / {len(pontos_alvo)} pontos horários "
                    f"(retrospetiva)...{Cor.RESET}")

        resultados: list[ResultadoCPE] = []
        alertas:    list[ResultadoCPE] = []
        n_sem_hist = 0

        for ponto in pontos_alvo.itertuples(index=False):
            cpe = ponto.CPE
            hora = int(ponto.hora)
            df_cpe = grupos.get(cpe)
            if df_cpe is None:
                n_sem_hist += 1
                continue

            r = analisar_cpe(
                cpe, params.data_alvo, hora, tipo_alvo, df_cpe,
                cluster_map.get(cpe)
            )
            if r is None:
                n_sem_hist += 1
                continue
            resultados.append(r)
            if r.veredicto == "desvio":
                alertas.append(r)

        n_desvio_alta  = sum(1 for r in alertas if r.confianca == "alta")
        n_desvio_baixa = sum(1 for r in alertas if r.confianca == "baixa")
        n_normal       = len(resultados) - len(alertas)
        elapsed        = time.time() - inicio

        imprimir_resumo(n_normal, n_desvio_alta, n_desvio_baixa,
                        n_sem_hist, elapsed, logger)
        imprimir_alertas(alertas, logger, params.so_alta_confianca)

        if resultados:
            exportar_resultados(resultados, params.data_alvo, logger)
            logger.info("")

        if params.gerar_plots and alertas:
            alvo_plots = [r for r in alertas
                          if r.confianca == "alta" or not params.so_alta_confianca]
            if alvo_plots:
                logger.info(f"{Cor.CIANO}→ A gerar {len(alvo_plots)} "
                            f"gráficos...{Cor.RESET}")
                for r in alvo_plots:
                    gerar_grafico_alerta(r, grupos[r.cpe])
                logger.info(f"  {len(alvo_plots)} gráficos em {PLOTS_DIR}")
                logger.info("")

        # 5. PARTE 2 — Predição
        if not params.sem_predicao:
            tipo_prever = classificador(data_prever)
            fer_prever  = classificador.nome_feriado(data_prever)
            logger.info(f"{Cor.CIANO}→ A prever consumo de {data_prever} "
                        f"para {len(grupos)} CPEs...{Cor.RESET}")

            previsoes: list[Previsao] = []
            for cpe, df_cpe in grupos.items():
                for hora in range(24):
                    p = prever_cpe(cpe, data_prever, hora, tipo_prever, df_cpe)
                    if p is not None:
                        previsoes.append(p)

            imprimir_resumo_predicao(previsoes, data_prever, tipo_prever,
                                     fer_prever, logger)
            exportar_previsoes(previsoes, data_prever, logger)

        # 6. PARTE 3 — Validação
        if not params.sem_validacao:
            validar_previsoes(df, logger)

##        if n_desvio_alta > 0:
##            return 1
##        if n_desvio_baixa > 0 and not params.so_alta_confianca:
##            return 1
        return 0

    except KeyboardInterrupt:
        logger.warning(f"\n{Cor.AMARELO}Interrompido pelo utilizador.{Cor.RESET}")
        return 130
    except Exception as e:
        logger.exception(f"{Cor.VERMELHO}Erro inesperado: {e}{Cor.RESET}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
