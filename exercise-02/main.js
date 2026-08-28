// ====================================================================
// CAMPOS DE DATOS 02 — NATACIÓN: MEMORIA CORPORAL Y LÍNEAS TEMPORALES
// Visualización simultánea: Pistas lineales (Fondo) + Anillos orgánicos (Frente)
// ====================================================================

const speedInput = document.querySelector("#playback-speed");
const speedValue = document.querySelector("#speed-value");
const spacingInput = document.querySelector("#event-spacing");
const spacingValue = document.querySelector("#spacing-value");
const timeInput = document.querySelector("#time-scrubber");
const timeValue = document.querySelector("#time-value");
const btnPlay = document.querySelector("#btn-play");
const btnReset = document.querySelector("#btn-reset");

let playbackSpeed = Number(speedInput?.value ?? 1);
let eventSpacing = Number(spacingInput?.value ?? 1);
let isPlaying = true;
let isScrubbing = false;
let globalTime = 0; // en segundos de animación

// --------------------------------------------------------------------
// LISTENERS DE INTERFAZ
// --------------------------------------------------------------------

speedInput?.addEventListener("input", () => {
  playbackSpeed = Number(speedInput.value);
  speedValue.textContent = `${playbackSpeed.toFixed(2)}×`;
});

function updateSpacingLabel(val) {
  if (!spacingValue) return;
  if (val <= 0.001) {
    spacingValue.textContent = `0.00 (Simultáneo)`;
  } else if (val >= 0.999) {
    spacingValue.textContent = `1.00 (Secuencial)`;
  } else {
    spacingValue.textContent = `${val.toFixed(2)} (Gradual)`;
  }
}

spacingInput?.addEventListener("input", () => {
  eventSpacing = Number(spacingInput.value);
  updateSpacingLabel(eventSpacing);
});

timeInput?.addEventListener("mousedown", () => { isScrubbing = true; });
timeInput?.addEventListener("touchstart", () => { isScrubbing = true; });
window.addEventListener("mouseup", () => { isScrubbing = false; });
window.addEventListener("touchend", () => { isScrubbing = false; });

timeInput?.addEventListener("input", () => {
  if (window._swimEngine) {
    const total = window._swimEngine.getTotalDuration();
    const fraction = Number(timeInput.value) / 1000;
    globalTime = fraction * total;
  }
});

btnPlay?.addEventListener("click", () => {
  isPlaying = !isPlaying;
  btnPlay.textContent = isPlaying ? "PAUSAR" : "REANUDAR";
});

btnReset?.addEventListener("click", () => {
  globalTime = 0;
  isPlaying = true;
  if (btnPlay) btnPlay.textContent = "PAUSAR";
});

// --------------------------------------------------------------------
// FILTRO DE REGISTROS Y OBTENCIÓN DE DATOS
// --------------------------------------------------------------------

// Exclusión solicitada de registros erróneos o atípicos: 7/16 y 8/20
function isExcludedDate(dateStr) {
  const d = new Date(dateStr);
  const m = d.getMonth() + 1; // 1 - 12
  const day = d.getDate();
  if (m === 7 && day === 16) return true; // Elimina 7/16
  if (m === 8 && day === 20) return true; // Elimina 8/20
  return false;
}

function formatMonthDay(dateStr) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

const STRAVA_TOKEN = "6befd79262e1aee2ad2f3084c06425f4ecb6579f";

async function fetchStravaActivities() {
  const response = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=10", {
    headers: { Authorization: `Bearer ${STRAVA_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Strava respondió HTTP ${response.status}`);
  return (await response.json()).filter((activity) => activity.type === "Swim");
}

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function normalizeSession(session) {
  if (session.huawei_extended) return session;
  return {
    ...session,
    strava_id: session.strava_id ?? session.id,
    calories: session.calories ?? session.total_calories ?? session.active_calories ?? 0,
    huawei_extended: {
      avg_swolf: session.avg_swolf ?? 45,
      avg_heart_rate: session.avg_heart_rate ?? 140,
      total_strokes: session.total_strokes ?? Math.round((session.distance_meters ?? 1000) * 0.5),
      total_laps: session.total_laps ?? Math.max(1, Math.round((session.distance_meters ?? 1000) / 25)),
      pool_length_meters: session.pool_length_meters ?? 25,
      laps_sample: session.laps_sample ?? [],
    },
  };
}

