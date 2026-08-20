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
  aleatoriedad: 0.0,
  semilla: 42,
};
const parametros = { ...valoresIniciales };

let inputA = 780;
let inputB = 772;
let deltaRR = 8;
let bpm = 0;
const VENTANA_RR = 12;
const MIN_RR = 600;
const MAX_RR = 1200;
const intervalosRR = [inputA, inputB];
let rmssd = 0;
let factorSomatico = 0;
let factorSomaticoObjetivo = 0;
let mediaRRVisual = (inputA + inputB) / 2;
let frecuenciaLatido = 1000 / mediaRRVisual;
let frecuenciaCoherente = 0;
let dispersionRR = 0;

// ======================================================
// 02 — ESCENA
// ======================================================

const viewport = document.querySelector("#viewport");

const escena = new THREE.Scene();
escena.background = new THREE.Color(0xf5f7ff);

const camara = new THREE.PerspectiveCamera(
  42,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  200
);

camara.position.set(0, 0, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.target.set(0, 0, 0);

// Iluminación general.
const luzAmbiente = new THREE.AmbientLight(0xdcecff, 2.2);
escena.add(luzAmbiente);

const luzHemisferica = new THREE.HemisphereLight(0xf3efe5, 0x202229, 2.4);
escena.add(luzHemisferica);

// Luz principal.
const luzPrincipal = new THREE.DirectionalLight(0xffffff, 4.5);
luzPrincipal.position.set(10, 18, 12);
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
    color: 0xf5f7ff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0,
  })
);

suelo.rotation.x = -Math.PI / 2;
suelo.position.y = -0.03;
suelo.receiveShadow = true;
escena.add(suelo);

// Grilla de referencia para leer mejor escala y posición.
const grilla = new THREE.GridHelper(50, 50, 0x35383d, 0x202227);
grilla.position.y = 0.001;
grilla.visible = false;
escena.add(grilla);

// ======================================================
// 03 — OBJETO GENERATIVO
// ======================================================

const grupoCampo = new THREE.Group();
escena.add(grupoCampo);

const reloj = new THREE.Clock();
const colorEstres = new THREE.Color("#FF2A2A");
const colorTransicion = new THREE.Color("#7A4BFF");
const colorCalma = new THREE.Color("#3399FF");
const colorTemporal = new THREE.Color();
let anillo = null;
const ruidoAutomatico = [];

// ======================================================
// 04 — REGLAS GENERATIVAS
// ======================================================

function calcularRMSSD() {
  if (intervalosRR.length < 2) return 0;
  let sumaCuadrados = 0;
  for (let indice = 1; indice < intervalosRR.length; indice++) {
    const diferencia = intervalosRR[indice] - intervalosRR[indice - 1];
    sumaCuadrados += diferencia * diferencia;
  }
  return Math.sqrt(sumaCuadrados / (intervalosRR.length - 1));
}

