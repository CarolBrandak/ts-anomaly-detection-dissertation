import requests
import pandas as pd
import numpy as np
import json
from datetime import date, timedelta
import time

from config.paths import BAZE_CACHE_DIR

 
CPES_CONFIG = [
 
    # MT (13 CPEs)
    {"cpe": "PT0002000068855003AK",  "cate": "MT"},
    {"cpe": "PT0002000073573036KH",  "cate": "MT"},
    {"cpe": "PT0002000068856826ZG",  "cate": "MT"},
    {"cpe": "PT0002000068856906VS",  "cate": "MT"},
    {"cpe": "PT0002000078140706BA",  "cate": "MT"},
    {"cpe": "PT0002000081997398TD",  "cate": "MT"},
    {"cpe": "PT0002000078441876HB",  "cate": "MT"},
    {"cpe": "PT0002000100113293JT",  "cate": "MT"},
    {"cpe": "PT0002000114613364CC",  "cate": "MT"},
    {"cpe": "PT0002000077348081AG",  "cate": "MT"},
    {"cpe": "PT0002000114685657JR",  "cate": "MT"},
    {"cpe": "PT0002000116530964LH",  "cate": "MT"},
    {"cpe": "PT0002000125701614SQ",  "cate": "MT"},

    # BTE (56 CPEs)
    {"cpe": "PT0002000033074862LZ",  "cate": "BTE"},
    {"cpe": "PT0002000068856655YV",  "cate": "BTE"},
    {"cpe": "PT0002000068856267NC",  "cate": "BTE"},
    {"cpe": "PT0002000068856781NM",  "cate": "BTE"},
    {"cpe": "PT0002000068856974CZ",  "cate": "BTE"},
    {"cpe": "PT0002000068857897ZV",  "cate": "BTE"},
    {"cpe": "PT0002000068857099AR",  "cate": "BTE"},
    {"cpe": "PT0002000068856872QG",  "cate": "BTE"},
    {"cpe": "PT0002000068857909SY",  "cate": "BTE"},
    {"cpe": "PT0002000068859187RL",  "cate": "BTE"},
    {"cpe": "PT0002000068858231YY",  "cate": "BTE"},
    {"cpe": "PT0002000068858674WN",  "cate": "BTE"},
    {"cpe": "PT0002000068859325FL",  "cate": "BTE"},
    {"cpe": "PT0002000068859382XF",  "cate": "BTE"},
    {"cpe": "PT0002000071896778MT",  "cate": "BTE"},
    {"cpe": "PT0002000068859393XH",  "cate": "BTE"},
    {"cpe": "PT0002000068859597LS",  "cate": "BTE"},
    {"cpe": "PT0002000073717386HC",  "cate": "BTE"},
    {"cpe": "PT0002000073231742VK",  "cate": "BTE"},
    {"cpe": "PT0002000073481266XH",  "cate": "BTE"},
    {"cpe": "PT0002000073720434JD",  "cate": "BTE"},
    {"cpe": "PT0002000077394934QY",  "cate": "BTE"},
    {"cpe": "PT0002000077647404EM",  "cate": "BTE"},
    {"cpe": "PT0002000075637532JB",  "cate": "BTE"},
    {"cpe": "PT0002000078207354XC",  "cate": "BTE"},
    {"cpe": "PT0002000078233981HJ",  "cate": "BTE"},
    {"cpe": "PT0002000078294957RQ",  "cate": "BTE"},
    {"cpe": "PT0002000079469719HF",  "cate": "BTE"},
    {"cpe": "PT0002000101964938LF",  "cate": "BTE"},
    {"cpe": "PT0002000081344542CP",  "cate": "BTE"},
    {"cpe": "PT0002000102936404ME",  "cate": "BTE"},
    {"cpe": "PT0002000103647515BL",  "cate": "BTE"},
    {"cpe": "PT0002000105483259QH",  "cate": "BTE"},
    {"cpe": "PT0002000107046231FW",  "cate": "BTE"},
    {"cpe": "PT0002000106102375RC",  "cate": "BTE"},
    {"cpe": "PT0002000107172384HT",  "cate": "BTE"},
    {"cpe": "PT0002000109837807PE",  "cate": "BTE"},
    {"cpe": "PT0002000110090564GD",  "cate": "BTE"},
    {"cpe": "PT0002000110607652SB",  "cate": "BTE"},
    {"cpe": "PT0002000110814293YC",  "cate": "BTE"},
    {"cpe": "PT0002000111572054VT",  "cate": "BTE"},
    {"cpe": "PT0002000115031201VQ",  "cate": "BTE"},
    {"cpe": "PT0002000115673471CB",  "cate": "BTE"},
    {"cpe": "PT0002000115673389QK",  "cate": "BTE"},
    {"cpe": "PT0002000115700602GW",  "cate": "BTE"},
    {"cpe": "PT0002000119303492KB",  "cate": "BTE"},
    {"cpe": "PT0002000120237616VJ",  "cate": "BTE"},
    {"cpe": "PT0002000125379984SH",  "cate": "BTE"},
    {"cpe": "PT0002000123648159KR",  "cate": "BTE"},
    {"cpe": "PT0002000201038711LS",  "cate": "BTE"},
    {"cpe": "PT0002000201936109ME",  "cate": "BTE"},
    {"cpe": "PT0002000068856952LS",  "cate": "BTE"},
    {"cpe": "PT0002000112989585PH",  "cate": "BTE"},
    {"cpe": "PT0002000203419117SJ",  "cate": "BTE"},
    {"cpe": "PT0002000203886452WB",  "cate": "BTE"},
    {"cpe": "PT0002000082549706RH",  "cate": "BTE"},
 
    # IP (207 CPEs)
    {"cpe": "PT0002000032934812WB",  "cate": "IP"},
    {"cpe": "PT0002000032934971DD",  "cate": "IP"},
    {"cpe": "PT0002000032934982DC",  "cate": "IP"},
    {"cpe": "PT0002000032935074JC",  "cate": "IP"},
    {"cpe": "PT0002000032935119SL",  "cate": "IP"},
    {"cpe": "PT0002000032935154VP",  "cate": "IP"},
    {"cpe": "PT0002000032935187HH",  "cate": "IP"},
    {"cpe": "PT0002000032935201LD",  "cate": "IP"},
    {"cpe": "PT0002000032935278EV",  "cate": "IP"},
    {"cpe": "PT0002000032935314RF",  "cate": "IP"},
    {"cpe": "PT0002000032935347WV",  "cate": "IP"},
    {"cpe": "PT0002000032935393GV",  "cate": "IP"},
    {"cpe": "PT0002000032935416MV",  "cate": "IP"},
    {"cpe": "PT0002000032935473PM",  "cate": "IP"},
    {"cpe": "PT0002000032935633SG",  "cate": "IP"},
    {"cpe": "PT0002000032935688VJ",  "cate": "IP"},
    {"cpe": "PT0002000032935724LA",  "cate": "IP"},
    {"cpe": "PT0002000032936135ZT",  "cate": "IP"},
    {"cpe": "PT0002000032936179SK",  "cate": "IP"},
    {"cpe": "PT0002000032936192QB",  "cate": "IP"},
    {"cpe": "PT0002000032936226VE",  "cate": "IP"},
    {"cpe": "PT0002000032936306KX",  "cate": "IP"},
    {"cpe": "PT0002000032936341EE",  "cate": "IP"},
    {"cpe": "PT0002000032936363TK",  "cate": "IP"},
    {"cpe": "PT0002000032936385RC",  "cate": "IP"},
    {"cpe": "PT0002000032936421AX",  "cate": "IP"},
    {"cpe": "PT0002000032936465MP",  "cate": "IP"},
    {"cpe": "PT0002000033137461GF",  "cate": "IP"},
    {"cpe": "PT0002000033143974BB",  "cate": "IP"},
    {"cpe": "PT0002000033144009JT",  "cate": "IP"},
    {"cpe": "PT0002000033173784LJ",  "cate": "IP"},
    {"cpe": "PT0002000033173829KN",  "cate": "IP"},
    {"cpe": "PT0002000033173831KZ",  "cate": "IP"},
    {"cpe": "PT0002000033173911WW",  "cate": "IP"},
    {"cpe": "PT0002000033173944AN",  "cate": "IP"},
    {"cpe": "PT0002000033173966GB",  "cate": "IP"},
    {"cpe": "PT0002000033174003YW",  "cate": "IP"},
    {"cpe": "PT0002000033174036FN",  "cate": "IP"},
    {"cpe": "PT0002000033174069PE",  "cate": "IP"},
    {"cpe": "PT0002000033174093XT",  "cate": "IP"},
    {"cpe": "PT0002000033174138BE",  "cate": "IP"},
    {"cpe": "PT0002000033174149NX",  "cate": "IP"},
    {"cpe": "PT0002000033174151NN",  "cate": "IP"},
    {"cpe": "PT0002000033174173JB",  "cate": "IP"},
    {"cpe": "PT0002000033174184JE",  "cate": "IP"},
    {"cpe": "PT0002000033181018NW",  "cate": "IP"},
    {"cpe": "PT0002000033181086SR",  "cate": "IP"},
    {"cpe": "PT0002000033181109QR",  "cate": "IP"},
    {"cpe": "PT0002000033181224KR",  "cate": "IP"},
    {"cpe": "PT0002000033181257EB",  "cate": "IP"},
    {"cpe": "PT0002000033181281TN",  "cate": "IP"},
    {"cpe": "PT0002000033181292RT",  "cate": "IP"},
    {"cpe": "PT0002000033181326WB",  "cate": "IP"},
    {"cpe": "PT0002000033181359AK",  "cate": "IP"},
    {"cpe": "PT0002000033181394MX",  "cate": "IP"},
    {"cpe": "PT0002000033181587JL",  "cate": "IP"},
    {"cpe": "PT0002000033181598ZF",  "cate": "IP"},
    {"cpe": "PT0002000033181645QP",  "cate": "IP"},
    {"cpe": "PT0002000033181736CF",  "cate": "IP"},
    {"cpe": "PT0002000033181782EF",  "cate": "IP"},
    {"cpe": "PT0002000033181884AV",  "cate": "IP"},
    {"cpe": "PT0002000033181929MQ",  "cate": "IP"},
    {"cpe": "PT0002000033181931MH",  "cate": "IP"},
    {"cpe": "PT0002000033181942YY",  "cate": "IP"},
    {"cpe": "PT0002000033181953YV",  "cate": "IP"},
    {"cpe": "PT0002000033181964FM",  "cate": "IP"},
    {"cpe": "PT0002000033182001PL",  "cate": "IP"},
    {"cpe": "PT0002000033182012DF",  "cate": "IP"},
    {"cpe": "PT0002000033182078NG",  "cate": "IP"},
    {"cpe": "PT0002000033182089NS",  "cate": "IP"},
    {"cpe": "PT0002000033182091NV",  "cate": "IP"},
    {"cpe": "PT0002000033186061RP",  "cate": "IP"},
    {"cpe": "PT0002000033186141GL",  "cate": "IP"},
    {"cpe": "PT0002000033186152MF",  "cate": "IP"},
    {"cpe": "PT0002000052543452BR",  "cate": "IP"},
    {"cpe": "PT0002000052545458YY",  "cate": "IP"},
    {"cpe": "PT0002000052546155JJ",  "cate": "IP"},
    {"cpe": "PT0002000052546747QF",  "cate": "IP"},
    {"cpe": "PT0002000052547295VA",  "cate": "IP"},
    {"cpe": "PT0002000052547821VT",  "cate": "IP"},
    {"cpe": "PT0002000052548482EV",  "cate": "IP"},
    {"cpe": "PT0002000052548675PA",  "cate": "IP"},
    {"cpe": "PT0002000052937418MT",  "cate": "IP"},
    {"cpe": "PT0002000052949226ND",  "cate": "IP"},
    {"cpe": "PT0002000053041682FM",  "cate": "IP"},
    {"cpe": "PT0002000053043996SL",  "cate": "IP"},
    {"cpe": "PT0002000053081053VT",  "cate": "IP"},
    {"cpe": "PT0002000065282732YH",  "cate": "IP"},
    {"cpe": "PT0002000065282765PM",  "cate": "IP"},
    {"cpe": "PT0002000065528253DZ",  "cate": "IP"},
    {"cpe": "PT0002000065533466YY",  "cate": "IP"},
    {"cpe": "PT0002000065591876SL",  "cate": "IP"},
    {"cpe": "PT0002000066808543ZD",  "cate": "IP"},
    {"cpe": "PT0002000066808623VC",  "cate": "IP"},
    {"cpe": "PT0002000067324104MW",  "cate": "IP"},
    {"cpe": "PT0002000067759766VK",  "cate": "IP"},
    {"cpe": "PT0002000068870107QZ",  "cate": "IP"},
    {"cpe": "PT0002000069306798MG",  "cate": "IP"},
    {"cpe": "PT0002000069338479WZ",  "cate": "IP"},
    {"cpe": "PT0002000069802246HD",  "cate": "IP"},
    {"cpe": "PT0002000071320121WE",  "cate": "IP"},
    {"cpe": "PT0002000072062898MZ",  "cate": "IP"},
    {"cpe": "PT0002000072905653PA",  "cate": "IP"},
    {"cpe": "PT0002000072907284XR",  "cate": "IP"},
    {"cpe": "PT0002000072927102CQ",  "cate": "IP"},
    {"cpe": "PT0002000073432223VB",  "cate": "IP"},
    {"cpe": "PT0002000073961094BC",  "cate": "IP"},
    {"cpe": "PT0002000073961128JP",  "cate": "IP"},
    {"cpe": "PT0002000074499424AN",  "cate": "IP"},
    {"cpe": "PT0002000074516162HY",  "cate": "IP"},
    {"cpe": "PT0002000076063444QD",  "cate": "IP"},
    {"cpe": "PT0002000076134941LE",  "cate": "IP"},
    {"cpe": "PT0002000076549647HS",  "cate": "IP"},
    {"cpe": "PT0002000076593445JK",  "cate": "IP"},
    {"cpe": "PT0002000076595464DQ",  "cate": "IP"},
    {"cpe": "PT0002000076805608SD",  "cate": "IP"},
    {"cpe": "PT0002000077111709FA",  "cate": "IP"},
    {"cpe": "PT0002000077111733PG",  "cate": "IP"},
    {"cpe": "PT0002000077296616LJ",  "cate": "IP"},
    {"cpe": "PT0002000077297266RL",  "cate": "IP"},
    {"cpe": "PT0002000077297335GL",  "cate": "IP"},
    {"cpe": "PT0002000077586937SM",  "cate": "IP"},
    {"cpe": "PT0002000078424866ZK",  "cate": "IP"},
    {"cpe": "PT0002000078618376XD",  "cate": "IP"},
    {"cpe": "PT0002000078980058AQ",  "cate": "IP"},
    {"cpe": "PT0002000079471477WV",  "cate": "IP"},
    {"cpe": "PT0002000079471581FY",  "cate": "IP"},
    {"cpe": "PT0002000080238674DA",  "cate": "IP"},
    {"cpe": "PT0002000080276117GW",  "cate": "IP"},
    {"cpe": "PT0002000080461298MX",  "cate": "IP"},
    {"cpe": "PT0002000081398935QY",  "cate": "IP"},
    {"cpe": "PT0002000081722388AX",  "cate": "IP"},
    {"cpe": "PT0002000083148707DF",  "cate": "IP"},
    {"cpe": "PT0002000084047066ZD",  "cate": "IP"},
    {"cpe": "PT0002000084047077ZC",  "cate": "IP"},
    {"cpe": "PT0002000084047099SL",  "cate": "IP"},
    {"cpe": "PT0002000085216752VF",  "cate": "IP"},
    {"cpe": "PT0002000085878838FS",  "cate": "IP"},
    {"cpe": "PT0002000085879034QG",  "cate": "IP"},
    {"cpe": "PT0002000085879056VA",  "cate": "IP"},
    {"cpe": "PT0002000086712913TH",  "cate": "IP"},
    {"cpe": "PT0002000087509609RV",  "cate": "IP"},
    {"cpe": "PT0002000087509611RL",  "cate": "IP"},
    {"cpe": "PT0002000087509622WF",  "cate": "IP"},
    {"cpe": "PT0002000087509666GM",  "cate": "IP"},
    {"cpe": "PT0002000087509688MG",  "cate": "IP"},
    {"cpe": "PT0002000087844686BF",  "cate": "IP"},
    {"cpe": "PT0002000087844697BH",  "cate": "IP"},
    {"cpe": "PT0002000087844711ND",  "cate": "IP"},
    {"cpe": "PT0002000089588024TZ",  "cate": "IP"},
    {"cpe": "PT0002000089588046RJ",  "cate": "IP"},
    {"cpe": "PT0002000102325527BW",  "cate": "IP"},
    {"cpe": "PT0002000102367112WA",  "cate": "IP"},
    {"cpe": "PT0002000102462268EP",  "cate": "IP"},
    {"cpe": "PT0002000103026532ZJ",  "cate": "IP"},
    {"cpe": "PT0002000103476489GK",  "cate": "IP"},
    {"cpe": "PT0002000104441112QR",  "cate": "IP"},
    {"cpe": "PT0002000104466334PS",  "cate": "IP"},
    {"cpe": "PT0002000105067638RF",  "cate": "IP"},
    {"cpe": "PT0002000105580814AF",  "cate": "IP"},
    {"cpe": "PT0002000105712308QX",  "cate": "IP"},
    {"cpe": "PT0002000106706086FG",  "cate": "IP"},
    {"cpe": "PT0002000107211573LC",  "cate": "IP"},
    {"cpe": "PT0002000107676749GK",  "cate": "IP"},
    {"cpe": "PT0002000107950678TC",  "cate": "IP"},
    {"cpe": "PT0002000108062847RH",  "cate": "IP"},
    {"cpe": "PT0002000108329678BA",  "cate": "IP"},
    {"cpe": "PT0002000108329714NQ",  "cate": "IP"},
    {"cpe": "PT0002000109376507PX",  "cate": "IP"},
    {"cpe": "PT0002000109428644KY",  "cate": "IP"},
    {"cpe": "PT0002000109972449CE",  "cate": "IP"},
    {"cpe": "PT0002000110070725SL",  "cate": "IP"},
    {"cpe": "PT0002000110131679KT",  "cate": "IP"},
    {"cpe": "PT0002000110300823SW",  "cate": "IP"},
    {"cpe": "PT0002000110362575PE",  "cate": "IP"},
    {"cpe": "PT0002000111724904SS",  "cate": "IP"},
    {"cpe": "PT0002000112274131KW",  "cate": "IP"},
    {"cpe": "PT0002000112344771XD",  "cate": "IP"},
    {"cpe": "PT0002000112462701PH",  "cate": "IP"},
    {"cpe": "PT0002000113906484ZE",  "cate": "IP"},
    {"cpe": "PT0002000114943169PM",  "cate": "IP"},
    {"cpe": "PT0002000114943251BH",  "cate": "IP"},
    {"cpe": "PT0002000115400104WE",  "cate": "IP"},
    {"cpe": "PT0002000115699435EP",  "cate": "IP"},
    {"cpe": "PT0002000115920726YQ",  "cate": "IP"},
    {"cpe": "PT0002000116087346YR",  "cate": "IP"},
    {"cpe": "PT0002000116137885HD",  "cate": "IP"},
    {"cpe": "PT0002000117551245NL",  "cate": "IP"},
    {"cpe": "PT0002000118723177KD",  "cate": "IP"},
    {"cpe": "PT0002000119848791VA",  "cate": "IP"},
    {"cpe": "PT0002000121515419YM",  "cate": "IP"},
    {"cpe": "PT0002000121545719NZ",  "cate": "IP"},
    {"cpe": "PT0002000129769669VS",  "cate": "IP"},
    {"cpe": "PT0002000200066972KA",  "cate": "IP"},
    {"cpe": "PT0002000200848906RY",  "cate": "IP"},
    {"cpe": "PT0002000203605918HP",  "cate": "IP"},
    {"cpe": "PT0002000204922339FR",  "cate": "IP"},
    {"cpe": "PT0002000206074194QQ",  "cate": "IP"},
    {"cpe": "PT0002000133418574BQ",  "cate": "IP"},
    {"cpe": "PT0002000111948279KZ",  "cate": "IP"},
    {"cpe": "PT0002000033180983XJ",  "cate": "IP"},
    {"cpe": "PT0002000033181543BK",  "cate": "IP"},
    {"cpe": "PT0002000076805404YN",  "cate": "IP"},
    {"cpe": "PT0002000033143996NX",  "cate": "IP"},
    {"cpe": "PT0002000072360785PM",  "cate": "IP"},
    {"cpe": "PT0002000033181747CH",  "cate": "IP"},
    {"cpe": "PT0002000111545073QK",  "cate": "IP"},
]
 
