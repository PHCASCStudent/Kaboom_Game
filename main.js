const WIDTH = 800;
const HEIGHT = 600;
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 90;
const BALL_SIZE = 10;
const PADDLE_SPEED = 7;
const BALL_SPEED = 4;
const POWERUP_SIZE = 40;
const POWERUP_SPAWN_RATE = 0.01;
const NUM_LEVELS = 10;
const level_score_targets = Array.from(
  { length: NUM_LEVELS },
  (_, i) => 10 + 5 * i
);

const NEON_BLUE = 0x00ffff;
const NEON_PINK = 0xff00ff;
const NEON_RED = 0xff0000;
const WHITE = 0xffffff;
const BLACK = 0x000000;

let level_unlocks = [true, ...Array(NUM_LEVELS - 1).fill(false)];

const config = {
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#000",
  scene: { preload, create, update },
};

new Phaser.Game(config);

function preload() {}

function create() {
  this.state = "menu";
  this.level_select_cursor = 0;
  this.level_unlocks = [...level_unlocks];
  this.current_level = null;
  this.player_score = 0;
  this.cpu_score = 0;
  this.active_powerups = {};
  this.paddle_size_multiplier = 1.0;
  this.speed_multiplier = 1.0;
  this.cpu_speed_multiplier = 1.0;
  this.fireball_active = false;
  this.cpu_miss_chance = 0.0;
  this.paused = false;
  this.powerups = [];
  this.fireball_trail = [];
  this.fireball_trail = [];

  this.pauseBtn = this.add
    .text(WIDTH - 60, 20, "⏸", {
      fontSize: 48,
      color: "#fff",
      backgroundColor: "#222",
      padding: { left: 10, right: 10, top: 5, bottom: 5 },
    })
    .setInteractive()
    .setOrigin(0.5, 0);
  this.pauseBtn.on("pointerdown", () => {
    if (this.state === "play") {
      this.state = "pause";
      this.pause_text.setVisible(true);
    }
  });

  this.player_paddle = this.add
    .rectangle(50, HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT, NEON_BLUE)
    .setOrigin(0, 0.5);
  this.cpu_paddle = this.add
    .rectangle(
      WIDTH - 50 - PADDLE_WIDTH,
      HEIGHT / 2,
      PADDLE_WIDTH,
      PADDLE_HEIGHT,
      NEON_PINK
    )
    .setOrigin(0, 0.5);
  this.ball = this.add.ellipse(
    WIDTH / 2,
    HEIGHT / 2,
    BALL_SIZE,
    BALL_SIZE,
    WHITE
  );

  this.powerup_shapes = [];

  this.player_score_text = this.add
    .text(WIDTH / 4, 20, "0", { fontSize: 36, color: "#fff" })
    .setOrigin(0.5, 0);
  this.cpu_score_text = this.add
    .text((3 * WIDTH) / 4, 20, "0", { fontSize: 36, color: "#fff" })
    .setOrigin(0.5, 0);
  this.powerup_text = this.add
    .text(WIDTH / 2, HEIGHT - 40, "", { fontSize: 24, color: "#fff" })
    .setOrigin(0.5, 0);

  // Touch drag for player paddle
  this.input.on("pointerdown", (pointer) => {
    if (pointer.x < WIDTH / 2) {
      // Only allow left half for player control
      this.isDraggingPaddle = true;
      this.dragOffsetY = this.player_paddle.y - pointer.y;
    }
  });
  this.input.on("pointerup", () => {
    this.isDraggingPaddle = false;
  });
  this.input.on("pointermove", (pointer) => {
    if (this.isDraggingPaddle) {
      let newY = pointer.y + this.dragOffsetY;
      // Clamp paddle within screen
      let paddle_size =
        PADDLE_HEIGHT *
        (this.active_powerups["paddle_size"]
          ? 1.0 + 0.5 * this.active_powerups["paddle_size"].length
          : 1.0);
      newY = Phaser.Math.Clamp(newY, paddle_size / 2, HEIGHT - paddle_size / 2);
      this.player_paddle.y = newY;
    }
  });

  this.menu_texts = [];
  this.level_select_texts = [];
  this.pause_text = this.add
    .text(WIDTH / 2, HEIGHT / 2, "Paused", { fontSize: 72, color: "#ff00ff" })
    .setOrigin(0.5);
  this.pause_text.setVisible(false);

  this.ball_speed_x = BALL_SPEED * Phaser.Math.RND.sign();
  this.ball_speed_y = BALL_SPEED * Phaser.Math.RND.sign();

  this.cursors = this.input.keyboard.createCursorKeys();
  this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  this.keyF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
  this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
  this.keySpace = this.input.keyboard.addKey(
    Phaser.Input.Keyboard.KeyCodes.SPACE
  );
  this.keyEnter = this.input.keyboard.addKey(
    Phaser.Input.Keyboard.KeyCodes.ENTER
  );

  this.input.on("pointerdown", (pointer) => {
    if (this.state === "levelselect") {
      const idx = getLevelClicked(pointer.x, pointer.y);
      if (idx !== null && this.level_unlocks[idx]) {
        startLevel.call(this, idx);
      }
    }
  });

  this.input.keyboard.on("keydown", (event) => {
    if (this.state === "levelselect") {
      if (
        event.key === "ArrowRight" &&
        this.level_select_cursor < NUM_LEVELS - 1
      )
        this.level_select_cursor++;
      if (event.key === "ArrowLeft" && this.level_select_cursor > 0)
        this.level_select_cursor--;
      if (event.key === "ArrowUp" && this.level_select_cursor - 5 >= 0)
        this.level_select_cursor -= 5;
      if (
        event.key === "ArrowDown" &&
        this.level_select_cursor + 5 < NUM_LEVELS
      )
        this.level_select_cursor += 5;
      if (
        event.key === "Enter" &&
        this.level_unlocks[this.level_select_cursor]
      ) {
        startLevel.call(this, this.level_select_cursor);
      }
    }
  });

  // Add this after drawing your menu texts
  this.input.once("pointerdown", () => {
    if (this.state === "menu") {
      showLevelSelect.call(this);
    }
  });

  showMenu.call(this);
}

