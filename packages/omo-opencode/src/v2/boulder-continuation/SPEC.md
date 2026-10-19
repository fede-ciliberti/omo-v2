# SPEC: estado por work, firma de progreso y parametros de guarda

Documento de diseno del modulo `boulder-continuation` (V2). No contiene codigo ni tests.
Es la fuente de verdad que T4 (firma + contadores) y T6 (guardas) implementan.

Este documento es autocontenido para T4 y T6: un revisor debe poder escribir
`signature.ts` y `guards.ts` leyendo solo este archivo mas los tipos de
`@oh-my-opencode/boulder-state`.

## 0. Glosario minimo

- **work**: una entrada de `BoulderState.works[work_id]` (`BoulderWorkState`). Una
  unidad de trabajo con su propio plan, sus propias sesiones y su propio status.
- **steer**: una inyeccion de continuacion via `ctx.session.synthetic` con
  `delivery: "steer"`. Cada steer equivale a un turno completo de modelo.
- **turn-end**: la llegada del evento durable `session.execution.succeeded`.
- **continuable**: un work cuyo status permite continuar (ver `LOOKUP.md`; el
  conjunto cerrado es `active | paused`).
- **checklist**: el resultado de `getPlanChecklist(planPath)` de
  `@oh-my-opencode/boulder-state`, con la forma `PlanChecklist`
  (`total`, `completed`, `remaining`, `nextTaskLabel`).

---

## 1. Modelo de estado por work y contadores

### 1.1 Tipo

Cada `work_id` tiene una entrada de estado. El tipo logico (sin codigo) es:

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `steers_total` | number (entero >= 0) | Cantidad acumulada de steers admitidos para este work desde que arranco. Es el contador del cap duro. |
| `consecutive_no_progress` | number (entero >= 0) | Cantidad de steers consecutivos con la MISMA firma de progreso. Alimenta el stop por no-progreso. |
| `prompt_failures` | number (entero >= 0) | Cantidad consecutiva de fallos de inyeccion (el `session.synthetic` no llega a admitirse). Alimenta el backoff. |
| `last_failure_at` | timestamp (ms) o null | Momento del ultimo fallo de inyeccion. Junto con `prompt_failures` define si el backoff esta activo. |
| `last_injected_at` | timestamp (ms) o null | Momento del ultimo steer admitido. Alimenta el cooldown. |
| `disarmed` | boolean (flag) | `true` cuando el usuario emitio una frase de stop (D11). Un work desarmado no se continua. |
| `signature` | string o null | Ultima firma de progreso observada al inyectar. Es la referencia contra la que se compara la firma nueva para el stop por no-progreso. |

`signature` se guarda como string (ver seccion 2), no como tupla, para que la
comparacion sea una igualdad de strings y el estado sea serializable sin
ambiguedad.

### 1.2 Transiciones puras

Todas las transiciones son funciones puras: reciben el estado actual y devuelven
el estado nuevo. No leen reloj global; `now` (ms) entra por parametro. Esto es
requisito de T4 y T6 (los tests pasan `now` explicitamente).

**recordSteer(state, newSignature, now)**
Se llama exactamente cuando un steer fue admitido (el `session.synthetic`
devolvio un id). Efectos:
- `steers_total += 1`
- `last_injected_at = now`
- Si `newSignature === state.signature` (misma firma): `consecutive_no_progress += 1`.
- Si `newSignature !== state.signature`: `consecutive_no_progress = 0` y
  `signature = newSignature`.
- Si `signature` era `null` (primer steer): se setea `signature = newSignature`
  y `consecutive_no_progress = 0`.
- `prompt_failures` NO se toca (un steer admitido no es un fallo).
- `last_failure_at` NO se toca.
- `disarmed` NO se toca.

**recordFailure(state, now)**
Se llama cuando el intento de inyeccion falla (el `session.synthetic` rechaza o
lanza). Efectos:
- `prompt_failures += 1`
- `last_failure_at = now`
- `steers_total` NO se incrementa (un fallo no consume cap; no hubo turno de
  modelo).
- `consecutive_no_progress` y `signature` NO se tocan.
- `last_injected_at` NO se toca.

**resetOnProgress(state)**
Se llama cuando se detecta progreso real del plan entre dos turn-ends: la
checklist cambio (el conjunto `(completed, total)` es distinto al de la firma
guardada). Efectos:
- `consecutive_no_progress = 0`
- `signature = <firma nueva>`
- `steers_total` NO se resetea (el cap es absoluto por work, ver D6).
- `prompt_failures` y `last_failure_at` NO se tocan (el progreso del plan no
  tiene relacion con fallos de inyeccion).