BASE_URL = "http://baze2.cm-maia.pt/D4CMMaia/api/sumac.php"
AG_15MIN = "15min"
MAX_PONTOS_15MIN = 300
PASSO_15MIN = pd.Timedelta(minutes=15)
JANELA_MAX_15MIN = PASSO_15MIN * MAX_PONTOS_15MIN
 
# Cache local para não pedir a mesma coisa duas vezes
CACHE_DIR = BAZE_CACHE_DIR
CACHE_DIR.mkdir(parents=True, exist_ok=True)
 
 
# FUNÇÕES
def _safe_cache_part(value):
    if value is None:
        return ""
    return (
        str(value)
        .replace(":", "")
        .replace("-", "")
        .replace(" ", "T")
        .replace("/", "")
    )


def _cache_path(cpe, ano, cate, ag=None, tstart=None, tend=None):
    if ag is None and tstart is None and tend is None:
        return CACHE_DIR / f"{cpe}_{ano}_{cate}.json"

    partes = [cpe, ano, cate, ag or "diario"]
    if tstart is not None:
        partes.append(_safe_cache_part(tstart))
    if tend is not None:
        partes.append(_safe_cache_part(tend))
    nome = "_".join(str(p) for p in partes if p != "")
    return CACHE_DIR / f"{nome}.json"


