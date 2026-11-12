# Ontología de modismos colombianos

Proyecto que reemplaza el parcial 2 de Web Semántica. La idea es tomar los modismos del artículo de modismos colombianos, con sus significados y las regiones donde se usan, y volverlos un grafo de conocimiento con RDF, RDFS, OWL y SHACL. Después se consulta con SPARQL en Fuseki, se enlaza con Wikidata y se ve en una página web.

Los datos salen del repo [Modismos_EMNLP_2026](https://github.com/SBobi/Modismos_EMNLP_2026). Copié los dos archivos que uso a la carpeta `fuentes/` para que este repo funcione solo. `DataSet_Curados.json` tiene los modismos con sus acepciones y lugares, y `Municipios-colombia.json` es el mapa de Colombia. Ese repo tiene licencia MIT, que va en `fuentes/LICENSE`.

## El problema

En Colombia se usan miles de modismos y muchos cambian de una región a otra. Los diccionarios DICOL y BDC los recogen, y el artículo los juntó en `DataSet_Curados.json` para probar si los modelos de lenguaje los entienden.

Ese archivo es una tabla plana de 8129 filas. Cada fila es un significado con cinco campos, que son `modismo`, `significado`, `ejemplo`, `región` y `Fuente`. Así viene `guámbito`.

```json
{"modismo": "guámbito", "significado": "Niño de corta edad.", "ejemplo": "¡Mijita, traiga el guámbito para bañarlo!", "región": null, "Fuente": "DICOL"}
{"modismo": "guámbito", "significado": "niño", "ejemplo": null, "región": "Huila, Tolima", "Fuente": "BDC"}
```

Con la tabla así hay cuatro problemas.

1. El mismo modismo se repite en varias filas y nada dice que las dos de arriba son un solo modismo con dos significados.
2. La región es texto libre. En 7572 filas viene vacía, a veces trae varios departamentos separados por coma (`Huila, Tolima`) y a veces una zona como `Costa Atlántica`.
3. Nada dice que Huila queda en la Región Andina. Para saber qué modismos se usan en la Región Andina habría que escribir la geografía a mano en cada consulta.
4. No se puede cruzar con otros datos, como la población de cada departamento.

La solución es volver la tabla un grafo de conocimiento. Una ontología dice qué es un modismo, una acepción y un lugar y cómo se relacionan. Un razonador completa lo que se deduce, por ejemplo que un modismo de Huila se usa en la Región Andina. SHACL revisa que los datos estén bien armados y Wikidata trae lo que el diccionario no tiene.

## Arquitectura de la solución

La ontología la escribí a mano en Turtle. Los datos salen de correr los scripts en orden, cada uno lee lo que dejó el anterior y escribe un archivo nuevo. Al final Fuseki carga esos archivos y la página los muestra.

```mermaid
flowchart TD
    fuentes[("fuentes/DataSet_Curados.json<br/>8129 filas copiadas del artículo")]
    mapa[("fuentes/Municipios-colombia.json<br/>mapa de Colombia")]
    wd[("Wikidata<br/>departamentos y población")]

    o1["ontologia/modcol.ttl escrita a mano<br/>clases, propiedades y los 4 axiomas<br/>93 triples, solo vocabulario"]

    s2["02_instancias.py<br/>junta las filas de cada modismo,<br/>separa las regiones y arma la geografía"]
    o2[("datos/instancias.ttl con 59121 triples<br/>datos/muestra.jsonld con 2 modismos")]
    fuentes --> s2 --> o2

    s3["03_wikidata.py<br/>busca cada departamento y Bogotá<br/>y cuenta tres señales"]
    o3[("datos/enlaces_wikidata.ttl<br/>33 owl:sameAs")]
    o2 --> s3
    wd -- "candidatos" --> s3
    s3 --> o3

    s4["04_razonar.py<br/>owlrl sobre ontología y datos,<br/>más una prueba de inconsistencia"]
    o4[("datos/inferido.ttl<br/>81157 triples deducidos")]
    o1 & o2 --> s4 --> o4

    shapes["shapes/modcol-shapes.ttl<br/>reglas SHACL"]
    errores["datos/error_instancias.ttl<br/>datos con errores a propósito"]
    s5["05_validar.py<br/>pyshacl"]
    r5(["datos reales conforman<br/>datos con errores dan 4 violaciones"])
    o1 & o2 & o4 & shapes & errores --> s5 --> r5

    conf["fuseki/config.ttl<br/>docker-compose.yml"]
    fuseki{{"Fuseki en el puerto 3030<br/>modcol-base sin razonar<br/>modcol-rdfs con RDFS de Jena<br/>modcol-owl con lo que dedujo owlrl"}}
    o1 & o2 & o3 & o4 & conf --> fuseki

    cq["consultas/cq1.rq a cq3.rq<br/>las 3 preguntas de competencia"]
    s6["06_consultas.py<br/>corre las CQ en los tres servicios"]
    o6[("resultados/cq1.csv a cq3.csv<br/>resultados/cq3_wikidata.csv")]
    cq & fuseki --> s6 --> o6
    wd -- "población con VALUES" --> s6

    s9["09_exportar_web.py<br/>saca con SPARQL lo que pide el mapa"]
    o9[("web/public/datos.json<br/>web/public/colombia.json")]
    fuseki & mapa & o6 --> s9 --> o9

    src["web/src<br/>React con las pestañas<br/>Datos, Grafo y Consultas"]
    web{{"Página en el puerto 8000"}}
    o9 & src & cq --> web
    web -. "Grafo y Consultas<br/>preguntan en vivo" .-> fuseki

    classDef yo fill:#fef3c7,stroke:#b45309,color:#000
    classDef generado fill:#dbeafe,stroke:#1d4ed8,color:#000
    classDef externo fill:#e5e7eb,stroke:#4b5563,color:#000
    classDef servicio fill:#dcfce7,stroke:#15803d,color:#000
    class o1,s2,s3,s4,s5,s6,s9,shapes,errores,conf,cq,src yo
    class o2,o3,o4,r5,o6,o9 generado
    class fuentes,mapa,wd externo
    class fuseki,web servicio
```

1. Amarillo es lo que escribí yo. Son los scripts, las reglas SHACL, los datos con errores, las consultas, la configuración de Fuseki y el código de la página. La ontología también la escribí yo a mano en `ontologia/modcol.ttl`.
2. Azul es lo que generan los scripts de Python. Ninguno de esos archivos se edita a mano, si algo cambia se vuelve a correr el script.
3. Gris es lo que viene de afuera. Son los dos archivos copiados del artículo y Wikidata.
4. Verde son los servicios que quedan corriendo con Docker.

Esto es lo que sale de cada paso.

1. `ontologia/modcol.ttl` tiene el vocabulario escrito a mano. Son 93 triples con las clases, las propiedades y los 4 axiomas, sin ningún dato.
2. `02_instancias.py` lee la tabla, junta las filas de cada modismo, separa `Huila, Tolima` en dos lugares y arma la geografía de regiones. Escribe `datos/instancias.ttl` con 5284 modismos y 8129 acepciones.
3. `03_wikidata.py` busca en Wikidata los 32 departamentos y Bogotá. Escribe `datos/enlaces_wikidata.ttl` con 33 `owl:sameAs`.
4. `04_razonar.py` corre owlrl y guarda en `datos/inferido.ttl` solo lo que dedujo, como `usadoEn` hasta la región.
5. `05_validar.py` revisa con SHACL. No escribe archivos, imprime que los datos reales pasan y que los datos con errores dan 4 violaciones.
6. Docker levanta Fuseki con tres servicios sobre los mismos archivos.
7. `06_consultas.py` corre las 3 preguntas de competencia en los tres servicios, completa la CQ3 con la población de Wikidata y guarda todo en `resultados/`.
8. `09_exportar_web.py` le pregunta a Fuseki lo que necesita el mapa y lo guarda en `web/public/datos.json`.
9. La página muestra `datos.json` en la pestaña Datos. Las pestañas Grafo y Consultas le preguntan a Fuseki en vivo.

## Metodología

Seguí estos pasos en orden. Cada uno dice qué hice y dónde quedó.

1. **Alcance.** Decidí cubrir solo modismos, acepciones, ejemplos, diccionarios y lugares. Escribí las 3 preguntas de competencia antes de poblar, para saber qué tenía que poder responder la ontología.
2. **Términos.** Revisé la tabla del artículo y saqué los términos que importan, que son modismo, significado, ejemplo, región y fuente.
3. **Reuso.** Busqué vocabularios que ya existían para no inventar nada. Usé OntoLex para modismos y acepciones, SKOS para las definiciones, Dublin Core para la fuente y schema.org para los lugares.
4. **Clases y propiedades.** Armé la jerarquía de clases y las propiedades con dominio y rango a mano en `ontologia/modcol.ttl`.
5. **Axiomas.** Agregué 4 axiomas OWL, cada uno porque es cierto en el dominio y no para llegar a un número.
6. **Instancias.** Poblé el grafo desde la tabla con `02_instancias.py`. Las IRI salen del texto, así que al volver a correr salen iguales.
7. **Enlace.** Uní departamentos y Bogotá con Wikidata en `03_wikidata.py`.
8. **Razonamiento.** Corrí owlrl en `04_razonar.py` y comparé antes y después. También probé que detecta una inconsistencia.
9. **Validación.** Revisé los datos con SHACL en `05_validar.py`, con datos reales y con datos que tienen errores puestos a propósito.
10. **Preguntas de competencia.** Las respondí en Fuseki en los tres servicios con `06_consultas.py`, para ver qué cambia con el razonamiento.
11. **Página.** Mostré el resultado en una página web con mapa, grafo y consultas.

No fue en línea recta. Varias veces tuve que volver a un paso anterior.

1. Al principio las IRI se hacían sin tildes con `unidecode`, y `caña` y `cana` quedaban como el mismo modismo. Volví al paso 6 y dejé las tildes.
2. En el paso 7 usé primero una clase de Wikidata equivocada para los departamentos (`Q215819`). La correcta es `Q215655`.
3. En el paso 10 vi que Jena no maneja la cadena de propiedades. Por eso el servicio OWL de Fuseki carga lo que dedujo owlrl en vez de razonar por su cuenta.

## Preguntas de competencia

Las escribí antes de poblar el grafo. Sirven para saber qué tiene que poder responder la ontología y para revisar el modelo.

| # | Tipo | Pregunta |
|---|---|---|
| CQ1 | Navegación | ¿Qué modismos se usan en la Región Andina, contando los que vienen de sus departamentos y de Bogotá? |
| CQ2 | Recuperación | ¿Qué acepciones tiene cada modismo de la Costa Atlántica con más de un significado y de qué diccionario sale cada una? |
| CQ3 | Agregación | ¿Cuántos modismos tiene cada departamento y cuántos habitantes tiene según Wikidata? |

## Cómo está armada la ontología

Hay dos partes que se conectan por el modismo.

**Léxico.** Un `mc:Modismo` tiene una o varias `mc:Acepcion`, cada acepción tiene su definición, su diccionario de origen (DICOL o BDC) y a veces un `mc:EjemploDeUso`. Los modismos se dividen en `mc:Locucion` (varias palabras) y `mc:ModismoUnipalabra`.

**Geografía.** `mc:Lugar` se divide en `mc:RegionNatural`, `mc:MacroRegion`, `mc:Departamento` y `mc:Ciudad`. Los lugares se unen con `mc:ubicadoEn`. Por ejemplo Atlántico queda en la Costa Atlántica, que queda en la Región Caribe. Un modismo se une a un lugar con `mc:usadoEn`.

Así queda todo junto.

```mermaid
flowchart LR
    Locucion -- subclase de --> Modismo
    ModismoUnipalabra -- subclase de --> Modismo
    Modismo -- subclase de --> le["ontolex:LexicalEntry"]
    Modismo -- "tieneAcepcion (ontolex:sense)" --> Acepcion
    Acepcion -- esAcepcionDe --> Modismo
    Acepcion -- subclase de --> ls["ontolex:LexicalSense"]
    Acepcion -- "fuente (dct:source)" --> Diccionario
    Acepcion -- tieneEjemplo --> EjemploDeUso
    Acepcion -. skos:definition .-> def(["texto"])
    EjemploDeUso -. textoEjemplo .-> ej(["texto"])
    Modismo -- usadoEn --> Lugar
    Lugar -- "ubicadoEn (schema:containedInPlace)" --> Lugar
    Lugar -- subclase de --> sp["schema:Place"]
    RegionNatural -- subclase de --> Lugar
    MacroRegion -- subclase de --> Lugar
    Departamento -- subclase de --> Lugar
    Departamento -- subclase de --> sa["schema:AdministrativeArea"]
    Ciudad -- subclase de --> Lugar
    Ciudad -- subclase de --> sc["schema:City"]
    Departamento -- owl:sameAs --> wd(["entidad de Wikidata<br/>con su población"])
    Ciudad -- owl:sameAs --> wd

    classDef propio fill:#dbeafe,stroke:#1d4ed8,color:#000
    classDef externo fill:#fef3c7,stroke:#b45309,color:#000
    classDef wikidata fill:#dcfce7,stroke:#15803d,color:#000
    class Modismo,Locucion,ModismoUnipalabra,Acepcion,Diccionario,EjemploDeUso,Lugar,RegionNatural,MacroRegion,Departamento,Ciudad propio
    class le,ls,sp,sa,sc externo
    class wd wikidata
```

1. Azul son las clases propias, con prefijo `mc`.
2. Amarillo son las clases de OntoLex y schema.org que extiendo.
3. Verde es lo que sale de Wikidata. La población de la CQ3 se trae de ahí.
4. Las flechas con nombre de propiedad unen una clase con otra. Entre paréntesis va la propiedad externa que extiende.
5. Las flechas punteadas llegan a un texto. `skos:definition` es de SKOS y `textoEjemplo` es propia.

Este es un modismo de verdad, `guámbito`, tal como queda en `datos/instancias.ttl`.

```mermaid
flowchart LR
    m["r:modismo/guámbito<br/>a mc:ModismoUnipalabra"]
    a1["acepcion/1"]
    a2["acepcion/2"]
    m -- tieneAcepcion --> a1
    m -- tieneAcepcion --> a2
    a1 -- fuente --> dicol["r:diccionario/dicol"]
    a2 -- fuente --> bdc["r:diccionario/bdc"]
    a1 -. skos:definition .-> d1(["Niño de corta edad."])
    a2 -. skos:definition .-> d2(["niño"])
    a1 -- tieneEjemplo --> e["acepcion/1/ejemplo"]
    e -. textoEjemplo .-> t(["¡Mijita, traiga el guámbito para bañarlo!"])
    m -- usadoEn --> huila["r:lugar/huila<br/>a mc:Departamento"]
    huila -- ubicadoEn --> andina["r:lugar/región-andina<br/>a mc:RegionNatural"]
    huila -- owl:sameAs --> wd(["wd:Q234920"])
    m == "usadoEn (inferido por OWL)" ==> andina

    classDef propio fill:#dbeafe,stroke:#1d4ed8,color:#000
    classDef wikidata fill:#dcfce7,stroke:#15803d,color:#000
    class m,a1,a2,dicol,bdc,e,huila,andina propio
    class wd wikidata
```

La flecha gruesa no está en los datos. La pone owlrl con la cadena `usadoEn` y `ubicadoEn`. En los datos `guámbito` también se usa en Tolima, pero no se dibujó para que no se llene.

### Vocabularios que reúso

No inventé lo que ya existe. Las clases y propiedades propias extienden otras sin redefinirlas.

| Término propio | Extiende a | Vocabulario |
|---|---|---|
| `mc:Modismo` | `ontolex:LexicalEntry` | OntoLex Lemon |
| `mc:Acepcion` y `mc:tieneAcepcion` | `ontolex:LexicalSense` y `ontolex:sense` | OntoLex Lemon |
| definición de una acepción | `skos:definition` | SKOS |
| `mc:fuente` | `dct:source` | Dublin Core |
| `mc:Lugar`, `mc:Departamento`, `mc:Ciudad` | `schema:Place`, `schema:AdministrativeArea`, `schema:City` | schema.org |
| `mc:ubicadoEn` | `schema:containedInPlace` | schema.org |

### Axiomas OWL

Cada axioma está porque es cierto en el dominio, no para llegar a un número.

| # | Tipo | Axioma | Por qué es cierto |
|---|---|---|---|
| 1 | Disyunción | `Locucion disjointWith ModismoUnipalabra` | Una expresión no puede tener una palabra y varias a la vez. |
| 2 | Inversa | `esAcepcionDe inverseOf tieneAcepcion` | Si un modismo tiene una acepción, la acepción es de ese modismo. |
| 3 | Transitiva | `ubicadoEn` es `TransitiveProperty` | Si Atlántico está en la Costa Atlántica y esta en la Región Caribe, Atlántico está en la Región Caribe. |
| 4 | Cadena de propiedades | `usadoEn o ubicadoEn` implica `usadoEn` | Si un modismo se usa en Nariño, también se usa en la Región Pacífica. |

## Datos

La ontología está escrita a mano y los datos se generan por código. Las IRI salen del texto de cada cosa, nunca de contadores, así que al volver a correr salen iguales. Por ejemplo `r:modismo/a-juro/acepcion/2` o `r:lugar/costa-atlántica`. Las IRI dejan tildes y ñ porque si no `caña` y `cana` quedaban como el mismo modismo. El vocabulario (`ontologia/modcol.ttl`, espacio `http://example.org/modcol/ontologia#`) y los datos (`datos/instancias.ttl`, espacio `http://example.org/modcol/recurso/`) van en archivos y espacios de nombres separados.

| Qué | Cuántos |
|---|---|
| Modismos | 5284 |
| Acepciones | 8129 |
| Modismos con región | 504 |
| Departamentos, macro regiones, regiones naturales y Bogotá | 32, 3, 6 y 1 |
| Triples de la ontología | 93 |
| Triples de datos | 59121 |
| Triples que agrega owlrl | 81157 |
| Enlaces a Wikidata | 33 |

Algunas decisiones sobre los datos.

1. Dos modismos se juntan con otro por el nombre (`chivo,` con `chivo` y `danza del Garabato` con `danza del garabato`). Por eso hay 5284 y no 5286.
2. `datos/muestra.jsonld` tiene dos modismos en JSON-LD para mostrar ese formato.

## Razonamiento

`scripts/04_razonar.py` corre owlrl sobre todo el grafo. Tarda unos quince segundos y no encuentra inconsistencias. Esto es lo que cambia.

| Consulta | Sin razonar | Con owlrl |
|---|---|---|
| modismos (`a mc:Modismo`) | 0 | 5284 |
| usados en la Región Andina | 0 | 320 |
| acepciones con `esAcepcionDe` | 0 | 8129 |
| lugares dentro de la Región Caribe | 1 | 8 |

En los datos ningún modismo dice que es `mc:Modismo`, solo `Locucion` o `ModismoUnipalabra`. El tipo `Modismo` lo pone la jerarquía de clases.

El script también prueba que el razonador encuentra errores. Mete un modismo que es locución y unipalabra a la vez y owlrl lo marca como inconsistente.

Los razonadores OWL de Jena no manejan `propertyChainAxiom`. Por eso en Fuseki el servicio OWL carga lo que infirió owlrl en `datos/inferido.ttl`, y Jena solo se usa para RDFS.

## SHACL

OWL infiere, SHACL revisa. `shapes/modcol-shapes.ttl` tiene formas para modismos, locuciones, modismos de una palabra, acepciones, ejemplos y departamentos. Usa `minCount`, `maxCount`, `datatype`, `class`, `pattern`, `minLength`, `in`, `or` y `node`.

`scripts/05_validar.py` valida con pyshacl. Los datos reales pasan. `datos/error_instancias.ttl` tiene tres errores puestos a propósito y SHACL encuentra los cuatro problemas que hay en ellos.

| Recurso | Problema |
|---|---|
| `modismo/berraco` | El modismo no tiene ninguna acepción. |
| `modismo/chévere` | Una locución debe tener más de una palabra. |
| `modismo/chévere/acepcion/1` | La acepción debe tener una sola definición. |
| `modismo/chévere/acepcion/1` | La fuente debe ser DICOL o BDC. |

## Fuseki y las preguntas de competencia

`docker-compose.yml` levanta Fuseki con tres servicios sobre los mismos archivos, igual que en el taller 3.

1. `modcol-base` tiene los datos tal cual.
2. `modcol-rdfs` usa el razonador RDFS de Jena.
3. `modcol-owl` tiene además lo que infirió owlrl.

`scripts/06_consultas.py` corre las consultas de `consultas/` en los tres y guarda lo del servicio OWL en `resultados/`. Este es el número de filas.

| Consulta | base | rdfs | owl |
|---|---|---|---|
| CQ1 | 0 | 0 | 581 |
| CQ2 | 289 | 289 | 298 |
| CQ3 | 32 | 32 | 32 |

CQ1 solo se puede responder con el razonamiento OWL porque usa la cadena de propiedades. CQ2 sale en los tres, pero sin razonar solo encuentra los modismos marcados directamente como Costa Atlántica y no los de sus departamentos.

Lo que dicen las respuestas.

1. CQ1. 320 modismos se usan en la Región Andina. Cundinamarca aporta 200 y Bogotá solo 5.
2. CQ2. Hay 97 modismos de la Costa Atlántica con más de un significado. En 79 de ellos un significado sale de DICOL y otro de BDC.
3. CQ3. Cundinamarca tiene más modismos (200), pero por habitante el primero es Boyacá.

## Wikidata

`scripts/03_wikidata.py` enlaza los 32 departamentos y Bogotá con Wikidata usando la misma regla del taller 5. Se cuentan tres señales.

1. El nombre coincide con la etiqueta o un alias en español.
2. En Wikidata es departamento de Colombia (Q215655) o distrito capital (Q395994).
3. El país es Colombia (Q739).

Con tres señales se pone `owl:sameAs`, con dos `skos:closeMatch` y con menos no se enlaza. Los 33 quedaron con `owl:sameAs`.

Para la CQ3 Fuseki no puede hacer `SERVICE` contra Wikidata porque le responden 403 por el User-Agent (lo vi en la lectura 4). Por eso el cruce se hace desde Python. Primero se cuentan los modismos por departamento en Fuseki y luego se pide la población a Wikidata con `VALUES`. El resultado está en `resultados/cq3_wikidata.csv`.

## Página web

`scripts/09_exportar_web.py` saca con SPARQL lo que necesita la página y lo guarda en `web/public/datos.json`. La página está hecha con React y Vite en la carpeta `web/`. Tiene un mapa de Colombia con las regiones naturales, barras con los modismos de cada región, la lista de modismos de cada departamento, y un buscador con la ficha de cada modismo (acepciones, ejemplos y lugares).

### Por qué hay dos cifras en el mapa

El mapa se puede ver por región o por departamento, y las cifras no cuadran a propósito.

Muchos modismos del diccionario no dicen el departamento, solo la macro región. Por ejemplo dicen Costa Atlántica o Llanos Orientales. La ontología guarda exactamente eso, `usadoEn r:lugar/costa-atlántica`, y el razonador infiere hacia arriba. Con la cadena `usadoEn` y `ubicadoEn` ese modismo queda usado también en la Región Caribe. Pero nunca infiere hacia abajo. Que un modismo se use en la Costa Atlántica no quiere decir que se use en Cesar o en Sucre, y OWL no afirma lo que no sabe.

Por eso la vista por región da lo mismo que el artículo (Andina 320, Caribe 162, Pacífica 107 y Orinoquía 39) y la vista por departamento deja en cero a Cesar, Córdoba, Sucre, Meta, Casanare, Arauca y Vichada.

| Región | Total | Con departamento | Solo con macro región |
|---|---|---|---|
| Andina | 320 | 320 | 0 |
| Caribe | 162 | 9 | 153 |
| Pacífica | 107 | 104 | 3 |
| Orinoquía | 39 | 0 | 39 |

El mapa del artículo (`Geo_Analysis.ipynb`) hace otra cosa. Reparte cada macro región a todos sus departamentos con `REGION_AGGREGATES`, así que allá Cesar aparece con 149 modismos. Es una forma de dibujar, no un dato del diccionario. Al hacer clic en un departamento la página muestra las dos cosas, los modismos marcados en el departamento y los que solo dicen su macro región.

Los departamentos de la Amazonía y San Andrés salen en cero en las dos vistas porque el diccionario no trae modismos de allí.

La pestaña Grafo muestra el nodo de un modismo con sus relaciones. Esta parte no usa `datos.json`, le pregunta en vivo a Fuseki desde el navegador.

1. Se busca un modismo por su `rdfs:label` y se traen las tripletas que salen de él y hasta 25 que llegan.
2. Con nivel 2 se traen también las conexiones de cada vecino.
3. Al hacer clic en un nodo se agregan sus conexiones.
4. Con inferencia OWL se consulta `modcol-owl` y las relaciones que no están en `modcol-base` salen punteadas. Así se ve lo que agregó el razonador, por ejemplo `usadoEn` hasta la región.
5. Las listas de relaciones y tipos de nodo sirven para esconder lo que estorba.

La pestaña Consultas tiene las preguntas de competencia de la carpeta `consultas/`. Al elegir una se corre en Fuseki y el resultado sale en una tabla. Se puede escoger el servicio (`modcol-base`, `modcol-rdfs` o `modcol-owl`) para ver qué cambia con cada razonador, y la consulta se puede editar y volver a correr con Ctrl y Enter.

Cada pestaña queda en la dirección del navegador, por ejemplo `/grafo/achucutarse?nivel=2&owl=1` o `/consultas/cq2`. Así se puede recargar o mandar el enlace sin perder lo que se estaba viendo, y los botones de atrás y adelante funcionan.

Con `docker compose up -d --build` se compila la página dentro de Docker y queda en http://localhost:8000, no hace falta tener Node. Para cambiar la página con recarga en vivo se usa Node 22.

```
cd web
npm install
npm run dev
```

Eso la abre en http://localhost:5173 y sigue usando Fuseki en el puerto 3030.

## Cómo correr todo

Los datos ya están generados, así que basta con un comando.

```
docker compose up -d --build
```

Eso prende Fuseki con la ontología, las instancias y lo inferido ya cargados en http://localhost:3030 (usuario admin y clave admin) y la página en http://localhost:8000. Fuseki tarda uno o dos minutos en cargar los archivos.

Para generar todo otra vez desde el repo del artículo se corren los scripts en orden.

```
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/02_instancias.py
.venv/bin/python scripts/03_wikidata.py
.venv/bin/python scripts/04_razonar.py
.venv/bin/python scripts/05_validar.py
docker compose up -d --force-recreate
.venv/bin/python scripts/06_consultas.py
.venv/bin/python scripts/09_exportar_web.py
```

Los scripts se corren desde esta carpeta.

## Qué se ve de cada tema del curso

| Tema | Dónde |
|---|---|
| RDF y formatos | `datos/instancias.ttl` en Turtle y `datos/muestra.jsonld` en JSON-LD |
| RDFS | jerarquías de clases y propiedades, dominios y rangos, servicio `modcol-rdfs` |
| OWL | 4 axiomas, owlrl, servicio `modcol-owl`, prueba de inconsistencia |
| SPARQL | 3 CQ con subconsulta, `GROUP BY`, `HAVING`, `OPTIONAL`, `FILTER` y caminos de propiedades |
| SHACL | `shapes/modcol-shapes.ttl` con pyshacl y datos con errores |
| Reuso de vocabularios | OntoLex, SKOS, Dublin Core y schema.org |
| Linked Data | `owl:sameAs` con Wikidata y cruce de datos con `VALUES` |
| Metodología | sección Metodología. CQ escritas antes de poblar, IRI reproducibles, vocabulario y datos separados |
