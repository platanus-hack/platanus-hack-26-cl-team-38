import "server-only";
import { createProximityHub, type ProximityHub } from "./hub";

// One per process, shared by every route that uses it. On globalThis so a dev reload does not
// drop the phones that are connected.
const holder = globalThis as typeof globalThis & { proximityHub?: ProximityHub; proximityTimer?: ReturnType<typeof setInterval> };
export const proximityHub = (holder.proximityHub ??= createProximityHub());

// Deliveries twice a second: at this scale smoothness matters more than bytes. unref, so the
// timer never keeps a build or a script alive.
holder.proximityTimer ??= setInterval(() => proximityHub.tick(), 500);
holder.proximityTimer.unref?.();
