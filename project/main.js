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
let rmssd = 0;
let factorSomatico = 0;
let factorSomaticoObjetivo = 0;
let mediaRRVisual = (inputA + inputB) / 2;
let frecuenciaLatido = 1000 / mediaRRVisual;
let frecuenciaCoherente = 0;
let dispersionRR = 0;
let pulsoRadial = 0;

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
controlesOrbita.enableRotate = true;
controlesOrbita.dampingFactor = 0.08;
controlesOrbita.minDistance = 7;
controlesOrbita.maxDistance = 32;
controlesOrbita.target.set(0, 0, 0);

// Iluminación general.
const luzAmbiente = new THREE.AmbientLight(0xdcecff, 1.1);
escena.add(luzAmbiente);

const luzHemisferica = new THREE.HemisphereLight(0xf3efe5, 0x202229, 1.8);
escena.add(luzHemisferica);

// Luz principal.
const luzPrincipal = new THREE.DirectionalLight(0xffffff, 3.2);
luzPrincipal.position.set(10, 18, 12);
luzPrincipal.castShadow = true;
escena.add(luzPrincipal);

// Luz secundaria para suavizar el contraste.
const luzRelleno = new THREE.DirectionalLight(0xc8d8ff, 1.4);
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
const paradasCromaticas = [
  { factor: 0.00, color: new THREE.Color("#660000") },
  { factor: 0.25, color: new THREE.Color("#FF3300") },
  { factor: 0.50, color: new THREE.Color("#FFCC00") },
  { factor: 0.75, color: new THREE.Color("#00CC66") },
  { factor: 1.00, color: new THREE.Color("#0066FF") },
];
const colorTemporal = new THREE.Color();
const colorSomatico = new THREE.Color("#660000");
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
  const dispersionNormalizada = THREE.MathUtils.clamp(desviacion / 55, 0, 1);
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
  const count = Math.max(400, Math.round(parametros.densidad));
  ruidoAutomatico.length = 0;
  for (let indice = 0; indice < count; indice++) {
    ruidoAutomatico.push(aleatoriedadConSemilla(indice, 0, parametros.semilla));
  }
  const geometria = new THREE.SphereGeometry(1, 12, 8);
  const material = new THREE.MeshStandardMaterial({
    color: "#660000",
    roughness: 0.42,
    metalness: 0.05,
    transparent: true,
    opacity: 1,
  });

  const esferas = new THREE.InstancedMesh(geometria, material, count);
  esferas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  esferas.userData = { count };
  esferas.castShadow = true;
  grupoCampo.add(esferas);
  anillo = esferas;
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

  const cantidad = puntos.count;
  const matrizParticula = new THREE.Object3D();

  // ========================================
  // PACER RESPIRATORIO (Fase 2 solamente)
  // ========================================
  let radioBase = 4.6;
  let factorPacer = 0; // 0 = exhalación, 1 = inhalación
  
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
    
    // Expandir y contraer el anillo según el pacer
    // Inhalación = expansión, Exhalación = contracción
    radioBase = 4.6 + factorPacer * 0.8; // Variación de ±0.8 en el radio base
  }

  const frecuenciaRitmo = frecuenciaLatido;
  const faseCardiaca = tiempo * frecuenciaRitmo * Math.PI * 2;
  const pulsoObjetivo = Math.sin(faseCardiaca) * parametros.amplitud * 0.012;
  pulsoRadial = THREE.MathUtils.lerp(pulsoRadial, pulsoObjetivo, 0.08);
  
  // Durante entrenamiento, la turbulencia disminuye si hay coherencia
  let grosorPerfil;
  if (faseActual === estadoFases.ENTRENAMIENTO) {
    // Si el usuario tiene alta coherencia (RMSSD alto), menos turbulencia
    grosorPerfil = THREE.MathUtils.lerp(0.012, parametros.dispersión * (1 - factorSomatico), factorSomatico);
  } else {
    grosorPerfil = THREE.MathUtils.lerp(0.012, parametros.dispersión, factorSomatico);
  }
  
  mapearColorSomatico(factorSomatico, colorTemporal);
  colorSomatico.lerp(colorTemporal, 0.08);
  puntos.material.color.copy(colorSomatico);

  for (let indice = 0; indice < cantidad; indice++) {
    const progreso = indice / cantidad;
    const angulo = progreso * Math.PI * 2;
    const ruido = ruidoAutomatico[indice % ruidoAutomatico.length] || 0;
    const faseParticula = faseCardiaca + ruido * 0.35;
    const contraccionRadial = Math.sin(faseParticula) * pulsoRadial * 0.35;
    const dispersionAleatoria = ruido * parametros.aleatoriedad * grosorPerfil * 0.35;
    const radio = radioBase + pulsoRadial + ruido * grosorPerfil +
      dispersionAleatoria + contraccionRadial;

    const x = Math.cos(angulo) * radio;
    const y = Math.sin(angulo) * radio;
    const z = 0;

    matrizParticula.position.set(x, y, z);
    matrizParticula.scale.setScalar(parametros.tamaño);
    matrizParticula.updateMatrix();
    puntos.setMatrixAt(indice, matrizParticula.matrix);
  }

  puntos.instanceMatrix.needsUpdate = true;
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
  
  actualizarAnillo(tiempo);
  actualizarLecturaBiometrica();
}

