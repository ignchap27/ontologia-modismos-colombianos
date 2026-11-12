# CLAUDE.md

Ontología de modismos colombianos. Mini proyecto que reemplaza el parcial 2 de Web Semántica (ISIS4514, Uniandes, 2026 segundo semestre). Los datos salen del artículo EMNLP 2026 (`/Users/ignacio/Developer/Modismos_EMNLP_2026`). Los dos archivos que se usan están copiados en `fuentes/` para que el repo funcione solo. El informe para el profesor es `README.md`, léelo después de este archivo.

El alcance es solo modismos, acepciones, ejemplos, diccionarios y lugares, más el enlace con Wikidata. Hay 4 axiomas OWL y 3 preguntas de competencia. El usuario recortó a propósito la evaluación de modelos (respuestas, juicios humanos, puntajes, ranking) y GraphRAG para que el proyecto parezca hecho por una persona. No vuelvas a agregar evaluación, axiomas, consultas ni funciones nuevas sin preguntar. Ante la duda, menos.

## Reglas

1. Todo el código y el texto tienen que parecer escritos por una persona. Muy sencillo y básico.
2. En la prosa de los README y comentarios no se usan `:` `;` `-` ni guiones largos. Tampoco palabras rebuscadas. Se prefieren listas numeradas o párrafos cortos.
3. Los scripts son planos, de arriba a abajo, como los de los talleres. Nada de clases ni abstracciones. Variables y comentarios en español.
4. El repo EMNLP solo se lee, nunca se escribe.
5. El usuario edita archivos por su cuenta. Si algo cambió en disco es decisión suya, no lo reviertas sin preguntar.

## Comandos

Todo se corre desde la carpeta `parcial_2` con `.venv/bin/python` (Python 3.14, rdflib 7.6, owlrl 7.6, pyshacl 0.40, unidecode, requests).

```
docker compose up -d --build          # Fuseki en :3030 (admin/admin) y página en :8000, los datos ya están generados

# regenerar todo después de cambiar ontología o datos
.venv/bin/python scripts/02_instancias.py
.venv/bin/python scripts/03_wikidata.py
.venv/bin/python scripts/04_razonar.py
.venv/bin/python scripts/05_validar.py
docker compose up -d --force-recreate   # Fuseki tarda en cargar los archivos
.venv/bin/python scripts/06_consultas.py
.venv/bin/python scripts/09_exportar_web.py
```