function mergeStravaWithHuawei(stravaActivities, huaweiSessions) {
  const byDate = new Map();
  stravaActivities.forEach((activity) => {
    const key = dateKey(activity.start_date ?? activity.start_date_local);
    byDate.set(key, [...(byDate.get(key) ?? []), activity]);
  });
  const used = new Set();
  const huaweiReference = {
    avg_swolf: Math.round(huaweiSessions.reduce((sum, s) => sum + s.huawei_extended.avg_swolf, 0) / huaweiSessions.length),
    avg_heart_rate: Math.round(huaweiSessions.reduce((sum, s) => sum + s.huawei_extended.avg_heart_rate, 0) / huaweiSessions.length),
  };

  const mergedSessions = huaweiSessions.map((session) => {
    const match = (byDate.get(dateKey(session.date)) ?? [])
      .filter((act) => !used.has(act.id))
      .sort((a, b) => {
        const distanceA = Math.abs((a.distance ?? 0) - session.distance_meters);
        const distanceB = Math.abs((b.distance ?? 0) - session.distance_meters);
        if (distanceA !== distanceB) return distanceA - distanceB;
        return Math.abs(new Date(a.start_date) - new Date(session.date)) - Math.abs(new Date(b.start_date) - new Date(session.date));
      })[0];

    if (!match) return session;
    used.add(match.id);
    return {
      ...session,
      strava_id: String(match.id),
      name: match.name ?? session.name,
      date: match.start_date ?? session.date,
      distance_meters: Math.round(match.distance ?? session.distance_meters),
      duration_seconds: match.moving_time ?? match.elapsed_time ?? session.duration_seconds,
      calories: Math.round(match.calories ?? session.calories),
      source: "Strava + Huawei Health",
    };
  });

  const stravaOnlySessions = stravaActivities
    .filter((act) => !used.has(act.id))
    .map((act) => ({
      strava_id: String(act.id),
      name: act.name,
      date: act.start_date ?? act.start_date_local,
      source: "Strava",
      distance_meters: Math.round(act.distance ?? 0),
      duration_seconds: act.moving_time ?? act.elapsed_time ?? 0,
      calories: Math.round(act.calories ?? act.kilojoules ?? 0),
      huawei_estimated: true,
      huawei_extended: {
        ...huaweiReference,
        total_laps: Math.max(1, Math.round((act.distance ?? 25) / 25)),
        pool_length_meters: 25,
        laps_sample: [],
      },
    }));

  return [...mergedSessions, ...stravaOnlySessions];
}

async function loadSessions() {
  const localResponse = await fetch("./data/swimming_data.json");
  if (!localResponse.ok) throw new Error(`Dataset local respondió HTTP ${localResponse.status}`);
  let localSessions = (await localResponse.json())
    .map(normalizeSession)
    .filter((s) => !isExcludedDate(s.date));

  if (!Array.isArray(localSessions) || !localSessions.length) throw new Error("No hay sesiones locales.");

  try {
    const strava = await fetchStravaActivities();
    const merged = mergeStravaWithHuawei(strava, localSessions).filter((s) => !isExcludedDate(s.date));
    return merged;
  } catch (error) {
    console.warn("Strava no disponible; se usará el historial Huawei local.", error);
    return localSessions;
  }
}

// --------------------------------------------------------------------
// INICIALIZACIÓN DE LA VISUALIZACIÓN p5.js
// --------------------------------------------------------------------

loadSessions()
  .then((sessions) => {
    updateSpacingLabel(eventSpacing);
    new p5((p) => createSwimSketch(p, sessions), "canvas-container");
  })
  .catch((error) => {
    console.error("No se pudieron cargar las sesiones:", error);
  });

// --------------------------------------------------------------------
// MOTOR Y SKETCH p5.js
// --------------------------------------------------------------------

