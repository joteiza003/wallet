# BAZTANGO Wallet

Página estática para leer el QR de una imagen y solicitar un pase Apple Wallet de una reserva aceptada. El PNG se procesa en el navegador. La colección privada y la emisión se gestionan en Wix Velo.

## Estado

- Destino: `https://joteiza003.github.io/wallet/` y repositorio `joteiza003/wallet`.
- Wix tiene 282 reservas aceptadas activas y la emisión y descarga de un `.pkpass` se han comprobado. El proveedor entregó un enlace temporal; vuelve a subir el QR si caduca.
- El sitio público usa GitHub Pages en `joteiza003/wallet`; la cuenta anterior, `baztangoinfo`, quedó descartada por su suspensión.
- Wix: `WalletAcceptedReservations` y `WalletGenerationLog` son colecciones privadas. El backend se instala con `install/walletApi.js` y los exports de `install/http-functions.append.txt`, sin sustituir las funciones existentes del sitio.
- Fuente: `datos/baztango_2026.sqlite3` de Baztango Manager Pro. `scripts/sync_manager.py` lee SQLite en modo solo lectura, incluye todas las reservas con estado `accepted` y personas activas, sin filtros de pago, correo o entrada generada.
- La sincronización usa un token Wix que permanece fuera de GitHub. El proveedor de pases firma los `.pkpass`; el repositorio no contiene certificados de Apple.

## Sincronización

Desde este directorio, con los archivos de Manager en sus ubicaciones reales:

```powershell
python scripts/sync_manager.py --db "D:\04_ESTUDIOS_ESCUELA\ESCUELA\baztango\2025\EXCEL\Baztango Manager Pro\datos\baztango_2026.sqlite3" --env-file "D:\04_ESTUDIOS_ESCUELA\ESCUELA\baztango\2025\EXCEL\Baztango Manager Pro\.env" --year 2026 --prepare
python scripts/sync_manager.py --db "D:\04_ESTUDIOS_ESCUELA\ESCUELA\baztango\2025\EXCEL\Baztango Manager Pro\datos\baztango_2026.sqlite3" --env-file "D:\04_ESTUDIOS_ESCUELA\ESCUELA\baztango\2025\EXCEL\Baztango Manager Pro\.env" --year 2026 --sync
```

`--output` permite generar un CSV/JSON privado, siempre fuera de este repositorio. Una sincronización terminada conserva pases sin cambios y revoca registros que dejan de estar aceptados. Un snapshot vacío exige `--allow-empty` explícito.

## Configuración Wix

La colección CMS debe tener permisos de administración únicamente. El secreto de sincronización existente se llama `baztango-reservations-export-token`. La emisión usa el correo de contacto público de BAZTANGO (`baztangoinfo@gmail.com`). El origen CORS de GitHub Pages se define en `wix-backend/http-functions.js`.

El flujo público está limitado a diez emisiones nuevas al día. Una descarga de un pase vigente usa la caché y no genera otro. Los identificadores QR existentes son predecibles, por lo que la posesión de una imagen QR no demuestra identidad; esta página sirve para añadir la propia entrada a Wallet, no para verificar acceso al evento.

## Desarrollo

```powershell
python -m unittest discover -s tests -p test_export.py
node --experimental-vm-modules --test tests/test-sync.mjs tests/test-binary.mjs tests/test-service.mjs
node tests/test-core.mjs
npm run check
```

`install/walletApi.js` se regenera tras editar el backend:

```powershell
npx esbuild wix-backend/http-functions.js --bundle --platform=node --format=esm --external:wix-* --alias:backend=./wix-backend --outfile=install/walletApi.js
```

El frontend usa jsQR 1.4.0 alojado en `vendor/`. Los datos de asistentes, tokens y `.pkpass` no se publican en GitHub.
