# Asteroides Drosophila

Un juego tipo Asteroides que **no controla una persona**, sino un subcircuito del conectoma de la mosca de la fruta (*Drosophila melanogaster*). 2 688 neuronas con picos, conectadas con las sinapsis reales de **FlyWire**, ven los asteroides y deciden cuándo girar, empujar y disparar. La página muestra en vivo cada neurona disparando.

> **English summary.** A browser Asteroids game piloted by a spiking neural network wired with real synapses from a 2,688-neuron subcircuit of the FlyWire *Drosophila* whole-brain connectome (FAFB v783): eye-column neurons as inputs, intermediate neurons, and four descending-neuron types as outputs. It is a simplified educational model, **not** a validated simulation of fly behaviour. Single self-contained HTML file; no server needed. Docs below are in Spanish.

**Demo:** abre `docs/index.html` en un navegador (Chrome, Edge o Firefox). Es un solo archivo y no necesita internet ni servidor. Con GitHub Pages activado (carpeta `/docs`) queda en `https://deaconzarathos.github.io/Asteroides-Drosophila/`.

## Qué verás en pantalla

- **Izquierda:** el juego. Los abanicos verdes tenues son los ángulos donde los ojos detectan asteroides, más intensos cuanto más cerca están.
- **Derecha:** la red. Cada punto es una neurona y se agranda cuando dispara.
  - gris verdoso: neuronas del ojo (entrada);
  - verde: intermedias excitadoras; rosa: intermedias inhibidoras;
  - naranja: neuronas descendentes (salida), en cuatro grupos de dos: giro izquierdo, giro derecho, empuje y fuego.
- **Abajo del panel:** un registro de los últimos 5 s de disparos de todas las neuronas.
- **Controles:** silenciar un grupo motor (como una lesión), jugar a mano, ajustar la ganancia sináptica, activar o no la lectura adaptativa, invertir el eje del ojo, cargar otro subcircuito y volver a una red generada con reglas de cableado.

## Cómo funciona

1. **Ojos.** El juego calcula, para cada ángulo alrededor de la nave, qué tan cerca está el asteroide más próximo. Cada neurona de entrada dispara (proceso de Poisson, de 2 Hz más hasta 160 Hz) según el ángulo que le corresponde por la posición real de su columna en el ojo.
2. **Red.** Neuronas integradoras con fugas (constante de membrana 20 ms, sinapsis de 5 ms, refractario de 3 ms, paso de 2 ms, ruido de fondo). El peso de cada sinapsis es el número de sinapsis de FlyWire por una ganancia global, con signo según el neurotransmisor predicho: la acetilcolina excita; el GABA y el glutamato inhiben.
3. **Salidas.** Cuatro grupos de neuronas descendentes. La nave gira según la diferencia entre los dos grupos de giro, avanza según el de empuje y dispara según el de fuego.

## Qué es real y qué asigné yo

| Real, tal como viene de FlyWire | Asignado o simplificado por mí |
|---|---|
| Qué neuronas son y su tipo celular | Qué neuronas hacen de "ojos" y de salidas motoras |
| Con quién se conectan y con cuántas sinapsis | Que DNa02 y DNa01 giran hacia su lado, DNp09 empuja y DNp01 dispara |
| Si excitan o inhiben (neurotransmisor predicho) | El disparo: la mosca no dispara, es una asignación arbitraria |
| La posición de cada entrada en su columna del ojo | Cómo se convierte esa posición en un ángulo (ver supuestos) |
| El lado de cada neurona descendente | Modelo de neurona, ganancia sináptica ajustada a mano, sesgo de fondo, umbrales y lectura adaptativa |

## Supuestos y límites conocidos