// Mostrar historial completo en consola y actualizar UI
function mostrarHistorialCompleto() {
  console.log("=".repeat(60));
  console.log("HISTORIAL COMPLETO DE SESIONES HRV BIOFEEDBACK");
  console.log("=".repeat(60));
  
  let resumenHTML = "<strong>Historial de Sesiones:</strong><br><br>";
  
  registroHistorial.forEach((registro, indice) => {
    const fecha = new Date(registro.fecha).toLocaleString("es-ES");
    console.log(`\nSesión ${indice + 1} - ${fecha}`);
    console.log(`  RMSSD Basal: ${registro.rmssdBasal.toFixed(1)} ms`);
    console.log(`  RMSSD Final: ${registro.rmssdFinal.toFixed(1)} ms`);
    console.log(`  Cambio: ${registro.cambio > 0 ? '+' : ''}${registro.cambio.toFixed(1)} ms (${registro.porcentajeMejora}%)`);
    console.log(`  Coherencia: ${registro.coherencia}`);
    
    resumenHTML += `
      <strong>Sesión ${indice + 1}</strong> - ${fecha}<br>
      Basal: ${registro.rmssdBasal.toFixed(1)} ms → Final: ${registro.rmssdFinal.toFixed(1)} ms<br>
      Cambio: ${registro.cambio > 0 ? '+' : ''}${registro.cambio.toFixed(1)} ms (${registro.porcentajeMejora}%)<br>
      <br>
    `;
  });
  
  console.log("\n" + "=".repeat(60));
  
  // Mostrar en overlay
  const overlay = document.querySelector("#phase-overlay");
  const titleEl = document.querySelector("#instruction-title");
  const textEl = document.querySelector("#instruction-text");
  const timerEl = document.querySelector("#timer-display");
  
  titleEl.textContent = "Historial de Sesiones";
  textEl.innerHTML = resumenHTML;
  timerEl.textContent = "📊";
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
  factorSomaticoObjetivo = relajacion;
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
  HISTORIAL: 3,        // Phase 3: Ver historial / resultados
};

let faseActual = estadoFases.ESPERA;
let tiempoFaseInicio = 0;
let tiempoFaseDuracion = 0;
let rmssdBasal = 0;
let rmssdFinal = 0;
let registroHistorial = [];

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
  if (!caracteristicaFrecuenciaCardiaca) {
    console.warn("Sensor Bluetooth no conectado");
    return;
  }
  
  faseActual = estadoFases.EVALUACION;
  tiempoFaseInicio = reloj.getElapsedTime();
  tiempoFaseDuracion = 60; // 60 segundos
  rmssdBasal = 0;
  
  actualizarInstrucciones(
    "Evaluación Basal",
    "Respira naturalmente. Se está calculando tu RMSSD basal...",
    60
  );
  
  console.log("[FASE 1] Evaluación basal iniciada - 60 segundos");
}

