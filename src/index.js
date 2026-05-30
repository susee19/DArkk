const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const healthEl = document.getElementById("health");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const powerupsEl = document.getElementById("powerups");
const lootEl = document.getElementById("loot");
const storeBtn = document.getElementById("storeBtn");
const storePanel = document.getElementById("store");
const closeStoreBtn = document.getElementById("closeStore");
const healthStoreBtn = document.querySelector('[data-buy="hp"]');
const speedStoreBtn = document.querySelector('[data-buy="speed"]');
const damageStoreBtn = document.querySelector('[data-buy="damage"]');
const invisStoreBtn = document.querySelector('[data-buy="invis"]');
const gameOverPopup = document.getElementById("gameOverPopup");
const popupTitle = document.getElementById("popupTitle");
const popupScore = document.getElementById("popupScore");
const restartBtn = document.getElementById("restartBtn");
const exitBtn = document.getElementById("exitBtn");
const questsBtn = document.getElementById("questsBtn");
const questsPanel = document.getElementById("questsPanel");
const closeQuests = document.getElementById("closeQuests");
const questToast = document.getElementById("questToast");
const q1Progress = document.getElementById("q1Progress");
const q2Progress = document.getElementById("q2Progress");
const q3Progress = document.getElementById("q3Progress");
const shootSound = new Audio("./assets/Shoot.mp3");
const ambientMusic = new Audio("./assets/Omnious.mp3");
const bombSound = new Audio("./assets/Bomb.mp3");

let audioStarted = false;
let paused = false;
let pauseStarted = 0;
let totalPausedTime = 0;
let rooms = [];
let bullets = [];
let explosions = [];
let roomSize = 110;
let gap = 35;
let hudHeight = 120;
let shootCooldown = 700;
let lastShotTime = 0;
let gameState = "playing";
let score = 0;
let loot = 0;
let noDamageKillStreak = 0;
let enteredRoomAt = null;
let damageTakenSinceEnter = false;
let dashKillsInsideRoom = 0;
let damageBoostShots = 0;
let speedBoostUntil = 0;
let invisibilityUntil = 0;
let startTime = Date.now();
let maxTime = 8 * 60 * 1000;
let keys = {};
let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
let player = {
    x: 20,
    y: hudHeight + 20,
    radius: 7,
    speed: 5,
    health: 100,
    maxHealth: 100
};

ambientMusic.loop = true;
ambientMusic.volume = 0.6;
shootSound.volume = 0.7;
bombSound.volume = 0.8;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const ENEMY_TYPES = {
    normal: {
        hp: 2,
        color: "#ff3030",
        moveSpeed: 2,
        visionRange: 300,
        shootCooldown: 650,
        bulletSpeed: 5,
        damage: 20,
        canShoot: true,
        visibleRange: 9999
    },
    cloaked: {
        hp: 2,
        color: "#8de7ff",
        moveSpeed: 1.75,
        visionRange: 300,
        shootCooldown: 650,
        bulletSpeed: 5,
        damage: 20,
        canShoot: true,
        visibleRange: 80
    },
    dash: {
        hp: 5,
        color: "#ff8c00",
        moveSpeed: 1.75,
        visionRange: 340,
        shootCooldown: 800,
        bulletSpeed: 5,
        damage: 20,
        canShoot: true,
        visibleRange: 9999
    },
    sniper: {
        hp: 2,
        color: "#a855f7",
        moveSpeed: 1,
        visionRange: 1200,
        shootCooldown: 1800,
        bulletSpeed: 3.0,
        damage: 100,
        canShoot: true,
        visibleRange: 9999
    },
    violet: {
        hp: 2,
        color: "#b05cff",
        moveSpeed: 1.75,
        visionRange: 320,
        shootCooldown: 700,
        bulletSpeed: 5,
        damage: 20,
        canShoot: true,
        visibleRange: 9999
    }
};

function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randRange(min, max) {
    return Math.random() * (max - min) + min;
}

function circleHitCircle(x1, y1, r1, x2, y2, r2) {
    return Math.hypot(x1 - x2, y1 - y2) <= r1 + r2;
}

function sameRoom(room, x, y) {
    return x > room.x && x < room.x + room.width && y > room.y && y < room.y + room.height;
}

function roomDoorsOpen(room) {
    return !room.lockActive || room.enemy.dead;
}

function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function angleDifference(a, b) {
    let diff = (a - b + Math.PI) % (Math.PI * 2);
    if (diff < 0) diff += Math.PI * 2;
    return diff - Math.PI;
}

