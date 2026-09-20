const notificationKey = "cit-attendance-notified";
const manualClassNumberKey = "cit-attendance-manual-class-number";
const notificationLeadMinutes = AttendanceSchedule.OPEN_MINUTES;
const warningMinutesBeforeStart = 5;
const dayNames = AttendanceSchedule.DAY_NAMES;
let selectedElective = readElective();
let lastScheduleSignature = "";
let electiveStatusTimer;
let selectedWeekday = AttendanceSchedule.dayOfWeek(AttendanceSchedule.dateKey());
let renderedDate = AttendanceSchedule.dateKey();
let activeView = "home";
const viewScroll = { home: 0, timetable: 0, settings: 0 };

function showView(initial = false) {
    const requested = location.hash.slice(1);
    const view = ["home", "timetable", "settings"].includes(requested) ? requested : "home";
    if (!initial) viewScroll[activeView] = window.scrollY;
    activeView = view;
    document.querySelectorAll(".app-view").forEach(section => { section.hidden = section.id !== `view-${view}`; });
    document.querySelectorAll("[data-view]").forEach(link => {
        if (link.dataset.view === view) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    if (!initial) {
        document.getElementById(`${view === "home" ? "home" : view}-heading`).focus({ preventScroll: true });
        window.scrollTo({ top: viewScroll[view], behavior: "instant" });
    }
}
window.addEventListener("hashchange", () => showView());

function selectWeekday(day, focus = false) {
    selectedWeekday = day;
    document.querySelectorAll("#weekdayTabs [role=tab]").forEach(tab => {
        const selected = Number(tab.dataset.day) === day;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus();
    });
    document.querySelectorAll(".week-day").forEach(panel => { panel.hidden = Number(panel.dataset.day) !== day; });
}

function selectElective(value, fromHome = false) {
    selectedElective = value;
    const saved = writeStorage(AttendanceSchedule.ELECTIVE_KEY, value);
    const message = saved ? "選択内容を保存しました" : "選択を反映しましたが保存できません。ブラウザのストレージ設定をご確認ください。";
    updateElectiveUi(message, saved);
    document.getElementById("homeElectiveStatus").textContent = saved
        ? `${AttendanceSchedule.electives[value].shortName}を選択しました。設定から変更できます。` : message;
    update();
    if (fromHome) {
        document.getElementById("home-heading").focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "instant" });
    }
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function readElective() {
    const value = readStorage(AttendanceSchedule.ELECTIVE_KEY);
    return value === "A" || value === "B" ? value : null;
}

function todayClasses(now = new Date()) {
    return AttendanceSchedule.getClasses(AttendanceSchedule.dayOfWeek(AttendanceSchedule.dateKey(now)), selectedElective);
}

const notifyButton = document.getElementById("notifyButton");
const testNotifyButton = document.getElementById("testNotifyButton");
const notifyStatus = document.getElementById("notifyStatus");
const manualClassForm = document.getElementById("manualClassForm");
const classNumberInput = document.getElementById("classNumberInput");
const manualStatus = document.getElementById("manualStatus");
const scheduleDate = document.getElementById("scheduleDate");

function updateClock() {
    const now = new Date();

    document.getElementById("clock").textContent = now.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Tokyo"
    });

    document.getElementById("today").textContent =
        now.toLocaleDateString("ja-JP", { month: "long", day: "numeric", timeZone: "Asia/Tokyo" }) +
        " " +
        dayNames[AttendanceSchedule.dayOfWeek(AttendanceSchedule.dateKey(now))];

    scheduleDate.textContent =
        now.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" });
}

function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(":").map(Number);
    return hours * 60 + minutes;
}

function normalizeClassNumber(value) {
    return value
        .trim()
        .replace(/[０-９]/g, character =>
            String.fromCharCode(character.charCodeAt(0) - 0xFEE0)
        )
        .replace(/\s+/g, "");
}

function getAttendanceUrlByNumber(classNumber) {
    return AttendanceSchedule.getAttendanceUrl({ roomCode: classNumber });
}

function openExternal(url) {
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (newWindow) {
        newWindow.opener = null;
    }
}

function openAttendanceByNumber(classNumber) {
    openExternal(getAttendanceUrlByNumber(classNumber));
}

function saveManualClassNumber(classNumber) {
    writeStorage(manualClassNumberKey, classNumber);
}

function loadManualClassNumber() {
    const saved = readStorage(manualClassNumberKey);

    if (saved) {
        classNumberInput.value = saved;
        manualStatus.textContent = "前回の番号 " + saved + " を入力済みです。";
    }
}

