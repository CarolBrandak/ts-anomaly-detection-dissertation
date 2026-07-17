#!/usr/bin/env python3
"""
Loader dos contadores de agua do BaZe/FSMAS.

O endpoint devolve consumo horario em litros (`valor_l`) e leitura acumulada
(`leitura_l`). Para manter a dashboard consistente, o loader converte o
consumo para m3 e usa a coluna CPE como identificador generico do contador.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional

import pandas as pd
import requests

SRC_ROOT = Path(__file__).resolve().parents[2]
if str(SRC_ROOT) not in sys.path:
    sys.path.append(str(SRC_ROOT))

from config.paths import BAZE_AGUA_CACHE_DIR


BASE_URL = "https://baze.cm-maia.pt/BaZe/api/x4rt.php"
CATALOG_URL = "https://baze.cm-maia.pt/BaZe/fsmas.php"
JANELA_DIAS_ENDPOINT = 10
DEFAULT_MAX_WORKERS = 16

FALLBACK_CONTADORES = [
    "I13JA287987",
    "I23JC095961O",
    "I20MF944347P",
    "I11JB001828",
    "C17SC007495",
    "I19MF927865",
    "D12XF094973V",
    "D07AE127769C",
    "D08AE056364Z",
]

CACHE_DIR = BAZE_AGUA_CACHE_DIR
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _parse_date(value: date | str | datetime | pd.Timestamp) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _cache_key(contador: str, tstart: Optional[date], tend: Optional[date]) -> Path:
    inicio = tstart.isoformat() if tstart else "latest"
    fim = tend.isoformat() if tend else "auto"
    safe = f"{contador}_{inicio}_{fim}".replace(":", "").replace("/", "")
    return CACHE_DIR / f"{safe}.json"


def _json_loads_tolerante(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Alguns contadores sem leituras chegam com campos vazios,
        # por exemplo: "ndias":, "CTot":, "CMDia":,. Isso nao e JSON valido.
        repaired = re.sub(r'("[^"]+"\s*:\s*)(?=,)', r"\1null", text)
        return json.loads(repaired)


def _decode_json_response(response: requests.Response) -> dict:
    return _json_loads_tolerante(response.content.decode("utf-8-sig"))


def _format_duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h{m:02d}m{s:02d}s"
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"


def listar_contadores(timeout: int = 30) -> list[str]:
    """
    Le a pagina fsmas.php e extrai os IDs dos contadores definidos no JS.

    Se a pagina mudar ou estiver indisponivel, usa uma pequena lista de
    fallback ja validada com o endpoint.
    """
    try:
        response = requests.get(CATALOG_URL, timeout=timeout)
        response.raise_for_status()
        html = response.content.decode("utf-8", errors="replace")
        ids = re.findall(r"[\"']([A-Z]\d{2}[A-Z]{2}\d+[A-Z]?)[\"']\s*:", html)
        if ids:
            return list(dict.fromkeys(ids))
    except Exception:
        pass

    return FALLBACK_CONTADORES.copy()


def _fetch_contador(
    contador: str,
    tstart: Optional[date] = None,
    tend: Optional[date] = None,
    timeout: int = 30,
    usar_cache: bool = True,
    mostrar_avisos: bool = True,
) -> Optional[dict]:
    cache = _cache_key(contador, tstart, tend)
    if usar_cache and cache.exists():
        with open(cache, encoding="utf-8") as f:
            return _json_loads_tolerante(f.read())

    params = {"id": contador, "ssql": "True"}
    if tstart is not None:
        params["tstart"] = tstart.isoformat()
    if tend is not None:
        params["tend"] = tend.isoformat()

    try:
        response = requests.get(BASE_URL, params=params, timeout=timeout)
        response.raise_for_status()
        data = _decode_json_response(response)
    except Exception as exc:
        if mostrar_avisos:
            print(f"  [AVISO] Falha ao pedir {contador}: {exc}")
        return None

    with open(cache, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    return data


def _parse_numero(valor) -> Optional[float]:
    if valor is None or valor == "":
        return None
    if isinstance(valor, str):
        valor = valor.replace(",", ".")
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def _parse_resposta(raw: Optional[dict], contador: str) -> pd.DataFrame:
    if not raw:
        return pd.DataFrame()

    timestamps = raw.get("tstamp") or []
    consumos_l = raw.get("valor_l") or []
    leituras_l = raw.get("leitura_l") or []

    n = min(len(timestamps), len(consumos_l))
    rows = []

    for i in range(n):
        consumo_l = _parse_numero(consumos_l[i])
        if consumo_l is None:
            continue

        leitura_l = _parse_numero(leituras_l[i]) if i < len(leituras_l) else None
        ts = pd.to_datetime(timestamps[i], errors="coerce")
        if pd.isna(ts):
            continue

        rows.append({
            "tstamp": ts,
            "CPE": contador,
            "consumo_m3": consumo_l / 1000,
            "valor_l": consumo_l,
            "leitura_l": leitura_l,
        })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["data"] = df["tstamp"].dt.date
    df["hora"] = df["tstamp"].dt.hour
    return df


def _iter_janelas(data_inicio: date, data_fim: date) -> Iterable[tuple[date, date]]:
    atual = data_inicio
    while atual <= data_fim:
        fim = min(atual + timedelta(days=JANELA_DIAS_ENDPOINT), data_fim)
        yield atual, fim
        atual = fim + timedelta(days=1)


def carregar_dados_agua(
    contadores: Optional[list[str]] = None,
    data_inicio: Optional[date | str] = None,
    data_fim: Optional[date | str] = None,
    usar_cache: bool = True,
    pausa: float = 0.2,
    limite_contadores: Optional[int] = None,
    max_workers: int = DEFAULT_MAX_WORKERS,
) -> pd.DataFrame:
    """
    Carrega leituras horarias de agua e devolve consumo em m3.

    data_inicio/data_fim sao inclusivas. O endpoint devolve blocos de cerca de
    11 dias; por isso o loader faz varios pedidos e filtra localmente.
    """
    if contadores is None:
        contadores = listar_contadores()
    if limite_contadores is not None:
        contadores = contadores[:limite_contadores]

    if data_inicio is None and data_fim is None:
        data_fim_dt = date.today()
        data_inicio_dt = data_fim_dt - timedelta(days=JANELA_DIAS_ENDPOINT)
    else:
        data_inicio_dt = _parse_date(data_inicio or data_fim)
        data_fim_dt = _parse_date(data_fim or data_inicio)

    if data_fim_dt < data_inicio_dt:
        raise ValueError("data_fim nao pode ser anterior a data_inicio")

    print("A carregar dados de agua do BaZe/FSMAS...")
    print(f"  Contadores: {len(contadores)}")
    print(f"  Janela:     {data_inicio_dt} -> {data_fim_dt}")
    max_workers = max(1, int(max_workers or 1))
    print(f"  Cache:      {'ON' if usar_cache else 'OFF'} ({CACHE_DIR})")
    print(f"  Paralelo:   {max_workers} pedido(s) em simultaneo")
    print()

    frames = []
    janelas = list(_iter_janelas(data_inicio_dt, data_fim_dt))
    tarefas = [
        (contador, inicio, fim)
        for contador in contadores
        for inicio, fim in janelas
    ]
    total_pedidos = len(tarefas)

    def recolher_janela(tarefa):
        contador, inicio, fim = tarefa
        raw = _fetch_contador(
            contador,
            tstart=inicio,
            tend=fim,
            usar_cache=usar_cache,
            mostrar_avisos=max_workers == 1,
        )
        df = _parse_resposta(raw, contador)
        return contador, inicio, fim, df

    if max_workers == 1:
        resultados = []
        for pedido, tarefa in enumerate(tarefas, start=1):
            contador, inicio, fim = tarefa
            print(f"  [{pedido:4d}/{total_pedidos}] {contador} {inicio} -> {fim}... ", end="", flush=True)
            resultado = recolher_janela(tarefa)
            resultados.append(resultado)
            df = resultado[3]
            if df.empty:
                print("sem dados")
            else:
                print(f"OK ({len(df)} registos)")
            if not usar_cache:
                time.sleep(pausa)
    else:
        resultados = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futuros = [executor.submit(recolher_janela, tarefa) for tarefa in tarefas]
            for pedido, futuro in enumerate(as_completed(futuros), start=1):
                contador, inicio, fim, df = futuro.result()
                resultados.append((contador, inicio, fim, df))
                estado = "sem dados" if df.empty else f"OK ({len(df)} registos)"
                print(
                    f"  [{pedido:4d}/{total_pedidos}] "
                    f"{contador} {inicio} -> {fim}... {estado}",
                    flush=True,
                )

    frames = [df for _, _, _, df in resultados if not df.empty]

    if not frames:
        print("\n[ERRO] Nenhum dado de agua carregado.")
        return pd.DataFrame()

    df_final = pd.concat(frames, ignore_index=True)
    df_final["tstamp"] = pd.to_datetime(df_final["tstamp"])

    inicio_ts = pd.Timestamp(data_inicio_dt)
    fim_ts = pd.Timestamp(data_fim_dt) + pd.Timedelta(days=1)
    df_final = df_final[
        (df_final["tstamp"] >= inicio_ts)
        & (df_final["tstamp"] < fim_ts)
    ]
    df_final = df_final.drop_duplicates(
        subset=["CPE", "tstamp"], keep="last"
    ).sort_values(["CPE", "tstamp"]).reset_index(drop=True)

    if df_final.empty:
        print("\n[ERRO] O endpoint respondeu, mas sem dados dentro da janela pedida.")
        return pd.DataFrame()

    df_final["data"] = df_final["tstamp"].dt.date
    df_final["hora"] = df_final["tstamp"].dt.hour

    print("\nDados de agua carregados:")
    print(f"  Total registos: {len(df_final):,}")
    print(f"  Contadores:     {df_final['CPE'].nunique()}")
    print(f"  Periodo:        {df_final['data'].min()} -> {df_final['data'].max()}")

    return df_final


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Carregar dados horarios de agua do BaZe/FSMAS")
    parser.add_argument("--data-inicio", type=str, default=None, help="Inicio da janela YYYY-MM-DD")
    parser.add_argument("--data-fim", type=str, default=None, help="Fim da janela YYYY-MM-DD")
    parser.add_argument("--contadores", type=str, default=None, help="IDs separados por virgula")
    parser.add_argument("--limite-contadores", type=int, default=None, help="Limitar numero de contadores")
    parser.add_argument("--max-workers", type=int, default=DEFAULT_MAX_WORKERS,
                        help="Numero de pedidos ao endpoint em simultaneo")
    parser.add_argument("--sem-cache", action="store_true", help="Ignorar cache local")
    parser.add_argument("--out", type=str, default=None, help="CSV de saida opcional")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    contadores = None
    if args.contadores:
        contadores = [c.strip() for c in args.contadores.split(",") if c.strip()]

    df = carregar_dados_agua(
        contadores=contadores,
        data_inicio=args.data_inicio,
        data_fim=args.data_fim,
        usar_cache=not args.sem_cache,
        limite_contadores=args.limite_contadores,
        max_workers=args.max_workers,
    )
    if df.empty:
        return 3

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(out, index=False)
        print(f"\nCSV guardado: {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
