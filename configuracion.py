"""Rutas y nombres que usan todos los scripts."""
import os

# archivos copiados del repo del articulo de modismos (Modismos_EMNLP_2026, licencia MIT)
FUENTES = "fuentes"

# espacios de nombres: el vocabulario y los datos van separados
ONT = "http://example.org/modcol/ontologia#"
RES = "http://example.org/modcol/recurso/"

# Fuseki
FUSEKI = os.environ.get("FUSEKI_URL", "http://localhost:3030")
ADMIN = os.environ.get("FUSEKI_ADMIN", "admin:admin")
SERVICIOS = ["modcol-base", "modcol-rdfs", "modcol-owl"]