function handleManualClassSubmit(event) {
    event.preventDefault();
    const classNumber = normalizeClassNumber(classNumberInput.value);

    if (!classNumber) {
        manualStatus.textContent = "教室番号を入力してください。";
        manualStatus.classList.add("is-error");
        classNumberInput.focus();
        return;
    }

    if (!/^[0-9]{3,10}$/.test(classNumber)) {
        manualStatus.textContent = "教室番号を3〜10桁の半角数字で入力してください。";
        manualStatus.classList.add("is-error");
        classNumberInput.focus();
        return;
    }

    const classItem = findManualClass(classNumber);
    if (!classItem) {
        manualStatus.textContent = "今日の選択済み授業の受付時間内に利用できます。";
        manualStatus.classList.add("is-error");
        updateManualButton();
        return;
    }
    manualStatus.classList.remove("is-error");
    classNumberInput.value = classNumber;
    saveManualClassNumber(classNumber);
    manualStatus.textContent = "教室番号 " + classNumber + " のページを開きます。";
    openAttendanceByNumber(classNumber);
}

function getTodayKey(date = new Date()) {
    return AttendanceSchedule.dateKey(date);
}

function findManualClass(roomCode, now = new Date()) {
    return todayClasses(now).find(classItem => classItem.roomCode === roomCode &&
        !AttendanceSchedule.getClassState(classItem, getTodayKey(now), now).disabled);
}

function updateManualButton() {
    const number = normalizeClassNumber(classNumberInput.value);
    const now = new Date();
    const classes = todayClasses(now);
    const matching = classes.filter(item => !item.pending && item.roomCode === number);
    const available = matching.find(item => !AttendanceSchedule.getClassState(item, getTodayKey(now), now).disabled);
    const invalid = !!number && !/^[0-9]{3,10}$/.test(number);
    let message;
    if (!number) message = "今日の授業の教室番号を入力してください。";
    else if (invalid) message = "教室番号は3〜10桁の数字で入力してください。全角数字も使えます。";
    else if (!classes.length) message = "今日は通常授業がないため、番号からの出席は利用できません。";
    else if (available) message = `${available.shortName || available.subject}の出席ページを開けます。`;
    else if (!matching.length) message = classes.some(item => item.pending) && Object.values(AttendanceSchedule.electives).some(item => item.roomCode === number)
        ? "金曜の選択授業が未設定です。ホームまたは設定で授業を選んでください。"
        : "今日の選択済み授業にない教室番号です。時間割をご確認ください。";
    else {
        const upcoming = matching.find(item => AttendanceSchedule.classTimes(item, getTodayKey(now)).open > now.getTime());
        message = upcoming ? `受付開始前です。${formatTime(AttendanceSchedule.classTimes(upcoming, getTodayKey(now)).open)}から出席できます。`
            : "この教室の今日の出席受付は終了しました。";
    }
    document.getElementById("manualAttendanceButton").disabled = !available || invalid;
    classNumberInput.setAttribute("aria-invalid", String(invalid));
    manualStatus.classList.toggle("is-error", invalid || (!!number && !matching.length && classes.length > 0));
    if (manualStatus.textContent !== message) manualStatus.textContent = message;
}

function openClassAttendance(classItem, date) {
    const now = new Date();
    // 再描画前や通知からの操作でも、現在の選択と受付時間を再確認する。
    const enrolled = AttendanceSchedule.getClasses(classItem.day, selectedElective)
        .some(item => item.subject === classItem.subject && item.roomCode === classItem.roomCode);
    if (enrolled && date === getTodayKey(now) &&
        !AttendanceSchedule.getClassState(classItem, date, now).disabled) {
        openAttendanceByNumber(classItem.roomCode);
    } else {
        update();
    }
}

function getNotificationStore() {
    try {
        return JSON.parse(readStorage(notificationKey)) || {};
    } catch {
        return {};
    }
}

function setNotificationSent(key) {
    const store = getNotificationStore();
    store[key] = true;
    writeStorage(notificationKey, JSON.stringify(store));
}

function wasNotificationSent(key) {
    return getNotificationStore()[key] === true;
}

function canUseNotifications() {
    return "Notification" in window;
}

function areNotificationsOn() {
    return canUseNotifications() && Notification.permission === "granted";
}

function showNotification(title, body, classItem, tag) {
    if (!areNotificationsOn()) {
        return;
    }

    const date = getTodayKey();
    let notification;
    try {
        notification = new Notification(title, {
            body,
            tag,
            renotify: true,
            requireInteraction: true
        });
    } catch {
        // モバイルではService Worker経由の通知を使用する。
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then(registration =>
                registration.showNotification(title, { body, tag, icon: "./icon-192.png" })
            ).catch(() => { notifyStatus.textContent = "この環境では通知を表示できません。"; });
        }
        return;
    }

    notification.onclick = () => {
        window.focus();
        if (classItem.day !== undefined) openClassAttendance(classItem, date);
        notification.close();
    };
}

