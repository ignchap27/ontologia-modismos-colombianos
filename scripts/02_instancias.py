"""Genera datos/instancias.ttl con los modismos, sus acepciones y la geografía.

Las IRI salen del texto de cada cosa, nunca de contadores, para que al correrlo
otra vez salgan iguales.
"""
import json
import re
import sys
from collections import defaultdict

from rdflib import Graph, Literal, Namespace
from rdflib.namespace import RDF, RDFS, SDO, SKOS, XSD

sys.path.append(".")
import configuracion as cfg

MC = Namespace(cfg.ONT)
R = Namespace(cfg.RES)
E = cfg.EMNLP

g = Graph()
g.bind("mc", MC)
g.bind("r", R)
g.bind("skos", SKOS)
g.bind("schema", SDO)


def slug(texto):
    # minusculas y guiones, pero se dejan tildes y ñ para no juntar caña con cana
    return re.sub(r"[\W_]+", "-", texto.strip().lower()).strip("-")


def leer_json(ruta):
    with open(f"{E}/{ruta}", encoding="utf-8") as f:
        return json.load(f)


# geografía
# regiones naturales y macro regiones, igual que en Geo_Analysis.ipynb del articulo
regiones = ["Región Andina", "Región Caribe", "Región Pacífica", "Región Orinoquía",
            "Región Amazonía", "Región Insular"]
macro = {"Costa Atlántica": "Región Caribe",
         "Costa del Pacífico": "Región Pacífica",
         "Llanos Orientales": "Región Orinoquía"}
# departamento -> donde queda. Si está en una macro región se pone la macro región
departamentos = {
    "Antioquia": "Región Andina", "Boyacá": "Región Andina", "Caldas": "Región Andina",
    "Cundinamarca": "Región Andina", "Huila": "Región Andina", "Norte de Santander": "Región Andina",
    "Santander": "Región Andina", "Quindío": "Región Andina", "Risaralda": "Región Andina",
    "Tolima": "Región Andina",
    "Atlántico": "Costa Atlántica", "Bolívar": "Costa Atlántica", "Cesar": "Costa Atlántica",
    "Córdoba": "Costa Atlántica", "La Guajira": "Costa Atlántica", "Magdalena": "Costa Atlántica",
    "Sucre": "Costa Atlántica",
    "Chocó": "Costa del Pacífico", "Valle del Cauca": "Costa del Pacífico",
    "Cauca": "Costa del Pacífico", "Nariño": "Costa del Pacífico",
    "Meta": "Llanos Orientales", "Casanare": "Llanos Orientales", "Arauca": "Llanos Orientales",
    "Vichada": "Llanos Orientales",
    "Amazonas": "Región Amazonía", "Caquetá": "Región Amazonía", "Guainía": "Región Amazonía",
    "Guaviare": "Región Amazonía", "Putumayo": "Región Amazonía", "Vaupés": "Región Amazonía",
    "San Andrés y Providencia": "Región Insular",
}


def lugar(nombre):
    return R["lugar/" + slug(nombre)]


for nombre in regiones:
    g.add((lugar(nombre), RDF.type, MC.RegionNatural))
    g.add((lugar(nombre), RDFS.label, Literal(nombre, lang="es")))
for nombre, padre in macro.items():
    g.add((lugar(nombre), RDF.type, MC.MacroRegion))
    g.add((lugar(nombre), RDFS.label, Literal(nombre, lang="es")))
    g.add((lugar(nombre), MC.ubicadoEn, lugar(padre)))
for nombre, padre in departamentos.items():
    g.add((lugar(nombre), RDF.type, MC.Departamento))
    g.add((lugar(nombre), RDFS.label, Literal(nombre, lang="es")))
    g.add((lugar(nombre), MC.ubicadoEn, lugar(padre)))
# Bogotá es distrito capital, no hace parte de Cundinamarca, pero sí de la Región Andina
g.add((lugar("Bogotá"), RDF.type, MC.Ciudad))
g.add((lugar("Bogotá"), RDFS.label, Literal("Bogotá", lang="es")))
g.add((lugar("Bogotá"), MC.ubicadoEn, lugar("Región Andina")))
conocidos = set(regiones) | set(macro) | set(departamentos) | {"Bogotá"}

# diccionarios
diccionarios = {
    "DICOL": ("Diccionario de colombianismos del Instituto Caro y Cuervo",
              "https://dicol.caroycuervo.gov.co"),
    "BDC": ("Breve diccionario de colombianismos de la Academia Colombiana de la Lengua",
            "https://www.academiacolombianadelalengua.co"),
}
for sigla, (nombre, url) in diccionarios.items():
    d = R["diccionario/" + slug(sigla)]
    g.add((d, RDF.type, MC.Diccionario))
    g.add((d, RDFS.label, Literal(sigla, lang="es")))
    g.add((d, RDFS.comment, Literal(nombre, lang="es")))
    g.add((d, SDO.url, Literal(url, datatype=XSD.anyURI)))

# modismos, acepciones y ejemplos
filas = leer_json("01_dataset/Complete_DataSets/DataSet_Curados.json")
acepciones = defaultdict(int)
regionales = set()
for fila in filas:
    s = slug(fila["modismo"])
    m = R["modismo/" + s]
    texto = fila["modismo"].strip().rstrip(",")
    g.add((m, RDF.type, MC.Locucion if " " in texto else MC.ModismoUnipalabra))
    g.add((m, RDFS.label, Literal(texto, lang="es")))

    acepciones[s] += 1
    a = R[f"modismo/{s}/acepcion/{acepciones[s]}"]
    g.add((a, RDF.type, MC.Acepcion))
    g.add((m, MC.tieneAcepcion, a))
    g.add((a, SKOS.definition, Literal(fila["significado"].strip(), lang="es")))
    g.add((a, MC.fuente, R["diccionario/" + slug(fila["Fuente"])]))

    if fila["ejemplo"]:
        ej = R[f"modismo/{s}/acepcion/{acepciones[s]}/ejemplo"]
        g.add((ej, RDF.type, MC.EjemploDeUso))
        g.add((a, MC.tieneEjemplo, ej))
        g.add((ej, MC.textoEjemplo, Literal(fila["ejemplo"].strip(), lang="es")))

    if fila["región"]:
        for nombre in fila["región"].split(","):
            nombre = nombre.strip()
            assert nombre in conocidos, nombre
            g.add((m, MC.usadoEn, lugar(nombre)))
            regionales.add(s)
print(len(acepciones), "modismos,", len(filas), "acepciones,", len(regionales), "con región")

g.serialize("datos/instancias.ttl", format="turtle")
print(len(g), "triples en datos/instancias.ttl")

# una muestra pequeña en JSON-LD, solo para mostrar el formato
muestra = Graph()
muestra.bind("mc", MC)
muestra.bind("r", R)
for s in ["a-juro", "raimundo"]:
    m = R["modismo/" + s]
    for t in g.triples((m, None, None)):
        muestra.add(t)
    for a in g.objects(m, MC.tieneAcepcion):
        for t in g.triples((a, None, None)):
            muestra.add(t)
contexto = {"mc": cfg.ONT, "r": cfg.RES, "rdfs": str(RDFS), "skos": str(SKOS)}
muestra.serialize("datos/muestra.jsonld", format="json-ld", context=contexto, indent=2)