function pickEnemyType() {
    const roll = Math.random();
    if (roll < 0.38) return "normal";
    if (roll < 0.56) return "cloaked";
    if (roll < 0.76) return "dash";
    if (roll < 0.90) return "sniper";
    return "violet";
}

function makeEnemy(type) {
    const cfg = ENEMY_TYPES[type];
    const angle = Math.random() * Math.PI * 2;
    return {
        type,
        x: Math.random() * (roomSize - 40) + 20,
        y: Math.random() * (roomSize - 40) + 20,
        radius: 7,
        health: cfg.hp,
        maxHealth: cfg.hp,
        dead: false,
        vx: Math.cos(angle) * cfg.moveSpeed,
        vy: Math.sin(angle) * cfg.moveSpeed,
        nextWanderChange: Date.now() + randRange(400, 1200),
        shootCooldown: cfg.shootCooldown,
        lastShotTime: 0,
        shotRecoilUntil: 0,
        shotRecoilMs: 400,
        alerted: false,
        dashing: false,
        dashUntil: 0,
        nextDashAt: 0,
        retreating: false,
        retreatUntil: 0,
        visibleRange: cfg.visibleRange || 9999,
        bombRadius: type === "violet" ? 70 : 0,
        bombDamage: type === "violet" ? 50 : 0
    };
}

function generateRooms() {
    rooms = [];
    const cols = Math.floor((canvas.width - gap) / (roomSize + gap));
    const rows = Math.floor((canvas.height - hudHeight - gap) / (roomSize + gap));
    const totalWidth = cols * roomSize + (cols - 1) * gap;
    const startX = (canvas.width - totalWidth) / 2;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const hasLoot = Math.random() < 0.3;
            const type = pickEnemyType();
            rooms.push({
                x: startX + col * (roomSize + gap),
                y: hudHeight + gap + row * (roomSize + gap),
                width: roomSize,
                height: roomSize,
                doorSide: randChoice(["top", "bottom", "left", "right"]),
                lockable: hasLoot,
                lockActive: false,
                lootAmount: hasLoot ? 50 : 0,
                lootCollected: false,
                enemy: makeEnemy(type)
            });
        }
    }
}

function getEnemyCenter(room) {
    return {
        x: room.x + room.enemy.x,
        y: room.y + room.enemy.y
    };
}

function isEnemyVisible(room) {
    const enemy = room.enemy;
    if (enemy.dead) return false;
    if (enemy.type !== "cloaked") return true;
    if (!sameRoom(room, player.x, player.y)) return false;
    const ex = room.x + enemy.x;
    const ey = room.y + enemy.y;
    const torchAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const angleToEnemy = Math.atan2(ey - player.y, ex - player.x);
    const dist = Math.hypot(ex - player.x, ey - player.y);
    return dist <= 180 && Math.abs(angleDifference(angleToEnemy, torchAngle)) <= 0.4;
}

function bulletTouchesRoomPath(bullet, room) {
    const minX = Math.min(bullet.prevX, bullet.x) - bullet.radius;
    const maxX = Math.max(bullet.prevX, bullet.x) + bullet.radius;
    const minY = Math.min(bullet.prevY, bullet.y) - bullet.radius;
    const maxY = Math.max(bullet.prevY, bullet.y) + bullet.radius;
    return !(maxX < room.x || minX > room.x + room.width || maxY < room.y || minY > room.y + room.height);
}