function update(time, delta) {
  let paddle_size =
    PADDLE_HEIGHT *
    (this.active_powerups["paddle_size"]
      ? 1.0 + 0.5 * this.active_powerups["paddle_size"].length
      : 1.0);
  this.player_paddle.displayHeight = paddle_size;
  if (this.state === "menu") {
    if (Phaser.Input.Keyboard.JustDown(this.keyEnter)) {
      showLevelSelect.call(this);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      this.game.destroy(true);
    }
    return;
  }

  if (this.state === "levelselect") {
    updateLevelSelectUI.call(this);
    return;
  }

  if (this.state === "pause") {
    this.pause_text.setVisible(true);
    if (!this.resumeTouchSet) {
      this.resumeTouchSet = true;
      this.input.once("pointerdown", () => {
        if (this.state === "pause") {
          this.state = "play";
          this.pause_text.setVisible(false);
          this.resumeTouchSet = false;
        }
      });
    }

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.state = "play";
      this.pause_text.setVisible(false);
      this.resumeTouchSet = false;
    }
    return;
  }

  if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
    this.input.once("pointerdown", () => {
      if (this.state === "pause") {
        this.state = "play";
        this.pause_text.setVisible(false);
      }
    });

    return;
  }
  if (Phaser.Input.Keyboard.JustDown(this.keyF))
    applyPowerup.call(this, { type: "fireball" });
  if (Phaser.Input.Keyboard.JustDown(this.keyE))
    applyPowerup.call(this, { type: "paddle_size" });
  if (Phaser.Input.Keyboard.JustDown(this.keyS))
    applyPowerup.call(this, { type: "speed_modifier" });

  if (!this.isDraggingPaddle) {
    if (this.cursors.up.isDown && this.player_paddle.y - paddle_size / 2 > 0) {
      this.player_paddle.y -=
        PADDLE_SPEED *
        (this.active_powerups["speed_modifier"]
          ? 1.0 + 0.2 * this.active_powerups["speed_modifier"].length
          : 1.0);
    }
    if (
      this.cursors.down.isDown &&
      this.player_paddle.y + paddle_size / 2 < HEIGHT
    ) {
      this.player_paddle.y +=
        PADDLE_SPEED *
        (this.active_powerups["speed_modifier"]
          ? 1.0 + 0.2 * this.active_powerups["speed_modifier"].length
          : 1.0);
    }
  }

  if (this.cursors.up.isDown && this.player_paddle.y - paddle_size / 2 > 0) {
    this.player_paddle.y -=
      PADDLE_SPEED *
      (this.active_powerups["speed_modifier"]
        ? 1.0 + 0.2 * this.active_powerups["speed_modifier"].length
        : 1.0);
  }
  if (
    this.cursors.down.isDown &&
    this.player_paddle.y + paddle_size / 2 < HEIGHT
  ) {
    this.player_paddle.y +=
      PADDLE_SPEED *
      (this.active_powerups["speed_modifier"]
        ? 1.0 + 0.2 * this.active_powerups["speed_modifier"].length
        : 1.0);
  }

  let cpu_size = Math.max(
    20,
    PADDLE_HEIGHT *
      (1.0 -
        0.3 *
          (this.active_powerups["paddle_size"]
            ? this.active_powerups["paddle_size"].length
            : 0))
  );
  this.cpu_paddle.displayHeight = cpu_size;
  let cpu_speed =
    PADDLE_SPEED *
    0.8 *
    (this.active_powerups["speed_modifier"]
      ? Math.max(0.2, 1.0 - 0.2 * this.active_powerups["speed_modifier"].length)
      : 1.0);
  if (
    this.cpu_paddle.y < this.ball.y &&
    this.cpu_paddle.y + cpu_size / 2 < HEIGHT
  ) {
    if (this.ball_speed_x > 0 && Math.random() < this.cpu_miss_chance) {
    } else this.cpu_paddle.y += cpu_speed;
  }
  if (this.cpu_paddle.y > this.ball.y && this.cpu_paddle.y - cpu_size / 2 > 0) {
    if (this.ball_speed_x > 0 && Math.random() < this.cpu_miss_chance) {
    } else this.cpu_paddle.y -= cpu_speed;
  }

  let speed_multiplier = this.active_powerups["speed_modifier"]
    ? 1.0 + 0.2 * this.active_powerups["speed_modifier"].length
    : 1.0;
  this.ball.x += this.ball_speed_x * speed_multiplier;
  this.ball.y += this.ball_speed_y * speed_multiplier;

  spawnPowerup.call(this);
  updatePowerupShapes.call(this);

  for (let i = this.powerups.length - 1; i >= 0; i--) {
    if (rectsOverlapSimple(this.ball, this.powerups[i])) {
      applyPowerup.call(this, this.powerups[i]);
      this.powerups.splice(i, 1);
      this.powerup_shapes[i].destroy();
      this.powerup_shapes.splice(i, 1);
    }
  }

  let now = this.time.now;
  let to_remove = [];
  for (let ptype in this.active_powerups) {
    let expiries = this.active_powerups[ptype].filter((t) => t > now);
    if (expiries.length) {
      this.active_powerups[ptype] = expiries;
    } else {
      to_remove.push(ptype);
    }
  }
  for (let ptype of to_remove) delete this.active_powerups[ptype];

  if (this.ball_speed_x > 0)
    this.cpu_miss_chance = Math.min(0.35, (this.cpu_miss_chance || 0) + 0.01);
  else this.cpu_miss_chance = Math.max(0.0, (this.cpu_miss_chance || 0) - 0.01);

  if (this.ball.y - BALL_SIZE / 2 <= 0 || this.ball.y + BALL_SIZE / 2 >= HEIGHT)
    this.ball_speed_y = -this.ball_speed_y;
  if (
    rectsOverlapSimple(this.ball, this.player_paddle) &&
    this.ball_speed_x < 0
  )
    this.ball_speed_x = -this.ball_speed_x;
  if (rectsOverlapSimple(this.ball, this.cpu_paddle) && this.ball_speed_x > 0)
    this.ball_speed_x = -this.ball_speed_x;

  if (this.ball.x - BALL_SIZE / 2 <= 0) {
    this.cpu_score += 1;
    resetBall.call(this);
    this.cpu_miss_chance = 0.0;
  }
  if (this.ball.x + BALL_SIZE / 2 >= WIDTH) {
    this.player_score += 1;
    if (this.player_score >= level_score_targets[this.current_level]) {
      if (this.current_level + 1 < NUM_LEVELS)
        this.level_unlocks[this.current_level + 1] = true;
      showLevelSelect.call(this, "Level Complete!");
      return;
    }
    resetBall.call(this);
  }
  if (
    this.cpu_score >= 10 &&
    this.player_score < level_score_targets[this.current_level]
  ) {
    showLevelSelect.call(this, "Game Over");
    return;
  }

  this.player_paddle.setPosition(50, this.player_paddle.y);
  this.cpu_paddle.setPosition(WIDTH - 50 - PADDLE_WIDTH, this.cpu_paddle.y);
  this.player_paddle.displayHeight = paddle_size;
  this.ball.setPosition(this.ball.x, this.ball.y);
  this.ball.setFillStyle(this.active_powerups["fireball"] ? NEON_RED : WHITE);

  this.player_score_text.setText(this.player_score);
  this.cpu_score_text.setText(this.cpu_score);
  if (this.active_powerups["fireball"]) {
    if (
      this.fireball_trail.length === 0 ||
      Phaser.Math.Distance.Between(
        this.ball.x,
        this.ball.y,
        this.fireball_trail[this.fireball_trail.length - 1].x,
        this.fireball_trail[this.fireball_trail.length - 1].y
      ) > 16
    ) {
      let dot = this.add.ellipse(
        this.ball.x,
        this.ball.y,
        BALL_SIZE,
        BALL_SIZE,
        NEON_RED,
        0.5
      );
      dot.birth = this.time.now;
      this.fireball_trail.push(dot);
    }
  }
  for (let i = this.fireball_trail.length - 1; i >= 0; i--) {
    if (this.time.now - this.fireball_trail[i].birth > 500) {
      this.fireball_trail[i].destroy();
      this.fireball_trail.splice(i, 1);
    }
  }

  let powerup_texts = [];
  if (this.active_powerups["fireball"]) powerup_texts.push("FIREBALL");
  if (this.active_powerups["speed_modifier"])
    powerup_texts.push(
      "SPEED UP x" + this.active_powerups["speed_modifier"].length
    );
  if (this.active_powerups["paddle_size"])
    powerup_texts.push(
      "PADDLE SIZE x" + this.active_powerups["paddle_size"].length
    );
  this.powerup_text.setText(powerup_texts.join(" | "));
  this.powerup_text.setColor(
    this.active_powerups["fireball"] ? "#ff0000" : "#fff"
  );
}

