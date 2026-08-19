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
const intervalosRR = [inputA, inputB];
let rmssd = 0;
let factorSomatico = 0;
let factorSomaticoObjetivo = 0;
let frecuenciaCoherente = 0;
let dispersionRR = 0;

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

const geometriaEsfera = new THREE.SphereGeometry(0.12, 12, 8);
const materialCardiograma = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});
const cardiogramas = { A: null, B: null };
const reloj = new THREE.Clock();
const colorA = new THREE.Color();
const colorB = new THREE.Color();
const colorEstres = new THREE.Color(0xff214d);
const colorTransicion = new THREE.Color(0xff35da);
const colorCalma = new THREE.Color(0x35ffd0);
const matrizEsfera = new THREE.Matrix4();
const escalaEsfera = new THREE.Vector3();
const cuaternionIdentidad = new THREE.Quaternion();

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
  if (intervalosRR.length < 4) return 0.5;

  const tiempos = [0];
  for (let indice = 1; indice < intervalosRR.length; indice++) {
    tiempos.push(tiempos[indice - 1] + intervalosRR[indice - 1] / 1000);
  }

  const media = intervalosRR.reduce((suma, intervalo) => suma + intervalo, 0) / intervalosRR.length;
  const centrados = intervalosRR.map((intervalo) => intervalo - media);
  const energia = centrados.reduce((suma, valor) => suma + valor * valor, 0);
  if (energia < 1) return 0.5;

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

  frecuenciaCoherente = mejorFrecuencia;
  dispersionRR = desviacion;
  return THREE.MathUtils.clamp(
    mejorAjuste * 0.55 + regularidad * 0.3 + bandaResonante * 0.15 - dispersionNormalizada * 0.15,
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
  const intervaloSeguro = THREE.MathUtils.clamp(Math.round(intervalo), 600, 1000);
  inputA = inputB;
  inputB = intervaloSeguro;
  intervalosRR.push(intervaloSeguro);
  if (intervalosRR.length > VENTANA_RR) intervalosRR.shift();
  actualizarTendenciaBiometrica();
  actualizarLecturaBiometrica();
}

function colorSomatico(factor, destino) {
  if (factor < 0.5) {
    destino.copy(colorEstres).lerp(colorTransicion, factor * 2);
  } else {
    destino.copy(colorTransicion).lerp(colorCalma, (factor - 0.5) * 2);
  }
}

function calcularPuntoCardiograma(indice, total, intervalo, radio, desfase, tiempo, destino) {
  const progreso = indice / (total - 1);
  const angulo = progreso * Math.PI * 2 + desfase;
  const frecuencia = 1000 / Math.max(intervalo, 1);
  const ondaArmonica = Math.sin(angulo * (2.5 + frecuencia) - tiempo * frecuencia * 2.5);
  const ondaJagged = Math.sin(angulo * 13 - tiempo * 3.5) *
    Math.sin(angulo * 7 + tiempo * 2.1);
  const pulso = THREE.MathUtils.lerp(ondaJagged, ondaArmonica, factorSomatico);
  const latido = Math.pow(Math.max(0, Math.sin(angulo * 2 - tiempo * frecuencia)), 8);
  const amplitud = 0.35 + parametros.amplitud * 0.16;
  const rugosidad = (1 - factorSomatico) * 0.25;

  destino.set(
    Math.cos(angulo) * (radio + pulso * (0.35 + rugosidad)),
    1.4 + pulso * amplitud + latido * amplitud * 1.5 + ondaJagged * rugosidad,
    Math.sin(angulo) * (radio + pulso * (0.35 + rugosidad))
  );
}

// ======================================================
// 05 — GENERAR CAMPO
// ======================================================

function crearCardiograma(nombre, intervalo, radio, desfase, total) {
  const malla = new THREE.InstancedMesh(
    geometriaEsfera,
    materialCardiograma.clone(),
    total
  );
  malla.castShadow = true;
  malla.receiveShadow = true;
  malla.userData = { nombre, intervalo, radio, desfase };
  grupoCampo.add(malla);
  cardiogramas[nombre] = malla;
}

function generarCampo() {
  limpiarCampo();
  const total = Math.max(80, parametros.columnas * parametros.filas);
  crearCardiograma("A", inputA, 4.2, 0, total);
  crearCardiograma("B", inputB, 6.5, Math.PI, total);
}

function limpiarCampo() {
  cardiogramas.A = null;
  cardiogramas.B = null;
  while (grupoCampo.children.length > 0) grupoCampo.remove(grupoCampo.children[0]);
}

function actualizarCampoAnimado() {
  factorSomatico = THREE.MathUtils.lerp(factorSomatico, factorSomaticoObjetivo, 0.035);
  actualizarLecturaBiometrica();
  colorSomatico(factorSomatico, colorA);
  colorSomatico(factorSomatico, colorB);
  const tiempo = reloj.getElapsedTime();
  const punto = new THREE.Vector3();

  [cardiogramas.A, cardiogramas.B].forEach((malla, indiceMalla) => {
    if (!malla) return;
    const datos = malla.userData;
    datos.intervalo = indiceMalla === 0 ? inputA : inputB;
    const color = indiceMalla === 0 ? colorA : colorB;
    malla.material.color.copy(color);

    for (let indice = 0; indice < malla.count; indice++) {
      calcularPuntoCardiograma(
        indice,
        malla.count,
        datos.intervalo,
        datos.radio,
        datos.desfase,
        tiempo,
        punto
      );
      const escala = 0.7 + Math.abs(punto.y - 1.4) * 0.22;
      escalaEsfera.setScalar(escala);
      matrizEsfera.compose(punto, cuaternionIdentidad, escalaEsfera);
      malla.setMatrixAt(indice, matrizEsfera);
    }
    malla.instanceMatrix.needsUpdate = true;
  });
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
  <label>INPUT A <input class="biometric-input-a" type="range" min="600" max="1000" step="1" /></label>
  <label>INPUT B <input class="biometric-input-b" type="range" min="600" max="1000" step="1" /></label>
`;
Object.assign(overlayBiometrico.style, {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  zIndex: "10",
  width: "min(25rem, calc(100% - 2rem))",
  padding: "0.8rem",
  color: "#b8fff0",
  background: "#040c0f",
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
  nuevoInputA = THREE.MathUtils.clamp(Math.round(nuevoInputA), 600, 1000);
  nuevoInputB = THREE.MathUtils.clamp(Math.round(nuevoInputB), 600, 1000);
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
