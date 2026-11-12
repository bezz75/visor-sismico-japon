import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

let scene, renderer, camera;
let camcontrols;
let mapsx,
  mapsy,
  scale = 4;

// Latitud y longitud de los extremos del mapa de la imagen
let minlon = 128,
  maxlon = 146;
let minlat = 30,
  maxlat = 46;

// Terremotos: aquí se guardan los datos y su esfera
const terremotos = [];
// Una única geometría de esfera (radio 1) compartida, el tamaño se da con .scale
const geoEsfera = new THREE.SphereGeometry(1, 12, 12);
const factorRadio = 0.012;
const crecimiento = 2; // por cada punto de magnitud, el radio se multiplica por este valor
const escalaRelieve = 0.35;
const margenEsferas = 0.01; // pequeña separación para que no queden enterradas en el terreno
const pxPorUnidad = 150; // solo para dibujar la leyenda (tamaño aproximado en píxeles)

// Píxeles de la imagen de elevación, para consultar la altura del terreno en cualquier punto
let dmData, dmW, dmH;
 
// Reloj simulado
let fechaMin, fechaMax, fechaActual;
const minutosPorFrame = 300;
const msVida = 30 * 24 * 60 * 60 * 1000; // cuánto tarda un terremoto en desvanecerse
// Color de cada esfera según la profundidad del terremoto (km)
const nivelesProf = [
  { hasta: 15,  color: 0xd50000, texto: "< 15 km" },       // rojo
  { hasta: 30,  color: 0xff9100, texto: "15 - 30 km" },    // naranja
  { hasta: 40,  color: 0xffea00, texto: "30 - 40 km" },    // amarillo
  { hasta: 70,  color: 0x00c853, texto: "40 - 70 km" },    // verde
  { hasta: 150, color: 0x00b8d4, texto: "70 - 150 km" },   // cian
  { hasta: Infinity, color: 0x2962ff, texto: "> 150 km" }, // azul
];

let datosCargados = false; // el reloj no arranca hasta tener el csv
let fecha2show; // div HTML con la fecha en pantalla
const opcionesfecha = { year: "numeric", month: "long", day: "numeric" };
 
init();
animate();

function init(){
  // Muestra fecha actual como título
  fecha2show = document.createElement("div");
  fecha2show.style.position = "absolute";
  fecha2show.style.top = "30px";
  fecha2show.style.width = "100%";
  fecha2show.style.textAlign = "center";
  fecha2show.style.color = "#fff";
  fecha2show.style.fontWeight = "bold";
  fecha2show.style.backgroundColor = "rgba(0, 0, 0, 0.65)";
  fecha2show.style.zIndex = "1";
  fecha2show.style.fontFamily = "Monospace";
  document.body.appendChild(fecha2show);
   
  crearLeyenda();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Posición de la cámara
  camera.position.set(0, -3, 4)

  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  camcontrols = new OrbitControls(camera, renderer.domElement);
  const light = new THREE.AmbientLight();
  scene.add(light);

  const dm = new THREE.TextureLoader().load(
    "src/japon_elevacion.png",
    function (dmTexture) {
      prepararAlturas(dmTexture.image);
    }
  );

  // CARGA TEXTURA (MAPA)
  // Crea plano
  const tx = new THREE.TextureLoader().load("src/japon_textura.jpg", function (texture) {
    const aspecto = texture.image.width / texture.image.height;
    mapsy = scale;
    mapsx = mapsy * aspecto;

    //
    // CARGA DE DATOS
    // Antes debe disponerse de las dimensiones de la textura, su carga debe haber finalizado
    // Lectura del archivo csv con localizaciones de los terremotos en la zona de japón
    fetch("src/terremotos2011.csv")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Error: " + response.statusText);
      }
      return response.text();
    })
    .then((content) => {
      procesarCSVTerremotos(content);
    })
    .catch((error) => {
      console.error("Error al cargar el archivo:", error);
    });

      //Elevación terrestre
      Plano(0, 0, 0, mapsx, mapsy, texture, dm);
 });

};

// Copia la imagen de elevación a un canvas oculto para poder leer sus píxeles
function prepararAlturas(imagen) {
  const canvas = document.createElement("canvas");
  canvas.width = imagen.width;
  canvas.height = imagen.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imagen, 0, 0);
  dmData = ctx.getImageData(0, 0, imagen.width, imagen.height).data;
  dmW = imagen.width;
  dmH = imagen.height;
}

// Altura del terreno en un punto, a partir de su longitud y latitud
function alturaTerreno(lon, lat) {
  // Posición dentro del mapa como porcentaje (0 a 1), igual que en Map2Range
  const u = (lon - minlon) / (maxlon - minlon);
  const v = (lat - minlat) / (maxlat - minlat);
 
  // Se pasa a píxel
  const col = Math.min(dmW - 1, Math.max(0, Math.round(u * (dmW - 1))));
  const fila = Math.min(dmH - 1, Math.max(0, Math.round((1 - v) * (dmH - 1))));
 
  const gris = dmData[(fila * dmW + col) * 4];
 
  return (gris / 255) * escalaRelieve;
}

function radioSegunMag(mag) {
  return factorRadio * Math.pow(crecimiento, mag - 4.5);
}

// Color según la profundidad: la primera franja cuyo límite supera la profundidad
function colorSegunProfundidad(prof) {
  for (const n of nivelesProf) {
    if (prof < n.hasta) return n.color;
  }
}
 
