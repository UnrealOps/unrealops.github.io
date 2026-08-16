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

const setupGame = () => {
  const canvas = document.querySelector("#unrealops-game");
  const gameFrame = canvas?.closest(".game-frame");
  const toggleButton = document.querySelector("[data-game-toggle]");
  const startButton = document.querySelector("[data-game-start]");
  const resetButton = document.querySelector("[data-game-reset]");
  const statusLabel = document.querySelector("[data-game-status]");

  if (!(canvas instanceof HTMLCanvasElement) || !gameFrame) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const GAME_WIDTH = canvas.width;
  const GAME_HEIGHT = canvas.height;
  const PLAYER_SPEED = 270;
  const BULLET_SPEED = 820;
  const MAGIC_BALL_SPEED = 190;
  const FIRE_INTERVAL = 0.24;
  const SHOOT_DURATION = 0.24;
  const GHOST_CAST_DURATION = 0.72;
  const GHOST_SPEED = 42;
  const PLAYER_MAX_HEALTH = 5;
  const MAX_GHOSTS = 2;
  const GHOST_SPAWN_INTERVAL = 11;
  const PLAY_AREA = { left: 92, right: 1108, top: 225, bottom: 620 };
  const controlKeys = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
  ]);

  const player = { x: GAME_WIDTH / 2, y: 448, health: PLAYER_MAX_HEALTH, invulnerable: 0 };
  const pointer = { x: GAME_WIDTH / 2 + 190, y: 360, active: false };
  const keys = new Set();
  const bullets = [];
  const magicBalls = [];
  const ghosts = [];
  const sparks = [];
  const spriteImages = {};
  const arena = document.createElement("canvas");
  arena.width = GAME_WIDTH;
  arena.height = GAME_HEIGHT;

  let isPlaying = false;
  let spritesReady = false;
  let pendingStart = false;
  let isFiring = false;
  let fireCooldown = 0;
  let shootTimer = 0;
  let gameTime = 0;
  let runPhase = 0;
  let lastFrameTime = performance.now();
  let aimAngle = 0;
  let aimDirection = 2;
  let ghostSpawnTimer = 0.45;
  let ghostSerial = 0;
  let score = 0;
  let damageFlash = 0;
  let gameOver = false;

  const setStatus = (message) => {
    if (statusLabel) statusLabel.textContent = message;
  };

  const seededRandom = (() => {
    let seed = 1947;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  })();

  const drawDiamond = (arenaContext, x, y, width, height, fill, stroke) => {
    arenaContext.beginPath();
    arenaContext.moveTo(x, y - height / 2);
    arenaContext.lineTo(x + width / 2, y);
    arenaContext.lineTo(x, y + height / 2);
    arenaContext.lineTo(x - width / 2, y);
    arenaContext.closePath();
    arenaContext.fillStyle = fill;
    arenaContext.fill();
    arenaContext.strokeStyle = stroke;
    arenaContext.stroke();
  };

  const buildArena = () => {
    const arenaContext = arena.getContext("2d");
    if (!arenaContext) return;

    const background = arenaContext.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    background.addColorStop(0, "#020814");
    background.addColorStop(0.5, "#061525");
    background.addColorStop(1, "#020711");
    arenaContext.fillStyle = background;
    arenaContext.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const horizonGlow = arenaContext.createRadialGradient(600, 200, 0, 600, 250, 520);
    horizonGlow.addColorStop(0, "rgba(21, 164, 236, 0.22)");
    horizonGlow.addColorStop(0.42, "rgba(8, 79, 126, 0.1)");
    horizonGlow.addColorStop(1, "rgba(2, 7, 17, 0)");
    arenaContext.fillStyle = horizonGlow;
    arenaContext.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const tileWidth = 112;
    const tileHeight = 56;
    const originX = GAME_WIDTH / 2;
    const originY = 236;
    arenaContext.lineWidth = 1;

    for (let row = -3; row <= 10; row += 1) {
      for (let column = -8; column <= 8; column += 1) {
        const x = originX + (column - row) * (tileWidth / 2);
        const y = originY + (column + row) * (tileHeight / 2);
        if (x < -tileWidth || x > GAME_WIDTH + tileWidth || y < 185 || y > GAME_HEIGHT + tileHeight) {
          continue;
        }

        const variation = seededRandom();
        const blue = 18 + Math.floor(variation * 10);
        const fill = `rgba(5, ${blue}, ${blue + 15}, ${0.44 + variation * 0.16})`;
        const stroke = variation > 0.87 ? "rgba(255, 87, 39, 0.24)" : "rgba(72, 181, 238, 0.14)";
        drawDiamond(arenaContext, x, y, tileWidth, tileHeight, fill, stroke);

        if (variation > 0.93) {
          arenaContext.fillStyle = variation > 0.97 ? "rgba(255, 89, 38, 0.52)" : "rgba(42, 185, 246, 0.4)";
          arenaContext.fillRect(x - 14, y - 1, 28, 2);
        }
      }
    }

    const beaconPositions = [
      [170, 334],
      [1010, 326],
      [286, 542],
      [914, 550],
    ];

    beaconPositions.forEach(([x, y], index) => {
      const color = index % 2 === 0 ? "rgba(37, 186, 250, 0.8)" : "rgba(255, 81, 34, 0.76)";
      arenaContext.strokeStyle = color;
      arenaContext.fillStyle = "rgba(3, 12, 23, 0.84)";
      arenaContext.beginPath();
      arenaContext.ellipse(x, y, 38, 18, 0, 0, Math.PI * 2);
      arenaContext.fill();
      arenaContext.stroke();
      arenaContext.beginPath();
      arenaContext.ellipse(x, y, 24, 10, 0, 0, Math.PI * 2);
      arenaContext.stroke();
      arenaContext.fillStyle = color;
      arenaContext.fillRect(x - 2, y - 28, 4, 28);
    });

    const vignette = arenaContext.createRadialGradient(600, 390, 190, 600, 390, 690);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.68)");
    arenaContext.fillStyle = vignette;
    arenaContext.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  };

  const loadImage = (source) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener("error", reject, { once: true });
      image.src = source;
    });

  const directionForAngle = (angle) => (2 - Math.round(angle / (Math.PI / 4)) + 8) % 8;

  const addBurst = (x, y, color, count = 10, speedMultiplier = 1) => {
    for (let index = 0; index < count; index += 1) {
      const angle = seededRandom() * Math.PI * 2;
      const speed = (45 + seededRandom() * 155) * speedMultiplier;
      sparks.push({
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life: 0.2 + seededRandom() * 0.28,
        color,
      });
    }
  };

  const spawnGhost = () => {
    const spawnPoints = [
      [164, 302],
      [1032, 314],
      [204, 568],
      [1002, 566],
      [600, 252],
    ];
    const [x, y] = spawnPoints[ghostSerial % spawnPoints.length];
    ghostSerial += 1;
    ghosts.push({
      x,
      y,
      health: 3,
      maxHealth: 3,
      direction: directionForAngle(Math.atan2(player.y - y, player.x - x)),
      movePhase: seededRandom() * 3,
      driftPhase: seededRandom() * Math.PI * 2,
      spawnTimer: 0.58,
      attackCooldown: 1.25 + seededRandom() * 0.75,
      castTimer: 0,
      castLaunched: false,
      hitTimer: 0,
      deathTimer: 0,
    });
    addBurst(x, y - 68, "#35c9ff", 16, 0.75);
  };

  const throwMagicBall = (ghost) => {
    const targetX = player.x;
    const targetY = player.y - 92;
    const originX = ghost.x;
    const originY = ghost.y - 104;
    const angle = Math.atan2(targetY - originY, targetX - originX);
    magicBalls.push({
      x: originX,
      y: originY,
      previousX: originX,
      previousY: originY,
      velocityX: Math.cos(angle) * MAGIC_BALL_SPEED,
      velocityY: Math.sin(angle) * MAGIC_BALL_SPEED,
      radius: 17,
      phase: seededRandom() * Math.PI * 2,
      life: 3.4,
    });
    addBurst(originX, originY, "#ff7440", 9, 0.65);
  };

  const segmentHitsCircle = (startX, startY, endX, endY, centerX, centerY, radius) => {
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY || 1;
    const projection = Math.max(
      0,
      Math.min(1, ((centerX - startX) * segmentX + (centerY - startY) * segmentY) / lengthSquared),
    );
    const nearestX = startX + segmentX * projection;
    const nearestY = startY + segmentY * projection;
    return Math.hypot(centerX - nearestX, centerY - nearestY) <= radius;
  };

  const resetGame = () => {
    player.x = GAME_WIDTH / 2;
    player.y = 448;
    pointer.x = player.x + 190;
    pointer.y = player.y - 88;
    aimAngle = 0;
    aimDirection = 2;
    player.health = PLAYER_MAX_HEALTH;
    player.invulnerable = 0;
    bullets.length = 0;
    magicBalls.length = 0;
    ghosts.length = 0;
    sparks.length = 0;
    shootTimer = 0;
    fireCooldown = 0;
    ghostSpawnTimer = 0.45;
    ghostSerial = 0;
    score = 0;
    damageFlash = 0;
    gameOver = false;
  };

  const pauseGame = (message = "Paused") => {
    if (!isPlaying) return;
    isPlaying = false;
    isFiring = false;
    keys.clear();
    gameFrame.classList.remove("is-playing");
    if (toggleButton) {
      toggleButton.textContent = "Resume game";
      toggleButton.setAttribute("aria-pressed", "false");
    }
    setStatus(message);
  };

  const startGame = () => {
    if (!spritesReady) {
      pendingStart = true;
      setStatus("Loading game");
      return;
    }

    if (gameOver) resetGame();

    isPlaying = true;
    pendingStart = false;
    gameFrame.classList.add("is-playing");
    if (toggleButton) {
      toggleButton.textContent = "Pause game";
      toggleButton.setAttribute("aria-pressed", "true");
    }
    setStatus("Playing");
    canvas.focus({ preventScroll: true });
    lastFrameTime = performance.now();
  };

  const toggleGame = () => {
    if (isPlaying) pauseGame();
    else startGame();
  };

  const canvasPoint = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * GAME_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * GAME_HEIGHT,
    };
  };

  const updateAim = () => {
    aimAngle = Math.atan2(pointer.y - (player.y - 112), pointer.x - player.x);
    const currentDirectionAngle = (2 - aimDirection) * (Math.PI / 4);
    const directionDelta = Math.atan2(
      Math.sin(aimAngle - currentDirectionAngle),
      Math.cos(aimAngle - currentDirectionAngle),
    );

    if (Math.abs(directionDelta) > Math.PI / 8 + 0.055) {
      const sector = Math.round(aimAngle / (Math.PI / 4));
      aimDirection = (2 - sector + 8) % 8;
    }

    return aimAngle;
  };

  const fireBullet = () => {
    const angle = updateAim();
    const originX = player.x + Math.cos(angle) * 48;
    const originY = player.y - 112 + Math.sin(angle) * 32;
    const velocityX = Math.cos(angle) * BULLET_SPEED;
    const velocityY = Math.sin(angle) * BULLET_SPEED;

    bullets.push({ x: originX, y: originY, previousX: originX, previousY: originY, velocityX, velocityY, life: 1.1 });
    for (let index = 0; index < 7; index += 1) {
      const spread = (seededRandom() - 0.5) * 1.25;
      const speed = 55 + seededRandom() * 135;
      sparks.push({
        x: originX,
        y: originY,
        velocityX: Math.cos(angle + spread) * speed,
        velocityY: Math.sin(angle + spread) * speed,
        life: 0.16 + seededRandom() * 0.18,
      });
    }

    shootTimer = SHOOT_DURATION;
    fireCooldown = FIRE_INTERVAL;
  };

  const update = (deltaTime) => {
    gameTime += deltaTime;
    fireCooldown = Math.max(0, fireCooldown - deltaTime);
    shootTimer = Math.max(0, shootTimer - deltaTime);
    player.invulnerable = Math.max(0, player.invulnerable - deltaTime);
    damageFlash = Math.max(0, damageFlash - deltaTime);

    let horizontal = 0;
    let vertical = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) horizontal -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) horizontal += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) vertical -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) vertical += 1;

    const magnitude = Math.hypot(horizontal, vertical) || 1;
    const movingNow = horizontal !== 0 || vertical !== 0;
    player.x += (horizontal / magnitude) * PLAYER_SPEED * deltaTime;
    player.y += (vertical / magnitude) * PLAYER_SPEED * deltaTime;
    player.x = Math.max(PLAY_AREA.left, Math.min(PLAY_AREA.right, player.x));
    player.y = Math.max(PLAY_AREA.top, Math.min(PLAY_AREA.bottom, player.y));
    if (movingNow) runPhase = (runPhase + deltaTime * 11) % 4;
    updateAim();

    if (isFiring && fireCooldown <= 0) fireBullet();

    bullets.forEach((bullet) => {
      bullet.previousX = bullet.x;
      bullet.previousY = bullet.y;
      bullet.x += bullet.velocityX * deltaTime;
      bullet.y += bullet.velocityY * deltaTime;
      bullet.life -= deltaTime;
    });

    ghostSpawnTimer -= deltaTime;
    const livingGhostCount = ghosts.filter((ghost) => ghost.health > 0).length;
    if (ghostSpawnTimer <= 0) {
      if (livingGhostCount < MAX_GHOSTS) {
        spawnGhost();
        ghostSpawnTimer = GHOST_SPAWN_INTERVAL + seededRandom() * 1.6;
      } else {
        ghostSpawnTimer = 1;
      }
    }

    ghosts.forEach((ghost) => {
      ghost.hitTimer = Math.max(0, ghost.hitTimer - deltaTime);
      ghost.movePhase = (ghost.movePhase + deltaTime * 6.5) % 3;

      if (ghost.health <= 0) {
        ghost.deathTimer += deltaTime;
        return;
      }

      ghost.spawnTimer = Math.max(0, ghost.spawnTimer - deltaTime);
      const differenceX = player.x - ghost.x;
      const differenceY = player.y - ghost.y;
      const distance = Math.hypot(differenceX, differenceY) || 1;
      const normalizedX = differenceX / distance;
      const normalizedY = differenceY / distance;
      ghost.direction = directionForAngle(Math.atan2(differenceY, differenceX));

      if (ghost.spawnTimer > 0) return;

      if (ghost.castTimer > 0) {
        ghost.castTimer = Math.max(0, ghost.castTimer - deltaTime);
        if (!ghost.castLaunched && ghost.castTimer <= GHOST_CAST_DURATION * 0.42) {
          ghost.castLaunched = true;
          throwMagicBall(ghost);
        }
        if (ghost.castTimer === 0) ghost.attackCooldown = 2.45 + seededRandom() * 0.95;
        return;
      }

      ghost.attackCooldown -= deltaTime;
      if (ghost.attackCooldown <= 0 && distance < 680) {
        ghost.castTimer = GHOST_CAST_DURATION;
        ghost.castLaunched = false;
        return;
      }

      let approach = 0;
      if (distance > 320) approach = 1;
      else if (distance < 230) approach = -0.72;
      const strafe = Math.sin(gameTime * 0.72 + ghost.driftPhase) * 0.3;
      const movementX = normalizedX * approach - normalizedY * strafe;
      const movementY = normalizedY * approach + normalizedX * strafe;
      const movementLength = Math.hypot(movementX, movementY) || 1;
      ghost.x += (movementX / movementLength) * GHOST_SPEED * deltaTime;
      ghost.y += (movementY / movementLength) * GHOST_SPEED * deltaTime;
      ghost.x = Math.max(PLAY_AREA.left + 18, Math.min(PLAY_AREA.right - 18, ghost.x));
      ghost.y = Math.max(PLAY_AREA.top + 10, Math.min(PLAY_AREA.bottom - 12, ghost.y));
    });

    for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
      const bullet = bullets[bulletIndex];
      const hitGhost = ghosts.find(
        (ghost) =>
          ghost.health > 0 &&
          ghost.spawnTimer <= 0.32 &&
          segmentHitsCircle(
            bullet.previousX,
            bullet.previousY,
            bullet.x,
            bullet.y,
            ghost.x,
            ghost.y - 92,
            58,
          ),
      );
      if (!hitGhost) continue;

      bullets.splice(bulletIndex, 1);
      hitGhost.health -= 1;
      hitGhost.hitTimer = 0.15;
      addBurst(bullet.x, bullet.y, "#ff8a4b", 8, 0.7);
      if (hitGhost.health <= 0) {
        hitGhost.deathTimer = 0.001;
        score += 100;
        addBurst(hitGhost.x, hitGhost.y - 78, "#47d7ff", 24, 1.2);
      }
    }

    magicBalls.forEach((magicBall) => {
      magicBall.previousX = magicBall.x;
      magicBall.previousY = magicBall.y;
      magicBall.x += magicBall.velocityX * deltaTime;
      magicBall.y += magicBall.velocityY * deltaTime;
      magicBall.phase += deltaTime * 8;
      magicBall.life -= deltaTime;
    });

    for (let index = magicBalls.length - 1; index >= 0; index -= 1) {
      const magicBall = magicBalls[index];
      const struckPlayer = segmentHitsCircle(
        magicBall.previousX,
        magicBall.previousY,
        magicBall.x,
        magicBall.y,
        player.x,
        player.y - 92,
        magicBall.radius + 25,
      );
      if (!struckPlayer) continue;

      magicBalls.splice(index, 1);
      addBurst(magicBall.x, magicBall.y, "#5ed8ff", 18, 0.95);
      if (player.invulnerable > 0) continue;

      player.health = Math.max(0, player.health - 1);
      player.invulnerable = 0.82;
      damageFlash = 0.24;
      if (player.health === 0) {
        gameOver = true;
        damageFlash = 0;
        pauseGame("Defeated — reset or start again");
        if (toggleButton) toggleButton.textContent = "Restart game";
      }
    }

    sparks.forEach((spark) => {
      spark.x += spark.velocityX * deltaTime;
      spark.y += spark.velocityY * deltaTime;
      spark.velocityX *= 0.94;
      spark.velocityY *= 0.94;
      spark.life -= deltaTime;
    });

    for (let index = bullets.length - 1; index >= 0; index -= 1) {
      const bullet = bullets[index];
      if (bullet.life <= 0 || bullet.x < -80 || bullet.x > GAME_WIDTH + 80 || bullet.y < -80 || bullet.y > GAME_HEIGHT + 80) {
        bullets.splice(index, 1);
      }
    }

    for (let index = magicBalls.length - 1; index >= 0; index -= 1) {
      const magicBall = magicBalls[index];
      if (
        magicBall.life <= 0 ||
        magicBall.x < -100 ||
        magicBall.x > GAME_WIDTH + 100 ||
        magicBall.y < -100 ||
        magicBall.y > GAME_HEIGHT + 100
      ) {
        magicBalls.splice(index, 1);
      }
    }

    for (let index = ghosts.length - 1; index >= 0; index -= 1) {
      if (ghosts[index].health <= 0 && ghosts[index].deathTimer >= 0.48) ghosts.splice(index, 1);
    }

    for (let index = sparks.length - 1; index >= 0; index -= 1) {
      if (sparks[index].life <= 0) sparks.splice(index, 1);
    }
  };

  const drawProjectiles = () => {
    context.save();
    context.lineCap = "round";
    context.globalCompositeOperation = "screen";

    magicBalls.forEach((magicBall) => {
      const trail = context.createLinearGradient(
        magicBall.previousX,
        magicBall.previousY,
        magicBall.x,
        magicBall.y,
      );
      trail.addColorStop(0, "rgba(48, 174, 255, 0)");
      trail.addColorStop(0.55, "rgba(45, 183, 255, 0.56)");
      trail.addColorStop(1, "rgba(255, 93, 42, 0.95)");
      context.strokeStyle = trail;
      context.lineWidth = 13;
      context.shadowColor = "#1ebcff";
      context.shadowBlur = 22;
      context.beginPath();
      context.moveTo(magicBall.previousX, magicBall.previousY);
      context.lineTo(magicBall.x, magicBall.y);
      context.stroke();

      const orb = context.createRadialGradient(
        magicBall.x - 4,
        magicBall.y - 5,
        1,
        magicBall.x,
        magicBall.y,
        magicBall.radius,
      );
      orb.addColorStop(0, "#fff8d6");
      orb.addColorStop(0.23, "#ffad3f");
      orb.addColorStop(0.58, "#ff4928");
      orb.addColorStop(1, "rgba(28, 134, 255, 0.16)");
      context.fillStyle = orb;
      context.beginPath();
      context.arc(magicBall.x, magicBall.y, magicBall.radius, 0, Math.PI * 2);
      context.fill();

      context.save();
      context.translate(magicBall.x, magicBall.y);
      context.rotate(magicBall.phase);
      context.strokeStyle = "rgba(80, 219, 255, 0.86)";
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(0, 0, magicBall.radius + 7, magicBall.radius * 0.48, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    });

    bullets.forEach((bullet) => {
      const gradient = context.createLinearGradient(bullet.previousX, bullet.previousY, bullet.x, bullet.y);
      gradient.addColorStop(0, "rgba(255, 91, 31, 0)");
      gradient.addColorStop(1, "rgba(255, 196, 104, 1)");
      context.strokeStyle = gradient;
      context.lineWidth = 5;
      context.shadowColor = "#ff4a1f";
      context.shadowBlur = 16;
      context.beginPath();
      context.moveTo(bullet.previousX, bullet.previousY);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    });

    sparks.forEach((spark) => {
      context.globalAlpha = Math.min(1, spark.life * 5);
      context.fillStyle = spark.color || "#ff9d50";
      context.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
    });

    context.restore();
  };

  const drawGhost = (ghost) => {
    const image = ghost.castTimer > 0 ? spriteImages.ghostCast : spriteImages.ghostMove;
    if (!image) return;

    const sourceWidth = image.width / 6;
    const sourceHeight = image.height / 4;
    let animationFrame = Math.floor(ghost.movePhase) % 3;
    if (ghost.castTimer > 0) {
      const castElapsed = GHOST_CAST_DURATION - ghost.castTimer;
      animationFrame = Math.min(2, Math.floor((castElapsed / GHOST_CAST_DURATION) * 3));
    }
    const column = (ghost.direction % 2) * 3 + animationFrame;
    const row = Math.floor(ghost.direction / 2);
    const targetHeight = 218;
    const targetWidth = targetHeight * (sourceWidth / sourceHeight);
    const spawnProgress = Math.max(0, Math.min(1, 1 - ghost.spawnTimer / 0.58));
    const deathProgress = ghost.health <= 0 ? Math.min(1, ghost.deathTimer / 0.48) : 0;
    const opacity = spawnProgress * (1 - deathProgress);
    const scale = 0.66 + spawnProgress * 0.34 + deathProgress * 0.1;
    const floatOffset = Math.sin(gameTime * 3.15 + ghost.driftPhase) * 5;

    context.save();
    context.globalAlpha = opacity * 0.56;
    context.fillStyle = "rgba(10, 82, 151, 0.72)";
    context.filter = "blur(7px)";
    context.beginPath();
    context.ellipse(ghost.x, ghost.y + 1, 43 * scale, 14 * scale, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    if (ghost.spawnTimer > 0) {
      context.save();
      context.globalAlpha = (1 - spawnProgress) * 0.8;
      context.strokeStyle = "#3fd8ff";
      context.lineWidth = 2;
      context.shadowColor = "#29bfff";
      context.shadowBlur = 18;
      context.beginPath();
      context.ellipse(ghost.x, ghost.y, 55 + spawnProgress * 24, 22 + spawnProgress * 8, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    context.save();
    context.globalAlpha = opacity;
    context.imageSmoothingEnabled = true;
    context.shadowColor = "rgba(24, 177, 255, 0.72)";
    context.shadowBlur = 23;
    if (ghost.hitTimer > 0) context.filter = "brightness(1.9) saturate(0.55)";
    context.translate(ghost.x, ghost.y + floatOffset - targetHeight + 8);
    context.scale(scale, scale);
    context.drawImage(
      image,
      column * sourceWidth,
      row * sourceHeight,
      sourceWidth,
      sourceHeight,
      -targetWidth / 2,
      0,
      targetWidth,
      targetHeight,
    );
    context.restore();

    if (ghost.health > 0 && ghost.spawnTimer <= 0) {
      const healthWidth = 54;
      context.save();
      context.globalAlpha = 0.9;
      context.fillStyle = "rgba(1, 8, 18, 0.84)";
      context.fillRect(ghost.x - healthWidth / 2 - 2, ghost.y - 217 + floatOffset, healthWidth + 4, 7);
      context.fillStyle = "#ff5b2f";
      context.fillRect(
        ghost.x - healthWidth / 2,
        ghost.y - 215 + floatOffset,
        healthWidth * (ghost.health / ghost.maxHealth),
        3,
      );
      context.restore();
    }
  };

  const isMoving = () =>
    keys.has("KeyW") ||
    keys.has("KeyA") ||
    keys.has("KeyS") ||
    keys.has("KeyD") ||
    keys.has("ArrowUp") ||
    keys.has("ArrowLeft") ||
    keys.has("ArrowDown") ||
    keys.has("ArrowRight");

  const drawPlayer = () => {
    const moving = isPlaying && isMoving();
    let image = spriteImages.idle;
    let columns = 4;
    let rows = 2;
    let column = aimDirection % 4;
    let row = Math.floor(aimDirection / 4);

    if (shootTimer > 0) {
      image = spriteImages.shoot;
      columns = 6;
      rows = 4;
      const shootElapsed = SHOOT_DURATION - shootTimer;
      const animationFrame = Math.min(2, Math.floor((shootElapsed / SHOOT_DURATION) * 3));
      column = (aimDirection % 2) * 3 + animationFrame;
      row = Math.floor(aimDirection / 2);
    } else if (moving) {
      image = spriteImages.run;
      columns = 8;
      rows = 4;
      const animationFrame = Math.floor(runPhase) % 4;
      column = (aimDirection % 2) * 4 + animationFrame;
      row = Math.floor(aimDirection / 2);
    }

    if (!image) return;

    const sourceWidth = image.width / columns;
    const sourceHeight = image.height / rows;
    const targetHeight = 270;
    const targetWidth = targetHeight * (sourceWidth / sourceHeight);
    const idleOffset = !moving && shootTimer <= 0 && isPlaying ? Math.sin(gameTime * 2.8) * 2.2 : 0;

    context.save();
    context.fillStyle = "rgba(0, 0, 0, 0.46)";
    context.filter = "blur(6px)";
    context.beginPath();
    context.ellipse(player.x, player.y - 7, 47, 17, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.imageSmoothingEnabled = true;
    context.globalAlpha =
      player.invulnerable > 0 && Math.floor(gameTime * 18) % 2 === 0 ? 0.48 : 1;
    context.shadowColor = "rgba(18, 154, 235, 0.24)";
    context.shadowBlur = 18;
    if (damageFlash > 0) context.filter = "brightness(1.75) saturate(0.72)";
    context.drawImage(
      image,
      column * sourceWidth,
      row * sourceHeight,
      sourceWidth,
      sourceHeight,
      player.x - targetWidth / 2,
      player.y - targetHeight + 7 + idleOffset,
      targetWidth,
      targetHeight,
    );
    context.restore();
  };

  const drawWorldEntities = () => {
    const entities = ghosts.map((ghost) => ({ y: ghost.y, draw: () => drawGhost(ghost) }));
    entities.push({ y: player.y, draw: drawPlayer });
    entities.sort((first, second) => first.y - second.y);
    entities.forEach((entity) => entity.draw());
  };

  const drawHud = () => {
    const livingGhosts = ghosts.filter((ghost) => ghost.health > 0).length;
    context.save();
    context.fillStyle = "rgba(2, 10, 21, 0.78)";
    context.strokeStyle = "rgba(79, 190, 246, 0.28)";
    context.lineWidth = 1;
    context.fillRect(22, 20, 278, 54);
    context.strokeRect(22.5, 20.5, 277, 53);

    context.font = "600 10px IBM Plex Mono, monospace";
    context.fillStyle = "#83a9c1";
    context.fillText("VITALS", 38, 39);
    for (let index = 0; index < PLAYER_MAX_HEALTH; index += 1) {
      context.fillStyle = index < player.health ? "#ff5b2f" : "rgba(120, 151, 171, 0.2)";
      context.fillRect(38 + index * 22, 50, 16, 7);
    }

    context.fillStyle = "#83a9c1";
    context.fillText(`GHOSTS ${String(livingGhosts).padStart(2, "0")}`, 174, 39);
    context.fillStyle = "#d9f2ff";
    context.fillText(`SCORE ${String(score).padStart(4, "0")}`, 174, 57);
    context.restore();
  };

  const drawCrosshair = () => {
    context.save();
    context.translate(pointer.x, pointer.y);
    context.strokeStyle = isPlaying ? "rgba(121, 221, 255, 0.9)" : "rgba(121, 221, 255, 0.42)";
    context.fillStyle = "#ff5a2c";
    context.lineWidth = 1.5;
    context.shadowColor = "rgba(24, 185, 255, 0.65)";
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(0, 0, 13, 0, Math.PI * 2);
    context.stroke();
    for (let index = 0; index < 4; index += 1) {
      context.rotate(Math.PI / 2);
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(26, 0);
      context.stroke();
    }
    context.fillRect(-2, -2, 4, 4);
    context.restore();
  };

  const render = () => {
    context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    context.drawImage(arena, 0, 0);
    drawWorldEntities();
    drawProjectiles();
    drawCrosshair();
    drawHud();

    if (damageFlash > 0) {
      context.save();
      context.globalAlpha = Math.min(0.25, damageFlash);
      context.fillStyle = "#ff3c2f";
      context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      context.restore();
    }

    if (!spritesReady) {
      context.save();
      context.fillStyle = "rgba(2, 7, 17, 0.7)";
      context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      context.fillStyle = "#9ddfff";
      context.font = "500 14px IBM Plex Mono, monospace";
      context.textAlign = "center";
      context.fillText("Loading game…", GAME_WIDTH / 2, GAME_HEIGHT / 2);
      context.restore();
    }
  };

  const animationLoop = (now) => {
    const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.04);
    lastFrameTime = now;
    if (isPlaying) update(deltaTime);
    render();
    window.requestAnimationFrame(animationLoop);
  };

  toggleButton?.addEventListener("click", toggleGame);
  startButton?.addEventListener("click", startGame);
  resetButton?.addEventListener("click", () => {
    resetGame();
    if (toggleButton) {
      toggleButton.textContent = isPlaying ? "Pause game" : "Start game";
      toggleButton.setAttribute("aria-pressed", String(isPlaying));
    }
    setStatus(isPlaying ? "Playing" : "Game reset");
  });

  canvas.addEventListener("pointermove", (event) => {
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.active = true;
    updateAim();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (!isPlaying) startGame();
    if (!isPlaying) return;
    isFiring = true;
    if (fireCooldown <= 0) fireBullet();
  });

  canvas.addEventListener("pointerleave", () => {
    isFiring = false;
  });

  window.addEventListener("pointerup", (event) => {
    if (event.button === 0) isFiring = false;
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && isPlaying) {
      pauseGame();
      return;
    }
    if (!isPlaying || !controlKeys.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  window.addEventListener("blur", () => pauseGame("Paused while inactive"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame("Paused while inactive");
  });

  const gameVisibilityObserver = new IntersectionObserver(
    ([entry]) => {
      if (isPlaying && !entry.isIntersecting) pauseGame("Paused while offscreen");
    },
    { threshold: 0.12 },
  );
  gameVisibilityObserver.observe(canvas);

  buildArena();
  resetGame();
  setStatus("Loading game");

  Promise.all([
    loadImage("assets/game/player-idle-clean.png"),
    loadImage("assets/game/player-run-clean.png"),
    loadImage("assets/game/player-shoot-clean.png"),
    loadImage("assets/game/ghost-move-clean.png"),
    loadImage("assets/game/ghost-cast-clean.png"),
  ])
    .then(([idle, run, shoot, ghostMove, ghostCast]) => {
      spriteImages.idle = idle;
      spriteImages.run = run;
      spriteImages.shoot = shoot;
      spriteImages.ghostMove = ghostMove;
      spriteImages.ghostCast = ghostCast;
      spritesReady = true;
      setStatus("Ready to play");
      if (pendingStart) startGame();
    })
    .catch(() => {
      setStatus("Game assets failed to load");
      if (toggleButton) toggleButton.disabled = true;
      if (startButton) startButton.disabled = true;
    });

  window.requestAnimationFrame(animationLoop);
};

setupGame();
