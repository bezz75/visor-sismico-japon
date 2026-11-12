"""
Recorta Japón de la textura (tesela D1 de Blue Marble) y del mapa de elevación global.
Genera dos imágenes con la MISMA zona y el MISMO tamaño, listas para three.js.

Uso:
    pip install pillow
    python recortar_japon.py

Antes de ejecutar, edita los nombres de archivo de la sección CONFIGURACIÓN.
"""

from PIL import Image

# Las imágenes de la NASA son enormes y Pillow avisa por seguridad. Lo desactivamos.
Image.MAX_IMAGE_PIXELS = None

# ───────────── CONFIGURACIÓN ─────────────
#ARCHIVO_TEXTURA = "world.topo.200407.3x21600x21600.D1.jpg"        # tesela D1 de Blue Marble
ARCHIVO_ELEVACION = "gebco_08_rev_bath_D1_grey_geo.jpg"  # mapa de elevación global (gris)

#SALIDA_TEXTURA = "japon_textura.jpg"
SALIDA_ELEVACION = "japon_batimetria.png"

# Zona a recortar (grados). Deben coincidir con los de la descarga de la USGS.
MIN_LON, MAX_LON = 128, 146
MIN_LAT, MAX_LAT = 30, 46

# Tamaño final de AMBAS imágenes (relación 18:16 = 1.125)
ANCHO_FINAL, ALTO_FINAL = 2160, 1920

# Cobertura de la tesela D1: longitud 90..180, latitud 0..90
TESELA_LON_MIN, TESELA_LAT_MAX = 90, 90

# Cobertura del archivo de ELEVACIÓN (ajústalo según lo que hayas descargado):
#   Mapa del mundo entero:  lon_min=-180, lat_max=90, ancho=360, alto=180
#   Tesela D1 (90°x90°):    lon_min=90,   lat_max=90, ancho=90,  alto=90
ELEV_LON_MIN, ELEV_LAT_MAX = 90, 90
ELEV_GRADOS_ANCHO, ELEV_GRADOS_ALTO = 90, 90

# Estira el contraste de la elevación para que el relieve de Japón se aprecie
REALZAR_CONTRASTE = True
# ─────────────────────────────────────────


def caja_recorte(ancho_img, alto_img, lon_min_img, lat_max_img, grados_ancho, grados_alto):
    """
    Convierte (lon, lat) a píxeles con una regla de tres, igual que Map2Range en el JS.
    La imagen cubre 'grados_ancho' x 'grados_alto', con su esquina superior izquierda
    en (lon_min_img, lat_max_img).
    """
    px_por_grado_x = ancho_img / grados_ancho
    px_por_grado_y = alto_img / grados_alto

    izquierda = (MIN_LON - lon_min_img) * px_por_grado_x
    derecha = (MAX_LON - lon_min_img) * px_por_grado_x
    arriba = (lat_max_img - MAX_LAT) * px_por_grado_y   # la y de la imagen crece hacia abajo
    abajo = (lat_max_img - MIN_LAT) * px_por_grado_y

    return tuple(round(v) for v in (izquierda, arriba, derecha, abajo))


# ---------- 1. Textura en color (tesela D1: 90° x 90°) ----------
print("Abriendo textura...")
#tex = Image.open(ARCHIVO_TEXTURA)
#caja = caja_recorte(tex.width, tex.height, TESELA_LON_MIN, TESELA_LAT_MAX, 90, 90)
#print(f"  Tamaño tesela: {tex.size}, recorte (izq, arriba, der, abajo): {caja}")
#tex_recorte = tex.crop(caja).convert("RGB")
#tex_recorte = tex_recorte.resize((ANCHO_FINAL, ALTO_FINAL), Image.LANCZOS)
#tex_recorte.save(SALIDA_TEXTURA, quality=92)
#print(f"  Guardada: {SALIDA_TEXTURA}")

# ---------- 2. Elevación (mapa global: lon -180..180, lat -90..90) ----------
print("Abriendo elevación...")
elev = Image.open(ARCHIVO_ELEVACION)
print(f"  Tamaño: {elev.size}, modo: {elev.mode}")
caja = caja_recorte(elev.width, elev.height, ELEV_LON_MIN, ELEV_LAT_MAX,
                    ELEV_GRADOS_ANCHO, ELEV_GRADOS_ALTO)
print(f"  Recorte (izq, arriba, der, abajo): {caja}")
elev_recorte = elev.crop(caja).convert("L")  # "L" = escala de grises
elev_recorte = elev_recorte.resize((ANCHO_FINAL, ALTO_FINAL), Image.LANCZOS)
if REALZAR_CONTRASTE:
    from PIL import ImageOps
    elev_recorte = ImageOps.autocontrast(elev_recorte)
elev_recorte.save(SALIDA_ELEVACION)
print(f"  Guardada: {SALIDA_ELEVACION}")

print("\nListo. Copia los dos archivos a la carpeta src/ de tu proyecto.")
print(f"En el código JS usa: minlon={MIN_LON}, maxlon={MAX_LON}, minlat={MIN_LAT}, maxlat={MAX_LAT}")