function updateNotificationUi() {
    notifyButton.classList.remove("is-on");

    if (!canUseNotifications()) {
        notifyStatus.textContent = "このブラウザは通知に対応していません。";
        notifyButton.textContent = "利用できません";
        notifyButton.disabled = true;
        testNotifyButton.disabled = true;
        return;
    }

    notifyButton.disabled = false;

    if (Notification.permission === "granted") {
        notifyStatus.textContent = "このページを開いている間、受付開始（10分前）と授業の5分前にお知らせします。";
        notifyButton.textContent = "通知オン";
        notifyButton.classList.add("is-on");
        testNotifyButton.disabled = false;
        return;
    }

    if (Notification.permission === "denied") {
        notifyStatus.textContent = "ブラウザの設定で通知がブロックされています。";
        notifyButton.textContent = "ブロック中";
        notifyButton.disabled = true;
        testNotifyButton.disabled = true;
        return;
    }

    notifyStatus.textContent = "授業を忘れないよう、開始前にお知らせします。";
    notifyButton.textContent = "通知をオン";
    testNotifyButton.disabled = true;
}

async function requestNotifications() {
    if (!canUseNotifications()) {
        updateNotificationUi();
        return;
    }

    if (Notification.permission === "default") {
        await Notification.requestPermission();
    }

    updateNotificationUi();
    checkAttendanceNotifications(true);
}

function buildNotificationItems(classItem, currentMinutes, todayKey) {
    const start = timeToMinutes(classItem.start);
    const openTime = start - notificationLeadMinutes;
    const warningTime = start - warningMinutesBeforeStart;
    const classKey = `${todayKey}-${classItem.roomCode}-${classItem.start}`;
    const items = [];

    if (currentMinutes >= openTime && currentMinutes < start) {
        items.push({
            key: `${classKey}-open`,
            title: "出席受付が始まりました",
            body: `${classItem.subject} / ${classItem.room} / ${classItem.start}開始`
        });
    }

    if (currentMinutes >= warningTime && currentMinutes < start) {
        items.push({
            key: `${classKey}-before-start`,
            title: "授業開始5分前です",
            body: `${classItem.subject}の出席を忘れずに`
        });
    }

    return items;
}

function checkAttendanceNotifications(force = false) {
    if (!areNotificationsOn()) {
        return;
    }

    const now = new Date();
    const japanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentMinutes = japanTime.getUTCHours() * 60 + japanTime.getUTCMinutes();
    const todayKey = getTodayKey(now);

    todayClasses(now).filter(item => !item.pending).forEach(classItem => {
        buildNotificationItems(classItem, currentMinutes, todayKey).forEach(item => {
            if (!force && wasNotificationSent(item.key)) {
                return;
            }

            showNotification(item.title, item.body, classItem, item.key);
            setNotificationSent(item.key);
        });
    });
}

