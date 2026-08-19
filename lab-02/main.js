import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — PARÁMETROS
// ======================================================

const valoresIniciales = {
  columnas: 15,
  filas: 15,
  separacion: 1.2,
  amplitud: 3.0,
  frecuencia: 0.4,
  rotacion: 0.3,
  aleatoriedad: 0.0,
  semilla: 42,
};
const parametros = { ...valoresIniciales };

let inputA = 780;
let inputB = 772;
let deltaRR = 8;
let bpm = 0;

const biometria = {
  simulacionActiva: true,
  modo: "estres",
};

const DURACION_CAMBIO_BIOMETRICO = 800;

// ======================================================
// 02 — ESCENA
// ======================================================

const viewport = document.querySelector("#viewport");

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0b0b0c);

const camara = new THREE.PerspectiveCamera(
  42,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  200
);

camara.position.set(18, 16, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.target.set(0, 1.2, 0);

// Iluminación general.
const luzHemisferica = new THREE.HemisphereLight(0xf3efe5, 0x202229, 1.7);
escena.add(luzHemisferica);

// Luz principal.
const luzPrincipal = new THREE.DirectionalLight(0xffffff, 3.1);
luzPrincipal.position.set(8, 14, 9);
luzPrincipal.castShadow = true;
escena.add(luzPrincipal);

// Luz secundaria para suavizar el contraste.
const luzRelleno = new THREE.DirectionalLight(0xc8d8ff, 0.8);
luzRelleno.position.set(-8, 6, -6);
escena.add(luzRelleno);

// Plano base.
const suelo = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: 0x101114,
    roughness: 1,
    metalness: 0,
  })
);

suelo.rotation.x = -Math.PI / 2;
suelo.position.y = -0.03;
suelo.receiveShadow = true;
escena.add(suelo);

// Grilla de referencia para leer mejor escala y posición.
const grilla = new THREE.GridHelper(50, 50, 0x35383d, 0x202227);
grilla.position.y = 0.001;
escena.add(grilla);

// ======================================================
// 03 — OBJETO GENERATIVO
// ======================================================

const grupoCampo = new THREE.Group();
escena.add(grupoCampo);

const geometriaModulo = new THREE.BoxGeometry(0.76, 1, 0.76);

const materialModulo = new THREE.MeshStandardMaterial({
  color: 0xd7d2c8,
  roughness: 0.58,
  metalness: 0.03,
});

// ======================================================
// 04 — REGLAS GENERATIVAS
// ======================================================
// Estas funciones representan decisiones de diseño.
// Si cambian estas reglas, cambia la familia de resultados.

// Regla A:
// posición → distancia al centro → onda → altura
function calcularAlturaModulo(x, z) {
  const distancia = Math.sqrt(x * x + z * z);
  const pulso = (inputA + inputB) / 2 / 800;
  const tension = THREE.MathUtils.clamp(1 - deltaRR / 70, 0, 1);
  const ondaSuave = Math.sin(distancia * parametros.frecuencia) * parametros.amplitud;
  const ondaTensa =
    Math.sin(x * parametros.frecuencia * 2.4 + z * 0.8) *
    Math.cos(z * parametros.frecuencia * 1.8 - x * 0.45) *
    parametros.amplitud * 0.9;
  const ruido = aleatoriedadConSemilla(x, z, parametros.semilla) * parametros.aleatoriedad;
  const aspereza = aleatoriedadConSemilla(x * 1.7, z * 1.7, parametros.semilla + 11) * tension * 1.5;
  const onda = THREE.MathUtils.lerp(ondaSuave, ondaTensa + aspereza, tension);

  return Math.max(0.25, 1.2 + onda * pulso);
}

// Regla B:
// la orientación depende de la dirección radial respecto al centro.
function calcularRotacionModulo(x, z) {
  const direccion = Math.atan2(z, x);
  const tension = THREE.MathUtils.clamp(1 - deltaRR / 70, 0, 1);
  const torsion = Math.sin((x - z) * parametros.frecuencia * 1.8) * tension * 0.5;
  return direccion * parametros.rotacion * (0.65 + tension * 1.35) + torsion;
}

function actualizarColorSomatico() {
  const tension = THREE.MathUtils.clamp(1 - deltaRR / 70, 0, 1);
  const colorCalma = new THREE.Color(0x27c7d9);
  const colorTension = new THREE.Color(0xf04438);

  materialModulo.color.copy(colorCalma).lerp(colorTension, tension);
  materialModulo.emissive.copy(materialModulo.color).multiplyScalar(0.08 + tension * 0.12);
}

