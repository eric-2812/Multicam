# Cambios

Cada versión es una release propia en GitHub. La sección de cada versión es lo que aparece en sus notas.

## 0.6.0-beta — 25 nov 2026

### Nuevo: Canon, Nikon, Fujifilm y Lumix
- Nueva pestaña **Canon · Nikon · Fuji · Lumix** (también en la pantalla de inicio). Eliges la marca y te dice paso a paso cómo conectar tu cámara:
  - **Canon:** los modelos EOS recientes (R8, R5 Mark II…) funcionan como webcam por USB sin programas. Los demás, con **EOS Webcam Utility**.
  - **Nikon:** Z6III (firmware 2.0 o posterior), Z f y Z50II con **USB streaming (UVC/UAC)** desde el menú de red. Los demás, con **Nikon Webcam Utility**.
  - **Fujifilm:** los modelos nuevos con el modo de conexión **USB WEBCAM**. Los anteriores (X-T4, X-S10, X-Pro3, X100V…), con **FUJIFILM X Webcam**.
  - **Lumix:** los modelos nuevos con el modo USB **PC (Webcam)**. Los anteriores (S1, S5, GH5, G9…), con **LUMIX Webcam Software**.
  - Para todas: HDMI limpio a una capturadora para la mejor calidad y el menor retraso.
- Cortiva **reconoce estas cámaras por su nombre** al conectarlas y las añade con un clic, con su micrófono si lo tienen.
- La latencia estimada tiene en cuenta cómo está conectada la cámara: por el programa del fabricante, por el modo USB de la cámara o por HDMI. En cuanto el navegador puede medirla, se usa la medida real.
- Consejos para sesiones largas: alimentación por corriente, apagado automático desactivado y pantalla HDMI limpia.
- La pantalla de inicio también ofrece **Compartir pantalla o ventana**.

### Límites conocidos
- En modo webcam por USB casi ninguna cámara deja cambiar foco, ISO u obturador desde el ordenador. Si la cámara los ofrece, aparecen en el panel; si no, se ajustan en la cámara.
- Aún sin probar con cámaras Canon, Nikon, Fujifilm o Lumix reales.

## 0.5.0-beta — 25 nov 2026

### iPad y iPhone
- **La cámara del iPad ya no "se pierde" sin explicación.** iPad y iPhone solo pueden usar una de sus cámaras a la vez en el navegador: al añadir otra, la primera se para. Ahora Cortiva te avisa antes, explica por qué se paró y tiene un botón **Switch back** para volver a ella.
- Arreglado un fallo de la 0.4 en iPad: dos cámaras del mismo iPad podían quitarse la señal la una a la otra sin parar.
- La imagen de las cámaras se mantiene dentro de la página para que Safari no la pause.
- Para más ángulos con un iPad, une otros móviles por Wi-Fi (pestaña iPhone o Android / Wi-Fi).

### Web
- **La web ahora se actualiza con cada release**, con exactamente la misma versión que los `.exe`. Antes se actualizaba con cada cambio, aunque no hubiera release.
- La barra de estado de abajo muestra la versión (por ejemplo **v0.5.0-beta**), en la web y en la app.

## 0.4.0-beta — 25 nov 2026

### Arreglos
- **Una cámara USB que pierde la señal ahora se reconecta sola.** Antes ponía "esperando a que vuelva", pero nunca lo intentaba. Ahora reintenta enseguida y luego cada pocos segundos, y en cuanto vuelve recupera sus ajustes (foco, obturador, balance…).
- Si la cámara está ocupada por otra aplicación (otra pestaña, la app de Cortiva, Teams, la app Cámara…), te lo dice. En Windows, la mayoría de cámaras solo las puede usar una aplicación a la vez.
- En el panel de la cámara hay un botón **Try now** para reintentar a mano.
- El QR para unir móviles desde la app de escritorio apunta a la nueva dirección de la web (**eric-2812.github.io/cortiva**), tras el cambio de nombre del repositorio.

### Límites conocidos
- Si la cámara se pierde mientras grabas, su archivo de esa toma termina en ese momento; la siguiente toma ya graba con normalidad.

