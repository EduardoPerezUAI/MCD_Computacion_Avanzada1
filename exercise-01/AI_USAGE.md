Markdown

# AI Usage Log — LAB 02



## Registro

### 2026-08-14 - publicar About del curso

**Herramienta / agente:** Copilot CLI  
**Qué pedí:** Publicar el contenido de `about/README.md` como una página estática del curso, manteniendo el estilo del repositorio y usando solo recursos existentes.  
**Qué cambió en el proyecto:** Actualicé `index.html` y `styles.css` para convertir el perfil en una landing page dark-mode con secciones de perfil, intereses, preguntas y enlaces.  
**Qué revisé o corregí manualmente:** Verifiqué que el texto y los enlaces correspondieran exactamente al contenido disponible en el repositorio y que las referencias a assets fueran rutas relativas correctas.  
**Qué aprendí / qué error apareció:** El contenido del README se debe adaptar a un formato de página pública; el principal cuidado fue conservar la información original sin inventar datos ni crear rutas que no existieran en GitHub Pages.

---

### 2026-08-18 - Integración de Web Bluetooth y lectura de sensor cardíaco

**Herramienta / agente:** GitHub Copilot / Cursor (VS Code)  
**Qué pedí:** Prompts para conectar la banda de pecho Coospo H6M vía Web Bluetooth API (servicio `heart_rate`) y capturar intervalos R-R en milisegundos ($A$ y $B$) dentro de `main.js`.  
**Qué cambió en el proyecto:** Se añadió la decodificación de datos Bluetooth nativos, el cálculo de variabilidad cardíaca y un panel de telemetría en el DOM.  
**Qué revisé o corregí manualmente:** Corregí permisos en macOS y solucioné la compatibilidad de navegador usando Chrome/Edge para probar la conexión Web Bluetooth, ya que Firefox la bloquea por defecto.  
**Qué aprendí / qué error apareció:** Evaluar el estado biométrico latido por latido genera saltos erráticos inútiles. Aprendí que se requiere una media móvil de intervalos R-R para leer coherencia fisiológica de forma continua.

---

### 2026-08-20 - Rediseño de geometría: de grilla 3D a Anillo Somático de Partículas

**Herramienta / agente:** GitHub Copilot / Cursor (VS Code)  
**Qué pedí:** Prompts para reestructurar la grilla ortogonal de cubos en un único anillo de esferas concéntricas que reaccione morfológica y cromáticamente al estado del sistema nervioso.  
**Qué cambió en el proyecto:** Se reemplazó `BoxGeometry` por `SphereGeometry` en disposición anular. Se implementó una escala de 5 colores (Azul $\rightarrow$ Verde $\rightarrow$ Amarillo $\rightarrow$ Rojo $\rightarrow$ Rojo Oscuro) y la variación de grosor del aro según el nivel de estrés.  
**Qué revisé o corregí manualmente:** Tras acumular código complejo e inestable, decidí retornar al `main.js` base y aplicar un prompt maestro limpio. Bloqueé la rotación de la escena para restringir el movimiento a desplazamientos puramente radiales (centrífugos y centrípetos).  
**Qué aprendí / qué error apareció:** De acuerdo con la literatura (*Balaji et al., 2025*), en estrés el pulso es monótono (aro comprimido en línea delgada) y en calma es coherente/fluido (aro extendido en franja disgregada). Reorganicé la interfaz definiendo "SISTEMA" (`Densidad`, `DispersIÓN`, `Amplitud`) y "VARIACIÓN" (`Frecuencia`, `Aleatoriedad`, `Semilla`).