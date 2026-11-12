"""Enlaza los departamentos y Bogotá con Wikidata y guarda datos/enlaces_wikidata.ttl.

Igual que en el taller 5, se cuentan señales para decidir.
Tres señales da owl:sameAs, dos da skos:closeMatch y menos de dos no se enlaza.
Señales
1. el nombre coincide con la etiqueta o con un alias en español
2. en Wikidata es departamento de Colombia o distrito capital
3. en Wikidata el país es Colombia
"""
import sys

import requests
from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import OWL, RDF, RDFS, SKOS
from unidecode import unidecode

sys.path.append(".")
import configuracion as cfg

MC = Namespace(cfg.ONT)
WD = Namespace("http://www.wikidata.org/entity/")

consulta = """
SELECT ?d ?nombre ?tipo ?pais WHERE {
  VALUES ?tipo { wd:Q215655 wd:Q395994 }
  ?d wdt:P31 ?tipo .
  OPTIONAL { ?d wdt:P17 ?pais }
  { ?d rdfs:label ?nombre } UNION { ?d skos:altLabel ?nombre }
  FILTER (LANG(?nombre) = "es")
}
"""
r = requests.get("https://query.wikidata.org/sparql",
                 params={"query": consulta, "format": "json"},
                 headers={"User-Agent": "WebSemantica-Uniandes/1.0"}, timeout=120)
r.raise_for_status()


def normal(texto):
    texto = unidecode(texto).lower().replace("departamento de ", "").replace("departamento del ", "")
    return texto.replace(" d.c.", "").replace(",", "").strip()


# candidatos de Wikidata con sus nombres, si tienen el tipo y si el país es Colombia
candidatos = {}
for fila in r.json()["results"]["bindings"]:
    qid = fila["d"]["value"]
    c = candidatos.setdefault(qid, {"nombres": set(), "tipo": False, "pais": False})
    c["nombres"].add(normal(fila["nombre"]["value"]))
    c["tipo"] = True
    c["pais"] = c["pais"] or fila.get("pais", {}).get("value") == str(WD.Q739)
print(len(candidatos), "candidatos en Wikidata")

local = Graph().parse("datos/instancias.ttl")
enlaces = Graph()
enlaces.bind("wd", WD)
enlaces.bind("owl", OWL)
enlaces.bind("skos", SKOS)

lugares = list(local.subjects(RDF.type, MC.Departamento)) + list(local.subjects(RDF.type, MC.Ciudad))
iguales = cercanos = 0
for lugar in sorted(lugares):
    nombre = str(local.value(lugar, RDFS.label))
    mejor, senales = None, 0
    for qid, c in candidatos.items():
        n = (normal(nombre) in c["nombres"]) + c["tipo"] + c["pais"]
        # sin coincidir el nombre no vale la pena, todos los candidatos cumplen tipo y país
        if normal(nombre) in c["nombres"] and n > senales:
            mejor, senales = qid, n
    if senales == 3:
        enlaces.add((lugar, OWL.sameAs, URIRef(mejor)))
        iguales += 1
    elif senales == 2:
        enlaces.add((lugar, SKOS.closeMatch, URIRef(mejor)))
        cercanos += 1
    print(f"  {nombre:28} {senales} señales  {mejor or 'sin enlace'}")

enlaces.serialize("datos/enlaces_wikidata.ttl", format="turtle")
print(f"{iguales} owl:sameAs, {cercanos} skos:closeMatch, {len(lugares) - iguales - cercanos} sin enlace")
