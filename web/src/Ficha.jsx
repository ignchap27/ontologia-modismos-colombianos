import { Link } from "react-router-dom";

export default function Ficha({ modismo }) {
  if (!modismo) {
    return <div className="tarjeta"><p className="suave" style={{ margin: 0 }}>Aquí sale la ficha del modismo.</p></div>;
  }
  return (
    <div className="tarjeta">
      <h3 style={{ marginTop: 0 }}>{modismo.nombre}</h3>
      {modismo.acepciones.map((a, i) => (
        <div className="acepcion" key={i}>
          <div>{a.definicion}</div>
          <div className="etiqueta">Fuente {a.fuente}</div>
          {a.ejemplo && <div className="ejemplo">{a.ejemplo}</div>}
        </div>
      ))}
      {modismo.lugares.length > 0 && <p className="suave">Se usa en {modismo.lugares.join(", ")}.</p>}
      <Link className="barra" style={{ width: "auto", display: "inline-block", textDecoration: "none" }}
        to={`/grafo/${encodeURIComponent(modismo.nombre)}`}>
        Ver en el grafo
      </Link>
    </div>
  );
}
