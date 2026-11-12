"""Valida los datos con las formas SHACL usando pyshacl.

Primero los datos reales, que deben pasar. Después datos/error_instancias.ttl, que debe fallar.
"""
import sys
import time

from pyshacl import validate
from rdflib import Graph
from rdflib.namespace import SH

sys.path.append(".")

formas = Graph().parse("shapes/modcol-shapes.ttl")
ontologia = Graph().parse("ontologia/modcol.ttl")

# datos reales con lo que infirió owlrl, así ya están los tipos Modismo y ModismoPolisemico
t0 = time.time()
datos = Graph().parse("datos/instancias.ttl")
datos.parse("datos/inferido.ttl")
conforma, resultado, texto = validate(datos, shacl_graph=formas, ont_graph=ontologia, inference="none")
print(f"datos reales: conforma = {conforma} ({time.time() - t0:.0f} s)")
if not conforma:
    print(texto[:3000])

# datos con errores
malos = Graph().parse("datos/error_instancias.ttl")
conforma, resultado, texto = validate(malos, shacl_graph=formas, ont_graph=ontologia, inference="rdfs")
print(f"\ndatos con errores: conforma = {conforma}")
for r in resultado.subjects(SH.resultSeverity, SH.Violation):
    nodo = resultado.value(r, SH.focusNode)
    mensaje = resultado.value(r, SH.resultMessage)
    print(f"  {str(nodo).split('recurso/')[-1]:40} {mensaje}")

assert not conforma
