import { writeFileSync } from "node:fs";
import { toV1 } from "../seed/network";
import { team } from "../seed/team";

// One graph per case in seed/network.v2.json (read in its original v1 shape, one object per person) → docs/red-de-casos.html. Each graph has the event's room, its
// helpers, the teammates, and whoever sits on a shortest friendship path between them, so the 2nd and 3rd
// degree links are visible. Run after editing network.json: `pnpm seed:graphs`.

const network = toV1();
const graph = new Map<string, Set<string>>([...network.team, ...network.people].map((n) => [n.slug, new Set(n.friends.map((f) => f.slug))]));

function degreesFrom(from: string[], g = graph): Map<string, number> {
  const dist = new Map(from.map((s) => [s, 0]));
  const queue = [...from];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of g.get(current) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, dist.get(current)! + 1);
      queue.push(next);
    }
  }
  return dist;
}
const teamSlugs = network.team.map((t) => t.slug);
const fromTeam = degreesFrom(teamSlugs, graph);
const personBySlug = new Map(network.people.map((p) => [p.slug, p]));
const teamName = new Map(team.map((t) => [t.slug, t.displayName]));
const friendsBySlug = new Map([...network.team, ...network.people].map((n) => [n.slug, n.friends]));

function shortestPath(from: string[], to: string): string[] {
  const parent = new Map<string, string | null>(from.map((s) => [s, null]));
  const queue = [...from];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) break;
    for (const next of graph.get(current) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let at: string | null | undefined = to; at; at = parent.get(at)) path.unshift(at);
  return path;
}

const cases = network.events.map((event) => {
  const room = event.participants.map((p) => p.slug);
  const helpers = event.helpers.map((h) => h.slug);
  const included = new Set([...teamSlugs, ...room, ...helpers]);
  for (const slug of [...room, ...helpers]) for (const s of shortestPath(teamSlugs, slug)) included.add(s);
  for (const slug of helpers) for (const s of shortestPath(event.organizers, slug)) included.add(s);

  const nodes = [...included].map((slug) => {
    const person = personBySlug.get(slug);
    const participant = event.participants.find((p) => p.slug === slug);
    const helper = event.helpers.find((h) => h.slug === slug);
    const group = teamSlugs.includes(slug) ? "team" : participant ? "room" : helper ? "helper" : "bridge";
    return {
      id: slug,
      name: person?.displayName ?? teamName.get(slug) ?? slug,
      group,
      organizer: event.organizers.includes(slug),
      degree: fromTeam.get(slug) ?? null,
      role: participant?.role ?? (helper ? `ayuda · ${helper.degree}° de ${event.organizers.length > 1 ? "los organizadores" : "la organizadora"}` : group === "team" ? "equipo" : "puente"),
      why: helper?.why ?? null,
      bio: person?.bio ?? "Integrante del equipo (perfil en seed/team).",
      place: person ? `${person.age} años · ${person.comuna}, ${person.region}` : "",
      profile: person?.profile ?? null,
      constraints: (person?.constraints ?? []).filter((c) => c.appliesTo.includes(event.type)).map((c) => ({ type: c.type, detail: c.detail, hard: c.hard })),
      experiences: (person?.experiences ?? []).filter((x) => x.usefulFor.includes(event.type)).map((x) => ({ title: x.title, place: x.place, date: x.date, summary: x.summary })),
      friendCount: friendsBySlug.get(slug)?.length ?? 0,
    };
  });

  const edges = [...included].flatMap((slug) =>
    (friendsBySlug.get(slug) ?? [])
      .filter((f) => included.has(f.slug) && slug < f.slug)
      .map((f) => ({ source: slug, target: f.slug, relation: f.relation, closeness: f.closeness, label: `${f.detail}` })),
  );

  return { id: event.id, type: event.type, title: event.title, summary: event.summary, tensions: event.tensions, nodes, edges };
});

