const setupForm = document.querySelector("#collegeSetupForm");
const logoInput = setupForm.elements.collegeLogo;
const logoPreview = document.querySelector("#logoPreview");
let logoData = "";

Campusly.api("branding", null, "GET")
  .then(({ college }) => {
    Campusly.applyBranding(college);
    if (college) window.location.replace("director-login.html");
  })
  .catch((error) => showSetupMessage(error.message));

logoInput.addEventListener("change", () => {
  const file = logoInput.files[0];
  if (!file) {
    logoData = "";
    logoPreview.hidden = true;
    return;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) {
    logoInput.value = "";
    logoData = "";
    logoPreview.hidden = true;
    showSetupMessage("Choose a PNG, JPEG or WebP image smaller than 1 MB.");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    logoData = reader.result;
    logoPreview.querySelector("img").src = logoData;
    logoPreview.querySelector("span").textContent = file.name;
    logoPreview.hidden = false;
  });
  reader.addEventListener("error", () => showSetupMessage("The selected logo could not be read."));
  reader.readAsDataURL(file);
});

function showSetupMessage(message) {
  const output = document.querySelector(".login-message");
  output.textContent = message;
  output.hidden = false;
}

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.querySelector(".login-message");
  output.hidden = true;
  if (setupForm.elements.password.value !== setupForm.elements.confirmPassword.value) {
    showSetupMessage("Passwords do not match.");
    return;
  }
  const button = setupForm.querySelector(".sign-in-button");
  button.disabled = true;
  try {
    await Campusly.api("register", {
      collegeName: setupForm.elements.collegeName.value.trim(),
      collegeCode: setupForm.elements.collegeCode.value.trim().toUpperCase(),
      logo: logoData || null,
      directorName: setupForm.elements.directorName.value.trim(),
      email: setupForm.elements.identity.value.trim().toLowerCase(),
      password: setupForm.elements.password.value,
    });
    window.location.href = "index.html";
  } catch (error) {
    showSetupMessage(error.message || "College setup failed. Please try again.");
  } finally {
    button.disabled = false;
  }
});
