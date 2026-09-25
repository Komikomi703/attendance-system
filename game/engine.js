/* Canvasに依存しないゲームルール。時間は秒、座標は480×640。 */
(function (root) {
    'use strict';
    const STAGES = [
        { name: 'キャンパス', icon: '🏫', tint: '#e7efdc', color: '#89bda3', sky: '#e1efdf', boss: 'キャンパス・ガーディアン', duration: 45, interval: 1.8, speed: 42, hp: 90, description: 'のんびりキャンパス散歩。ゆっくりした敵で練習しよう。' },
        { name: '教室', icon: '📚', tint: '#f6e6c8', color: '#d5aa72', sky: '#eadbbd', boss: '黒板のらくがき王', duration: 50, interval: 1.4, speed: 55, hp: 125, description: '放課後の教室へ。左右から飛びこむノートにも注意！' },
        { name: 'ネットワーク', icon: '⌘', tint: '#e3dff6', color: '#8b8de7', sky: '#20244d', boss: 'ERROR コア', duration: 55, interval: 1.2, speed: 65, hp: 155, description: '青と紫のデータ世界。バグたちの狙い弾をかわそう。' },
        { name: '宇宙', icon: '🪐', tint: '#dfe7f5', color: '#759dcf', sky: '#17213d', boss: 'ほしぞらクルーザー', duration: 60, interval: 1, speed: 80, hp: 185, description: '流れる星の海へ。速い編隊と中ボスが待っている。' },
        { name: 'FINAL', icon: '✦', tint: '#f6dde4', color: '#cf7899', sky: '#30203c', boss: 'ラスト・オービット', duration: 65, interval: .85, speed: 85, hp: 240, description: '通常敵 → 強敵と中ボス → ラスボス。最後の挑戦！' }
    ];
    const DIFFICULTIES = {
        EASY: { hp: 5, speed: .82, enemyHP: .9, spawn: 1.18, bullet: .86, fire: 1.35, drop: .34, maxBullets: 45, count: 0, description: 'HP 5 / ゆっくり・弾少なめ・アイテム多め' },
        NORMAL: { hp: 3, speed: 1.17, enemyHP: 1, spawn: .85, bullet: 1.16, fire: .88, drop: .22, maxBullets: 75, count: 1, description: 'HP 3 / 速めの敵・狙い弾に注意' },
        HARD: { hp: 2, speed: 1.45, enemyHP: 1.35, spawn: .66, bullet: 1.34, fire: .7, drop: .16, maxBullets: 130, count: 2, description: 'HP 2 / 高速編隊・連続攻撃に挑戦' }
    };
    const ITEM_LABELS = { heal: 'HP回復', rapid: '連射UP', power: '攻撃力UP', spread: '3WAY', shield: 'シールド', bomb: 'ボム' };
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
    class Game {
        constructor(stage = 1, difficulty = 'NORMAL', random = Math.random) {
            this.stage = stage; this.config = STAGES[stage - 1]; this.difficulty = difficulty;
            this.rules = DIFFICULTIES[difficulty]; this.random = random;
            this.player = { x: 240, y: 556, previousX: 240, previousY: 556, r: 10, hp: this.rules.hp, maxHP: this.rules.hp, level: 1, attack: 1, speed: 270, rapid: 0, shield: 0, bombs: 1, invincible: 1 };
            this.rings = []; this.popups = []; this.flash = 0;
            this.enemies = []; this.shots = []; this.bullets = []; this.items = []; this.particles = [];
            this.time = 0; this.spawnTimer = 1.6; this.shotTimer = 0; this.wave = 0;
            this.score = 0; this.combo = 0; this.maxCombo = 0; this.comboTimer = 0; this.kills = 0; this.hits = 0;
            this.events = []; this.state = 'running'; this.boss = null; this.midSpawned = false; this.bossSpawned = false;
            this.notice = `STAGE ${stage}`; this.noticeTime = 2.4; this.shake = 0;
        }
        emit(type) { if (this.events.length < 32) this.events.push(type); }
        announce(text, duration = 1.5) { this.notice = text; this.noticeTime = duration; }
        burst(x, y, color, count = 12) {
            for (let i = 0; i < count && this.particles.length < 180; i++) {
                const a = this.random() * Math.PI * 2, speed = 25 + this.random() * 95;
                this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .5, color });
            }
        }
        ring(x, y, color, radius = 40) {
            if (this.rings.length < 12) this.rings.push({ x, y, color, radius, life: .45 });
        }
        popup(text, x, y) { if (this.popups.length < 12) this.popups.push({ text, x, y, life: .8 }); }
        spawnEnemy(type, x, y = -24, vx = 0) {
            const heavy = type === 'heavy', hp = Math.ceil((heavy ? 7 : 2 + Math.floor(this.stage / 3)) * this.rules.enemyHP);
            this.enemies.push({ type, x, y, baseX: x, vx, r: heavy ? 22 : 16, hp, maxHP: hp, age: 0, hitFlash: 0, fire: 1.4 + this.random(), speed: this.config.speed * this.rules.speed, value: heavy ? 300 : 100 });
        }
        spawnWave() {
            this.wave++;
            if (this.stage >= 2 && this.wave % 4 === 0) {
                for (let i = 0; i < (this.difficulty === 'EASY' ? 3 : 4); i++) this.spawnEnemy('formation', 100 + i * 80, -30 - Math.abs(1.5 - i) * 25);
            } else if (this.stage >= 2 && this.wave % 3 === 0) {
                const left = this.wave % 2 === 0;
                this.spawnEnemy('diagonal', left ? -20 : 500, 90, (left ? 1 : -1) * 65 * this.rules.speed);
            } else {
                const strongWave = this.stage >= 3 && (this.stage !== 5 || this.time > this.config.duration * .3);
                const type = strongWave && this.wave % 5 === 0 ? 'heavy' : this.stage >= 2 && this.wave % 7 === 0 ? 'diver' : this.wave % 3 === 0 ? 'aim' : this.wave % 2 ? 'straight' : 'sway';
                this.spawnEnemy(type, 45 + this.random() * 390);
                if (this.difficulty === 'HARD' && this.wave % 3 === 1) this.spawnEnemy('sway', 45 + this.random() * 390, -65);
            }
        }
        spawnBoss(mid = false) {
            const hp = Math.round((mid ? this.config.hp * .3 : this.config.hp) * this.rules.enemyHP);
            this.boss = { x: 240, y: -70, r: mid ? 34 : 46, hp, maxHP: hp, age: 0, hitFlash: 0, phase: 0, fire: 2, volley: 0, mid, value: mid ? 1000 : 5000, type: 'boss' };
            this.bullets = []; this.enemies = [];
            this.emit('boss');
            this.announce(mid ? 'WARNING · 中ボス' : 'WARNING · BOSS', 2.2);
        }
        bullet(x, y, angle, speed = 115, radius = 5) {
            if (this.bullets.length >= this.rules.maxBullets) return;
            this.bullets.push({ x, y, vx: Math.cos(angle) * speed * this.rules.bullet, vy: Math.sin(angle) * speed * this.rules.bullet, r: radius });
        }
        aimed(enemy, count = 1, speed = 115) {
            const target = enemy.aimPoint || this.player;
            const a = Math.atan2(target.y - enemy.y, target.x - enemy.x);
            for (let i = 0; i < count; i++) this.bullet(enemy.x, enemy.y + enemy.r, a + (i - (count - 1) / 2) * .23, speed);
        }
        bossAttack() {
            const boss = this.boss, ratio = boss.hp / boss.maxHP;
            const phase = ratio > .7 ? 0 : ratio > .4 ? 1 : 2;
            const patterns = this.stage === 5 ? 3 + phase : Math.min(5, 2 + phase + (this.stage >= 3 ? 1 : 0));
            const pattern = boss.volley++ % (patterns + (this.difficulty === 'HARD' ? 1 : 0));
            const count = 1 + this.rules.count * 2 + (this.stage >= 3 ? 2 : 0);
            if (pattern === 0) this.aimed(boss, count, 110);
            else if (pattern === 1) this.aimed(boss, Math.max(1, count - 2), 175);
            else if (pattern === 2) {
                for (let i = 0; i < count + 2; i++) this.bullet(boss.x, boss.y + 25, Math.PI / 2 + (i - (count + 1) / 2) * .22, 105);
            } else if (pattern === 3) {
                const n = this.difficulty === 'EASY' ? 8 : this.difficulty === 'NORMAL' ? 10 : 14;
                for (let i = 0; i < n; i++) this.bullet(boss.x, boss.y, i * Math.PI * 2 / n + boss.volley * .13, 95);
            } else if (pattern === 5) {
                // レーン弾には毎回幅のある逃げ道を残す。
                const gap = 1 + boss.volley % 4;
                for (let lane = 0; lane < 6; lane++) if (Math.abs(lane - gap) > .5) this.bullet(45 + lane * 78, 40, Math.PI / 2, 140, 6);
            } else {
                // 時間差の3連射。発射後に進路を追尾しないため回避できる。
                boss.burstLeft = 3; boss.burstTimer = 0;
            }
            boss.fire = (1.5 - phase * .22) * this.rules.fire; boss.aimPoint = null;
        }
        shoot() {
            const p = this.player;
            const angles = p.level >= 5 ? [-.28, -.14, 0, .14, .28] : p.level >= 3 ? [-.2, 0, .2] : [0];
            for (const a of angles) this.shots.push({ x: p.x, y: p.y - 24, vx: Math.sin(a) * 440, vy: -Math.cos(a) * 440, r: p.level >= 5 ? 6 : 4, damage: p.attack, pierce: p.level >= 4, hit: new Set() });
            this.emit('shoot');
            this.shotTimer = (p.level >= 2 ? .18 : .27) / (1 + p.rapid * .12);
        }
        damagePlayer() {
            const p = this.player;
            if (p.invincible > 0 || this.state !== 'running') return;
            p.invincible = 1.1;
            if (p.shield > 0) { p.shield--; this.burst(p.x, p.y, '#8ae8f4'); return; }
            this.emit('hit');
            p.hp--; this.hits++; this.combo = 0; this.comboTimer = 0; this.shake = .2;
            this.burst(p.x, p.y, '#f899b3'); this.flash = .18; this.ring(p.x, p.y, '#f899b3');
            if (p.hp <= 0) { this.state = 'over'; this.announce('GAME OVER', 3); }
        }
        collect(item) {
            this.emit('item');
            const p = this.player;
            if (item.type === 'heal') p.hp = Math.min(p.maxHP, p.hp + 1);
            if (item.type === 'rapid') { p.rapid = Math.min(4, p.rapid + 1); p.level = Math.min(5, p.level + 1); }
            if (item.type === 'power') { p.attack = Math.min(4, p.attack + .5); p.level = Math.min(5, p.level + 1); }
            if (item.type === 'spread') p.level = Math.min(5, Math.max(3, p.level + 1));
            if (item.type === 'shield') p.shield = Math.min(3, p.shield + 1);
            if (item.type === 'bomb') p.bombs = Math.min(5, p.bombs + 1);
            this.ring(item.x, item.y, '#f9d865'); this.burst(item.x, item.y, '#f9d865', 18); this.announce(`${ITEM_LABELS[item.type]} GET!`, .8);
        }
        defeat(enemy) {
            if (enemy.dead) return;
            this.emit('defeat');
            enemy.dead = true; this.kills++; this.combo++; this.comboTimer = 3.5;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            const points = Math.round(enemy.value * (1 + Math.min(this.combo - 1, 50) * .05));
            this.score += points; this.popup(`+${points}`, enemy.x, enemy.y); this.ring(enemy.x, enemy.y, this.config.color, enemy.r * 2);
            this.burst(enemy.x, enemy.y, this.config.color, enemy.type === 'boss' ? 36 : 12); this.shake = .06;
            if (this.combo % 5 === 0) this.announce(`${this.combo} COMBO!`, 1);
            if (enemy.type === 'boss') {
                this.boss = null; this.bullets = [];
                if (enemy.mid) {
                    this.items.push({ x: enemy.x, y: enemy.y, r: 14, type: 'power' }, { x: enemy.x + 45, y: enemy.y, r: 14, type: 'heal' });
                } else { this.state = 'clear'; this.emit('clear'); this.announce('STAGE CLEAR!', 3); }
            } else if (this.random() < this.rules.drop) {
                const types = Object.keys(ITEM_LABELS);
                this.items.push({ x: enemy.x, y: enemy.y, r: 14, type: types[Math.floor(this.random() * types.length)] });
            }
        }
        bomb() {
            if (this.state !== 'running' || !this.player.bombs) return;
            this.player.bombs--; this.player.invincible = Math.max(1.1, this.player.invincible); this.bullets = [];
            for (const enemy of [...this.enemies, ...(this.boss ? [this.boss] : [])]) {
                enemy.hp -= 28;
                if (enemy.hp <= 0) this.defeat(enemy);
            }
            this.flash = .3; this.ring(this.player.x, this.player.y, '#fff2a0', 500);
            this.burst(this.player.x, this.player.y, '#fff2a0', 60); this.announce('BOMB!', .8); this.shake = .22;
        }
        update(dt, input = {}) {
            if (this.state !== 'running') return;
            dt = Math.min(.04, Math.max(0, dt)); this.time += dt;
            this.noticeTime -= dt; this.flash = Math.max(0, this.flash - dt); this.shake = Math.max(0, this.shake - dt);
            const p = this.player;
            p.previousX = p.x; p.previousY = p.y;
            p.invincible = Math.max(0, p.invincible - dt);
            if (input.target) {
                const dx = input.target.x - p.x, dy = input.target.y - p.y, distance = Math.hypot(dx, dy);
                const step = Math.min(distance, Math.max(p.speed * 1.5, distance * 12) * dt);
                if (distance) { p.x += dx / distance * step; p.y += dy / distance * step; }
            } else {
                const magnitude = Math.hypot(input.x || 0, input.y || 0) || 1;
                p.x += (input.x || 0) / magnitude * p.speed * dt; p.y += (input.y || 0) / magnitude * p.speed * dt;
            }
            p.x = clamp(p.x, 22, 458); p.y = clamp(p.y, 210, 605);
            this.shotTimer -= dt;
            if (input.fire && this.shotTimer <= 0) this.shoot();
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.combo = 0;
            if (!this.boss && !this.bossSpawned) {
                if (this.time >= this.config.duration) { this.bossSpawned = true; this.spawnBoss(); }
                else if (this.stage >= 4 && !this.midSpawned && this.time >= this.config.duration * .48) { this.midSpawned = true; this.spawnBoss(true); }
                else {
                    this.spawnTimer -= dt;
                    if (this.spawnTimer <= 0) { this.spawnWave(); this.spawnTimer = this.config.interval * this.rules.spawn * (1 - Math.min(.22, this.time / this.config.duration * .22)); }
                }
            }
            for (const enemy of this.enemies) {
                if (enemy.dead) continue;
                enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
                enemy.age += dt; enemy.y += enemy.speed * dt; enemy.x += enemy.vx * dt;
                if (enemy.type === 'sway' || enemy.type === 'formation') enemy.x = enemy.baseX + Math.sin(enemy.age * 2) * (enemy.type === 'formation' ? 45 : 36);
                if (enemy.type === 'diver') { enemy.x = enemy.baseX + Math.sin(enemy.age * 3) * 65; enemy.y += enemy.speed * dt * .5; }
                enemy.fire -= dt;
                if (enemy.fire < .5 && !enemy.aimPoint) enemy.aimPoint = { x: p.x, y: p.y };
                if (enemy.fire <= 0 && enemy.y > 20 && enemy.y < 410) {
                    this.aimed(enemy, this.stage >= 3 ? (enemy.type === 'heavy' ? 3 : 1) + this.rules.count : 1, 110 + this.stage * 7);
                    enemy.fire = (this.stage === 1 ? 3.3 : 2.3) * this.rules.fire; enemy.aimPoint = null;
                }
            }
            const boss = this.boss;
            if (boss) {
                boss.hitFlash = Math.max(0, boss.hitFlash - dt);
                const phase = boss.hp / boss.maxHP > .7 ? 0 : boss.hp / boss.maxHP > .4 ? 1 : 2;
                if (phase > boss.phase) { boss.phase = phase; this.announce(`BOSS · PHASE ${phase + 1}`, 1); this.ring(boss.x, boss.y, '#ffaeae', 140); }
                boss.age += dt; boss.y = Math.min(100, boss.y + dt * 70); boss.x = 240 + Math.sin(boss.age * (.75 + boss.phase * .12)) * 132;
                if (boss.y >= 100) {
                    boss.fire -= dt;
                    if (boss.fire < .55 && !boss.aimPoint) boss.aimPoint = { x: p.x, y: p.y };
                    if (boss.fire <= 0) this.bossAttack();
                    if (boss.burstLeft > 0) {
                        boss.burstTimer -= dt;
                        if (boss.burstTimer <= 0) { this.aimed(boss, 1 + this.rules.count, 150); boss.burstLeft--; boss.burstTimer = .22; }
                    }
                }
            }
            const targets = [...this.enemies, ...(this.boss ? [this.boss] : [])];
            for (const shot of this.shots) {
                shot.x += shot.vx * dt; shot.y += shot.vy * dt;
                for (const enemy of targets) {
                    if (shot.dead || enemy.dead || shot.hit.has(enemy) || !near(shot, enemy)) continue;
                    shot.hit.add(enemy); enemy.hp -= shot.damage; enemy.hitFlash = .08;
                    this.burst(shot.x, shot.y, '#fff1b0', 2);
                    if (!shot.pierce) shot.dead = true;
                    if (enemy.hp <= 0) this.defeat(enemy);
                }
            }
            // クリアしたフレームの残弾でGAME OVERにしない。
            if (this.state === 'running') {
                for (const b of this.bullets) {
                    b.x += b.vx * dt; b.y += b.vy * dt;
                    if (near(b, p)) { b.dead = true; this.damagePlayer(); }
                }
                for (const enemy of targets) if (!enemy.dead && near(enemy, p)) this.damagePlayer();
                for (const item of this.items) {
                    item.y += 70 * dt;
                    if (Math.hypot(item.x - p.x, item.y - p.y) < 38) { this.collect(item); item.dead = true; }
                }
            }
            for (const ring of this.rings) ring.life -= dt;
            for (const popup of this.popups) { popup.life -= dt; popup.y -= dt * 35; }
            this.rings = this.rings.filter(r => r.life > 0); this.popups = this.popups.filter(p => p.life > 0);
            for (const part of this.particles) { part.x += part.vx * dt; part.y += part.vy * dt; part.life -= dt; }
            this.enemies = this.enemies.filter(e => !e.dead && e.y < 680 && e.x > -90 && e.x < 570);
            this.shots = this.shots.filter(b => !b.dead && b.y > -30 && b.x > -20 && b.x < 500);
            this.bullets = this.bullets.filter(b => !b.dead && b.y < 670 && b.y > -60 && b.x > -30 && b.x < 510);
            this.items = this.items.filter(i => !i.dead && i.y < 670);
            this.particles = this.particles.filter(particle => particle.life > 0);
        }
    }
    const api = { Game, STAGES, DIFFICULTIES, ITEM_LABELS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ChibanyEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
