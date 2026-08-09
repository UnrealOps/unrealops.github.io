document.documentElement.classList.add("js");

const header = document.querySelector("[data-header]");
const progress = document.querySelector(".page-progress span");
const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const hero = document.querySelector(".hero");
const heroImage = document.querySelector(".hero-image");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const updateScrollUI = () => {
  const scrollTop = window.scrollY;
  const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
  const percent = scrollRange > 0 ? Math.min((scrollTop / scrollRange) * 100, 100) : 0;

  header?.classList.toggle("is-scrolled", scrollTop > 24);
  if (progress) progress.style.width = `${percent}%`;
};

updateScrollUI();
window.addEventListener("scroll", updateScrollUI, { passive: true });

const setMenuState = (isOpen) => {
  if (!menuToggle || !mobileNav) return;
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.querySelector(".sr-only").textContent = isOpen ? "Close navigation" : "Open navigation";
  mobileNav.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("menu-open", isOpen);
};

menuToggle?.addEventListener("click", () => {
  setMenuState(menuToggle.getAttribute("aria-expanded") !== "true");
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuState(false);
});

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.08, rootMargin: "0px 0px -40px" },
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

if (hero && heroImage && !prefersReducedMotion.matches) {
  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const rect = hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    heroImage.style.transform = `scale(1.035) translate(${x * -8}px, ${y * -7}px)`;
  });

  hero.addEventListener("pointerleave", () => {
    heroImage.style.transform = "scale(1.02)";
  });
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