function createClassCard(classItem, date, now, context, featured = false) {
    const state = AttendanceSchedule.getClassState(classItem, date, now);
    const key = `${context}-${date}-${classItem.firstPeriod}-${classItem.roomCode || "pending"}`;
    const card = document.createElement("article");
    card.id = key;
    card.className = `class-card ${state.type} ${featured ? "featured" : "compact"}${classItem.pending ? " pending" : ""}`;
    card.dataset.roomCode = classItem.roomCode || "";
    const dateLabel = `${date.slice(5).replace("-", "/")} ${dayNames[classItem.day]}`;
    const times = AttendanceSchedule.classTimes(classItem, date);
    const status = classItem.pending ? "金曜日7〜8限の授業を選択してください。"
        : !state.disabled ? `${now.getTime() >= times.end ? "授業終了後・" : ""}出席受付は ${formatTime(times.close)} まで`
        : state.type === "ended" ? "この授業の出席受付は終了しました。"
        : `${date === getTodayKey(now) ? "" : dateLabel + " · "}${formatTime(times.open)} 受付開始`;
    card.innerHTML = `
        <div class="class-topline"><div class="class-time">${classItem.start}<small>〜 ${classItem.end}</small></div><span class="state-label">${state.label}</span></div>
        <div class="class-body">
            <div class="class-main">
                <h3 class="class-subject">${classItem.shortName || classItem.subject}</h3>
                <p class="room-label">${classItem.pending ? "金曜の選択授業" : `<strong>${classItem.room}</strong>`} <span class="class-date">· ${classItem.firstPeriod}〜${classItem.lastPeriod}限</span></p>
            </div>
            ${featured ? `<p class="class-status">${status}</p>` : ""}
            <div class="class-action"><button id="${key}-action" class="class-button" type="button">${state.buttonText}${!state.disabled ? ' <span aria-hidden="true">↗</span>' : ""}</button></div>
        </div>
        <details id="${key}-details" class="course-details">
            <summary id="${key}-summary">授業の詳細</summary>
            <dl class="class-details"><dt>授業名</dt><dd>${classItem.subject}</dd><dt>日時</dt><dd>${dateLabel} · ${classItem.firstPeriod}〜${classItem.lastPeriod}限</dd>
                ${classItem.pending ? "" : `<dt>教員</dt><dd>${classItem.teacher}</dd><dt>教室・キャンパス</dt><dd>${classItem.room} · ${classItem.campus}</dd>`}</dl>
            ${featured ? "" : `<p class="class-details">${status}</p>`}
        </details>`;
    const button = card.querySelector("button");
    button.disabled = !classItem.pending && state.disabled;
    button.setAttribute("aria-label", `${classItem.shortName || classItem.subject}：${state.buttonText}`);
    button.addEventListener("click", () => {
        if (classItem.pending) {
            if (activeView === "home") {
                const setup = document.getElementById("homeElectiveSetup");
                setup.open = true;
                setup.querySelector("button").focus();
            } else {
                location.hash = "settings";
            }
        } else openClassAttendance(classItem, date);
    });
    return card;
}

function appendDay(container, classes, date, now, context) {
    if (!classes.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = date === getTodayKey(now) ? "本日は全休です。" : "全休（通常授業なし）";
        container.appendChild(empty);
    }
    classes.forEach(item => container.appendChild(createClassCard(item, date, now, context)));
}

function renderSchedule() {
    const now = new Date();
    const today = getTodayKey(now);
    const classes = todayClasses(now);
    const focus = AttendanceSchedule.getCurrentAndNext(now, selectedElective);
    // 授業終了後も20分間は受付中のカードをホームに残す。
    const accepting = classes.find(item => !AttendanceSchedule.getClassState(item, today, now).disabled);
    const featured = focus.current || (accepting ? { classData: accepting, date: today } : focus.next);
    const monday = AttendanceSchedule.addDays(today, -((AttendanceSchedule.dayOfWeek(today) + 6) % 7));
    const signature = JSON.stringify([today, selectedElective, Math.floor(now.getTime() / 60000), featured,
        classes.map(item => AttendanceSchedule.getClassState(item, today, now).type)]);
    if (signature === lastScheduleSignature) return;
    lastScheduleSignature = signature;
    const focusedId = document.activeElement.id;
    const openDetails = [...document.querySelectorAll(".course-details[open]")].map(details => details.id);
    if (renderedDate !== today) {
        selectedWeekday = AttendanceSchedule.dayOfWeek(today);
        renderedDate = today;
    }

    document.getElementById("todayCount").textContent = classes.length ? `今日は ${classes.length} 授業` : "今日は授業なし";
    document.getElementById("focus-heading").textContent = focus.current ? "現在の授業" : accepting ? "出席受付中の授業" : "次の授業";
    const focusContainer = document.getElementById("focusClasses");
    focusContainer.replaceChildren();
    if (!classes.length) {
        const empty = document.createElement("p");
        empty.className = "focus-empty";
        empty.textContent = "本日は全休です。次の登校日の授業はこちら。";
        focusContainer.appendChild(empty);
    }
    if (featured) focusContainer.appendChild(createClassCard(featured.classData, featured.date, now, "focus", true));

    const remaining = classes.filter(item => !(featured && featured.date === today && featured.classData === item));
    const container = document.getElementById("schedule");
    container.replaceChildren();
    if (classes.length && !remaining.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "今日の授業は、上の1件です。";
        container.appendChild(empty);
    } else appendDay(container, remaining, today, now, "today");
    document.getElementById("schedule-heading").textContent = featured && featured.date === today ? "今日のほかの授業" : "今日の授業";

    const weekly = document.getElementById("weeklySchedule");
    const tabs = document.getElementById("weekdayTabs");
    weekly.replaceChildren();
    tabs.replaceChildren();
    document.getElementById("weekRange").textContent = `${monday.slice(5).replace("-", "/")} — ${AttendanceSchedule.addDays(monday, 6).slice(5).replace("-", "/")} · 毎週の通常時間割`;
    for (let offset = 0; offset < 7; offset += 1) {
        const date = AttendanceSchedule.addDays(monday, offset);
        const day = AttendanceSchedule.dayOfWeek(date);
        const tab = document.createElement("button");
        tab.type = "button";
        tab.id = `weekday-${day}`;
        tab.dataset.day = day;
        tab.dataset.today = String(date === today);
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `week-panel-${day}`);
        tab.setAttribute("aria-label", `${dayNames[day]}${date === today ? "・今日" : ""}`);
        tab.innerHTML = `${dayNames[day][0]}<small>${Number(date.slice(8))}</small>`;
        tab.addEventListener("click", () => selectWeekday(day));
        tab.addEventListener("keydown", event => {
            const order = [1, 2, 3, 4, 5, 6, 0];
            const index = order.indexOf(day);
            const next = event.key === "ArrowRight" ? order[(index + 1) % 7] : event.key === "ArrowLeft" ? order[(index + 6) % 7]
                : event.key === "Home" ? 1 : event.key === "End" ? 0 : null;
            if (next !== null) { event.preventDefault(); selectWeekday(next, true); }
        });
        tabs.appendChild(tab);
        const section = document.createElement("section");
        section.id = `week-panel-${day}`;
        section.className = "week-day";
        section.dataset.day = day;
        section.setAttribute("role", "tabpanel");
        section.setAttribute("aria-labelledby", tab.id);
        section.tabIndex = 0;
        const heading = document.createElement("h3");
        heading.textContent = `${dayNames[day]} · ${date.slice(5).replace("-", "/")}`;
        const cards = document.createElement("div");
        cards.className = "day-classes";
        appendDay(cards, AttendanceSchedule.getClasses(day, selectedElective), date, now, "week");
        section.append(heading, cards);
        weekly.appendChild(section);
    }
    selectWeekday(selectedWeekday);
    openDetails.forEach(id => { const details = document.getElementById(id); if (details) details.open = true; });
    const replacement = document.getElementById(focusedId);
    if (replacement && !replacement.disabled && replacement.getClientRects().length) replacement.focus({ preventScroll: true });
}