function calcularCoherenciaRR() {
  if (intervalosRR.length < 4) {
    const variabilidadCorta = THREE.MathUtils.clamp(rmssd / 45, 0, 1);
    return variabilidadCorta;
  }

  const tiempos = [0];
  for (let indice = 1; indice < intervalosRR.length; indice++) {
    tiempos.push(tiempos[indice - 1] + intervalosRR[indice - 1] / 1000);
  }

  const media = intervalosRR.reduce((suma, intervalo) => suma + intervalo, 0) / intervalosRR.length;
  const centrados = intervalosRR.map((intervalo) => intervalo - media);
  const energia = centrados.reduce((suma, valor) => suma + valor * valor, 0);
  if (energia < 1) return 0;

  let mejorFrecuencia = 0.04;
  let mejorAjuste = 0;
  for (let paso = 0; paso <= 24; paso++) {
    const frecuencia = 0.04 + paso * 0.0025;
    let seno = 0;
    let coseno = 0;
    for (let indice = 0; indice < centrados.length; indice++) {
      const fase = tiempos[indice] * frecuencia * Math.PI * 2;
      seno += centrados[indice] * Math.sin(fase);
      coseno += centrados[indice] * Math.cos(fase);
    }
    const ajuste = (seno * seno + coseno * coseno) * 2 / (centrados.length * energia);
    if (ajuste > mejorAjuste) {
      mejorAjuste = ajuste;
      mejorFrecuencia = frecuencia;
    }
  }

  const desviacion = Math.sqrt(energia / intervalosRR.length);
  const dispersionNormalizada = THREE.MathUtils.clamp(desviacion / 45, 0, 1);
  let dispersionDiferencias = 0;
  for (let indice = 1; indice < centrados.length; indice++) {
    dispersionDiferencias += Math.abs(centrados[indice] - centrados[indice - 1]);
  }
  const regularidad = 1 - THREE.MathUtils.clamp(
    dispersionDiferencias / (centrados.length * 55),
    0,
    1
  );
  const bandaResonante = mejorFrecuencia >= 0.04 && mejorFrecuencia <= 0.10 ? 1 : 0;
  const variabilidadNormalizada = THREE.MathUtils.clamp(rmssd / 45, 0, 1);

  frecuenciaCoherente = mejorFrecuencia;
  dispersionRR = desviacion;
  return THREE.MathUtils.clamp(
    variabilidadNormalizada * 0.8 + mejorAjuste * 0.1 + bandaResonante * 0.1,
    0,
    1
  );
}

function actualizarTendenciaBiometrica() {
  rmssd = calcularRMSSD();
  factorSomaticoObjetivo = calcularCoherenciaRR();
  deltaRR = Math.abs(inputA - inputB);
}

function registrarIntervaloRR(intervalo) {
  const intervaloSeguro = THREE.MathUtils.clamp(Math.round(intervalo), MIN_RR, MAX_RR);
  inputA = inputB;
  inputB = intervaloSeguro;
  intervalosRR.push(intervaloSeguro);
  if (intervalosRR.length > VENTANA_RR) intervalosRR.shift();
  actualizarTendenciaBiometrica();
  actualizarLecturaBiometrica();
}

function mapearColorSomatico(factor, destino) {
  const valor = THREE.MathUtils.clamp(factor, 0, 1);
  const suavizado = valor;

  if (suavizado < 0.5) {
    destino.copy(colorEstres).lerp(colorTransicion, suavizado * 2);
  } else {
    destino.copy(colorTransicion).lerp(colorCalma, (suavizado - 0.5) * 2);
  }
}

