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

const biometria = {
  inputA: 760,
  inputB: 760,
  deltaRR: 0,
  simulacionActiva: true,
  modo: "estrés",
};

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

  const promedioRR = (biometria.inputA + biometria.inputB) / 2;
  const escalaPulso = THREE.MathUtils.mapLinear(promedioRR, 600, 1000, 0.78, 1.22);
  const tension = THREE.MathUtils.clamp(1 - biometria.deltaRR / 90, 0, 1);

  const ondaSuave =
    Math.sin(distancia * parametros.frecuencia - promedioRR * 0.004) *
    parametros.amplitud;
  const ondaAguda =
    Math.sin(x * 2.7 + z * 4.1) *
    Math.cos(distancia * 3.6) *
    parametros.amplitud *
    0.7;

  const onda = THREE.MathUtils.lerp(ondaSuave, ondaAguda, tension);

  const ruido =
    aleatoriedadConSemilla(x, z, parametros.semilla) *
    (parametros.aleatoriedad + tension * 0.7);

  return Math.max(0.25, (1.2 + onda + ruido) * escalaPulso);
}

// Regla B:
// la orientación depende de la dirección radial respecto al centro.
function calcularRotacionModulo(x, z) {
  const direccion = Math.atan2(z, x);
  const tension = THREE.MathUtils.clamp(1 - biometria.deltaRR / 90, 0, 1);
  const torsion = Math.sin(x * 1.8 + z * 1.2) * tension * 0.38;

  return direccion * parametros.rotacion + torsion;
}

// ======================================================
// 05 — GENERAR CAMPO
// ======================================================

