# ts-anomaly-detection-dissertation

Deteção de padrões e anomalias em séries temporais de consumo municipal.

Repositório: <https://github.com/CarolBrandak/ts-anomaly-detection-dissertation>

## Instalar

Requisitos:

- Python 3.11 ou superior
- Git

No terminal:

```powershell
git clone https://github.com/CarolBrandak/ts-anomaly-detection-dissertation.git
cd ts-anomaly-detection-dissertation

python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -r requirements.txt
```

Em Linux/macOS, ativar o ambiente virtual com:

```bash
source .venv/bin/activate
```

## Abrir a dashboard

Depois da instalação, entrar na pasta `dashboard` e correr:

```powershell
cd dashboard
.\abrir_dashboard.bat
```

O ficheiro `abrir_dashboard.bat` arranca um servidor local e abre a dashboard no browser.

Se o browser não abrir automaticamente, abrir manualmente:

```text
http://localhost:8000/dashboard/dashboard.html
```

Na dashboard é possível alternar entre **Energia** e **Água**.

## Gerar novos dados

Energia:

```powershell
python src/energia/realtime/detetar_anomalias.py --modo baze
```

Energia num dia específico:

```powershell
python src/energia/realtime/detetar_anomalias.py --modo baze --data 2026-07-25
```

Água:

```powershell
python src/agua/realtime/detetar_anomalias.py --modo baze
```

Água num dia específico:

```powershell
python src/agua/realtime/detetar_anomalias.py --modo baze --data 2026-05-18
```