function crearAnillo() {
  const geometria = new THREE.BufferGeometry();
  const count = Math.max(1200, Math.round(parametros.columnas * 120));
  ruidoAutomatico.length = 0;
  for (let indice = 0; indice < count; indice++) {
    ruidoAutomatico.push(aleatoriedadConSemilla(indice, 0, parametros.semilla));
  }
  const posiciones = new Float32Array(count * 3);
  const colores = new Float32Array(count * 3);

  geometria.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute("color", new THREE.BufferAttribute(colores, 3));

  const material = new THREE.PointsMaterial({
    size: THREE.MathUtils.clamp(0.055 + parametros.separacion * 0.012, 0.05, 0.08),
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const puntos = new THREE.Points(geometria, material);
  puntos.userData = { count };
  grupoCampo.add(puntos);
  anillo = puntos;
}

function limpiarCampo() {
  if (!anillo) return;
  grupoCampo.remove(anillo);
  anillo.geometry.dispose();
  anillo.material.dispose();
  anillo = null;
}

function generarCampo() {
  limpiarCampo();
  crearAnillo();
}

function actualizarAnillo(tiempo) {
  const puntos = anillo;
  if (!puntos) return;

  const atributoPosicion = puntos.geometry.attributes.position;
  const atributoColor = puntos.geometry.attributes.color;
  const posiciones = atributoPosicion.array;
  const colores = atributoColor.array;
  const cantidad = atributoPosicion.count;

  const frecuenciaRitmo = frecuenciaLatido;
  const baseRadius = THREE.MathUtils.mapLinear(mediaRRVisual, MIN_RR, MAX_RR, 3.3, 5.1);
  const pulsacion = Math.sin(tiempo * frecuenciaRitmo * Math.PI * 2) *
    parametros.amplitud * 0.06;
  const anchoRadial = THREE.MathUtils.mapLinear(parametros.filas, 5, 30, 0.08, 1.2);
  const dispersion = factorSomatico * anchoRadial;
  const anchoParticulas = THREE.MathUtils.lerp(0.12, anchoRadial, factorSomatico);

  for (let indice = 0; indice < cantidad; indice++) {
    const progreso = indice / cantidad;
    const angulo = progreso * Math.PI * 2 + ruidoAutomatico[indice] * 0.012;
    const ruido = ruidoAutomatico[indice % ruidoAutomatico.length] || 0;
    const onda = Math.sin(angulo * 7 + tiempo * frecuenciaRitmo * 0.8);
    const modoAutomatico = !caracteristicaFrecuenciaCardiaca;
    const ruidoRadial = modoAutomatico && parametros.aleatoriedad > 0
      ? ruido * parametros.aleatoriedad + onda * 0.2
      : onda * 0.2;
    const radio = baseRadius * (1 + pulsacion) +
      ruidoRadial * dispersion + ruido * anchoParticulas;

    const xAjuste = Math.sin(angulo * 2 + tiempo * 0.35) * dispersion * 0.12;
    const yAjuste = Math.cos(angulo * 2 + tiempo * 0.35) * dispersion * 0.12;

    const x = Math.cos(angulo) * radio + xAjuste;
    const y = Math.sin(angulo) * radio + yAjuste;
    const z = Math.sin(angulo * 4 + tiempo * 0.35) * dispersion * 0.35;

    const index = indice * 3;
    posiciones[index] = x;
    posiciones[index + 1] = y;
    posiciones[index + 2] = z;

    mapearColorSomatico(factorSomatico, colorTemporal);
    colores[index] = colorTemporal.r;
    colores[index + 1] = colorTemporal.g;
    colores[index + 2] = colorTemporal.b;
  }

  atributoPosicion.needsUpdate = true;
  atributoColor.needsUpdate = true;
}

function actualizarCampoAnimado() {
  factorSomatico = THREE.MathUtils.lerp(factorSomatico, factorSomaticoObjetivo, 0.04);
  const mediaRRObjetivo = (inputA + inputB) / 2;
  mediaRRVisual = THREE.MathUtils.lerp(mediaRRVisual, mediaRRObjetivo, 0.08);
  const frecuenciaObjetivo = 1000 / Math.max(mediaRRVisual, 1);
  frecuenciaLatido = THREE.MathUtils.lerp(frecuenciaLatido, frecuenciaObjetivo, 0.08);
  const tiempo = reloj.getElapsedTime();

  actualizarAnillo(tiempo);
  actualizarLecturaBiometrica();
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
  aleatoriedad: document.querySelector("#aleatoriedad"),
  semilla: document.querySelector("#semilla"),
};

const valoresVisibles = {
  columnas: document.querySelector("#columnas-valor"),
  filas: document.querySelector("#filas-valor"),
  separacion: document.querySelector("#separacion-valor"),
  amplitud: document.querySelector("#amplitud-valor"),
  frecuencia: document.querySelector("#frecuencia-valor"),
  aleatoriedad: document.querySelector("#aleatoriedad-valor"),
  semilla: document.querySelector("#semilla-valor"),
};

const overlayBiometrico = document.createElement("aside");
overlayBiometrico.className = "biometric-overlay";
overlayBiometrico.innerHTML = `
  <div class="biometric-title">MODO HACKER · BIOFEEDBACK</div>
  <button class="biometric-connect" id="btn-conectar" type="button">CONECTAR COOSPO H6M</button>
  <output class="biometric-readout"></output>
  <label>INPUT A <input class="biometric-input-a" type="range" min="600" max="1200" step="1" /></label>
  <label>INPUT B <input class="biometric-input-b" type="range" min="600" max="1200" step="1" /></label>
`;
Object.assign(overlayBiometrico.style, {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  zIndex: "10",
  width: "min(16rem, calc(100% - 1rem))",
  padding: "0.45rem",
  color: "#b8fff0",
  background: "#040c0f",
  border: "1px solid rgba(39, 199, 217, 0.5)",
  fontFamily: "monospace",
  fontSize: "0.56rem",
  lineHeight: "1.5",
  boxSizing: "border-box",
});
overlayBiometrico.querySelectorAll("label").forEach((label) => {
  label.style.display = "grid";
  label.style.gap = "0.2rem";
  label.style.marginTop = "0.5rem";
});
overlayBiometrico.querySelectorAll("button").forEach((button) => {
  button.style.display = "block";
  button.style.marginTop = "0.6rem";
  button.style.color = "#b8fff0";
  button.style.background = "transparent";
  button.style.border = "1px solid rgba(184, 255, 240, 0.45)";
  button.style.padding = "0.35rem 0.5rem";
  button.style.font = "inherit";
  button.style.cursor = "pointer";
});
overlayBiometrico.querySelector(".biometric-readout").style.display = "block";
viewport.appendChild(overlayBiometrico);

const lecturaBiometrica = overlayBiometrico.querySelector(".biometric-readout");
const controlInputA = overlayBiometrico.querySelector(".biometric-input-a");
const controlInputB = overlayBiometrico.querySelector(".biometric-input-b");
const botonConectar = overlayBiometrico.querySelector("#btn-conectar");

let dispositivoBluetooth = null;
let caracteristicaFrecuenciaCardiaca = null;
let estadoConexion = "Desconectado · control manual";

function actualizarEstadoBluetooth(estado) {
  estadoConexion = estado;
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
      registrarIntervaloRR(rrMilisegundos);
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
      actualizarEstadoBluetooth("Desconectado · control manual");
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

    actualizarEstadoBluetooth(`Conectado: ${dispositivoBluetooth.name || "Coospo H6M"}`);
    actualizarLecturaBiometrica();
  } catch (error) {
    caracteristicaFrecuenciaCardiaca = null;
    actualizarEstadoBluetooth(error.name === "NotFoundError" ? "Desconectado" : "Error de conexión");
    actualizarLecturaBiometrica();
  }
}

function actualizarLecturaBiometrica() {
  lecturaBiometrica.textContent =
    `Estado: ${estadoConexion} | BPM: ${bpm || "--"} | A: ${inputA} ms | B: ${inputB} ms | ΔRR: ${deltaRR} ms | RMSSD: ${rmssd.toFixed(1)} ms | Coherencia: ${factorSomatico.toFixed(2)} | f: ${frecuenciaCoherente.toFixed(3)} Hz`;
  controlInputA.value = inputA;
  controlInputB.value = inputB;
}

function actualizarBiometria(nuevoInputA, nuevoInputB) {
  nuevoInputA = THREE.MathUtils.clamp(Math.round(nuevoInputA), MIN_RR, MAX_RR);
  nuevoInputB = THREE.MathUtils.clamp(Math.round(nuevoInputB), MIN_RR, MAX_RR);
  inputA = nuevoInputA;
  inputB = nuevoInputB;
  intervalosRR.splice(0, intervalosRR.length, nuevoInputA, nuevoInputB);
  actualizarTendenciaBiometrica();
  actualizarLecturaBiometrica();
}

botonConectar.addEventListener("click", conectarSensorCardiaco);
actualizarTendenciaBiometrica();
actualizarEstadoBluetooth("Desconectado · control manual");

controlInputA.addEventListener("input", (event) => {
  actualizarBiometria(event.target.value, inputB);
});

controlInputB.addEventListener("input", (event) => {
  actualizarBiometria(inputA, event.target.value);
});

actualizarLecturaBiometrica();

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
  actualizarCampoAnimado();
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
