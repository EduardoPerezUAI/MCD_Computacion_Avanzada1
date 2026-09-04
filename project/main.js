import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — PARÁMETROS
// ======================================================

const valoresIniciales = {
  densidad: 2600,
  tamaño: 0.4,
  dispersión: 0.8,
  amplitud: 3.0,
  frecuencia: 80,
  aleatoriedad: 0.0,
  semilla: 42,
};
const parametros = { ...valoresIniciales };

let inputA = 780;
let inputB = 772;
let deltaRR = 8;
let bpm = 0;
const VENTANA_RR = 12;
const MIN_RR = 400;
const MAX_RR = 1200;
const intervalosRR = [inputA, inputB];
const historialTacograma = [...intervalosRR];
const tiempoZonas = { baja: 0, media: 0, alta: 0 };
let rmssd = 0;
let factorSomatico = 0;
let factorSomaticoObjetivo = 0;
let mediaRRVisual = (inputA + inputB) / 2;
let frecuenciaLatido = 1000 / mediaRRVisual;
let frecuenciaCoherente = 0;
let dispersionRR = 0;
let pulsoRadial = 0;
let espectroRR = []; // periodograma {frecuencia, potencia} calculado en calcularCoherenciaRR()

// ======================================================
// 02 — ESCENA: ORBE RESPIRATORIO
// ======================================================

const viewport = document.querySelector("#viewport");

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x080b10);

const camara = new THREE.PerspectiveCamera(
  42,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  200
);

camara.position.set(0, 0, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.enableRotate = true;
controlesOrbita.dampingFactor = 0.08;
controlesOrbita.minDistance = 5;
controlesOrbita.maxDistance = 28;
controlesOrbita.target.set(0, 0, 0);

const luzAmbiente = new THREE.AmbientLight(0x243142, 1.2);
escena.add(luzAmbiente);

const luzHemisferica = new THREE.HemisphereLight(0xd9f4ff, 0x10131a, 2.2);
escena.add(luzHemisferica);

// Luz principal.
const luzPrincipal = new THREE.PointLight(0x48d6a0, 10, 24);
luzPrincipal.position.set(10, 18, 12);
escena.add(luzPrincipal);

// Luz secundaria para suavizar el contraste.
const luzRelleno = new THREE.PointLight(0x4d8dff, 7, 22);
luzRelleno.position.set(-8, 6, -6);
escena.add(luzRelleno);

// Plano base.
const grupoCampo = new THREE.Group();
escena.add(grupoCampo);

const reloj = new THREE.Clock();
const paradasCromaticas = [
  { factor: 0.00, color: new THREE.Color("#e45757") },
  { factor: 0.40, color: new THREE.Color("#4c8dff") },
  { factor: 1.00, color: new THREE.Color("#42d392") },
];
const colorTemporal = new THREE.Color();
const colorSomatico = new THREE.Color("#660000");
let anillo = null;
let esferaExterior = null;
let brilloParticulas = 1.0;

// Suavizado orgánico del orbe (independiente del framerate).
let factorPacerSuavizado = 0.18;
let escalaSuavizada = 0.82;
let tiempoAnterior = 0;
const texturaParticula = crearTexturaParticula();

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
  if (intervalosRR.length < 6) return 0.5;

  const tiempos = [0];
  for (let indice = 1; indice < intervalosRR.length; indice++) {
    tiempos.push(tiempos[indice - 1] + intervalosRR[indice - 1] / 1000);
  }

  const media = intervalosRR.reduce((suma, intervalo) => suma + intervalo, 0) / intervalosRR.length;
  const centrados = intervalosRR.map((intervalo) => intervalo - media);
  const energiaTotal = centrados.reduce((suma, valor) => suma + valor * valor, 0);
  if (energiaTotal < 1) return 0.5;

  // Periodograma tipo Lomb-Scargle simplificado: para cada frecuencia candidata
  // se proyecta la serie RR centrada sobre una onda seno/coseno de esa
  // frecuencia — la proyección más fuerte es la frecuencia dominante. Es un
  // FFT/Welch simplificado válido para series de RR cortas y no uniformemente
  // muestreadas (los latidos no llegan a intervalos fijos). Se conserva el
  // espectro completo en `espectroRR` para el gráfico PSD.
  let mejorFrecuencia = 0.04;
  let mejorAjuste = 0;
  espectroRR = [];
  for (let paso = 0; paso <= 44; paso++) {
    const frecuencia = 0.04 + paso * 0.005;
    let seno = 0;
    let coseno = 0;
    for (let indice = 0; indice < centrados.length; indice++) {
      const fase = tiempos[indice] * frecuencia * Math.PI * 2;
      seno += centrados[indice] * Math.sin(fase);
      coseno += centrados[indice] * Math.cos(fase);
    }
    const potenciaPico = (seno * seno + coseno * coseno) * 2 / (centrados.length * energiaTotal);
    espectroRR.push({ frecuencia, potencia: potenciaPico });
    if (potenciaPico > mejorAjuste) {
      mejorAjuste = potenciaPico;
      mejorFrecuencia = frecuencia;
    }
  }

  const potenciaRuido = Math.max(1 - mejorAjuste, 0.05);
  const coherenceRatio = mejorAjuste / potenciaRuido;
  const coherenceScore = Math.log(coherenceRatio + 1);

  frecuenciaCoherente = mejorFrecuencia;
  dispersionRR = Math.sqrt(energiaTotal / intervalosRR.length);
  return THREE.MathUtils.clamp(coherenceScore, 0.2, 5.0);
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
  historialTacograma.push(intervaloSeguro);
  if (historialTacograma.length > 50) historialTacograma.shift();
  if (faseActual === estadoFases?.ENTRENAMIENTO) {
    const zona = obtenerZonaCoherencia(factorSomaticoObjetivo);
    tiempoZonas[zona] += intervaloSeguro / 1000;
  }
  if (intervalosRR.length > VENTANA_RR) intervalosRR.shift();
  actualizarTendenciaBiometrica();
  actualizarPoincare(intervaloSeguro);
  actualizarLecturaBiometrica();
}

function obtenerZonaCoherencia(valor) {
  if (valor >= 2.0) return "alta";
  if (valor >= 1.0) return "media";
  return "baja";
}

function actualizarVisualizacionHRV() {
  const cs = factorSomatico;
  const zona = cs >= 2.0 ? "alta" : cs >= 1.0 ? "media" : "baja";
  const etiquetas = { baja: "Baja coherencia", media: "Coherencia media", alta: "Alta coherencia" };
  const indicador = document.querySelector("#coherence-zone");
  indicador.className = `zone-dot ${zona}`;
  document.querySelector("#coherence-label").textContent = etiquetas[zona];
  document.querySelector("#coherence-score").textContent = `${cs.toFixed(1)} CS`;
  document.querySelector("#metric-coherence").textContent = cs.toFixed(1);
  document.querySelector("#metric-bpm").textContent = bpm || "--";
  document.querySelector("#metric-rr").textContent = Math.round(mediaRRVisual);
  document.querySelector("#metric-rmssd").textContent = rmssd.toFixed(1);

  const total = Object.values(tiempoZonas).reduce((suma, valor) => suma + valor, 0);
  const idsZona = { baja: "low", media: "medium", alta: "high" };
  for (const [nombre, tiempo] of Object.entries(tiempoZonas)) {
    const porcentaje = total ? Math.round((tiempo / total) * 100) : 0;
    document.querySelector(`#zone-${idsZona[nombre]}`).textContent = `${porcentaje}%`;
  }
  dibujarTacograma();
}

// Tacograma: una línea 2D que atraviesa todo el ancho del visor, coloreada
// según el estado de coherencia actual (mismo color que el orbe). El rango
// vertical usa MIN_RR–MAX_RR fijos para que la línea no salte de escala
// entre latidos.
function dibujarTacograma() {
  const lienzo = document.querySelector("#tacogram");
  if (!lienzo) return;
  const escala = window.devicePixelRatio || 1;
  const ancho = lienzo.clientWidth || 800;
  const alto = lienzo.clientHeight || 120;
  lienzo.width = ancho * escala;
  lienzo.height = alto * escala;
  const contexto = lienzo.getContext("2d");
  contexto.scale(escala, escala);
  contexto.clearRect(0, 0, ancho, alto);

  const valores = historialTacograma;
  if (valores.length < 2) return;

  const colorLinea = `#${colorSomatico.getHexString()}`;
  contexto.strokeStyle = colorLinea;
  contexto.lineWidth = 2.5;
  contexto.shadowColor = colorLinea;
  contexto.shadowBlur = 8;
  contexto.beginPath();
  valores.forEach((valor, indice) => {
    const x = (indice / (valores.length - 1)) * ancho;
    const normalizado = THREE.MathUtils.clamp((valor - MIN_RR) / (MAX_RR - MIN_RR), 0, 1);
    const y = alto - normalizado * (alto - 16) - 8;
    if (indice === 0) contexto.moveTo(x, y); else contexto.lineTo(x, y);
  });
  contexto.stroke();
  contexto.shadowBlur = 0;
}

