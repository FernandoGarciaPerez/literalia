/* Poemario – Lista (sin modal). “Leer” y “Poema al azar” navegan a poema.html */

const DOM = {
	list: document.getElementById("poemList"),
	search: document.getElementById("searchInput"),
	filter: document.getElementById("filterSelect"),
	randomBtn: document.getElementById("randomBtn"),
	cardTpl: document.getElementById("poemCardTpl"),
};

const STORE_KEYS = {favorites: "poemario:favorites"};
let POEMS = [];
let FILTERED = [];
let favorites = new Set(JSON.parse(localStorage.getItem(STORE_KEYS.favorites) || "[]"));

init();

async function init() {
	try {
		const raw = await fetch("poemas.txt", {cache: "no-store"}).then((r) => r.text());
		POEMS = parsePoems(raw).map((p, idx) => ({
			...p,
			id: slug(`${p.title}-${p.author}`) || `poema-${idx}`,
			index: idx,
		}));
	} catch (e) {
		console.error("Error cargando poemas.txt", e);
		DOM.list.innerHTML = `<div class="card"><p>No se pudo cargar <code>poemas.txt</code>. Asegúrate de servir los archivos desde un servidor.</p></div>`;
		DOM.list.setAttribute("aria-busy", "false");
		return;
	}

	wireUI();
	readFavorites(); // ⟵ primero sincronizamos favoritos
	renderList(); // ⟵ luego pintamos la lista
}

function wireUI() {
	DOM.search.addEventListener("input", renderList);
	DOM.filter.addEventListener("change", renderList);

	// ⤵️ ahora “Poema al azar” navega a poema.html
	DOM.randomBtn.addEventListener("click", navigateRandom);

	/** */
	// Al volver con el botón “atrás” (page is from bfcache) o al re-mostrar la página:
	window.addEventListener("pageshow", (e) => {
		// e.persisted === true cuando la página viene del back/forward cache
		readFavorites();
		renderList();
	});

	// Si la pestaña recupera foco/visibilidad (iOS a veces no dispara pageshow como esperamos)
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			readFavorites();
			renderList();
		}
	});

	// Si cambia localStorage desde otra pestaña/ventana
	window.addEventListener("storage", (e) => {
		if (e.key === STORE_KEYS.favorites) {
			readFavorites();
			renderList();
		}
	});
}

function renderList() {
	DOM.list.setAttribute("aria-busy", "true");
	const q = DOM.search.value.trim().toLowerCase();
	const onlyFavs = DOM.filter.value === "favorites";

	FILTERED = POEMS.filter((p) => {
		if (onlyFavs && !favorites.has(p.id)) return false;
		if (!q) return true;
		const blob = `${p.title} ${p.author} ${p.year || ""} ${p.tags?.join(" ") || ""} ${
			p.content
		}`.toLowerCase();
		return blob.includes(q);
	});

	DOM.list.innerHTML = "";
	if (!FILTERED.length) {
		DOM.list.innerHTML = `<div class="card"><p>No hay resultados.</p></div>`;
		DOM.list.setAttribute("aria-busy", "false");
		return;
	}

	const frag = document.createDocumentFragment();
	for (const p of FILTERED) {
		const node = DOM.cardTpl.content.cloneNode(true);
		const card = node.querySelector(".card");
		card.dataset.id = p.id;

		node.querySelector(".card-title").textContent = p.title;
		node.querySelector(".card-meta").textContent = metaText(p);

		const favBtn = node.querySelector(".fav-toggle");
		favBtn.dataset.id = p.id;

		// Estado inicial según localStorage
		const isFav = favorites.has(p.id);
		favBtn.classList.toggle("active", isFav);
		favBtn.setAttribute("aria-pressed", String(isFav));
		favBtn.textContent = isFav ? "❤️" : "🤍";

		// Click: alternar favorito + UI
		favBtn.addEventListener("click", () => {
			toggleFavorite(p.id); // actualiza el Set + localStorage
			const now = favorites.has(p.id);
			favBtn.classList.toggle("active", now);
			favBtn.setAttribute("aria-pressed", String(now));
			favBtn.textContent = now ? "❤️" : "🤍";

			// si estás filtrando por favoritos, vuelve a renderizar la lista
			if (DOM.filter.value === "favorites") renderList();
		});

		// ⤵️ “Leer” ahora va a poema.html
		node.querySelector('[data-action="open"]').addEventListener("click", () => goToPoem(p.id));

		node.querySelector('[data-action="copy"]').addEventListener("click", async () => {
			await copyPoem(p);
			flash(card, "Copiado");
		});

		frag.appendChild(node);
	}
	DOM.list.appendChild(frag);
	DOM.list.setAttribute("aria-busy", "false");
}

