"""Corre consultas/cqN.rq en los tres servicios de Fuseki y guarda lo del servicio OWL en resultados/.

Al final completa la CQ3 con la población que trae Wikidata. Fuseki no puede usar SERVICE
contra Wikidata porque le responden 403 por el User-Agent, así que el cruce se hace aquí.
"""
import csv
import glob
import io
import os
import sys
import urllib.parse
import urllib.request

import requests

sys.path.append(".")
import configuracion as cfg


def preguntar(servicio, consulta):
    datos = urllib.parse.urlencode({"query": consulta}).encode()
    pedido = urllib.request.Request(f"{cfg.FUSEKI}/{servicio}/sparql", data=datos,
                                    headers={"Accept": "text/csv"})
    with urllib.request.urlopen(pedido, timeout=600) as r:
        return r.read().decode("utf-8")


os.makedirs("resultados", exist_ok=True)
print(f"{'consulta':16} {'base':>8} {'rdfs':>8} {'owl':>8}")
for ruta in sorted(glob.glob("consultas/*.rq")):
    nombre = os.path.basename(ruta)[:-3]
    consulta = open(ruta, encoding="utf-8").read()
    filas = []
    for servicio in cfg.SERVICIOS:
        texto = preguntar(servicio, consulta)
        filas.append(len(texto.strip().splitlines()) - 1)
    open(f"resultados/{nombre}.csv", "w", encoding="utf-8").write(texto)
    print(f"{nombre:16} {filas[0]:>8} {filas[1]:>8} {filas[2]:>8}")

# CQ3, segunda parte. Población de cada departamento en Wikidata
departamentos = list(csv.DictReader(io.StringIO(open("resultados/cq3.csv", encoding="utf-8").read())))
valores = " ".join(f"<{d['wikidata']}>" for d in departamentos)
consulta = f"SELECT ?d ?poblacion WHERE {{ VALUES ?d {{ {valores} }} ?d wdt:P1082 ?poblacion }}"
r = requests.get("https://query.wikidata.org/sparql", params={"query": consulta, "format": "json"},
                 headers={"User-Agent": "WebSemantica-Uniandes/1.0"}, timeout=120)
r.raise_for_status()
poblacion = {}
for fila in r.json()["results"]["bindings"]:
    # si hay varios censos se queda el más grande, que casi siempre es el más reciente
    d = fila["d"]["value"]
    poblacion[d] = max(poblacion.get(d, 0), int(float(fila["poblacion"]["value"])))

with open("resultados/cq3_wikidata.csv", "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["departamento", "modismos", "poblacion", "modismos_por_millon"])
    for d in departamentos:
        p = poblacion.get(d["wikidata"], 0)
        por_millon = round(int(d["modismos"]) / p * 1_000_000, 1) if p else ""
        w.writerow([d["departamento"], d["modismos"], p, por_millon])
print("\nCQ3 con población de Wikidata en resultados/cq3_wikidata.csv")
print(open("resultados/cq3_wikidata.csv", encoding="utf-8").read()[:600])
