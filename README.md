# Mini Dash (HTML + Canvas)

Juego simple estilo Geometry Dash: el cubo avanza solo y tienes que saltar obstáculos.

Hecho solo para fines educativos.

Incluye un **modo difícil** que aumenta la velocidad de los niveles para un desafío mayor.

Los bloques cuadrados funcionan como plataformas: puedes caer sobre ellos sin morir.

Incluye **12 niveles** con patrones de obstáculos predefinidos. Al terminar el último nivel, aparece la pantalla de victoria y puedes reiniciar.

El set adicional (niveles 7-9) tiene **tematica espacial** y el nuevo set (niveles 10-12) tiene **tematica de nieve**.

Cada nivel tiene su propia tematica visual, y el fondo cambia de forma marcada de un nivel a otro.

Cada nivel tiene **música diferente** (sintetizada con Web Audio API) y aparece un texto grande cuando cambias de nivel.

Tambien incluye una **seccion de iconos** para elegir el aspecto del cubo. Los iconos se desbloquean al completar niveles.

## Cómo correrlo

Opción A (recomendada):
- En VS Code instala “Live Server”
- Click derecho en `index.html` → **Open with Live Server**

Opción B (Python):
- En esta carpeta ejecuta:
  - `python -m http.server 5173`
- Abre `http://localhost:5173/`

Opción C (App de escritorio Windows):
- Instala dependencias:
  - `npm install`
- Ejecuta en modo escritorio:
  - `npm start`
- Genera instalador `.exe`:
  - `npm run dist`
- El instalador queda en:
  - `dist/Mini Dash Setup 1.0.0.exe`

## Controles

- Iniciar partida: **Enter**
- Saltar: **Espacio** / Click / Toque
- Altura del salto: manten pulsado para salto alto, suelta rapido para salto corto
- Rewind: **manten Q** para retroceder en reversa hasta 10 segundos (tambien funciona al perder)
- Reiniciar: **R** (o espacio/click cuando pierdes)

## Iconos y desbloqueo

- Clasico: disponible desde el inicio
- Rayo: se desbloquea al completar 1 nivel
- Hazard: se desbloquea al completar 2 niveles
- Corona: se desbloquea al completar los 3 niveles
- Nebula: se desbloquea al completar 4 niveles
- Glitch: se desbloquea al completar 5 niveles
- Inferno: se desbloquea al completar los 6 niveles
- Saturn: se desbloquea al completar 7 niveles
- Cometa: se desbloquea al completar 8 niveles
- Void: se desbloquea al completar los 9 niveles
- Frost: se desbloquea al completar 10 niveles
- Snowflake: se desbloquea al completar 11 niveles
- Ice Core: se desbloquea al completar los 12 niveles
- Hard Bolt: se desbloquea al completar 1 nivel en modo difícil
- Hard Hazard: se desbloquea al completar 3 niveles en modo difícil
- Hard Crown: se desbloquea al completar 5 niveles en modo difícil
- Hard Nebula: se desbloquea al completar 7 niveles en modo difícil
- Hard Glitch: se desbloquea al completar 9 niveles en modo difícil
- Hard Inferno: se desbloquea al completar 11 niveles en modo difícil
- Hard Saturn: se desbloquea al completar los 12 niveles en modo difícil
- Last Stand: se desbloquea al perder 20 veces

Nota de audio:
- Algunos navegadores bloquean sonido hasta la primera interacción. Pulsa espacio o haz click para activar el audio.

## Archivos

- `index.html` UI + canvas
- `style.css` estilos
- `game.js` lógica del juego