function resolveBulletAgainstRoom(bullet, room) {
    if (!bulletTouchesRoomPath(bullet, room)) return;
    if (bullet.bouncedThisFrame) return;
    const left = room.x;
    const right = room.x + room.width;
    const top = room.y;
    const bottom = room.y + room.height;
    const dx = bullet.x - bullet.prevX;
    const dy = bullet.y - bullet.prevY;
    const pad = 40;
    const doorsOpen = roomDoorsOpen(room);
    const crossedLeft =
        (bullet.prevX - bullet.radius < left && bullet.x - bullet.radius >= left) ||
        (bullet.prevX - bullet.radius > left && bullet.x - bullet.radius <= left);
    const crossedRight =
        (bullet.prevX + bullet.radius > right && bullet.x + bullet.radius <= right) ||
        (bullet.prevX + bullet.radius < right && bullet.x + bullet.radius >= right);
    const crossedTop =
        (bullet.prevY - bullet.radius < top && bullet.y - bullet.radius >= top) ||
        (bullet.prevY - bullet.radius > top && bullet.y - bullet.radius <= top);
    const crossedBottom =
        (bullet.prevY + bullet.radius < bottom && bullet.y + bullet.radius >= bottom) ||
        (bullet.prevY + bullet.radius > bottom && bullet.y + bullet.radius <= bottom);
    if (crossedLeft) {
        const yCross = dx === 0 ? bullet.y : bullet.prevY + ((left - bullet.prevX) / dx) * dy;
        const canPass = doorsOpen && room.doorSide === "left" && yCross > room.y + room.height / 2 - pad && yCross < room.y + room.height / 2 + pad;
        if (!canPass) {
            bullet.vx *= -1;
            bullet.bouncedThisFrame = true;
            if (bullet.owner === "enemy") bullet.bounces++;
            bullet.x = bullet.prevX < left ? left - bullet.radius : left + bullet.radius;
        }
    }
    if (!bullet.bouncedThisFrame && crossedRight) {
        const yCross = dx === 0 ? bullet.y : bullet.prevY + ((right - bullet.prevX) / dx) * dy;
        const canPass = doorsOpen && room.doorSide === "right" && yCross > room.y + room.height / 2 - pad && yCross < room.y + room.height / 2 + pad;
        if (!canPass) {
            bullet.vx *= -1;
            bullet.bouncedThisFrame = true;
            if (bullet.owner === "enemy") bullet.bounces++;
            bullet.x = bullet.prevX < right ? right - bullet.radius : right + bullet.radius;
        }
    }
    if (!bullet.bouncedThisFrame && crossedTop) {
        const xCross = dy === 0 ? bullet.x : bullet.prevX + ((top - bullet.prevY) / dy) * dx;
        const canPass = doorsOpen && room.doorSide === "top" && xCross > room.x + room.width / 2 - pad && xCross < room.x + room.width / 2 + pad;
        if (!canPass) {
            bullet.vy *= -1;
            bullet.bouncedThisFrame = true;
            if (bullet.owner === "enemy") bullet.bounces++;
            bullet.y = bullet.prevY < top ? top - bullet.radius : top + bullet.radius;
        }
    }
    if (!bullet.bouncedThisFrame && crossedBottom) {
        const xCross = dy === 0 ? bullet.x : bullet.prevX + ((bottom - bullet.prevY) / dy) * dx;
        const canPass = doorsOpen && room.doorSide === "bottom" && xCross > room.x + room.width / 2 - pad && xCross < room.x + room.width / 2 + pad;
        if (!canPass) {
            bullet.vy *= -1;
            bullet.bouncedThisFrame = true;
            if (bullet.owner === "enemy") bullet.bounces++;
            bullet.y = bullet.prevY < bottom ? bottom - bullet.radius : bottom + bullet.radius;
        }
    }
}

function canEnemySeePlayer(room, tx, ty) {
    if (sameRoom(room, tx, ty)) return true;
    if (room.lockActive && !room.enemy.dead) return false;
    const midX = room.x + room.width / 2;
    const midY = room.y + room.height / 2;
    const pad = 40;
    if (room.doorSide === "left") {
        return tx < room.x && ty > midY - pad && ty < midY + pad;
    }
    if (room.doorSide === "right") {
        return tx > room.x + room.width && ty > midY - pad && ty < midY + pad;
    }
    if (room.doorSide === "top") {
        return ty < room.y && tx > midX - pad && tx < midX + pad;
    }
    if (room.doorSide === "bottom") {
        return ty > room.y + room.height && tx > midX - pad && tx < midX + pad;
    }
    return false;
}

function updateEnemyWander(room, enemy, cfg, now) {
    const recoilFactor = now < enemy.shotRecoilUntil ? 0.35 : 1;
    if (now >= enemy.nextWanderChange) {
        enemy.nextWanderChange = now + randRange(700, 1600);
        const ang = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(ang) * cfg.moveSpeed;
        enemy.vy = Math.sin(ang) * cfg.moveSpeed;
    }
    enemy.x += enemy.vx * recoilFactor;
    enemy.y += enemy.vy * recoilFactor;
}

