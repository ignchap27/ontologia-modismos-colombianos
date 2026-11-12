// Fuseki corre en el mismo equipo, en el puerto 3030
export const FUSEKI = `${location.protocol === "https:" ? "https:" : "http:"}//${location.hostname || "localhost"}:3030`;
export const SIN_FUSEKI = `No se pudo consultar Fuseki en ${FUSEKI}. Revisa que esté prendido con docker compose up -d.`;

const PREFIJOS = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
`;

export function pedir(servicio, consulta) {
  return fetch(`${FUSEKI}/${servicio}/sparql`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
    body: new URLSearchParams({ query: consulta }),
  });
}

// para el grafo, ya trae los prefijos rdfs y owl y devuelve solo las filas
export async function sparql(servicio, consulta) {
  const r = await pedir(servicio, PREFIJOS + consulta);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).results.bindings;
}
