document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("demo-survey-form");

  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    alert("Demo form submission prevented.");
  });
});