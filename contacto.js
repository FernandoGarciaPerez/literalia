const form = document.getElementById("contactForm");
const status = document.getElementById("contactStatus");

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	const endpoint = form.dataset.endpoint?.trim();
	if (!endpoint) {
		showStatus("Formulario listo. Falta configurar el endpoint de envío.");
		return;
	}

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			body: new FormData(form),
			headers: {Accept: "application/json"},
		});

		if (!response.ok) throw new Error("No se pudo enviar el formulario");

		form.reset();
		showStatus("Mensaje enviado. Gracias por escribir.");
	} catch (error) {
		console.error(error);
		showStatus("No se pudo enviar. Inténtalo de nuevo más tarde.");
	}
});

function showStatus(message) {
	status.textContent = message;
	clearTimeout(showStatus.timeout);
	showStatus.timeout = setTimeout(() => {
		status.textContent = "";
	}, 3200);
}