def _fetch_cpe_ano(
    cpe, ano, cate, timeout=30, usar_cache=True,
    ag=None, tstart=None, tend=None,
):
    """
    Pede os dados de um CPE para um dado ano à API do BaZe.
    Devolve o JSON bruto ou None se falhar.
    """
    cache = _cache_path(cpe, ano, cate, ag=ag, tstart=tstart, tend=tend)
 
    # Usar cache se existir (evita pedir os mesmos dados históricos repetidamente)
    if usar_cache and cache.exists():
        with open(cache) as f:
            return json.load(f)
 
    params = {"cpe": cpe, "ano": ano, "cate": cate}
    if ag is not None:
        params["ag"] = ag
    if tstart is not None:
        params["tstart"] = tstart
    if tend is not None:
        params["tend"] = tend
    try:
        r = requests.get(BASE_URL, params=params, timeout=timeout)
        r.raise_for_status()
        data = r.json()
 
        # Guardar em cache
        with open(cache, "w") as f:
            json.dump(data, f)
 
        return data
 
    except requests.exceptions.ConnectionError:
        print(f"  [ERRO] Sem ligação ao servidor BaZe. Estás na rede da CMMaia?")
        return None
    except requests.exceptions.Timeout:
        print(f"  [ERRO] Timeout ao pedir {cpe} / {ano}")
        return None
    except Exception as e:
        print(f"  [ERRO] {cpe} / {ano}: {e}")
        return None
 
 