// ======================================================
// 05 — GENERAR CAMPO
// ======================================================

function generarCampo() {
  limpiarCampo();
  actualizarColorSomatico();

  const ancho = (parametros.columnas - 1) * parametros.separacion;
  const profundidad = (parametros.filas - 1) * parametros.separacion;

  for (let columna = 0; columna < parametros.columnas; columna++) {
    for (let fila = 0; fila < parametros.filas; fila++) {
      const x = columna * parametros.separacion - ancho / 2;
      const z = fila * parametros.separacion - profundidad / 2;

      const altura = calcularAlturaModulo(x, z);
      const rotacion = calcularRotacionModulo(x, z);

      const modulo = new THREE.Mesh(geometriaModulo, materialModulo);

      // Escalamos solo en Y para modificar la altura.
      modulo.scale.y = altura;

      // BoxGeometry crece hacia arriba y hacia abajo desde su centro.
      // Por eso elevamos el módulo la mitad de su altura.
      modulo.position.set(x, altura / 2, z);

      modulo.rotation.y = rotacion;
      modulo.castShadow = true;
      modulo.receiveShadow = true;

      grupoCampo.add(modulo);
    }
  }
}

function limpiarCampo() {
  while (grupoCampo.children.length > 0) {
    grupoCampo.remove(grupoCampo.children[0]);
  }
}

// ======================================================
// 06 — ALEATORIEDAD CONTROLADA
// ======================================================
// Devuelve un valor repetible entre -1 y 1.
// Una misma semilla produce siempre el mismo patrón.

function aleatoriedadConSemilla(x, z, semilla) {
  const valor =
    Math.sin(
      x * 12.9898 +
      z * 78.233 +
      semilla * 37.719
    ) * 43758.5453;

  const normalizado = valor - Math.floor(valor);

  return normalizado * 2 - 1;
}

// ======================================================
// 07 — INTERFAZ
// ======================================================

const controles = {
  columnas: document.querySelector("#columnas"),
  filas: document.querySelector("#filas"),
  separacion: document.querySelector("#separacion"),
  amplitud: document.querySelector("#amplitud"),
  frecuencia: document.querySelector("#frecuencia"),
  rotacion: document.querySelector("#rotacion"),
  aleatoriedad: document.querySelector("#aleatoriedad"),
  semilla: document.querySelector("#semilla"),
};

const valoresVisibles = {
  columnas: document.querySelector("#columnas-valor"),
  filas: document.querySelector("#filas-valor"),
  separacion: document.querySelector("#separacion-valor"),
  amplitud: document.querySelector("#amplitud-valor"),
  frecuencia: document.querySelector("#frecuencia-valor"),
  rotacion: document.querySelector("#rotacion-valor"),
  aleatoriedad: document.querySelector("#aleatoriedad-valor"),
  semilla: document.querySelector("#semilla-valor"),
};

const overlayBiometrico = document.createElement("aside");
overlayBiometrico.className = "biometric-overlay";
overlayBiometrico.innerHTML = `
  <div class="biometric-title">MODO HACKER · BIOFEEDBACK</div>
  <button class="biometric-connect" id="btn-conectar" type="button">CONECTAR COOSPO H6M</button>
  <output class="biometric-status"></output>
  <output class="biometric-readout"></output>
  <label>INPUT A <input class="biometric-input-a" type="range" min="600" max="1000" step="1" /></label>
  <label>INPUT B <input class="biometric-input-b" type="range" min="600" max="1000" step="1" /></label>
  <button class="biometric-toggle" type="button"></button>
`;
Object.assign(overlayBiometrico.style, {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  zIndex: "2",
  width: "min(25rem, calc(100% - 2rem))",
  padding: "0.8rem",
  color: "#b8fff0",
  background: "rgba(4, 12, 15, 0.86)",
  border: "1px solid rgba(39, 199, 217, 0.5)",
  fontFamily: "monospace",
  fontSize: "0.72rem",
  lineHeight: "1.5",
  boxSizing: "border-box",
});
overlayBiometrico.querySelectorAll("label").forEach((label) => {
  label.style.display = "grid";
  label.style.gap = "0.2rem";
  label.style.marginTop = "0.5rem";
});
overlayBiometrico.querySelectorAll("button").forEach((button) => {
  button.style.marginTop = "0.6rem";
  button.style.color = "#b8fff0";
  button.style.background = "transparent";
  button.style.border = "1px solid rgba(184, 255, 240, 0.45)";
  button.style.padding = "0.35rem 0.5rem";
  button.style.font = "inherit";
  button.style.cursor = "pointer";
});
viewport.appendChild(overlayBiometrico);

