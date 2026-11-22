# Motor de proximidad

Dice quién está dentro del radio de quién mientras la gente se mueve, a partir del GPS que reporta cada teléfono. La ruta es `src/app/api/proximity/route.ts` y el teléfono lo usa en Explorar (`src/app/(phone)/_lib/proximity.ts`). Viene del experimento 7 de `nodos-lab`, donde se midió y se auditó.

## Qué promete y qué no

- **Sí:** avisar rápido quién está en rango. Un cambio llega al otro teléfono en la entrega siguiente (medio segundo).
- **No:** decir a cuántos metros está alguien bajo techo. El GPS de un teléfono dentro de un edificio declaró ±14 a ±25 m en nuestras pruebas, y dos teléfonos en el mismo punto se miden a 24 m de distancia en la mediana (simulado con ese error). Por eso el motor agranda el radio según la precisión de ambos: con ±20 m, "radio 25 m" significa "hasta unos 100 m".
- **No** es peer-to-peer: cada teléfono habla con el servidor.
- **No** funciona con la página en segundo plano o el teléfono bloqueado: el navegador no entrega ubicación ahí.

## Piezas

| Archivo | Qué es | Dónde corre |
|---|---|---|
| `engine.ts` | `createProximityEngine()`: `join`, `update`, `heartbeat`, `leave`, `subscribe`, `flush`, `sweep`. Sin dependencias. | Servidor |
| `hub.ts` | `createProximityHub()`: un motor por sala y las sesiones de los teléfonos. Valida todo lo que entra con los esquemas de `src/lib/types.ts`. | Servidor |
| `server.ts` | `proximityHub`: el hub único del proceso, con su reloj de entregas. | Servidor |
| `reporter.ts` | `createReporter()`: decide con cada lectura del GPS si vale la pena reportar, y filtra por precisión. | Teléfono |

## Cómo conectarlo

El hub no sabe de transporte. Una ruta solo llama a cuatro funciones:

1. **Entrar.** `proximityHub.join({ roomId, personId, displayName, radius })` devuelve `{ session }` o `null`. `session` es el secreto de ese teléfono para todo lo demás.
2. **Escuchar.** `proximityHub.listen(session, send)` entrega cada `ProximityUpdate` a `send` y devuelve la función para dejar de escuchar. Hay que llamarla cuando se corta la conexión.
3. **Reportar.** `proximityHub.report(session, { lat, lon, accuracy, stamp })`. Sin posición nueva, `proximityHub.heartbeat(session)` cada 30 s.
4. **Salir.** `proximityHub.leave(session)`.

Las rutas de Next no sostienen WebSockets. Lo natural aquí es un `GET` con Server-Sent Events para escuchar y `POST` para lo demás; en el experimento ese par costó el doble de bytes que un WebSocket (9,8 contra 5,0 KB por minuto y teléfono), que a esta escala no importa.

En el teléfono:

```ts
const report = createReporter();
navigator.geolocation.watchPosition((p) => {
  const result = report([p.coords.latitude, p.coords.longitude], p.coords.accuracy, performance.now());
  // result es una posición (mandarla con un `stamp` propio y guardarla bajo ese stamp),
  // "heartbeat" (avisar que sigue ahí) o null (no gastar red).
}, onError, { enableHighAccuracy: true });
```

Cada `ProximityUpdate` trae `anchor`: el `stamp` del reporte del propio teléfono sobre el que se calcularon las distancias. Para dibujar, el teléfono resta lo que se movió desde esa posición (`displacement(posiciónDelAnchor, report.estimate)`); así un radar sigue cada lectura del GPS sin pedirle nada al servidor. Si `distance` es menor que dos veces `uncertainty`, no se distingue de cero: conviene mostrar "cerca" y no un número.

## Privacidad

- Las posiciones viven solo en la memoria del motor y vencen a los 60 s sin reportes. Nada se guarda ni se escribe en logs.
- A los demás les llega distancia, rumbo e incertidumbre, nunca coordenadas. `ProximityUpdateSchema` es estricto y una prueba lo comprueba.
- El hub no verifica membresía: lo hace la ruta. Solo entra quien tiene la clave del dispositivo de esa persona y una fila suya en `room_members` de esa sala, porque quien reporta posiciones falsas puede ubicar a los demás por triangulación. Los perfiles del seed los abre cualquier dispositivo, como en el resto de las rutas.

## Qué se midió

En `nodos-lab`, no en este repo:

- Simulador con 200 personas, radio 25 m y error real de 15 a 25 m: con los valores por defecto de este motor, las personas en rango que no se muestran bajan de 17–31 % a menos de 1 %, al precio de mostrar gente que está más lejos que el radio.
- Una auditoría con la página real en un arnés encontró y corrigió puntos fantasma tras reinicios, posiciones pegadas tras recargar y un filtro que se dejaba arrastrar por lecturas malas. Este port ya trae esas correcciones.

## Sin probar

- Estas correcciones en teléfonos reales.
- La ruta en Render: que el proxy no corte el SSE (se manda un ping cada 20 s).
- Más de una instancia del servidor: el estado es de un proceso, como el buzón del onboarding.