// ======================================================
// 04b — GRÁFICOS CLÍNICOS (CHART.JS): POINCARÉ Y PSD
// ======================================================
// Chart.js se inyecta vía CDN como <script> clásico antes de este módulo
// (ver index.html), así que queda disponible como global `Chart`. Si por
// cualquier motivo no cargó (CDN caído, sin red), todas las funciones de
// esta sección se degradan a no-ops — nunca deben tirar abajo Three.js ni
// el resto de la app.

const MAX_PUNTOS_POINCARE = 50;
let puntosPoincare = [];
let rrAnteriorPoincare = null;
let graficoPoincare = null;
let graficoEspectro = null;
let tiempoUltimaActualizacionEspectro = 0;

// Plugin ligero e inline (sin dependencias extra) que dibuja una línea de
// referencia punteada en 0.1 Hz — la frecuencia de resonancia del pacer.
const pluginLineaResonancia = {
  id: "lineaResonancia",
  afterDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    const x = scales.x.getPixelForValue(0.1);
    if (x < chartArea.left || x > chartArea.right) return;
    ctx.save();
    ctx.strokeStyle = "rgba(217,210,195,0.5)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(217,210,195,0.85)";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("0.1 Hz", x + 4, chartArea.top + 10);
    ctx.restore();
  },
};