const estadoBluetooth = overlayBiometrico.querySelector(".biometric-status");
const lecturaBiometrica = overlayBiometrico.querySelector(".biometric-readout");
const controlInputA = overlayBiometrico.querySelector(".biometric-input-a");
const controlInputB = overlayBiometrico.querySelector(".biometric-input-b");
const botonSimulacion = overlayBiometrico.querySelector(".biometric-toggle");
const botonConectar = overlayBiometrico.querySelector("#btn-conectar");

let dispositivoBluetooth = null;
let caracteristicaFrecuenciaCardiaca = null;
let estadoConexion = "Desconectado · simulador activo";

function actualizarEstadoBluetooth(estado) {
  estadoConexion = estado;
  estadoBluetooth.textContent = `Estado: ${estado}`;
  actualizarLecturaBiometrica();
}

function decodificarMedicionFrecuenciaCardiaca(event) {
  const datos = event.target.value;
  if (!datos || datos.byteLength < 2) return;

  const banderas = datos.getUint8(0);
  const usaHR16Bits = (banderas & 0x01) !== 0;
  const tieneRR = (banderas & 0x10) !== 0;
  let indice = 1;

  bpm = usaHR16Bits ? datos.getUint16(indice, true) : datos.getUint8(indice);
  indice += usaHR16Bits ? 2 : 1;

  if ((banderas & 0x08) !== 0) indice += 2;

  if (!tieneRR || indice + 1 >= datos.byteLength) {
    actualizarLecturaBiometrica();
    return;
  }

  // Bluetooth SIG transmite RR en unidades de 1/1024 de segundo.
  while (indice + 1 < datos.byteLength) {
    const rrEnUnidadesBluetooth = datos.getUint16(indice, true);
    const rrMilisegundos = Math.round((rrEnUnidadesBluetooth * 1000) / 1024);
    indice += 2;

    if (rrMilisegundos >= 300 && rrMilisegundos <= 2000) {
      inputA = inputB;
      inputB = THREE.MathUtils.clamp(rrMilisegundos, 600, 1000);
      deltaRR = Math.abs(inputA - inputB);
      biometria.modo = deltaRR < 15 ? "estres" : "calma";
      generarCampo();
    }
  }

  actualizarLecturaBiometrica();
}

async function conectarSensorCardiaco() {
  if (!navigator.bluetooth) {
    actualizarEstadoBluetooth("Bluetooth no disponible en este navegador");
    return;
  }

  try {
    actualizarEstadoBluetooth("Buscando sensor...");
    dispositivoBluetooth = await navigator.bluetooth.requestDevice({
      filters: [{ services: ["heart_rate"] }],
      optionalServices: ["heart_rate"],
    });

    dispositivoBluetooth.addEventListener("gattserverdisconnected", () => {
      caracteristicaFrecuenciaCardiaca = null;
      actualizarEstadoBluetooth("Desconectado · usando fallback");
      biometria.simulacionActiva = true;
      actualizarLecturaBiometrica();
    });

    const servidor = await dispositivoBluetooth.gatt.connect();
    const servicio = await servidor.getPrimaryService("heart_rate");
    caracteristicaFrecuenciaCardiaca = await servicio.getCharacteristic("heart_rate_measurement");
    await caracteristicaFrecuenciaCardiaca.startNotifications();
    caracteristicaFrecuenciaCardiaca.addEventListener(
      "characteristicvaluechanged",
      decodificarMedicionFrecuenciaCardiaca
    );

    biometria.simulacionActiva = false;
    actualizarEstadoBluetooth(`Conectado: ${dispositivoBluetooth.name || "Coospo H6M"}`);
    actualizarLecturaBiometrica();
  } catch (error) {
    caracteristicaFrecuenciaCardiaca = null;
    actualizarEstadoBluetooth(error.name === "NotFoundError" ? "Desconectado" : "Error de conexión");
    biometria.simulacionActiva = true;
    actualizarLecturaBiometrica();
  }
}