- `disarmed` NO se toca: el progreso del plan SI re-arma (ver 1.3 y D11), pero
  eso ocurre en el gate, no dentro de `resetOnProgress`. El gate decide el
  re-arm comparando la firma; `resetOnProgress` solo limpia el contador de
  no-progreso.

**disarm(state)**
Se llama cuando el detector de frase de stop matchea la primera frase del
usuario (D11). Efectos:
- `disarmed = true`.
- Ningun otro campo cambia. En particular `steers_total` NO se resetea y
  `consecutive_no_progress` NO se resetea (el desarme no perdona el cap ya
  consumido, solo suspende la continuacion).

**rearm(state)**
Se llama cuando el usuario emite una frase de re-arm (D11) o cuando la firma de
progreso del plan cambia respecto de la guardada. Efectos:
- `disarmed = false`.
- Ningun otro campo cambia.

### 1.3 Reglas de reset de cada contador (resumen normativo)

| Contador | Se incrementa en | Se resetea en | NO se resetea en |
| --- | --- | --- | --- |
| `steers_total` | `recordSteer` | Nunca (cap absoluto por work, D6) | progreso, desarme, fallos, restart |
| `consecutive_no_progress` | `recordSteer` (firma igual) | `recordSteer` (firma distinta), `resetOnProgress` | fallos, desarme |
| `prompt_failures` | `recordFailure` | Steer admitido (reset implicito: al admitir, el gate limpia fallos) o fin de backoff (D7) | progreso, desarme |
| `last_failure_at` | `recordFailure` | Nunca se limpia explicitamente; se compara contra `now` | n/a |
| `last_injected_at` | `recordSteer` | Nunca se limpia; se compara contra `now` para el cooldown | n/a |
| `disarmed` | `disarm` | `rearm` (frase o cambio de firma) | nada mas |
| `signature` | `recordSteer` (firma distinta) / `resetOnProgress` | Nunca se limpia a null una vez seteada | n/a |

Nota de implementacion para T4: "el gate limpia `prompt_failures` al admitir un
steer" significa que el efecto combinado de un steer exitoso es
`prompt_failures = 0` y `last_failure_at` queda como esta. La funcion
`recordSteer` documentada en 1.2 no toca `prompt_failures` por si sola; el gate
aplica el reset de fallos al confirmar la admision. T4 debe exponer una funcion
`resetFailuresOnAdmission(state)` (o equivalente) para no mezclar
responsabilidades. El punto normativo es: un steer admitido reinicia la racha de
fallos.

### 1.4 Duracion

Los contadores son durables: sobreviven a un restart del proceso host. El
backend (ctx.storage vs archivo) lo resuelve T13; este documento fija el
contrato (los valores deben leerse identicos pre y post restart), no el backend.
Un restart NO resetea ningun contador (D12 criterio 5).

---

## 2. Firma de progreso

### 2.1 Forma exacta

La firma es la tupla `(work_id, completed, total)`:

- `work_id`: el id del work (clave en `BoulderState.works`).
- `completed`: `PlanChecklist.completed` de `getPlanChecklist(planPath)`.
- `total`: `PlanChecklist.total` de `getPlanChecklist(planPath)`.

Forma string canonica: `"<work_id>:<completed>/<total>"`.
Ejemplo: `"wk_1a2b:3/9"`.

### 2.2 `updated_at` EXCLUIDO (D4)

La firma NO incluye `updated_at` de `BoulderState` ni de `BoulderWorkState`. El
motivo es normativo:

- `updated_at` lo escribe el agente en cada transicion, y el agente escribe su
  propio boulder state durante el run. Cada steer provoca actividad del agente,
  que reescribe `updated_at`.
- Si `updated_at` entrara en la firma, dos turn-ends consecutivos SIN progreso
  real del plan tendrian firmas distintas (porque `updated_at` cambio), y el
  stop por no-progreso (D5) nunca dispararia: el dedupe nunca coincidiria.
- La firma debe medir PROGRESO DEL PLAN, y el unico progreso que importa es
  cuantas tareas del checklist se cerraron. `updated_at` mide actividad, no
  progreso.

`remaining` tampoco entra en la firma porque es funcion de `completed` y `total`
(`remaining = total - completed - in_progress`, ver `[~]` abajo), asi que
incluirlo seria redundante. La firma usa la pareja `(completed, total)`.

