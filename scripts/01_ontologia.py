"""Genera ontologia/modcol.ttl. Solo el vocabulario, nada de datos."""
import sys

from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.collection import Collection
from rdflib.namespace import DCTERMS, OWL, RDF, RDFS, SDO, SKOS, XSD

sys.path.append(".")
import configuracion as cfg

MC = Namespace(cfg.ONT)
ONTOLEX = Namespace("http://www.w3.org/ns/lemon/ontolex#")

g = Graph()
g.bind("mc", MC)
g.bind("ontolex", ONTOLEX)
g.bind("skos", SKOS)
g.bind("dct", DCTERMS)
g.bind("schema", SDO)
g.bind("owl", OWL)

ont = URIRef(cfg.ONT.rstrip("#"))
g.add((ont, RDF.type, OWL.Ontology))
g.add((ont, RDFS.label, Literal("Ontología de modismos colombianos", lang="es")))
g.add((ont, RDFS.comment, Literal(
    "Modismos de Colombia con sus significados, ejemplos, regiones y diccionarios de origen.", lang="es")))


def describir(x, label, comment):
    g.add((x, RDFS.label, Literal(label, lang="es")))
    g.add((x, RDFS.comment, Literal(comment, lang="es")))


# clases
clases = [
    ("Modismo", "Modismo", "Palabra o expresión propia del habla colombiana.", ONTOLEX.LexicalEntry),
    ("Locucion", "Locución", "Modismo de varias palabras, por ejemplo a juro.", None),
    ("ModismoUnipalabra", "Modismo de una palabra", "Modismo de una sola palabra, por ejemplo achucutarse.", None),
    ("Acepcion", "Acepción", "Uno de los significados de un modismo.", ONTOLEX.LexicalSense),
    ("EjemploDeUso", "Ejemplo de uso", "Frase donde se usa el modismo con una acepción.", None),
    ("Diccionario", "Diccionario", "Obra de donde sale la acepción.", None),
    ("Lugar", "Lugar", "Lugar de Colombia donde se usa un modismo.", SDO.Place),
    ("RegionNatural", "Región natural", "Una de las seis regiones naturales de Colombia.", None),
    ("MacroRegion", "Macro región", "Zona más grande que un departamento y más chica que una región natural, como los Llanos Orientales.", None),
    ("Departamento", "Departamento", "Departamento de Colombia.", SDO.AdministrativeArea),
    ("Ciudad", "Ciudad", "Ciudad de Colombia.", SDO.City),
]
for nombre, label, comment, padre in clases:
    g.add((MC[nombre], RDF.type, OWL.Class))
    describir(MC[nombre], label, comment)
    if padre:
        g.add((MC[nombre], RDFS.subClassOf, padre))

for sub, sup in [("Locucion", "Modismo"), ("ModismoUnipalabra", "Modismo"),
                 ("RegionNatural", "Lugar"), ("MacroRegion", "Lugar"),
                 ("Departamento", "Lugar"), ("Ciudad", "Lugar")]:
    g.add((MC[sub], RDFS.subClassOf, MC[sup]))

# propiedades de objeto
objeto = [
    ("tieneAcepcion", "Modismo", "Acepcion", "tiene acepción", "Une el modismo con uno de sus significados.", ONTOLEX.sense),
    ("esAcepcionDe", "Acepcion", "Modismo", "es acepción de", "Inversa de tiene acepción.", None),
    ("tieneEjemplo", "Acepcion", "EjemploDeUso", "tiene ejemplo", "Ejemplo de uso de la acepción.", None),
    ("fuente", "Acepcion", "Diccionario", "fuente", "Diccionario de donde sale la acepción.", DCTERMS.source),
    ("usadoEn", "Modismo", "Lugar", "usado en", "Lugar donde se usa el modismo.", None),
    ("ubicadoEn", "Lugar", "Lugar", "ubicado en", "Un lugar queda dentro de otro más grande.", SDO.containedInPlace),
]
for nombre, dominio, rango, label, comment, padre in objeto:
    g.add((MC[nombre], RDF.type, OWL.ObjectProperty))
    describir(MC[nombre], label, comment)
    g.add((MC[nombre], RDFS.domain, MC[dominio]))
    g.add((MC[nombre], RDFS.range, MC[rango]))
    if padre:
        g.add((MC[nombre], RDFS.subPropertyOf, padre))

# propiedad de datos
g.add((MC.textoEjemplo, RDF.type, OWL.DatatypeProperty))
describir(MC.textoEjemplo, "texto del ejemplo", "La frase de ejemplo.")
g.add((MC.textoEjemplo, RDFS.domain, MC.EjemploDeUso))
g.add((MC.textoEjemplo, RDFS.range, XSD.string))

# axiomas OWL

# 1. una locución no puede ser de una sola palabra
g.add((MC.Locucion, OWL.disjointWith, MC.ModismoUnipalabra))

# 2. si un modismo tiene una acepción, la acepción es de ese modismo
g.add((MC.esAcepcionDe, OWL.inverseOf, MC.tieneAcepcion))

# 3. si Atlántico está en la Costa Atlántica y esta en la Región Caribe, Atlántico está en la Región Caribe
g.add((MC.ubicadoEn, RDF.type, OWL.TransitiveProperty))

# 4. si un modismo se usa en un lugar, se usa en los lugares que lo contienen
cadena = BNode()
Collection(g, cadena, [MC.usadoEn, MC.ubicadoEn])
g.add((MC.usadoEn, OWL.propertyChainAxiom, cadena))

# todo término propio tiene label y comment en español
for s in set(g.subjects(RDF.type, None)):
    if str(s).startswith(cfg.ONT):
        assert (s, RDFS.label, None) in g and (s, RDFS.comment, None) in g, s

g.serialize("ontologia/modcol.ttl", format="turtle")
print(len(g), "triples en ontologia/modcol.ttl")