function rectsOverlapSimple(ball, rect) {
  let bx = ball.x - BALL_SIZE / 2,
    by = ball.y - BALL_SIZE / 2,
    bw = BALL_SIZE,
    bh = BALL_SIZE;
  let px = rect.x,
    py,
    pw,
    ph;
  if (rect === this.player_paddle || rect === this.cpu_paddle) {
    pw = rect.width;
    ph = rect.displayHeight;
    py = rect.y - ph / 2;
  } else {
    pw = rect.width;
    ph = rect.height;
    py = rect.y;
  }
  return bx < px + pw && bx + bw > px && by < py + ph && by + bh > py;
}

function spawnPowerup() {
  if (this.powerups.length < 2 && Math.random() < POWERUP_SPAWN_RATE) {
    let x = Phaser.Math.Between(100, WIDTH - 100 - POWERUP_SIZE);
    let y = Phaser.Math.Between(100, HEIGHT - 100 - POWERUP_SIZE);
    let types = ["fireball", "speed_modifier", "paddle_size"];
    let type = Phaser.Utils.Array.GetRandom(types);
    this.powerups.push({
      x,
      y,
      width: POWERUP_SIZE,
      height: POWERUP_SIZE,
      type,
    });
  }
}

function updatePowerupShapes() {
  while (this.powerup_shapes.length > this.powerups.length) {
    this.powerup_shapes.pop().destroy();
  }
  while (this.powerup_shapes.length < this.powerups.length) {
    let p = this.powerups[this.powerup_shapes.length];
    let shape;
    if (p.type === "fireball") {
      shape = this.add
        .ellipse(
          p.x + POWERUP_SIZE / 2,
          p.y + POWERUP_SIZE / 2,
          POWERUP_SIZE,
          POWERUP_SIZE,
          NEON_RED
        )
        .setStrokeStyle(2, WHITE);
    } else if (p.type === "speed_modifier") {
      shape = this.add
        .rectangle(p.x, p.y, POWERUP_SIZE, POWERUP_SIZE, 0x00ff00)
        .setOrigin(0, 0)
        .setStrokeStyle(2, WHITE);
    } else if (p.type === "paddle_size") {
      shape = this.add
        .rectangle(p.x, p.y, POWERUP_SIZE, POWERUP_SIZE, 0x00ffff)
        .setOrigin(0, 0)
        .setStrokeStyle(2, WHITE);
    }
    this.powerup_shapes.push(shape);
  }
  for (let i = 0; i < this.powerups.length; i++) {
    let p = this.powerups[i],
      shape = this.powerup_shapes[i];
    if (p.type === "fireball")
      shape.setPosition(p.x + POWERUP_SIZE / 2, p.y + POWERUP_SIZE / 2);
    else shape.setPosition(p.x, p.y);
  }
}