/* ---------- Navegación ---------- */
function goToPoem(id) {
	window.location.href = `poema.html?id=${encodeURIComponent(id)}`;
}
function navigateRandom() {
	const source =
		DOM.filter.value === "favorites" ? POEMS.filter((p) => favorites.has(p.id)) : POEMS;
	if (!source.length) return;
	const item = source[Math.floor(Math.random() * source.length)];
	goToPoem(item.id);
}

/* ---------- Utilidades ---------- */
function parsePoems(text) {
	const norm = text.replace(/\r\n?/g, "\n");
	const blocks = norm
		.split(/^\s*---\s*$/m)
		.map((s) => s.trim())
		.filter(Boolean);
	const poems = [];
	for (const block of blocks) {
		const parts = block.split(/\n{2,}/);
		const rawHeader = parts.shift() || "";
		const body = parts.join("\n\n").trim();
		const header = {};
		rawHeader.split(/\n/).forEach((line) => {
			const m = line.match(/^([\w\-]+)\s*:\s*(.+)$/);
			if (m) header[m[1].trim().toLowerCase()] = m[2].trim();
		});
		const title = header.title || "Sin título";
		const author = header.author || "Anónimo";
		const year = header.year || "";
		const tags = header.tags
			? header.tags
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: [];
		if (title || body) poems.push({title, author, year, tags, content: body});
	}
	return poems;
}
function metaText(p) {
	const a = [];
	if (p.author) a.push(p.author);
	if (p.year) a.push(p.year);
	if (p.tags?.length) a.push(p.tags.join(" · "));
	return a.join(" — ");
}
function slug(s) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 80);
}
/** */
function readFavorites() {
	favorites = new Set(JSON.parse(localStorage.getItem(STORE_KEYS.favorites) || "[]"));
}

/** */
function toggleFavorite(id) {
	if (favorites.has(id)) favorites.delete(id);
	else favorites.add(id);
	localStorage.setItem(STORE_KEYS.favorites, JSON.stringify([...favorites]));
}
async function copyPoem(p) {
	const text = `${p.title}\n${metaText(p)}\n\n${p.content}`;
	await navigator.clipboard.writeText(text);
}
function flash(el, msg) {
	const tip = document.createElement("div");
	tip.textContent = msg;
	Object.assign(tip.style, {
		position: "absolute",
		zIndex: 2,
		left: "50%",
		top: "0",
		marginTop: "10px",
		padding: "6px 10px",
		borderRadius: "10px",
		border: "1px solid var(--border)",
		background: "var(--card)",
		color: "var(--fg)",
		boxShadow: "var(--shadow)",
		fontSize: "12px",
		opacity: "0",
		transform: "translate(-50%, -6px)",
		transition: "opacity .15s ease, transform .25s ease",
	});
	(el.closest(".card") || el).appendChild(tip);
	requestAnimationFrame(() => {
		tip.style.opacity = "1";
		tip.style.transform = "translate(-50%, 0)";
	});
	setTimeout(() => {
		tip.style.opacity = "0";
		tip.style.transform = "translate(-50%,-8px)";
		setTimeout(() => tip.remove(), 220);
	}, 1200);
}
