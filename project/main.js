import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — PARÁMETROS
// ======================================================

const valoresIniciales = {
  densidad: 1800,
  tamaño: 0.12,
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

function mapearColorSomatico(factor, destino) {
  const valor = THREE.MathUtils.clamp((factor - 0.2) / 1.8, 0, 1);
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

function crearAnillo() {
  esferaExterior = new THREE.Mesh(
    new THREE.SphereGeometry(3, 32, 24),
    new THREE.MeshBasicMaterial({ color: "#71817f", wireframe: true, transparent: true, opacity: 0.2 })
  );
  grupoCampo.add(esferaExterior);

  const geometria = new THREE.IcosahedronGeometry(2.5, 5);
  const material = new THREE.MeshStandardMaterial({
    color: "#e45757", roughness: 0.25, metalness: 0.08,
    emissive: "#e45757", emissiveIntensity: 0.35,
  });
  anillo = new THREE.Mesh(geometria, material);
  anillo.castShadow = true;
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

function actualizarAnillo(tiempo) {
  if (!anillo) return;
  if (esferaExterior) {
    esferaExterior.rotation.y -= 0.0004;
    esferaExterior.rotation.x = Math.sin(tiempo * 0.12) * 0.03;
  }

  // ========================================
  // PACER RESPIRATORIO (Fase 2 solamente)
  // ========================================
  let factorPacer = 0.18;
  
  if (faseActual === estadoFases.ENTRENAMIENTO) {
    // Calcular posición en el ciclo respiratorio
    const tiempoEnFase = tiempo - tiempoFaseInicio;
    const posicionCiclo = (tiempoEnFase % PACER_CICLO_TOTAL) / PACER_CICLO_TOTAL;
    
    if (posicionCiclo < PACER_INHALACION / PACER_CICLO_TOTAL) {
      // Fase de inhalación (0 -> 1)
      factorPacer = posicionCiclo / (PACER_INHALACION / PACER_CICLO_TOTAL);
    } else {
      // Fase de exhalación (1 -> 0)
      const posicionExhalacion = (posicionCiclo - PACER_INHALACION / PACER_CICLO_TOTAL) / 
                                 (PACER_EXHALACION / PACER_CICLO_TOTAL);
      factorPacer = 1 - posicionExhalacion;
    }
    
    // Inhalación expande el orbe durante 4s; exhalación lo contrae durante 6s.
  }

  const pulso = 1 + Math.sin(tiempo * frecuenciaLatido * Math.PI * 2) * 0.018;
  const escala = THREE.MathUtils.lerp(0.5, 1.18, factorPacer) * pulso;
  mapearColorSomatico(factorSomatico, colorTemporal);
  colorSomatico.lerp(colorTemporal, 0.08);
  anillo.material.color.copy(colorSomatico);
  anillo.material.emissive.copy(colorSomatico);
  anillo.material.emissiveIntensity = 0.25 + factorSomatico * 0.65;
  anillo.scale.setScalar(escala);
  anillo.rotation.y += 0.0015;
  anillo.rotation.x = Math.sin(tiempo * 0.22) * 0.08;
}

function actualizarCampoAnimado() {
  const tiempo = reloj.getElapsedTime();
  if (!caracteristicaFrecuenciaCardiaca) actualizarSimulacionAutomatica(tiempo);
  factorSomatico = THREE.MathUtils.lerp(factorSomatico, factorSomaticoObjetivo, 0.04);
  const mediaRRObjetivo = (inputA + inputB) / 2;
  mediaRRVisual = THREE.MathUtils.lerp(mediaRRVisual, mediaRRObjetivo, 0.08);
  const frecuenciaObjetivo = 1000 / Math.max(mediaRRVisual, 1);
  frecuenciaLatido = THREE.MathUtils.lerp(frecuenciaLatido, frecuenciaObjetivo, 0.08);
  
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
  
  actualizarAnillo(tiempo);
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

// Mostrar historial persistente con tendencia de CS y RMSSD.
function mostrarHistorialCompleto() {
  const sesiones = registroHistorial.slice(-10);
  document.querySelector("#history-summary").innerHTML = sesiones
    .map((registro, indice) => `<span>Sesión ${indice + 1}: ${(registro.avgCS ?? registro.coherencia ?? 0).toFixed(1)} CS · ${registro.rmssdFinal.toFixed(1)} ms RMSSD</span>`)
    .join("");
  dibujarHistorial(sesiones);
  document.querySelector("#history-dialog").showModal();
}

function dibujarHistorial(sesiones) {
  const lienzo = document.querySelector("#history-chart");
  const escala = window.devicePixelRatio || 1;
  const ancho = lienzo.clientWidth || 520;
  const alto = lienzo.clientHeight || 240;
  lienzo.width = ancho * escala;
  lienzo.height = alto * escala;
  const contexto = lienzo.getContext("2d");
  contexto.scale(escala, escala);
  contexto.clearRect(0, 0, ancho, alto);
  if (!sesiones.length) return;
  const valores = [
    sesiones.map((registro) => registro.avgCS ?? registro.coherencia ?? 0),
    sesiones.map((registro) => registro.rmssdFinal || 0),
  ];
  const maximo = Math.max(...valores.flat(), 1);
  ["#42d392", "#4c8dff"].forEach((color, serie) => {
    contexto.strokeStyle = color;
    contexto.lineWidth = 2;
    contexto.beginPath();
    valores[serie].forEach((valor, indice) => {
      const x = sesiones.length === 1 ? ancho / 2 : 12 + (indice / (sesiones.length - 1)) * (ancho - 24);
      const y = alto - 18 - (valor / maximo) * (alto - 36);
      indice ? contexto.lineTo(x, y) : contexto.moveTo(x, y);
    });
    contexto.stroke();
  });
  contexto.font = "11px system-ui";
  contexto.fillStyle = "#42d392";
  contexto.fillText("CS", 12, 16);
  contexto.fillStyle = "#4c8dff";
  contexto.fillText("RMSSD", 42, 16);
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
    "Sincroniza tu respiración con el anillo. Inhala (4s) - Exhala (6s)",
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
    const porcentajeMejora = ((cambioRMSSD / rmssdBasal) * 100).toFixed(1);
    
    console.log(`[FASE 2 - FIN] RMSSD Final: ${rmssdFinal.toFixed(1)} ms`);
    console.log(`[MEJORA] Δ RMSSD: ${cambioRMSSD.toFixed(1)} ms (${porcentajeMejora}%)`);
    
    // Registrar en historial
    const totalZonas = Object.values(tiempoZonas).reduce((suma, valor) => suma + valor, 0) || 1;
    const avgCS = tiempoCS > 0 ? acumuladoCS / tiempoCS : factorSomatico;
    const registro = {
      fecha: new Date().toISOString(),
      rmssdBasal: parseFloat(rmssdBasal.toFixed(1)),
      rmssdFinal: parseFloat(rmssdFinal.toFixed(1)),
      cambio: parseFloat(cambioRMSSD.toFixed(1)),
      porcentajeMejora: parseFloat(porcentajeMejora),
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

// Mostrar resultados de la sesión
function mostrarResultados(registro) {
  const anterior = registroHistorial.at(-2);
  const altaAnterior = anterior?.zonas?.alta || 0;
  const diferenciaAlta = registro.zonas.alta - altaAnterior;
  const comparativa = anterior
    ? `Lograste un ${diferenciaAlta >= 0 ? "+" : ""}${diferenciaAlta}% de tiempo en coherencia alta frente a tu sesión anterior.`
    : "Esta es tu primera sesión guardada; úsala como punto de referencia.";
  const zonas = ["baja", "media", "alta"];
  const colores = { baja: "#e45757", media: "#4c8dff", alta: "#42d392" };
  document.querySelector("#results-content").innerHTML = `
    <div class="report-highlight"><span>Coherencia promedio</span><strong>${registro.avgCS.toFixed(1)} CS</strong><span class="achievement">${registro.puntosLogro} pts de logro</span></div>
    <p class="report-comparison">${comparativa}</p>
    <h3>Tiempo en coherencia</h3>
    <div class="zone-report">${zonas.map((zona) => `<div><span><i style="background:${colores[zona]}"></i>${zona}</span><strong>${registro.zonas[zona] || 0}%</strong></div>`).join("")}</div>
    <h3>Resumen biométrico</h3>
    <div class="biometric-report"><div><span>RMSSD final</span><strong>${registro.rmssdFinal.toFixed(1)} ms</strong></div><div><span>BPM final</span><strong>${registro.bpmFinal || "--"}</strong></div></div>`;
  document.querySelector("#session-hud")?.classList.add("hidden");
  document.querySelector("#results-dialog").showModal();
}

function mostrarResultadosBasales(registro) {
  const overlay = document.querySelector("#phase-overlay");
  document.querySelector("#instruction-title").textContent = "Resultados basales";
  document.querySelector("#instruction-text").innerHTML = `
    <strong>RMSSD: ${registro.rmssd.toFixed(1)} ms</strong><br>
    Coherencia inicial: <strong>${registro.coherencia.toFixed(2)}</strong><br><br>
    Tu nivel de coherencia de reposo indica tu estado actual de tono vagal y flexibilidad autonómica antes de ejercitar.
  `;
  document.querySelector("#timer-display").textContent = "01:00";
  document.querySelector("#training-config").classList.remove("hidden");
  overlay.classList.remove("hidden");
}

// Actualizar UI de los botones de fase
function actualizarBotonesPhase() {
  const btn1 = document.querySelector("#btn-phase1");
  const btn2 = document.querySelector("#btn-phase2");
  const btn3 = document.querySelector("#btn-phase3");
  const phaseInfo = document.querySelector("#phase-info");
  
  const estaConectado = Boolean(caracteristicaFrecuenciaCardiaca || camaraActiva);
  
  btn1.disabled = !estaConectado || faseActual !== estadoFases.ESPERA;
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
    phaseInfo.textContent = `Basal: ${rmssdBasal.toFixed(1)} ms\nActual: ${rmssd.toFixed(1)} ms\nPuntaje de Coherencia: ${factorSomatico.toFixed(2)} CS`;
  } else if (faseActual === estadoFases.RESULTADOS_BASAL) {
    phaseInfo.textContent = `Resultados basales · RMSSD: ${rmssdBasal.toFixed(1)} ms · Elige la duración del entrenamiento`;
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
const overlayInstrucciones = document.querySelector("#phase-overlay");
const timerDisplay = document.querySelector("#timer-display");
const trainingDuration = document.querySelector("#training-duration");
const trainingDurationValue = document.querySelector("#training-duration-value");

// Listeners de botones de fase
btn1.addEventListener("click", iniciarEvaluacionBasal);
btn2.addEventListener("click", iniciarEntrenamiento);
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
