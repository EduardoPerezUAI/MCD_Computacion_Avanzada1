const metricNodes = {
  id: document.querySelector("#session-id"),
  heartRate: document.querySelector("#heart-rate"),
  swolf: document.querySelector("#swolf"),
  lap: document.querySelector("#active-lap"),
  detail: document.querySelector("#session-detail"),
};
const speedInput = document.querySelector("#playback-speed");
const speedValue = document.querySelector("#speed-value");
let playbackSpeed = Number(speedInput.value);

speedInput.addEventListener("input", () => {
  playbackSpeed = Number(speedInput.value);
  speedValue.textContent = `${playbackSpeed.toFixed(2)}×`;
});

const STRAVA_TOKEN = "6befd79262e1aee2ad2f3084c06425f4ecb6579f";

async function fetchStravaActivities() {
  const response = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=10", {
    headers: { Authorization: `Bearer ${STRAVA_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Strava respondió HTTP ${response.status}`);
  return (await response.json()).filter((activity) => activity.type === "Swim");
}

function dateKey(date) { return new Date(date).toISOString().slice(0, 10); }

function normalizeSession(session) {
  if (session.huawei_extended) return session;

  // Compatibilidad con el esquema plano de las exportaciones Huawei.
  return {
    ...session,
    strava_id: session.strava_id ?? session.id,
    calories: session.calories ?? session.total_calories ?? session.active_calories ?? 0,
    huawei_extended: {
      avg_swolf: session.avg_swolf,
      avg_heart_rate: session.avg_heart_rate,
      total_strokes: session.total_strokes,
      total_laps: session.total_laps,
      pool_length_meters: session.pool_length_meters,
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
    avg_swolf: Math.round(huaweiSessions.reduce((sum, session) => sum + session.huawei_extended.avg_swolf, 0) / huaweiSessions.length),
    avg_heart_rate: Math.round(huaweiSessions.reduce((sum, session) => sum + session.huawei_extended.avg_heart_rate, 0) / huaweiSessions.length),
  };

  const mergedSessions = huaweiSessions.map((session) => {
    const match = (byDate.get(dateKey(session.date)) ?? [])
      .filter((activity) => !used.has(activity.id))
      .sort((a, b) => {
        const distanceA = Math.abs((a.distance ?? 0) - session.distance_meters);
        const distanceB = Math.abs((b.distance ?? 0) - session.distance_meters);
        if (distanceA !== distanceB) return distanceA - distanceB;
        return Math.abs(new Date(a.start_date) - new Date(session.date))
          - Math.abs(new Date(b.start_date) - new Date(session.date));
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

  // Las sesiones que no tienen un PDF Huawei asociado también se representan:
  // conservan sus datos reales de Strava y usan sólo un valor de referencia
  // visual para las métricas somáticas que Strava no publica.
  const stravaOnlySessions = stravaActivities
    .filter((activity) => !used.has(activity.id))
    .map((activity) => ({
      strava_id: String(activity.id),
      name: activity.name,
      date: activity.start_date ?? activity.start_date_local,
      source: "Strava",
      distance_meters: Math.round(activity.distance ?? 0),
      duration_seconds: activity.moving_time ?? activity.elapsed_time ?? 0,
      calories: Math.round(activity.calories ?? activity.kilojoules ?? 0),
      huawei_estimated: true,
      huawei_extended: {
        ...huaweiReference,
        total_laps: Math.max(1, Math.round((activity.distance ?? 25) / 25)),
        pool_length_meters: 25,
        laps_sample: [],
      },
    }));

  return [...mergedSessions, ...stravaOnlySessions];
}

async function loadSessions() {
  const localResponse = await fetch("./data/swimming_data.json");
  if (!localResponse.ok) throw new Error(`Dataset local respondió HTTP ${localResponse.status}`);
  const localSessions = (await localResponse.json()).map(normalizeSession);
  if (!Array.isArray(localSessions) || !localSessions.length) throw new Error("No hay sesiones locales.");

  try {
    return mergeStravaWithHuawei(await fetchStravaActivities(), localSessions);
  } catch (error) {
    console.warn("Strava no disponible; se usará el historial Huawei local.", error);
    return localSessions;
  }
}

loadSessions()
  .then((sessions) => new p5((p) => createWaveSketch(p, sessions), "canvas-container"))
  .catch((error) => {
    console.error("No se pudieron cargar las sesiones:", error);
    metricNodes.detail.textContent = "No fue posible cargar ./data/swimming_data.json";
  });

function createWaveSketch(p, rawSessions) {
  const sessions = [...rawSessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const completedWaves = [];
  let activeWave;
  let nextSession = 0;
  let pauseUntil = 0;
  let resetAfterPause = false;

  const paceFor = (session) => (session.duration_seconds / session.distance_meters) * 100;
  const nameFor = (session) => session.name || `Entrenamiento ${new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(new Date(session.date))}`;
  const formatPace = (seconds) => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;
  const dateLabel = (date) => new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));

  function swolfColor(swolf) {
    const scores = sessions.map((session) => session.huawei_extended.avg_swolf);
    const low = Math.min(...scores);
    const high = Math.max(...scores);
    const fraction = low === high ? .5 : p.constrain((swolf - low) / (high - low), 0, 1);
    return p.lerpColor(p.color("#10b981"), p.color("#ef4444"), fraction);
  }

  function lapSpacing() {
    const mostLaps = Math.max(...sessions.map((session) => session.huawei_extended.total_laps));
    return p.min(p.width, p.height) * .42 / mostLaps;
  }

  function updateOverlay(session) {
    const body = session.huawei_extended;
    metricNodes.id.textContent = session.strava_id.toUpperCase();
    metricNodes.heartRate.textContent = body.avg_heart_rate;
    metricNodes.swolf.textContent = body.avg_swolf;
    metricNodes.lap.textContent = `${body.total_laps} × ${body.pool_length_meters}m`;
    const detailQuality = session.huawei_estimated ? " · SWOLF/ppm de referencia" : "";
    metricNodes.detail.textContent = `${dateLabel(session.date)} · ${session.distance_meters} m · ${session.calories} kcal · ${formatPace(paceFor(session))} /100m${detailQuality}`;
  }

  function startWave(index) {
    const session = sessions[index];
    activeWave = {
      session,
      index,
      meters: 0,
      lastLap: 0,
      color: swolfColor(session.huawei_extended.avg_swolf),
      seed: p.random(10000),
      finalAngle: index * 1.74 - .72,
      complete: false,
    };
    updateOverlay(session);
  }

  function organicRing(wave, radius, alpha, width = 1) {
    const swolf = wave.session.huawei_extended.avg_swolf;
    const irregularity = p.map(swolf, 35, 55, 4, 21, true);
    const points = Math.max(80, Math.floor(p.TWO_PI * radius / 6));
    const cx = p.width / 2;
    const cy = p.height / 2;
    p.noFill();
    p.stroke(p.red(wave.color), p.green(wave.color), p.blue(wave.color), alpha);
    p.strokeWeight(width);
    p.beginShape();
    for (let point = 0; point <= points; point += 1) {
      const angle = p.map(point, 0, points, 0, p.TWO_PI);
      const texture = p.noise(wave.seed + p.cos(angle) * .8, wave.seed + p.sin(angle) * .8) - .5;
      const ripple = p.sin(angle * 5 + wave.seed) * irregularity * .18;
      const ringRadius = radius + texture * irregularity + ripple;
      p.vertex(cx + p.cos(angle) * ringRadius, cy + p.sin(angle) * ringRadius * .82);
    }
    p.endShape(p.CLOSE);
  }

  function drawInscription(wave) {
    const radius = wave.session.huawei_extended.total_laps * lapSpacing();
    const x = p.width / 2 + p.cos(wave.finalAngle) * (radius + 20);
    const y = p.height / 2 + p.sin(wave.finalAngle) * (radius * .82 + 20);
    p.noStroke();
    p.fill(p.red(wave.color), p.green(wave.color), p.blue(wave.color), 185);
    p.textSize(11);
    p.textFont("monospace");
    p.text(nameFor(wave.session).toUpperCase(), x, y);
  }

  function drawWave(wave, isActive) {
    const spacing = lapSpacing();
    const reachedLaps = Math.floor(wave.meters / 25);
    if (wave.complete) {
      organicRing(wave, wave.session.huawei_extended.total_laps * spacing, 190, 1.35);
      drawInscription(wave);
      return;
    }
    // Sólo los últimos largos permanecen como estela; los anteriores se disuelven.
    for (let lap = Math.max(1, reachedLaps - 3); lap <= reachedLaps; lap += 1) {
      organicRing(wave, lap * spacing, 35, .6);
    }
    if (isActive && wave.meters % 25 > .2) {
      organicRing(wave, (wave.meters / 25) * spacing, 150, 1.25);
    }
  }

  function restartSequence(step) {
    completedWaves.length = 0;
    nextSession = (nextSession + step + sessions.length) % sessions.length;
    startWave(nextSession);
    nextSession = (nextSession + 1) % sessions.length;
    pauseUntil = 0;
    resetAfterPause = false;
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.pixelDensity(Math.min(p.pixelDensity(), 2));
    p.background(0);
    startWave(nextSession);
    nextSession = (nextSession + 1) % sessions.length;
  };

  p.draw = () => {
    p.background(0, 17);
    completedWaves.forEach((wave) => drawWave(wave, false));

    if (activeWave) {
      const pace = paceFor(activeWave.session);
      const metersPerSecond = p.map(pace, 90, 300, 420, 105, true) * playbackSpeed;
      activeWave.meters = p.min(activeWave.session.distance_meters, activeWave.meters + metersPerSecond * (p.deltaTime / 1000));
      drawWave(activeWave, true);

      if (activeWave.meters >= activeWave.session.distance_meters) {
        activeWave.meters = activeWave.session.distance_meters;
        activeWave.complete = true;
        completedWaves.push(activeWave);
        activeWave = null;
        resetAfterPause = nextSession === 0;
        pauseUntil = p.millis() + (resetAfterPause ? 1500 : 700) / playbackSpeed;
      }
    } else if (p.millis() >= pauseUntil) {
      if (resetAfterPause) {
        completedWaves.length = 0;
        p.background(0);
        resetAfterPause = false;
      }
      startWave(nextSession);
      nextSession = (nextSession + 1) % sessions.length;
    }
  };

  p.keyPressed = () => {
    if (p.keyCode === p.LEFT_ARROW) restartSequence(-1);
    if (p.keyCode === p.RIGHT_ARROW) restartSequence(1);
  };
  p.mousePressed = () => restartSequence(1);
  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
}