function updateEnemyChase(room, enemy, cfg, now) {
    const recoilFactor = now < enemy.shotRecoilUntil ? 0.35 : 1;
    const { x: ex, y: ey } = getEnemyCenter(room);
    const dx = player.x - ex;
    const dy = player.y - ey;
    const dist = Math.hypot(dx, dy) || 1;
    if (enemy.type === "sniper") {
        return;
    }
    if (enemy.type === "dash") {
        if (!sameRoom(room, player.x, player.y)) {
            return;
        }
        if (enemy.retreating) {
            const awayX = ex - player.x;
            const awayY = ey - player.y;
            const awayDist = Math.hypot(awayX, awayY) || 1;
            enemy.x += (awayX / awayDist) * 4.5;
            enemy.y += (awayY / awayDist) * 4.5;
            if (now >= enemy.retreatUntil) {
                enemy.retreating = false;
                enemy.nextDashAt = now + 1000;
            }
            return;
        }
        if (!enemy.dashing && now >= enemy.nextDashAt) {
            enemy.dashing = true;
            enemy.dashUntil = now + 250;
            enemy.dashDirX = dx / dist;
            enemy.dashDirY = dy / dist;
        }
        if (enemy.dashing) {
            const dashSpeed = 8.5;
            enemy.x += enemy.dashDirX * dashSpeed;
            enemy.y += enemy.dashDirY * dashSpeed;
            const newEx = room.x + enemy.x;
            const newEy = room.y + enemy.y;
            if (circleHitCircle(newEx, newEy, enemy.radius, player.x, player.y, player.radius)) {
                player.health -= 20;
                if (player.health < 0) player.health = 0;
                enemy.dashing = false;
                enemy.retreating = true;
                enemy.retreatUntil = now + 1000;
                return;
            }
            if (now >= enemy.dashUntil) {
                enemy.dashing = false;
                enemy.nextDashAt = now + 1000;
            }
            return;
        }
        return;
    }
    const nearWall =
        enemy.x < 14 ||
        enemy.x > room.width - 14 ||
        enemy.y < 14 ||
        enemy.y > room.height - 14;
    const wallFactor = nearWall ? 0.7 : 1;
    const stopDistance = enemy.type === "dash" ? 42 : 60;
    if (dist > stopDistance) {
        const chaseSpeed = enemy.type === "violet" ? cfg.moveSpeed * 1.25 : cfg.moveSpeed * 1.35;
        enemy.x += (dx / dist) * chaseSpeed * wallFactor * recoilFactor;
        enemy.y += (dy / dist) * chaseSpeed * wallFactor * recoilFactor;
    }
}

function updateEnemies() {
    const now = Date.now();
    const playerInvisible = now < invisibilityUntil;
    for (const room of rooms) {
        const enemy = room.enemy;
        if (enemy.dead) continue;
        const cfg = ENEMY_TYPES[enemy.type];
        const { x: ex, y: ey } = getEnemyCenter(room);
        const dx = player.x - ex;
        const dy = player.y - ey;
        const dist = Math.hypot(dx, dy) || 1;
        const playerHere = sameRoom(room, player.x, player.y);
        const canSeePlayer = !playerInvisible && canEnemySeePlayer(room, player.x, player.y) && dist <= cfg.visionRange;
        enemy.alerted = canSeePlayer || playerHere;
        if (enemy.alerted) {
            updateEnemyChase(room, enemy, cfg, now);
        }
        else {
            updateEnemyWander(room, enemy, cfg, now);
        }
        if (
            !playerInvisible &&
            cfg.canShoot &&
            now - enemy.lastShotTime >= cfg.shootCooldown &&
            (playerHere || canEnemySeePlayer(room, player.x, player.y))
        ) {
            enemy.lastShotTime = now;
            enemy.shotRecoilUntil = now + enemy.shotRecoilMs;
            const bulletRadius = 4;
            const spawnDistance = enemy.radius + bulletRadius + 2;
            const dirX = dx / dist;
            const dirY = dy / dist;
            bullets.push({
                x: ex + dirX * spawnDistance,
                y: ey + dirY * spawnDistance,
                radius: bulletRadius,
                vx: dirX * cfg.bulletSpeed,
                vy: dirY * cfg.bulletSpeed,
                prevX: ex,
                prevY: ey,
                owner: "enemy",
                color: "#ff2a2a",
                damage: cfg.damage,
                bounces: 0,
                bouncedThisFrame: false
            });
        }
        const minX = enemy.radius + 8;
        const maxX = room.width - enemy.radius - 8;
        const minY = enemy.radius + 8;
        const maxY = room.height - enemy.radius - 8;
        if (enemy.x <= minX) {
            enemy.x = minX;
            enemy.vx = Math.abs(enemy.vx) || 1;
        }
        if (enemy.x >= maxX) {
            enemy.x = maxX;
            enemy.vx = -Math.abs(enemy.vx) || -1;
        }
        if (enemy.y <= minY) {
            enemy.y = minY;
            enemy.vy = Math.abs(enemy.vy) || 1;
        }
        if (enemy.y >= maxY) {
            enemy.y = maxY;
            enemy.vy = -Math.abs(enemy.vy) || -1;
        }
    }
}

