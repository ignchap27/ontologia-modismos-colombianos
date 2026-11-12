"""Saca de Fuseki (servicio modcol-owl) lo que necesita la página web y lo guarda en web/datos.json."""
import csv
import json
import shutil
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

from unidecode import unidecode

sys.path.append(".")
import configuracion as cfg

PREFIJOS = f"""PREFIX mc: <{cfg.ONT}>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
"""


def preguntar(consulta):
    datos = urllib.parse.urlencode({"query": PREFIJOS + consulta}).encode()
    pedido = urllib.request.Request(f"{cfg.FUSEKI}/modcol-owl/sparql", data=datos,
                                    headers={"Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(pedido, timeout=600) as r:
        filas = json.load(r)["results"]["bindings"]
    return [{k: v["value"] for k, v in f.items()} for f in filas]


modismos = {}
for f in preguntar("""SELECT ?m ?nombre ?definicion ?fuente ?ejemplo WHERE {
  ?m a mc:Modismo ; rdfs:label ?nombre ; mc:tieneAcepcion ?a .
  ?a skos:definition ?definicion ; mc:fuente/rdfs:label ?fuente .
  OPTIONAL { ?a mc:tieneEjemplo/mc:textoEjemplo ?ejemplo }
} ORDER BY ?m ?a"""):
    m = modismos.setdefault(f["m"], {"nombre": f["nombre"], "acepciones": [], "lugares": []})
    m["acepciones"].append({"definicion": f["definicion"], "fuente": f["fuente"], "ejemplo": f.get("ejemplo", "")})

# lugares asertados e inferidos, del más chico al más grande
for f in preguntar("""SELECT ?m ?lugar ?tipo WHERE {
  ?m mc:usadoEn ?l . ?l rdfs:label ?lugar ; a ?tipo .
  VALUES ?tipo { mc:Ciudad mc:Departamento mc:MacroRegion mc:RegionNatural }
}"""):
    orden = ["Ciudad", "Departamento", "MacroRegion", "RegionNatural"].index(f["tipo"].split("#")[-1])
    modismos[f["m"]]["lugares"].append((orden, f["lugar"]))

for m in modismos.values():
    m["lugares"] = [nombre for _, nombre in sorted(set(m["lugares"]))]

# departamentos, con la población que se trajo de Wikidata en scripts/06_consultas.py
# en el mapa los nombres van en mayúsculas y unos tienen tilde o ñ, como NARIÑO,
# así que se comparan los dos lados sin tildes y se guarda el nombre tal como está en el mapa
with open(f"{cfg.EMNLP}/04_metrics_es/DataSet/Municipios-colombia.json", encoding="utf-8") as f:
    en_mapa = {unidecode(g["properties"]["dpt"]): g["properties"]["dpt"]
               for g in json.load(f)["objects"]["depts"]["geometries"]}
nombres_mapa = {"SAN ANDRES Y PROVIDENCIA": "ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA",
                "BOGOTA": "SANTAFE DE BOGOTA D.C"}
departamentos = []
with open("resultados/cq3_wikidata.csv", encoding="utf-8") as f:
    for fila in csv.DictReader(f):
        nombre = unidecode(fila["departamento"]).upper()
        lista = sorted(m["nombre"] for m in modismos.values() if fila["departamento"] in m["lugares"])
        departamentos.append({"nombre": fila["departamento"], "mapa": en_mapa[nombres_mapa.get(nombre, nombre)],
                              "modismos": lista, "poblacion": int(fila["poblacion"] or 0)})

# Bogotá no es departamento pero sí sale en el mapa
departamentos.append({"nombre": "Bogotá", "mapa": en_mapa[nombres_mapa["BOGOTA"]], "poblacion": 0,
                      "modismos": sorted(m["nombre"] for m in modismos.values() if "Bogotá" in m["lugares"])})

# región natural y macro región de cada departamento y de Bogotá
padres = defaultdict(dict)
for f in preguntar("""SELECT ?lugar ?padre ?tipo WHERE {
  ?l rdfs:label ?lugar ; mc:ubicadoEn ?p . ?p rdfs:label ?padre ; a ?tipo .
  VALUES ?tipo { mc:MacroRegion mc:RegionNatural }
}"""):
    padres[f["lugar"]][f["tipo"].split("#")[-1]] = f["padre"]
for d in departamentos:
    d["region"] = padres[d["nombre"]]["RegionNatural"]
    d["macro"] = padres[d["nombre"]].get("MacroRegion", "")

# por cada región, cuántos modismos tiene en total (lo que infiere OWL)
# y cuántos tienen marcado un departamento o una ciudad de esa región
regiones = []
for f in preguntar("SELECT ?nombre WHERE { ?r a mc:RegionNatural ; rdfs:label ?nombre } ORDER BY ?nombre"):
    nombre = f["nombre"]
    lugares_dentro = {d["nombre"] for d in departamentos if d["region"] == nombre}
    total = [m for m in modismos.values() if nombre in m["lugares"]]
    con_depto = [m for m in total if lugares_dentro & set(m["lugares"])]
    regiones.append({"nombre": nombre, "total": len(total), "con_departamento": len(con_depto),
                     "modismos": sorted(m["nombre"] for m in total)})

# modismos que solo dicen la macro región, sin ningún departamento de ella
macros = {}
for macro in {d["macro"] for d in departamentos if d["macro"]}:
    lugares_dentro = {d["nombre"] for d in departamentos if d["macro"] == macro}
    macros[macro] = sorted(m["nombre"] for m in modismos.values()
                           if macro in m["lugares"] and not lugares_dentro & set(m["lugares"]))

salida = {"modismos": sorted(modismos.values(), key=lambda m: m["nombre"].lower()),
          "departamentos": departamentos,
          "regiones": sorted(regiones, key=lambda r: -r["total"]),
          "macros": macros}
with open("web/datos.json", "w", encoding="utf-8") as f:
    json.dump(salida, f, ensure_ascii=False)
shutil.copy(f"{cfg.EMNLP}/04_metrics_es/DataSet/Municipios-colombia.json", "web/colombia.json")
print(len(modismos), "modismos,", len(departamentos), "departamentos en web/datos.json")
