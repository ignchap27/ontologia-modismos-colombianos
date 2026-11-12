import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import Datos from "./Datos";
import Grafo from "./Grafo";
import Consultas from "./Consultas";

const PESTANAS = ["datos", "grafo", "consultas"];

export default function App() {
  const [datos, setDatos] = useState(null);
  const [mapa, setMapa] = useState(null);
  const [error, setError] = useState(false);
  const ubicacion = useLocation();
  // cada pestaña recuerda dónde se quedó, así al volver no se pierde el modismo
  const [ultimas, setUltimas] = useState({ datos: "/", grafo: "/grafo", consultas: "/consultas" });

  useEffect(() => {
    Promise.all([fetch("/datos.json").then(r => r.json()), fetch("/colombia.json").then(r => r.json())])
      .then(([d, m]) => { setDatos(d); setMapa(m); })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const pestana = ubicacion.pathname.split("/")[1] || "datos";
    if (PESTANAS.includes(pestana)) setUltimas(u => ({ ...u, [pestana]: ubicacion.pathname + ubicacion.search }));
  }, [ubicacion]);

  let resumen = "Cargando datos...";
  if (error) resumen = "No se pudieron cargar los datos. Levanta la página con docker compose up -d y ábrela en http://localhost:8000.";
  else if (datos) {
    const regionales = datos.modismos.filter(m => m.lugares.length).length;
    resumen = `${datos.modismos.length} modismos sacados de DICOL y BDC y ${regionales} de ellos con región.`;
  }

  return (
    <main>
      <h1>Modismos colombianos</h1>
      <p className="suave">{resumen}</p>

      <nav className="pestanas">
        <NavLink to={ultimas.datos} end>Datos</NavLink>
        <NavLink to={ultimas.grafo}>Grafo</NavLink>
        <NavLink to={ultimas.consultas}>Consultas</NavLink>
      </nav>

      {/* la usan los buscadores de Datos y de Grafo */}
      <datalist id="opciones">
        {datos && datos.modismos.map((m, i) => <option key={i} value={m.nombre} />)}
      </datalist>

      <Routes>
        <Route path="/" element={datos && <Datos datos={datos} mapa={mapa} />} />
        <Route path="/grafo" element={<Navigate to="/grafo/achucutarse" replace />} />
        <Route path="/grafo/:nombre" element={<Grafo />} />
        <Route path="/consultas" element={<Navigate to="/consultas/cq1" replace />} />
        <Route path="/consultas/:cq" element={<Consultas />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