def _parse_timestamp_baze(valor):
    s = str(valor).strip()
    digits = "".join(ch for ch in s if ch.isdigit())

    for tamanho, formato in (
        (14, "%Y%m%d%H%M%S"),
        (12, "%Y%m%d%H%M"),
        (8, "%Y%m%d"),
    ):
        if len(digits) >= tamanho:
            return pd.to_datetime(digits[:tamanho], format=formato)

    return pd.to_datetime(s)


def _parse_consumo(valor):
    if valor is None:
        return None
    if isinstance(valor, str):
        valor = valor.replace(",", ".")
    return float(valor)


def _parse_resposta(raw, cpe, granularidade=None):
    """
    Converte o JSON do BaZe num DataFrame com colunas:
      tstamp, CPE, PotActiva
 
    Estrutura real confirmada do BaZe:
    {
      "t":       ["20260201", "20260202", ...],  <- datas YYYYMMDD
      "NReg":    [95, 96, ...],                  <- nº de leituras no dia
      "Consumo": [12.3, 14.1, ...]               <- consumo medio do dia (kWh)
    }
    Cada entrada corresponde a um dia.
    """
    if raw is None:
        return pd.DataFrame()
 
    try:
        datas   = raw.get("t", [])
        # Tentar variantes do nome do campo de consumo
        consumo = (raw.get("Consumo")
                   or raw.get("consumo")
                   or raw.get("C")
                   or [])
 
        if not datas or not consumo:
            print(f"  [AVISO] Arrays vazios para {cpe}.")
            print(f"  Chaves disponiveis: {list(raw.keys())}")
            return pd.DataFrame()
 
        n = min(len(datas), len(consumo))
        rows = []
        for i in range(n):
            d = str(datas[i])
            v = _parse_consumo(consumo[i])
            if v is None:
                continue
            try:
                ts = _parse_timestamp_baze(d)
                if granularidade == AG_15MIN:
                    ts = ts - PASSO_15MIN
                rows.append({"tstamp": ts, "CPE": cpe, "PotActiva": v})
            except Exception:
                continue
 
        return pd.DataFrame(rows)
 
    except Exception as e:
        print(f"  [AVISO] Erro ao parsear resposta para {cpe}: {e}")
        print(f"  Chaves no JSON: {list(raw.keys()) if isinstance(raw, dict) else type(raw)}")
        return pd.DataFrame()
 
 