const template = String.raw`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Red de casos</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.2/cytoscape.min.js"></script>
<style>
  :root {
    --stone: #E7E1D7; --slate: #1F3138; --slate-2: #2A4049; --ink: #1F3138; --muted: #5E6B6F; --line: #CFC6B8;
    --coral: #FF5A36; --amigo: #FFB020; --conocido: #8C9BFF; --cercania: #2BD4A4; --paper: #F4F0E9;
    --mono: ui-monospace, "Geist Mono", SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--stone); color: var(--ink); font: 15px/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; }
  header { padding: 20px 24px 8px; }
  h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: -0.01em; }
  header p { margin: 0; color: var(--muted); max-width: 70ch; }
  nav { display: flex; gap: 6px; padding: 12px 24px; flex-wrap: wrap; }
  nav button { border: 1px solid var(--slate); background: transparent; color: var(--slate); padding: 7px 14px; border-radius: 999px; font: inherit; cursor: pointer; }
  nav button[aria-selected="true"] { background: var(--slate); color: #fff; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; padding: 0 24px 24px; }
  .stage { background: var(--slate); border-radius: 24px; position: relative; min-height: 620px; overflow: hidden; }
  #cy { position: absolute; inset: 0; }
  .rings { position: absolute; left: 16px; bottom: 14px; color: #B9C4C7; font: 12px var(--mono); pointer-events: none; }
  .stage-wrap { display: grid; gap: 10px; align-content: start; }
  .legend { color: var(--muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
  .legend b { display: inline-block; width: 18px; height: 0; border-top: 2px solid; margin-right: 6px; vertical-align: 3px; }
  aside { display: grid; gap: 16px; align-content: start; }
  section { border-top: 1px solid var(--line); padding-top: 12px; }
  section h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
  .summary { margin: 0; }
  ol { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
  .person h3 { margin: 0; font-size: 18px; }
  .person .meta { color: var(--muted); font: 12px var(--mono); margin: 2px 0 8px; }
  .chip { display: inline-block; font: 11px var(--mono); padding: 2px 8px; border-radius: 999px; background: var(--slate); color: #fff; margin: 0 4px 4px 0; }
  .chip.coral { background: var(--coral); }
  ul.items { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 6px; }
  ul.items li { padding-left: 12px; border-left: 2px solid var(--line); }
  ul.items li.hard { border-left-color: var(--coral); }
  .small { font-size: 13px; color: var(--muted); }
  .empty { color: var(--muted); }
  @media (max-width: 900px) {
    header, nav { padding-left: 16px; padding-right: 16px; }
    main { grid-template-columns: 1fr; padding: 0 16px 16px; }
    .stage { min-height: 480px; }
  }
</style>
</head>
<body>
<header>
  <h1>Red de casos del seed</h1>
  <p>Cada caso muestra a quienes están en la sala del evento, a las personas de afuera cuya experiencia sirve, al equipo y a quienes los unen por el camino más corto. Los anillos son la distancia al equipo: centro, 1°, 2° y 3°. Toca a alguien para ver sus restricciones y experiencias.</p>
</header>
<nav id="tabs" role="tablist"></nav>
<main>
  <div class="stage-wrap">
  <div class="stage">
    <div id="cy"></div>
    <div class="rings">anillos: equipo · 1° · 2° · 3°</div>
  </div>
    <div class="legend">
      <span><i style="background:#FFFFFF;box-shadow:0 0 0 1px var(--slate)"></i>equipo</span>
      <span><i style="background:var(--coral)"></i>en la sala (anillo blanco: organiza)</span>
      <span><i style="background:var(--cercania)"></i>ayuda desde afuera</span>
      <span><i style="background:#8A989C"></i>puente</span>
      <span><b style="border-color:var(--coral)"></b>pareja</span>
      <span><b style="border-color:var(--amigo)"></b>familia</span>
      <span><b style="border-color:var(--slate)"></b>amistad</span>
      <span><b style="border-color:var(--conocido)"></b>trabajo o estudios</span>
      <span><b style="border-color:#8A989C;border-top-style:dashed"></b>vecindad o conocido</span>
    </div>
  </div>
  <aside>
    <section><h2>El caso</h2><p class="summary" id="summary"></p></section>
    <section><h2>Tensiones para los agentes</h2><ol id="tensions"></ol></section>
    <section class="person" id="person"><h2>Persona</h2><p class="empty">Toca un nodo.</p></section>
  </aside>
</main>
<script>
const CASES = __DATA__;
const EDGE_COLOR = { pareja: "#FF5A36", familia: "#FFB020", amistad: "#F4F0E9", trabajo: "#8C9BFF", estudios: "#8C9BFF", vecindad: "#8A989C", conocido: "#8A989C" };
const NODE_COLOR = { team: "#FFFFFF", room: "#FF5A36", helper: "#2BD4A4", bridge: "#8A989C" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let cy;

function show(c) {
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === c.id)));
  document.getElementById("summary").textContent = c.summary;
  document.getElementById("tensions").innerHTML = c.tensions.map((t) => "<li>" + esc(t) + "</li>").join("");
  document.getElementById("person").innerHTML = '<h2>Persona</h2><p class="empty">Toca un nodo.</p>';
  if (cy) cy.destroy();
  cy = cytoscape({
    container: document.getElementById("cy"),
    elements: [
      ...c.nodes.map((n) => ({ data: { ...n, label: n.name.split(" ")[0] + (n.group === "team" ? "" : " " + (n.name.split(" ")[1] ?? "")[0] + "."), level: n.degree === null ? 0 : 4 - n.degree } })),
      ...c.edges.map((e, i) => ({ data: { id: "e" + i, ...e } })),
    ],
    style: [
      { selector: "node", style: {
        "background-color": (n) => NODE_COLOR[n.data("group")], label: "data(label)", color: "#E7E1D7", "font-size": 11,
        "text-valign": "bottom", "text-margin-y": 4, width: (n) => 14 + n.data("friendCount") * 2.2, height: (n) => 14 + n.data("friendCount") * 2.2,
        "border-width": (n) => (n.data("organizer") ? 3 : 0), "border-color": "#FFFFFF", "text-outline-width": 2, "text-outline-color": "#1F3138" } },
      { selector: "edge", style: {
        "line-color": (e) => EDGE_COLOR[e.data("relation")], width: (e) => 0.8 + e.data("closeness"), opacity: 0.75, "curve-style": "bezier",
        "line-style": (e) => (["vecindad", "conocido"].includes(e.data("relation")) ? "dashed" : "solid") } },
      { selector: ".faded", style: { opacity: 0.12 } },
      { selector: "edge.hl", style: { opacity: 1, label: "data(label)", "font-size": 9, color: "#E7E1D7", "text-outline-width": 2, "text-outline-color": "#1F3138", "text-rotation": "autorotate" } },
    ],
    layout: { name: "concentric", concentric: (n) => n.data("level"), levelWidth: () => 1, minNodeSpacing: 22, padding: 30, animate: false },
    wheelSensitivity: 0.3,
  });
  cy.on("tap", "node", (ev) => select(ev.target));
  cy.on("tap", (ev) => { if (ev.target === cy) { cy.elements().removeClass("faded hl"); } });
}

function select(node) {
  cy.elements().addClass("faded").removeClass("hl");
  node.closedNeighborhood().removeClass("faded");
  node.connectedEdges().addClass("hl");
  const n = node.data();
  const prof = n.profile ? [n.profile.profession, n.profile.diet, ...(n.profile.allergies ?? []).map((a) => "alergia: " + a), (n.profile.languages ?? []).join(", ")].filter(Boolean) : [];
  const degree = n.degree === 0 ? "equipo" : n.degree + "° del equipo";
  document.getElementById("person").innerHTML =
    "<h2>Persona</h2><h3>" + esc(n.name) + "</h3>" +
    '<div class="meta">' + esc([n.place, degree].filter(Boolean).join(" · ")) + "</div>" +
    '<span class="chip coral">' + esc(n.role) + "</span>" + prof.map((p) => '<span class="chip">' + esc(p) + "</span>").join("") +
    "<p>" + esc(n.bio) + "</p>" + (n.why ? '<p class="small">Por qué sirve: ' + esc(n.why) + "</p>" : "") +
    (n.constraints.length ? "<h2>Restricciones</h2><ul class=\"items\">" + n.constraints.map((c) => '<li class="' + (c.hard ? "hard" : "") + '"><span class="small">' + esc(c.type) + (c.hard ? " · no negociable" : " · preferencia") + "</span><br>" + esc(c.detail) + "</li>").join("") + "</ul>" : "") +
    (n.experiences.length ? "<h2>Experiencia</h2><ul class=\"items\">" + n.experiences.map((x) => "<li><b>" + esc(x.title) + '</b> <span class="small">' + esc(x.place + " · " + x.date) + "</span><br>" + esc(x.summary) + "</li>").join("") + "</ul>" : "");
}

const tabs = document.getElementById("tabs");
const LABEL = { matrimonio: "Matrimonio", viaje: "Viaje familiar", arriendo: "Arriendo con roomies", bomberos: "Llamado de bomberos" };
for (const c of CASES) {
  const b = document.createElement("button");
  b.role = "tab"; b.dataset.id = c.id; b.textContent = LABEL[c.type] + " · " + c.nodes.length;
  b.onclick = () => show(c);
  tabs.appendChild(b);
}
show(CASES[0]);
</script>
</body>
</html>
`;

const out = new URL("../docs/red-de-casos.html", import.meta.url);
writeFileSync(out, template.replace("__DATA__", JSON.stringify(cases).replace(/</g, "\\u003c")));
for (const c of cases) console.log(`${c.id}: ${c.nodes.length} personas, ${c.edges.length} enlaces`);
console.log("docs/red-de-casos.html escrito.");