function crearGraficoPoincare() {
  const lienzo = document.querySelector("#chart-poincare");
  if (!lienzo || typeof Chart === "undefined") return null;
  return new Chart(lienzo, {
    type: "scatter",
    data: {
      datasets: [{
        label: "RRₙ₊₁ vs RRₙ",
        data: [],
        pointBackgroundColor: "#42d392",
        pointBorderColor: "rgba(66,211,146,0.35)",
        pointBorderWidth: 4,
        pointRadius: 3.5,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: "linear",
          title: { display: true, text: "RRₙ (ms)", color: "#aab9b7", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#71817f", font: { size: 9 } },
        },
        y: {
          type: "linear",
          title: { display: true, text: "RRₙ₊₁ (ms)", color: "#aab9b7", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#71817f", font: { size: 9 } },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function crearGraficoEspectro() {
  const lienzo = document.querySelector("#chart-psd");
  if (!lienzo || typeof Chart === "undefined") return null;
  return new Chart(lienzo, {
    type: "line",
    data: {
      datasets: [{
        label: "Densidad espectral (PSD)",
        data: [],
        borderColor: "#4c8dff",
        backgroundColor: "rgba(76,141,255,0.18)",
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: "linear",
          min: 0.03,
          max: 0.28,
          title: { display: true, text: "Frecuencia (Hz)", color: "#aab9b7", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#71817f", font: { size: 9 }, stepSize: 0.05 },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Potencia", color: "#aab9b7", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#71817f", font: { size: 9 } },
        },
      },
      plugins: { legend: { display: false } },
    },
    plugins: [pluginLineaResonancia],
  });
}

// Diagrama de Poincaré: cada latido filtrado añade el punto (RRₙ, RRₙ₊₁).
// Mantiene sólo los últimos 50 puntos — con buena coherencia la nube se
// alarga en una elipse angosta a lo largo de la diagonal; con baja
// coherencia se dispersa en una nube redonda y caótica.
function actualizarPoincare(nuevoRR) {
  if (rrAnteriorPoincare !== null) {
    puntosPoincare.push({ x: rrAnteriorPoincare, y: nuevoRR });
    if (puntosPoincare.length > MAX_PUNTOS_POINCARE) puntosPoincare.shift();
    if (graficoPoincare) {
      graficoPoincare.data.datasets[0].data = puntosPoincare;
      graficoPoincare.update("none");
    }
  }
  rrAnteriorPoincare = nuevoRR;
}

// Espectro simulado para cuando no hay sensor real conectado: un piso de
// ruido que se aplana y un pico gaussiano en 0.1 Hz que se vuelve angosto y
// alto a medida que la coherencia simulada aumenta — mismo lenguaje visual
// que tendría un entrenamiento real, para fines de demostración.
function generarEspectroSimulado(coherenciaNormalizada) {
  const anchoPico = THREE.MathUtils.lerp(0.05, 0.008, coherenciaNormalizada);
  const alturaPico = THREE.MathUtils.lerp(0.05, 1.0, Math.pow(coherenciaNormalizada, 1.5));
  const puntos = [];
  for (let frecuencia = 0.03; frecuencia <= 0.28; frecuencia += 0.005) {
    const ruido = (0.08 + Math.random() * 0.1) * (1 - coherenciaNormalizada * 0.7);
    const distancia = frecuencia - 0.1;
    const pico = alturaPico * Math.exp(-(distancia * distancia) / (2 * anchoPico * anchoPico));
    puntos.push({ x: frecuencia, y: ruido + pico });
  }
  return puntos;
}

// Actualiza el gráfico PSD: usa el periodograma real (espectroRR) cuando hay
// un sensor conectado y suficientes latidos para calcularlo; si no, recurre
// a la simulación. Una sesión de alta coherencia (RMSSD alto y estable) ya
// produce naturalmente un pico real más alto y angosto en 0.1 Hz — no hace
// falta forzarlo aparte.
function actualizarGraficoEspectro() {
  if (!graficoEspectro) return;
  const coherenciaNormalizada = normalizarCoherencia(factorSomatico);
  const haySensorReal = Boolean(caracteristicaFrecuenciaCardiaca || camaraActiva);
  const puntos = haySensorReal && intervalosRR.length >= 6 && espectroRR.length
    ? espectroRR.map((punto) => ({ x: punto.frecuencia, y: punto.potencia }))
    : generarEspectroSimulado(coherenciaNormalizada);
  graficoEspectro.data.datasets[0].data = puntos;
  graficoEspectro.update("none");
}

// Normaliza el puntaje de coherencia (0.2 – 5.0) a un rango 0-1.
// Se usa tanto para el color del orbe como para el tamaño/brillo de las partículas.
function normalizarCoherencia(factor) {
  return THREE.MathUtils.clamp((factor - 0.2) / 1.8, 0, 1);
}

// Curva de aceleración/desaceleración suave (smoothstep) para evitar
// cambios de dirección abruptos en el pacer respiratorio.
function suavizarS(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

// Factor de interpolación independiente del framerate para transiciones orgánicas.
function factorSuavizado(delta, velocidad) {
  return 1 - Math.exp(-velocidad * delta);
}

function mapearColorSomatico(factor, destino) {
  const valor = normalizarCoherencia(factor);
  for (let indice = 0; indice < paradasCromaticas.length - 1; indice++) {
    const actual = paradasCromaticas[indice];
    const siguiente = paradasCromaticas[indice + 1];
    if (valor <= siguiente.factor) {
      const proporcion = THREE.MathUtils.inverseLerp(actual.factor, siguiente.factor, valor);
      destino.copy(actual.color).lerp(siguiente.color, proporcion);
      return destino;
    }
  }
  return destino.copy(paradasCromaticas.at(-1).color);
}

// Textura circular suave (radial) usada como sprite de cada partícula.
function crearTexturaParticula() {
  const tamano = 64;
  const lienzo = document.createElement("canvas");
  lienzo.width = tamano;
  lienzo.height = tamano;
  const contexto = lienzo.getContext("2d");
  const gradiente = contexto.createRadialGradient(tamano / 2, tamano / 2, 0, tamano / 2, tamano / 2, tamano / 2);
  gradiente.addColorStop(0, "rgba(255,255,255,1)");
  gradiente.addColorStop(0.4, "rgba(255,255,255,0.65)");
  gradiente.addColorStop(1, "rgba(255,255,255,0)");
  contexto.fillStyle = gradiente;
  contexto.fillRect(0, 0, tamano, tamano);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

function crearAnillo() {
  esferaExterior = new THREE.Mesh(
    new THREE.SphereGeometry(3, 32, 24),
    new THREE.MeshBasicMaterial({ color: "#71817f", wireframe: true, transparent: true, opacity: 0.2 })
  );
  grupoCampo.add(esferaExterior);

  // Orbe compuesto de pequeñísimas partículas distribuidas sobre una
  // esfera con espaciado dorado (Fibonacci sphere): visual orgánica y
  // uniforme que respira y cambia de color según el estado somático.
  const cantidad = parametros.densidad;
  const posiciones = new Float32Array(cantidad * 3);
  const colores = new Float32Array(cantidad * 3);
  const direcciones = new Float32Array(cantidad * 3);
  const radiosBase = new Float32Array(cantidad);
  const fases = new Float32Array(cantidad);
  const brillos = new Float32Array(cantidad);

  const anguloDorado = Math.PI * (3 - Math.sqrt(5));
  for (let indice = 0; indice < cantidad; indice++) {
    const y = 1 - (indice / Math.max(cantidad - 1, 1)) * 2;
    const radioEnY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = anguloDorado * indice;
    const direccionX = Math.cos(theta) * radioEnY;
    const direccionZ = Math.sin(theta) * radioEnY;

    const indice3 = indice * 3;
    direcciones[indice3] = direccionX;
    direcciones[indice3 + 1] = y;
    direcciones[indice3 + 2] = direccionZ;

    const jitter = 1 + aleatoriedadConSemilla(indice * 0.131, 0, parametros.semilla) * 0.06;
    radiosBase[indice] = 2.5 * jitter;
    fases[indice] = aleatoriedadConSemilla(indice * 0.371, 5.2, parametros.semilla) * Math.PI * 2;
    brillos[indice] = 0.85 + Math.abs(aleatoriedadConSemilla(indice * 0.517, 9.8, parametros.semilla)) * 0.3;

    posiciones[indice3] = direccionX * radiosBase[indice];
    posiciones[indice3 + 1] = y * radiosBase[indice];
    posiciones[indice3 + 2] = direccionZ * radiosBase[indice];

    colores[indice3] = colores[indice3 + 1] = colores[indice3 + 2] = 1;
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute("color", new THREE.BufferAttribute(colores, 3));

  const material = new THREE.PointsMaterial({
    size: parametros.tamaño,
    map: texturaParticula,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  anillo = new THREE.Points(geometria, material);
  anillo.userData = { direcciones, radiosBase, fases, brillos };
  grupoCampo.add(anillo);
}

function limpiarCampo() {
  if (!anillo) return;
  grupoCampo.remove(anillo);
  anillo.geometry.dispose();
  anillo.material.dispose();
  if (esferaExterior) {
    grupoCampo.remove(esferaExterior);
    esferaExterior.geometry.dispose();
    esferaExterior.material.dispose();
  }
  anillo = null;
  esferaExterior = null;
}

function generarCampo() {
  limpiarCampo();
  crearAnillo();
}

// Reacomoda cada partícula según el radio de respiración actual, con una
// pequeñísima deriva orgánica individual (fase propia por partícula) y
// brillo/tamaño que se afinan con la coherencia — más calma y foco visual
// cuanto más alta es la coherencia, más dispersión cuanto más baja.
function actualizarParticulasCampo(tiempo, escalaFinal) {
  const atributoPosicion = anillo.geometry.attributes.position;
  const atributoColor = anillo.geometry.attributes.color;
  const posiciones = atributoPosicion.array;
  const colores = atributoColor.array;
  const { direcciones, radiosBase, fases, brillos } = anillo.userData;
  const coherenciaNormalizada = normalizarCoherencia(factorSomatico);
  const amplitudDeriva = THREE.MathUtils.lerp(0.045, 0.015, coherenciaNormalizada);

  for (let indice = 0; indice < radiosBase.length; indice++) {
    const indice3 = indice * 3;
    const deriva = 1 + Math.sin(tiempo * 0.16 + fases[indice]) * amplitudDeriva;
    const radio = radiosBase[indice] * escalaFinal * deriva;

    posiciones[indice3] = direcciones[indice3] * radio;
    posiciones[indice3 + 1] = direcciones[indice3 + 1] * radio;
    posiciones[indice3 + 2] = direcciones[indice3 + 2] * radio;

    const brillo = brillos[indice] * THREE.MathUtils.lerp(0.75, 1.25, coherenciaNormalizada) * brilloParticulas;
    colores[indice3] = colorSomatico.r * brillo;
    colores[indice3 + 1] = colorSomatico.g * brillo;
    colores[indice3 + 2] = colorSomatico.b * brillo;
  }

  atributoPosicion.needsUpdate = true;
  atributoColor.needsUpdate = true;
  anillo.material.size = parametros.tamaño * THREE.MathUtils.lerp(1.0, 0.7, coherenciaNormalizada);
}

function actualizarAnillo(tiempo, delta) {
  if (!anillo) return;
  if (esferaExterior) {
    esferaExterior.rotation.y -= 0.0004;
    esferaExterior.rotation.x = Math.sin(tiempo * 0.12) * 0.03;
  }

  // ========================================
  // PACER RESPIRATORIO (Fase 2 solamente) — curva smoothstep,
  // sin cortes lineales, para una respiración visual orgánica.
  // ========================================
  let factorPacerObjetivo = 0.18;

  if (faseActual === estadoFases.ENTRENAMIENTO) {
    const tiempoEnFase = tiempo - tiempoFaseInicio;
    const posicionCiclo = (tiempoEnFase % PACER_CICLO_TOTAL) / PACER_CICLO_TOTAL;
    const umbralInhalacion = PACER_INHALACION / PACER_CICLO_TOTAL;

    if (posicionCiclo < umbralInhalacion) {
      // Inhalación: expande el orbe durante 4s.
      factorPacerObjetivo = suavizarS(posicionCiclo / umbralInhalacion);
    } else {
      // Exhalación: contrae el orbe durante 6s.
      const progresoExhalacion = (posicionCiclo - umbralInhalacion) / (1 - umbralInhalacion);
      factorPacerObjetivo = 1 - suavizarS(progresoExhalacion);
    }
  }

  // El pacer se sigue con una inercia suave (nunca salta al valor objetivo),
  // y el pulso cardíaco se reduce a una textura de fondo casi imperceptible.
  factorPacerSuavizado = THREE.MathUtils.damp(factorPacerSuavizado, factorPacerObjetivo, 1.6, delta);
  const pulso = 1 + Math.sin(tiempo * frecuenciaLatido * Math.PI * 2) * 0.008;
  const escalaObjetivo = THREE.MathUtils.lerp(0.82, 1.16, factorPacerSuavizado) * pulso;
  escalaSuavizada = THREE.MathUtils.damp(escalaSuavizada, escalaObjetivo, 3.2, delta);

  mapearColorSomatico(factorSomatico, colorTemporal);
  colorSomatico.lerp(colorTemporal, factorSuavizado(delta, 1.8));

  actualizarParticulasCampo(tiempo, escalaSuavizada);

  anillo.rotation.y += 0.0015;
  anillo.rotation.x = Math.sin(tiempo * 0.22) * 0.08;
}

function actualizarCampoAnimado() {
  const tiempo = reloj.getElapsedTime();
  const delta = THREE.MathUtils.clamp(tiempo - tiempoAnterior, 0, 0.1);
  tiempoAnterior = tiempo;

  if (!caracteristicaFrecuenciaCardiaca && !camaraActiva) actualizarSimulacionAutomatica(tiempo);
  // Transiciones suaves e independientes del framerate (evita saltos bruscos
  // en dispositivos con tasas de refresco variables).
  factorSomatico = THREE.MathUtils.damp(factorSomatico, factorSomaticoObjetivo, 1.4, delta);
  const mediaRRObjetivo = (inputA + inputB) / 2;
  mediaRRVisual = THREE.MathUtils.damp(mediaRRVisual, mediaRRObjetivo, 0.6, delta);
  const frecuenciaObjetivo = 1000 / Math.max(mediaRRVisual, 1);
  frecuenciaLatido = THREE.MathUtils.damp(frecuenciaLatido, frecuenciaObjetivo, 0.6, delta);

  // El gráfico PSD se refresca unas pocas veces por segundo (no cada frame):
  // en modo sensor real ya se recalcula por latido vía calcularCoherenciaRR(),
  // y en modo simulado esto le da vida sin redibujar el chart 60 veces/seg.
  if (tiempo - tiempoUltimaActualizacionEspectro > 0.35) {
    tiempoUltimaActualizacionEspectro = tiempo;
    actualizarGraficoEspectro();
  }

  // ========================================
  // GESTIÓN DE FASES Y TEMPORIZADORES
  // ========================================
  if (faseActual === estadoFases.EVALUACION || faseActual === estadoFases.ENTRENAMIENTO) {
    const tiempoTranscurrido = tiempo - tiempoFaseInicio;
    const esInfinito = faseActual === estadoFases.ENTRENAMIENTO && entrenamientoInfinito;

    if (esInfinito) {
      // Entrenamiento infinito: cuenta hacia arriba, nunca se autotermina.
      const minutos = Math.floor(tiempoTranscurrido / 60);
      const segundos = Math.floor(tiempoTranscurrido % 60);
      timerDisplay.textContent = `${minutos}:${segundos.toString().padStart(2, '0')}`;
      timerDisplay.classList.remove("warning");
    } else {
      // Actualizar display del temporizador
      const tiempoRestante = Math.max(0, tiempoFaseDuracion - tiempoTranscurrido);
      const minutos = Math.floor(tiempoRestante / 60);
      const segundos = Math.floor(tiempoRestante % 60);
      timerDisplay.textContent = `${minutos}:${segundos.toString().padStart(2, '0')}`;

      // Cambiar color del timer en los últimos 10 segundos
      if (tiempoRestante <= 10 && tiempoRestante > 0) {
        timerDisplay.classList.add("warning");
      } else {
        timerDisplay.classList.remove("warning");
      }

      // Terminar fase cuando expire el tiempo
      if (tiempoTranscurrido >= tiempoFaseDuracion) {
        terminarFase();
      }
    }

    actualizarHUD(tiempoFaseDuracion - tiempoTranscurrido, tiempoTranscurrido, esInfinito);
    if (faseActual === estadoFases.ENTRENAMIENTO) actualizarLogros(tiempo, tiempoTranscurrido);
  } else {
    document.querySelector("#session-hud")?.classList.add("hidden");
  }

  actualizarAnillo(tiempo, delta);
  actualizarLecturaBiometrica();
}

function actualizarHUD(tiempoRestante, tiempoTranscurrido, esInfinito = false) {
  const hud = document.querySelector("#session-hud");
  if (!hud) return;
  hud.classList.remove("hidden");
  const baseSegundos = esInfinito ? tiempoTranscurrido : Math.max(0, tiempoRestante);
  const minutos = Math.floor(baseSegundos / 60);
  const segundos = Math.floor(baseSegundos % 60);
  document.querySelector("#hud-timer").textContent = `${minutos.toString().padStart(2, "0")}:${segundos.toString().padStart(2, "0")}`;
  document.querySelector("#hud-guide").textContent = faseActual === estadoFases.EVALUACION
    ? "Respira naturalmente"
    : ((tiempoTranscurrido % PACER_CICLO_TOTAL) < PACER_INHALACION ? "Inhala (4s)" : "Exhala (6s)");
  document.querySelector("#btn-stop-training")?.classList.toggle("hidden", faseActual !== estadoFases.ENTRENAMIENTO);
}

function actualizarLogros(tiempo, tiempoTranscurrido) {
  const delta = Math.min(Math.max(tiempo - ultimoTiempoSesion, 0), 0.5);
  acumuladoCS += factorSomatico * delta;
  tiempoCS += delta;
  ultimoTiempoSesion = tiempo;
  const bloqueActual = Math.floor(tiempoTranscurrido / 5);
  while (ultimoBloqueLogro < bloqueActual) {
    ultimoBloqueLogro += 1;
    puntosLogro += factorSomatico >= 2.0 ? 2 : factorSomatico >= 1.0 ? 1 : 0;
  }
}

// ======================================================
// 04b — REPORTES: TEXTOS DIDÁCTICOS Y COMPARATIVAS
// ======================================================

const TEXTO_DIDACTICO_SESION =
  "La coherencia cardíaca ocurre cuando tu ritmo cardíaco forma una onda suave y armónica en sincronía con tu respiración. " +
  "Más tiempo en la zona verde (alta coherencia) indica que tu sistema nervioso autónomo está equilibrado — el cuerpo señal " +
  "de menor estrés percibido y mayor claridad mental. La zona roja no es un error: es información sobre dónde estaba tu " +
  "cuerpo al empezar a practicar.";

const TEXTO_DIDACTICO_HISTORIAL =
  "Este gráfico compara tu Puntaje de Coherencia (CS) y tu porcentaje de tiempo en alta coherencia sesión a sesión. " +
  "Una tendencia ascendente sugiere que tu sistema nervioso autónomo se está volviendo más flexible y resiliente ante " +
  "el estrés con la práctica regular — lo importante es la tendencia general, no el resultado de un solo día.";

// Compara dos sesiones según su % de tiempo en zona alta.
function calcularBadgeZonaAlta(actual, anterior, texto = "respecto a la sesión anterior") {
  if (!actual || !anterior) return null;
  const diferencia = (actual.zonas?.alta || 0) - (anterior.zonas?.alta || 0);
  return {
    texto: `${diferencia >= 0 ? "+" : ""}${diferencia}% de tiempo en coherencia alta ${texto}`,
    positivo: diferencia >= 0,
  };
}

// Dibuja un gráfico de dona tricolor (baja/media/alta) en un <canvas>.
function dibujarDonutCoherencia(lienzo, zonasPorcentaje) {
  if (!lienzo) return;
  const escala = window.devicePixelRatio || 1;
  const tamanoCss = lienzo.clientWidth || 128;
  lienzo.width = tamanoCss * escala;
  lienzo.height = tamanoCss * escala;
  const contexto = lienzo.getContext("2d");
  contexto.scale(escala, escala);
  contexto.clearRect(0, 0, tamanoCss, tamanoCss);

  const centro = tamanoCss / 2;
  const radioExterior = centro - 4;
  const radioInterior = radioExterior * 0.62;
  const colores = { baja: "#e45757", media: "#4c8dff", alta: "#42d392" };
  const orden = ["baja", "media", "alta"];

  let anguloInicio = -Math.PI / 2;
  orden.forEach((zona) => {
    const porcentaje = zonasPorcentaje[zona] || 0;
    const anguloBarrido = (porcentaje / 100) * Math.PI * 2;
    if (anguloBarrido <= 0) return;
    contexto.beginPath();
    contexto.moveTo(centro, centro);
    contexto.arc(centro, centro, radioExterior, anguloInicio, anguloInicio + anguloBarrido);
    contexto.closePath();
    contexto.fillStyle = colores[zona];
    contexto.fill();
    anguloInicio += anguloBarrido;
  });

  contexto.globalCompositeOperation = "destination-out";
  contexto.beginPath();
  contexto.arc(centro, centro, radioInterior, 0, Math.PI * 2);
  contexto.fill();
  contexto.globalCompositeOperation = "source-over";
}

// Gráfico de líneas con la evolución del CS y el % de coherencia alta
// a lo largo de las últimas sesiones guardadas en localStorage.
function dibujarHistorialLineas(sesiones) {
  const lienzo = document.querySelector("#history-chart");
  if (!lienzo) return;
  const escala = window.devicePixelRatio || 1;
  const ancho = lienzo.clientWidth || 520;
  const alto = lienzo.clientHeight || 240;
  lienzo.width = ancho * escala;
  lienzo.height = alto * escala;
  const contexto = lienzo.getContext("2d");
  contexto.scale(escala, escala);
  contexto.clearRect(0, 0, ancho, alto);
  if (!sesiones.length) return;

  const margen = { top: 24, right: 16, bottom: 16, left: 16 };
  const areaAncho = ancho - margen.left - margen.right;
  const areaAlto = alto - margen.top - margen.bottom;

  const seriesCS = sesiones.map((registro) => registro.avgCS ?? registro.coherencia ?? 0);
  const seriesAlta = sesiones.map((registro) => registro.zonas?.alta ?? 0);
  const maximoCS = Math.max(...seriesCS, 1);

  contexto.strokeStyle = "rgba(255,255,255,0.06)";
  contexto.lineWidth = 1;
  for (let indice = 0; indice <= 3; indice++) {
    const y = margen.top + (areaAlto / 3) * indice;
    contexto.beginPath();
    contexto.moveTo(margen.left, y);
    contexto.lineTo(ancho - margen.right, y);
    contexto.stroke();
  }

  const trazarLinea = (valores, maximo, color) => {
    const puntoX = (indice) => (sesiones.length === 1 ? margen.left + areaAncho / 2 : margen.left + (indice / (sesiones.length - 1)) * areaAncho);
    const puntoY = (valor) => margen.top + areaAlto - (valor / maximo) * areaAlto;

    contexto.strokeStyle = color;
    contexto.lineWidth = 2.5;
    contexto.beginPath();
    valores.forEach((valor, indice) => {
      const x = puntoX(indice);
      const y = puntoY(valor);
      indice === 0 ? contexto.moveTo(x, y) : contexto.lineTo(x, y);
    });
    contexto.stroke();

    valores.forEach((valor, indice) => {
      contexto.beginPath();
      contexto.arc(puntoX(indice), puntoY(valor), 3, 0, Math.PI * 2);
      contexto.fillStyle = color;
      contexto.fill();
    });
  };

  trazarLinea(seriesAlta, 100, "#42d392");
  trazarLinea(seriesCS, maximoCS, "#4c8dff");

  contexto.font = "600 10px -apple-system, BlinkMacSystemFont, sans-serif";
  contexto.fillStyle = "#42d392";
  contexto.fillText("% Alta coherencia", margen.left, 14);
  contexto.fillStyle = "#4c8dff";
  contexto.fillText("CS promedio", margen.left + 112, 14);
}

// Mostrar historial persistente con tendencia de CS y % de coherencia alta.
// Cada sesión de la lista es un botón: al pulsarlo se abre su reporte
// completo (dona + logros + tarjeta didáctica), igual que al cerrar una
// sesión en vivo — así el botón de historial da acceso a los reportes
// pasados, no sólo a un resumen comprimido.
function mostrarHistorialCompleto() {
  const sesiones = registroHistorial.slice(-10);
  const badge = calcularBadgeZonaAlta(sesiones.at(-1), sesiones.at(-2), "respecto a tu última sesión");

  document.querySelector("#history-summary").innerHTML = `
    ${badge ? `<p class="badge-comparativa ${badge.positivo ? "positive" : "negative"}">${badge.positivo ? "▲" : "▼"} ${badge.texto}</p>` : ""}
    <div class="history-legend">
      <span><i style="background:#42d392"></i>% tiempo en coherencia alta</span>
      <span><i style="background:#4c8dff"></i>CS promedio</span>
    </div>
    <div class="history-sessions">${sesiones
      .map((registro, indice) => `<button type="button" class="history-session-btn" data-indice="${indice}">Sesión ${indice + 1}: ${(registro.avgCS ?? registro.coherencia ?? 0).toFixed(1)} CS · ${registro.zonas?.alta ?? 0}% alta →</button>`)
      .join("")}</div>
    <div class="didactic-card">
      <p class="eyebrow">CÓMO LEER TU PROGRESO</p>
      <p>${TEXTO_DIDACTICO_HISTORIAL}</p>
    </div>
  `;
  dibujarHistorialLineas(sesiones);

  document.querySelectorAll(".history-session-btn").forEach((boton) => {
    boton.addEventListener("click", () => {
      const indice = Number(boton.dataset.indice);
      mostrarReporteHistorico(sesiones, indice);
    });
  });

  document.querySelector("#history-dialog").showModal();
}

// Abre el reporte completo de una sesión guardada (accedida desde el
// panel de historial) reutilizando el mismo maquetado que el reporte de
// cierre de sesión en vivo.
function mostrarReporteHistorico(sesiones, indice) {
  const registro = sesiones[indice];
  if (!registro) return;
  const anterior = sesiones[indice - 1] || null;
  const fecha = new Date(registro.fecha);
  const tituloReporte = Number.isNaN(fecha.getTime())
    ? `Sesión ${indice + 1}`
    : fecha.toLocaleDateString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  renderizarReporteSesion(registro, anterior, tituloReporte);
  document.querySelector("#history-dialog").close();
  document.querySelector("#results-dialog").showModal();
}

function actualizarSimulacionAutomatica(tiempo) {
  const relajacion = THREE.MathUtils.clamp(parametros.aleatoriedad / 1.5, 0, 1);
  const bpmPorEstado = THREE.MathUtils.lerp(140, 60, relajacion);
  const bpmSimuladoObjetivo = THREE.MathUtils.clamp(
    bpmPorEstado * (parametros.frecuencia / 80),
    60,
    140
  );
  const intervaloSimulado = 60000 / bpmSimuladoObjetivo;
  inputA = Math.round(THREE.MathUtils.lerp(inputA, intervaloSimulado, 0.015));
  inputB = Math.round(THREE.MathUtils.lerp(inputB, intervaloSimulado, 0.015));
  mediaRRVisual = THREE.MathUtils.lerp(mediaRRVisual, intervaloSimulado, 0.08);
  bpm = Math.round(THREE.MathUtils.clamp(60000 / mediaRRVisual, 60, 140));
  factorSomaticoObjetivo = THREE.MathUtils.lerp(0.2, 2.8, relajacion);
  deltaRR = Math.abs(inputA - inputB);
  rmssd = deltaRR;
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
// 07 — SISTEMA DE FASES Y BIOFEEDBACK
// ======================================================

// Estados de la sesión
const estadoFases = {
  ESPERA: 0,           // Phase 0: Esperando conexión BLE
  EVALUACION: 1,       // Phase 1: Evaluación basal (60 segundos)
  ENTRENAMIENTO: 2,    // Phase 2: Entrenamiento HRVB (3-5 minutos)
  RESULTADOS_BASAL: 3, // Pausa para revisar el estado inicial
  HISTORIAL: 4,        // Phase 3: Ver historial / resultados
};

let faseActual = estadoFases.ESPERA;
let tiempoFaseInicio = 0;
let tiempoFaseDuracion = 0;
let rmssdBasal = 0;
let rmssdFinal = 0;
let registroHistorial = [];
let registroBasal = null;
let evaluacionOmitida = false;
let entrenamientoInfinito = false;
let puntosLogro = 0;
let acumuladoCS = 0;
let tiempoCS = 0;
let ultimoTiempoSesion = 0;
let ultimoBloqueLogro = 0;

// Pacer respiratorio: 0.1 Hz = 10 segundos por ciclo (6 ciclos/min)
// Inhalación: 4 segundos, Exhalación: 6 segundos
const PACER_FRECUENCIA = 0.1; // Hz
const PACER_CICLO_TOTAL = 1 / PACER_FRECUENCIA; // 10 segundos
const PACER_INHALACION = 4; // segundos
const PACER_EXHALACION = 6; // segundos

// Cargar historial desde localStorage
function cargarHistorial() {
  try {
    const datos = localStorage.getItem("hrvb-historial");
    registroHistorial = datos ? JSON.parse(datos) : [];
  } catch (error) {
    console.error("Error cargando historial:", error);
    registroHistorial = [];
  }
}

// Guardar historial a localStorage
function guardarHistorial() {
  try {
    localStorage.setItem("hrvb-historial", JSON.stringify(registroHistorial));
  } catch (error) {
    console.error("Error guardando historial:", error);
  }
}

// Iniciar Fase 1: Evaluación Basal (60 segundos)
function iniciarEvaluacionBasal() {
  if (!caracteristicaFrecuenciaCardiaca && !camaraActiva) {
    console.warn("Sensor Bluetooth no conectado");
    return;
  }

  evaluacionOmitida = false;
  faseActual = estadoFases.EVALUACION;
  tiempoFaseInicio = reloj.getElapsedTime();
  tiempoFaseDuracion = 60; // 60 segundos
  rmssdBasal = 0;
  timerDisplay.classList.remove("complete");

  actualizarInstrucciones(
    "Evaluación Basal",
    "Respira naturalmente. Se está calculando tu RMSSD basal...",
    60
  );

  console.log("[FASE 1] Evaluación basal iniciada - 60 segundos");
}

// Saltar Fase 1 e ir directo a la configuración del entrenamiento.
function saltarEvaluacionBasal() {
  if ((!caracteristicaFrecuenciaCardiaca && !camaraActiva) || faseActual !== estadoFases.ESPERA) {
    console.warn("Sensor Bluetooth no conectado");
    return;
  }

  evaluacionOmitida = true;
  rmssdBasal = 0;
  registroBasal = null;
  faseActual = estadoFases.RESULTADOS_BASAL;
  mostrarResultadosBasales(null);

  console.log("[FASE 1] Evaluación basal omitida por el usuario");
}

// Iniciar Fase 2: Entrenamiento HRVB (3-5 minutos con pacer)
function iniciarEntrenamiento() {
  if ((!caracteristicaFrecuenciaCardiaca && !camaraActiva) || faseActual !== estadoFases.RESULTADOS_BASAL) {
    console.warn("Sensor Bluetooth no conectado");
    return;
  }

  faseActual = estadoFases.ENTRENAMIENTO;
  tiempoFaseInicio = reloj.getElapsedTime();
  entrenamientoInfinito = Boolean(document.querySelector("#training-infinite")?.checked);
  const duracionInput = document.querySelector("#training-duration");
  tiempoFaseDuracion = entrenamientoInfinito ? Infinity : Number(duracionInput.value) * 60;
  tiempoZonas.baja = 0;
  tiempoZonas.media = 0;
  tiempoZonas.alta = 0;
  puntosLogro = 0;
  acumuladoCS = 0;
  tiempoCS = 0;
  ultimoTiempoSesion = reloj.getElapsedTime();
  ultimoBloqueLogro = 0;

  actualizarInstrucciones(
    "Entrenamiento HRVB",
    entrenamientoInfinito
      ? "Sincroniza tu respiración con el orbe. Inhala (4s) - Exhala (6s). Detén cuando quieras con el botón Detener."
      : "Sincroniza tu respiración con el orbe. Inhala (4s) - Exhala (6s)",
    tiempoFaseDuracion
  );

  console.log(`[FASE 2] Entrenamiento HRVB iniciado - ${entrenamientoInfinito ? "infinito" : (tiempoFaseDuracion / 60) + " min"}`);
}

// Termina el entrenamiento manualmente (botón Detener) — funciona tanto
// para acortar un entrenamiento con duración fija como para cerrar uno
// infinito, ya que las métricas de la sesión ya se acumulan de forma
// continua y no dependen de que el temporizador llegue a cero.
function detenerEntrenamiento() {
  if (faseActual !== estadoFases.ENTRENAMIENTO) return;
  terminarFase();
}

// Terminar fase y pasar a la siguiente
function terminarFase() {
  const tiempoTranscurrido = reloj.getElapsedTime() - tiempoFaseInicio;

  if (faseActual === estadoFases.EVALUACION) {
    // Guardar RMSSD basal
    rmssdBasal = rmssd;
    console.log(`[FASE 1 - FIN] RMSSD Basal: ${rmssdBasal.toFixed(1)} ms`);

    registroBasal = { rmssd: rmssdBasal, coherencia: factorSomatico };
    faseActual = estadoFases.RESULTADOS_BASAL;
    mostrarResultadosBasales(registroBasal);
  }
  else if (faseActual === estadoFases.ENTRENAMIENTO) {
    // Guardar RMSSD final
    rmssdFinal = rmssd;
    const cambioRMSSD = rmssdFinal - rmssdBasal;
    const hayBasalValido = !evaluacionOmitida && rmssdBasal > 0;
    const porcentajeMejora = hayBasalValido ? parseFloat(((cambioRMSSD / rmssdBasal) * 100).toFixed(1)) : null;

    console.log(`[FASE 2 - FIN] RMSSD Final: ${rmssdFinal.toFixed(1)} ms`);
    if (hayBasalValido) {
      console.log(`[MEJORA] Δ RMSSD: ${cambioRMSSD.toFixed(1)} ms (${porcentajeMejora}%)`);
    }

    // Registrar en historial
    const totalZonas = Object.values(tiempoZonas).reduce((suma, valor) => suma + valor, 0) || 1;
    const avgCS = tiempoCS > 0 ? acumuladoCS / tiempoCS : factorSomatico;
    const registro = {
      fecha: new Date().toISOString(),
      rmssdBasal: hayBasalValido ? parseFloat(rmssdBasal.toFixed(1)) : null,
      rmssdFinal: parseFloat(rmssdFinal.toFixed(1)),
      cambio: hayBasalValido ? parseFloat(cambioRMSSD.toFixed(1)) : null,
      porcentajeMejora,
      coherencia: parseFloat(factorSomatico.toFixed(2)),
      avgCS: parseFloat(avgCS.toFixed(2)),
      puntosLogro,
      bpmFinal: bpm,
      zonas: Object.fromEntries(Object.entries(tiempoZonas).map(([zona, tiempo]) => [zona, Math.round((tiempo / totalZonas) * 100)])),
    };

    registroHistorial.push(registro);
    guardarHistorial();

    // Mostrar resultados
    faseActual = estadoFases.HISTORIAL;
    mostrarResultados(registro);
  }
}

// Actualizar instrucciones en el overlay
function actualizarInstrucciones(titulo, texto, duracion) {
  const overlay = document.querySelector("#phase-overlay");
  const titleEl = document.querySelector("#instruction-title");
  const textEl = document.querySelector("#instruction-text");

  titleEl.textContent = titulo;
  textEl.textContent = texto;
  document.querySelector("#training-config").classList.add("hidden");

  if (faseActual === estadoFases.EVALUACION || faseActual === estadoFases.ENTRENAMIENTO) {
    overlay.classList.add("hidden");
  } else {
    overlay.classList.remove("hidden");
  }
}

// Construye el reporte de una sesión (dona tricolor, resumen de logros,
// insignia comparativa y tarjeta didáctica) dentro de #results-dialog.
// Es la pieza compartida entre "terminar entrenamiento" y "abrir un
// reporte pasado desde el historial" — misma vista, distinto origen.
function renderizarReporteSesion(registro, registroAnterior, tituloReporte) {
  const badge = calcularBadgeZonaAlta(registro, registroAnterior, registroAnterior ? "respecto a tu última sesión" : undefined);
  const zonas = { baja: registro.zonas.baja || 0, media: registro.zonas.media || 0, alta: registro.zonas.alta || 0 };

  const tituloEl = document.querySelector("#results-title");
  if (tituloEl) tituloEl.textContent = tituloReporte || "Tu sesión de coherencia";

  document.querySelector("#results-content").innerHTML = `
    <div class="report-grid">
      <div class="donut-card">
        <canvas id="results-donut" aria-label="Distribución de coherencia de la sesión"></canvas>
        <div class="donut-center"><strong>${registro.avgCS.toFixed(1)}</strong><span>CS promedio</span></div>
      </div>
      <div class="donut-legend">
        <div><i style="background:var(--red)"></i><span>Baja</span><strong>${zonas.baja}%</strong></div>
        <div><i style="background:var(--blue)"></i><span>Media</span><strong>${zonas.media}%</strong></div>
        <div><i style="background:var(--accent)"></i><span>Alta</span><strong>${zonas.alta}%</strong></div>
      </div>
    </div>

    <div class="achievement-row">
      <div><span>Puntos de logro</span><strong>${registro.puntosLogro}</strong></div>
      <div><span>RMSSD final</span><strong>${registro.rmssdFinal.toFixed(1)} ms</strong></div>
      <div><span>BPM final</span><strong>${registro.bpmFinal || "--"}</strong></div>
    </div>

    ${badge
      ? `<p class="badge-comparativa ${badge.positivo ? "positive" : "negative"}">${badge.positivo ? "▲" : "▼"} ${badge.texto}</p>`
      : `<p class="badge-comparativa neutral">Esta es tu primera sesión guardada; úsala como punto de referencia.</p>`}

    <div class="didactic-card">
      <p class="eyebrow">¿QUÉ SIGNIFICA ESTO?</p>
      <p>${TEXTO_DIDACTICO_SESION}</p>
    </div>
  `;

  dibujarDonutCoherencia(document.querySelector("#results-donut"), zonas);
}

// Mostrar resultados al cerrar la sesión en vivo.
function mostrarResultados(registro) {
  renderizarReporteSesion(registro, registroHistorial.at(-2), "Tu sesión de coherencia");
  document.querySelector("#session-hud")?.classList.add("hidden");
  document.querySelector("#results-dialog").showModal();
}

function mostrarResultadosBasales(registro) {
  const overlay = document.querySelector("#phase-overlay");
  document.querySelector("#instruction-title").textContent = registro ? "Resultados basales" : "Evaluación basal omitida";
  document.querySelector("#instruction-text").innerHTML = registro
    ? `<strong>RMSSD: ${registro.rmssd.toFixed(1)} ms</strong><br>
       Coherencia inicial: <strong>${registro.coherencia.toFixed(2)}</strong><br><br>
       Tu nivel de coherencia de reposo indica tu estado actual de tono vagal y flexibilidad autonómica antes de ejercitar.`
    : "Puedes comenzar tu entrenamiento de coherencia cuando quieras; mediremos tu progreso desde el primer latido.";
  document.querySelector("#timer-display").textContent = "01:00";
  document.querySelector("#training-config").classList.remove("hidden");
  overlay.classList.remove("hidden");
}

// Actualizar UI de los botones de fase
function actualizarBotonesPhase() {
  const btn1 = document.querySelector("#btn-phase1");
  const btn2 = document.querySelector("#btn-phase2");
  const btn3 = document.querySelector("#btn-phase3");
  const botonSaltarBasal = document.querySelector("#btn-skip-basal");
  const phaseInfo = document.querySelector("#phase-info");

  const estaConectado = Boolean(caracteristicaFrecuenciaCardiaca || camaraActiva);

  btn1.disabled = !estaConectado || faseActual !== estadoFases.ESPERA;
  if (botonSaltarBasal) botonSaltarBasal.disabled = !estaConectado || faseActual !== estadoFases.ESPERA;
  btn2.disabled = !estaConectado || faseActual !== estadoFases.RESULTADOS_BASAL;
  btn3.disabled = registroHistorial.length === 0;

  // Actualizar indicador de fase activa
  [btn1, btn2, btn3].forEach(btn => btn.classList.remove("active"));
  if (faseActual === estadoFases.EVALUACION) btn1.classList.add("active");
  if (faseActual === estadoFases.ENTRENAMIENTO) btn2.classList.add("active");
  if (faseActual === estadoFases.RESULTADOS_BASAL) btn2.classList.add("active");
  if (faseActual === estadoFases.HISTORIAL) btn3.classList.add("active");

  // Actualizar información de sesión
  if (faseActual === estadoFases.ESPERA) {
    phaseInfo.textContent = estaConectado ? "Listo para iniciar sesión" : "Conecta el sensor para comenzar";
  } else if (faseActual === estadoFases.EVALUACION) {
    phaseInfo.textContent = `RMSSD Actual: ${rmssd.toFixed(1)} ms\nPuntaje de Coherencia: ${factorSomatico.toFixed(2)} CS`;
  } else if (faseActual === estadoFases.ENTRENAMIENTO) {
    phaseInfo.textContent = `Basal: ${evaluacionOmitida ? "omitida" : rmssdBasal.toFixed(1) + " ms"}\nActual: ${rmssd.toFixed(1)} ms\nPuntaje de Coherencia: ${factorSomatico.toFixed(2)} CS`;
  } else if (faseActual === estadoFases.RESULTADOS_BASAL) {
    phaseInfo.textContent = evaluacionOmitida
      ? "Evaluación basal omitida · Elige la duración del entrenamiento"
      : `Resultados basales · RMSSD: ${rmssdBasal.toFixed(1)} ms · Elige la duración del entrenamiento`;
  }
}

// ======================================================
// 08 — INTERFAZ Y CONEXIÓN BLUETOOTH
// ======================================================

let dispositivoBluetooth = null;
let caracteristicaFrecuenciaCardiaca = null;
let estadoConexion = "Desconectado";
let flujoCamara = null;
let camaraActiva = false;
let cuadroCamara = null;
let videoCamara = null;
let ultimaCrestaPPG = 0;

// Estado del detector de pulso por cámara: filtro de paso bajo + línea base
// lenta (sigue la deriva de exposición automática) + disparador con
// histéresis (evita contar el mismo latido dos veces) sobre un umbral que
// se adapta a la amplitud real de la señal en vez de un valor fijo.
const BRILLO_MINIMO_DEDO = 60; // canal rojo promedio por debajo del cual no hay dedo sobre el flash
let filtroPPG = null;
let baseLinePPG = null;
let amplitudPPG = 0;
let sobreLineaPPG = false;
let brilloPromedioPPG = 0;
let ultimoAvisoSenalPPG = "";

// Elementos UI
const botonConectar = document.querySelector("#btn-conectar-main");
const botonCamara = document.querySelector("#btn-camera-main");
const statusConexion = document.querySelector("#connection-status");
const btn1 = document.querySelector("#btn-phase1");
const btn2 = document.querySelector("#btn-phase2");
const btn3 = document.querySelector("#btn-phase3");
const botonSaltarBasal = document.querySelector("#btn-skip-basal");
const overlayInstrucciones = document.querySelector("#phase-overlay");
const timerDisplay = document.querySelector("#timer-display");
const trainingDuration = document.querySelector("#training-duration");
const trainingDurationValue = document.querySelector("#training-duration-value");
const trainingInfinite = document.querySelector("#training-infinite");
const trainingDurationRow = document.querySelector("#training-duration-row");
const botonDetenerEntrenamiento = document.querySelector("#btn-stop-training");
const sliderTamanoParticulas = document.querySelector("#particle-size");
const valorTamanoParticulas = document.querySelector("#particle-size-value");
const sliderBrilloParticulas = document.querySelector("#particle-brightness");
const valorBrilloParticulas = document.querySelector("#particle-brightness-value");

// Listeners de botones de fase
btn1.addEventListener("click", iniciarEvaluacionBasal);
btn2.addEventListener("click", iniciarEntrenamiento);
botonSaltarBasal?.addEventListener("click", saltarEvaluacionBasal);
botonCamara.addEventListener("click", iniciarCamaraPPG);
document.querySelector("#btn-start-training").addEventListener("click", iniciarEntrenamiento);
botonDetenerEntrenamiento?.addEventListener("click", detenerEntrenamiento);
trainingDuration.addEventListener("input", () => {
  trainingDurationValue.value = trainingDuration.value;
});
trainingInfinite?.addEventListener("change", () => {
  const infinito = trainingInfinite.checked;
  trainingDuration.disabled = infinito;
  trainingDurationRow?.classList.toggle("disabled", infinito);
});
btn3.addEventListener("click", () => {
  if (registroHistorial.length > 0) {
    mostrarHistorialCompleto();
  }
});

// Sliders de apariencia del orbe — se aplican en vivo, sin reconstruir geometría.
sliderTamanoParticulas?.addEventListener("input", () => {
  parametros.tamaño = Number(sliderTamanoParticulas.value);
  valorTamanoParticulas.textContent = parametros.tamaño.toFixed(2);
});
sliderBrilloParticulas?.addEventListener("input", () => {
  brilloParticulas = Number(sliderBrilloParticulas.value);
  valorBrilloParticulas.textContent = brilloParticulas.toFixed(2);
});

function actualizarEstadoBluetooth(estado, conectado = false) {
  estadoConexion = estado;
  statusConexion.textContent = estado;

  if (conectado) {
    statusConexion.classList.add("connected");
  } else {
    statusConexion.classList.remove("connected");
  }

  actualizarBotonesPhase();
}

async function iniciarCamaraPPG() {
  if (!navigator.mediaDevices?.getUserMedia) {
    actualizarEstadoBluetooth("Cámara no disponible en este navegador");
    return;
  }
  try {
    actualizarEstadoBluetooth("Solicitando acceso a la cámara...");
    const configuracionCamara = {
      video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    };
    try {
      flujoCamara = await navigator.mediaDevices.getUserMedia(configuracionCamara);
    } catch (error) {
      if (error.name !== "OverconstrainedError" && error.name !== "NotFoundError") throw error;
      flujoCamara = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    videoCamara = document.querySelector("#camera-preview");
    videoCamara.srcObject = flujoCamara;
    videoCamara.classList.add("active");
    await videoCamara.play();

    // El chequeo/activación del flash es un extra: si el navegador lanza un
    // error aquí (algunos Android lo hacen al leer getCapabilities), no debe
    // tirar abajo una cámara que ya está funcionando.
    try {
      const pista = flujoCamara.getVideoTracks()[0];
      if (pista.getCapabilities?.().torch) {
        await pista.applyConstraints({ advanced: [{ torch: true }] });
      }
    } catch (error) {
      console.info("El flash no está disponible; continúa sin flash.", error);
    }

    cuadroCamara = document.createElement("canvas");
    cuadroCamara.width = 32;
    cuadroCamara.height = 32;
    filtroPPG = null;
    baseLinePPG = null;
    amplitudPPG = 0;
    sobreLineaPPG = false;
    brilloPromedioPPG = 0;
    ultimaCrestaPPG = 0;
    ultimoAvisoSenalPPG = "";
    camaraActiva = true;
    botonCamara.textContent = "Cámara activa · detener";
    botonCamara.onclick = detenerCamaraPPG;
    actualizarEstadoBluetooth("Cámara activa · coloca el dedo cubriendo el lente y el flash", true);
    leerPulsoCamara();
  } catch (error) {
    console.error("No se pudo iniciar la cámara PPG:", error);
    detenerCamaraPPG();
    actualizarEstadoBluetooth(error.name === "NotAllowedError" ? "Permiso de cámara rechazado" : "No se pudo activar la cámara");
  }
}

function detenerCamaraPPG() {
  flujoCamara?.getTracks().forEach((pista) => pista.stop());
  flujoCamara = null;
  camaraActiva = false;
  filtroPPG = null;
  baseLinePPG = null;
  amplitudPPG = 0;
  sobreLineaPPG = false;
  brilloPromedioPPG = 0;
  ultimaCrestaPPG = 0;
  ultimoAvisoSenalPPG = "";
  if (videoCamara) {
    videoCamara.srcObject = null;
    videoCamara.classList.remove("active");
  }
  if (botonCamara) {
    botonCamara.textContent = "Usar cámara como sensor";
    botonCamara.onclick = iniciarCamaraPPG;
  }
  if (estadoConexion.startsWith("Cámara")) actualizarEstadoBluetooth("Desconectado", false);
  actualizarBotonesPhase();
}

function leerPulsoCamara() {
  if (!camaraActiva || !videoCamara?.videoWidth) {
    if (camaraActiva) requestAnimationFrame(leerPulsoCamara);
    return;
  }
  const contexto = cuadroCamara.getContext("2d", { willReadFrequently: true });
  contexto.drawImage(videoCamara, 0, 0, 32, 32);
  const pixeles = contexto.getImageData(0, 0, 32, 32).data;
  let rojo = 0;
  let verde = 0;
  for (let indice = 0; indice < pixeles.length; indice += 4) {
    rojo += pixeles[indice];
    verde += pixeles[indice + 1];
  }
  const cantidadPixeles = pixeles.length / 4;
  procesarMuestraPPG(rojo / cantidadPixeles, verde / cantidadPixeles, performance.now());
  requestAnimationFrame(leerPulsoCamara);
}

// Detector de pulso por vídeo: un local-max en una ventana de pocos frames
// (~100 ms) es indistinguible del ruido de sensor de la cámara, así que en
// vez de eso se sigue la señal con dos filtros exponenciales (uno rápido
// para suavizar ruido, otro lento como línea base que absorbe la deriva de
// exposición automática) y se detecta el latido como un cruce con
// histéresis sobre un umbral que se adapta a la amplitud real de la señal.
// También exige que el canal rojo esté suficientemente iluminado — si no,
// no hay dedo cubriendo la cámara/flash y cualquier "latido" sería ruido.
function procesarMuestraPPG(promedioRojo, promedioVerde, tiempoMs) {
  const valorCrudo = promedioRojo - promedioVerde;
  brilloPromedioPPG = filtroPPG === null ? promedioRojo : THREE.MathUtils.lerp(brilloPromedioPPG, promedioRojo, 0.2);

  if (filtroPPG === null) {
    filtroPPG = valorCrudo;
    baseLinePPG = valorCrudo;
    actualizarEstadoSenalPPG();
    return;
  }

  filtroPPG = THREE.MathUtils.lerp(filtroPPG, valorCrudo, 0.35);
  baseLinePPG = THREE.MathUtils.lerp(baseLinePPG, filtroPPG, 0.02);

  const hayDedo = brilloPromedioPPG >= BRILLO_MINIMO_DEDO;
  if (!hayDedo) {
    amplitudPPG = 0;
    sobreLineaPPG = false;
    actualizarEstadoSenalPPG();
    return;
  }

  const desviacion = filtroPPG - baseLinePPG;
  // Envolvente adaptativa: sigue picos nuevos al instante, decae despacio.
  amplitudPPG = Math.max(amplitudPPG * 0.995, Math.abs(desviacion));
  const margen = Math.max(amplitudPPG * 0.3, 0.4);

  if (!sobreLineaPPG && desviacion > margen) {
    sobreLineaPPG = true;
    const intervalo = tiempoMs - ultimaCrestaPPG;
    if (!ultimaCrestaPPG || intervalo > 1500) {
      // Primer latido o señal recién recuperada: sólo fija la referencia.
      ultimaCrestaPPG = tiempoMs;
    } else if (intervalo >= 350) {
      ultimaCrestaPPG = tiempoMs;
      bpm = Math.round(60000 / intervalo);
      registrarIntervaloRR(intervalo);
    }
  } else if (sobreLineaPPG && desviacion < -margen * 0.4) {
    sobreLineaPPG = false;
  }

  actualizarEstadoSenalPPG();
}

function actualizarEstadoSenalPPG() {
  if (!camaraActiva || !estadoConexion.startsWith("Cámara")) return;
  const hayDedo = brilloPromedioPPG >= BRILLO_MINIMO_DEDO;
  const mensaje = !hayDedo
    ? "Cámara activa · coloca el dedo cubriendo el lente y el flash"
    : !ultimaCrestaPPG
      ? "Cámara activa · detectando pulso..."
      : `Cámara activa · ${bpm || "--"} BPM`;
  if (mensaje === ultimoAvisoSenalPPG) return;
  ultimoAvisoSenalPPG = mensaje;
  actualizarEstadoBluetooth(mensaje, true);
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
  if (!window.isSecureContext) {
    actualizarEstadoBluetooth("Bluetooth requiere HTTPS o localhost");
    return;
  }
  if (!navigator.bluetooth?.requestDevice) {
    actualizarEstadoBluetooth("Usa Chrome o Edge para conectar Bluetooth");
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
      actualizarEstadoBluetooth("Desconectado", false);
      faseActual = estadoFases.ESPERA;
      overlayInstrucciones.classList.add("hidden");
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

    actualizarEstadoBluetooth(`✓ ${dispositivoBluetooth.name || "Coospo H6M"}`, true);
    actualizarLecturaBiometrica();
  } catch (error) {
    caracteristicaFrecuenciaCardiaca = null;
    const mensajes = {
      NotFoundError: "No se seleccionó ningún sensor",
      SecurityError: "Bluetooth bloqueado por permisos del navegador",
      NotSupportedError: "Este navegador no admite Web Bluetooth",
      InvalidStateError: "Activa Bluetooth en el computador",
    };
    const mensajeError = mensajes[error.name] || "No se pudo conectar al sensor";
    actualizarEstadoBluetooth(mensajeError, false);
    actualizarLecturaBiometrica();
  }
}

function actualizarLecturaBiometrica() {
  console.log(
    `Estado: ${estadoConexion} | BPM: ${bpm || "--"} | A: ${inputA} ms | B: ${inputB} ms | RMSSD: ${rmssd.toFixed(1)} ms | Coherencia: ${factorSomatico.toFixed(2)}`
  );
  actualizarVisualizacionHRV();
}

botonConectar.addEventListener("click", conectarSensorCardiaco);

const textosInformativos = {
  coherencia: ["Coherencia cardíaca", "Estado de sincronización fisiológica donde el ritmo cardíaco se vuelve una onda armónica y fluida."],
  rr: ["Intervalo RR", "El tiempo en milisegundos entre cada latido consecutivo del corazón."],
  resonancia: ["Frecuencia de resonancia · 0.1 Hz", "Ritmo óptimo de respiración, aproximadamente 6 respiraciones por minuto, que estimula el nervio vago y equilibra el sistema nervioso."],
  rmssd: ["RMSSD", "Métrica que refleja la actividad del sistema parasimpático y la capacidad de recuperación ante el estrés."],
  poincare: [
    "Diagrama de Poincaré",
    "Cada punto compara un latido con el siguiente: el eje X es el intervalo RR actual y el eje Y es el que le sigue. " +
    "Una nube alargada en forma de cigarro sobre la diagonal indica una variabilidad saludable y rítmica, típica de una respiración coherente. " +
    "Una nube compacta y redonda cerca del centro refleja poca variabilidad (tono parasimpático bajo); " +
    "una nube muy dispersa y sin forma indica un ritmo irregular o caótico.",
  ],
  psd: [
    "Densidad espectral (PSD)",
    "Descompone la variabilidad del ritmo cardíaco en las frecuencias que la componen. " +
    "Un pico alto y angosto exactamente en 0.1 Hz (línea punteada) — el ritmo de la respiración resonante, unas 6 respiraciones por minuto — " +
    "indica que el corazón y el nervio vago están oscilando en sincronía: coherencia real. " +
    "Un espectro plano, bajo y disperso, sin picos claros, refleja un ritmo desorganizado, típico de estrés o de una respiración no sincronizada.",
  ],
};
const dialogoInfo = document.querySelector("#info-dialog");
document.querySelectorAll("[data-info]").forEach((boton) => boton.addEventListener("click", () => {
  const [titulo, texto] = textosInformativos[boton.dataset.info];
  document.querySelector("#info-title").textContent = titulo;
  document.querySelector("#info-text").textContent = texto;
  dialogoInfo.showModal();
}));
document.querySelector(".dialog-close").addEventListener("click", () => dialogoInfo.close());
document.querySelectorAll(".report-dialog .dialog-close").forEach((boton) => boton.addEventListener("click", () => boton.closest("dialog").close()));

// Inicializar
cargarHistorial();
actualizarTendenciaBiometrica();
actualizarEstadoBluetooth("Desconectado", false);
actualizarLecturaBiometrica();
graficoPoincare = crearGraficoPoincare();
graficoEspectro = crearGraficoEspectro();
actualizarGraficoEspectro();

// ======================================================
// 09 — BUCLE DE ANIMACIÓN
// ======================================================

function animar() {
  requestAnimationFrame(animar);

  controlesOrbita.update();
  actualizarCampoAnimado();
  actualizarBotonesPhase();
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
window.addEventListener("resize", dibujarTacograma);

generarCampo();
animar();
