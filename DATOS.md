# Datos: `subcircuito.json`

Subcircuito extraído del conectoma de cerebro completo de *Drosophila melanogaster* de **FlyWire** (versión FAFB v783), a partir de las tablas de descarga de **FlyWire Codex**. No es el conectoma completo: son 2 688 neuronas y 40 669 conexiones entre unas 139 000 neuronas del original.

## Procedencia y condiciones de uso

- Las neuronas, sus conexiones, los neurotransmisores predichos, las anotaciones de tipos celulares y las posiciones en el ojo vienen de FlyWire. **Cita a FlyWire según sus guías de citación** (enlazadas en la página de descargas de Codex, https://codex.flywire.ai/api/download).
- **Revisa y confirma la licencia que FlyWire indica para cada tabla antes de redistribuir este archivo.** Este repositorio no asume ninguna licencia para los datos; la licencia MIT (`LICENSE`) cubre solo el código.
- Las tablas originales no están en el repositorio (ver `.gitignore`): pesan decenas de MB y deben descargarse de la fuente.

Tablas usadas (nombres de la página de descargas de Codex): conexiones filtradas (`connections_princeton`), tipos celulares consolidados, anotaciones de neuronas visuales, asignación de neuronas a columnas del ojo (`column_assignment`) y clasificación jerárquica (`classification`, para el lado de las neuronas).

## Formato (versión 2)

```json
{
  "version": 2,
  "meta": {"xmin": -9, "xmax": 8, "ymin": -29, "ymax": 30},
  "pools": ["giro izq.", "giro der.", "empuje", "fuego"],
  "nodes": [[id, rol, aux, tipo, neurotransmisor, x, y], ...],
  "edges": [origen, destino, peso, origen, destino, peso, ...]
}
```

- `nodes`: un arreglo por neurona. `id` es el `root_id` de FlyWire (texto).
- `rol`: `0` entrada (ojo), `1` intermedia, `2` salida (descendente).
- `aux`: en una entrada, el ojo (`0` izquierdo, `1` derecho). En una salida, el grupo motor (`0` giro izquierdo, `1` giro derecho, `2` empuje, `3` disparo).
- `tipo`: tipo celular (solo entradas y salidas). `x`, `y`: posición de la columna en el ojo (solo entradas).
- `edges`: lista plana de tríos. Origen y destino son posiciones en `nodes`. El peso es el número de sinapsis de FlyWire, con signo negativo si la neurona de origen es inhibidora (GABA o glutamato) y 0,5 de peso para moduladores (dopamina, serotonina, octopamina).

Detalle conocido: en los datos la octopamina aparece con el código `OCT`, y el script solo reconoce `OA`, así que las 2 neuronas con `OCT` se tratan como excitadoras normales (peso 1).

La versión 1 (sin `meta` ni posiciones `x`, `y`) también la entiende la página; en ese caso los sectores visuales se reparten al azar.

## Cómo se generó

```
python3 extraccion.py --connections connections_princeton.csv.gz \
  --cell-types consolidated_cell_types.csv.gz --visual visual_neuron_types.csv.gz \
  --columns column_assignment.csv.gz --classification classification.csv.gz \
  --out subcircuito.json
```

Criterios de selección (parámetros por defecto):

- **Entradas:** por cada ojo y cada columna, la neurona columnar que más sinapsis tiene sobre neuronas LC y LPLC, hasta 1 600. En este resultado son 1 580, casi todas de tipos T2, T2a y T3.
- **Intermedias:** hasta 1 100 neuronas, priorizando las que reciben de las entradas y proyectan a las salidas en dos saltos.
- **Salidas:** DNa02 y DNa01 (giro, según el lado), DNp09 (empuje) y DNp01 (disparo), 8 neuronas en total.
- Se descartan conexiones con menos de 5 sinapsis.