## 0.3.0-beta — 25 nov 2026

### Nuevo: atajos de teclado configurables
- En **Setup → Shortcuts** puedes cambiar la tecla de cada acción: haz clic en la tecla, pulsa la nueva y listo. **Esc** cancela, **Retroceso** la quita, y **Reset to defaults** vuelve a las de fábrica. Se guardan en el ordenador.
- Nuevas teclas para ajustar la cámara seleccionada (la que está abierta en el panel de ajustes):
  - **C** / **Mayús + C**: obturador más rápido / más lento, de paso en paso (1/50 → 1/60 → 1/100…).
  - **I** / **Mayús + I**: ISO arriba / abajo.
  - **E** / **Mayús + E**: exposición ± ⅓ de paso.
  - **A** / **Mayús + A**: iris (número f más alto / más bajo).
  - **N** / **Mayús + N**: filtro ND.
  - **D** / **Mayús + D**: foco más lejos / más cerca.
  - **Z** / **Mayús + Z**: zoom.
  - **W** / **Mayús + W**: balance de blancos ± 100 K.
  - **.** y **,**: cámara siguiente / anterior.
  - Sin tecla por defecto, para asignar a tu gusto: auto exposición, autofoco, balance automático, panorámica / inclinación y linterna.
- Si mantienes pulsada una tecla, el ajuste sigue cambiando.
- Al pulsar una tecla aparece arriba el valor nuevo, por ejemplo **"Cam 1 — Shutter 1/100 · 180°"**.
- Igual que en el panel, solo funcionan los ajustes que tiene la cámara. Si no lo tiene, el aviso lo dice ("Cam 2 has no shutter control").
- Al cambiar obturador o ISO desde el teclado, la cámara pasa a exposición manual. Lo mismo pasa con el foco (a enfoque manual) y con el balance de blancos (a manual).
- Las teclas de siempre (R, M, S, Espacio, Intro…) también se pueden cambiar. **1–9** y **Mayús + 1–9** siguen fijas para elegir cámara y pincharla.

## 0.2.0-beta — 24 nov 2026

Versión de seguridad, tras una auditoría de toda la app.

### Seguridad
- **Electron 45** (antes 33, que ya no recibía parches de seguridad de Chromium).
- La app de escritorio solo muestra sus propias páginas: no navega a webs externas ni abre ventanas nuevas, y los enlaces externos (solo `https`) se abren en tu navegador.
- Cámara, micrófono, Bluetooth, carpetas y pantalla solo se conceden a la propia app. Ya no se da acceso a dispositivos USB, serie o HID.
- El ejecutable viene protegido: no se puede usar como intérprete de Node, ni inyectarle código con variables de entorno o depuradores, y comprueba que sus archivos no se han modificado.
- Política de seguridad de contenido (CSP) en la app y en la web: solo se ejecuta el código de Cortiva.
- Emparejar una cámara por Bluetooth siempre pide confirmación.
- Los archivos descargados siempre se guardan dentro de **Vídeos\Cortiva**, con nombres limpios.

### Móviles por Wi-Fi
- El código de la sala es más largo (10 caracteres) y se genera con el generador aleatorio seguro del sistema, así que no se puede adivinar.
- Todo lo que envía un móvil se comprueba antes de usarlo: nombres sin caracteres raros, ajustes de cámara válidos. Un móvil con datos malformados ya no puede bloquear la sala de control.
- Máximo de 16 móviles conectados a la vez.

### Grabaciones
- Si una cámara IP lleva contraseña en su dirección, ya no se muestra en pantalla ni se guarda en la hoja de toma.
- El CSV de marcadores ya no deja que una hoja de cálculo interprete un nombre como fórmula, y el EDL no se rompe con nombres raros.

### Proyecto
- Los workflows de GitHub usan versiones fijas de cada acción, y Dependabot avisa cada semana de actualizaciones de seguridad.

### Límites conocidos
- El instalador sigue sin firma digital: Windows avisará de "editor desconocido" la primera vez.

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