### 2.3 Semantica de `[~]` (in-progress)

`getPlanChecklist` cuenta `[x]` como `completed`, `[ ]` como `remaining`, y
`[~]` (in-progress / blocked) hacia `total` pero en ninguno de `completed` ni
`remaining` (`packages/boulder-state/src/plan-checklist.ts`, `parseCheckboxStatus`
y el loop de conteo). Consecuencia para la firma: un plan donde todas las tareas
abiertas pasan a `[~]` conserva `completed` y `total` iguales, pero su
`remaining` cae a 0, y el gate lo trata como terminado (no continuable), no como
"sin progreso". Esto es correcto por D8: el hook nunca escribe checkboxes; el
agente marca `[~]` cuando espera input externo.

### 2.4 Contrato para T4

`progressSignature(work_id, checklist)` devuelve el string de 2.1. El test debe
incluir una asercion de que la salida NO contiene un patron de fecha ISO
(regression contra la reincorporacion accidental de `updated_at`), y una
asercion de que dos checklists con `updated_at` distinto pero mismo
`(completed, total)` producen la MISMA firma.

---

## 3. Parametros de guarda

Todos los valores tienen valor, base y decision asociada. Las guardas son puras
(reciben `now`), y el gate (T8) las evalua en un orden TOTAL fijo.

### 3.1 Cap duro: 30 steers por work (D6, D13)

- **Valor**: `steers_total >= 30` implica stop para ese work.
- **Base**: la peor necesidad manual observada fue de 7 nudges (sesion atlas del
  16-oct). 30 es aproximadamente 4x lo observado, con margen amplio. La cota
  extrinsica de costo es 30 steers x 1 turno de modelo cada uno = 30 turnos
  como maximo absoluto por work.
- **Decision**: D6 (cap 30/work durable, sin reset intra-work) y D13 (el cap es
  por work, compartido entre sesiones padre e hijas, ver seccion 4).
- **No se resetea** dentro del work: ni por progreso, ni por desarme, ni por
  restart. El cap es la ultima linea de defensa contra un loop infinito.

### 3.2 Cooldown: 5 segundos (D7)

- **Valor**: si `last_injected_at != null` y `now - last_injected_at < 5000 ms`,
  el steer se posterga.
- **Base**: proteccion anti-rafaga, incluyendo replays de reconexion (una
  reconexion del stream puede reentregar eventos de turn-end cercanos). 5s es
  el valor heredado de las constantes de idle de V1, validado por QA viva.
- **Decision**: D7.
- **Interaccion con el SLA**: 10s = 5s de cooldown + 5s de debounce (peor caso) +
  admision (IS-1).

### 3.3 Stop por no-progreso: 2 steers consecutivos con firma identica (D5)

- **Valor**: si `consecutive_no_progress >= 2`, stop para ese work (hasta que la
  firma cambie, ver 1.3).
- **Base**: cada steer quema un turno completo de modelo; dos steers sin que
  cambie `(completed, total)` indican que el agente no esta avanzando el plan
  (esta atascado o repitiendo). El corte en 2 es el minimo que distingue un
  turno lento legitimo de un loop.
- **Decision**: D5.
- **Interaccion**: el umbral se evalua sobre `consecutive_no_progress` DESPUES
  de `recordSteer`. Es decir, el segundo steer con la misma firma se admite y
  recien el tercero se bloquea, o el gate bloquea al detectar que el proximo
  seria el segundo? El contrato de T6 es: `shouldStopOnNoProgress(n)` devuelve
  `true` cuando `n >= 2`, y el gate lo consulta ANTES de inyectar, con `n` ya
  actualizado por el ultimo `recordSteer`. Resultado observable: un agente que
  nunca toca el plan recibe 2 steers y el conteo se detiene (D12 criterio 2:
  "converge to 2").

### 3.4 Backoff por fallos: 10 fallos consecutivos, 5 minutos, luego reset (D7)

- **Valor**: si `prompt_failures >= 10` y `now - last_failure_at < 300000 ms`,
  stop para ese work (backoff activo). Al cumplirse los 5 minutos, el backoff
  expira y el contador de fallos se resetea a 0 (reset al expirar, no al
  admitir).
- **Base**: cubre el caso de un endpoint de inyeccion caido o saturado. 10
  fallos consecutivos distinguen una caida real de un fallo transitorio aislado.
  Los 5 minutos dan tiempo a que la causa se recupere sin abandonar el work para
  siempre. Valor heredado de las constantes de idle de V1.
