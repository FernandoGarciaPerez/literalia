import {
	copyText,
	formatPoemText,
	loadPoems,
	metaText,
	readFavoriteIds,
	toggleFavoriteId,
} from "./poems.js";
import {trackPoemView} from "./analytics.js?v=20261014-mobile-cache";

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
	status: document.getElementById("poemStatus"),
};

let poems = [];
let favorites = readFavoriteIds();
let currentIndex = -1;

init();

async function init() {
	EL.backBtn.addEventListener("click", (event) => {
		event.preventDefault();
		if (window.history.length > 1) history.back();
		else window.location.href = "index.html";
	});

	const id = getIdFromURL();
	if (!id) {
		showError("Poema no encontrado");
		return;
	}

	try {
		poems = await loadPoems();
	} catch (error) {
		console.error("Error cargando poemas.txt", error);
		showError("No se pudo cargar poemas.txt");
		return;
	}

	const index = poems.findIndex((poem) => poem.id === id);
	if (index === -1) {
		showError("Poema no encontrado");
		return;
	}

	currentIndex = index;
	render(poems[currentIndex]);
	wireActions();
}

function wireActions() {
	EL.favBtn.addEventListener("click", () => {
		favorites = toggleFavoriteId(favorites, poems[currentIndex].id);
		updateFavoriteButton();
	});
	EL.copyBtn.addEventListener("click", async () => {
		try {
			await copyText(formatPoemText(poems[currentIndex]));
			showStatus("Copiado");
		} catch {
			showStatus("No se pudo copiar");
		}
	});
	EL.shareBtn.addEventListener("click", shareCurrentPoem);
	EL.prevBtn.addEventListener("click", () => step(-1));
	EL.nextBtn.addEventListener("click", () => step(1));
	window.addEventListener("keydown", (event) => {
		if (event.key === "ArrowLeft") step(-1);
		if (event.key === "ArrowRight") step(1);
	});
}

function render(poem) {
	EL.title.textContent = poem.title;
	EL.meta.textContent = metaText(poem);
	EL.content.textContent = poem.content;
	document.title = `${poem.title} — Literalia`;
	history.replaceState(null, "", `?id=${encodeURIComponent(poem.id)}`);
	updateFavoriteButton();
	trackPoemView(poem);
}

function step(delta) {
	currentIndex = (currentIndex + delta + poems.length) % poems.length;
	render(poems[currentIndex]);
}

function updateFavoriteButton() {
	const isFavorite = favorites.has(poems[currentIndex].id);
	EL.favBtn.textContent = isFavorite ? "♥ Quitar" : "♡ Favorito";
	EL.favBtn.setAttribute("aria-pressed", String(isFavorite));
}

async function shareCurrentPoem() {
	const poem = poems[currentIndex];
	const url = `${location.origin}${location.pathname}?id=${encodeURIComponent(poem.id)}`;
	const title = poem.title;
	const text = `${title} — ${metaText(poem)}`;

	if (navigator.share) {
		try {
			await navigator.share({title, text, url});
			return;
		} catch {
			return;
		}
	}

	try {
		await copyText(url);
		showStatus("Enlace copiado");
	} catch {
		showStatus("No se pudo compartir");
	}
}

function showError(message) {
	EL.title.textContent = message;
	EL.meta.textContent = "";
	EL.content.textContent = "";
	EL.favBtn.disabled = true;
	EL.copyBtn.disabled = true;
	EL.shareBtn.disabled = true;
	EL.prevBtn.disabled = true;
	EL.nextBtn.disabled = true;
}

function showStatus(message) {
	EL.status.textContent = message;
	clearTimeout(showStatus.timeout);
	showStatus.timeout = setTimeout(() => {
		EL.status.textContent = "";
	}, 1600);
}

function getIdFromURL() {
	const url = new URL(location.href);
	return url.searchParams.get("id") || (location.hash.match(/^#poema\/(.+)$/)?.[1] ?? null);
}