function explodeViolet(room, enemy) {
    const ex = room.x + enemy.x;
    const ey = room.y + enemy.y;
    bombSound.currentTime = 0;
    bombSound.play().catch(() => {});
    explosions.push({
        x: ex,
        y: ey,
        radius: 0,
        maxRadius: 70,
        life: 24
    });
    if (circleHitCircle(ex, ey, 70, player.x, player.y, player.radius)) {
        player.health -= 50;
        if (player.health < 0) player.health = 0;
    }
}

function killEnemy(room) {
    const enemy = room.enemy;
    if (enemy.dead) return;
    const insideRoom =
        player.x > room.x &&
        player.x < room.x + room.width &&
        player.y > room.y &&
        player.y < room.y + room.height;
    enemy.dead = true;
    score += 100;
    if (room.lockable && !room.lootCollected) {
        loot += room.lootAmount;
        room.lootCollected = true;
    }
    if (enemy.type === "violet") {
        explodeViolet(room, enemy);
    }
    if (!damageTakenSinceEnter) {
        noDamageKillStreak++;
        if (noDamageKillStreak >= 3) {
            loot += 50;
            score += 50;
            noDamageKillStreak = 0;
            showQuestToast("Quest Complete: 3 Kills No Damage");
        }
    }
    else {
        noDamageKillStreak = 0;
    }
    if (enteredRoomAt && !damageTakenSinceEnter && insideRoom) {
        loot += 50;
        score += 50;
        enteredRoomAt = Date.now();
        showQuestToast("Quest Complete: Room Kill No Damage");
    }
    if (enemy.type === "dash" && insideRoom) {
        loot += 100;
        score += 100;
        dashKillsInsideRoom++;
        showQuestToast("Quest Complete: Dash Unit Killed");
    }
}

function updateBullets() {
    const playerInvisible = Date.now() < invisibilityUntil;
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.bouncedThisFrame = false;
        bullet.prevX = bullet.x;
        bullet.prevY = bullet.y;
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        if (bullet.owner === "enemy" && bullet.bounces >= 2) {
            bullets.splice(i, 1);
            continue;
        }
        if (
            bullet.x < 0 ||
            bullet.x > canvas.width ||
            bullet.y < 0 ||
            bullet.y > canvas.height
        ) {
            bullets.splice(i, 1);
            continue;
        }
        let removed = false;
        if (bullet.owner === "player") {
            for (const room of rooms) {
                if (room.enemy.dead) continue;
                const ex = room.x + room.enemy.x;
                const ey = room.y + room.enemy.y;
                if (circleHitCircle(bullet.x, bullet.y, bullet.radius, ex, ey, room.enemy.radius)) {
                    room.enemy.health -= bullet.damage || 1;
                    if (room.enemy.health <= 0) {
                        room.enemy.health = 0;
                        killEnemy(room);
                    }
                    bullets.splice(i, 1);
                    removed = true;
                    break;
                }
            }
        }
        if (removed) continue;
        if (bullet.owner === "enemy" && gameState === "playing" && !playerInvisible) {
            if (circleHitCircle(bullet.x, bullet.y, bullet.radius, player.x, player.y, player.radius)) {
                player.health -= bullet.damage || 20;
                if (player.health < 0) {
                    player.health = 0;
                }
                damageTakenSinceEnter = true;
                noDamageKillStreak = 0;
                bullets.splice(i, 1);
                continue;
            }
        }
        for (const room of rooms) {
            resolveBulletAgainstRoom(bullet, room);
            if (bullet.owner === "enemy" && bullet.bounces >= 2) {
                bullets.splice(i, 1);
                removed = true;
                break;
            }
        }
        if (removed) continue;
    }
    if (bullets.length > 220) {
        bullets.splice(0, bullets.length - 220);
    }
}

