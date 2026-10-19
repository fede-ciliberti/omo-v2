# LOOKUP.md - Multi-prefix session lookup + unknown-status mapping (spec T2)

> Design doc, no code. T5 implementa `lookup.ts` + `lookup.test.ts` contra este documento.
> Cierra la mitad spec de GAP-6 (IS-6). D10 define el algoritmo; D11/F11 son contexto.
> Regla dura: el lookup es **read-only**. Nunca reescribe los ids almacenados, nunca los
> normaliza en disco, nunca llama a `normalizeSessionId` sobre ids persistidos.

---

## 1. Problema y contrato

Hoy `getWorkForSession(directory, sessionId)` (packages/boulder-state/src/storage/read-state.ts:143)
normaliza la query con `normalizeSessionId(sessionId)` (shared.ts:12), que **default-ea a
`opencode:`** cuando la query viene bare. Resultado: una query bare nunca matchea un work
cuyos `session_ids` quedaron guardados como `codex:...` o `senpi:...`, y una query
`opencode:...` nunca matchea un work guardado bare. Drift observado (D10, F11): el agente
escribio ids bare en astro-site-kit, `opencode:` en LiteLLM, y el SKILL.md le indicaba
`codex:`.

Este modulo reemplaza ese lookup por una busqueda de **formas candidatas** contra los ids
tal como estan guardados, sin reescribirlos.

Contrato de la funcion (T5):

```
findWorkForSessionId(state: BoulderState, sessionId: string): BoulderWorkState | null
```

- `state` es un `BoulderState` ya leido (no un directory). El gate lo obtiene via
  `readBoulderStateDetailed` (T9) y le pasa el state, o `null` se maneja antes de llamar.
- `sessionId` es el id crudo tal como llega en el evento (`session.execution.succeeded`),
  que puede venir bare o con prefijo de cualquier harness.
- Devuelve el `BoulderWorkState` matcheado, o `null` si no hay ningun work.
- `null` (miss) es un **skip silencioso** para el caller (el gate T8 lo trata como
  "esta sesion no pertenece a ningun work", que es el caso comun con el flag encendido).
  El lookup no loguea un miss.

Funciones helper que este modulo define o reusa (equivalente exacto a boulder-state, no se
importa `normalizeSessionId`):

```
SESSION_ID_PREFIX_PATTERN = /^(codex|opencode|senpi):/     // equivalente a shared.ts:10
stripKnownPrefix(id) = id.replace(SESSION_ID_PREFIX_PATTERN, "")   // stripSessionPlatform, shared.ts:20
KNOWN_PREFIXES = ["opencode", "codex", "senpi"]            // conjunto CERRADO
```

Nota: si `sessionId` trae un prefijo desconocido (ej. `foo:ses_X`), `stripKnownPrefix` lo
deja intacto (solo recorta los tres conocidos). Eso es correcto: no inventamos prefijos.

---

## 2. Algoritmo exacto (pseudocode)

```
function findWorkForSessionId(state, sessionId):
    // 1. Formas candidatas de la QUERY, ordenadas por preferencia.
    //    rank 0 = opencode:  (preferida)
    //    rank 1 = bare
    //    rank 2 = codex:
    //    rank 3 = senpi:
    bare = stripKnownPrefix(sessionId)
    candidates = [
        { form: "opencode:" + bare, rank: 0 },
        { form: bare,               rank: 1 },
        { form: "codex:" + bare,    rank: 2 },
        { form: "senpi:" + bare,    rank: 3 },
    ]
    candidates = dedupeByValueKeepingLowestRank(candidates)

    // 2. Buscar en los works. Un work matchea si alguno de sus session_ids
    //    (comparados LITERALMENTE, sin normalizar) es igual a alguna forma candidata.
    works = getBoulderWorks(state)          // boulder-state, ya soporta legacy single-work
    matches = []
    for work in works:
        bestRank = null
        for { form, rank } in candidates:
            if work.session_ids includes form:
                bestRank = min(bestRank, rank)     // menor rank = mejor
        if bestRank != null:
            matches.push({ work, rank: bestRank })

    // 3. Sin matches de works: fallback al espejo raiz.
    if matches is empty:
        for { form } in candidates:
            if state.session_ids includes form:
                return buildWorkFromMirror(state)   // unico, no puede haber colision
        return null                                 // miss silencioso

    // 4. Un solo match: devolverlo.
    if matches.length == 1:
        return matches[0].work

    // 5. Colision: ordenar por (rank asc, updatedAt desc) y elegir el primero.
    matches.sortBy(match =>
        [match.rank, -toMs(match.work.updated_at ?? match.work.started_at)])
    winner = matches[0]
    logCollision(sessionId, matches.map(m => m.work.work_id), winner.work.work_id)
    return winner.work
```

Detalles de la resolucion de colision (paso 5):

