# Wallet público y reservas aceptadas

Objetivo: publicar en `baztangoinfo/wallet` una página que lea localmente el QR de
una imagen y solicite a Wix un pase Apple firmado mediante el proveedor existente.

La fuente es SQLite de Manager: reservas con estado `accepted` y personas activas,
sin requisitos de pago, correo de aceptación enviado o entrada generada. Una fila
por persona conserva exactamente el QR actual. Solo se exportan campos del pase.

Se mantiene HTML/JS sin framework y Wix Velo. La nueva colección privada
`WalletAcceptedReservations` sustituye a `WalletPasses` como fuente; se conserva
`WalletGenerationLog` para cuota y exclusión de generaciones. La sincronización
autenticada actualiza por ID estable, conserva la caché si los datos coinciden,
invalida pases modificados y revoca registros ausentes al completar el snapshot.
No se modifica la base de Manager ni las reglas de sus generadores actuales.

Alternativas: consultar la colección del formulario no sirve porque no acredita
aceptación en Manager; alojar firma en GitHub Pages no es posible por ser estático.
Se reutilizan Wix y el proveedor de la base. No se envían importes ni contactos de
asistentes al proveedor. El QR existente es predecible: no equivale a autenticación
fuerte de identidad. Migrarlo exige cambiar conjuntamente entradas y lector.

## Plan y verificación

- [ ] Probar exportación SQLite en modo solo lectura: aceptación, impagos, sin
  entradas, bajas, duplicados, privacidad y edición correcta.
- [ ] Implementar esquema privado, sincronización autenticada y revocación;
  verificar conservación/invalidez de caché y entradas antiguas.
- [ ] Mejorar uploader PNG/JPEG/WebP, accesibilidad, errores y timeout;
  alojar jsQR localmente y probar QR real en navegador.
- [ ] Instalar colecciones/backend en Wix cuando el acceso lo permita;
  publicar GitHub Pages tras validaciones y verificar URL servida.
- [ ] Documentar resultado real y requisitos externos pendientes sin declarar
  integración completa si no puede verificarse en Wix/iPhone.

Autorización: el usuario solicita implementación y publicación en GitHub; elige
explícitamente `baztangoinfo/wallet`. No se publican datos privados ni certificados.