- **Decision**: D7.
- **Reset**: el contador `prompt_failures` se limpia (a) al admitir un steer
  (1.3) o (b) al expirar la ventana de 5 minutos. `last_failure_at` no se limpia
  (se compara contra `now`).

### 3.5 Debounce: ventana de 3 a 5 segundos (D7)

- **Valor**: al recibir `session.execution.succeeded`, el gate no inyecta de
  inmediato: arma un debounce de 3 a 5 segundos (el valor exacto dentro de la
  banda lo fija la implementacion de T8; 5s es el peor caso del SLA).
- **Base**: ventana de supremacia del usuario (IS-3). Un delay de 5s solo no
  alcanza para dar supremacia; la supremacia la da el cancel-on-user-activity,
  no el delay.
- **Decision**: D7 (debounce 3-5s con cancel on user activity o
  `execution.started`).
- **Conjunto EXACTO de triggers de cancelacion** (cualquier actividad originada
  por el usuario cancela el steer pendiente):
  - `session.inbox.delivered`
  - `session.inbox.enqueued`
  - `session.execution.started`
  - `tui.prompt.append`
- **Regla**: si cualquiera de estos cuatro eventos llega entre el armado del
  debounce y su disparo, el steer pendiente se cancela y no se inyecta (cero
  synthetic). El cooldown y el debounce son mecanismos distintos: el cooldown
  posterga despues de un steer previo; el debounce espera antes del primero y se
  cancela con actividad del usuario.
- **Nombres de evento**: tomados de `packages/omo-opencode/src/v2/client-events.ts`
  (`V2_EVENT_NAMES`), todos presentes en el catalogo V2 2.0.20.

### 3.6 Tabla resumen de parametros

| Parametro | Valor | Base | Decision |
| --- | --- | --- | --- |
| cap | 30 steers/work, absoluto, compartido | ~4x la peor necesidad observada (7 nudges); cota de costo 30 x 1 turno | D6, D13 |
| cooldown | 5 s | anti-rafaga + replays de reconexion | D7 |
| no-progress stop | 2 steers consecutivos con firma identica | cada steer = 1 turno; 2 distingue lento de loop | D5 |
| backoff | 10 fallos -> 5 min -> reset | distingue caida real de fallo transitorio | D7 |
| debounce | 3-5 s | ventana de supremacia del usuario | D7 |
| cancel triggers | `session.inbox.delivered`, `session.inbox.enqueued`, `session.execution.started`, `tui.prompt.append` | cualquier actividad del usuario cancela | D7 |

### 3.7 Orden de evaluacion en el gate (contrato para T6/T8)

El gate evalua las guardas en este orden TOTAL, y cada skip registra su motivo:

1. stop-phrase / disarmed (D11): si `disarmed`, skip sin consumir cap.
2. marcador de bloqueo externo (T7): si el ultimo mensaje del asistente arranca
   con `<ulw-execute-blocked-external>` + texto, skip.
3. valvula de presion de contexto (T7): si hay senal de contexto agotado, skip.
4. firma ya vista / no-progreso (`shouldStopOnNoProgress`): si
   `consecutive_no_progress >= 2`, skip.
5. cooldown (`cooldownActive`): si `now - last_injected_at < 5000`, postergar.
6. cap (`steers_total >= 30`): si se alcanzo, skip.
7. backoff (`prompt_failures >= 10 && now - last_failure_at < 300000`): skip.

Este orden lo consume T8; T4/T6 solo exponen las funciones puras. La seccion se
incluye aca porque T6 debe exponer exactamente las funciones que el orden
requiere.

---

## 4. Cap compartido por work entre sesiones padre e hijas (D13)

El cap y los contadores son **por work**, no por sesion. Un work tiene un
conjunto de `session_ids` (sesiones padre e hijas que corren ese plan). Todas
ellas comparten la misma entrada de contadores (`boulder-continuation/<work_id>`).

- Los eventos `session.execution.succeeded` llegan tanto para la sesion padre
  como para las hijas (precedente: `orchestration.ts:522-560` matchea sesiones
  hijas por `sessionID`). Todas resuelven, via `findWorkForSessionId`, al mismo
  `work_id`.
- Por lo tanto `steers_total`, `consecutive_no_progress`, `prompt_failures`,
  `last_failure_at`, `last_injected_at`, `disarmed` y `signature` son unicos por
  work y se comparten entre todas sus sesiones.
- Consecuencia: N sesiones hijas del mismo work NO multiplican el cap; el
  presupuesto de 30 steers cubre al work completo, no a cada sesion.
