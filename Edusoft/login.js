const form = document.querySelector(".login-form");
const role = document.body.dataset.role;
const registerLink = document.querySelector("#collegeRegisterLink");
const message = document.querySelector(".login-message");

Campusly.api("branding", null, "GET")
  .then(({ college }) => {
    Campusly.applyBranding(college);
    if (registerLink && college) registerLink.hidden = true;
  })
  .catch((error) => {
    if (!form) console.error("Could not load college branding.", error);
  });

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const identity = form.elements.identity.value.trim().toLowerCase();
  const password = form.elements.password.value;
  if (!identity || !password) return;
  message.hidden = true;
  const button = form.querySelector(".sign-in-button");
  button.disabled = true;
  try {
    const payload = role === "student"
      ? { rollNumber: identity, dateOfBirth: form.elements.dateOfBirth.value, password, role }
      : { email: identity, password, role };
    await Campusly.api("login", payload);
    window.location.href = "index.html";
  } catch (error) {
    message.textContent = error.message || "Sign-in failed. Please try again.";
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("[data-demo-link]")?.addEventListener("click", (event) => {
  event.preventDefault();
  message.textContent = "Password recovery is not available yet. Please contact your college office.";
  message.hidden = false;
});