function updatePlayer() {
    if (gameState !== "playing") return;
    let nextX = player.x;
    let nextY = player.y;
    const currentSpeed = Date.now() < speedBoostUntil ? player.speed * 2 : player.speed;
    if (keys["w"]) nextY -= currentSpeed;
    if (keys["s"]) nextY += currentSpeed;
    if (keys["a"]) nextX -= currentSpeed;
    if (keys["d"]) nextX += currentSpeed;
    let blockedX = false;
    let blockedY = false;
    for (const room of rooms) {
        const ex = room.x + room.enemy.x;
        const ey = room.y + room.enemy.y;
        if (
            !room.enemy.dead &&
            circleHitCircle(nextX, nextY, player.radius, ex, ey, room.enemy.radius)
        ) {
            blockedX = true;
            blockedY = true;
        }
        const doorPad = 25;
        const doorsOpen = roomDoorsOpen(room);
        const nearRoom =
            nextX + player.radius > room.x &&
            nextX - player.radius < room.x + room.width &&
            nextY + player.radius > room.y &&
            nextY - player.radius < room.y + room.height;
        if (!nearRoom) continue;
        if (
            nextX - player.radius <= room.x &&
            !(
                doorsOpen &&
                room.doorSide === "left" &&
                nextY > room.y + room.height / 2 - doorPad &&
                nextY < room.y + room.height / 2 + doorPad
            )
        ) {
            blockedX = true;
        }
        if (
            nextX + player.radius >= room.x + room.width &&
            !(
                doorsOpen &&
                room.doorSide === "right" &&
                nextY > room.y + room.height / 2 - doorPad &&
                nextY < room.y + room.height / 2 + doorPad
            )
        ) {
            blockedX = true;
        }
        if (
            nextY - player.radius <= room.y &&
            !(
                doorsOpen &&
                room.doorSide === "top" &&
                nextX > room.x + room.width / 2 - doorPad &&
                nextX < room.x + room.width / 2 + doorPad
            )
        ) {
            blockedY = true;
        }
        if (
            nextY + player.radius >= room.y + room.height &&
            !(
                doorsOpen &&
                room.doorSide === "bottom" &&
                nextX > room.x + room.width / 2 - doorPad &&
                nextX < room.x + room.width / 2 + doorPad
            )
        ) {
            blockedY = true;
        }
    }
    if (!blockedX) {
        player.x = nextX;
    }
    if (!blockedY) {
        player.y = nextY;
    }
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    for (const room of rooms) {
        if (
            room.lockable &&
            !room.lockActive &&
            !room.enemy.dead &&
            player.x > room.x &&
            player.x < room.x + room.width &&
            player.y > room.y &&
            player.y < room.y + room.height
        ) {
            room.lockActive = true;
            enteredRoomAt = Date.now();
            damageTakenSinceEnter = false;
            dashKillsInsideRoom = 0;
        }
    }
}

function showGamePopup(title) {
    gameState = title === "You Win" ? "won" : "lost";
    popupTitle.textContent = title;
    popupScore.textContent = `Your Score: ${score}`;
    gameOverPopup.classList.remove("hidden");
}

function updateExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const ex = explosions[i];
        ex.radius += ex.maxRadius / 24;
        ex.life -= 1;
        if (ex.life <= 0) explosions.splice(i, 1);
    }
}

function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

function showQuestToast(message) {
    if (!questToast) return;
    questToast.textContent = message;
    questToast.classList.remove("hidden");
    clearTimeout(showQuestToast.timer);
    showQuestToast.timer = setTimeout(() => {
        questToast.classList.add("hidden");
    }, 2000);
}

function updateQuestHud() {
    if (q1Progress) {
        q1Progress.textContent = `${noDamageKillStreak} / 3`;
    }
    if (q2Progress) {
        q2Progress.textContent = damageTakenSinceEnter ? "Failed" : "Active";
    }
    if (q3Progress) {
        q3Progress.textContent = `${dashKillsInsideRoom}`;
    }
}

function updateHud() {
    if (healthEl) healthEl.textContent = `Health: ${player.health}`;
    if (scoreEl) scoreEl.textContent = `Score: ${score}`;
    if (timerEl) {
        const elapsed =
            Date.now() -
            startTime -
            totalPausedTime -
            (paused ? Date.now() - pauseStarted : 0);
        timerEl.textContent = `Time: ${formatTime(maxTime - elapsed)}`;
    }
    if (powerupsEl) {
        const active = [];
        if (damageBoostShots > 0) active.push(`2X Damage ×${damageBoostShots}`);
        if (Date.now() < speedBoostUntil) active.push("Speed 2X");
        if (Date.now() < invisibilityUntil) active.push("Invisible");
        powerupsEl.textContent = active.length ? `Powerups: ${active.join(" | ")}` : "Powerups: None";
    }
    if (lootEl) {
        lootEl.textContent = `Loot: $${loot}`;
    }
    updateQuestHud();
}

function checkEndConditions() {
    if (gameState !== "playing") return;
    const elapsed =
        Date.now() -
        startTime -
        totalPausedTime -
        (paused ? Date.now() - pauseStarted : 0);
    const remaining = maxTime - elapsed;
    if (player.health <= 0) {
        gameState = "lost";
        setTimeout(() => showGamePopup("Game Over"), 0);
        return;
    }
    if (remaining <= 0) {
        gameState = "lost";
        setTimeout(() => showGamePopup("Game Over"), 0);
        return;
    }
    if (rooms.every(room => room.enemy.dead)) {
        gameState = "won";
        setTimeout(() => showGamePopup("You Win"), 0);
    }
}