// Procesa el csv de la USGS
function procesarCSVTerremotos(content) {
  const sep = ",";
  const filas = content.split("\n");
 
  // Primera fila es el encabezado, separador ;
  const encabezados = filas[0].trim().split(sep);
  // Obtiene índices de columnas de interés
  const indices = {
    fecha: encabezados.indexOf("time"),
    lat: encabezados.indexOf("latitude"),
    lon: encabezados.indexOf("longitude"),
    prof: encabezados.indexOf("depth"),
    mag: encabezados.indexOf("mag"),
  };
  console.log(indices);
 
  // Extrae los datos de interés
  for (let i = 1; i < filas.length; i++) {
    const columna = filas[i].split(sep);
    if (columna.length < 5) continue; // fila vacía
 
    const lat = parseFloat(columna[indices.lat]);
    const lon = parseFloat(columna[indices.lon]);
    const mag = parseFloat(columna[indices.mag]);
    const prof = parseFloat(columna[indices.prof]) || 0; // si falta, 0 km
    if (isNaN(lat) || isNaN(lon) || isNaN(mag)) continue; // dato incompleto
 
    // Regla de tres: de grados a coordenadas del plano
    const x = Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
    const y = Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2);
 
    // Esfera en esa posición, con tamaño según la magnitud
    const material = new THREE.MeshBasicMaterial({ color: colorSegunProfundidad(prof), transparent: true });
    const mesh = new THREE.Mesh(geoEsfera, material);
    mesh.position.set(x, y, alturaTerreno(lon, lat) + margenEsferas);
    const radio = radioSegunMag(mag);
    mesh.scale.set(radio, radio, radio);
    scene.add(mesh);
 
    // Guardamos los datos
    terremotos.push({
      fecha: new Date(columna[indices.fecha]),
      lat: lat,
      lon: lon,
      prof: parseFloat(columna[indices.prof]),
      mag: mag,
      radio: radio,
      mesh: mesh,
    });

  }
  console.log("Terremotos cargados: " + terremotos.length);

  // Rango de fechas de los datos
  const tiempos = terremotos.map((t) => t.fecha.getTime());
  fechaMin = new Date(Math.min(...tiempos));
  fechaMax = new Date(Math.max(...tiempos));
  fechaActual = new Date(fechaMin); // el reloj arranca en el primer terremoto
  datosCargados = true;

}

// Leyenda HTML: colores = profundidad, tamaños = magnitud
function crearLeyenda() {
  const caja = document.createElement("div");
  caja.setAttribute("data-ui", "1");
  caja.style.cssText =
    "position:absolute; bottom:20px; left:20px; z-index:2; padding:10px 14px; background:rgba(0,0,0,0.65); color:#fff; font-family:Monospace; font-size:12px; border-radius:6px;";
 
  // Colores (se construyen a partir de la misma tabla que usan las esferas)
  let html = "<b>Profundidad</b><br>";
  for (const n of nivelesProf) {
    const css = "#" + n.color.toString(16).padStart(6, "0");
    html += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${css};margin-right:6px"></span>${n.texto}<br>`;
  }
 
  // Tamaños (aproximados: en pantalla dependen del zoom de la cámara)
  html += "<br><b>Magnitud</b> (tamaño aprox.)<br>";
  html += "<div style='display:flex;align-items:flex-end;gap:10px;margin-top:4px'>";
  for (const m of [5, 6, 7, 8]) {
    const d = Math.max(3, radioSegunMag(m) * 2 * pxPorUnidad);
    html += `<div style="text-align:center"><div style="width:${d}px;height:${d}px;border-radius:50%;border:1px solid #fff;margin:0 auto"></div>M${m}</div>`;
  }
  html += "</div>";
 
  caja.innerHTML = html;
  document.body.appendChild(caja);
}

// Dados los límites del mapa en latitud/longitud, mapea posiciones en ese rango
// valor, rango origen, rango destino
function Map2Range(val, vmin, vmax, dmin, dmax) {
  // Normaliza valor en el rango de partida, t=0 en vmin, t=1 en vmax
  const t = (val - vmin) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

function Plano(px, py, pz, sx, sy, txt, dismap) {
  let geometry = new THREE.PlaneBufferGeometry(sx, sy, 200, 200);
  let material = new THREE.MeshPhongMaterial({ wireframe: false });
  material.map = txt;
  material.displacementMap = dismap;
  material.displacementScale = 0.3;
  let mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  scene.add(mesh);
  
}

// Bucle de animación
function animate() {
  // Solo cuando el csv ya está cargado
  if (datosCargados) {
    // Actualiza fecha
    actualizarFecha();
    const visibles = actualizarTerremotos();
    // Modifica texto en pantalla
    fecha2show.innerHTML =
      fechaActual.toLocaleString("es-ES", opcionesfecha) +
      " · " +
      visibles +
      " terremotos en los últimos " +
      30 +
      " días";
  }
  requestAnimationFrame(animate);

  renderer.render(scene, camera);

}

// Avanza el reloj; al llegar al final de los datos, vuelve a empezar
function actualizarFecha() {
  fechaActual = new Date(fechaActual.getTime() + minutosPorFrame * 60000);
  if (fechaActual > fechaMax) {
    fechaActual = new Date(fechaMin);
  }
}

// Decide qué terremotos se ven en ese momento y con qué tamaño y opacidad
function actualizarTerremotos() {
  let visibles = 0;
  for (const q of terremotos) {
    const edad = fechaActual - q.fecha; // milisegundos desde que ocurrió
 
    if (edad >= 0 && edad <= msVida) {
      // t = 0 recién ocurrido, t = 1 a punto de desaparecer
      const t = edad / msVida;
      q.mesh.visible = true;
      q.mesh.material.opacity = 1 - t;
      const s = q.radio * (1.6 - 1.2 * t); // empieza grande y se encoge
      q.mesh.scale.set(s, s, s);
      visibles++;
    } else {
      q.mesh.visible = false;
    }
  }
  return visibles;
}