- **Preferencia primaria por forma**: gana el work que matcheo con el rank mas bajo
  (`opencode:` > bare > `codex:` > `senpi:`). Es la regla pedida por D10.
- **Desempate**: si dos works empatan en rank (por ejemplo, dos works guardan ambos
  `opencode:ses_X`), gana el de `updated_at` mas nuevo (`updated_at ?? started_at`). Es el
  mismo criterio que el `getWorkForSession` actual (read-state.ts:158-162), para no
  introducir una semantica nueva donde ya habia una.
- La colision se **loguea** (ver seccion 5) pero nunca es un error fatal: el lookup siempre
  devuelve un work o `null`.

`buildWorkFromMirror` y `getBoulderWorks` son de boulder-state (shared.ts:64, read-state.ts
via index). El mirror solo se consulta si ningun work matcheo, asi no compite con los works
por la preferencia.

### 2.1 Por que NO se usa `normalizeSessionId`

`normalizeSessionId` tiene dos efectos indeseados para este lookup: (a) default-ea la query
bare a `opencode:`, rompiendo el match contra works guardados bare/codex:/senpi:; (b) esta
pensada para **escribir** ids, no para leerlos. El lookup compara formas candidatas contra
lo guardado y no toca el state.

---

## 3. Mapeo de status desconocido

```
isContinuableStatus(status: unknown): boolean
    return status === "active" || status === "paused"
```

El union cerrado de `BoulderWorkStatus` es `"active" | "completed" | "paused" | "abandoned"`
(types.ts:20). `status` es opcional en `BoulderWorkState` (types.ts:27), asi que `undefined`
tambien es posible. `isContinuableStatus` es **true solo para `active` y `paused`**.

Tabla completa (cualquier valor fuera del union conocido → NO continuable):

| `status` | dentro del union `BoulderWorkStatus` | `isContinuableStatus` | comportamiento | log |
| --- | --- | --- | --- | --- |
| `active` | si | `true` | continuar | ninguno |
| `paused` | si | `true` | continuar (work demoted por stale reconcile; al reanudar vuelve a `active`) | ninguno |
| `completed` | si | `false` | skip; parada legitima | ninguno (silencioso) |
| `abandoned` | si | `false` | skip; parada legitima | ninguno (silencioso) |
| `awaiting-user-ok` | **no** (status inventado) | `false` | skip | **warn** (ver 5.3) |
| `undefined` (campo ausente) | n/a (opcional) | `false` | skip | **warn** (status desconocido) |
| cualquier otro string | no | `false` | skip | **warn** (status desconocido) |

Regla: `completed` y `abandoned` son terminales **conocidos** y se saltean en silencio. Todo
lo que **no** sea un miembro del union (incluido `awaiting-user-ok` y `undefined`) se saltea
**con warn**, porque un status inventado por el agente no debe manejar continuacion y ademas
queremos verlo en el log. `awaiting-user-ok` se nombra explicitamente: el agente lo invento
(no esta en el union) y el contrato es skip-with-log, nunca continuar.

---

## 4. Diagnostico absent-vs-corrupt de la lectura (T9, consumido por el gate)

`readBoulderState` actual (read-state.ts:8-33) devuelve `null` tanto para archivo ausente
como para archivo corrupto, indistinguible. T9 agrega
`readBoulderStateDetailed(directory): { status: "ok" | "absent" | "corrupt", state?, error? }`
y el gate lo usa. Este documento fija las cadenas de log exactas.

### 4.1 Ausente (`existsSync(filePath) === false`)

Comportamiento: devolver `{ status: "absent" }` y `null` como state, **sin emitir warning**
(contrato silencioso: la mayoria de los proyectos no tienen boulder). No hay log de nivel
warn. Para completitud, la unica linea asociada (nivel debug, NO emitida por defecto) es:

```
[boulder-state] readBoulderState: no state file at ${filePath}
```

### 4.2 Corrupto (el parseo o la validacion tira excepcion, o el payload es invalido)

Comportamiento: devolver `{ status: "corrupt", error }` y `null` como state, y emitir
**una** linea de warning estructurada con el path y la clase de error:

```
[boulder-state] readBoulderState: corrupt state at ${filePath} (${errorName}: ${errorMessage}) - returning null
```

Placeholders:

- `${filePath}` = `getBoulderFilePath(directory)` (path.ts:7), el path absoluto o relativo
  tal como se compuso.
- `${errorName}` = `error.constructor.name` (o `"ValidationError"` si el payload parso pero
  `normalizeState` lo rechazo, ej. `{}` vacio, array, no-objeto, ver read-state.ts:17-19).
- `${errorMessage}` = `error.message`.

El warning se emite **una sola vez por lectura** (no por work). El gate trata `corrupt` como
skip + log, cero synthetic (escenario de T12).

---