function createSwimSketch(p, rawSessions) {
  // Orden cronológico: índice 0 es el entrenamiento MÁS ANTIGUO (arriba)
  // último índice es el MÁS RECIENTE (abajo)
  const sessions = [...rawSessions].sort((a, b) => new Date(a.date) - new Date(b.date));

  const MAX_DISTANCE = 2500; // Máximo 2500 metros en el eje X

  // Métricas auxiliares y formateadores
  const paceFor = (s) => (s.duration_seconds / s.distance_meters) * 100;
  const speedFor = (s) => s.distance_meters / s.duration_seconds; // m/s
  const formatPace = (seconds) => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;
  const dateLabel = (d) => new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
  const formatTimeClock = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // ------------------------------------------------------------------
  // CALIBRACIÓN Y REESCALADO DE GRADACIÓN CROMÁTICA DE VELOCIDAD
  // Un evento, un color idéntico para fondo (lineal) y frente (circular)
  // ------------------------------------------------------------------

  const allSpeeds = sessions.map(speedFor);
  const minSpeed = Math.min(...allSpeeds);
  const maxSpeed = Math.max(...allSpeeds);

  // Normalización suave en rango [0, 1]
  function getNormalizedSpeed(session) {
    const spd = speedFor(session);
    if (maxSpeed - minSpeed < 0.001) return 0.5;
    return p.constrain((spd - minSpeed) / (maxSpeed - minSpeed), 0, 1);
  }

  // Gradación cromática requerida:
  // Morado (muy lento) -> Azul (velocidad media) -> Amarillo (muy rápido)
  function getSpeedColor(u, alpha = 255) {
    const cPurple = p.color(147, 51, 234, alpha); // Morado (#9333ea)
    const cBlue = p.color(6, 182, 212, alpha);    // Azul (#06b6d4)
    const cYellow = p.color(250, 204, 21, alpha); // Amarillo (#facc15)

    if (u <= 0.5) {
      const t = p.map(u, 0, 0.5, 0, 1);
      return p.lerpColor(cPurple, cBlue, t);
    } else {
      const t = p.map(u, 0.5, 1, 0, 1);
      return p.lerpColor(cBlue, cYellow, t);
    }
  }

  // Obtener el color consistente para un evento dado
  function sessionColor(session, alpha = 255) {
    const norm = getNormalizedSpeed(session);
    return getSpeedColor(norm, alpha);
  }

  // Duración base de animación por sesión en segundos
  function getSessionDuration(session) {
    const pace = paceFor(session);
    return Math.max(4, (session.distance_meters / 100) * 0.85 * (pace / 150));
  }

  const sessionDurations = sessions.map(getSessionDuration);

  // Cálculo de tiempos de inicio según slider de espaciado:
  // 0 -> todos parten en t=0 (simultáneo)
  // 1 -> parten secuencialmente uno después del otro
  function getSchedule() {
    const starts = [];
    let cumTime = 0;
    for (let i = 0; i < sessions.length; i++) {
      starts.push(cumTime * eventSpacing);
      cumTime += sessionDurations[i];
    }
    let maxEnd = 0;
    for (let i = 0; i < sessions.length; i++) {
      const end = starts[i] + sessionDurations[i];
      if (end > maxEnd) maxEnd = end;
    }
    const totalDuration = maxEnd + 1.2; // pausa de 1.2s al finalizar
    return { starts, totalDuration };
  }

  // Exponer motor para control de tiempo externo
  window._swimEngine = {
    getTotalDuration: () => getSchedule().totalDuration,
  };

  // Semillas aleatorias fijas para cada sesión
  const sessionSeeds = sessions.map(() => p.random(10000));

  // Distribución de ángulos en el cuadrante SUPERIOR DERECHO (entre -78° y -12°)
  // para que todas las nomenclaturas mes/dia sean visibles sin solaparse
  const sessionAngles = sessions.map((_, i) => {
    if (sessions.length <= 1) return p.radians(-45);
    return p.map(i, 0, sessions.length - 1, p.radians(-78), p.radians(-12));
  });

  function lapSpacing() {
    const mostLaps = Math.max(...sessions.map((s) => s.huawei_extended.total_laps));
    return (p.min(p.width, p.height) * 0.40) / mostLaps;
  }

  // ------------------------------------------------------------------
  // RENDERIZADO: VISUALIZACIÓN DE FONDO (LÍNEAS DE IZQ A DER)
  // ------------------------------------------------------------------

  function drawBackgroundTimeline(sessionStates) {
    const isMobile = p.width < 640;
    const leftX = isMobile ? 55 : Math.max(75, p.width * 0.075);
    const leftX = isMobile ? 45 : Math.max(52, p.width * 0.04);
    const rightX = isMobile ? p.width - 25 : p.width - Math.max(100, p.width * 0.23);
    const topY = Math.max(80, p.height * 0.12);
    const bottomY = p.height - (isMobile ? 180 : Math.max(140, p.height * 0.22));

    const totalTracks = sessions.length;

    // 1. Trazar regla horizontal y marcas de distancia del eje X (0 a 2500m)
    p.stroke(78, 241, 207, 25);
    p.strokeWeight(1);
    p.line(leftX, bottomY + 28, rightX, bottomY + 28);

    const distanceMarks = [0, 500, 1000, 1500, 2000, 2500];
    p.textAlign(p.CENTER, p.TOP);
    p.textFont("monospace");
    p.textSize(9);

    distanceMarks.forEach((dist) => {
      const mx = p.map(dist, 0, MAX_DISTANCE, leftX, rightX);

      // Marca en la regla inferior
      p.stroke(78, 241, 207, 45);
      p.line(mx, bottomY + 24, mx, bottomY + 32);

      // Línea guía vertical tenue en toda la cuadrícula
      p.stroke(78, 241, 207, 10);
      p.line(mx, topY - 14, mx, bottomY + 20);

      // Texto de metros
      p.noStroke();
      p.fill(136, 255, 245, 95);
      p.text(`${dist}m`, mx, bottomY + 36);
    });

    // 2. Renderizar cada pista de entrenamiento (Y: más antigua arriba, más reciente abajo)
    for (let i = 0; i < totalTracks; i++) {
      const session = sessions[i];
      const state = sessionStates[i];
      const y = totalTracks === 1 ? (topY + bottomY) / 2 : p.map(i, 0, totalTracks - 1, topY, bottomY);

      const targetX = p.map(session.distance_meters, 0, MAX_DISTANCE, leftX, rightX);
      const headX = p.map(state.currentMeters, 0, MAX_DISTANCE, leftX, rightX);

      const speedCol = sessionColor(session);
      const paceStr = formatPace(paceFor(session));
      const mDayStr = formatMonthDay(session.date);
      const swolfVal = session.huawei_extended.avg_swolf;
      const hrVal = session.huawei_extended.avg_heart_rate;
      const calVal = session.calories;

      // Telemetría completa: Distancia, Ritmo, SWOLF, Frec. Cardíaca y Calorías
      const lineStats = `${session.distance_meters}m · ${paceStr}/100m · ${swolfVal} SWOLF · ${hrVal} PPM · ${calVal} kcal`;
      // Telemetría dividida en 2 bloques para compactar el ancho y permitir inicio más a la izquierda
      const infoLine1 = `${session.distance_meters}m · ${paceStr}/100m`;
      const infoLine2 = `${swolfVal} SWOLF · ${hrVal} PPM · ${calVal} kcal`;

      // Guía base de la pista (hasta la meta del entrenamiento)
      p.stroke(255, 255, 255, 20);
      p.strokeWeight(1);
      p.line(leftX, y, targetX, y);

      // Marca vertical de meta
      p.stroke(p.red(speedCol), p.green(speedCol), p.blue(speedCol), 80);
      p.line(targetX, y - 5, targetX, y + 5);

      // Fecha Mes/Día a la izquierda de la marca de 0m
      p.noStroke();
      p.textAlign(p.RIGHT, p.CENTER);
      p.textSize(10.5);
      p.fill(p.red(speedCol), p.green(speedCol), p.blue(speedCol), state.isActive ? 255 : 190);
      p.text(`${mDayStr}`, leftX - 10, y);
      p.text(`${mDayStr}`, leftX - 8, y);

      // Bloque de información (Distancia, ritmo, SWOLF, PPM, kcal) a la izquierda, DEBAJO de la línea
      // Bloque de información en dos líneas debajo de la pista
      p.textAlign(p.LEFT, p.TOP);
      p.textSize(8.2);
      p.fill(136, 255, 245, state.isActive ? 220 : 130);
      p.text(lineStats, leftX, y + 6);

      // Línea 1: Distancia y ritmo
      p.textSize(8.5);
      p.fill(136, 255, 245, state.isActive ? 235 : 150);
      p.text(infoLine1, leftX, y + 5);

      // Línea 2: SWOLF, PPM y calorías
      p.textSize(7.8);
      p.fill(136, 255, 245, state.isActive ? 195 : 110);
      p.text(infoLine2, leftX, y + 17);

      // Dibujar la línea creada desde la izquierda (0m) hasta la posición actual del punto
      if (headX > leftX + 0.5) {
        // Resplandor difuso del trazo
        p.stroke(p.red(speedCol), p.green(speedCol), p.blue(speedCol), 45);
        p.strokeWeight(6);
        p.line(leftX, y, headX, y);

        // Núcleo nítido de la línea
        p.stroke(p.red(speedCol), p.green(speedCol), p.blue(speedCol), 210);
        p.strokeWeight(2.2);
        p.line(leftX, y, headX, y);
      }

      // Dibujar el punto móvil (Head)
      if (state.isWaiting) {
        // Punto de espera en 0m
        p.noFill();
        p.stroke(p.red(speedCol), p.green(speedCol), p.blue(speedCol), 90);
        p.strokeWeight(1.5);
        p.ellipse(leftX, y, 6, 6);
      } else if (state.isActive) {
        // Punto activo avanzando con pulso y halo
        const pulse = p.sin(p.millis() * 0.009 + i * 1.5) * 3;

        // Halo exterior
        p.noStroke();
        p.fill(p.red(speedCol), p.green(speedCol), p.blue(speedCol), 55);
        p.ellipse(headX, y, 18 + pulse, 18 + pulse);

        // Anillo de velocidad
        p.fill(p.red(speedCol), p.green(speedCol), p.blue(speedCol), 220);
        p.ellipse(headX, y, 8, 8);

        // Centro brillante
        p.fill(255, 255, 255, 240);
        p.ellipse(headX, y, 3.5, 3.5);

        // Indicador numérico flotante de metros actuales
        p.textAlign(p.CENTER, p.BOTTOM);
        p.textSize(9);
        p.fill(255, 255, 255, 210);
        p.text(`${Math.round(state.currentMeters)}m`, headX, y - 8);
      } else if (state.isCompleted) {
        // Punto final completado en la meta
        p.noStroke();
        p.fill(p.red(speedCol), p.green(speedCol), p.blue(speedCol), 200);
        p.ellipse(targetX, y, 6, 6);
        p.fill(255, 255, 255, 220);
        p.ellipse(targetX, y, 2.5, 2.5);
      }
    }
  }

  // ------------------------------------------------------------------
  // RENDERIZADO: ANILLOS CONCÉNTRICOS COMPLETAMENTE CIRCULARES (FRENTE)
  // Geometría estrictamente circular (1:1), color unificado por evento
  // ------------------------------------------------------------------

  function organicRing(session, seed, radius, alpha, width = 1) {
    if (radius <= 0) return;
    const swolf = session.huawei_extended.avg_swolf;
    const irregularity = p.map(swolf, 35, 55, 1.5, 6, true);
    const points = Math.max(90, Math.floor((p.TWO_PI * radius) / 5));
    const cx = p.width / 2;
    const cy = p.height / 2;
    const col = sessionColor(session, alpha);

    p.noFill();
    p.stroke(col);
    p.strokeWeight(width);
    p.beginShape();
    for (let pt = 0; pt <= points; pt += 1) {
      const angle = p.map(pt, 0, points, 0, p.TWO_PI);
      const ripple = p.sin(angle * 6 + seed) * irregularity * 0.12;
      const ringRadius = radius + ripple;
      // Geometría completamente circular (sin achatamiento en Y)
      p.vertex(cx + p.cos(angle) * ringRadius, cy + p.sin(angle) * ringRadius);
    }
    p.endShape(p.CLOSE);
  }

  // Despliegue de nomenclatura mes/dia en la parte DERECHA SUPERIOR de la figura concéntrica
  function drawUpperRightInscription(session, angle, state) {
    const spacing = lapSpacing();
    const radius = session.huawei_extended.total_laps * spacing;
    const cx = p.width / 2;
    const cy = p.height / 2;

    // Posicionamiento estrictamente circular (sin factor 0.82)
    const ringX = cx + p.cos(angle) * radius;
    const ringY = cy + p.sin(angle) * radius;
    const labelX = cx + p.cos(angle) * (radius + 22);
    const labelY = cy + p.sin(angle) * (radius + 22);

    const mDayStr = formatMonthDay(session.date);
    const col = sessionColor(session);

    // Línea conector / guía sutil hacia la etiqueta
    p.stroke(p.red(col), p.green(col), p.blue(col), state.isActive ? 160 : 70);
    p.strokeWeight(0.8);
    p.line(ringX, ringY, labelX - 4, labelY);

    // Punto conector en la etiqueta
    p.noStroke();
    p.fill(p.red(col), p.green(col), p.blue(col), state.isActive ? 255 : 180);
    p.ellipse(labelX - 4, labelY, 3, 3);

    // Texto nomenclatura mes/dia
    p.fill(p.red(col), p.green(col), p.blue(col), state.isActive ? 255 : (state.isCompleted ? 210 : 80));
    p.textSize(state.isActive ? 11 : 9.5);
    p.textFont("monospace");
    p.textAlign(p.LEFT, p.CENTER);
    p.text(mDayStr, labelX + 2, labelY);
  }

  function drawForegroundWaves(sessionStates) {
    const spacing = lapSpacing();

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const state = sessionStates[i];
      const seed = sessionSeeds[i];
      const angle = sessionAngles[i];
      const reachedLaps = Math.floor(state.currentMeters / 25);

      if (state.isCompleted) {
        // Anillo exterior completo final
        organicRing(session, seed, session.huawei_extended.total_laps * spacing, 140, 1.3);
        drawUpperRightInscription(session, angle, state);
      } else if (state.isActive) {
        // Estelas de vueltas recientes
        for (let lap = Math.max(1, reachedLaps - 3); lap <= reachedLaps; lap += 1) {
          organicRing(session, seed, lap * spacing, 30, 0.6);
        }
        // Anillo de expansión activa
        if (state.currentMeters > 0) {
          organicRing(session, seed, (state.currentMeters / 25) * spacing, 160, 1.25);
        }
        drawUpperRightInscription(session, angle, state);
      } else {
        // Despliegue tenue del indicador mes/dia para mantener visible la distribución completa
        drawUpperRightInscription(session, angle, state);
      }
    }
  }

  // ------------------------------------------------------------------
  // CONFIGURACIÓN Y BUCLE DE DIBUJO
  // ------------------------------------------------------------------

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.pixelDensity(Math.min(p.pixelDensity(), 2));
    p.background(0);
  };

  p.draw = () => {
    // Fondo con leve estela para suavidad de animación
    p.background(0, 30);

    const { starts, totalDuration } = getSchedule();

    // Actualizar reloj global si está en reproducción
    if (isPlaying && !isScrubbing) {
      const deltaSec = p.deltaTime / 1000;
      globalTime += deltaSec * playbackSpeed;
      if (globalTime >= totalDuration) {
        globalTime = 0; // Reinicio en bucle suave
      }
    }

    // Asegurar tiempo dentro de rango
    const t = p.constrain(globalTime, 0, totalDuration);

    const sessionStates = sessions.map((session, i) => {
      const tStart = starts[i];
      const duration = sessionDurations[i];
      const tEnd = tStart + duration;

      let currentMeters = 0;
      let isActive = false;
      let isCompleted = false;
      let isWaiting = false;

      if (t < tStart) {
        isWaiting = true;
        currentMeters = 0;
      } else if (t >= tEnd) {
        isCompleted = true;
        currentMeters = session.distance_meters;
      } else {
        isActive = true;
        const progress = p.constrain((t - tStart) / duration, 0, 1);
        currentMeters = progress * session.distance_meters;
      }

      return {
        session,
        currentMeters,
        isActive,
        isCompleted,
        isWaiting,
      };
    });

    // 1. DIBUJAR VISUALIZACIÓN DE FONDO (Pistas lineales de izquierda a derecha)
    drawBackgroundTimeline(sessionStates);

    // 2. DIBUJAR VISUALIZACIÓN DE FRENTE (Anillos orgánicos circulares con color unificado)
    drawForegroundWaves(sessionStates);

    // 3. SINCRONIZAR SLIDER Y DISPLAY DE TIEMPO
    if (timeInput && !isScrubbing) {
      const fraction = totalDuration > 0 ? t / totalDuration : 0;
      timeInput.value = String(Math.round(fraction * 1000));
    }
    if (timeValue) {
      timeValue.textContent = `${formatTimeClock(t)} / ${formatTimeClock(totalDuration)}`;
    }
  };

  // ------------------------------------------------------------------
  // EVENTOS DE TECLADO Y VENTANA
  // ------------------------------------------------------------------

  p.keyPressed = () => {
    if (p.keyCode === 32) { // Barra espaciadora: Play/Pause
      isPlaying = !isPlaying;
      if (btnPlay) btnPlay.textContent = isPlaying ? "PAUSAR" : "REANUDAR";
    } else if (p.keyCode === p.LEFT_ARROW) { // Retroceder 2 segundos
      globalTime = Math.max(0, globalTime - 2);
    } else if (p.keyCode === p.RIGHT_ARROW) { // Avanzar 2 segundos
      const total = getSchedule().totalDuration;
      globalTime = Math.min(total, globalTime + 2);
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
}
