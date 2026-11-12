"""Corre owlrl sobre la ontología y los datos, revisa que no haya errores y guarda lo inferido.

Jena no sabe usar propertyChainAxiom, por eso el servicio OWL de Fuseki carga
lo que sale de aquí en datos/inferido.ttl.
"""
import sys
import time

import owlrl
from owlrl.Namespaces import ERRNS
from rdflib import Graph, Literal, Namespace
from rdflib.namespace import RDF

sys.path.append(".")
import configuracion as cfg

MC = Namespace(cfg.ONT)
R = Namespace(cfg.RES)


def razonar(g):
    owlrl.DeductiveClosure(owlrl.OWLRL_Semantics).expand(g)
    return list(g.objects(None, ERRNS.error))


def contar(g, consulta):
    return int(list(g.query("PREFIX mc: <%s> PREFIX r: <%s> %s" % (cfg.ONT, cfg.RES, consulta)))[0][0])


preguntas = {
    "modismos": "SELECT (COUNT(DISTINCT ?m) AS ?n) WHERE { ?m a mc:Modismo }",
    "usados en la Región Andina": f"SELECT (COUNT(DISTINCT ?m) AS ?n) WHERE {{ ?m mc:usadoEn <{cfg.RES}lugar/región-andina> }}",
    "acepciones con esAcepcionDe": "SELECT (COUNT(DISTINCT ?a) AS ?n) WHERE { ?a mc:esAcepcionDe ?m }",
    "lugares dentro de la Región Caribe": f"SELECT (COUNT(DISTINCT ?l) AS ?n) WHERE {{ ?l mc:ubicadoEn <{cfg.RES}lugar/región-caribe> }}",
}

t0 = time.time()
base = Graph().parse("ontologia/modcol.ttl")
base.parse("datos/instancias.ttl")
g = Graph()
for t in base:
    g.add(t)
antes = {k: contar(g, q) for k, q in preguntas.items()}
print(f"{len(g)} triples antes de razonar ({time.time() - t0:.0f} s)")

t0 = time.time()
errores = razonar(g)
assert not errores, errores[:5]
print(f"{len(g)} triples después de owlrl ({time.time() - t0:.0f} s), sin inconsistencias")

print(f"\n{'pregunta':38} {'sin razonar':>12} {'con owlrl':>10}")
for k, q in preguntas.items():
    print(f"{k:38} {antes[k]:>12} {contar(g, q):>10}")

# solo se guarda lo nuevo, la parte base ya está en los otros archivos
# owlrl también deja triples con literales de sujeto, esos no se pueden escribir en turtle
nuevo = Graph()
nuevo.bind("mc", MC)
nuevo.bind("r", R)
for s, p, o in g:
    if (s, p, o) not in base and not isinstance(s, Literal):
        nuevo.add((s, p, o))
nuevo.serialize("datos/inferido.ttl", format="turtle")
print(f"\n{len(nuevo)} triples nuevos en datos/inferido.ttl")

# prueba de que el razonador sí detecta errores. Un modismo no puede ser locución y de una palabra
malo = Graph().parse("ontologia/modcol.ttl")
malo.add((R["modismo/prueba"], RDF.type, MC.Locucion))
malo.add((R["modismo/prueba"], RDF.type, MC.ModismoUnipalabra))
errores = razonar(malo)
assert errores
print("\nprueba con un modismo locución y unipalabra a la vez:")
print(" ", str(errores[0])[:200])
