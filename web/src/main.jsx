import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./estilos.css";

createRoot(document.getElementById("raiz")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
