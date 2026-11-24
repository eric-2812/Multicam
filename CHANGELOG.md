# Cambios

Cada versión es una release propia en GitHub. La sección de cada versión es lo que aparece en sus notas.

## 0.1.0-beta — 24 nov 2026

Primera beta de Cortiva para Windows.

### Qué incluye
- Graba cada cámara y cada micrófono en su propio archivo, todos empezando en el mismo fotograma, más el programa mezclado, un EDL, marcadores y una hoja de toma.
- Webcams y capturadoras, iPhone (Continuity Camera o Wi-Fi), GoPro (modo webcam o HDMI), Sony Alpha (USB streaming o HDMI), cámaras IP y compartir pantalla.
- GoPro (HERO9+) y Sony Alpha emparejadas por Bluetooth graban en su propia tarjeta al pulsar REC.
- Ajustes de cámara que admita el hardware (foco, obturador, ISO, balance de blancos, PTZ y más) y, por micrófono, trim, EQ, compresor y puerta de ruido.
- Código de tiempo maestro, alineación de lip-sync, claqueta, vista de foco con cebra / peaking / histograma y mezclador de vídeo en directo.
- No deja grabar sin al menos una cámara; los micrófonos tienen su propia pestaña y aparecen en la pantalla de inicio.
- Las grabaciones sin carpeta elegida se guardan en **Vídeos\Cortiva**.

### Límites conocidos
- Aún sin probar con una Sony a7 IV o una GoPro reales por Bluetooth.
- Los móviles se unen a través de la versión web (el QR la abre), así que la web debe estar publicada en GitHub Pages.