function applyPowerup(powerup) {
  playCoinSound();
  let now = this.time.now;
  let duration = 20000;
  if (!this.active_powerups[powerup.type])
    this.active_powerups[powerup.type] = [];
  this.active_powerups[powerup.type].push(now + duration);
}

function resetBall() {
  this.ball.x = WIDTH / 2;
  this.ball.y = HEIGHT / 2;
  this.ball.setPosition(this.ball.x, this.ball.y);
  this.ball_speed_x = BALL_SPEED * Phaser.Math.RND.sign();
  this.ball_speed_y = BALL_SPEED * Phaser.Math.RND.sign();
}

function showMenu() {
  this.fireball_trail.forEach((dot) => dot.destroy());
  this.fireball_trail = [];
  this.state = "menu";
  this.player_paddle.setVisible(false);
  this.cpu_paddle.setVisible(false);
  this.ball.setVisible(false);
  this.player_score_text.setVisible(false);
  this.cpu_score_text.setVisible(false);
  this.powerup_text.setVisible(false);
  this.pause_text.setVisible(false);
  this.powerup_shapes.forEach((s) => s.setVisible(false));
  this.menu_texts.forEach((t) => t.destroy());
  this.menu_texts = [];
  this.menu_texts.push(
    this.add
      .text(WIDTH / 2, HEIGHT / 3, "Neon Pong", {
        fontSize: 72,
        color: "#00ffff",
      })
      .setOrigin(0.5)
  );
  this.menu_texts.push(
    this.add
      .text(WIDTH / 2, HEIGHT / 2, "Touch to Start", {
        fontSize: 36,
        color: "#fff",
      })
      .setOrigin(0.5)
  );
  this.menu_texts.push(
    this.add
      .text(WIDTH / 2, HEIGHT / 2 + 50, " ", {
        fontSize: 36,
        color: "#fff",
      })
      .setOrigin(0.5)
  );
}
function playCoinSound() {
  const ctx =
    this.sound && this.sound.context
      ? this.sound.context
      : new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square"; // or 'sine', 'triangle', 'sawtooth'
  o.frequency.value = 880; // Coin sound frequency in Hz
  g.gain.value = 0.001; // Volume

  o.connect(g);
  g.connect(ctx.destination);

  o.start();
  o.frequency.linearRampToValueAtTime(1760, ctx.currentTime + 0.1); // quick pitch up
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15); // fade out

  o.stop(ctx.currentTime + 0.15);
}

