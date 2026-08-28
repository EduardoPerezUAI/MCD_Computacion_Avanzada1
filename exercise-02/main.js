const metricNodes = {
  id: document.querySelector("#session-id"),
  heartRate: document.querySelector("#heart-rate"),
  swolf: document.querySelector("#swolf"),
  lap: document.querySelector("#active-lap"),
  detail: document.querySelector("#session-detail"),
};

const STRAVA_TOKEN = "6befd79262e1aee2ad2f3084c06425f4ecb6579f";

async function fetchStravaActivities() {
  const response = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=10", {
    headers: { Authorization: `Bearer ${STRAVA_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Strava respondió HTTP ${response.status}`);
  return (await response.json()).filter((activity) => activity.type === "Swim");
}

function dateKey(date) { return new Date(date).toISOString().slice(0, 10); }

function mergeStravaWithHuawei(stravaActivities, huaweiSessions) {
  const byDate = new Map();
  stravaActivities.forEach((activity) => {
    const key = dateKey(activity.start_date ?? activity.start_date_local);
    byDate.set(key, [...(byDate.get(key) ?? []), activity]);
  });
  const used = new Set();

  return huaweiSessions.map((session) => {
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
      date: match.start_date ?? session.date,
      distance_meters: Math.round(match.distance ?? session.distance_meters),
      duration_seconds: match.moving_time ?? match.elapsed_time ?? session.duration_seconds,
      calories: Math.round(match.calories ?? session.calories),
      source: "Strava + Huawei Health",
    };
  });
}

async function loadSessions() {
  const localResponse = await fetch("./data/swimming_data.json");
  if (!localResponse.ok) throw new Error(`Dataset local respondió HTTP ${localResponse.status}`);
  const localSessions = await localResponse.json();
  if (!Array.isArray(localSessions) || !localSessions.length) throw new Error("No hay sesiones locales.");

  try {
    return mergeStravaWithHuawei(await fetchStravaActivities(), localSessions);
  } catch (error) {
    console.warn("Strava no disponible; se usará el historial Huawei local.", error);
    return localSessions;
  }
}

loadSessions()
  .then((sessions) => new p5((p) => createSomaticSketch(p, sessions), "canvas-container"))
  .catch((error) => {
    console.error("No se pudieron cargar las sesiones:", error);
    metricNodes.detail.textContent = "No fue posible cargar ./data/swimming_data.json";
  });

function createSomaticSketch(p, rawSessions) {
  const sessions = [...rawSessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const waves = [];
  const CYCLE_MS = 4300;
  let lastSpawn = 0;
  let nextSession = 0;

  const paceFor = (session) => (session.duration_seconds / session.distance_meters) * 100;
  const dateLabel = (date) => new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));

  function swolfColor(swolf) {
    const values = sessions.map((session) => session.huawei_extended.avg_swolf);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const amount = minimum === maximum ? .5 : p.constrain((swolf - minimum) / (maximum - minimum), 0, 1);
    return p.lerpColor(p.color("#10b981"), p.color("#ef4444"), amount);
  }

  function updateOverlay(session, wave) {
    const extended = session.huawei_extended;
    metricNodes.id.textContent = session.strava_id.toUpperCase();
    metricNodes.heartRate.textContent = extended.avg_heart_rate;
    metricNodes.swolf.textContent = extended.avg_swolf;
    metricNodes.lap.textContent = `${extended.total_laps} × ${extended.pool_length_meters}m`;
    metricNodes.detail.textContent = `${dateLabel(session.date)} · ${session.distance_meters} m · ${session.calories} kcal · ${formatPace(paceFor(session))} /100m`;
  }

  function formatPace(seconds) {
    const rounded = Math.round(seconds);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  }

  function spawnWave(index) {
    const session = sessions[index];
    const workload = session.distance_meters * .62 + session.calories * 1.5;
    const maximumWorkload = Math.max(...sessions.map((item) => item.distance_meters * .62 + item.calories * 1.5));
    const diameter = p.map(workload, 0, maximumWorkload, p.min(p.width, p.height) * .22, p.max(p.width, p.height) * 1.16);
    const pace = paceFor(session);
    waves.push({
      session,
      radius: 12,
      maxRadius: diameter / 2,
      expansion: p.map(pace, 90, 280, 4.8, 1.05, true),
      seed: p.random(10000),
      color: swolfColor(session.huawei_extended.avg_swolf),
      alpha: 135,
    });
    updateOverlay(session);
  }

  function drawOrganicWave(wave) {
    const irregularity = p.map(wave.session.huawei_extended.avg_swolf, 35, 55, 5, 28, true);
    const perimeter = p.TWO_PI * wave.radius;
    const points = Math.max(90, Math.floor(perimeter / 5));
    const cx = p.width / 2;
    const cy = p.height / 2;
    p.noFill();
    p.stroke(p.red(wave.color), p.green(wave.color), p.blue(wave.color), wave.alpha);
    p.strokeWeight(1.15);
    p.beginShape();
    for (let point = 0; point <= points; point += 1) {
      const angle = p.map(point, 0, points, 0, p.TWO_PI);
      const noise = p.noise(wave.seed + p.cos(angle) * .72, wave.seed + p.sin(angle) * .72, p.frameCount * .004) - .5;
      const undulation = p.sin(angle * 4 + wave.seed) * irregularity * .22;
      const radius = wave.radius + noise * irregularity + undulation;
      p.vertex(cx + p.cos(angle) * radius, cy + p.sin(angle) * radius * .83);
    }
    p.endShape(p.CLOSE);
  }

  function drawTrace(wave) {
    p.noFill();
    p.stroke(p.red(wave.color), p.green(wave.color), p.blue(wave.color), 15);
    p.strokeWeight(7);
    p.circle(p.width / 2, p.height / 2, wave.radius * 2);
  }

  function changeSequence(step) {
    waves.length = 0;
    nextSession = (nextSession + step + sessions.length) % sessions.length;
    spawnWave(nextSession);
    nextSession = (nextSession + 1) % sessions.length;
    lastSpawn = p.millis();
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.pixelDensity(Math.min(p.pixelDensity(), 2));
    p.background(0);
    spawnWave(nextSession);
    nextSession = (nextSession + 1) % sessions.length;
    lastSpawn = p.millis();
  };

  p.draw = () => {
    p.background(0, 20);
    for (let index = waves.length - 1; index >= 0; index -= 1) {
      const wave = waves[index];
      drawTrace(wave);
      drawOrganicWave(wave);
      wave.radius += wave.expansion;
      wave.alpha *= .992;
      if (wave.radius > wave.maxRadius || wave.alpha < 2) waves.splice(index, 1);
    }

    if (p.millis() - lastSpawn > CYCLE_MS) {
      spawnWave(nextSession);
      nextSession = (nextSession + 1) % sessions.length;
      lastSpawn = p.millis();
    }
  };

  p.keyPressed = () => {
    if (p.keyCode === p.LEFT_ARROW) changeSequence(-1);
    if (p.keyCode === p.RIGHT_ARROW) changeSequence(1);
  };
  p.mousePressed = () => changeSequence(1);
  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
}
