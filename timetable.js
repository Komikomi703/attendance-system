// 2026年度後期。日付・曜日と受付時刻は、端末のタイムゾーンにかかわらず日本時間で扱う。
const AttendanceSchedule = (() => {
    const ATTENDANCE_BASE_URL = "https://attendance.is.chibatech.ac.jp/attendance/class_room/";
    const OPEN_MINUTES = 10;
    const CLOSE_MINUTES = 20;
    const ELECTIVE_KEY = "cit-attendance-2026-fall-friday-elective";
    const DAY_NAMES = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
    const PERIODS = Array.from({ length: 10 }, (_, index) => ({
        period: index + 1,
        start: `${String(index + 9).padStart(2, "0")}:00`,
        end: `${String(index + 10).padStart(2, "0")}:00`
    }));

    function course(day, firstPeriod, lastPeriod, subject, teacher, roomCode, shortName) {
        return {
            day, firstPeriod, lastPeriod, subject, teacher, roomCode, shortName,
            room: `${roomCode} 講義室`, campus: "新習志野キャンパス",
            start: PERIODS[firstPeriod - 1].start, end: PERIODS[lastPeriod - 1].end
        };
    }

    const timetable = {
        0: [],
        1: [],
        2: [course(2, 6, 9, "NWプログラミング応用演習", "屋代 智之", "1232")],
        3: [
            course(3, 2, 3, "OSとシステムソフトウェア", "伊集院 大将", "8103"),
            course(3, 5, 6, "統計解析", "星野 慶介", "7201"),
            course(3, 7, 8, "社会数理モデリング", "喜多村 正仁", "8109")
        ],
        4: [
            course(4, 2, 3, "高度応用情報科学概論2", "藤本 忠彦", "8101"),
            course(4, 5, 6, "情報数学2", "喜多村 正仁", "8202")
        ],
        5: [
            course(5, 2, 3, "情報ネットワーク", "西松 研", "1231"),
            course(5, 5, 6, "データサイエンス入門", "徐 春暉", "8207")
        ],
        6: []
    };
    const electives = {
        A: course(5, 7, 8, "総合学際科目「科学哲学―科学とはどのような活動か」", "吉田 聡", "7201", "科学哲学"),
        B: course(5, 7, 8, "課題探求セミナー「映画における恐怖の歴史」", "濱野 志保", "5305", "映画における恐怖の歴史")
    };
    const unsetElective = {
        day: 5, firstPeriod: 7, lastPeriod: 8, start: "15:00", end: "17:00",
        subject: "選択授業が未設定です", pending: true
    };

    function getClasses(day, elective) {
        return day === 5
            ? [...timetable[5], electives[elective] || unsetElective]
            : (timetable[day] || []);
    }

    function dateKey(now = new Date()) {
        return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    function addDays(date, count) {
        return new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
    }

    function dayOfWeek(date) {
        return new Date(`${date}T00:00:00Z`).getUTCDay();
    }

    function classTimes(classData, date) {
        const start = Date.parse(`${date}T${classData.start}:00+09:00`);
        const end = Date.parse(`${date}T${classData.end}:00+09:00`);
        return { start, end, open: start - OPEN_MINUTES * 60000, close: end + CLOSE_MINUTES * 60000 };
    }

    function getClassState(classData, date, now = new Date()) {
        if (classData.pending) {
            return { type: "next", label: "未設定", status: "金曜日7〜8限の授業を選択してください。", buttonText: "授業を選ぶ", disabled: true, progress: 0 };
        }
        const { start, end, open, close } = classTimes(classData, date);
        const time = now.getTime();
        const progress = Math.min(100, Math.max(0, (time - start) / (end - start) * 100));
        if (time < open) {
            return { type: "next", label: "開始前", status: "出席受付は授業開始10分前からです。", buttonText: "受付前", disabled: true, progress };
        }
        if (time > close) {
            return { type: "ended", label: "受付終了", status: "この授業の出席受付は終了しました。", buttonText: "受付終了", disabled: true, progress };
        }
        const during = time >= start && time < end;
        const status = time < start ? "授業開始前・出席受付中" : during ? "授業中・出席受付中" : "授業終了後・出席受付中";
        return { type: during ? "current" : "ready", label: "受付中", status: `${status}（終了20分後まで）`, buttonText: "出席する", disabled: false, progress };
    }

    function getCurrentAndNext(now, elective) {
        let current = null;
        let next = null;
        const today = dateKey(now);
        for (let offset = 0; offset <= 7; offset += 1) {
            const date = addDays(today, offset);
            for (const classData of getClasses(dayOfWeek(date), elective)) {
                const { start, end } = classTimes(classData, date);
                if (now.getTime() >= start && now.getTime() < end) current = { classData, date };
                if (!next && start > now.getTime()) next = { classData, date };
            }
        }
        return { current, next };
    }

    function getAttendanceUrl(classData) {
        if (!/^[0-9]+$/.test(classData.roomCode)) throw new Error("教室番号は半角数字で指定してください。");
        return ATTENDANCE_BASE_URL + encodeURIComponent(classData.roomCode);
    }

    return { ATTENDANCE_BASE_URL, OPEN_MINUTES, CLOSE_MINUTES, ELECTIVE_KEY, DAY_NAMES, PERIODS,
        timetable, electives, getClasses, dateKey, addDays, dayOfWeek, classTimes, getClassState, getCurrentAndNext, getAttendanceUrl };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AttendanceSchedule;
