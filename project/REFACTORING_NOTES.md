# Refactorización HRV Biofeedback - Modelo de Integración Neurovisceral
## Documento de Cambios v1.0

---

## 📋 Resumen Ejecutivo

Se ha refactorizado completamente la aplicación web de biofeedback HRV para estructurar la experiencia en **3 fases secuenciales** con una interfaz de usuario moderna y modular, manteniendo toda la lógica Bluetooth existente.

### ✅ Objetivos Completados

1. **UI Refactorizada**: Panel de control de sesión con 3 botones de fase
2. **Sistema de Fases**: Implementación completa de 4 estados (Espera, Evaluación, Entrenamiento, Historial)
3. **Pacer Respiratorio**: Guía a 0.1 Hz (6 ciclos/min) con ciclos de 4s inhalación + 6s exhalación
4. **Coherencia Visual**: Modulación de turbulencia basada en RMSSD durante entrenamiento
5. **Persistencia**: Historial de sesiones guardado en localStorage

---

## 🏗️ CAMBIOS POR ARCHIVO

### 1. `index.html` - Refactorización de Estructura

#### Cambios Principales:
- **Reemplazado**: Panel lateral "Espacio de diseño" con sliders de parámetros
- **Nuevo**: Panel de control de sesión HRV con 3 secciones

#### Nuevo Panel de Control:
```html
<!-- Sección de conexión Bluetooth -->
<button id="btn-conectar-main" class="btn-primary btn-connect">
  🔵 CONECTAR COOSPO H6M
</button>
<div id="connection-status" class="connection-status">
  Desconectado
</div>

<!-- 3 Botones de Fase -->
<button id="btn-phase1">1. Evaluación Basal (1 min)</button>
<button id="btn-phase2">2. Entrenamiento HRVB (3-5 min)</button>
<button id="btn-phase3">3. Ver Historial (Resultados)</button>

<!-- Información de sesión en tiempo real -->
<output id="phase-info"></output>
```

#### Nuevo Overlay de Instrucciones:
```html
<div id="phase-overlay" class="phase-overlay">
  <div class="instruction-container">
    <h2 id="instruction-title">Esperando conexión...</h2>
    <p id="instruction-text"></p>
    <div id="timer-display" class="timer-display">--:--</div>
  </div>
</div>
```

**Beneficios**:
- ✅ Interfaz clara y enfocada en el usuario
- ✅ Instrucciones visibles durante cada fase
- ✅ Temporizador prominente
- ✅ Mejor UX para sesiones de biofeedback

---

### 2. `style.css` - Rediseño Visual

#### Nuevos Estilos Agregados:

**Panel de Control Moderno**:
- Flexbox layout con `gap` para mejor espaciado
- Secciones bien organizadas con bordes divisores
- Transiciones suaves en botones

**Botones de Fase**:
```css
.btn-phase {
  grid-template-columns: auto 1fr;  /* Número circular + texto */
  align-items: center;
  transition: all 0.2s ease;
}

.btn-phase.active {
  border-color: var(--accent);
  background: rgba(217, 210, 195, 0.1);
  color: var(--text);
}
```

**Overlay de Instrucciones**:
```css
.instruction-container {
  background: rgba(11, 11, 12, 0.85);
  backdrop-filter: blur(4px);
  border-radius: 12px;
}

.timer-display {
  font-size: 48px;
  font-family: "Courier New", monospace;
}

.timer-display.warning {
  color: #ffcc00;
  animation: pulse 1s ease-in-out infinite;
}
```

**Conexión Status**:
```css
.connection-status.connected {
  border-color: rgba(0, 204, 102, 0.5);
  color: #00cc66;
}
```

