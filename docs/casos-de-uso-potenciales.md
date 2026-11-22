# Casos de uso potenciales

*120 casos de uso potenciales de Minga, agrupados en 15 tipos de problema, con las capacidades que usa cada uno.*

> **Estado (22-11-2026):** exploración, no especificación. Estos casos salen de descubrir qué permite la idea al combinar sus capacidades; no describen lo que está construido en el hack ni casos validados con usuarios. Cada caso tiene sus propias condiciones y supuestos particulares: que las personas involucradas usen Minga, que hayan abierto la capa de información que el caso necesita, que existan las integraciones que supone y que el contexto legal lo permita. Hay que revisarlos uno a uno antes de construir cualquiera. No reemplaza a [casos-de-uso](casos-de-uso.md), que describe los flujos de la app.

Cada tipo se define por la pregunta que se hace la persona, no por el contexto: citas, trabajo y fiestas pueden ser el mismo tipo. Los tipos A a H son de **coordinación**; los tipos I a O, de **cooperación** (decidir, negociar y sostener cosas en conjunto).

## Capacidades

Cada caso es una receta que combina algunas de estas ocho capacidades. Las seis primeras vienen de la idea; las dos últimas atraviesan a todas.

| Capacidad | Qué hace | Señales típicas |
| --- | --- | --- |
| P1 Contexto multifuente | Incorpora calendarios, redes sociales y lo que sabe el asistente de IA de cada persona, filtrando lo sensible | Disponibilidad, intereses, lecturas, historial |
| P2 Red pública | El agente lee tu perfil y la capa pública de cada conexión sin preguntar uno por uno | Habilidades, empresa, ciudad, proyectos de tus contactos |
| P3 Restricciones | Reglas que el agente respeta al conversar: presupuesto, fechas, temas vetados, qué no revelar | "Máx. $80.000", "no fines de semana", "no compartir mi dirección" |
| P4 Ubicación | Ubicación aproximada, abierta solo con un click de consentimiento y solo para personas con intereses similares dentro de cierta distancia | Quién está en la misma feria, barrio o ciudad |
| P5 Matching | Cruce de intereses, filtrado por distancia o por un prompt libre | "Gente a menos de 2 km que lea ciencia ficción" |
| P6 Afinidades | Grafo de contactos que muestra cruces que nadie había considerado; base para pedir ayuda | Dos contactos que deberían conocerse |
| P7 Mediación | Los agentes conversan en nombre de sus personas, negocian y solo escalan lo que requiere una decisión humana | Proponer fecha, pre-filtrar un match, pedir una intro |
| P8 Confianza | Todo parte privado. La persona abre información por capas (primero el nombre, luego más detalle) y puede cerrarse a recibir solicitudes | "Abierto a conocer gente", "solo amigos", "esta marca ve mis preferencias de viaje" |

## Mecanismos de orquestación

Las capacidades se combinan en mecanismos que se repiten entre tipos. Ninguno exige que Minga sepa más de lo que cada persona abrió.

| Mecanismo | Cómo funciona | Sirve para |
| --- | --- | --- |
| M1 Negociación con límites privados | Cada agente conoce los límites de su persona (presupuesto, sueldo, horario) y busca el cruce con los otros sin revelarlos. Solo se muestra el acuerdo, o que no lo hay | Dividir gastos, fijar precio, elegir fecha |
| M2 Consulta en abanico y síntesis | Una pregunta va a muchos agentes a la vez; cada uno responde desde la capa pública de su persona y el agente que preguntó sintetiza | Recomendaciones, sondeos, saber qué piensa la red |
| M3 Revelación progresiva | La información se abre capa por capa a medida que ambos lados aceptan | Citas, inversión, arriendos, ventas |
| M4 Humano en el borde | Los agentes hacen el ida y vuelta; las personas solo confirman la decisión y responden por ella | Toda coordinación, reportes a instituciones |
| M5 Disparadores de contexto | Un cambio (ubicación, hito, calendario, interés nuevo) despierta una oportunidad | Encuentros, retomar contacto, alertas |
| M6 Agente del grupo | Un agente neutral representa al grupo: guarda acuerdos, tareas y compromisos, y modera el chat | Grupos, comunidades, bienes comunes |
| M7 Caminos de confianza | Una petición viaja por el grafo (amigo de un amigo) y cada salto la avala o la detiene | Intros, referencias, pedir ayuda |
| M8 Agregación de demanda | Necesidades parecidas de muchas personas se juntan en una sola voz frente a un proveedor o una institución | Compras colectivas, peticiones, reportes vecinales |

