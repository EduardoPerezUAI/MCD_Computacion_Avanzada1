# AI Usage Log — LAB 02

## Registro

### Etapa 1 — Intento de extracción de datos nativos Huawei Band 11 vía MCP

**Herramienta / agente:** Gemini / Cursor / Codex (VS Code)  
**Qué pedí:** Prompts para configurar un servidor MCP (Model Context Protocol) que leyera directamente el historial de entrenamientos de natación desde Huawei Health.  
**Qué cambió en el proyecto:** Se intentó generar la llamada de lectura directa de la API/servidor local en `swimming_data.json`.  
**Qué revisé o corregí manualmente:** La sesión no contaba con un servidor MCP activo de Huawei Health ni permisos en iOS; la app Health Sync falló repetidamente. Descarté el uso de automatizaciones MCP para no retrasar el desarrollo.  
**Qué aprendí / qué error apareció:** El uso de MCP requiere conectores y servidores previamente configurados en el entorno. La sincronización de Huawei Health en iOS/Health Sync presentó bloqueos severos, lo que exigió pivotar hacia fuentes de datos alternativas.

---

### Etapa 2 — Tabulación de reportes PDF reales y pipeline híbrido con Strava API

**Herramienta / agente:** Gemini / Antigravity / Cursor  
**Qué pedí:** Estructurar un pipeline que usara la API REST de Strava como base general e inyectara la finura de datos de natación (SWOLF, tramos de 25m, brazadas y frecuencia cardíaca) extraídos manualmente desde los reportes en PDF de Huawei Health[span_0](start_span)[span_0](end_span)[span_1](start_span)[span_1](end_span)[span_2](start_span)[span_2](end_span)[span_3](start_span)[span_3](end_span)[span_4](start_span)[span_4](end_span)[span_5](start_span)[span_5](end_span)[span_6](start_span)[span_6](end_span)[span_7](start_span)[span_7](end_span)[span_8](start_span)[span_8](end_span)[span_9](start_span)[span_9](end_span)[span_10](start_span)[span_10](end_span)[span_11](start_span)[span_11](end_span)[span_12](start_span)[span_12](end_span).  
**Qué cambió en el proyecto:** Se creó la estructura normalizada en `exercise-02/data/swimming_data.json` conteniendo 12 sesiones reales completas[span_13](start_span)[span_13](end_span)[span_14](start_span)[span_14](end_span)[span_15](start_span)[span_15](end_span)[span_16](start_span)[span_16](end_span)[span_17](start_span)[span_17](end_span)[span_18](start_span)[span_18](end_span)[span_19](start_span)[span_19](end_span)[span_20](start_span)[span_20](end_span)[span_21](start_span)[span_21](end_span)[span_22](start_span)[span_22](end_span)[span_23](start_span)[span_23](end_span)[span_24](start_span)[span_24](end_span)[span_25](start_span)[span_25](end_span). Se configuró el cliente de lectura en `main.js`[span_26](start_span)[span_26](end_span).  
**Qué revisé o corregí manualmente:** El token por defecto de Strava arrojó el error `Authorization Error · activity:read_permission missing`. Tuve que autenticar manualmente vía OAuth 2.0 en el navegador para solicitar la URL con scope `activity:read_all`, capturar el `code` de autorización y pedir el `access_token` definitivo vía `curl` en la Terminal.  
**Qué aprendí / qué error apareció:** Las APIs de deportes capan por defecto la lectura de actividades si no se solicita el scope explícito en la URL de autorización. Además, VS Code bloqueó el guardado del JSON por un conflicto de versiones en disco (`Failed to save: content is newer`), requiriendo el uso de `Overwrite`.

---

### Etapa 3 — Rediseño a arte generativo somático (p5.js) y corrección de distorsión temporal

**Herramienta / agente:** Gemini / Antigravity (VS Code)  
**Qué pedí:** Transformar el tablero tradicional de Chart.js en un lienzo experimental estilo Aaron Koblin / Viégas + Wattenberg (Wind Map) usando p5.js, donde las métricas de natación se convirtieran en comportamiento visual dinámico.  
**Qué cambió en el proyecto:** Se construyó en `main.js` un motor generativo en p5.js con doble capa[span_27](start_span)[span_27](end_span): pistas lineales de tiempo en el fondo (con mapa de color Morado $\rightarrow$ Azul $\rightarrow$ Amarillo según velocidad)[span_28](start_span)[span_28](end_span) y anillos orgánicos concéntricos al frente con irregularidad guiada por SWOLF[span_29](start_span)[span_29](end_span).  
**Qué revisé o corregí manualmente:** La duración bruta de las sesiones incluía descansos prolongados entre series[span_30](start_span)[span_30](end_span)[span_31](start_span)[span_31](end_span)[span_32](start_span)[span_32](end_span)[span_33](start_span)[span_33](end_span), generando una distorsión visual severa en la velocidad de las pistas[span_34](start_span)[span_34](end_span). Modifiqué el dataset en `swimming_data.json` para calcular el tiempo neto de nado en movimiento ($Pace \times Distancia / 100m$), logrando un renderizado armónico.  
**Qué aprendí / qué error apareció:** Usar duraciones totales brutas en deportes de piscina desvirtúa la velocidad relativa. Es imperativo limpiar los tiempos muertos para que la física del lienzo generativo responda a la verdadera carga fisiológica del nado.