function actualizarLecturaBiometrica() {
  const estado = biometria.modo === "estres" ? "ESTRÉS / ALERTA" : "CALMA / TONO VAGAL";
  lecturaBiometrica.textContent =
    `Estado: ${estadoConexion} | BPM: ${bpm || "--"} | Latido A: ${inputA} ms | Latido B: ${inputB} ms | ΔRR (HRV): ${deltaRR} ms · ${estado}`;
  controlInputA.value = inputA;
  controlInputB.value = inputB;
  botonSimulacion.textContent = biometria.simulacionActiva
    ? "PAUSAR SIMULACIÓN"
    : "ACTIVAR SIMULACIÓN";
}

function actualizarBiometria(inputA, inputB) {
  const nuevoInputA = THREE.MathUtils.clamp(Math.round(inputA), 600, 1000);
  const nuevoInputB = THREE.MathUtils.clamp(Math.round(inputB), 600, 1000);
  globalsBiometricas(nuevoInputA, nuevoInputB);
  actualizarLecturaBiometrica();
  generarCampo();
}

function globalsBiometricas(nuevoInputA, nuevoInputB) {
  inputA = nuevoInputA;
  inputB = nuevoInputB;
  deltaRR = Math.abs(inputA - inputB);
  biometria.modo = deltaRR < 15 ? "estres" : "calma";
}

function generarLatidosSimulados() {
  if (!biometria.simulacionActiva) return;

  const modoSiguiente = biometria.modo === "estres" ? "calma" : "estres";
  const inputA = 700 + Math.random() * 150;
  const variacion = modoSiguiente === "estres"
    ? Math.random() * 14 - 7
    : 50 + Math.random() * 20;

  actualizarBiometria(inputA, inputA + variacion);
}

botonConectar.addEventListener("click", conectarSensorCardiaco);
actualizarEstadoBluetooth("Desconectado · simulador activo");

controlInputA.addEventListener("input", (event) => {
  biometria.simulacionActiva = false;
  actualizarBiometria(event.target.value, inputB);
});

controlInputB.addEventListener("input", (event) => {
  biometria.simulacionActiva = false;
  actualizarBiometria(inputA, event.target.value);
});

botonSimulacion.addEventListener("click", () => {
  biometria.simulacionActiva = !biometria.simulacionActiva;
  actualizarLecturaBiometrica();
});

actualizarLecturaBiometrica();
setInterval(generarLatidosSimulados, DURACION_CAMBIO_BIOMETRICO);

function actualizarParametro(nombre, valor) {
  const parametrosEnteros = ["columnas", "filas", "semilla"];

  parametros[nombre] = parametrosEnteros.includes(nombre)
    ? Number.parseInt(valor, 10)
    : Number.parseFloat(valor);

  valoresVisibles[nombre].value = parametrosEnteros.includes(nombre)
    ? parametros[nombre]
    : parametros[nombre].toFixed(2);

  generarCampo();
}

Object.entries(controles).forEach(([nombre, control]) => {
  control.addEventListener("input", (event) => {
    actualizarParametro(nombre, event.target.value);
  });
});

document.querySelector("#regenerar").addEventListener("click", () => {
  parametros.semilla = Math.floor(Math.random() * 100) + 1;

  controles.semilla.value = parametros.semilla;
  valoresVisibles.semilla.value = parametros.semilla;

  generarCampo();
});

document.querySelector("#restablecer").addEventListener("click", () => {
  Object.assign(parametros, valoresIniciales);

  const parametrosEnteros = ["columnas", "filas", "semilla"];

  Object.entries(controles).forEach(([nombre, control]) => {
    control.value = parametros[nombre];

    valoresVisibles[nombre].value = parametrosEnteros.includes(nombre)
      ? parametros[nombre]
      : parametros[nombre].toFixed(2);
  });

  generarCampo();
});

// ======================================================
// 08 — BUCLE DE ANIMACIÓN
// ======================================================

function animar() {
  requestAnimationFrame(animar);

  controlesOrbita.update();
  renderer.render(escena, camara);
}

function ajustarVentana() {
  const ancho = viewport.clientWidth;
  const altura = viewport.clientHeight;

  camara.aspect = ancho / altura;
  camara.updateProjectionMatrix();

  renderer.setSize(ancho, altura);
}

window.addEventListener("resize", ajustarVentana);

generarCampo();
animar();
