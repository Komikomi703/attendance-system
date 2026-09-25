(() => {
    'use strict';
    const { Game, STAGES, DIFFICULTIES } = ChibanyEngine;
    const $ = id => document.getElementById(id);
    const canvas = $('canvas'), ctx = canvas.getContext('2d');
    const character = new Image(); character.src = './chibany-transparent.png';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    let displayScale = 1;
    const prefix = 'chibanyGame';
    function read(key, fallback) {
        try { const value = JSON.parse(localStorage.getItem(prefix + key)); return value === null ? fallback : value; } catch { return fallback; }
    }
    function save(key, value) {
        try { localStorage.setItem(prefix + key, JSON.stringify(value)); }
        catch { $('save-status').textContent = '記録を保存できませんでした。このまま遊べますが、記録はこの画面を閉じると失われます。'; }
    }
    const positive = value => Number.isFinite(value) && value >= 0 ? value : 0;
    let highScore = positive(read('HighScore', 0)), maxCombo = positive(read('MaxCombo', 0));
    let cleared = read('ClearedStages', []);
    cleared = Array.isArray(cleared) ? cleared.filter(n => Number.isInteger(n) && n >= 1 && n <= 5) : [];
    let soundOn = read('Sound', false) === true;
    let audioContext = null, voices = 0;
    function wakeAudio() {
        if (!soundOn) return;
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) return;
            audioContext ||= new Audio();
            audioContext.resume().catch(() => {});
        } catch { /* 音声非対応でもゲームは継続。 */ }
    }
    function quietAudio() { if (audioContext?.state === 'running') audioContext.suspend().catch(() => {}); }
    function tone(type) {
        if (!soundOn || !audioContext || audioContext.state !== 'running' || voices >= 4) return;
        const notes = { shoot: [620, .035], defeat: [180, .07], item: [880, .14], boss: [100, .24], hit: [90, .12], clear: [1046, .3] };
        const [frequency, duration] = notes[type] || notes.item;
        const osc = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
        osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now);
        osc.frequency.exponentialRampToValueAtTime(frequency * (type === 'clear' || type === 'item' ? 1.5 : .65), now + duration);
        gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.025, now + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
        osc.connect(gain); gain.connect(audioContext.destination); voices++;
        osc.onended = () => { osc.disconnect(); gain.disconnect(); voices--; if (!voices && (!game || finished || paused)) quietAudio(); };
        osc.start(); osc.stop(now + duration);
    }
    function updateSound() { $('sound').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF'; $('sound').setAttribute('aria-pressed', String(soundOn)); }
    $('sound').onclick = () => { soundOn = !soundOn; save('Sound', soundOn); updateSound(); if (soundOn) { wakeAudio(); } else quietAudio(); };
    updateSound();
    let stage = 1, difficulty = read('Difficulty', 'NORMAL');
    if (!Object.hasOwn(DIFFICULTIES, difficulty)) difficulty = 'NORMAL';
    let game = null, paused = false, frame = 0, lastTime = 0, finished = false;
    const keys = new Set(); let pointerId = null, target = null, pointerFire = false;
    const from = new URLSearchParams(location.search).get('from');
    for (const link of document.querySelectorAll('[data-return]')) link.href = '../index.html#' + (['home', 'settings', 'timetable'].includes(from) ? from : 'home');
    function records() { $('records').textContent = `BEST ${highScore.toLocaleString()}　/　MAX COMBO ×${maxCombo}　/　CLEAR ${cleared.length}/5`; }
    // SVGの線画は端末の絵文字フォントに依存しない。
    const stageIcons = [
        '<path d="M5 28V12h22v16M3 12l13-7 13 7M10 16v3m6-3v3m6-3v3M13 28v-5h6v5"/>',
        '<path d="M4 5h24v17H4zM10 22l-3 7m15-7 3 7M9 10h14M9 15h9"/>',
        '<rect x="8" y="8" width="16" height="16" rx="3"/><path d="M12 2v6m8-6v6M12 24v6m8-6v6M2 12h6m-6 8h6m16-8h6m-6 8h6M13 13h6v6h-6z"/>',
        '<circle cx="16" cy="16" r="9"/><ellipse cx="16" cy="16" rx="16" ry="4" transform="rotate(-30 16 16)"/>',
        '<path d="m16 2 4 9 10 1-7 7 2 11-9-5-9 5 2-11-7-7 10-1z"/>'
    ];
    STAGES.forEach((config, i) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'stage-card'; button.dataset.stage = i + 1;
        button.style.setProperty('--tint', config.tint);
        button.innerHTML = `<span class="scene" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${stageIcons[i]}</svg></span><strong>STAGE ${i + 1}</strong><small>${config.name}</small><span class="cleared" aria-label="クリア済み" hidden>✓</span>`;
        button.onclick = () => { stage = i + 1; updateMenu(); }; $('stages').append(button);
    });
    Object.keys(DIFFICULTIES).forEach(name => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = name; button.dataset.difficulty = name;
        button.onclick = () => { difficulty = name; save('Difficulty', name); updateMenu(); }; $('difficulties').append(button);
    });
    function updateMenu() {
        for (const button of $('stages').children) {
            button.setAttribute('aria-pressed', String(Number(button.dataset.stage) === stage));
            button.querySelector('.cleared').hidden = !cleared.includes(Number(button.dataset.stage));
        }
        for (const button of $('difficulties').children) button.setAttribute('aria-pressed', String(button.dataset.difficulty === difficulty));
        $('stage-description').textContent = STAGES[stage - 1].description;
        $('difficulty-description').textContent = DIFFICULTIES[difficulty].description; records();
    }
    function resetInput() { keys.clear(); target = null; pointerFire = false; pointerId = null; }
    function start() {
        cancelAnimationFrame(frame); resetInput(); game = new Game(stage, difficulty); paused = false; finished = false;
        $('menu').hidden = true; $('play').hidden = false; wakeAudio(); $('result').hidden = true; $('pause-panel').hidden = true;
        $('pause').disabled = false; $('pause').textContent = '一時停止'; $('mode-label').textContent = difficulty;
        document.body.classList.add('is-playing'); save('Difficulty', difficulty);
        window.scrollTo(0, 0); canvas.focus({ preventScroll: true }); lastTime = performance.now(); resizeCanvas(); draw(); updateHUD(); frame = requestAnimationFrame(tick);
    }
    function showMenu() {
        cancelAnimationFrame(frame); quietAudio(); game = null; resetInput(); paused = false;
        $('menu').hidden = false; $('play').hidden = true; document.body.classList.remove('is-playing'); updateMenu(); $('title').focus();
    }
    function pause(value) {
        if (!game || game.state !== 'running') return;
        paused = value; resetInput(); $('pause-panel').hidden = !value; $('pause').textContent = value ? '再開' : '一時停止';
        cancelAnimationFrame(frame);
        if (value) { quietAudio(); $('resume').focus(); }
        else { wakeAudio(); canvas.focus(); lastTime = performance.now(); frame = requestAnimationFrame(tick); }
    }
    function finish() {
        if (finished) return;
        finished = true; resetInput(); if (!voices) quietAudio();
        highScore = Math.max(highScore, game.score); maxCombo = Math.max(maxCombo, game.maxCombo);
        if (game.state === 'clear' && !cleared.includes(stage)) cleared.push(stage);
        save('HighScore', highScore); save('MaxCombo', maxCombo); save('ClearedStages', cleared);
        $('result-title').textContent = game.state === 'clear' ? 'STAGE CLEAR!' : 'GAME OVER';
        $('result-stats').innerHTML = `SCORE<br><strong>${game.score.toLocaleString()}</strong><br>MAX COMBO ×${game.maxCombo}<br>敵撃破数 ${game.kills}　/　被弾回数 ${game.hits}`;
        $('next-stage').hidden = game.state !== 'clear' || stage === 5;
        $('result').hidden = false; $('pause').disabled = true; $('result-title').focus();
    }
    function setText(id, value) { const el = $(id), text = String(value); if (el.textContent !== text) el.textContent = text; }
    function updateHUD() {
        const p = game.player;
        setText('hud-stage', stage); setText('hud-score', game.score.toLocaleString());
        setText('hud-hp', '♥'.repeat(p.hp) + '♡'.repeat(p.maxHP - p.hp)); setText('hud-combo', `×${game.combo}`);
        $('hud-combo').classList.toggle('is-milestone', game.combo > 0 && game.combo % 5 === 0);
        setText('power', `LV ${p.level === 5 ? 'MAX' : p.level}${p.shield ? ' / S ' + p.shield : ''}`);
        setText('bomb', `BOMB · ボム ×${p.bombs}`); $('bomb').disabled = !p.bombs || paused || game.state !== 'running';
        $('boss-bar').hidden = !game.boss;
        if (game.boss) { setText('boss-name', game.boss.mid ? 'MID BOSS' : game.config.boss); $('boss-hp').value = game.boss.hp / game.boss.maxHP * 100; }
    }
    function tick(now) {
        if (!game || paused) return;
        const dt = Math.min((now - lastTime) / 1000, .04); lastTime = now;
        game.update(dt, { x: Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA')), y: Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW')), fire: touchDevice || pointerFire || keys.has('Space'), target });
        const events = new Set(game.events.splice(0)); for (const event of events) tone(event);
        draw(); updateHUD();
        if (game.state !== 'running') finish();
        else frame = requestAnimationFrame(tick);
    }
    function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
    function circle(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
    function label(text, x, y, size, color) { ctx.font = `bold ${size}px sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, x, y); }
    function background() {
        const t = reducedMotion ? 0 : game.time;
        rect(0, 0, 480, 640, game.config.sky);
        if (stage === 1) {
            const sun = ctx.createRadialGradient(390, 82, 6, 390, 82, 90);
            sun.addColorStop(0, '#fff8d9'); sun.addColorStop(1, '#fff2cc00'); ctx.fillStyle = sun; ctx.fillRect(290, 0, 190, 180);
            circle(390, 82, 31, '#fff4cc');
            // 校舎は遠景から近景へ重ね、画面に奥行きをつける。
            rect(0, 180, 480, 102, '#c8d9c3');
            for (let i = 0; i < 4; i++) {
                const x = 14 + i * 123, y = 102 + i % 2 * 17;
                rect(x + 5, y + 8, 105, 180, '#779888'); rect(x, y, 105, 180, '#e5ddc8');
                rect(x + 7, y + 7, 91, 10, '#c5a987');
                for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
                    rect(x + 12 + col * 29, y + 29 + row * 33, 20, 21, '#b2cbbb');
                    rect(x + 12 + col * 29, y + 29 + row * 33, 20, 2, '#f8f0dd');
                }
            }
            rect(0, 284, 480, 356, '#d7cbb0');
            rect(0, 284, 480, 16, '#b1c79f');
            for (let i = 0; i < 7; i++) {
                const y = (i * 112 + t * 24) % 770 - 65;
                circle(24, y, 35, '#93b58e'); circle(456, y + 22, 36, '#93b58e');
                circle(31, y - 8, 20, '#b4c994'); circle(449, y + 14, 21, '#b4c994');
            }
            // 石畳の細い継ぎ目が、進行方向へゆっくり流れる。
            ctx.strokeStyle = '#b8aa9160'; ctx.lineWidth = 1;
            for (let i = 0; i < 10; i++) { const y = ((i * 78 + t * 28) % 720) - 40; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(480, y); ctx.stroke(); }
        } else if (stage === 2) {
            rect(0, 0, 480, 226, '#d8c39d');
            rect(35, 35, 410, 164, '#a57c59'); rect(43, 43, 394, 148, '#355f53');
            // 黒板のチョーク跡と窓から入る光。
            ctx.globalAlpha = .25; ctx.strokeStyle = '#e7eed1'; ctx.lineWidth = 2;
            for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(68 + i * 68, 71 + i % 2 * 8); ctx.lineTo(126 + i * 54, 66 + i % 2 * 10); ctx.stroke(); }
            ctx.globalAlpha = 1;
            label('放課後の SHOOTING', 240, 112, 23, '#e4ecce'); label('今日はチバニーと宇宙へ！', 240, 153, 16, '#c7dab9');
            rect(0, 226, 480, 414, '#d7c19f');
            for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
                const x = 28 + col * 157, y = 244 + row * 102 + (t * 8 % 12);
                rect(x + 8, y + 21, 7, 48, '#a78565'); rect(x + 81, y + 21, 7, 48, '#a78565');
                rect(x + 5, y + 13, 89, 48, '#c4a17e'); rect(x, y, 100, 42, '#e0bd94');
                rect(x + 19, y + 7, 28, 20, '#f2dfb9'); rect(x + 54, y + 7, 25, 20, '#b8c9b1');
                rect(x + 28, y + 67, 46, 15, '#ceb08b');
            }
        } else {
            if (stage === 3 || stage === 5) {
                ctx.strokeStyle = stage === 3 ? '#41406c' : '#50314d'; ctx.lineWidth = 1;
                for (let x = 0; x <= 480; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 640); ctx.stroke(); }
                for (let i = 0; i < 18; i++) { const y = (i * 40 + t * 20) % 680; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(480, y); ctx.stroke(); }
                if (stage === 3) {
                    const glow = ctx.createRadialGradient(240, 270, 10, 240, 270, 290);
                    glow.addColorStop(0, '#5563b52a'); glow.addColorStop(1, '#25234c00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 480, 640);
                    for (let i = 0; i < 8; i++) label(i % 2 ? '0101' : '{ data }', 40 + i * 60, (i * 119 + t * 13) % 680, 13, '#737bb5');
                    ctx.strokeStyle = '#a08cf040'; ctx.lineWidth = 2;
                    for (let i = 0; i < 5; i++) { const x = (i * 113 + 30) % 480, y = (i * 137 + t * 9) % 620; ctx.beginPath(); ctx.arc(x, y, 12 + i * 3, 0, Math.PI * 1.5); ctx.stroke(); }
                }
            }
            if (stage >= 4) {
                circle(389, 143, 60, stage === 4 ? '#49466f' : '#68405e');
                ctx.strokeStyle = '#8880a0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(389, 143, 90, 17, -.35, 0, Math.PI * 2); ctx.stroke();
                for (let i = 0; i < 48; i++) {
                    const x = (i * 137 + 23) % 480, y = (i * 83 + t * (18 + i % 3 * 12)) % 640;
                    rect(x, y, i % 3 ? 2 : 3, i % 7 ? 2 : 15, i % 5 ? '#acb4ce' : '#ffe5b0');
                    if (i % 9 === 0) { ctx.strokeStyle = '#8994bb55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 35, y + 14, 17, 0, Math.PI * 1.6); ctx.stroke(); }
                }
            }
        }
        // 背景を少し淡くし、敵弾とプレイヤーを読み取りやすくする。
        rect(0, 0, 480, 640, stage < 3 ? '#ffffff18' : '#0e102520');
    }
    function enemySprite(enemy) {
        const boss = enemy.type === 'boss', r = enemy.r;
        if (enemy.aimPoint && enemy.y > 20 && enemy.y < 410) {
            ctx.save(); ctx.strokeStyle = '#ec557b70'; ctx.lineWidth = 2;
            if (!boss && (enemy.type === 'aim' || enemy.type === 'heavy')) {
                ctx.setLineDash([5, 9]); ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.aimPoint.x, enemy.aimPoint.y); ctx.stroke();
            }
            ctx.setLineDash([]); ctx.beginPath(); ctx.arc(enemy.x, enemy.y, r + 10 + Math.sin(game.time * 14) * 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        ctx.save(); ctx.translate(enemy.x, enemy.y);
        if (enemy.type === 'formation' || enemy.type === 'diagonal') ctx.rotate(Math.sin(enemy.age * 2.4) * .12 + (enemy.type === 'diagonal' ? .35 : 0));
        if (boss) {
            // ボスの可動アームとコア。通常敵とは異なるシルエットにする。
            const spread = r * (1.25 + Math.sin(enemy.age * 2) * .1);
            for (const side of [-1, 1]) {
                ctx.save(); ctx.translate(side * spread, 5); ctx.rotate(side * (.2 + Math.sin(enemy.age * 1.5) * .15));
                ctx.fillStyle = game.config.color; ctx.strokeStyle = '#463548'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.roundRect(-12, -24, 24, 52, 9); ctx.fill(); ctx.stroke();
                circle(0, 10, 5, ['#a5efdb', '#ffc482', '#fa7ba5'][enemy.phase]); ctx.restore();
            }
            ctx.strokeStyle = '#ffe3a980'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 18, enemy.age, enemy.age + Math.PI * 1.4); ctx.stroke();
        }
        if (enemy.type === 'diver') {
            ctx.fillStyle = '#ecb27a'; ctx.beginPath(); ctx.moveTo(-r, -8); ctx.lineTo(-r * 1.8, -22); ctx.lineTo(-r * .8, r); ctx.fill();
            ctx.beginPath(); ctx.moveTo(r, -8); ctx.lineTo(r * 1.8, -22); ctx.lineTo(r * .8, r); ctx.fill();
        }
        const body = ctx.createLinearGradient(0, -r, 0, r);
        body.addColorStop(0, enemy.hitFlash > 0 ? '#ffffff' : boss ? '#fff1d8' : '#f4f0e5');
        body.addColorStop(1, enemy.hitFlash > 0 ? '#fff3db' : game.config.color);
        ctx.fillStyle = body; ctx.strokeStyle = '#463548'; ctx.lineWidth = 3;
        ctx.beginPath();
        if (enemy.type === 'formation') {
            ctx.moveTo(0, -r * 1.35); ctx.lineTo(r * 1.2, r * .9); ctx.lineTo(0, r * .45); ctx.lineTo(-r * 1.2, r * .9); ctx.closePath();
        } else if (enemy.type === 'diagonal') {
            ctx.moveTo(-r, -r * .55); ctx.lineTo(r * .55, -r); ctx.lineTo(r, r * .55); ctx.lineTo(-r * .55, r); ctx.closePath();
        } else if (enemy.type === 'heavy') {
            for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, radius = i % 2 ? r * .75 : r * 1.15; ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); } ctx.closePath();
        } else if (stage === 2) ctx.roundRect(-r, -r, r * 2, r * 2, 4);
        else if (stage === 3) {
            for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, radius = i % 2 ? r * .72 : r * 1.25; ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); } ctx.closePath();
        } else ctx.ellipse(0, 0, r * 1.15, r * .8, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        if (stage >= 4) { ctx.beginPath(); ctx.ellipse(0, 7, r * 1.4, r * .3, -.1, 0, Math.PI * 2); ctx.stroke(); }
        if (stage === 1) { rect(-r * .75, -r, r * 1.5, 8, '#7c638a'); }
        circle(-r * .5, r * .25, r * .17, '#ed9a9b80'); circle(r * .5, r * .25, r * .17, '#ed9a9b80');
        if (enemy.type === 'aim' || boss) {
            // 狙い弾を撃つ敵には視線を強調し、攻撃予告を見つけやすくする。
            circle(-r * .35, -2, boss ? 6 : 4, '#fff3bd'); circle(r * .35, -2, boss ? 6 : 4, '#fff3bd');
            circle(-r * .35, -2, boss ? 2.5 : 2, '#382d41'); circle(r * .35, -2, boss ? 2.5 : 2, '#382d41');
            ctx.beginPath(); ctx.arc(0, 6, r * .26, .15, Math.PI - .15); ctx.stroke();
        } else {
            circle(-r * .35, -2, 3, '#382d41'); circle(r * .35, -2, 3, '#382d41');
            ctx.beginPath(); ctx.arc(0, 5, r * .3, 0, Math.PI); ctx.stroke();
        }
        if (boss) {
            // ボスの額の宝石と輪郭リングで、通常敵とシルエットを分ける。
            ctx.fillStyle = game.config.color; ctx.strokeStyle = '#463548'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, -r * .9); ctx.lineTo(8, -r * .58); ctx.lineTo(0, -r * .28); ctx.lineTo(-8, -r * .58); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#fff0c880'; ctx.lineWidth = 2 + Math.sin(enemy.age * 5) * .6;
            ctx.beginPath(); ctx.ellipse(0, 0, r * 1.55, r * 1.15, Math.sin(enemy.age) * .12, 0, Math.PI * 2); ctx.stroke();
        }
        if (enemy.type === 'heavy') { ctx.strokeStyle = '#fff1b5'; ctx.lineWidth = 3; ctx.strokeRect(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8); }
        if (enemy.type === 'formation') {
            ctx.strokeStyle = '#fff3ce'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-r * .55, 2); ctx.lineTo(0, r * .45); ctx.lineTo(r * .55, 2); ctx.stroke();
        }
        if (!boss && enemy.hp < enemy.maxHP) { rect(-r, -r - 10, r * 2, 3, '#55465e'); rect(-r, -r - 10, r * 2 * enemy.hp / enemy.maxHP, 3, '#ffebaa'); }
        ctx.restore();
    }
    function resizeCanvas() {
        const box = canvas.getBoundingClientRect();
        if (!box.width || !box.height) return;
        displayScale = box.width / 480;
        // DPRを2までに抑えて高精細さとスマホの描画負荷を両立。
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(box.width * dpr), height = Math.round(box.height * dpr);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        if (game) draw();
    }
    const resizeObserver = new ResizeObserver(resizeCanvas); resizeObserver.observe($('arena'));
    window.addEventListener('resize', resizeCanvas);
    function draw() {
        ctx.setTransform(canvas.width / 480, 0, 0, canvas.height / 640, 0, 0);
        ctx.save();
        if (!reducedMotion && game.shake > 0) ctx.translate(Math.sin(game.time * 150) * 2, Math.cos(game.time * 170) * 2);
        background();
        const vignette = ctx.createRadialGradient(240, 280, 130, 240, 280, 430);
        vignette.addColorStop(0, '#182a4000'); vignette.addColorStop(1, '#17203940'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, 480, 640);
        // 細いステージ進行ラインはプレイ領域を狭めない。
        rect(0, 0, 480, 3, '#ffffff30'); rect(0, 0, 480 * Math.min(1, game.time / game.config.duration), 3, '#edc882');
        for (const shot of game.shots) {
            const shotColor = shot.pierce ? '#7ee9e5' : game.player.level >= 5 ? '#ffc0f1' : '#ffd179';
            ctx.strokeStyle = shotColor + '70'; ctx.lineWidth = shot.r * 3;
            ctx.beginPath(); ctx.moveTo(shot.x, shot.y + 20); ctx.lineTo(shot.x, shot.y - 10); ctx.stroke();
            circle(shot.x, shot.y - 8, shot.r + 3, shotColor + '55');
            circle(shot.x, shot.y - 8, shot.r + 1, shot.pierce ? '#a9fff2' : game.player.level >= 5 ? '#ffe1f8' : '#fff2b0');
            rect(shot.x - 1.5, shot.y - 11, 3, 14, '#fffdf0');
        }
        for (const e of game.enemies) enemySprite(e);
        if (game.boss) enemySprite(game.boss);
        for (const item of game.items) { ctx.strokeStyle = '#e2b46e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(item.x, item.y, Math.max(24, 17 / displayScale), game.time * 2, game.time * 2 + Math.PI * 1.5); ctx.stroke(); circle(item.x, item.y, Math.max(20, 14 / displayScale), '#fff8ea'); label({ heal: '♥', rapid: '↑', power: '★', spread: '3', shield: 'S', bomb: 'B' }[item.type], item.x, item.y + 8, Math.max(24, 17 / displayScale), '#70465f'); }
        for (const bullet of game.bullets) { circle(bullet.x, bullet.y, bullet.r + 2, '#fff5da'); circle(bullet.x, bullet.y, bullet.r, '#be325d'); circle(bullet.x - 1, bullet.y - 1, 1.5, '#ffd5e2'); }
        const p = game.player;
        ctx.save(); ctx.translate(p.x, p.y + 30); ctx.scale(1, .25); circle(0, 0, 27, '#36435b25'); ctx.restore();
        if (p.invincible <= 0 || reducedMotion || Math.floor(game.time * 12) % 2 === 0) {
            if (p.level > 1) {
                const glow = ctx.createRadialGradient(p.x, p.y, 3, p.x, p.y, 48);
                glow.addColorStop(0, p.level >= 5 ? '#f1b8e844' : '#f5d49430'); glow.addColorStop(1, '#f5d49400');
                ctx.fillStyle = glow; ctx.fillRect(p.x - 48, p.y - 48, 96, 96);
            }
            if (p.shield) {
                const pulse = 33 + Math.sin(game.time * 5) * 2;
                circle(p.x, p.y, pulse, '#91e2f628'); ctx.strokeStyle = '#78d7ec'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(p.x, p.y, pulse, game.time, game.time + Math.PI * 1.7); ctx.stroke();
            }
            // ジェットの光が移動中だけ揺れ、プレイヤーの位置を追いやすくする。
            const moving = Math.hypot(p.x - (p.previousX ?? p.x), p.y - (p.previousY ?? p.y));
            if (moving > .2) {
                const flicker = 9 + Math.sin(game.time * 34) * 3;
                ctx.globalAlpha = .45 + Math.min(.4, moving / 8);
                circle(p.x - 8, p.y + 18, flicker * .55, '#f5a46e'); circle(p.x + 8, p.y + 18, flicker * .55, '#f5a46e');
                circle(p.x, p.y + 21, flicker * .45, '#fff0b0'); ctx.globalAlpha = 1;
            }
            // 元画像の縦横比を保持。入口と同じ画像を読み込む。
            if (character.complete && character.naturalWidth) {
                const h = Math.min(128, 70 / displayScale), w = h * character.naturalWidth / character.naturalHeight;
                ctx.drawImage(character, p.x - w / 2, p.y - h * .64, w, h);
            } else circle(p.x, p.y, 15, '#f7e6dd');
            circle(p.x, p.y, 3, '#bb739a');
        }
        for (const part of game.particles) { ctx.globalAlpha = part.life / .5; circle(part.x, part.y, 3, part.color); }
        ctx.globalAlpha = 1;
        for (const ring of game.rings) {
            ctx.globalAlpha = ring.life / .45; ctx.strokeStyle = ring.color; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius * (1 - ring.life / .6), 0, Math.PI * 2); ctx.stroke();
        }
        for (const popup of game.popups) { ctx.globalAlpha = Math.min(1, popup.life * 3); label(popup.text, popup.x, popup.y, 20, stage < 3 ? '#674555' : '#ffe4a5'); }
        ctx.globalAlpha = 1;
        if (game.flash > 0 && !reducedMotion) { ctx.globalAlpha = game.flash * .65; rect(0, 0, 480, 640, '#fff2d8'); ctx.globalAlpha = 1; }
        if (game.noticeTime > 0) {
            const warning = game.notice.includes('BOSS') || game.notice.includes('PHASE');
            ctx.globalAlpha = Math.min(1, game.noticeTime * 3);
            ctx.fillStyle = warning ? '#422a48ed' : '#fff9e9eb';
            ctx.beginPath(); ctx.roundRect(46, 269, 388, 66, 18); ctx.fill();
            rect(74, 276, 32, 3, '#e8ad73'); rect(374, 328, 32, 3, '#e8ad73');
            label(game.notice, 240, 310, 25, warning ? '#ffe4bd' : '#70465f'); ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
    $('start').onclick = start; $('retry').onclick = start;
    $('next-stage').onclick = () => { if (game?.state === 'clear' && stage < 5) { stage++; start(); } };
    $('pause').onclick = () => pause(!paused); $('resume').onclick = () => pause(false);
    $('bomb').onclick = () => { if (game && !paused) { game.bomb(); updateHUD(); canvas.focus({ preventScroll: true }); } };
    document.querySelectorAll('.to-menu').forEach(button => { button.onclick = showMenu; });
    const controls = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyB', 'KeyP', 'Escape'];
    window.addEventListener('keydown', event => {
        if (!game || game.state !== 'running' || !controls.includes(event.code)) return;
        if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(!paused); return; }
        if (paused || event.target.closest('button, a')) return;
        event.preventDefault(); keys.add(event.code);
        if (event.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) target = null;
        if (event.code === 'KeyB' && !event.repeat) game.bomb();
    });
    window.addEventListener('keyup', event => keys.delete(event.code));
    function movePointer(event) {
        const box = canvas.getBoundingClientRect();
        target = { x: (event.clientX - box.left) / box.width * 480, y: (event.clientY - box.top - (event.pointerType === 'touch' ? Math.min(64, Math.max(48, window.innerWidth * .14)) : 0)) / box.height * 640 };
    }
    canvas.addEventListener('pointerdown', event => {
        if (!game || paused || game.state !== 'running' || pointerId !== null) return;
        event.preventDefault(); canvas.focus(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId); pointerFire = true; movePointer(event);
    });
    canvas.addEventListener('pointermove', event => { if (pointerId === event.pointerId) { event.preventDefault(); movePointer(event); } });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => {
        if (pointerId === event.pointerId) { pointerId = null; target = null; pointerFire = false; }
    });
    window.addEventListener('blur', () => pause(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
    window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); quietAudio(); resetInput(); resizeObserver.disconnect(); });
    window.addEventListener('pageshow', event => { if (event.persisted) { resizeObserver.observe($('arena')); if (game && game.state === 'running') pause(true); } });
    character.onerror = () => { $('save-status').textContent = 'チバニー画像を読み込めませんでした。オンラインで再読み込みしてください。'; };
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('../service-worker.js').catch(() => {
        $('save-status').textContent = 'オフライン機能を開始できませんでした。オンラインでは遊べます。';
    });
    updateMenu();
})();
