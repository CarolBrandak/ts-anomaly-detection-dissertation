#!/usr/bin/env python3
"""
Detecao diaria de anomalias nos contadores de agua.

Gera ficheiros compativeis com a dashboard:
  results/agua/realtime/alerts/analise_agua_YYYY-MM-DD.csv

Para ja nao gera previsao; apenas compara cada contador/hora com o seu
historico recente da mesma hora.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import holidays
import numpy as np
import pandas as pd

SRC_ROOT = Path(__file__).resolve().parents[2]
if str(SRC_ROOT) not in sys.path:
    sys.path.append(str(SRC_ROOT))

from agua.data.agua_loader import carregar_dados_agua
from config.paths import AGUA_ALERTS_DIR, AGUA_LOGS_DIR


TIPO_CONSUMO = "agua"
BASELINE_WINDOW_DAYS = 30
DEFAULT_MAX_WORKERS = 16
MIN_HIST_IDEAL = 5
MIN_HIST_ABSOLUTO = 2
MIN_HORAS_DIA_COMPLETO = 12
STD_MIN_FRAC = 0.25
STD_ABSOLUTO = 0.01  # 10 litros, em m3
Z_CAP = 10.0

THRESHOLD_POR_TIPO = {
    "dia_util": 2.0,
    "fim_semana": 2.5,
    "feriado": 3.0,
}


@dataclass
class Parametros:
    datas_alvo: list[date]
    modo_dados: str
    dias_historico: int
    contadores: Optional[list[str]]
    limite_contadores: Optional[int]
    usar_cache: bool
    max_workers: int
    quiet: bool


@dataclass
class ResultadoContador:
    cpe: str
    data: date
    hora: int
    tipo_dia: str
    consumo_real: float
    consumo_esperado: float
    std_esperado: float
    z_score: float
    z_real: float
    veredicto: str
    direcao: str
    n_dias_tipo: int
    confianca: str
    fonte_baseline: str
    threshold: float


def configurar_logging(quiet: bool = False) -> logging.Logger:
    AGUA_LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = AGUA_LOGS_DIR / f"deteccao_agua_{datetime.now():%Y%m%d}.log"

    logger = logging.getLogger("detetar_anomalias_agua")
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


class ClassificadorDia:
    def __init__(self, anos):
        self.feriados = holidays.Portugal(years=anos)

    def __call__(self, d) -> str:
        if d in self.feriados:
            return "feriado"
        if pd.Timestamp(d).dayofweek >= 5:
            return "fim_semana"
        return "dia_util"


def _date_range(inicio: date, fim: date) -> list[date]:
    dias = []
    atual = inicio
    while atual <= fim:
        dias.append(atual)
        atual += timedelta(days=1)
    return dias


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"Data invalida: {value}. Usa YYYY-MM-DD")


def agregar_para_hora(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["tstamp"] = pd.to_datetime(df["tstamp"])
    df["data"] = df["tstamp"].dt.date
    df["hora"] = df["tstamp"].dt.hour

    return (
        df.groupby(["CPE", "data", "hora"], as_index=False)
        .agg(
            consumo_m3=("consumo_m3", "sum"),
            valor_l=("valor_l", "sum"),
            n_registos=("consumo_m3", "size"),
        )
        .sort_values(["CPE", "data", "hora"])
        .reset_index(drop=True)
    )


def escolher_datas_default(df: pd.DataFrame) -> list[date]:
    horas_por_dia = df.groupby("data")["hora"].nunique().sort_index()
    completos = horas_por_dia[horas_por_dia >= MIN_HORAS_DIA_COMPLETO]
    if not completos.empty:
        return [completos.index[-1]]
    if df.empty:
        return []
    return [max(df["data"].unique())]


def analisar_ponto(
    cpe: str,
    data_alvo: date,
    hora: int,
    tipo_dia: str,
    df_cpe: pd.DataFrame,
    dias_historico: int,
) -> Optional[ResultadoContador]:
    consumo_hora = df_cpe[
        (df_cpe["data"] == data_alvo)
        & (df_cpe["hora"] == hora)
    ]["consumo_m3"]
    if consumo_hora.empty:
        return None

    consumo_real = float(consumo_hora.iloc[0])
    threshold = THRESHOLD_POR_TIPO[tipo_dia]
    janela_inicio = data_alvo - timedelta(days=dias_historico)

    df_base = df_cpe[
        (df_cpe["data"] < data_alvo)
        & (df_cpe["hora"] == hora)
        & (df_cpe["data"] >= janela_inicio)
    ]
    if df_base.empty:
        return None

    df_tipo = df_base[df_base["tipo_dia"] == tipo_dia]
    n_tipo = len(df_tipo)

    if n_tipo >= MIN_HIST_IDEAL:
        df_hist = df_tipo
        confianca = "alta"
        fonte = f"historico {tipo_dia}"
    elif n_tipo >= MIN_HIST_ABSOLUTO:
        df_hist = df_tipo
        confianca = "baixa"
        fonte = f"historico {tipo_dia} (poucos dados)"
    else:
        if len(df_base) < MIN_HIST_ABSOLUTO:
            return None
        df_hist = df_base
        confianca = "baixa"
        fonte = f"fallback ({dias_historico}d recentes)"

    media = float(df_hist["consumo_m3"].mean())
    std = float(df_hist["consumo_m3"].std())
    if pd.isna(std):
        std = 0.0
    std = max(std, abs(media) * STD_MIN_FRAC, STD_ABSOLUTO)

    z = (consumo_real - media) / std
    z_capped = float(np.clip(z, -Z_CAP, Z_CAP))

    veredicto = "desvio" if abs(z_capped) > threshold else "normal"
    if z_capped > threshold:
        direcao = "acima"
    elif z_capped < -threshold:
        direcao = "abaixo"
    else:
        direcao = "normal"

    return ResultadoContador(
        cpe=cpe,
        data=data_alvo,
        hora=hora,
        tipo_dia=tipo_dia,
        consumo_real=round(consumo_real, 4),
        consumo_esperado=round(media, 4),
        std_esperado=round(std, 4),
        z_score=round(z_capped, 2),
        z_real=round(z, 2),
        veredicto=veredicto,
        direcao=direcao,
        n_dias_tipo=len(df_hist),
        confianca=confianca,
        fonte_baseline=fonte,
        threshold=threshold,
    )


def exportar_resultados(
    resultados: list[ResultadoContador],
    data_alvo: date,
    logger: logging.Logger,
) -> Optional[Path]:
    if not resultados:
        logger.warning(f"Sem resultados para exportar em {data_alvo}.")
        return None

    rows = [{
        "CPE": r.cpe,
        "hora": r.hora,
        "cluster": "",
        "tipo_dia": r.tipo_dia,
        "consumo_real": r.consumo_real,
        "consumo_habitual": r.consumo_esperado,
        "std": r.std_esperado,
        "z_score": r.z_score,
        "z_real": r.z_real,
        "veredicto": r.veredicto,
        "direcao": r.direcao,
        "confianca": r.confianca,
        "n_dias_tipo": r.n_dias_tipo,
        "fonte_baseline": r.fonte_baseline,
        "threshold": r.threshold,
    } for r in resultados]

    AGUA_ALERTS_DIR.mkdir(parents=True, exist_ok=True)
    out = AGUA_ALERTS_DIR / f"analise_{TIPO_CONSUMO}_{data_alvo}.csv"
    pd.DataFrame(rows).to_csv(out, index=False)
    logger.info(f"CSV guardado: {out}")
    return out


def analisar_dia(
    df: pd.DataFrame,
    data_alvo: date,
    classificador: ClassificadorDia,
    dias_historico: int,
    logger: logging.Logger,
) -> Optional[Path]:
    tipo_alvo = classificador(data_alvo)
    df_alvo = df[df["data"] == data_alvo]
    if df_alvo.empty:
        logger.warning(f"Sem dados de agua para {data_alvo}.")
        return None

    grupos = dict(tuple(df.groupby("CPE")))
    pontos = df_alvo[["CPE", "hora"]].drop_duplicates()
    resultados: list[ResultadoContador] = []
    sem_hist = 0

    logger.info("")
    logger.info(f"ANALISE DE AGUA - {data_alvo} ({tipo_alvo.replace('_', ' ')})")
    logger.info(f"Contadores com dados: {df_alvo['CPE'].nunique()}")
    logger.info(f"Pontos contador/hora: {len(pontos)}")

    for ponto in pontos.itertuples(index=False):
        df_cpe = grupos.get(ponto.CPE)
        if df_cpe is None:
            sem_hist += 1
            continue

        resultado = analisar_ponto(
            cpe=ponto.CPE,
            data_alvo=data_alvo,
            hora=int(ponto.hora),
            tipo_dia=tipo_alvo,
            df_cpe=df_cpe,
            dias_historico=dias_historico,
        )
        if resultado is None:
            sem_hist += 1
            continue
        resultados.append(resultado)

    desvios = [r for r in resultados if r.veredicto == "desvio"]
    alta = [r for r in desvios if r.confianca == "alta"]
    baixa = [r for r in desvios if r.confianca == "baixa"]
    normais = len(resultados) - len(desvios)

    logger.info(f"Normais: {normais}")
    logger.info(f"Desvios alta confianca: {len(alta)}")
    logger.info(f"Desvios baixa confianca: {len(baixa)}")
    logger.info(f"Sem historico suficiente: {sem_hist}")

    return exportar_resultados(resultados, data_alvo, logger)


def parse_args() -> Parametros:
    parser = argparse.ArgumentParser(
        description="Detecao de anomalias em contadores de agua (BaZe/FSMAS)"
    )
    parser.add_argument("--modo", default="baze", choices=["baze"], help="Fonte de dados")
    parser.add_argument("--data", type=str, default=None, help="Data a analisar YYYY-MM-DD")
    parser.add_argument("--data-inicio", type=str, default=None, help="Primeiro dia YYYY-MM-DD")
    parser.add_argument("--data-fim", type=str, default=None, help="Ultimo dia YYYY-MM-DD")
    parser.add_argument("--dias-historico", type=int, default=BASELINE_WINDOW_DAYS)
    parser.add_argument("--contadores", type=str, default=None, help="IDs separados por virgula")
    parser.add_argument("--limite-contadores", type=int, default=None, help="Limitar numero de contadores")
    parser.add_argument("--max-workers", type=int, default=DEFAULT_MAX_WORKERS,
                        help="Numero de pedidos ao endpoint em simultaneo")
    parser.add_argument("--sem-cache", action="store_true", help="Ignorar cache local")
    parser.add_argument("--quiet", action="store_true", help="Mostrar apenas avisos/erros")
    args = parser.parse_args()

    data = _parse_date(args.data)
    data_inicio = _parse_date(args.data_inicio)
    data_fim = _parse_date(args.data_fim)

    if data and (data_inicio or data_fim):
        parser.error("Usa --data ou --data-inicio/--data-fim, nao ambos.")

    if data:
        datas_alvo = [data]
    elif data_inicio or data_fim:
        inicio = data_inicio or data_fim
        fim = data_fim or data_inicio
        if fim < inicio:
            parser.error("--data-fim nao pode ser anterior a --data-inicio.")
        datas_alvo = _date_range(inicio, fim)
    else:
        datas_alvo = []

    contadores = None
    if args.contadores:
        contadores = [c.strip() for c in args.contadores.split(",") if c.strip()]

    return Parametros(
        datas_alvo=datas_alvo,
        modo_dados=args.modo,
        dias_historico=args.dias_historico,
        contadores=contadores,
        limite_contadores=args.limite_contadores,
        usar_cache=not args.sem_cache,
        max_workers=args.max_workers,
        quiet=args.quiet,
    )


def main() -> int:
    inicio = time.time()
    params = parse_args()
    logger = configurar_logging(params.quiet)

    try:
        if params.datas_alvo:
            data_inicio_fetch = min(params.datas_alvo) - timedelta(days=params.dias_historico)
            data_fim_fetch = max(params.datas_alvo)
        else:
            data_fim_fetch = date.today()
            data_inicio_fetch = data_fim_fetch - timedelta(days=params.dias_historico + 2)

        df = carregar_dados_agua(
            contadores=params.contadores,
            data_inicio=data_inicio_fetch,
            data_fim=data_fim_fetch,
            usar_cache=params.usar_cache,
            limite_contadores=params.limite_contadores,
            max_workers=params.max_workers,
        )
        if df.empty:
            logger.error("Sem dados de agua para analisar.")
            return 3

        df = agregar_para_hora(df)
        if params.datas_alvo:
            datas_alvo = params.datas_alvo
            df = df[df["data"] <= max(datas_alvo)]
        else:
            datas_alvo = escolher_datas_default(df)

        if not datas_alvo:
            logger.error("Nao foi encontrada nenhuma data com dados.")
            return 3

        anos = sorted({d.year for d in df["data"].unique()} | {d.year for d in datas_alvo})
        classificador = ClassificadorDia(anos)
        df["tipo_dia"] = df["data"].map(classificador)

        outputs = []
        for data_alvo in datas_alvo:
            out = analisar_dia(
                df=df,
                data_alvo=data_alvo,
                classificador=classificador,
                dias_historico=params.dias_historico,
                logger=logger,
            )
            if out:
                outputs.append(out)

        logger.info("")
        logger.info(f"Concluido em {time.time() - inicio:.1f}s. Ficheiros gerados: {len(outputs)}")

        return 0 if outputs else 3
    except KeyboardInterrupt:
        logger.warning("\nInterrompido pelo utilizador. Nenhum ficheiro parcial foi guardado.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