function updateElectiveUi(message, saved = false) {
    clearTimeout(electiveStatusTimer);
    document.getElementById("homeElectiveSetup").hidden = !!selectedElective;
    document.getElementById("settingsBadge").hidden = !!selectedElective;
    document.getElementById("electiveStatus").dataset.saved = String(saved);
    document.querySelectorAll('[name="fridayElective"]').forEach(input => {
        input.checked = input.value === selectedElective;
        input.closest("label").querySelector(".elective-choice-state").textContent = input.checked ? "✓ 選択中" : "未選択";
    });
    document.getElementById("electiveStatus").textContent = message || (selectedElective
        ? `${AttendanceSchedule.electives[selectedElective].shortName}を選択しています。`
        : "選択授業が未設定です。どちらか1つを選んでください。");
    if (saved) electiveStatusTimer = setTimeout(() => updateElectiveUi(), 4000);
}

function update() {
    updateClock();
    updateNotificationUi();
    renderSchedule();
    updateManualButton();
    checkAttendanceNotifications();
}

manualClassForm.addEventListener("submit", handleManualClassSubmit);
classNumberInput.addEventListener("input", () => {
    manualStatus.classList.remove("is-error");
    updateManualButton();
});
document.querySelectorAll('[name="fridayElective"]').forEach(input => {
    input.addEventListener("change", () => selectElective(input.value));
});
document.querySelectorAll("[data-elective]").forEach(button => {
    button.addEventListener("click", () => selectElective(button.dataset.elective, true));
});
window.addEventListener("storage", event => {
    if (event.key === AttendanceSchedule.ELECTIVE_KEY || event.key === null) {
        selectedElective = readElective();
        document.getElementById("homeElectiveStatus").textContent = "";
        updateElectiveUi();
        update();
    }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) update(); });
notifyButton.addEventListener("click", requestNotifications);
testNotifyButton.addEventListener("click", () => {
    const classItem = {
        subject: "テスト通知",
        roomCode: "1232"
    };

    showNotification(
        "出席通知テスト",
        "受付時間内に授業カードから出席できます。",
        classItem,
        "cit-attendance-test"
    );
});

document.getElementById("periodList").classList.add("period-grid");
document.getElementById("periodList").innerHTML = AttendanceSchedule.PERIODS
    .map(period => `<span>${period.period}限：${period.start}〜${period.end}</span>`).join("");
showView(true);
loadManualClassNumber();
updateElectiveUi();
update();
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
        document.getElementById("pwaStatus").textContent = "オフライン機能を開始できませんでした。オンラインではそのまま利用できます。";
    });
}
setInterval(update, 1000);