// Iniciar Fase 2: Entrenamiento HRVB (3-5 minutos con pacer)
function iniciarEntrenamiento() {
  if (!caracteristicaFrecuenciaCardiaca) {
    console.warn("Sensor Bluetooth no conectado");
    return;
  }
  
  faseActual = estadoFases.ENTRENAMIENTO;
  tiempoFaseInicio = reloj.getElapsedTime();
  tiempoFaseDuracion = 180; // 3 minutos (pueden ajustar a 300 para 5 minutos)
  
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
    
    // Transición a Fase 2
    setTimeout(() => iniciarEntrenamiento(), 1000);
  } 
  else if (faseActual === estadoFases.ENTRENAMIENTO) {
    // Guardar RMSSD final
    rmssdFinal = rmssd;
    const cambioRMSSD = rmssdFinal - rmssdBasal;
    const porcentajeMejora = ((cambioRMSSD / rmssdBasal) * 100).toFixed(1);
    
    console.log(`[FASE 2 - FIN] RMSSD Final: ${rmssdFinal.toFixed(1)} ms`);
    console.log(`[MEJORA] Δ RMSSD: ${cambioRMSSD.toFixed(1)} ms (${porcentajeMejora}%)`);
    
    // Registrar en historial
    const registro = {
      fecha: new Date().toISOString(),
      rmssdBasal: parseFloat(rmssdBasal.toFixed(1)),
      rmssdFinal: parseFloat(rmssdFinal.toFixed(1)),
      cambio: parseFloat(cambioRMSSD.toFixed(1)),
      porcentajeMejora: parseFloat(porcentajeMejora),
      coherencia: parseFloat(factorSomatico.toFixed(2)),
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
  
  overlay.classList.remove("hidden");
}

// Mostrar resultados de la sesión
function mostrarResultados(registro) {
  const overlay = document.querySelector("#phase-overlay");
  const titleEl = document.querySelector("#instruction-title");
  const textEl = document.querySelector("#instruction-text");
  const timerEl = document.querySelector("#timer-display");
  
  titleEl.textContent = "Sesión Completada ✓";
  
  const mejora = registro.cambio > 0 ? "MEJORÓ" : "DISMINUYÓ";
  const color = registro.cambio > 0 ? "💚" : "💙";
  
  textEl.innerHTML = `
    <strong>Resultados de Coherencia Cardiorrespiratoria:</strong><br><br>
    RMSSD Basal: <strong>${registro.rmssdBasal.toFixed(1)}</strong> ms<br>
    RMSSD Final: <strong>${registro.rmssdFinal.toFixed(1)}</strong> ms<br>
    <br>
    Cambio: <strong>${color} ${registro.cambio > 0 ? '+' : ''}${registro.cambio.toFixed(1)}</strong> ms<br>
    Mejora: <strong>${registro.porcentajeMejora}%</strong><br>
    <br>
    Coherencia: <strong>${registro.coherencia}</strong>
  `;
  
  timerEl.textContent = "✓";
  timerEl.classList.add("complete");
}

// Actualizar UI de los botones de fase
function actualizarBotonesPhase() {
  const btn1 = document.querySelector("#btn-phase1");
  const btn2 = document.querySelector("#btn-phase2");
  const btn3 = document.querySelector("#btn-phase3");
  const phaseInfo = document.querySelector("#phase-info");
  
  const estaConectado = Boolean(caracteristicaFrecuenciaCardiaca);
  
  btn1.disabled = !estaConectado || faseActual !== estadoFases.ESPERA;
  btn2.disabled = !estaConectado || faseActual !== estadoFases.ESPERA;
  btn3.disabled = registroHistorial.length === 0;
  
  // Actualizar indicador de fase activa
  [btn1, btn2, btn3].forEach(btn => btn.classList.remove("active"));
  if (faseActual === estadoFases.EVALUACION) btn1.classList.add("active");
  if (faseActual === estadoFases.ENTRENAMIENTO) btn2.classList.add("active");
  if (faseActual === estadoFases.HISTORIAL) btn3.classList.add("active");
  
  // Actualizar información de sesión
  if (faseActual === estadoFases.ESPERA) {
    phaseInfo.textContent = estaConectado ? "Listo para iniciar sesión" : "Conecta el sensor para comenzar";
  } else if (faseActual === estadoFases.EVALUACION) {
    phaseInfo.textContent = `RMSSD Actual: ${rmssd.toFixed(1)} ms\nCoherencia: ${factorSomatico.toFixed(2)}`;
  } else if (faseActual === estadoFases.ENTRENAMIENTO) {
    phaseInfo.textContent = `Basal: ${rmssdBasal.toFixed(1)} ms\nActual: ${rmssd.toFixed(1)} ms\nCoherencia: ${factorSomatico.toFixed(2)}`;
  }
}

// ======================================================
// 08 — INTERFAZ Y CONEXIÓN BLUETOOTH
// ======================================================

let dispositivoBluetooth = null;
let caracteristicaFrecuenciaCardiaca = null;
let estadoConexion = "Desconectado";

// Elementos UI
const botonConectar = document.querySelector("#btn-conectar-main");
const statusConexion = document.querySelector("#connection-status");
const btn1 = document.querySelector("#btn-phase1");
const btn2 = document.querySelector("#btn-phase2");
const btn3 = document.querySelector("#btn-phase3");
const overlayInstrucciones = document.querySelector("#phase-overlay");
const timerDisplay = document.querySelector("#timer-display");

// Listeners de botones de fase
btn1.addEventListener("click", iniciarEvaluacionBasal);
btn2.addEventListener("click", iniciarEntrenamiento);
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
    const mensajeError = error.name === "NotFoundError" ? "Desconectado" : "Error de conexión";
    actualizarEstadoBluetooth(mensajeError, false);
    actualizarLecturaBiometrica();
  }
}

function actualizarLecturaBiometrica() {
  console.log(
    `Estado: ${estadoConexion} | BPM: ${bpm || "--"} | A: ${inputA} ms | B: ${inputB} ms | RMSSD: ${rmssd.toFixed(1)} ms | Coherencia: ${factorSomatico.toFixed(2)}`
  );
}

botonConectar.addEventListener("click", conectarSensorCardiaco);

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

generarCampo();
animar();
