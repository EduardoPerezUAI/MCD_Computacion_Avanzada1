import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — PARÁMETROS
// ======================================================

const valoresIniciales = {
  densidad: 2600,
  tamaño: 0.05,
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
controlesOrbita.enableRotate = true;
controlesOrbita.dampingFactor = 0.08;
controlesOrbita.minDistance = 7;
controlesOrbita.maxDistance = 32;
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

  let mejorFrecuencia = 0.04;
  let mejorAjuste = 0;
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

function dibujarTacograma() {
  const lienzo = document.querySelector("#tacogram");
  if (!lienzo) return;
  const escala = window.devicePixelRatio || 1;
  const ancho = lienzo.clientWidth || 420;
  const alto = lienzo.clientHeight || 150;
  lienzo.width = ancho * escala;
  lienzo.height = alto * escala;
  const contexto = lienzo.getContext("2d");
  contexto.scale(escala, escala);
  contexto.clearRect(0, 0, ancho, alto);
  const valores = historialTacograma;
  if (valores.length < 2) return;
  const minimo = Math.min(...valores) - 20;
  const maximo = Math.max(...valores) + 20;
  contexto.strokeStyle = "#42d392";
  contexto.lineWidth = 2;
  contexto.beginPath();
  valores.forEach((valor, indice) => {
    const x = (indice / (valores.length - 1)) * ancho;
    const y = alto - ((valor - minimo) / Math.max(maximo - minimo, 1)) * (alto - 12) - 6;
    if (indice === 0) contexto.moveTo(x, y); else contexto.lineTo(x, y);
  });
  contexto.stroke();
  document.querySelector("#rr-range").textContent = `${Math.round(minimo + 20)}–${Math.round(maximo - 20)} ms`;
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

    const brillo = brillos[indice] * THREE.MathUtils.lerp(0.75, 1.25, coherenciaNormalizada);
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

  if (!caracteristicaFrecuenciaCardiaca) actualizarSimulacionAutomatica(tiempo);
  // Transiciones suaves e independientes del framerate (evita saltos bruscos
  // en dispositivos con tasas de refresco variables).
  factorSomatico = THREE.MathUtils.damp(factorSomatico, factorSomaticoObjetivo, 1.4, delta);
  const mediaRRObjetivo = (inputA + inputB) / 2;
  mediaRRVisual = THREE.MathUtils.damp(mediaRRVisual, mediaRRObjetivo, 0.6, delta);
  const frecuenciaObjetivo = 1000 / Math.max(mediaRRVisual, 1);
  frecuenciaLatido = THREE.MathUtils.damp(frecuenciaLatido, frecuenciaObjetivo, 0.6, delta);

  // ========================================
  // GESTIÓN DE FASES Y TEMPORIZADORES
  // ========================================
  if (faseActual === estadoFases.EVALUACION || faseActual === estadoFases.ENTRENAMIENTO) {
    const tiempoTranscurrido = tiempo - tiempoFaseInicio;

    // Actualizar display del temporizador
    const tiempoRestante = Math.max(0, tiempoFaseDuracion - tiempoTranscurrido);
    const minutos = Math.floor(tiempoRestante / 60);
    const segundos = Math.floor(tiempoRestante % 60);
    timerDisplay.textContent = `${minutos}:${segundos.toString().padStart(2, '0')}`;
    actualizarHUD(tiempoRestante, tiempoTranscurrido);

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
    if (faseActual === estadoFases.ENTRENAMIENTO) actualizarLogros(tiempo, tiempoTranscurrido);
  } else {
    document.querySelector("#session-hud")?.classList.add("hidden");
  }

  actualizarAnillo(tiempo, delta);
  actualizarLecturaBiometrica();
}

function actualizarHUD(tiempoRestante, tiempoTranscurrido) {
  const hud = document.querySelector("#session-hud");
  if (!hud) return;
  hud.classList.remove("hidden");
  const minutos = Math.floor(tiempoRestante / 60);
  const segundos = Math.floor(tiempoRestante % 60);
  document.querySelector("#hud-timer").textContent = `${minutos.toString().padStart(2, "0")}:${segundos.toString().padStart(2, "0")}`;
  document.querySelector("#hud-guide").textContent = faseActual === estadoFases.EVALUACION
    ? "Respira naturalmente"
    : ((tiempoTranscurrido % PACER_CICLO_TOTAL) < PACER_INHALACION ? "Inhala (4s)" : "Exhala (6s)");
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

// Compara la última sesión de la lista contra la anterior, según % en zona alta.
function calcularBadgeComparativo(sesiones) {
  if (sesiones.length < 2) return null;
  const actual = sesiones.at(-1);
  const anterior = sesiones.at(-2);
  const diferencia = (actual.zonas?.alta || 0) - (anterior.zonas?.alta || 0);
  return {
    texto: `${diferencia >= 0 ? "+" : ""}${diferencia}% de tiempo en coherencia alta respecto a tu última sesión`,
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
function mostrarHistorialCompleto() {
  const sesiones = registroHistorial.slice(-10);
  const badge = calcularBadgeComparativo(sesiones);

  document.querySelector("#history-summary").innerHTML = `
    ${badge ? `<p class="badge-comparativa ${badge.positivo ? "positive" : "negative"}">${badge.positivo ? "▲" : "▼"} ${badge.texto}</p>` : ""}
    <div class="history-legend">
      <span><i style="background:#42d392"></i>% tiempo en coherencia alta</span>
      <span><i style="background:#4c8dff"></i>CS promedio</span>
    </div>
    <div class="history-sessions">${sesiones
      .map((registro, indice) => `<span>Sesión ${indice + 1}: ${(registro.avgCS ?? registro.coherencia ?? 0).toFixed(1)} CS · ${registro.zonas?.alta ?? 0}% alta</span>`)
      .join("")}</div>
    <div class="didactic-card">
      <p class="eyebrow">CÓMO LEER TU PROGRESO</p>
      <p>${TEXTO_DIDACTICO_HISTORIAL}</p>
    </div>
  `;
  dibujarHistorialLineas(sesiones);
  document.querySelector("#history-dialog").showModal();
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
  const duracionInput = document.querySelector("#training-duration");
  tiempoFaseDuracion = Number(duracionInput.value) * 60;
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
    "Sincroniza tu respiración con el orbe. Inhala (4s) - Exhala (6s)",
    tiempoFaseDuracion
  );

  console.log("[FASE 2] Entrenamiento HRVB iniciado - 3 minutos");
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

// Mostrar resultados de la sesión — reporte inspirado en HeartMath Inner Balance:
// dona tricolor de distribución de coherencia, resumen de logros, insignia
// comparativa frente a la sesión anterior y una tarjeta didáctica.
function mostrarResultados(registro) {
  const badge = calcularBadgeComparativo(registroHistorial);
  const zonas = { baja: registro.zonas.baja || 0, media: registro.zonas.media || 0, alta: registro.zonas.alta || 0 };

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
let muestrasPPG = [];
let ultimaCrestaPPG = 0;

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

// Listeners de botones de fase
btn1.addEventListener("click", iniciarEvaluacionBasal);
btn2.addEventListener("click", iniciarEntrenamiento);
botonSaltarBasal?.addEventListener("click", saltarEvaluacionBasal);
botonCamara.addEventListener("click", iniciarCamaraPPG);
document.querySelector("#btn-start-training").addEventListener("click", iniciarEntrenamiento);
trainingDuration.addEventListener("input", () => {
  trainingDurationValue.value = trainingDuration.value;
});
btn3.addEventListener("click", () => {
  if (registroHistorial.length > 0) {
    mostrarHistorialCompleto();
  }
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
    const pista = flujoCamara.getVideoTracks()[0];
    if (pista.getCapabilities?.().torch) {
      try {
        await pista.applyConstraints({ advanced: [{ torch: true }] });
      } catch (error) {
        console.info("El flash no está disponible; continúa sin flash.", error);
      }
    }
    cuadroCamara = document.createElement("canvas");
    cuadroCamara.width = 32;
    cuadroCamara.height = 32;
    muestrasPPG = [];
    ultimaCrestaPPG = 0;
    camaraActiva = true;
    botonCamara.textContent = "Cámara activa · detener";
    botonCamara.onclick = detenerCamaraPPG;
    actualizarEstadoBluetooth("Cámara activa · coloca el dedo sobre el lente", true);
    leerPulsoCamara();
  } catch (error) {
    detenerCamaraPPG();
    actualizarEstadoBluetooth(error.name === "NotAllowedError" ? "Permiso de cámara rechazado" : "No se pudo activar la cámara");
  }
}

function detenerCamaraPPG() {
  flujoCamara?.getTracks().forEach((pista) => pista.stop());
  flujoCamara = null;
  camaraActiva = false;
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
  muestrasPPG.push({ tiempo: performance.now(), valor: rojo / cantidadPixeles - verde / cantidadPixeles });
  if (muestrasPPG.length > 40) muestrasPPG.shift();
  detectarLatidoPPG();
  requestAnimationFrame(leerPulsoCamara);
}

function detectarLatidoPPG() {
  if (muestrasPPG.length < 7) return;
  const candidato = muestrasPPG.at(-4);
  const vecinos = muestrasPPG.slice(-7);
  const promedio = vecinos.reduce((suma, muestra) => suma + muestra.valor, 0) / vecinos.length;
  const desviacion = Math.sqrt(vecinos.reduce((suma, muestra) => suma + (muestra.valor - promedio) ** 2, 0) / vecinos.length);
  const esCresta = candidato.valor === Math.max(...vecinos.map((muestra) => muestra.valor));
  const intervalo = candidato.tiempo - ultimaCrestaPPG;
  if (!esCresta || candidato.valor < promedio + desviacion * 0.35) return;
  if (!ultimaCrestaPPG) {
    ultimaCrestaPPG = candidato.tiempo;
    return;
  }
  if (intervalo < 350 || intervalo > 1500) return;
  ultimaCrestaPPG = candidato.tiempo;
  bpm = Math.round(60000 / intervalo);
  registrarIntervaloRR(intervalo);
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