function applyStorePurchase(type) {
    if (gameState !== "playing") return;
    if (type === "speed") {
        const cost = 50;
        if (loot < cost) return;
        loot -= cost;
        speedBoostUntil = Date.now() + 20_000;
    }
    if (type === "hp") {
        const cost = 100;
        if (loot < cost) return;
        loot -= cost;
        player.maxHealth += 100;
        player.health += 100;
    }
    if (type === "damage") {
        const cost = 150;
        if (loot < cost) return;
        loot -= cost;
        damageBoostShots += 3;
    }
    if (type === "invis") {
        const cost = 200;
        if (loot < cost) return;
        loot -= cost;
        invisibilityUntil = Date.now() + 12_000;
    }
    updateHud();
}

function update() {
    if (paused) {
        return;
    }
    if (gameState !== "playing") {
        updateHud();
        return;
    }
    updateEnemies();
    updateBullets();
    updatePlayer();
    updateExplosions();
    checkEndConditions();
    updateHud();
}

function render() {
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const oCtx = offscreen.getContext('2d');
    oCtx.fillStyle = "#a000a0";
    oCtx.fillRect(0, 0, canvas.width, canvas.height);
    for (const room of rooms) {
        oCtx.fillStyle = "green";
        oCtx.fillRect(room.x, room.y, room.width, room.height);
        oCtx.strokeStyle = "black";
        oCtx.lineWidth = 5;
        oCtx.strokeRect(room.x, room.y, room.width, room.height);
        if (roomDoorsOpen(room)) {
            oCtx.strokeStyle = "yellow";
            oCtx.lineWidth = 8;
            if (room.doorSide === "top") {
                oCtx.beginPath();
                oCtx.moveTo(room.x + room.width / 2 - 20, room.y);
                oCtx.lineTo(room.x + room.width / 2 + 20, room.y);
                oCtx.stroke();
            }
            if (room.doorSide === "bottom") {
                oCtx.beginPath();
                oCtx.moveTo(room.x + room.width / 2 - 20, room.y + room.height);
                oCtx.lineTo(room.x + room.width / 2 + 20, room.y + room.height);
                oCtx.stroke();
            }
            if (room.doorSide === "left") {
                oCtx.beginPath();
                oCtx.moveTo(room.x, room.y + room.height / 2 - 20);
                oCtx.lineTo(room.x, room.y + room.height / 2 + 20);
                oCtx.stroke();
            }
            if (room.doorSide === "right") {
                oCtx.beginPath();
                oCtx.moveTo(room.x + room.width, room.y + room.height / 2 - 20);
                oCtx.lineTo(room.x + room.width, room.y + room.height / 2 + 20);
                oCtx.stroke();
            }
        }
        if (!room.enemy.dead && isEnemyVisible(room)) {
            const enemy = room.enemy;
            const ex = room.x + enemy.x;
            const ey = room.y + enemy.y;
            const ratio = enemy.health / enemy.maxHealth;
            oCtx.fillStyle = "rgba(0,0,0,0.35)";
            oCtx.fillRect(ex - 12, ey - 18, 24, 4);
            oCtx.fillStyle = "lime";
            oCtx.fillRect(ex - 12, ey - 18, 24 * ratio, 4);
            oCtx.fillStyle =
                enemy.type === "normal" ? "#ff3030" :
                enemy.type === "cloaked" ? "#8de7ff" :
                enemy.type === "dash" ? "#ff8c00" :
                enemy.type === "sniper" ? "#a855f7" :
                "#b05cff";
            oCtx.beginPath();
            oCtx.arc(ex, ey, enemy.radius, 0, Math.PI * 2);
            oCtx.fill();
        }
    }
    for (const explosion of explosions) {
        oCtx.save();
        oCtx.globalAlpha = Math.max(0, explosion.life / 24) * 0.35;
        oCtx.fillStyle = "#ff8c00";
        oCtx.beginPath();
        oCtx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
        oCtx.fill();
        oCtx.restore();
    }
    for (const bullet of bullets) {
        oCtx.save();
        if (bullet.owner === "player" && bullet.damage > 1) {
            oCtx.fillStyle = bullet.color || "#fff100";
        }
        else if (bullet.owner === "enemy") {
            oCtx.fillStyle = "#ff2a2a";
        }
        else {
            oCtx.fillStyle = bullet.color || "white";
        }
        oCtx.beginPath();
        oCtx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        oCtx.fill();
        oCtx.restore();
    }
    oCtx.fillStyle = "yellow";
    oCtx.beginPath();
    oCtx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    oCtx.fill();
    if (Date.now() < invisibilityUntil) {
        oCtx.save();
        oCtx.strokeStyle = "white";
        oCtx.lineWidth = 1.5;
        oCtx.setLineDash([4, 4]);
        oCtx.beginPath();
        oCtx.arc(player.x, player.y, player.radius + 4, 0, Math.PI * 2);
        oCtx.stroke();
        oCtx.restore();
    }
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const mCtx = maskCanvas.getContext('2d');
    mCtx.fillStyle = "black";
    mCtx.fillRect(0, 0, canvas.width, canvas.height);
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    mCtx.save();
    mCtx.globalCompositeOperation = "destination-out";
    const gradient = mCtx.createRadialGradient(
        player.x, player.y, 0,
        player.x, player.y, 180
    );
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.75, "rgba(0,0,0,0.95)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    mCtx.fillStyle = gradient;
    mCtx.beginPath();
    mCtx.moveTo(player.x, player.y);
    mCtx.arc(player.x, player.y, 180, angle - 0.4, angle + 0.4);
    mCtx.closePath();
    mCtx.fill();
    mCtx.restore();
    mCtx.save();
    mCtx.globalCompositeOperation = "destination-out";
    const halo = mCtx.createRadialGradient(
        player.x, player.y, 0,
        player.x, player.y, player.radius + 10
    );
    halo.addColorStop(0, "rgba(0,0,0,1)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    mCtx.fillStyle = halo;
    mCtx.beginPath();
    mCtx.arc(player.x, player.y, player.radius + 10, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
}

function main() {
    update();
    render();
    requestAnimationFrame(main);
}

function startAudio() {
    if (audioStarted) return;
    audioStarted = true;
    ambientMusic.play().catch(() => {});
}

window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        paused = !paused;
        if (paused) {
            pauseStarted = Date.now();
        }
        else {
            totalPausedTime += Date.now() - pauseStarted;
        }
        if (paused) {
            ambientMusic.pause();
        }
        else {
            if (audioStarted) {
                ambientMusic.play().catch(() => {});
            }
        }
    }
});

