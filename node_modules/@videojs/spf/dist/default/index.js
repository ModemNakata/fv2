import { computed, signal, snapshot, untrack, update } from "./core/signals/primitives.js";
import { createComposition, defineBehavior } from "./core/composition/create-composition.js";
import { makeShareSignals } from "./core/composition/share-signals.js";
import { effect } from "./core/signals/effect.js";
import { ConcurrentRunner, SerialRunner, Task } from "./core/tasks/task.js";
import { createMachineActor } from "./core/actors/create-machine-actor.js";
import { createTransitionActor } from "./core/actors/create-transition-actor.js";
import { createMachineReactor } from "./core/reactors/create-machine-reactor.js";
//#region src/index.ts
/**
* Stream Processing Framework (SPF) for Video.js 10
*
* The compositional primitives: createComposition, signals, tasks, actors,
* reactors. Media-domain helpers and the HLS playback engine live behind
* the `./dom` and `./hls` subpaths.
*
* @packageDocumentation
*/
const VERSION = "0.1.0";
//#endregion
export { ConcurrentRunner, SerialRunner, Task, VERSION, computed, createComposition, createMachineActor, createMachineReactor, createTransitionActor, defineBehavior, effect, makeShareSignals, signal, snapshot, untrack, update };

//# sourceMappingURL=index.js.map