def _formatar_ts_baze(ts):
    return pd.Timestamp(ts).strftime("%Y%m%d%H%M%S")


def _iter_janelas_15min(data_inicio, data_fim):
    inicio = pd.Timestamp(data_inicio)
    fim = pd.Timestamp(data_fim)
    if fim <= inicio:
        return

    atual = inicio
    while atual < fim:
        prox = min(atual + JANELA_MAX_15MIN, fim)
        # A API usa comparacoes estritas (hora > tstart e hora < tend).
        yield atual - PASSO_15MIN, prox + PASSO_15MIN
        atual = prox


def _fetch_cpe_15min(cpe, cate, data_inicio=None, data_fim=None,
                     timeout=30, usar_cache=True, pausa=0.5):
    frames = []

    if data_inicio is not None and data_fim is not None:
        for inicio, fim in _iter_janelas_15min(data_inicio, data_fim):
            ano = inicio.year
            raw = _fetch_cpe_ano(
                cpe, ano, cate, timeout=timeout, usar_cache=usar_cache,
                ag=AG_15MIN,
                tstart=_formatar_ts_baze(inicio),
                tend=_formatar_ts_baze(fim),
            )
            df = _parse_resposta(raw, cpe, granularidade=AG_15MIN)
            if len(df) > 0:
                frames.append(df)
            if not usar_cache:
                time.sleep(pausa)

    if frames:
        return pd.concat(frames, ignore_index=True).drop_duplicates(
            subset=["CPE", "tstamp"], keep="last"
        )

    # Fallback pratico: o endpoint tambem devolve os ultimos 300 pontos
    # quando nao recebe tstart/tend. Isto mantem a recolha diaria a funcionar
    # se a janela temporal falhar no servidor.
    ano_atual = date.today().year
    raw = _fetch_cpe_ano(
        cpe, ano_atual, cate, timeout=timeout, usar_cache=usar_cache,
        ag=AG_15MIN,
    )
    return _parse_resposta(raw, cpe, granularidade=AG_15MIN)


