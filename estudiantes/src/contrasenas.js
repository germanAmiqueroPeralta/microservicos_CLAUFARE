// Hash de contraseñas con PBKDF2-SHA256 (Web Crypto, nativo en Workers).
// Formato guardado: pbkdf2-sha256$<iteraciones>$<sal base64>$<hash base64>
// Las iteraciones quedan dentro del hash, así se pueden subir más adelante
// sin invalidar las contraseñas existentes.
const ITERACIONES = 20000; // equilibrio entre seguridad y el límite de CPU del plan gratuito
const encoder = new TextEncoder();

const aBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (texto) => Uint8Array.from(atob(texto), (ch) => ch.charCodeAt(0));

async function derivar(password, sal, iteraciones) {
  const clave = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, clave, 256);
}

export async function crearHash(password) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(password, sal, ITERACIONES);
  return `pbkdf2-sha256$${ITERACIONES}$${aBase64(sal)}$${aBase64(hash)}`;
}

export async function verificarHash(password, guardado) {
  const [algoritmo, iteraciones, sal, hash] = String(guardado).split('$');
  if (algoritmo !== 'pbkdf2-sha256') return false;
  const calculado = new Uint8Array(await derivar(password, deBase64(sal), Number(iteraciones)));
  const esperado = deBase64(hash);
  if (calculado.length !== esperado.length) return false;
  // Comparación en tiempo constante (evita ataques de tiempo)
  return crypto.subtle.timingSafeEqual(calculado, esperado);
}
