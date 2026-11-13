# BAZTANGO Wallet — GitHub Pages + Wix CMS + wallet-mcp

**Estado:** implementación lista para instalar y ensayar, **no desplegada**. Se reutiliza el proveedor firmado que ya funcionó en iPhone: [arshwaraich/wallet-mcp](https://github.com/arshwaraich/wallet-mcp), mediante `POST https://walletmcppass.com/api/passes`.

## Arquitectura

- **GitHub Pages**: `index.html`, `app.js`, `config.js`. Interfaz pública, subida PNG y lectura QR local con jsQR. No sube el PNG.
- **Wix Velo**: `wix-backend/` se copia al `Backend` del sitio. `POST /_functions/walletGenerate` consulta la colección privada y firma con wallet-mcp; `GET /_functions/walletDownload?token=...` devuelve el `.pkpass` con MIME correcto.
- **Wix CMS**: `WalletPasses` (datos de entradas, estado y enlaces privados) y `WalletGenerationLog` (control de cuota).
- **Proveedor**: walletmcppass.com. Solicita un correo real con `contact_email` y `x402_ready:false` (sin pagos). La firma se hace en el proveedor; el código open source NO incluye certificado de Apple.

## Instalación concreta

1. Crea un repositorio público de GitHub (por ejemplo `joteiza003/baztango-wallet`), sube los archivos de la **raíz** de este paquete y activa **Settings → Pages → Deploy from a branch → main → /(root)**. La URL será `https://joteiza003.github.io/baztango-wallet/`. No subas datos de asistentes reales ni secretos al repo.
2. En Wix Studio habilita Velo. Crea las colecciones privadas `WalletPasses` y `WalletGenerationLog` según `cms/*.schema.json`; importa `cms/ejemplo_baztango.csv` solo como dato de prueba.
3. Copia cada archivo de `wix-backend/` al Backend de Wix. **Si existe `http-functions.js`, fusiona los exports en vez de sustituirlo**. Verifica que los import paths sean compatibles con la versión Velo.
4. En Secrets Manager de Wix crea `WALLET_CONTACT_EMAIL` con un correo real aprobado por el proveedor. No se guarda en GitHub.
5. Edita en `wix-backend/http-functions.js` las constantes `ALLOWED_ORIGIN` y `BASE` con el origen GitHub Pages y el dominio real publicado en Wix (en este paquete usan `https://joteiza003.github.io` y `https://www.joseba-bakartxo.com`).
6. Publica Wix. Prueba la API con la página de GitHub; comprueba CORS, lectura de QR, generador, descarga directa desde iPhone con Safari y cupos.
7. Una vez probado, conecta opcionalmente un subdominio propio como `wallet.joseba-bakartxo.com` a GitHub Pages, con HTTPS. En ese caso actualiza `ALLOWED_ORIGIN` para que coincida exactamente con el subdominio.

## Consideraciones importantes antes de abrir al público

- La colección debe ser **solo administración**: el navegador nunca debe poder consultar CMS directamente.
- CORS **no es autenticación**. Cualquier atacante puede llamar el endpoint fuera del navegador; se requiere protección de abuso (CAPTCHA verificado en backend, rate limiting real y/o token de entrada no adivinable) antes de su lanzamiento abierto.
- Los QR secuenciales como `BZT20_CAN+10_1` no deben considerarse secretos: para impedir generar pases ajenos, utiliza un identificador aleatorio de alta entropía vinculado a cada entrada.
- La caché en Wix Media Manager para `.pkpass` **no está verificada** en tu plan. Si falla, el pase dependerá de la URL temporal de 1 hora del proveedor. No afirmar persistencia hasta comprobarlo. Es preferible un almacenamiento privado duradero para eventos grandes.
- Las marcas de `generating` y la cuenta diaria del CMS son **best effort**, no transacciones atómicas; dos peticiones simultáneas podrían duplicar generaciones. No abrir a gran escala sin exclusión mutua robusta.
- La API tiene actualmente 10 llamadas gratuitas por día por IP/contacto y 500 globales; reset UTC. El proveedor puede cambiar estos límites. `402`/`429` se muestran como indisponibilidad. No hay pagos ni billetera USDC.
- Se envían los datos del pase a un tercero: política de privacidad y revisión de términos requeridas.
- Wix documenta sus HTTP functions como API para comunicación servidor-a-servidor. **El uso desde un navegador cross-origin debe verificarse** en el sitio real. Se incluye `OPTIONS` y CORS restringido; si Wix bloquea esa modalidad, el siguiente paso es un proxy HTTPS con protección (p. ej. Cloudflare Worker).

## Validación local

```bash
node tests/test-core.mjs
node --check app.js
```

Estos tests comprueban funciones puras y sintaxis. No sustituyen una prueba de integración Wix / GitHub / Safari.

Documentación: https://dev.wix.com/docs/velo/velo-only-apis/wix-http-functions/introduction
