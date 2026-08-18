// --- 01. SIMULADOR BIOMÉTRICO (INPUTS A y B) ---
let inputA = 800; // Latido actual en ms
let inputB = 820; // Latido siguiente en ms
let deltaRR = Math.abs(inputA - inputB); // Variabilidad inmediata

// Simulación de latidos en vivo (Modo Hacker / Test)
function simularBiometria() {
  // Genera un latido aleatorio entre 600ms y 1000ms
  inputA = inputB;
  
  // Alterna intencionalmente entre fases de "Estrés" y "Calma"
  const modoCalma = Math.sin(Date.now() * 0.0005) > 0; 
  
  if (modoCalma) {
    // Alta variabilidad (Calma)
    inputB = inputA + (Math.random() * 80 - 40); 
  } else {
    // Baja variabilidad (Estrés)
    inputB = inputA + (Math.random() * 10 - 5); 
  }
  
  // Limitar dentro de rangos humanos reales
  inputB = Math.max(600, Math.min(1000, inputB));
  deltaRR = Math.abs(inputA - inputB);
}

// Actualizar la simulación cada 800ms
setInterval(simularBiometria, 800);

// --- 02. REGLAS GENERATIVAS DE ALTURA Y ROTACIÓN ---
// Reemplaza o complementa las funciones de tu starter en main.js[span_6](start_span)[span_6](end_span)

function calcularAlturaModulo(x, z) {
  const distancia = Math.sqrt(x * x + z * z);
  
  // El promedio de A y B define el ritmo base de deformación
  const frecuenciaRitmo = (inputA + inputB) / 2000; 
  
  // El deltaRR (HRV) define qué tan caótico o suave es el patrón
  // A menor HRV (|A-B| bajo), el campo genera picos marcados y abruptos
  const rugosidad = Math.max(0.1, (60 - deltaRR) / 10);
  
  const onda = Math.sin(distancia * parametros.frecuencia * rugosidad + Date.now() * 0.003) 
               * (parametros.amplitud * (inputA / 800));

  return onda;
}

function calcularColorModulo() {
  // Retorna un valor cromático basado en la tensión (|A - B|)
  // deltaRR bajo = Rojo/Naranja | deltaRR alto = Azul/Cian
  const factorCalma = Math.min(1.0, deltaRR / 50); 
  return {
    r: 1.0 - factorCalma, // Mucho rojo si hay estrés
    g: factorCalma * 0.5,
    b: factorCalma        // Mucho azul si hay calma
  };
}