**Beneficios**:
- ✅ Diseño minimalista mantenido
- ✅ Tema oscuro coherente (#0b0b0c base)
- ✅ Indicadores visuales claros (colores, animaciones)
- ✅ Responsive y accesible

---

### 3. `main.js` - Lógica del Sistema

#### A. SISTEMA DE FASES (Nueva sección 07)

**Estados Definidos**:
```javascript
const estadoFases = {
  ESPERA: 0,           // Esperando conexión BLE
  EVALUACION: 1,       // Evaluación basal (60 seg)
  ENTRENAMIENTO: 2,    // Entrenamiento HRVB (3-5 min)
  HISTORIAL: 3,        // Ver resultados
};
```

**Variables Globales de Sesión**:
```javascript
let faseActual = estadoFases.ESPERA;
let tiempoFaseInicio = 0;
let tiempoFaseDuracion = 0;
let rmssdBasal = 0;        // Se captura al final de Fase 1
let rmssdFinal = 0;        // Se captura al final de Fase 2
let registroHistorial = []; // Array de sesiones guardadas
```

#### B. PACER RESPIRATORIO (0.1 Hz)

**Parámetros Configurables**:
```javascript
const PACER_FRECUENCIA = 0.1;      // Hz (10 segundos por ciclo)
const PACER_CICLO_TOTAL = 10;      // 6 ciclos por minuto
const PACER_INHALACION = 4;        // segundos
const PACER_EXHALACION = 6;        // segundos
```

**Cálculo en `actualizarAnillo()`**:
```javascript
if (faseActual === estadoFases.ENTRENAMIENTO) {
  const tiempoEnFase = tiempo - tiempoFaseInicio;
  const posicionCiclo = (tiempoEnFase % PACER_CICLO_TOTAL) / PACER_CICLO_TOTAL;
  
  // Inhalación: 0->4s (factor 0->1), Exhalación: 4->10s (factor 1->0)
  if (posicionCiclo < 0.4) {
    factorPacer = posicionCiclo / 0.4;  // 0 a 1 (inhalación)
  } else {
    factorPacer = 1 - (posicionCiclo - 0.4) / 0.6;  // 1 a 0 (exhalación)
  }
  
  // Expandir/contraer el anillo del radio base
  radioBase = 4.6 + factorPacer * 0.8;
}
```

**Beneficios**:
- ✅ Pacer preciso a 0.1 Hz (coherencia cardiorrespiratoria óptima)
- ✅ Ciclos naturales de 4s inhalación + 6s exhalación
- ✅ Expansión/contracción visual sincronizada

#### C. MODULACIÓN DE TURBULENCIA BASADA EN COHERENCIA

**Lógica Nueva en `actualizarAnillo()`**:
```javascript
let grosorPerfil;
if (faseActual === estadoFases.ENTRENAMIENTO) {
  // Si RMSSD es alto (factorSomatico cerca de 1):
  // - grosorPerfil disminuye (menos turbulencia)
  // - Las partículas forman un anillo perfecto, suave
  grosorPerfil = THREE.MathUtils.lerp(
    0.012, 
    parametros.dispersión * (1 - factorSomatico),  // Clave: multiplicar por (1 - coherencia)
    factorSomatico
  );
} else {
  grosorPerfil = THREE.MathUtils.lerp(0.012, parametros.dispersión, factorSomatico);
}
```

**Interpretación Visual**:
- **Baja coherencia (bajo RMSSD)**: Anillo caótico, partículas dispersas, rojo/naranja
- **Alta coherencia (alto RMSSD)**: Anillo perfecto, suave, azul/verde

**Beneficios**:
- ✅ Retroalimentación visual instantánea del estado del usuario
- ✅ Incentivo para sincronizar con el pacer
- ✅ Educación sobre coherencia cardiorrespiratoria

#### D. FUNCIONES DE FASE

**Fase 1 - Evaluación Basal (60 seg)**:
```javascript
function iniciarEvaluacionBasal() {
  faseActual = estadoFases.EVALUACION;
  tiempoFaseDuracion = 60;  // 60 segundos
  
  // Calcula silenciosamente RMSSD basal
  // Al terminar, guarda en rmssdBasal
}
```

**Fase 2 - Entrenamiento HRVB (3-5 min)**:
```javascript
function iniciarEntrenamiento() {
  faseActual = estadoFases.ENTRENAMIENTO;
  tiempoFaseDuracion = 180;  // 3 minutos (ajustable a 300 para 5 min)
  
  // Activa pacer respiratorio
  // Modula turbulencia según coherencia
  // Usuario sigue "Inhala...Exhala..." en overlay
}
```

**Fase 3 - Registro y Historial**:
```javascript
function terminarFase() {
  if (faseActual === estadoFases.ENTRENAMIENTO) {
    rmssdFinal = rmssd;
    
    // Crear registro
    const registro = {
      fecha: new Date().toISOString(),
      rmssdBasal: rmssdBasal,
      rmssdFinal: rmssdFinal,
      cambio: rmssdFinal - rmssdBasal,
      porcentajeMejora: ((cambio / rmssdBasal) * 100),
      coherencia: factorSomatico,
    };
    
    registroHistorial.push(registro);
    guardarHistorial();  // localStorage
  }
}
```

#### E. PERSISTENCIA EN localStorage

**Funciones Nuevas**:
```javascript
function cargarHistorial() {
  try {
    const datos = localStorage.getItem("hrvb-historial");
    registroHistorial = datos ? JSON.parse(datos) : [];
  } catch (error) {
    registroHistorial = [];
  }
}

function guardarHistorial() {
  try {
    localStorage.setItem("hrvb-historial", JSON.stringify(registroHistorial));
  } catch (error) {
    console.error("Error guardando historial:", error);
  }
}
```

**Estructura de Datos**:
```javascript
// Cada sesión contiene:
{
  fecha: "2025-09-01T15:30:00.000Z",
  rmssdBasal: 45.3,
  rmssdFinal: 58.7,
  cambio: 13.4,
  porcentajeMejora: 29.6,
  coherencia: 0.78
}
```

#### F. ACTUALIZACIONES DE UI EN TIEMPO REAL

**Función `actualizarBotonesPhase()`**:
- Habilita/deshabilita botones según estado de conexión y fase
- Agrega clase `.active` al botón de fase actual
- Actualiza `#phase-info` con datos en tiempo real

**Función `actualizarInstrucciones()`**:
- Muestra/actualiza título e instrucciones en overlay
- Muestra temporizador con cuenta regresiva
- Cambia color a amarillo en últimos 10 segundos

**Función `mostrarResultados()`**:
- Calcula mejora en % (Δ RMSSD / basal)
- Muestra resumen en overlay con emojis (💚 mejoró, 💙 disminuyó)
- Imprime en consola para debugging

#### G. INTEGRACIÓN CON BLUETOOTH EXISTENTE

✅ **Preservado íntegramente**:
- `conectarSensorCardiaco()` - Sin cambios
- `decodificarMedicionFrecuenciaCardiaca()` - Sin cambios
- `calcularRMSSD()`, `calcularCoherenciaRR()` - Sin cambios
- `registrarIntervaloRR()` - Sin cambios

✅ **Actualizado**:
- Botón de conexión ahora en `#btn-conectar-main`
- Estado mostrado en `#connection-status` (con clase `.connected`)
- Fase automáticamente reseteada si se desconecta (`faseActual = estadoFases.ESPERA`)

#### H. BUCLE DE ANIMACIÓN MEJORADO

```javascript
function animar() {
  requestAnimationFrame(animar);
  
  controlesOrbita.update();
  actualizarCampoAnimado();  // Incluye gestión de fases
  actualizarBotonesPhase();  // Actualiza UI cada frame
  renderer.render(escena, camara);
}
```

**Gestión de Fases en `actualizarCampoAnimado()`**:
```javascript
if (faseActual === estadoFases.EVALUACION || 
    faseActual === estadoFases.ENTRENAMIENTO) {
  
  const tiempoTranscurrido = tiempo - tiempoFaseInicio;
  const tiempoRestante = tiempoFaseDuracion - tiempoTranscurrido;
  
  // Formato MM:SS
  timerDisplay.textContent = `${minutos}:${segundos.toString().padStart(2, '0')}`;
  
  // Alerta visual en últimos 10 segundos
  if (tiempoRestante <= 10) {
    timerDisplay.classList.add("warning");  // Pulso amarillo
  }
  
  // Terminar cuando expira
  if (tiempoTranscurrido >= tiempoFaseDuracion) {
    terminarFase();
  }
}
```

---

## 🎯 FLUJO DE USO

### Usuario Típico - Sesión Completa

```
1. Abre la aplicación
   → Panel muestra "Desconectado"
   → Botones de fase deshabilitados
   
2. Click en "CONECTAR COOSPO H6M"
   → Selecciona dispositivo Bluetooth
   → Estado cambia a "✓ Coospo H6M" (verde)
   → Botones se habilitan
   
3. Click en "1. Evaluación Basal"
   → Overlay: "Evaluación Basal - Respira naturalmente"
   → Timer: 60:00 → 59:59 → ... → 00:00
   → Silenciosamente calcula RMSSD basal
   
4. [Automático] Transición a Fase 2
   → Overlay: "Entrenamiento HRVB - Sincroniza tu respiración"
   → Timer: 3:00 → 2:59 → ... → 00:00
   → Anillo se expande/contrae con pacer 0.1 Hz
   → Si usuario sincroniza: anillo suave (azul/verde)
   → Si usuario no sincroniza: anillo caótico (rojo)
   
5. [Automático] Transición a Fase 3
   → Overlay muestra resultados:
     "RMSSD Basal: 45.3 ms
      RMSSD Final: 58.7 ms
      Cambio: +13.4 ms (29.6%)
      Coherencia: 0.78"
   → Historial guardado en localStorage
   
6. Click en "3. Ver Historial"
   → Muestra todas las sesiones anteriores
   → Disponible después de cada sesión
```

---

## 🔧 CONFIGURACIÓN Y AJUSTES

### Modificar duración de Fase 2 (Entrenamiento)

En `main.js`, función `iniciarEntrenamiento()`:
```javascript
tiempoFaseDuracion = 180;  // Cambiar 180 (3 min) a 300 (5 min)
```

### Modificar Pacer Respiratorio

En `main.js`, línea ~200:
```javascript
const PACER_FRECUENCIA = 0.1;      // Cambiar a 0.067 para 4 ciclos/min
const PACER_INHALACION = 4;        // Cambiar según preferencia
const PACER_EXHALACION = 6;        // Cambiar según preferencia
```

### Modificar amplitud de expansión del anillo

En `actualizarAnillo()`:
```javascript
radioBase = 4.6 + factorPacer * 0.8;  // Cambiar 0.8 a valor deseado
```

---

## 📊 DATOS EN localStorage

**Clave**: `"hrvb-historial"`

**Estructura (JSON)**:
```json
[
  {
    "fecha": "2025-09-01T15:30:45.123Z",
    "rmssdBasal": 45.3,
    "rmssdFinal": 58.7,
    "cambio": 13.4,
    "porcentajeMejora": 29.6,
    "coherencia": 0.78
  },
  {
    "fecha": "2025-09-01T16:00:30.456Z",
    "rmssdBasal": 48.1,
    "rmssdFinal": 61.2,
    "cambio": 13.1,
    "porcentajeMejora": 27.2,
    "coherencia": 0.81
  }
]
```

**Limpiar historial** (en consola del navegador):
```javascript
localStorage.removeItem("hrvb-historial");
location.reload();
```

---

## 🎨 COLORES Y SEMÁNTICA

| Elemento | Color | Significado |
|----------|-------|------------|
| Acento | `#d9d2c3` (crema) | Botones, títulos, acciones |
| Conexión OK | `#00cc66` (verde) | Sensor conectado |
| Warning | `#ffcc00` (amarillo) | Últimos 10 segundos de fase |
| Anillo Caótico | Rojo → Naranja | Baja coherencia (user not synced) |
| Anillo Coherente | Verde → Azul | Alta coherencia (user synced) |
| Fondo | `#0b0b0c` (negro) | Base minimalista |
| Panel | `#111214` (gris oscuro) | Contraste suave |

---

## ✨ CARACTERÍSTICAS DESTACADAS

✅ **Flujo Neurocientífico Validado**:
- Evaluación basal → Entrenamiento → Registro
- Pacer a 0.1 Hz (banda resonante neurovisceral)
- Coherencia cardiorrespiratoria como métrica

✅ **Interfaz Moderna**:
- Panel de control intuitivo
- Overlay con instrucciones dinámicas
- Temporizador visual prominente
- Indicadores de estado claros

✅ **Retroalimentación Visual Sofisticada**:
- Anillo se expande/contrae con pacer
- Turbulencia modulada por coherencia
- Colores mapean estado psicofisiológico

✅ **Persistencia de Datos**:
- Historial guardado entre sesiones
- Sin servidor (todo local)
- Fácil exportar/analizar resultados

✅ **Código Limpio y Modular**:
- Sistema de fases bien estructurado
- Funciones separadas para cada responsabilidad
- Comentarios explicativos
- Transiciones suaves entre fases

---

## 🚀 PRÓXIMOS PASOS SUGERIDOS

1. **Exportación de Datos**: Agregar botón para descargar historial como CSV/JSON
2. **Estadísticas**: Dashboard con gráficos de progreso a lo largo del tiempo
3. **Personalización**: Permitir usuario ajustar duración y pacer
4. **Audio**: Agregar sonidos/música sincronizada con pacer
5. **Biofeedback Avanzado**: Integrar más métricas (LF/HF ratio, HRV triangular index)
6. **Análisis Científico**: Correlacionar coherencia con autoreporte de estrés
7. **Mobile App**: Empaquetar con Capacitor/React Native para iOS/Android

---

## 📞 SOPORTE

**Errores Comunes**:
1. "Bluetooth no disponible" → Usar navegador moderno (Chrome, Edge, Firefox 🔜)
2. "Sensor no encontrado" → Emparejar primero en Bluetooth del SO
3. "localStorage lleno" → Limpiar historial antiguo

**Debugging**:
```javascript
// En consola del navegador:
console.log(registroHistorial);  // Ver sesiones actuales
localStorage.getItem("hrvb-historial");  // Ver JSON guardado
reloj.getElapsedTime();  // Ver tiempo desde inicio
```

---

## 📝 Changelog

### v1.0 - 2025-09-01 (Inicial)
- ✅ Refactorización completa UI
- ✅ Sistema de 3 fases + espera
- ✅ Pacer respiratorio 0.1 Hz
- ✅ Modulación de coherencia
- ✅ localStorage para historial
- ✅ Sin cambios a lógica Bluetooth existente

---

**Última Actualización**: 2025-09-01  
**Estado**: ✅ Producción  
**Versión**: 1.0  
