import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { pedir, SIN_FUSEKI } from "./fuseki";

// los .rq de la carpeta consultas quedan dentro de la página al compilar
const archivos = import.meta.glob("../../consultas/*.rq", { query: "?raw", import: "default", eager: true });
const CONSULTAS = Object.entries(archivos)
  .map(([ruta, texto]) => ({ nombre: ruta.split("/").pop().replace(".rq", ""), texto }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre));
const MAXIMO_FILAS = 1000;

// los comentarios del archivo dicen qué pregunta responde
function descripcion(texto) {
  return texto.split("\n").filter(l => l.startsWith("#")).map(l => l.replace(/^#\s*/, "")).join(" ");
}

// los PREFIX de la consulta sirven para mostrar las IRI cortas
function prefijosDe(consulta) {
  return [...consulta.matchAll(/PREFIX\s+(\w*):\s*<([^>]+)>/gi)].map(m => [m[1], m[2]])
    .sort((a, b) => b[1].length - a[1].length);
}

function esNumero(v) {
  return v && v.datatype && /#(integer|decimal|double|float)$/.test(v.datatype);
}

function Tabla({ columnas, filas, prefijos }) {
  if (!filas.length) return <p className="suave">La consulta no devolvió filas.</p>;
  return (
    <table>
      <thead>
        <tr>{columnas.map(c => <th key={c} className={esNumero(filas[0][c]) ? "num" : undefined}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {filas.slice(0, MAXIMO_FILAS).map((f, i) => (
          <tr key={i}>
            {columnas.map(c => {
              const v = f[c];
              if (!v) return <td key={c} />;
              if (v.type === "uri") {
                const p = prefijos.find(([, base]) => v.value.startsWith(base));
                return <td key={c} title={v.value}>{p ? `${p[0]}:${v.value.slice(p[1].length)}` : v.value}</td>;
              }
              return <td key={c} className={esNumero(v) ? "num" : undefined}>{v.value}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Consultas() {
  const { cq } = useParams();
  const elegida = CONSULTAS.find(c => c.nombre === cq);
  const [texto, setTexto] = useState("");
  const [servicio, setServicio] = useState("modcol-owl");
  const [estado, setEstado] = useState("");
  const [resultado, setResultado] = useState(null);
  // si se corren dos seguidas solo se muestra la última
  const ultima = useRef(0);

  async function ejecutar(consulta, srv) {
    const turno = ++ultima.current;
    setEstado(`Corriendo en ${srv}...`);
    setResultado(null);
    const inicio = performance.now();
    try {
      const r = await pedir(srv, consulta);
      const cuerpo = await r.text();
      if (turno !== ultima.current) return;
      const ms = Math.round(performance.now() - inicio);
      if (!r.ok) {
        setEstado(`Fuseki respondió con error ${r.status}.`);
        setResultado({ error: cuerpo });
        return;
      }
      const json = JSON.parse(cuerpo);
      const filas = json.results.bindings;
      setResultado({ columnas: json.head.vars, filas, prefijos: prefijosDe(consulta) });
      setEstado(`${filas.length} filas en ${srv}, ${ms} ms.` + (filas.length > MAXIMO_FILAS ? ` Se muestran las primeras ${MAXIMO_FILAS}.` : ""));
    } catch (error) {
      if (turno !== ultima.current) return;
      setEstado(SIN_FUSEKI);
      console.error(error);
    }
  }

  useEffect(() => {
    if (!elegida) return;
    setTexto(elegida.texto);
    ejecutar(elegida.texto, servicio);
  }, [cq]);

  if (!elegida) return <Navigate to={`/consultas/${CONSULTAS[0].nombre}`} replace />;

  return (
    <>
      <h2>Preguntas de competencia</h2>
      <p className="suave">Son los archivos de la carpeta consultas. Al elegir una se corre en Fuseki y la tabla muestra lo que responde. La consulta se puede editar y volver a correr.</p>
      <div className="consultas">
        <nav className="menu-consultas">
          {CONSULTAS.map(c => <NavLink key={c.nombre} to={`/consultas/${c.nombre}`}>{c.nombre.toUpperCase()}</NavLink>)}
        </nav>
        <div>
          <p style={{ marginTop: 0 }}>{descripcion(elegida.texto)}</p>
          <textarea spellCheck="false" aria-label="Consulta SPARQL" value={texto}
            onChange={e => setTexto(e.target.value)}
            // Ctrl o Cmd con Enter corre la consulta desde el editor
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ejecutar(texto, servicio); }} />
          <div className="controles">
            <button className="activo" onClick={() => ejecutar(texto, servicio)}>Ejecutar</button>
            <label>Servicio
              <select value={servicio} onChange={e => { setServicio(e.target.value); ejecutar(texto, e.target.value); }}>
                <option value="modcol-base">modcol-base, sin inferencia</option>
                <option value="modcol-rdfs">modcol-rdfs, razonador RDFS</option>
                <option value="modcol-owl">modcol-owl, con lo inferido por OWL</option>
              </select>
            </label>
          </div>
          <p className="etiqueta" aria-live="polite">{estado}</p>
          <div className="tarjeta resultado">
            {resultado && resultado.error && <pre>{resultado.error}</pre>}
            {resultado && resultado.columnas && <Tabla {...resultado} />}
          </div>
        </div>
      </div>
    </>
  );
}
