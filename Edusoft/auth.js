(() => {
  async function api(action, payload, method = "POST") {
    const options = { method, headers: { Accept: "application/json" }, credentials: "same-origin" };
    if (method !== "GET") {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(payload || {});
    }

    let response;
    try {
      response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, options);
    } catch (error) {
      throw new Error("Cannot reach the PHP backend. Open the site through the PHP server, not as a file.");
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error("The PHP backend returned an invalid response. Check the server configuration.");
    }
    if (!response.ok) {
      const error = new Error(result.error || "The request could not be completed.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function applyBranding(college) {
    if (!college) return;
    document.querySelectorAll(".brand").forEach((brand) => {
      const mark = brand.querySelector(".brand-mark");
      if (mark) {
        mark.replaceChildren();
        if (college.logo) {
          const image = document.createElement("img");
          image.src = college.logo;
          image.alt = "";
          mark.append(image);
        } else {
          mark.textContent = "E";
        }
      }
    });
    document.querySelectorAll("[data-college-name]").forEach((element) => {
      element.textContent = college.name;
    });
    document.querySelectorAll("[data-college-code]").forEach((element) => {
      element.textContent = college.code;
    });
    document.title = `${college.name} | EdusoftX`;
  }

  window.Campusly = { api, applyBranding };
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const result = await api("branding", null, "GET");
      applyBranding(result.college);
    } catch (error) {
      console.error("Could not load college branding.", error);
    }
  });
})();