function showLevelSelect(message) {
  this.fireball_trail.forEach((dot) => dot.destroy());
  this.fireball_trail = [];
  this.menu_texts.forEach((t) => t.destroy());
  this.menu_texts = [];
  this.state = "levelselect";
  this.player_paddle.setVisible(false);
  this.cpu_paddle.setVisible(false);
  this.ball.setVisible(false);
  this.player_score_text.setVisible(false);
  this.cpu_score_text.setVisible(false);
  this.powerup_text.setVisible(false);
  this.pause_text.setVisible(false);
  this.powerup_shapes.forEach((s) => s.setVisible(false));
  this.level_select_texts.forEach((t) => t.destroy());
  this.level_select_texts = [];
  this.level_select_texts.push(
    this.add
      .text(WIDTH / 2, 40, "Select Level", { fontSize: 72, color: "#00ffff" })
      .setOrigin(0.5)
  );
  let grid_margin = 60,
    grid_spacing_x = (WIDTH - 2 * grid_margin) / 5,
    grid_spacing_y = 80,
    button_width = 110,
    button_height = 60;
  for (let i = 0; i < NUM_LEVELS; i++) {
    let col = i % 5,
      row = Math.floor(i / 5);
    let x = grid_margin + col * grid_spacing_x,
      y = 150 + row * grid_spacing_y;
    let isUnlocked = this.level_unlocks[i];
    let color = isUnlocked ? "#00ff00" : "#646464";
    let borderColor = i === this.level_select_cursor ? "#ff00ff" : "#222";
    let rect = this.add
      .rectangle(
        x + button_width / 2,
        y + button_height / 2,
        button_width,
        button_height,
        Phaser.Display.Color.HexStringToColor(color).color
      )
      .setStrokeStyle(
        3,
        Phaser.Display.Color.HexStringToColor(borderColor).color
      );
    this.level_select_texts.push(rect);
    let label = isUnlocked ? `Stage ${i + 1}` : "Locked";
    let fontSize = isUnlocked ? 24 : 20;
    let txt = this.add
      .text(x + button_width / 2, y + button_height / 2, label, {
        fontSize: fontSize,
        color: isUnlocked ? "#000" : "#fff",
        align: "center",
        wordWrap: { width: button_width - 10 },
      })
      .setOrigin(0.5);
    this.level_select_texts.push(txt);
  }
}

