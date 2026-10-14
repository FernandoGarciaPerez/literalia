const TRACK_ENDPOINT = "track.php";

export function trackHomeView() {
	track({type: "home"});
}

export function trackPoemView(poem) {
	track({
		type: "poem",
		poemId: poem.id,
		title: poem.title,
	});
}

function track(payload) {
	const body = JSON.stringify({
		...payload,
		path: location.pathname,
		referrer: document.referrer || "",
	});

	if (navigator.sendBeacon) {
		const blob = new Blob([body], {type: "application/json"});
		navigator.sendBeacon(TRACK_ENDPOINT, blob);
		return;
	}

	fetch(TRACK_ENDPOINT, {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body,
		keepalive: true,
	}).catch(() => {});
}
