import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as d3 from "d3";
import Mapa, { colores } from "./Mapa";
import Ficha from "./Ficha";

const LEYENDAS = {
  region: "Cada número es la cantidad de modismos que se usan en la región. Incluye los que solo dicen la macro región, como Costa Atlántica o Llanos Orientales. Esto lo infiere OWL con la cadena usadoEn y ubicadoEn.",
  depto: "El azul muestra cuántos modismos tienen marcado ese departamento en el diccionario. Los que solo dicen Costa Atlántica o Llanos Orientales no tienen departamento, por eso Cesar, Córdoba, Sucre y los Llanos salen en cero.",
};

export default function Datos({ datos, mapa }) {
  // vista, región, departamento y modismo quedan en la URL
  const [params, setParams] = useSearchParams();
  const vista = params.get("vista") === "depto" ? "depto" : "region";
  const buscado = params.get("m") || "";
  const [texto, setTexto] = useState(buscado);

  const porNombre = useMemo(() => new Map(datos.modismos.map(m => [m.nombre, m])), [datos]);
  const deptos = useMemo(() => new Map(datos.departamentos.map(d => [d.mapa, d])), [datos]);
  const regiones = useMemo(() => new Map(datos.regiones.map(r => [r.nombre, r])), [datos]);
  const region = regiones.get(params.get("region"));
  const depto = deptos.get(params.get("depto"));
  const mayor = d3.max(datos.regiones, r => r.total);

  useEffect(() => setTexto(buscado), [buscado]);

  function cambiar(cambios, reemplazar = false) {
    setParams(p => {
      for (const [clave, valor] of Object.entries(cambios)) valor ? p.set(clave, valor) : p.delete(clave);
      return p;
    }, { replace: reemplazar });
  }

  // lo que sale en el panel de la derecha
  let titulo = "Haz clic en una región o en un departamento";
  let info = "";
  let grupos = [];
  if (region) {
    titulo = region.nombre;
    info = `${region.total} modismos en total. ${region.con_departamento} tienen marcado un departamento o ciudad de la región y ${region.total - region.con_departamento} solo dicen la macro región.`;
    grupos = [["", region.modismos]];
  } else if (depto) {
    titulo = depto.nombre;
    const sinDepto = depto.macro ? datos.macros[depto.macro] : [];
    const partes = [`${depto.modismos.length} modismos marcados en ${depto.nombre}.`];
    if (sinDepto.length) partes.push(`Además hay ${sinDepto.length} que solo dicen ${depto.macro}, sin decir el departamento.`);
    partes.push(`La ${depto.region} suma ${regiones.get(depto.region).total} en total.`);
    if (depto.poblacion) partes.push(`${depto.poblacion.toLocaleString("es-CO")} habitantes según Wikidata.`);
    info = partes.join(" ");
    if (depto.modismos.length) grupos.push(["Marcados en el departamento", depto.modismos]);
    if (sinDepto.length) grupos.push([`Solo dicen ${depto.macro}`, sinDepto]);
  }

  return (
    <>
      <h2>Dónde se usan</h2>
      <div className="columnas">
        <div className="tarjeta">
          <div className="vistas">
            <button className={vista === "region" ? "activo" : ""} onClick={() => cambiar({ vista: null }, true)}>Por región</button>
            <button className={vista === "depto" ? "activo" : ""} onClick={() => cambiar({ vista: "depto" }, true)}>Por departamento</button>
          </div>
          <Mapa datos={datos} mapa={mapa} vista={vista} activo={depto && depto.mapa}
            alElegir={d => cambiar({ depto: d, region: null })} />
          <p className="etiqueta">{LEYENDAS[vista]}</p>
        </div>
        <div className="tarjeta">
          {/* barras por región, como en la presentación del artículo */}
          {datos.regiones.filter(r => r.total).map(r => (
            <button key={r.nombre} className="barra" onClick={() => cambiar({ region: r.nombre, depto: null })}>
              <strong>{r.nombre}</strong> <span className="suave">{r.total}</span>
              <div className="fondo" style={{ width: `${(r.total / mayor) * 100}%`, background: colores[r.nombre] }} />
              <div className="etiqueta">{r.con_departamento} con departamento, {r.total - r.con_departamento} solo con macro región</div>
            </button>
          ))}
          <h3>{titulo}</h3>
          <p className="suave">{info}</p>
          <div className="lista">
            {grupos.map(([subtitulo, nombres]) => (
              <Fragment key={subtitulo}>
                {subtitulo && <h4>{subtitulo}</h4>}
                {nombres.map((n, i) => <button key={i} onClick={() => cambiar({ m: n })}>{n}</button>)}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <h2>Buscar un modismo</h2>
      <div className="columnas">
        <div>
          <input list="opciones" placeholder="Escribe un modismo, por ejemplo achucutarse" autoComplete="off"
            value={texto}
            onChange={e => {
              setTexto(e.target.value);
              const nombre = e.target.value.trim();
              if (porNombre.has(nombre)) cambiar({ m: nombre }, true);
            }} />
        </div>
        <Ficha modismo={porNombre.get(buscado)} />
      </div>
    </>
  );
}