function generarCampo() {
  limpiarCampo();

  const ancho = (parametros.columnas - 1) * parametros.separacion;
  const profundidad = (parametros.filas - 1) * parametros.separacion;

  for (let columna = 0; columna < parametros.columnas; columna++) {
    for (let fila = 0; fila < parametros.filas; fila++) {
      const x = columna * parametros.separacion - ancho / 2;
      const z = fila * parametros.separacion - profundidad / 2;

      const altura = calcularAlturaModulo(x, z);
      const rotacion = calcularRotacionModulo(x, z);

      const modulo = new THREE.Mesh(geometriaModulo, materialModulo);

      const tension = THREE.MathUtils.clamp(1 - biometria.deltaRR / 90, 0, 1);
      const colorModulo = new THREE.Color();
      const matiz = THREE.MathUtils.lerp(0.54, 0.015, tension);
      const saturacion = THREE.MathUtils.lerp(0.72, 0.86, tension);
      const luminosidad = THREE.MathUtils.lerp(0.52, 0.48, tension);
      colorModulo.setHSL(matiz, saturacion, luminosidad);

      // Cada módulo conserva su propia lectura cromática del estado somático.
      modulo.material = materialModulo.clone();
      modulo.material.color.copy(colorModulo);

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

function crearInterfazBiometrica() {
  const estilos = document.createElement("style");
  estilos.textContent = `
    .biometric-hud {
      position: fixed;
      z-index: 20;
      top: 24px;
      right: 364px;
      width: min(360px, calc(100vw - 40px));
      padding: 14px 16px;
      border: 1px solid rgba(120, 255, 211, 0.35);
      background: rgba(8, 15, 17, 0.88);
      color: #a9ffe7;
      font: 11px/1.45 monospace;
      box-shadow: 0 0 24px rgba(46, 255, 187, 0.08);
      backdrop-filter: blur(8px);
    }
    .biometric-title { margin: 0 0 8px; color: #62e8bd; letter-spacing: .12em; }
    #biometric-readout { margin: 0 0 4px; color: #f0fff9; font-variant-numeric: tabular-nums; }
    .biometric-mode { margin: 0 0 12px; color: #62e8bd; letter-spacing: .08em; }
    .biometric-mode[data-estado="estrés"] { color: #ff6d5f; }
    .biometric-hud label { display: grid; grid-template-columns: 58px 1fr; gap: 10px; margin: 7px 0; color: #8bb9ad; }
    .biometric-hud input[type="range"] { width: 100%; accent-color: #62e8bd; }
    .biometric-hud button { width: 100%; margin-top: 8px; padding: 8px; border: 1px solid #62e8bd; background: transparent; color: #a9ffe7; font: inherit; cursor: pointer; }
    .biometric-hud button:hover { background: rgba(98, 232, 189, 0.12); }
    @media (max-width: 900px) {
      .biometric-hud { top: 20px; right: 20px; width: min(360px, calc(100vw - 40px)); }
    }
  `;
  document.head.appendChild(estilos);

  const interfaz = document.createElement("section");
  interfaz.className = "biometric-hud";
  interfaz.innerHTML = `
    <p class="biometric-title">MODO HACKER · BIOFEEDBACK</p>
    <p id="biometric-readout"></p>
    <p id="biometric-mode" class="biometric-mode"></p>
    <label>INPUT A <input id="inputA" type="range" min="600" max="1000" step="1" value="${biometria.inputA}"></label>
    <label>INPUT B <input id="inputB" type="range" min="600" max="1000" step="1" value="${biometria.inputB}"></label>
    <button id="toggle-biometria" type="button"></button>
  `;

  document.body.appendChild(interfaz);

  const controlesBiometricos = {
    inputA: interfaz.querySelector("#inputA"),
    inputB: interfaz.querySelector("#inputB"),
  };

  function actualizarLectura() {
    const readout = interfaz.querySelector("#biometric-readout");
    const modo = interfaz.querySelector("#biometric-mode");

    readout.textContent =
      `Latido A: ${biometria.inputA} ms | Latido B: ${biometria.inputB} ms | ` +
      `ΔRR (HRV): ${biometria.deltaRR} ms`;
    modo.textContent = `ESTADO: ${biometria.modo.toUpperCase()}`;
    modo.dataset.estado = biometria.modo;
    interfaz.querySelector("#toggle-biometria").textContent = biometria.simulacionActiva
      ? "Pausar simulación"
      : "Activar simulación";
  }

  function actualizarBiometria(inputA, inputB) {
    biometria.inputA = THREE.MathUtils.clamp(Math.round(inputA), 600, 1000);
    biometria.inputB = THREE.MathUtils.clamp(Math.round(inputB), 600, 1000);
    biometria.deltaRR = Math.abs(biometria.inputA - biometria.inputB);
    biometria.modo = biometria.deltaRR < 15 ? "estrés" : "calma";

    controlesBiometricos.inputA.value = biometria.inputA;
    controlesBiometricos.inputB.value = biometria.inputB;
    actualizarLectura();
    generarCampo();
  }

  Object.entries(controlesBiometricos).forEach(([nombre, control]) => {
    control.addEventListener("input", () => {
      biometria.simulacionActiva = false;
      actualizarBiometria(
        nombre === "inputA" ? control.value : controlesBiometricos.inputA.value,
        nombre === "inputB" ? control.value : controlesBiometricos.inputB.value
      );
    });
  });

  interfaz.querySelector("#toggle-biometria").addEventListener("click", () => {
    biometria.simulacionActiva = !biometria.simulacionActiva;
    actualizarLectura();
  });

  actualizarLectura();
  return actualizarBiometria;
}

const actualizarBiometria = crearInterfazBiometrica();

function simularBiometria() {
  if (!biometria.simulacionActiva) return;

  const base = 680 + Math.random() * 260;
  const diferencia = biometria.modo === "estrés"
    ? Math.random() * 10
    : 50 + Math.random() * 70;

  actualizarBiometria(base, base + diferencia);
  biometria.modo = biometria.modo === "estrés" ? "calma" : "estrés";
}

setInterval(simularBiometria, 800);

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
