const STORE_KEYS = {
	favorites: "poemario:favorites",
};

export async function loadPoems() {
	const response = await fetch("poemas.txt", {cache: "no-store"});
	if (!response.ok) {
		throw new Error(`No se pudo cargar poemas.txt (${response.status})`);
	}

	const raw = await response.text();
	return parsePoems(raw).map((poem, index) => ({
		...poem,
		id: slug(`${poem.title}-${poem.author}`) || `poema-${index}`,
		index,
	}));
}

export function parsePoems(text) {
	const normalized = text.replace(/\r\n?/g, "\n");
	const blocks = normalized
		.split(/^\s*---\s*$/m)
		.map((block) => block.trim())
		.filter(Boolean);

	return blocks
		.map(parsePoemBlock)
		.filter((poem) => poem.title || poem.content);
}

export function metaText(poem) {
	const parts = [];
	if (poem.author) parts.push(cleanAuthor(poem.author));
	if (poem.year) parts.push(poem.year);
	if (poem.tags?.length) parts.push(poem.tags.join(" · "));
	return parts.join(" — ");
}

export function formatPoemText(poem) {
	const meta = metaText(poem);
	return `${poem.title}${meta ? `\n${meta}` : ""}\n\n${poem.content}`;
}

export function matchesPoem(poem, query) {
	const normalizedQuery = normalizeText(query);
	if (!normalizedQuery) return true;

	const searchable = normalizeText(
		`${poem.title} ${poem.author} ${poem.year || ""} ${poem.tags?.join(" ") || ""} ${
			poem.content
		}`,
	);
	return searchable.includes(normalizedQuery);
}

export function readFavoriteIds() {
	try {
		const parsed = JSON.parse(localStorage.getItem(STORE_KEYS.favorites) || "[]");
		return new Set(Array.isArray(parsed) ? parsed : []);
	} catch {
		return new Set();
	}
}

export function writeFavoriteIds(favorites) {
	localStorage.setItem(STORE_KEYS.favorites, JSON.stringify([...favorites]));
}

export function toggleFavoriteId(favorites, id) {
	const next = new Set(favorites);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	writeFavoriteIds(next);
	return next;
}

export async function copyText(text) {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.select();

	try {
		document.execCommand("copy");
	} finally {
		textarea.remove();
	}
}

export function slug(value) {
	return normalizeText(value)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 80);
}

function parsePoemBlock(block) {
	const parts = block.split(/\n{2,}/);
	const rawHeader = parts.shift() || "";
	const body = parts.join("\n\n").trim();
	const header = {};

	rawHeader.split(/\n/).forEach((line) => {
		const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
		if (match) header[match[1].trim().toLowerCase()] = match[2].trim();
	});

	const tags = header.tags
		? header.tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean)
		: [];

	return {
		title: header.title || "Sin título",
		author: header.author || "Anónimo",
		year: header.year || "",
		tags,
		content: body,
	};
}

function cleanAuthor(author) {
	return author.replace(/^autor:\s*/i, "").trim();
}

function normalizeText(value) {
	return String(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}