def carregar_dados_baze(
    cpes_config, anos=None, usar_cache=True, pausa=0.5,
    granularidade=None, data_inicio=None, data_fim=None,
):
    """
    Carrega os dados de todos os CPEs para os anos pedidos.
 
    Parâmetros
    ----------
    cpes_config : lista de dict {"cpe": ..., "cate": ...}
    anos        : lista de anos (default: ano atual + anterior)
    usar_cache  : True = não re-pede dados já guardados em disco
    pausa       : segundos entre pedidos (evitar sobrecarregar o servidor)
 
    Devolve
    -------
    DataFrame com: tstamp, CPE, PotActiva, hora, data
    """
    if granularidade == AG_15MIN:
        anos = [date.today().year] if anos is None else anos
    elif anos is None:
        ano_atual = date.today().year
        anos = [ano_atual - 1, ano_atual]
 
    print(f"A carregar dados do BaZe...")
    print(f"  CPEs: {len(cpes_config)}")
    print(f"  Anos: {anos}")
    print(f"  Granularidade: {granularidade or 'diaria'}")
    if granularidade == AG_15MIN and data_inicio is not None and data_fim is not None:
        print(f"  Janela: {data_inicio} -> {data_fim}")
    print(f"  Cache: {'ON' if usar_cache else 'OFF'} ({CACHE_DIR})")
    print()
 
    frames = []
    total = len(cpes_config) if granularidade == AG_15MIN else len(cpes_config) * len(anos)
    i = 0
 
    for cfg in cpes_config:
        cpe  = cfg["cpe"]
        cate = cfg["cate"]

        if granularidade == AG_15MIN:
            i += 1
            print(f"  [{i:3d}/{total}] {cpe} / 15min... ", end="", flush=True)

            df = _fetch_cpe_15min(
                cpe, cate,
                data_inicio=data_inicio,
                data_fim=data_fim,
                usar_cache=usar_cache,
                pausa=pausa,
            )

            if len(df) > 0:
                frames.append(df)
                print(f"OK ({len(df)} registos)")
            else:
                print("sem dados")

            if not usar_cache and data_inicio is None:
                time.sleep(pausa)
            continue
 
        for ano in anos:
            i += 1
            print(f"  [{i:3d}/{total}] {cpe} / {ano}... ", end="", flush=True)
 
            raw = _fetch_cpe_ano(cpe, ano, cate, usar_cache=usar_cache)
            df  = _parse_resposta(raw, cpe, granularidade=granularidade)
 
            if len(df) > 0:
                frames.append(df)
                print(f"OK ({len(df)} registos)")
            else:
                print("sem dados")
 
            if not usar_cache:
                time.sleep(pausa)  # só pausa se for pedido real (não cache)
 
    if not frames:
        print("\n[ERRO] Nenhum dado carregado. Verifica a ligação e os CPEs.")
        return pd.DataFrame()
 
    df_final = pd.concat(frames, ignore_index=True)
    df_final["tstamp"] = pd.to_datetime(df_final["tstamp"])
    df_final = df_final.sort_values(["CPE", "tstamp"]).reset_index(drop=True)
    df_final["hora"] = df_final["tstamp"].dt.hour
    df_final["data"] = df_final["tstamp"].dt.date
 
    print(f"\nDados carregados:")
    print(f"  Total registos: {len(df_final):,}")
    print(f"  CPEs únicos:    {df_final['CPE'].nunique()}")
    print(f"  Periodo:        {df_final['data'].min()} -> {df_final['data'].max()}")
 
    return df_final
 
 
def carregar_ontem(cpes_config, usar_cache=False, granularidade=AG_15MIN):
    """
    Versão simplificada para uso diário (às 15h):
    carrega apenas os dados do ano atual (inclui ontem).
    Não usa cache por defeito — queremos dados frescos.
    """
    ano_atual = date.today().year
    return carregar_dados_baze(
        cpes_config,
        anos=[ano_atual],
        usar_cache=usar_cache,
        granularidade=granularidade,
    )
 
 
def inspecionar_resposta_bruta(cpe, ano, cate):
    """
    Utilitário de diagnóstico: mostra o JSON bruto que o BaZe devolve.
    Usar para perceber a estrutura real antes de adaptar _parse_resposta().
    """
    print(f"A pedir: {BASE_URL}?cpe={cpe}&ano={ano}&cate={cate}")
    raw = _fetch_cpe_ano(cpe, ano, cate, usar_cache=False)
    print("\nEstrutura do JSON recebido:")
    print(json.dumps(raw, indent=2, ensure_ascii=False)[:2000])
    return raw