La página es React con Vite en `web/`. Para cambiarla `cd web && npm run dev` (http://localhost:5173, recarga en vivo). Para que :8000 la tome hay que `docker compose up -d --build web`, la imagen compila con node y sirve `dist` con nginx.

## Estructura

| Ruta | Qué hace |
|---|---|
| `configuracion.py` | Carpeta `fuentes`, espacios de nombres, URL de Fuseki y nombres de los servicios |
| `ontologia/modcol.ttl` | Ontología escrita a mano (93 triples, solo vocabulario). No la genera ningún script |
| `scripts/02_instancias.py` | Genera `datos/instancias.ttl` (59121 triples) y `datos/muestra.jsonld` |
| `scripts/03_wikidata.py` | Reconciliación con Wikidata por señales, igual que el taller 5. Genera `datos/enlaces_wikidata.ttl` (33 `owl:sameAs`) |
| `scripts/04_razonar.py` | owlrl sobre todo el grafo (unos 15 s), tabla antes y después, prueba de inconsistencia. Genera `datos/inferido.ttl` |
| `scripts/05_validar.py` | pyshacl con `shapes/modcol-shapes.ttl`. Los datos reales pasan y `datos/error_instancias.ttl` falla con 4 violaciones |
| `fuseki/config.ttl` | Servicios en memoria `modcol-base`, `modcol-rdfs` y `modcol-owl` que cargan los archivos al arrancar |
| `scripts/06_consultas.py` | Corre `consultas/cq1.rq` a `cq3.rq` en los tres servicios, guarda en `resultados/` y completa la CQ3 con la población de Wikidata |
| `scripts/09_exportar_web.py` | Saca con SPARQL lo que necesita la página y lo guarda en `web/public/datos.json`. Copia el TopoJSON a `web/public/colombia.json` |
| `web/src/` | React. `App.jsx` pestañas y rutas, `Datos.jsx` con `Mapa.jsx` y `Ficha.jsx`, `Grafo.jsx`, `Consultas.jsx`, `fuseki.js` |
| `web/Dockerfile` | Compila con node y sirve con nginx (`web/nginx.conf`). Se construye desde la raíz para que entren los `.rq` |

No existen `01`, `07` ni `08` y no hace falta renumerar.

## Ontología

1. Vocabulario en `http://example.org/modcol/ontologia#` con prefijo `mc`. Datos en `http://example.org/modcol/recurso/` con prefijo `r`.
2. Las IRI de datos salen del texto, nunca de contadores, y conservan tildes y ñ (`r:lugar/región-andina`). Con `unidecode` chocaban `caña` y `cana`. En SPARQL usa un prefijo como `lugar:` o la IRI completa entre `<>`.
3. Los 4 axiomas son `Locucion disjointWith ModismoUnipalabra`, `esAcepcionDe inverseOf tieneAcepcion`, `ubicadoEn` transitiva y la cadena `usadoEn o ubicadoEn` implica `usadoEn`.
4. Vocabularios reusados son OntoLex, SKOS, Dublin Core y schema.org.

## Cosas que ya se descubrieron

1. **Jena no maneja `propertyChainAxiom`.** Por eso `modcol-owl` no usa un razonador de Jena, carga lo que infirió owlrl en `inferido.ttl`. Jena solo se usa para RDFS.
2. **Geografía.** Regiones naturales y macro regiones vienen de `REGION_GROUPS` y `REGION_AGGREGATES` en `Geo_Analysis.ipynb` del repo EMNLP. Se agregó la Región Insular para San Andrés. Bogotá es `mc:Ciudad` y queda directo en la Región Andina, no en Cundinamarca.
3. **Wikidata.** La clase de los departamentos es `Q215655`, no `Q215819`. Comparar un `str` con un `URIRef` de rdflib da `False`, por eso se usa `str(WD.Q739)`. Fuseki no puede hacer `SERVICE` a Wikidata porque responde 403, así que el cruce de la CQ3 se hace desde Python con `VALUES`. User-Agent `WebSemantica-Uniandes/1.0`.
4. **Fuseki.** La carpeta de configuración no puede montarse `:ro` porque la imagen escribe ahí.
5. **Dos cifras en el mapa.** Esto es lo que el usuario necesita poder explicar. Muchos modismos solo dicen la macro región (Costa Atlántica o Llanos Orientales) y no el departamento. La ontología infiere hacia arriba pero nunca hacia abajo, porque usarse en la Costa no implica usarse en Cesar. El artículo sí reparte cada macro región a sus departamentos solo para dibujar.
    1. Vista por región. Usa lo inferido y da Andina 320, Caribe 162, Pacífica 107 y Orinoquía 39, igual que la diapositiva 13 de la presentación EMNLP.
    2. Vista por departamento. Cuenta solo lo marcado directo, así que Cesar, Córdoba, Sucre, Meta, Casanare, Arauca y Vichada quedan en cero.
    3. Al hacer clic en un departamento salen los marcados en él y los que solo dicen su macro región (`datos.macros` en `datos.json`).
6. **Nombres del mapa.** En el TopoJSON algunos nombres llevan Ñ, como `NARIÑO`. `09_exportar_web.py` compara sin tildes y falla si alguno no cruza.
7. **Página.** San Andrés queda fuera del `fitSize` porque achica el mapa. Los bordes de región se arman con `topojson.merge`. La vista por departamento usa un solo azul con opacidad porque con grises en tema oscuro parecían vacíos. Colores de región como en la diapositiva, Andina rojo, Caribe naranja, Pacífica morado, Orinoquía verde y Amazonía gris.
8. **Pestaña Grafo.** D3 force, consulta Fuseki en vivo por el puerto 3030 (ya tiene CORS). Acepciones y ejemplos no tienen `rdfs:label` y su nombre sale de la IRI. Con inferencia OWL consulta `modcol-owl` y compara contra `modcol-base` para dibujar punteado lo inferido. Por nodo trae hasta 25 tripletas que llegan en nivel 1 y 6 en nivel 2.
9. **Pestaña Consultas.** Los `.rq` entran al bundle con `import.meta.glob` en `Consultas.jsx`, así que un `.rq` nuevo sale solo al recompilar. Por eso `vite.config.js` tiene `fs.allow` hacia `..`.
10. **Rutas.** react-router con `BrowserRouter`. Pestaña, modismo, vista del mapa, nivel y OWL van en la URL. `nginx.conf` manda todo a `index.html` con `try_files`. Cada pestaña recuerda su última URL en `App.jsx`.
11. **Grafo en React.** Nodos y enlaces viven en un `useRef` porque D3 los muta, y `version` avisa cuándo redibujar. Las respuestas viejas de Fuseki se descartan con una bandera en el efecto.

## Resultados clave, para no recalcular

1. Filas en base, rdfs y owl. CQ1 0, 0, 581. CQ2 289, 289, 298. CQ3 32, 32, 32.
2. owlrl sin y con razonar. Modismos 0 y 5284. Usados en la Región Andina 0 y 320. Acepciones con `esAcepcionDe` 0 y 8129.
3. Modismos por región. Andina 320, Caribe 162, Pacífica 107, Orinoquía 39, Amazonía 0 e Insular 0.

## Antes de terminar cualquier cambio

1. Si tocaste ontología o datos, corre todo el pipeline de arriba y revisa que 05 siga dando conforma True y 4 violaciones.
2. Revisa que el repo EMNLP siga igual con `git status` y `python tools/verify_integrity.py` dentro de él. Desde antes de este proyecto solo sale marcado su `CLAUDE.md` sin rastrear, eso es normal.
3. Revisa el estilo de los comentarios.

```
grep -nE '^\s*#.*([;—–]|[a-z]: )' scripts/*.py
grep -nE '^\s*//.*([;—–]|[a-z]: )' web/src/*
```
