/* UI más poética: se mantiene <pre>, favoritos y búsqueda.
   Añade navegación ← → en el lector y mejoras visuales. */

const DOM = {
	list: document.getElementById("poemList"),
	search: document.getElementById("searchInput"),
	filter: document.getElementById("filterSelect"),
	randomBtn: document.getElementById("randomBtn"),
	modal: document.getElementById("poemModal"),
	modalCard: document.getElementById("poemModalCard"),
	modalTitle: document.getElementById("modalTitle"),
	modalMeta: document.getElementById("modalMeta"),
	modalContent: document.getElementById("modalContent"),
	favBtn: document.getElementById("favBtn"),
	copyBtn: document.getElementById("copyBtn"),
	shareBtn: document.getElementById("shareBtn"),
	prevBtn: document.getElementById("prevBtn"),
	nextBtn: document.getElementById("nextBtn"),
	cardTpl: document.getElementById("poemCardTpl"),
};

const STORE_KEYS = {favorites: "poemario:favorites"};
let POEMS = [];
let FILTERED = [];
let favorites = new Set(JSON.parse(localStorage.getItem(STORE_KEYS.favorites) || "[]"));
let currentIndex = -1; // índice en FILTERED del poema abierto

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
		DOM.list.innerHTML = `<div class="card"><p>No se pudo cargar <code>poemas.txt</code>. Asegúrate de servir los archivos desde un servidor (no file://).</p></div>`;
		DOM.list.setAttribute("aria-busy", "false");
		return;
	}

	wireUI();
	applyHashOpen();
	renderList();
}

function wireUI() {
	DOM.search.addEventListener("input", renderList);
	DOM.filter.addEventListener("change", renderList);
	DOM.randomBtn.addEventListener("click", openRandom);

	// Cerrar con click fuera y botones
	DOM.modal.addEventListener("click", (e) => {
		const r = DOM.modalCard.getBoundingClientRect();
		const outside =
			e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
		if (outside) closeModal();
	});
	document.querySelectorAll(".close-btn").forEach((btn) =>
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			closeModal();
		})
	);

	// Acciones modal
	DOM.favBtn.addEventListener("click", () => {
		const id = DOM.modal.dataset.id;
		toggleFavorite(id);
		updateFavButton(id);
		const btn = document.querySelector(`.card [data-id="${id}"].fav-toggle`);
		if (btn) btn.classList.toggle("active", favorites.has(id));
	});

	DOM.copyBtn.addEventListener("click", async () => {
		const text = `${DOM.modalTitle.textContent}\n${DOM.modalMeta.textContent}\n\n${DOM.modalContent.textContent}`;
		try {
			await navigator.clipboard.writeText(text);
			flash(DOM.copyBtn, "Copiado");
		} catch {
			flash(DOM.copyBtn, "No se pudo copiar");
		}
	});

	DOM.shareBtn.addEventListener("click", async () => {
		const id = DOM.modal.dataset.id;
		const url = `${location.origin}${location.pathname}#poema/${encodeURIComponent(id)}`;
		const title = DOM.modalTitle.textContent;
		const text = `${title} — ${DOM.modalMeta.textContent}`;
		if (navigator.share) {
			try {
				await navigator.share({title, text, url});
			} catch {}
		} else {
			try {
				await navigator.clipboard.writeText(url);
				flash(DOM.shareBtn, "Enlace copiado");
			} catch {}
		}
	});

	// Navegación
	DOM.prevBtn.addEventListener("click", () => step(-1));
	DOM.nextBtn.addEventListener("click", () => step(1));
	window.addEventListener("keydown", (e) => {
		if (!DOM.modal.open) return;
		if (e.key === "ArrowLeft") step(-1);
		if (e.key === "ArrowRight") step(1);
		if (e.key === "Escape") closeModal();
	});

	window.addEventListener("hashchange", applyHashOpen);
}

/* ---------- Render ---------- */
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
		favBtn.classList.toggle("active", favorites.has(p.id));
		favBtn.addEventListener("click", () => {
			toggleFavorite(p.id);
			favBtn.classList.toggle("active", favorites.has(p.id));
			if (DOM.filter.value === "favorites") renderList();
		});

		node.querySelector('[data-action="open"]').addEventListener("click", () => openPoem(p.id));
		node.querySelector('[data-action="copy"]').addEventListener("click", async () => {
			await copyPoem(p);
			flash(card, "Copiado");
		});

		frag.appendChild(node);
	}
	DOM.list.appendChild(frag);
	DOM.list.setAttribute("aria-busy", "false");
}

/* ---------- Modal ---------- */
function openPoem(id) {
	const idx =
		FILTERED.findIndex((x) => x.id === id) !== -1
			? FILTERED.findIndex((x) => x.id === id)
			: POEMS.findIndex((x) => x.id === id);
	const list = FILTERED.length ? FILTERED : POEMS;
	const p = list[idx];
	if (!p) return;

	currentIndex = idx;
	DOM.modalTitle.textContent = p.title;
	DOM.modalMeta.textContent = metaText(p);
	DOM.modalContent.textContent = p.content;
	DOM.modal.dataset.id = p.id;
	updateFavButton(p.id);

	DOM.modal.showModal();
	DOM.modal.classList.add("open");
	setTimeout(() => DOM.modalContent.focus(), 90);

	history.replaceState(null, "", `#poema/${encodeURIComponent(p.id)}`);
}

function step(delta) {
	const list = FILTERED.length ? FILTERED : POEMS;
	if (!list.length) return;
	currentIndex = (currentIndex + delta + list.length) % list.length;
	openPoem(list[currentIndex].id);
}

function closeModal() {
	DOM.modal.classList.remove("open");
	const onEnd = () => {
		DOM.modal.close();
		history.replaceState(null, "", location.pathname + location.search);
	};
	const hasTransition = getComputedStyle(DOM.modalCard).transitionDuration !== "0s";
	if (hasTransition) DOM.modalCard.addEventListener("transitionend", onEnd, {once: true});
	else onEnd();
}

function updateFavButton(id) {
	const isFav = favorites.has(id);
	DOM.favBtn.textContent = isFav ? "💔 Quitar" : "❤️ Favorito";
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
function toggleFavorite(id) {
	if (favorites.has(id)) favorites.delete(id);
	else favorites.add(id);
	localStorage.setItem(STORE_KEYS.favorites, JSON.stringify([...favorites]));
}
async function copyPoem(p) {
	const text = `${p.title}\n${metaText(p)}\n\n${p.content}`;
	await navigator.clipboard.writeText(text);
}
function openRandom() {
	const src = DOM.filter.value === "favorites" ? POEMS.filter((p) => favorites.has(p.id)) : POEMS;
	if (!src.length) return;
	const it = src[Math.floor(Math.random() * src.length)];
	openPoem(it.id);
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
function applyHashOpen() {
	const m = location.hash.match(/^#poema\/(.+)$/);
	if (m && POEMS.length) {
		const id = decodeURIComponent(m[1]);
		const list = FILTERED.length ? FILTERED : POEMS;
		const idx = list.findIndex((p) => p.id === id);
		if (idx !== -1) openPoem(id);
	}
}