## 5. Cadenas de log literales (todo lo que este modulo puede loguear)

Todas las lineas del modulo de continuacion usan el prefijo `[OMC] boulder-continuation:`
(consistente con `[OMC] v2 ...` de index.ts). Las de la lectura viven en el paquete
boulder-state y usan `[boulder-state]` (seccion 4).

### 5.1 Colision de lookup (seccion 2, paso 5)

```
[OMC] boulder-continuation: session lookup collision for ${sessionId}: matched work_ids=[${workIds}] chosen work_id=${chosenWorkId} (preference opencode: > bare > codex: > senpi:)
```

`${workIds}` = los `work_id` de todos los matches, separados por coma, en el orden ya
ordenado por `(rank asc, updatedAt desc)`.

### 5.2 Miss de lookup

Sin log. `findWorkForSessionId` devuelve `null` en silencio. (El gate T8 documenta el miss
como skip silencioso, no warn.)

### 5.3 Status desconocido (seccion 3)

```
[OMC] boulder-continuation: unknown work status "${status}" for work_id=${workId} - not continuable, skipping
```

Se emite para todo status que no sea miembro del union (incluye `awaiting-user-ok` y
`undefined`; para `undefined` el `${status}` sale como `undefined`). NO se emite para
`completed` ni `abandoned`.

---

## 6. Fixtures obligatorios (T5)

La sesion de la query es `ses_X` (el id que llega en el evento). El work almacenado guarda
el id en la forma de la columna "stored". Todos deben matchear el mismo work W.

| # | stored `session_ids` de W | query `sessionId` | forma candidata que matchea | rank | resultado |
| --- | --- | --- | --- | --- | --- |
| 1 | `ses_X` (bare) | `ses_X` | bare | 1 | match W |
| 2 | `opencode:ses_X` | `ses_X` | `opencode:ses_X` | 0 | match W |
| 3 | `codex:ses_X` | `ses_X` | `codex:ses_X` | 2 | match W |
| 4 | `senpi:ses_X` | `ses_X` | `senpi:ses_X` | 3 | match W |
| 5 | `ses_X` (bare) | `opencode:ses_X` | bare | 1 | match W (cross-query: query prefijada contra stored bare) |

Fixtures de colision y de status:

| # | escenario | esperado |
| --- | --- | --- |
| 6 | W1 guarda `opencode:ses_X`, W2 guarda `ses_X`; query `ses_X` | devuelve W1 (rank 0 gana a rank 1) + log 5.1 |
| 7 | W1 y W2 guardan ambos `opencode:ses_X`; query `ses_X` | devuelve el de `updated_at` mas nuevo + log 5.1 |
| 8 | W guarda `ses_X` con `status: "awaiting-user-ok"`; query `ses_X` | lookup devuelve W; `isContinuableStatus("awaiting-user-ok") === false`; caller emite log 5.3 |
| 9 | W guarda `ses_X` con `status: undefined`; query `ses_X` | lookup devuelve W; `isContinuableStatus(undefined) === false`; caller emite log 5.3 |
| 10 | ningun work guarda `ses_X` ni variantes; query `ses_X` | `null`, sin log |
| 11 | archivo ausente / corrupto | `readBoulderStateDetailed` = `absent` (sin warn) / `corrupt` (warn 4.2) |

---

## 7. Criterios de aceptacion (para T5)

Un reviewer debe poder implementar `lookup.ts` desde este documento sin ambiguedad. El test
`lookup.test.ts` (bun:test, given/when/then) debe cubrir:

- Los 4 prefijos de la seccion 6 (bare / `opencode:` / `codex:` / `senpi:`) matchean.
- La colision (fixtures 6 y 7) elige segun la preferencia y loguea.
- `isContinuableStatus` es `true` solo para `active` y `paused`, y `false` para
  `completed`, `abandoned`, `awaiting-user-ok`, `undefined` y un string arbitrario.
- El lookup nunca muta `state` (assert de deep-equality antes/despues).
- Un miss devuelve `null` sin log.

Escenario de falla (mutation test de T5): borrar el fallback bare-suffix y confirmar que el
fixture #1 (stored bare, query bare) se pone rojo; confirmar que el fixture #3 (stored
`codex:`) tambien se pone rojo sin la forma `codex:` en el set candidato.

---

## 8. Fuera de alcance

- No reescribe ids almacenados ni los normaliza en disco.
- No define la preferencia para prefijos desconocidos: si `sessionId` trae `foo:ses_X`, el
  `bare` resultante es `foo:ses_X` y las candidatas son `opencode:foo:ses_X`, `foo:ses_X`,
  `codex:foo:ses_X`, `senpi:foo:ses_X` (matchea solo si algo se guardo asi, poco probable).
- No decide el orden de gates del evento (eso es T8): aca solo se fija el lookup y el mapeo
  de status.
