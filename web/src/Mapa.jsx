import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";

export const colores = {
  "Región Andina": "#c43c35", "Región Caribe": "#e8862e", "Región Insular": "#e8862e",
  "Región Pacífica": "#8e4fd6", "Región Orinoquía": "#3f8f4a", "Región Amazonía": "#9a968f",
};

export default function Mapa({ datos, mapa, vista, activo, alElegir }) {
  const lienzo = useRef(null);
  const elegir = useRef(alElegir);
  const deptos = useMemo(() => new Map(datos.departamentos.map(d => [d.mapa, d])), [datos]);
  const regiones = useMemo(() => new Map(datos.regiones.map(r => [r.nombre, r])), [datos]);

  useEffect(() => { elegir.current = alElegir; });

  // los departamentos y los bordes de región se dibujan una sola vez
  useEffect(() => {
    const svg = d3.select(lienzo.current);
    const formas = topojson.feature(mapa, mapa.objects.depts);
    // San Andrés queda muy lejos y achica todo el mapa, así que no cuenta para el encuadre
    const continente = { type: "FeatureCollection", features: formas.features.filter(f => !f.properties.dpt.startsWith("ARCHIPIELAGO")) };
    const camino = d3.geoPath(d3.geoMercator().fitSize([500, 560], continente));

    const pedazos = svg.selectAll("path.depto")
      .data(formas.features)
      .join("path")
      .attr("class", "depto")
      .attr("d", camino)
      .on("click", (evento, f) => elegir.current(f.properties.dpt));
    pedazos.append("title").text(f => {
      const d = deptos.get(f.properties.dpt);
      return `${d.nombre}, ${d.modismos.length} modismos marcados en el departamento`;
    });

    // bordes de cada región natural, uniendo sus departamentos
    const geometrias = mapa.objects.depts.geometries;
    for (const nombre of Object.keys(colores)) {
      const suyas = geometrias.filter(g => deptos.get(g.properties.dpt).region === nombre);
      if (!suyas.length) continue;
      const forma = topojson.merge(mapa, suyas);
      svg.append("path").attr("class", "region").attr("d", camino(forma)).attr("stroke", colores[nombre]);
      const r = regiones.get(nombre);
      if (r.total && nombre !== "Región Insular") {
        const [x, y] = camino.centroid(forma);
        svg.append("text").attr("class", "cifra").attr("x", x).attr("y", y + 8).text(r.total);
      }
    }
    return () => svg.selectAll("*").remove();
  }, [mapa, deptos, regiones]);

  // colores según la vista y borde del departamento elegido
  useEffect(() => {
    const svg = d3.select(lienzo.current);
    const pedazos = svg.selectAll("path.depto");
    const regionDe = f => deptos.get(f.properties.dpt).region;
    if (vista === "region") {
      pedazos.attr("fill", f => regiones.get(regionDe(f)).total ? colores[regionDe(f)] : "var(--borde)")
        .attr("fill-opacity", 0.3);
    } else {
      const maximo = d3.max(datos.departamentos, d => d.modismos.length);
      // más modismos, azul más fuerte. Con opacidad se ve bien en tema claro y oscuro
      const opacidad = d3.scaleSqrt([0, maximo], [0.15, 1]);
      pedazos.attr("fill", f => deptos.get(f.properties.dpt).modismos.length ? "#3b82c4" : "var(--borde)")
        .attr("fill-opacity", f => {
          const n = deptos.get(f.properties.dpt).modismos.length;
          return n ? opacidad(n) : 1;
        });
    }
    svg.selectAll("text.cifra").attr("display", vista === "region" ? null : "none");
    pedazos.classed("activo", f => f.properties.dpt === activo);
  }, [vista, activo, datos, deptos, regiones]);

  return <svg ref={lienzo} viewBox="0 0 500 560" role="img" aria-label="Mapa de Colombia por número de modismos" />;
}
