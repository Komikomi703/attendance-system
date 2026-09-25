const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, DIFFICULTIES } = require('../game/engine.js');
const advance = (g, seconds, input = {}) => { for (let i = 0; i < seconds * 50; i++) g.update(.02, input); };

test('全ステージ・難易度で中ボスと最終ボスに到達しクリアできる', () => {
    for (let stage = 1; stage <= 5; stage++) for (const difficulty of Object.keys(DIFFICULTIES)) {
        const g = new Game(stage, difficulty, () => .5);
        g.player.invincible = 999;
        if (stage >= 4) {
            advance(g, g.config.duration * .5);
            assert.equal(g.boss.mid, true);
            g.boss.hp = 1; g.shots.push({ x: g.boss.x, y: g.boss.y, vx: 0, vy: 0, r: 10, damage: 5, hit: new Set() });
            g.update(.02); assert.equal(g.boss, null); assert.equal(g.state, 'running');
        }
        advance(g, g.config.duration - g.time + .1);
        assert.equal(g.boss.mid, false);
        const boss = g.boss;
        boss.hp = 1; g.shots.push({ x: boss.x, y: boss.y, vx: 0, vy: 0, r: 10, damage: 5, hit: new Set() });
        g.update(.02); assert.equal(g.state, 'clear'); assert.ok(g.score >= 5000);
    }
});

test('被弾は1秒以上保護し、シールド消費とHPゼロを正しく処理する', () => {
    const g = new Game(1, 'HARD'); g.player.invincible = 0;
    const hit = () => { g.bullets.push({ x: g.player.x, y: g.player.y, vx: 0, vy: 0, r: 5 }); g.update(.02); };
    hit(); hit(); assert.equal(g.player.hp, 1); assert.equal(g.hits, 1);
    advance(g, 1.12); g.collect({ type: 'shield', x: 0, y: 0 }); hit();
    assert.equal(g.player.hp, 1); assert.equal(g.player.shield, 0);
    advance(g, 1.12); hit(); assert.equal(g.state, 'over'); assert.equal(g.hits, 2);
});

test('6アイテム・レベル・貫通・ボム・コンボ・上限', () => {
    const g = new Game(3, 'EASY', () => 0); const p = g.player;
    p.hp = 2; g.collect({ type: 'heal' }); assert.equal(p.hp, 3);
    g.collect({ type: 'rapid' }); assert.equal(p.level, 2); assert.equal(p.rapid, 1);
    g.collect({ type: 'spread' }); g.shoot(); assert.equal(g.shots.length, 3);
    g.collect({ type: 'power' }); assert.equal(p.level, 4); assert.equal(p.attack, 1.5);
    g.shots = []; g.shoot(); assert.equal(g.shots[0].pierce, true);
    g.collect({ type: 'power' }); g.shots = []; g.shoot(); assert.equal(g.shots.length, 5);
    g.collect({ type: 'shield' }); assert.equal(p.shield, 1);
    g.collect({ type: 'bomb' }); assert.equal(p.bombs, 2);
    for (let i = 0; i < 5; i++) g.spawnEnemy('straight', 100, 100);
    g.bullet(200, 200, 1); g.bomb();
    assert.equal(g.bullets.length, 0); assert.equal(g.kills, 5); assert.equal(g.maxCombo, 5); assert.ok(g.score > 500); assert.equal(p.bombs, 1);
    assert.equal(g.items.length, 5); advance(g, 3.6); assert.equal(g.combo, 0);
    advance(g, 4, { x: 1, y: 1 }); assert.ok(p.x <= 458 && p.y <= 605);
});

test('難易度がHP・敵速度・出現数・敵弾・アイテム率に反映される', () => {
    const easy = new Game(5, 'EASY'), hard = new Game(5, 'HARD');
    assert.equal(easy.player.hp, 5); assert.equal(hard.player.hp, 2);
    easy.spawnEnemy('heavy', 100); hard.spawnEnemy('heavy', 100);
    assert.ok(easy.enemies[0].hp < hard.enemies[0].hp); assert.ok(easy.enemies[0].speed < hard.enemies[0].speed);
    assert.ok(easy.rules.spawn > hard.rules.spawn); assert.ok(easy.rules.drop > hard.rules.drop);
    for (const g of [easy, hard]) { g.spawnBoss(); g.bossAttack(); }
    assert.ok(easy.bullets.length < hard.bullets.length);
    assert.ok(Math.hypot(easy.bullets[0].vx, easy.bullets[0].vy) < Math.hypot(hard.bullets[0].vx, hard.bullets[0].vy));
});

test('最終ボス全フェーズの攻撃と長時間実行でも弾・粒子が上限内', () => {
    const g = new Game(5, 'HARD'); g.spawnBoss(); g.bossSpawned = true; g.player.invincible = 999;
    for (const ratio of [1, .6, .3]) {
        g.boss.hp = g.boss.maxHP * ratio;
        for (let i = 0; i < 12; i++) g.bossAttack();
        advance(g, 10);
        assert.ok(g.bullets.length <= g.rules.maxBullets); assert.ok(g.particles.length <= 180);
    }
});

test('アイテム衝突でパワーアップ、貫通弾は同じ敵に重複ダメージを与えない', () => {
    const g = new Game(3, 'NORMAL', () => .9);
    g.items.push({ x: g.player.x, y: g.player.y, r: 14, type: 'spread' });
    g.update(.02); assert.equal(g.player.level, 3); assert.equal(g.items.length, 0);
    g.spawnEnemy('heavy', 200, 200);
    const e = g.enemies[0]; e.speed = 0;
    g.shots.push({ x: 200, y: 200, vx: 0, vy: 0, r: 4, damage: 1, pierce: true, hit: new Set() });
    const hp = e.hp; advance(g, .5); assert.equal(e.hp, hp - 1);
});

test('強化した編隊・急降下・狙い弾と最終ボスの逃げ道', () => {
    const g = new Game(4, 'HARD', () => .5);
    for (let i = 0; i < 8; i++) g.spawnWave();
    assert.ok(g.enemies.some(e => e.type === 'formation'));
    assert.ok(g.enemies.some(e => e.type === 'diver'));
    const e = g.enemies[0]; e.x = 240; e.y = 100; e.aimPoint = { x: 100, y: 500 };
    g.player.x = 400; g.aimed(e); assert.ok(g.bullets.at(-1).vx < 0, '予兆時の狙い位置を保持し、回避後の自機へ曲がらない');
    const final = new Game(5, 'HARD'); final.spawnBoss(); final.boss.hp *= .3; final.boss.volley = 5;
    final.bossAttack();
    assert.equal(final.bullets.length, 5);
    const occupied = new Set(final.bullets.map(b => b.x));
    assert.equal([45,123,201,279,357,435].filter(x => !occupied.has(x)).length, 1);
    for (let i = 0; i < 50; i++) { final.ring(0,0,'#fff'); final.popup('+100',0,0); }
    assert.ok(final.rings.length <= 12); assert.ok(final.popups.length <= 12);
});
