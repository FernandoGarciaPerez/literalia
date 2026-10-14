document.addEventListener("DOMContentLoaded", () => {
	const botones = document.querySelectorAll(".btn-leido");

	// Cargar estado de lectura desde LocalStorage
	botones.forEach((boton) => {
		const texto = boton.closest(".texto");
		const id = texto.dataset.id;

		if (localStorage.getItem(`leido_${id}`) === "true") {
			texto.classList.add("leido");
			boton.textContent = "Leído";
			boton.disabled = true;
		}

		boton.addEventListener("click", () => {
			texto.classList.add("leido");
			localStorage.setItem(`leido_${id}`, "true");
			boton.textContent = "Leído";
			boton.disabled = true;
		});
	});
});