function updateLevelSelectUI() {
  let grid_margin = 60,
    grid_spacing_x = (WIDTH - 2 * grid_margin) / 5,
    grid_spacing_y = 80,
    button_width = 110,
    button_height = 60;
  for (let i = 0; i < NUM_LEVELS; i++) {
    let rect = this.level_select_texts[1 + i * 2];
    let borderColor = i === this.level_select_cursor ? "#ff00ff" : "#222";
    rect.setStrokeStyle(
      3,
      Phaser.Display.Color.HexStringToColor(borderColor).color
    );
  }
}

function getLevelClicked(x, y) {
  let grid_margin = 60,
    grid_spacing_x = (WIDTH - 2 * grid_margin) / 5,
    grid_spacing_y = 80,
    button_width = 110,
    button_height = 60;
  for (let i = 0; i < NUM_LEVELS; i++) {
    let col = i % 5,
      row = Math.floor(i / 5);
    let bx = grid_margin + col * grid_spacing_x,
      by = 150 + row * grid_spacing_y;
    if (x >= bx && x <= bx + button_width && y >= by && y <= by + button_height)
      return i;
  }
  return null;
}

function startLevel(idx) {
  this.current_level = idx;
  this.player_score = 0;
  this.cpu_score = 0;
  this.state = "play";
  this.active_powerups = {};
  this.paddle_size_multiplier = 1.0;
  this.speed_multiplier = 1.0;
  this.cpu_speed_multiplier = 1.0;
  this.fireball_active = false;
  this.cpu_miss_chance = 0.0;
  this.powerups = [];
  this.fireball_trail = [];
  this.player_paddle.setVisible(true);
  this.cpu_paddle.setVisible(true);
  this.ball.setVisible(true);
  this.player_score_text.setVisible(true);
  this.cpu_score_text.setVisible(true);
  this.powerup_text.setVisible(true);
  this.pause_text.setVisible(false);
  this.powerup_shapes.forEach((s) => s.setVisible(true));
  this.menu_texts.forEach((t) => t.destroy());
  this.menu_texts = [];
  this.level_select_texts.forEach((t) => t.destroy());
  this.level_select_texts = [];
  this.player_paddle.setPosition(50, HEIGHT / 2);
  this.cpu_paddle.setPosition(WIDTH - 50 - PADDLE_WIDTH, HEIGHT / 2);
  this.ball.x = WIDTH / 2;
  this.ball.y = HEIGHT / 2;
  this.ball.setPosition(this.ball.x, this.ball.y);
  this.ball_speed_x = BALL_SPEED * Phaser.Math.RND.sign();
  this.ball_speed_y = BALL_SPEED * Phaser.Math.RND.sign();
}