- Base: la escala real (un work puede tener varias sesiones por delegacion de
  tareas) exige que el limite sea por unidad de trabajo, no por sesion; si no,
  un work con 5 sesiones tendria 150 steers potenciales.
- Decision: D13.

---

## 5. Nota de peor costo

El peor caso de gasto de continuacion para un work es **30 steers x 1 turno de
modelo cada uno = 30 turnos de modelo**, mas el costo de los turnos que el
propio agente produce al ejecutar. Esta cota es absoluta por work (D6) y no
puede superarse ni con progreso, ni con desarme, ni con restart, porque
`steers_total` nunca se resetea (1.3). El cooldown y el backoff acotan la
velocidad (no el total); el stop por no-progreso acota el caso patologico mucho
antes de los 30 (a 2 steers sin progreso).

---

## 6. Guia de implementacion para T4 y T6

### T4 (`signature.ts` + `signature.test.ts`)

Debe exponer:
- `progressSignature(work_id: string, checklist: PlanChecklist): string` segun 2.1.
- El tipo de estado por work con los siete campos de 1.1.
- Transiciones puras `recordSteer(state, signature, now)`,
  `recordFailure(state, now)`, `resetOnProgress(state)`, `disarm(state)`,
  `rearm(state)`, `resetFailuresOnAdmission(state)` segun 1.2 y 1.3.
- Predicados de guarda `shouldStopOnCap(state)` (`steers_total >= 30`) y
  `shouldStopOnBackoff(state, now)` (`prompt_failures >= 10 &&
  now - last_failure_at < 300000`).

Tests obligatorios: firma sin fecha ISO; dos checklists con distinto
`updated_at` y mismo `(completed, total)` dan firma identica; `recordSteer` en el
cap devuelve stop.

### T6 (`guards.ts` + `guards.test.ts`)

Debe exponer:
- `shouldStopOnNoProgress(consecutive_no_progress)` (`>= 2`), 3.3.
- `cooldownActive(last_injected_at, now)` (`now - last < 5000`), 3.2.
- `debounceArmed(...)` con el conjunto de cancelacion de 3.5.
- `matchesStopPhrase(firstUserMessage)` y `matchesRearmPhrase(...)`, seccion 5.
- `shouldStopOnBackoff` puede vivir en T4 o T6; el contrato es que exista una
  unica funcion pura y ambos tests la cubran.

Sin timers dentro de las funciones puras: `now` entra por parametro. Sin
suscripcion a eventos en T6 (eso es T8).

---

## 7. Desarme por frase de stop (D11)

### 7.1 Detector de stop

Se evalua sobre el PRIMER mensaje del usuario (whole-message anchored), con la
regex:

```
/^(stop|no sigas|par[áa]|pare|detenete|detente|alto|basta)[\s!¡.,;:]*$/imu
```

- Anclada al inicio (`^`) y al fin (`$`): el mensaje entero debe ser la frase
  (mas puntuacion/espacios finales). Por eso `para`/`alto` como inicio de oracion
  NO matchean: "Para resolver esto hay que..." y "Alto consumo de memoria..."
  quedan fuera por el ancla `$`.
- `[áa]` cubre la forma voseo "Pará" y la forma "para".
- Flag `u` para que las clases de caracteres no sufran el bug ASCII de `\b`;
  flag `i` para case-insensitive; flag `m` para multilinea.
- Al matchear: `disarm(work)` y cancelar cualquier steer pendiente del debounce.

### 7.2 Frase de re-arm

```
/^(continua|continuá|seguí|reanuda|reanudá|resume)[\s!¡.,;:]*$/imu
```

Al matchear: `rearm(work)`. Tambien se re-arma cuando la firma de progreso del
plan cambia respecto de la guardada (el plan se movio; el usuario no esta
pidiendo pausa).

### 7.3 Efecto del desarme

- Un work desarmado no recibe steers.
- Un skip por desarme NO consume cap ni incrementa ningun contador (ni
  `steers_total`, ni `consecutive_no_progress`, ni `prompt_failures`).
- El desarme persiste hasta re-arm explicito o cambio de firma del plan.

### 7.4 Cableado obligatorio (nota para T8)

T6 provee el detector puro; T8 DEBE cablearlo: en cada turn-end, leer los
mensajes de usuario posteriores al ultimo steer, correr `matchesStopPhrase` y
`matchesRearmPhrase`, y setear/limpiar `disarmed`. Sin ese paso, el detector es
codigo muerto (bloqueante B1 de la revision round-1).
