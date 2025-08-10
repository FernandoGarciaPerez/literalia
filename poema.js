// poema.js — página individual del poema

const EL = {
	title: document.getElementById("poemTitle"),
	meta: document.getElementById("poemMeta"),
	content: document.getElementById("poemContent"),
	backBtn: document.getElementById("backBtn"),
	favBtn: document.getElementById("favBtn"),
	copyBtn: document.getElementById("copyBtn"),
	shareBtn: document.getElementById("shareBtn"),
	prevBtn: document.getElementById("prevBtn"),
	nextBtn: document.getElementById("nextBtn"),
};

const STORE_KEYS = {favorites: "poemario:favorites"};
let POEMS = [];
let favorites = new Set(JSON.parse(localStorage.getItem(STORE_KEYS.favorites) || "[]"));
let currentIndex = -1;

init();

async function init() {
	// back inteligente: si no hay historial, manda a index
	EL.backBtn.addEventListener("click", (e) => {
		e.preventDefault();
		if (window.history.length > 1) history.back();
		else window.location.href = "index.html";
	});

	const id = getIdFromURL();
	if (!id) {
		EL.title.textContent = "Poema no encontrado";
		return;
	}

	// carga y parsea
	const raw = await fetch("poemas.txt", {cache: "no-store"}).then((r) => r.text());
	POEMS = parsePoems(raw).map((p, idx) => ({
		...p,
		id: slug(`${p.title}-${p.author}`) || `poema-${idx}`,
		index: idx,
	}));

	// ubicar poema y renderizar
	const idx = POEMS.findIndex((p) => p.id === id);
	if (idx === -1) {
		EL.title.textContent = "Poema no encontrado";
		return;
	}
	currentIndex = idx;
	render(POEMS[idx]);

	// acciones
	EL.favBtn.addEventListener("click", () => {
		toggleFavorite(POEMS[currentIndex].id);
		updateFavButton();
	});
	EL.copyBtn.addEventListener("click", async () => {
		const p = POEMS[currentIndex];
		await navigator.clipboard.writeText(`${p.title}\n${metaText(p)}\n\n${p.content}`);
	});
	EL.shareBtn.addEventListener("click", async () => {
		const p = POEMS[currentIndex];
		const url = `${location.origin}${location.pathname}?id=${encodeURIComponent(p.id)}`;
		const title = p.title;
		const text = `${title} — ${metaText(p)}`;
		if (navigator.share) {
			try {
				await navigator.share({title, text, url});
			} catch {}
		} else {
			try {
				await navigator.clipboard.writeText(url);
			} catch {}
		}
	});

	EL.prevBtn.addEventListener("click", () => step(-1));
	EL.nextBtn.addEventListener("click", () => step(1));
	window.addEventListener("keydown", (e) => {
		if (e.key === "ArrowLeft") step(-1);
		if (e.key === "ArrowRight") step(1);
	});
}

function render(p) {
	EL.title.textContent = p.title;
	EL.meta.textContent = metaText(p);
	EL.content.textContent = p.content; // respeta saltos con <pre>
	document.title = `${p.title} — Poemario`;
	history.replaceState(null, "", `?id=${encodeURIComponent(p.id)}`);
	updateFavButton();
}

function step(delta) {
	currentIndex = (currentIndex + delta + POEMS.length) % POEMS.length;
	render(POEMS[currentIndex]);
}

function updateFavButton() {
	const isFav = favorites.has(POEMS[currentIndex].id);
	EL.favBtn.textContent = isFav ? "💔 Quitar" : "❤️ Favorito";
}

function toggleFavorite(id) {
	if (favorites.has(id)) favorites.delete(id);
	else favorites.add(id);
	localStorage.setItem(STORE_KEYS.favorites, JSON.stringify([...favorites]));
}

/* -------- utilidades compartidas -------- */
function getIdFromURL() {
	const u = new URL(location.href);
	return u.searchParams.get("id") || (location.hash.match(/^#poema\/(.+)$/)?.[1] ?? null);
}
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
