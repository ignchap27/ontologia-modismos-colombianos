import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as d3 from "d3";
import { SIN_FUSEKI, sparql } from "./fuseki";

const RES = "http://example.org/modcol/recurso/";
// un lugar tiene cientos de modismos que le llegan, así que se muestran solo algunos
const ENTRADAS_NIVEL_1 = 25;
const ENTRADAS_NIVEL_2 = 6;
const ANCHO = 1000, ALTO = 620;
const colores = {
  modismo: "#b4532a", acepcion: "#3b82c4", ejemplo: "#2a8c8c", lugar: "#3f8f4a", diccionario: "#a0721c",
  vocabulario: "#6b665e",
};

function nombreCorto(iri) {
  return iri.split(/[#/]/).pop();
}

// las acepciones y ejemplos no tienen rdfs:label, se nombran con su IRI
// modismo/a-juro/acepcion/1 queda como acepcion 1
function etiquetaDe(iri, centro) {
  if (!iri.startsWith(RES)) return nombreCorto(iri);
  const partes = iri.slice(RES.length).split("/").slice(1);
  if (partes.length > 1 && partes[partes.length - 1] === nombreCorto(centro)) partes.pop();
  return decodeURIComponent(partes.join(" "));
}

function tipoDe(iri) {
  if (!iri.startsWith(RES)) return "vocabulario";
  const partes = iri.slice(RES.length).split("/");
  // modismo/a-juro/acepcion/1 es una acepción, no un modismo
  for (let i = partes.length - 2; i > 0; i--) {
    if (/^\d+$/.test(partes[i + 1]) && colores[partes[i]]) return partes[i];
  }
  return partes[0];
}

function color(tipo) {
  return tipo === "texto" ? "var(--borde)" : colores[tipo] || "#4a7a6a";
}

function recortar(texto) {
  return texto.length > 26 ? texto.slice(0, 25) + "…" : texto;
}

// lo que sale del nodo y algunas de las cosas que llegan a él
async function vecinos(iri, entradas, owl) {
  const filas = await sparql(owl ? "modcol-owl" : "modcol-base", `SELECT ?s ?p ?o ?ls ?lo WHERE {
    { <${iri}> ?p ?o BIND(<${iri}> AS ?s) }
    UNION { { SELECT ?s ?p WHERE { ?s ?p <${iri}> } ORDER BY ?s ?p LIMIT ${entradas} } BIND(<${iri}> AS ?o) }
    FILTER (?p != rdfs:label && ?o != owl:Thing && ?o != rdfs:Resource && !sameTerm(?s, ?o))
    OPTIONAL { ?s rdfs:label ?ls }
    OPTIONAL { ?o rdfs:label ?lo }
  }`);
  const utiles = filas.filter(f => f.s.type !== "bnode" && f.o.type !== "bnode");
  // con inferencia se pregunta al servicio base cuáles de esas relaciones estaban escritas en los datos
  let asertadas = null;
  if (owl) {
    const entran = [...new Set(utiles.filter(f => f.o.value === iri).map(f => `<${f.s.value}>`))];
    const base = await sparql("modcol-base", `SELECT ?s ?p ?o WHERE {
      { <${iri}> ?p ?o BIND(<${iri}> AS ?s) }
      ${entran.length ? `UNION { VALUES ?s { ${entran.join(" ")} } ?s ?p <${iri}> BIND(<${iri}> AS ?o) }` : ""}
    }`);
    asertadas = new Set(base.map(f => `${f.s.value} ${f.p.value} ${f.o.value}`));
  }
  return { filas: utiles, asertadas };
}

function agregarNodo(grafo, id, etiqueta, tipo, iri) {
  if (!grafo.nodos.has(id)) grafo.nodos.set(id, { id, etiqueta, tipo, iri, x: ANCHO / 2 + Math.random() * 40 - 20, y: ALTO / 2 + Math.random() * 40 - 20 });
  return grafo.nodos.get(id);
}

function agregar(grafo, { filas, asertadas }) {
  for (const f of filas) {
    const s = agregarNodo(grafo, f.s.value, f.ls ? f.ls.value : etiquetaDe(f.s.value, grafo.centro), tipoDe(f.s.value), f.s.value);
    let o;
    if (f.o.type === "uri") {
      o = agregarNodo(grafo, f.o.value, f.lo ? f.lo.value : etiquetaDe(f.o.value, grafo.centro), tipoDe(f.o.value), f.o.value);
    } else {
      // cada texto es un nodo aparte por sujeto, si no todos los true quedarían en un solo nodo
      o = agregarNodo(grafo, `${s.id} ${f.p.value} ${f.o.value}`, f.o.value, "texto", null);
    }
    const clave = `${s.id} > ${o.id}`;
    if (!grafo.enlaces.has(clave)) grafo.enlaces.set(clave, { source: s, target: o, predicados: new Set(), inferidos: new Set() });
    const e = grafo.enlaces.get(clave);
    const p = nombreCorto(f.p.value);
    e.predicados.add(p);
    if (asertadas && !asertadas.has(`${f.s.value} ${f.p.value} ${f.o.value}`)) e.inferidos.add(p);
  }
}

// busca el modismo por su nombre, trae sus vecinos y con nivel 2 también los de cada vecino
async function cargar(nombre, nivel, owl) {
  // JSON.stringify deja el texto entre comillas y escapado, que también sirve en SPARQL
  const filas = await sparql("modcol-base", `SELECT ?m WHERE {
    ?m rdfs:label ?l .
    FILTER (STRSTARTS(STR(?m), "${RES}modismo/") && LCASE(STR(?l)) = LCASE(${JSON.stringify(nombre.trim())}))
  } LIMIT 1`);
  if (!filas.length) return null;
  const centro = filas[0].m.value;
  const grafo = { centro, owl, nodos: new Map(), enlaces: new Map(), nuevo: true };
  agregar(grafo, await vecinos(centro, ENTRADAS_NIVEL_1, owl));
  const c = grafo.nodos.get(centro);
  if (c) { c.fx = ANCHO / 2; c.fy = ALTO / 2; }
  if (nivel === 2) {
    const otros = [...grafo.nodos.values()].filter(n => n.iri && n.iri !== centro && n.iri.startsWith(RES));
    for (const r of await Promise.all(otros.map(n => vecinos(n.iri, ENTRADAS_NIVEL_2, owl)))) agregar(grafo, r);
  }
  return grafo;
}

function visibles(grafo, ocultosPredicado, ocultosTipo) {
  const ns = [...grafo.nodos.values()].filter(n => n.id === grafo.centro || !ocultosTipo.has(n.tipo));
  const ids = new Set(ns.map(n => n.id));
  const es = [...grafo.enlaces.values()].filter(e => ids.has(e.source.id) && ids.has(e.target.id)
    && [...e.predicados].some(p => !ocultosPredicado.has(p)));
  // un nodo que quedó sin enlaces visibles se esconde
  const conectados = new Set([grafo.centro]);
  for (const e of es) { conectados.add(e.source.id); conectados.add(e.target.id); }
  return { ns: ns.filter(n => conectados.has(n.id)), es };
}

function mover(dibujo) {
  dibujo.capaEnlaces.selectAll("g").each(function (e) {
    // la flecha termina en el borde del nodo y no en su centro
    const dx = e.target.x - e.source.x, dy = e.target.y - e.source.y;
    const t = Math.min(Math.abs((e.target.ancho / 2 + 2) / (dx || 1e-6)), Math.abs(13 / (dy || 1e-6)), 1);
    const x2 = e.target.x - dx * t, y2 = e.target.y - dy * t;
    const g = d3.select(this);
    g.select("path").attr("d", `M${e.source.x},${e.source.y}L${x2},${y2}`);
    let angulo = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angulo > 90 || angulo < -90) angulo += 180;
    const mx = (e.source.x + e.target.x) / 2, my = (e.source.y + e.target.y) / 2;
    g.select("text").attr("transform", `translate(${mx},${my}) rotate(${angulo}) translate(0,-3)`);
  });
  dibujo.capaNodos.selectAll("g").attr("transform", n => `translate(${n.x},${n.y})`);
}

function encuadrar(dibujo) {
  if (!dibujo) return;
  const caja = dibujo.capa.node().getBBox();
  if (!caja.width) return;
  const escala = Math.min(0.92 * ANCHO / caja.width, 0.92 * ALTO / caja.height, 1.6);
  const x = ANCHO / 2 - escala * (caja.x + caja.width / 2), y = ALTO / 2 - escala * (caja.y + caja.height / 2);
  dibujo.svg.transition().duration(400).call(dibujo.zoom.transform, d3.zoomIdentity.translate(x, y).scale(escala));
}

function acercar(dibujo, factor) {
  if (dibujo) dibujo.svg.transition().duration(250).call(dibujo.zoom.scaleBy, factor);
}

// casillas para esconder relaciones o tipos de nodo que estorban
function Casillas({ conteos, ocultos, alCambiar, conMuestra }) {
  return [...conteos].sort((a, b) => b[1] - a[1]).map(([nombre, n]) => (
    <label key={nombre}>
      <input type="checkbox" checked={!ocultos.has(nombre)} onChange={() => alCambiar(nombre)} />
      {conMuestra && <span className="muestra" style={{ background: color(nombre) }} />}
      <span>{nombre} ({n})</span>
    </label>
  ));
}

function alternar(conjunto, nombre) {
  const nuevo = new Set(conjunto);
  nuevo.has(nombre) ? nuevo.delete(nombre) : nuevo.add(nombre);
  return nuevo;
}

export default function Grafo() {
  const { nombre } = useParams();
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const nivel = params.get("nivel") === "2" ? 2 : 1;
  const owl = params.get("owl") === "1";
  const [texto, setTexto] = useState(nombre);
  const [estado, setEstado] = useState("");
  const [ocultosPredicado, setOcultosPredicado] = useState(() => new Set());
  const [ocultosTipo, setOcultosTipo] = useState(() => new Set());
  // D3 cambia los nodos por dentro, por eso viven en un ref. version avisa que hay que redibujar
  const grafo = useRef(null);
  const [version, setVersion] = useState(0);
  const lienzo = useRef(null);
  const dibujo = useRef(null);

  useEffect(() => setTexto(nombre), [nombre]);

  // capas, zoom y simulación se arman una vez
  useEffect(() => {
    const svg = d3.select(lienzo.current);
    svg.append("defs").append("marker")
      .attr("id", "flecha").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
      .append("path").attr("d", "M0,-5L10,0L0,5").style("fill", "var(--suave)");
    const capa = svg.append("g");
    const d = { svg, capa, capaEnlaces: capa.append("g"), capaNodos: capa.append("g"), encuadrarAlTerminar: false };
    d.zoom = d3.zoom().scaleExtent([0.15, 4]).on("zoom", e => capa.attr("transform", e.transform));
    svg.call(d.zoom).on("dblclick.zoom", null);
    d.simulacion = d3.forceSimulation()
      .force("enlace", d3.forceLink().distance(e => e.target.tipo === "texto" ? 90 : 140))
      .force("carga", d3.forceManyBody().strength(-420))
      .force("choque", d3.forceCollide(n => n.ancho / 2 + 4))
      .force("x", d3.forceX(ANCHO / 2).strength(0.03))
      .force("y", d3.forceY(ALTO / 2).strength(0.03))
      .on("tick", () => mover(d))
      .on("end", () => { if (d.encuadrarAlTerminar) { d.encuadrarAlTerminar = false; encuadrar(d); } });
    dibujo.current = d;
    return () => {
      d.simulacion.stop();
      clearTimeout(d.espera);
      svg.on(".zoom", null).selectAll("*").remove();
      dibujo.current = null;
    };
  }, []);

  // cada vez que cambia el modismo, el nivel o la inferencia se vuelve a consultar
  // si llega una respuesta vieja se descarta para no mezclar grafos
  useEffect(() => {
    let vigente = true;
    setEstado("Consultando Fuseki...");
    cargar(nombre, nivel, owl)
      .then(g => {
        if (!vigente) return;
        if (!g) { setEstado(`No hay un modismo que se llame ${nombre}.`); return; }
        grafo.current = g;
        setVersion(v => v + 1);
      })
      .catch(error => {
        if (!vigente) return;
        setEstado(SIN_FUSEKI);
        console.error(error);
      });
    return () => { vigente = false; };
  }, [nombre, nivel, owl]);

  async function expandir(n) {
    const g = grafo.current;
    if (!n.iri || !g) return;
    setEstado(`Trayendo las conexiones de ${n.etiqueta}...`);
    try {
      const r = await vecinos(n.iri, ENTRADAS_NIVEL_1, g.owl);
      if (grafo.current !== g) return;
      agregar(g, r);
      setVersion(v => v + 1);
    } catch (error) {
      setEstado("No se pudo consultar Fuseki.");
      console.error(error);
    }
  }

  // dibujo con D3 cada vez que cambian los datos o los filtros
  useEffect(() => {
    const g = grafo.current, d = dibujo.current;
    if (!g || !d) return;
    const { ns, es } = visibles(g, ocultosPredicado, ocultosTipo);
    for (const n of ns) n.ancho = Math.min(n.etiqueta.length, 26) * 6.2 + 18;

    const enlace = d.capaEnlaces.selectAll("g").data(es, e => `${e.source.id} > ${e.target.id}`).join(entra => {
      const eg = entra.append("g");
      eg.append("path").attr("class", "enlace").attr("marker-end", "url(#flecha)");
      eg.append("text").attr("class", "predicado");
      return eg;
    });
    enlace.select("path").classed("inferido", e => e.inferidos.size === e.predicados.size);
    enlace.select("text").text(e => recortar([...e.predicados].filter(p => !ocultosPredicado.has(p)).join(", ")));

    const nodo = d.capaNodos.selectAll("g").data(ns, n => n.id).join(entra => {
      const ng = entra.append("g");
      ng.append("rect").attr("height", 22).attr("y", -11).attr("rx", 11);
      ng.append("text");
      ng.append("title");
      ng.call(d3.drag()
        .on("start", (e, n) => { if (!e.active) d.simulacion.alphaTarget(0.2).restart(); n.fx = n.x; n.fy = n.y; })
        .on("drag", (e, n) => { n.fx = e.x; n.fy = e.y; })
        .on("end", (e, n) => { if (!e.active) d.simulacion.alphaTarget(0); if (n.id !== grafo.current.centro) { n.fx = null; n.fy = null; } }));
      return ng;
    });
    nodo.attr("class", n => `nodo ${n.tipo === "texto" ? "texto" : ""} ${n.id === g.centro ? "centro" : ""}`);
    nodo.on("click", (e, n) => expandir(n));
    nodo.select("rect").attr("width", n => n.ancho).attr("x", n => -n.ancho / 2).style("fill", n => color(n.tipo));
    nodo.select("text").text(n => recortar(n.etiqueta));
    nodo.select("title").text(n => n.iri ? `${n.etiqueta}\n${n.iri}` : n.etiqueta);
    nodo.filter(n => n.id === g.centro).raise();

    d.simulacion.nodes(ns);
    d.simulacion.force("enlace").links(es);
    const nuevo = g.nuevo;
    g.nuevo = false;
    d.simulacion.alpha(nuevo ? 1 : 0.5).restart();
    d.encuadrarAlTerminar = nuevo;
    if (nuevo) {
      clearTimeout(d.espera);
      d.espera = setTimeout(() => encuadrar(dibujo.current), 900);
    }
    setEstado(`${ns.length} nodos y ${es.length} relaciones. Datos de ${g.owl ? "modcol-owl" : "modcol-base"}.`);
  }, [version, ocultosPredicado, ocultosTipo]);

  function cambiar(clave, valor) {
    setParams(p => { valor ? p.set(clave, valor) : p.delete(clave); return p; });
  }

  function buscar(valor) {
    const limpio = valor.trim();
    if (limpio && limpio !== nombre) navegar({ pathname: `/grafo/${encodeURIComponent(limpio)}`, search: params.toString() });
  }

  const g = grafo.current;
  const predicados = g ? d3.rollup([...g.enlaces.values()].flatMap(e => [...e.predicados]), v => v.length, p => p) : new Map();
  const tipos = g ? d3.rollup([...g.nodos.values()], v => v.length, n => n.tipo) : new Map();

  return (
    <>
      <h2>El grafo de un modismo</h2>
      <p className="suave">Se consulta en vivo a Fuseki. Busca un modismo para ver su nodo y sus relaciones.</p>
      <form onSubmit={e => { e.preventDefault(); buscar(texto); }}>
        <input list="opciones" placeholder="Escribe un modismo y presiona Enter, por ejemplo achucutarse" autoComplete="off"
          value={texto}
          onChange={e => {
            setTexto(e.target.value);
            // así llega el valor cuando se elige una opción de la lista
            if (e.nativeEvent.inputType === "insertReplacementText" || !e.nativeEvent.inputType) buscar(e.target.value);
          }} />
      </form>
      <div className="controles">
        <button className={nivel === 1 ? "activo" : ""} onClick={() => cambiar("nivel", null)}>Solo nivel 1</button>
        <button className={nivel === 2 ? "activo" : ""} onClick={() => cambiar("nivel", "2")}>Con nivel 2</button>
        <button onClick={() => encuadrar(dibujo.current)}>Reiniciar zoom</button>
        <label><input type="checkbox" checked={owl} onChange={e => cambiar("owl", e.target.checked ? "1" : null)} /> Con inferencia OWL</label>
      </div>
      <div className="lienzo">
        <svg id="grafo" ref={lienzo} viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Grafo del modismo con sus relaciones" />
        <div className="zoom">
          <button aria-label="Alejar" onClick={() => acercar(dibujo.current, 1 / 1.3)}>−</button>
          <button aria-label="Acercar" onClick={() => acercar(dibujo.current, 1.3)}>+</button>
        </div>
      </div>
      <p className="etiqueta" aria-live="polite">{estado}</p>
      <p className="suave">Arrastra los nodos para acomodarlos y arrastra el fondo para moverte. La rueda del mouse acerca y aleja. Haz clic en un nodo para traer sus conexiones. Con inferencia OWL las líneas punteadas son relaciones que agregó el razonador.</p>
      <div className="filtros">
        <details className="tarjeta">
          <summary>Relaciones ({predicados.size})</summary>
          <Casillas conteos={predicados} ocultos={ocultosPredicado} alCambiar={p => setOcultosPredicado(alternar(ocultosPredicado, p))} />
        </details>
        <details className="tarjeta">
          <summary>Tipos de nodo ({tipos.size})</summary>
          <Casillas conteos={tipos} ocultos={ocultosTipo} alCambiar={t => setOcultosTipo(alternar(ocultosTipo, t))} conMuestra />
        </details>
      </div>
    </>
  );
}