window.addEventListener("pointerdown", startAudio, { once: true });
window.addEventListener("keydown", startAudio, { once: true });

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        ambientMusic.pause();
    }
    else if (audioStarted && gameState === "playing") {
        ambientMusic.play().catch(() => {});
    }
});

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    generateRooms();
});

window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", (e) => {
    mouse = getCanvasPoint(e);
});

canvas.addEventListener("click", (e) => {
    if (gameState !== "playing") return;
    const now = Date.now();
    if (now - lastShotTime < shootCooldown) return;
    lastShotTime = now;
    shootSound.currentTime = 0;
    shootSound.play().catch(() => {});
    const point = getCanvasPoint(e);
    const dx = point.x - player.x;
    const dy = point.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = 8;
    const bulletRadius = 4;
    const spawnDistance = player.radius + bulletRadius + 2;
    const boosted = damageBoostShots > 0;
    bullets.push({
        x: player.x + (dx / distance) * spawnDistance,
        y: player.y + (dy / distance) * spawnDistance,
        radius: bulletRadius,
        vx: (dx / distance) * speed,
        vy: (dy / distance) * speed,
        prevX: player.x,
        prevY: player.y,
        owner: "player",
        damage: boosted ? 2 : 1,
        color: boosted ? "#fff100" : "white",
        bounces: 0,
        bouncedThisFrame: false
    });
    if (boosted) damageBoostShots--;
});

if (storeBtn && storePanel && closeStoreBtn) {
    storeBtn.addEventListener("click", () => {
        storePanel.classList.toggle("hidden");
    });
    closeStoreBtn.addEventListener("click", () => {
        storePanel.classList.add("hidden");
    });
}

if (questsBtn && questsPanel && closeQuests) {
    questsBtn.addEventListener("click", () => {
        questsPanel.classList.toggle("hidden");
    });
    closeQuests.addEventListener("click", () => {
        questsPanel.classList.add("hidden");
    });
}

if (speedStoreBtn) {
    speedStoreBtn.addEventListener("click", () => applyStorePurchase("speed"));
}
if (healthStoreBtn){
     healthStoreBtn.addEventListener("click", () => applyStorePurchase("hp"));
}
if (damageStoreBtn) {
    damageStoreBtn.addEventListener("click", () => applyStorePurchase("damage"));
}
if (invisStoreBtn) {
    invisStoreBtn.addEventListener("click", () => applyStorePurchase("invis"));
}
restartBtn.addEventListener("click", () => {
    location.reload();
});

exitBtn.addEventListener("click", () => {
    window.location.href = "index.html";
});

generateRooms();
updateHud();
main();