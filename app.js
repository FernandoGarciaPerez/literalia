import {
	copyText,
	formatPoemText,
	loadPoems,
	matchesPoem,
	metaText,
	readFavoriteIds,
	toggleFavoriteId,
} from "./poems.js";
import {trackHomeView} from "./analytics.js?v=20261014-mobile-cache";

const DOM = {
	list: document.getElementById("poemList"),
	search: document.getElementById("searchInput"),
	filter: document.getElementById("filterSelect"),
	randomBtn: document.getElementById("randomBtn"),
	cardTpl: document.getElementById("poemCardTpl"),
	tagFilters: document.getElementById("tagFilters"),
	poemCount: document.getElementById("poemCount"),
	favoriteCountNumber: document.getElementById("favoriteCountNumber"),
	favoriteCount: document.getElementById("favoriteCount"),
};

let poems = [];
let filtered = [];
let favorites = readFavoriteIds();
let activeTag = "all";

init();

async function init() {
	try {
		poems = await loadPoems();
	} catch (error) {
		console.error("Error cargando poemas.txt", error);
		showMessage("No se pudo cargar poemas.txt. Sirve el sitio desde un servidor local o hosting.");
		DOM.list.setAttribute("aria-busy", "false");
		return;
	}

	DOM.poemCount.textContent = poems.length;
	trackHomeView();
	renderTagFilters();
	wireUI();
	renderList();
}

function wireUI() {
	DOM.search.addEventListener("input", renderList);
	DOM.filter.addEventListener("change", renderList);
	DOM.randomBtn.addEventListener("click", navigateRandom);

	window.addEventListener("pageshow", syncFavorites);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") syncFavorites();
	});
	window.addEventListener("storage", syncFavorites);
}

function syncFavorites(event) {
	if (event?.key && event.key !== "poemario:favorites") return;
	favorites = readFavoriteIds();
	renderList();
}

function renderTagFilters() {
	const tags = [...new Set(poems.flatMap((poem) => poem.tags || []))]
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b, "es"));

	DOM.tagFilters.innerHTML = "";
	DOM.tagFilters.appendChild(createTagButton("all", "Todos"));

	for (const tag of tags) {
		DOM.tagFilters.appendChild(createTagButton(tag, tag));
	}
}

function createTagButton(value, label) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "tag-chip";
	button.textContent = label;
	button.dataset.tag = value;
	button.setAttribute("aria-pressed", String(value === activeTag));
	button.addEventListener("click", () => {
		activeTag = value;
		document.querySelectorAll(".tag-chip").forEach((chip) => {
			chip.setAttribute("aria-pressed", String(chip.dataset.tag === activeTag));
		});
		renderList();
	});
	return button;
}

function renderList() {
	DOM.list.setAttribute("aria-busy", "true");
	const query = DOM.search.value.trim();
	const onlyFavorites = DOM.filter.value === "favorites";

	filtered = poems.filter((poem) => {
		if (onlyFavorites && !favorites.has(poem.id)) return false;
		if (activeTag !== "all" && !poem.tags?.includes(activeTag)) return false;
		return matchesPoem(poem, query);
	});

	DOM.list.innerHTML = "";
	DOM.randomBtn.disabled = filtered.length === 0;
	updateFavoriteCount();

	if (!filtered.length) {
		showMessage(onlyFavorites ? "No tienes poemas favoritos todavía." : "No hay resultados.");
		DOM.list.setAttribute("aria-busy", "false");
		return;
	}

	const fragment = document.createDocumentFragment();
	for (const poem of filtered) {
		fragment.appendChild(renderCard(poem));
	}

	DOM.list.appendChild(fragment);
	DOM.list.setAttribute("aria-busy", "false");
}

function renderCard(poem) {
	const node = DOM.cardTpl.content.cloneNode(true);
	const card = node.querySelector(".card");
	const favoriteButton = node.querySelector(".fav-toggle");

	card.dataset.id = poem.id;
	node.querySelector(".card-title").textContent = poem.title;
	node.querySelector(".card-meta").textContent = metaText(poem);

	updateFavoriteButton(favoriteButton, favorites.has(poem.id));
	favoriteButton.addEventListener("click", () => {
		favorites = toggleFavoriteId(favorites, poem.id);
		updateFavoriteButton(favoriteButton, favorites.has(poem.id));
		if (DOM.filter.value === "favorites") renderList();
		else updateFavoriteCount();
	});

	node.querySelector('[data-action="open"]').addEventListener("click", () => goToPoem(poem.id));
	node.querySelector('[data-action="copy"]').addEventListener("click", async () => {
		try {
			await copyText(formatPoemText(poem));
			flash(card, "Copiado");
		} catch {
			flash(card, "No se pudo copiar");
		}
	});
	card.addEventListener("click", (event) => {
		if (event.target.closest("button")) return;
		goToPoem(poem.id);
	});

	return node;
}

function updateFavoriteButton(button, isFavorite) {
	button.classList.toggle("active", isFavorite);
	button.setAttribute("aria-pressed", String(isFavorite));
	button.setAttribute("aria-label", isFavorite ? "Quitar de favoritos" : "Marcar como favorito");
	button.title = isFavorite ? "Quitar de favoritos" : "Marcar como favorito";
	button.textContent = isFavorite ? "♥" : "♡";
}

function updateFavoriteCount() {
	DOM.favoriteCountNumber.textContent = favorites.size;
	DOM.favoriteCount.textContent = favorites.size === 1 ? "favorito" : "favoritos";
}

function goToPoem(id) {
	window.location.href = `poema.html?id=${encodeURIComponent(id)}`;
}

function navigateRandom() {
	if (!filtered.length) return;
	const poem = filtered[Math.floor(Math.random() * filtered.length)];
	goToPoem(poem.id);
}

function showMessage(message) {
	DOM.list.innerHTML = `<div class="card empty-state"><p>${message}</p></div>`;
}

function flash(element, message) {
	const tip = document.createElement("div");
	tip.textContent = message;
	tip.className = "toast";
	(element.closest(".card") || element).appendChild(tip);

	requestAnimationFrame(() => {
		tip.classList.add("show");
	});
	setTimeout(() => {
		tip.classList.remove("show");
		setTimeout(() => tip.remove(), 220);
	}, 1200);
}