## Tipos de problema

| Tipo | Pregunta que resuelve | Patrón de coordinación | Casos |
| --- | --- | --- | --- |
| [A. Enrutar preguntas](#a-enrutar-preguntas) | ¿Quién en mi red sabe de esto? | 1 → red, unilateral, baja fricción | 8 |
| [B. Emparejar complementos](#b-emparejar-complementos) | ¿Quién busca lo que ofrezco, u ofrece lo que busco? | 1 ↔ 1, bilateral, doble opt-in | 10 |
| [C. Conectar por afinidad](#c-conectar-por-afinidad) | ¿Con quién comparto algo ahora mismo? | 1 ↔ 1, sin transacción, tema común | 8 |
| [D. Coordinar grupos](#d-coordinar-grupos) | ¿Cómo nos ponemos de acuerdo? | N personas, restricciones cruzadas, consenso | 9 |
| [E. Sincronizar lugar y momento](#e-sincronizar-lugar-y-momento) | ¿Quién está cerca y le sirve juntarse ya? | Proximidad, ventana de minutos u horas | 7 |
| [F. Movilizar ayuda](#f-movilizar-ayuda) | ¿Quién me puede ayudar con esto, rápido? | 1 → red, urgencia variable, recursos físicos | 8 |
| [G. Mediar con instituciones](#g-mediar-con-instituciones) | ¿Cómo comparto mi contexto con una organización, bajo mis términos? | Persona ↔ organización, consentimiento por capas | 8 |
| [H. Activar la red](#h-activar-la-red) | ¿A quién debería volver a hablarle, o presentar? | Grafo, lazos débiles, tú como puente | 7 |
| [I. Decidir en conjunto](#i-decidir-en-conjunto) | ¿Qué preferimos como grupo, y cómo lo hacemos legítimo? | N personas, preferencias, votación o consenso | 8 |
| [J. Negociar y mediar conflictos](#j-negociar-y-mediar-conflictos) | ¿Dónde está el acuerdo posible entre intereses opuestos? | 2 o más partes, límites privados (M1) | 8 |
| [K. Administrar bienes comunes](#k-administrar-bienes-comunes) | ¿Cómo usamos y cuidamos lo que compartimos? | Grupo estable, turnos, reglas, registro de uso | 8 |
| [L. Actuar colectivamente](#l-actuar-colectivamente) | ¿Cómo juntamos fuerza para lograr lo que nadie logra solo? | Muchos frente a un tercero, agregación (M8) | 8 |
| [M. Sostener compromisos](#m-sostener-compromisos) | ¿Estamos cumpliendo lo que acordamos? | Grupo, memoria de acuerdos, seguimiento (M6) | 7 |
| [N. Transferir confianza](#n-transferir-confianza) | ¿Puedo confiar en esta persona? | 1 ↔ 1 a través de la red, avales (M7) | 8 |
| [O. Pensar en conjunto](#o-pensar-en-conjunto) | ¿Qué sabe o piensa la red sobre esto? | 1 → muchos, síntesis (M2) | 8 |

## Catálogo

La columna Capacidades lista solo las centrales para ese caso; casi todos usan además P7 y P8 de apoyo.

### A. Enrutar preguntas

¿Quién en mi red sabe de esto? · 1 → red, unilateral, baja fricción

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Proveedores para el matrimonio | Novios | Consulta a contactos que se casaron hace poco: banquetera, fotógrafo, precios reales | P2 Red pública, P5 Matching, P6 Afinidades, P7 Mediación |
| Experto interno por stack o responsabilidad | Equipos en una empresa | "¿Quién ha usado Kafka en producción?" llega a la persona exacta, con un horario libre de su calendario | P1 Contexto multifuente, P2 Red pública, P5 Matching, P7 Mediación |
| Especialista médico de confianza | Quien se cambió de ciudad | Contactos que fueron a un especialista en su comuna y lo recomiendan | P2 Red pública, P5 Matching, P8 Confianza |
| Trámite complejo | Quien hace una visa, herencia o trámite tributario | Contacto de 2.º grado que hizo el mismo trámite hace poco | P2 Red pública, P6 Afinidades |
| Elegir barrio o arriendo | Quien busca departamento | Contactos que viven o vivieron ahí: ruido, seguridad, transporte | P2 Red pública, P4 Ubicación, P5 Matching |
| Due diligence de un empleador | Candidatos | Ex-empleados de esa empresa en la red, consultados en privado | P2 Red pública, P6 Afinidades, P8 Confianza |
| Validar una idea de producto | Emprendedores | Cinco personas de la red con el perfil del cliente objetivo y 15 minutos libres | P1 Contexto multifuente, P2 Red pública, P5 Matching, P7 Mediación |
| Elegir colegio o jardín | Padres | Apoderados del colegio dentro de la red | P2 Red pública, P6 Afinidades |

### B. Emparejar complementos

¿Quién busca lo que ofrezco, u ofrece lo que busco? · 1 ↔ 1, bilateral, doble opt-in

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Inversionista y founder | Founders, ángeles, fondos | Cruza la tesis del fondo con etapa y sector; el agente pre-filtra y pide una intro cálida | P1 Contexto multifuente, P2 Red pública, P5 Matching, P7 Mediación, P8 Confianza |
| Cofundador o equipo | Emprendedores | Habilidades complementarias, disponibilidad y valores, con restricciones como "full-time desde marzo" | P1 Contexto multifuente, P2 Red pública, P3 Restricciones, P5 Matching, P7 Mediación |
| Citas | Solteros | Compatibilidad por intereses y valores reales; los agentes pre-conversan y la identidad se revela con doble opt-in | P1 Contexto multifuente, P3 Restricciones, P5 Matching, P7 Mediación, P8 Confianza |
| Networking en feria laboral | Candidatos y reclutadores | Agenda de conversaciones priorizada antes de llegar a la feria | P2 Red pública, P4 Ubicación, P5 Matching, P7 Mediación |
| Clientes específicos | Vendedores B2B, freelancers | "Gerentes de operaciones en retail en mi red de 2.º grado", cada uno con intro y solo si están abiertos a recibir solicitudes | P2 Red pública, P5 Matching, P6 Afinidades, P8 Confianza |
| Mentoría | Juniors y seniors | Mentor que hizo la misma transición, por ejemplo de ingeniería a producto | P1 Contexto multifuente, P2 Red pública, P5 Matching |
| Compañero de departamento | Quien busca compartir arriendo | Horarios, hábitos, presupuesto y barrio compatibles | P1 Contexto multifuente, P3 Restricciones, P4 Ubicación, P5 Matching, P7 Mediación |
| Intercambio de habilidades | Cualquiera | "Te enseño Python, me enseñas guitarra" | P2 Red pública, P5 Matching |
| Freelance urgente | Agencias, independientes | Diseñador libre esta semana con tarifa dentro del rango | P1 Contexto multifuente, P2 Red pública, P3 Restricciones, P5 Matching |
| Compra y venta entre conocidos | Cualquiera | Vender la cuna a alguien de la red que espera guagua | P2 Red pública, P6 Afinidades |

### C. Conectar por afinidad

¿Con quién comparto algo ahora mismo? · 1 ↔ 1, sin transacción, tema común

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Mismo libro | Lectores | Quién de tu red lee el mismo libro ahora; club de lectura espontáneo | P1 Contexto multifuente, P5 Matching |
| Misma serie | Espectadores | Comentar con quien va en el mismo capítulo, sin spoilers | P1 Contexto multifuente, P5 Matching |
| Tema común en una fiesta | Invitados | Al llegar, tres temas en común con cada persona presente | P2 Red pública, P4 Ubicación, P5 Matching |
| Abrir más conversaciones | Cualquiera | Avisa cuando un contacto publica un interés nuevo que cruza con el tuyo | P1 Contexto multifuente, P2 Red pública, P6 Afinidades |
| Compañero de deporte | Corredores, escaladores, ciclistas | Nivel similar, horario compatible, cerca | P1 Contexto multifuente, P3 Restricciones, P4 Ubicación, P5 Matching |
| Mismo concierto o evento | Fans | Quién de tu red va al mismo show | P1 Contexto multifuente, P2 Red pública, P4 Ubicación |
| Hobby de nicho | Coleccionistas, makers | Los pocos en tu ciudad con el mismo hobby | P2 Red pública, P4 Ubicación, P5 Matching |
| Mismo curso | Estudiantes | Quién está haciendo el mismo curso online para avanzar juntos | P1 Contexto multifuente, P5 Matching |

### D. Coordinar grupos

¿Cómo nos ponemos de acuerdo? · N personas, restricciones cruzadas, consenso

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Planificación inicial del matrimonio | Novios, familias | Fecha que maximiza la asistencia de los imprescindibles; presupuesto repartido entre partes | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Despedida de soltero | Amigos del novio o la novia | Fechas, presupuestos distintos, asistencia por día y quién aloja | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Viaje grupal | Amigos | Destino según el presupuesto y las vacaciones de cada uno | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Asado o cumpleaños | Amigos | Qué lleva cada uno y restricciones alimentarias | P3 Restricciones, P7 Mediación |
| Regalo colectivo | Colegas, amigos | Monto por persona, quién compra y qué regalar según la capa pública del festejado | P2 Red pública, P3 Restricciones, P7 Mediación |
| Turnos de cuidado | Familia de un adulto mayor | Turnos según calendario y distancia de cada uno | P1 Contexto multifuente, P3 Restricciones, P4 Ubicación, P7 Mediación |
| Furgón o carpool escolar | Apoderados | Rutas y horarios que calzan | P1 Contexto multifuente, P3 Restricciones, P4 Ubicación |
| Reencuentro de generación | Ex-compañeros | Encontrar a todos, elegir fecha y lugar | P1 Contexto multifuente, P2 Red pública, P6 Afinidades, P7 Mediación |
| Reunión entre zonas horarias | Equipos remotos | Los agentes negocian el horario sin cadena de correos | P1 Contexto multifuente, P7 Mediación |

### E. Sincronizar lugar y momento

¿Quién está cerca y le sirve juntarse ya? · Proximidad, ventana de minutos u horas

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Feria laboral en vivo | Asistentes | Cuál de tus matches está en el stand de al lado ahora | P4 Ubicación, P5 Matching, P8 Confianza |
| Presentaciones en una fiesta | Invitados | Presenta en el momento a personas compatibles que están ahí | P4 Ubicación, P5 Matching, P8 Confianza |
| Viaje de trabajo | Viajeros | Contactos que están en la misma ciudad esta semana | P1 Contexto multifuente, P4 Ubicación, P6 Afinidades |
| Aeropuerto o escala | Viajeros | Un conocido en el mismo terminal | P4 Ubicación, P6 Afinidades, P8 Confianza |
| Compartir auto a la salida | Asistentes a un evento | Mismo destino, misma hora | P3 Restricciones, P4 Ubicación |
| Plan improvisado | Amigos | "Tengo dos horas libres en Providencia": quién está cerca y libre | P1 Contexto multifuente, P4 Ubicación, P8 Confianza |
| Conferencia | Asistentes | Almuerzo con cuatro personas afines que están en la misma charla | P4 Ubicación, P5 Matching, P7 Mediación |

### F. Movilizar ayuda

¿Quién me puede ayudar con esto, rápido? · 1 → red, urgencia variable, recursos físicos

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Emergencia en el barrio | Vecinos | Personas cercanas con habilidades útiles: primeros auxilios, un generador, un auto | P2 Red pública, P4 Ubicación, P6 Afinidades |
| Préstamo de objetos | Cualquiera | Taladro, silla de auto o carpa dentro de tu red cercana | P2 Red pública, P4 Ubicación, P6 Afinidades |
| Mudanza | Quien se muda | Quién tiene camioneta y está libre el sábado | P1 Contexto multifuente, P2 Red pública, P6 Afinidades |
| Cuidado puntual | Padres, dueños de mascotas | Quién puede cuidar al perro este fin de semana | P1 Contexto multifuente, P2 Red pública, P6 Afinidades |
| Desastre (incendio, terremoto) | Damnificados y voluntarios | Cruza necesidades y ofertas de ayuda por zona | P2 Red pública, P4 Ubicación, P5 Matching, P7 Mediación |
| Búsqueda laboral tras un despido | Persona despedida | Activa la red con un mensaje acordado: qué busca y a quién presentar | P2 Red pública, P6 Afinidades, P7 Mediación, P8 Confianza |
| Recaudación para una causa | Organizadores | Contactos con afinidad por la causa | P2 Red pública, P5 Matching, P6 Afinidades |
| Mascota o persona perdida | Familias | Difusión por cercanía con foto y última ubicación | P4 Ubicación, P6 Afinidades |

### G. Mediar con instituciones

¿Cómo comparto mi contexto con una organización, bajo mis términos? · Persona ↔ organización, consentimiento por capas

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Alerta a un servicio público | Persona en emergencia | A partir del prompt de la persona, el agente prepara ubicación, condiciones médicas y contactos de emergencia; la persona confirma y responde por el reporte | P1 Contexto multifuente, P4 Ubicación, P7 Mediación, P8 Confianza |
| Capas de datos a cambio de beneficios | Consumidores y marcas | Abrir preferencias de viaje a una aerolínea a cambio de descuentos, con consentimiento y revocable | P1 Contexto multifuente, P3 Restricciones, P8 Confianza |
| Postulación con contexto | Candidatos y empresas | El agente responde preguntas de screening dentro de lo autorizado | P1 Contexto multifuente, P3 Restricciones, P7 Mediación, P8 Confianza |
| Pre-triage de salud | Pacientes y clínicas | Historial autorizado llega antes que la persona | P1 Contexto multifuente, P7 Mediación, P8 Confianza |
| Reportes al municipio | Vecinos | Reportes georreferenciados con contexto, para que el municipio priorice | P4 Ubicación, P7 Mediación |
| Red de egresados | Universidades | Conecta estudiantes con egresados que hicieron la carrera que quieren | P2 Red pública, P5 Matching, P6 Afinidades |
| Reclutar participantes de estudios | Investigadores | Perfil exacto, con consentimiento y pago | P1 Contexto multifuente, P5 Matching, P8 Confianza |
| Atención al cliente | Personas y empresas | El agente de la persona resuelve el reclamo con el agente de la empresa | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |

### H. Activar la red

¿A quién debería volver a hablarle, o presentar? · Grafo, lazos débiles, tú como puente

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Retomar contacto | Cualquiera | Sugiere a quién escribir y por qué, con un tema concreto | P1 Contexto multifuente, P2 Red pública, P6 Afinidades |
| Presentar a dos contactos | Conectores | Detecta dos contactos que deberían conocerse y redacta la intro | P2 Red pública, P6 Afinidades, P7 Mediación |
| Pedir ayuda desde el mapa de afinidades | Cualquiera | Muestra el contacto con el camino más corto a lo que necesitas | P6 Afinidades, P7 Mediación |
| Seguimiento después de un evento | Quien hace networking | Recuerda a quién conociste y qué quedaste de hacer | P1 Contexto multifuente, P6 Afinidades |
| Llegar a una ciudad nueva | Migrantes, expatriados | Mapa de contactos de 2.º grado que viven en esa ciudad | P2 Red pública, P4 Ubicación, P6 Afinidades |
| Hitos de los contactos | Cualquiera | Un cambio de trabajo o una mudanza abre un momento natural para retomar | P1 Contexto multifuente, P2 Red pública, P6 Afinidades |
| Subgrupos dentro de una comunidad | Organizadores | Detecta grupos con intereses comunes dentro de la comunidad | P2 Red pública, P5 Matching, P6 Afinidades |

### I. Decidir en conjunto

¿Qué preferimos como grupo, y cómo lo hacemos legítimo? · N personas, preferencias, votación o consenso

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Asamblea de copropietarios | Comunidad de un edificio | El agente del grupo resume las posiciones y propone la moción con más apoyo antes de la asamblea | P3 Restricciones, P7 Mediación, P8 Confianza |
| Elegir restaurante o panorama | Grupo de amigos | Cruza gustos, dietas y presupuestos y propone tres opciones ordenadas | P3 Restricciones, P4 Ubicación, P7 Mediación |
| Priorizar proyectos de la junta de vecinos | Vecinos | Votación por puntos, con los argumentos de cada postura resumidos | P3 Restricciones, P7 Mediación |
| Presupuesto participativo | Municipio y vecinos | Cada agente explica las propuestas a su persona y recoge un voto informado | P1 Contexto multifuente, P7 Mediación |
| Decisión de equipo sin reunión | Equipos de trabajo | Los agentes ponen sobre la mesa la posición de cada uno; las personas solo ven el desacuerdo real | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Reglas de una comunidad | Moderadores y miembros | Borrador de reglas que integra las objeciones de cada miembro | P3 Restricciones, P7 Mediación |
| Nombre de la guagua | Familia | Ronda anónima de propuestas y descarte, sin herir a nadie | P7 Mediación, P8 Confianza |
| Destino de fondos de una ONG | Directorio | Ranking de alternativas con criterios acordados antes de votar | P3 Restricciones, P7 Mediación |

### J. Negociar y mediar conflictos

¿Dónde está el acuerdo posible entre intereses opuestos? · 2 o más partes, límites privados (M1)

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Dividir los gastos de la casa | Roommates | Cada uno declara en privado cuánto puede pagar; los agentes proponen una división justa | P3 Restricciones, P7 Mediación, P8 Confianza |
| Negociación salarial | Candidato y empresa | Los agentes revelan solo si los rangos se cruzan, y en qué punto | P3 Restricciones, P7 Mediación, P8 Confianza |
| Ruidos entre vecinos | Vecinos | Mediación entre agentes antes de que escale, con una propuesta de horarios | P3 Restricciones, P7 Mediación |
| Calendario de los hijos | Padres separados | Un calendario que respeta las restricciones de ambos sin una conversación tensa | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Compra de un auto usado | Comprador y vendedor | Precio en el cruce de los límites privados de cada uno | P3 Restricciones, P7 Mediación, P8 Confianza |
| Reparto de una herencia | Hermanos | Cada uno ordena lo que valora; los agentes proponen el reparto que deja más conforme a todos | P3 Restricciones, P7 Mediación, P8 Confianza |
| Desacuerdo entre socios | Socios, cofundadores | El agente resume posiciones e intereses de fondo, sin culpas | P1 Contexto multifuente, P7 Mediación |
| Reparaciones del arriendo | Arrendatario y dueño | Acuerdo sobre qué se repara y quién paga, con evidencia de por medio | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |

### K. Administrar bienes comunes

¿Cómo usamos y cuidamos lo que compartimos? · Grupo estable, turnos, reglas, registro de uso

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Lavandería o quincho del edificio | Vecinos | Reservas y turnos según el calendario de cada uno | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Huerto comunitario | Vecinos | Turnos de riego y cosecha repartida | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Biblioteca de herramientas del barrio | Vecinos | Quién tiene qué, préstamos y devoluciones | P2 Red pública, P4 Ubicación, P7 Mediación |
| Auto compartido entre familias | Familias | Turnos, bencina y mantención prorrateados | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Estacionamientos de visita | Comunidad de un edificio | Asignación justa en fechas peak | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Suscripción compartida | Amigos | Quién paga cada mes y quién la usa | P3 Restricciones, P7 Mediación |
| Olla común o despensa comunitaria | Organizaciones sociales | Inventario, turnos de cocina y donaciones | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Casa de veraneo compartida | Grupo de socios | Calendario de uso y gastos comunes | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |

### L. Actuar colectivamente

¿Cómo juntamos fuerza para lograr lo que nadie logra solo? · Muchos frente a un tercero, agregación (M8)

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Compra colectiva | Vecinos, apoderados | Junta la demanda de leña, gas o útiles y negocia un descuento con un proveedor | P2 Red pública, P4 Ubicación, P5 Matching, P7 Mediación |
| Reclamo a una empresa de servicios | Afectados por un corte | Un solo reclamo con todos los casos documentados | P1 Contexto multifuente, P4 Ubicación, P7 Mediación, P8 Confianza |
| Petición al municipio | Vecinos | Reporte agregado de luminarias, baches o seguridad | P4 Ubicación, P7 Mediación |
| Minga de trabajo | Comunidad | Convoca a quienes tienen la habilidad y el tiempo para un día de trabajo | P1 Contexto multifuente, P2 Red pública, P4 Ubicación, P5 Matching |
| Voluntariado | ONG | Voluntarios por habilidad, zona y disponibilidad | P1 Contexto multifuente, P2 Red pública, P4 Ubicación, P5 Matching |
| Contratar un servicio entre varios | Vecinos de una cuadra | Un jardinero o un guardia para toda la cuadra | P3 Restricciones, P4 Ubicación, P7 Mediación |
| Tarifas de referencia | Freelancers, repartidores | Tarifas agregadas y anónimas para negociar mejor | P5 Matching, P8 Confianza |
| Campaña de donación | Comunidad | Necesidades concretas cruzadas con ofertas concretas | P2 Red pública, P5 Matching, P7 Mediación |

### M. Sostener compromisos

¿Estamos cumpliendo lo que acordamos? · Grupo, memoria de acuerdos, seguimiento (M6)

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Acuerdos de una reunión | Equipos | El agente del grupo registra quién hace qué y avisa antes del plazo | P1 Contexto multifuente, P7 Mediación |
| Deudas entre amigos | Amigos después de un viaje | Registro de quién le debe qué a quién | P7 Mediación |
| Hábito en grupo | Amigos que entrenan | Seguimiento mutuo de la meta acordada | P1 Contexto multifuente, P7 Mediación |
| Tareas del hogar | Familias, roommates | Turnos de aseo y recordatorios parejos | P1 Contexto multifuente, P3 Restricciones, P7 Mediación |
| Intros prometidas | Quien hace networking | Seguimiento de los "te presento a…" pendientes | P6 Afinidades, P7 Mediación |
| Avance de un proyecto voluntario | Organizaciones | Estado de cada compromiso sin reuniones de estado | P1 Contexto multifuente, P7 Mediación |
| Cobertura de turnos de cuidado | Familias | Detecta cuando alguien no puede y busca reemplazo | P1 Contexto multifuente, P3 Restricciones, P6 Afinidades, P7 Mediación |

### N. Transferir confianza

¿Puedo confiar en esta persona? · 1 ↔ 1 a través de la red, avales (M7)

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| Contratar niñera o cuidadora | Padres | Candidatas avaladas por contactos de la red | P2 Red pública, P6 Afinidades, P8 Confianza |
| Arrendar a un desconocido | Dueños y arrendatarios | Camino de confianza entre ambos, con avales | P2 Red pública, P6 Afinidades, P8 Confianza |
| Contratar un maestro o técnico | Hogares | Trabajadores que tus contactos ya contrataron y recomiendan | P2 Red pública, P4 Ubicación, P6 Afinidades |
| Compra en un marketplace | Compradores y vendedores | Alguien en común que responda por el vendedor | P2 Red pública, P6 Afinidades |
| Referencia laboral | Candidatos y reclutadores | Referencias de contactos en común, no elegidas por el candidato | P2 Red pública, P6 Afinidades, P8 Confianza |
| Primera cita segura | Personas en citas | Confirmar que hay contactos en común y que la persona es quien dice ser | P2 Red pública, P6 Afinidades, P8 Confianza |
| Intro a un inversionista | Founders | Aval del contacto que conecta | P2 Red pública, P6 Afinidades, P7 Mediación |
| Prestar dinero o algo valioso | Cualquiera | Historial de cumplimiento dentro de la red | P6 Afinidades, P8 Confianza |

### O. Pensar en conjunto

¿Qué sabe o piensa la red sobre esto? · 1 → muchos, síntesis (M2)

| Caso | Quién | Cómo ayuda Minga | Capacidades |
| --- | --- | --- | --- |
| ¿Qué opina mi red de esta decisión? | Cualquiera | Sondeo a contactos relevantes, con los argumentos a favor y en contra resumidos | P2 Red pública, P7 Mediación |
| Estado del arte en un tema | Profesionales | Lo que la red sabe de una herramienta o método, en un resumen | P1 Contexto multifuente, P2 Red pública, P5 Matching, P7 Mediación |
| Recomendaciones de viaje | Viajeros | Lo mejor de una ciudad según quienes la visitaron | P2 Red pública, P4 Ubicación, P7 Mediación |
| Temas de la semana en una comunidad | Organizadores | Qué les interesa más a los miembros ahora | P1 Contexto multifuente, P2 Red pública, P5 Matching |
| Lluvia de ideas distribuida | Equipos | Cada agente aporta ideas desde su persona y se agrupan por tema | P1 Contexto multifuente, P7 Mediación |
| Investigación de usuarios | Emprendedores | Entrevistas en paralelo a perfiles específicos, con síntesis | P2 Red pública, P5 Matching, P7 Mediación, P8 Confianza |
| Alerta temprana en el barrio | Vecinos | Señales pequeñas (olores, cortes, ruidos) que juntas indican un problema | P4 Ubicación, P7 Mediación, P8 Confianza |
| Memoria de una comunidad | Agrupaciones | Lo aprendido en eventos anteriores, disponible para consultar | P1 Contexto multifuente, P7 Mediación |

## Decisiones de diseño que asumen los casos

| Riesgo | Cómo lo resuelve Minga |
| --- | --- |
| Prospección y venta de datos | El consentimiento va por capas. Compartir datos con una empresa solo ocurre si la persona lo acepta |
| Matching bilateral | El nombre es público; el resto queda privado hasta que se pasa a otra capa de confianza |
| Sobre-solicitud | La persona puede marcarse como no abierta a conocer gente, y entonces no recibe solicitudes |
| Datos sensibles | Se filtran y se tratan aparte: léxico determinista, anclas por embeddings y juez LLM (`src/lib/privacy/`). Los agentes solo ven la proyección pública |
| Ubicación | No es exacta. Se abre solo con un click de consentimiento, y solo para personas con intereses similares dentro de cierta distancia |
| Responsabilidad ante instituciones | El reporte no es automático: nace del prompt de un usuario, que lo confirma y se hace responsable |