- **Orientación del ojo.** El eje `y` de las columnas coincide con la dirección dorso-ventral del cerebro y el eje `x` con la anteroposterior (comprobado con las posiciones de los cuerpos celulares). Supuse que el quiasma óptico invierte el eje horizontal, así que `x` alto equivale al campo visual frontal. Es una suposición mía: en simulación, invertirla no cambia el rendimiento. La página trae una casilla para invertirla. Solo se usa el ángulo horizontal; la altura en el ojo no se usa.
- **Conducta.** Con este cableado la nave gira **alejándose** del lado del asteroide, es decir, reacciona como un escape. Nada en el circuito la lleva a buscar o apuntar a los asteroides.
- **Disparo.** La neurona que lo controla (DNp01) está casi saturada (unos 130 a 160 Hz) también sin estímulo, en parte por el sesgo de fondo de 0,25 que puse a las neuronas intermedias (con sesgo 0 baja a unos 43 Hz en reposo y sube a 161 Hz con estímulo). Por eso la nave dispara cerca de la mitad del tiempo sin apuntar; los aciertos son en gran parte accidentales.
- **Empuje.** DNp09 casi no dispara, así que el empuje queda en un nivel bajo y fijo.
- **Lectura adaptativa.** Con umbrales fijos, la nave disparaba siempre y casi no giraba, porque los rangos de disparo reales no son los que supuse. La lectura adaptativa mide cada grupo respecto a su actividad reciente (media y varianza móviles, constante de 8 s) y está activada por defecto. No cambia el cableado.
- **Alcance.** 2 688 de unas 139 000 neuronas. No incluye las etapas iniciales de la visión, la vía de movimiento (T4 y T5 casi no aparecen entre las entradas), ni motoneuronas, porque FlyWire cubre solo el cerebro.
- **Calibración.** Los resultados con la ganancia por defecto (0,034) son de unas simulaciones cortas (varias semillas de 60 a 150 s), no un estudio sistemático.
- Es un modelo educativo y de exploración, **no una simulación validada** del comportamiento de la mosca.

## Uso

```bash
# Abrir el juego
abre docs/index.html en el navegador

# Simular partidas sin pantalla (requiere Node.js)
node tools/simular.js data/subcircuito.json 0.034 120 3
#   FLIP=1 invierte el eje del ojo;  ADAPT=0 usa umbrales fijos

# Reconstruir docs/index.html desde src/ y data/ (requiere Python 3)
python3 tools/build.py

# Regenerar el subcircuito desde las tablas de FlyWire Codex (requiere pandas)
python3 tools/extraccion.py --connections connections_princeton.csv.gz \
  --cell-types consolidated_cell_types.csv.gz --visual visual_neuron_types.csv.gz \
  --columns column_assignment.csv.gz --classification classification.csv.gz \
  --out data/subcircuito.json
```

Para probar otro subcircuito sin reconstruir nada, usa el botón "Cargar subcircuito (.json)" de la página. Detalles del formato y de los criterios de selección en `data/README.md`.

## Estructura

```
docs/index.html      la página completa (un solo archivo, con el subcircuito incluido)
src/                 código fuente: núcleo de la red y del juego, interfaz y plantilla
data/                subcircuito.json y su descripción
tools/               extraccion.py, build.py, simular.js
```

## Datos y citas

Los datos neuronales vienen de FlyWire (versión FAFB v783) y de las tablas de FlyWire Codex. **Cita a FlyWire según las guías de citación** de la página de descargas de Codex (https://codex.flywire.ai/api/download), que incluyen las publicaciones del conectoma, de las anotaciones y de las predicciones de neurotransmisor. Revisa la licencia que FlyWire indica antes de redistribuir datos derivados. Ver `data/README.md`.

La idea de simular el cerebro de la mosca con neuronas de umbral a partir del conectoma sigue la línea de trabajos publicados con el conectoma de FlyWire; este proyecto es mucho más pequeño y simple y no reproduce ninguno de ellos.

## Cómo citar este software

Ver `CITATION.cff`. Si el repositorio está enlazado con Zenodo, añade aquí el DOI de la versión archivada:
`DOI: <se completa al publicar en Zenodo>`

## Licencia

Código: MIT (ver `LICENSE`). Datos derivados de FlyWire: según las condiciones de FlyWire.

## Créditos

Desarrollado con ayuda de Claude (Anthropic): el código del juego, de la red y de las herramientas se escribió y probó en conversación con él, y la dirección del proyecto y la obtención de los datos son del autor.
