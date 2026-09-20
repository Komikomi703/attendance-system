const test = require("node:test");
const assert = require("node:assert/strict");
const schedule = require("../timetable.js");
const at = value => new Date(value + "+09:00");

test("全時限と2026年度後期の全授業が指定データと一致する", () => {
    assert.deepEqual(schedule.PERIODS.map(p => [p.period, p.start, p.end]), [
        [1, "09:00", "10:00"], [2, "10:00", "11:00"], [3, "11:00", "12:00"],
        [4, "12:00", "13:00"], [5, "13:00", "14:00"], [6, "14:00", "15:00"],
        [7, "15:00", "16:00"], [8, "16:00", "17:00"], [9, "17:00", "18:00"], [10, "18:00", "19:00"]
    ]);
    const expected = [
        [2, "NWプログラミング応用演習", "屋代 智之", "1232", 6, 9, "14:00", "18:00"],
        [3, "OSとシステムソフトウェア", "伊集院 大将", "8103", 2, 3, "10:00", "12:00"],
        [3, "統計解析", "星野 慶介", "7201", 5, 6, "13:00", "15:00"],
        [3, "社会数理モデリング", "喜多村 正仁", "8109", 7, 8, "15:00", "17:00"],
        [4, "高度応用情報科学概論2", "藤本 忠彦", "8101", 2, 3, "10:00", "12:00"],
        [4, "情報数学2", "喜多村 正仁", "8202", 5, 6, "13:00", "15:00"],
        [5, "情報ネットワーク", "西松 研", "1231", 2, 3, "10:00", "12:00"],
        [5, "データサイエンス入門", "徐 春暉", "8207", 5, 6, "13:00", "15:00"],
        [5, "総合学際科目「科学哲学―科学とはどのような活動か」", "吉田 聡", "7201", 7, 8, "15:00", "17:00"],
        [5, "課題探求セミナー「映画における恐怖の歴史」", "濱野 志保", "5305", 7, 8, "15:00", "17:00"]
    ];
    const classes = [...Object.values(schedule.timetable).flat(), ...Object.values(schedule.electives)];
    assert.deepEqual(classes.map(c => [c.day, c.subject, c.teacher, c.roomCode, c.firstPeriod, c.lastPeriod, c.start, c.end]), expected);
    for (const c of classes) {
        assert.equal(c.room, c.roomCode + " 講義室");
        assert.equal(c.campus, "新習志野キャンパス");
        assert.equal(schedule.getAttendanceUrl(c), "https://attendance.is.chibatech.ac.jp/attendance/class_room/" + c.roomCode);
    }
});

test("全授業で開始10分前と終了20分後の境界をミリ秒単位で判定する", () => {
    for (const c of [...Object.values(schedule.timetable).flat(), ...Object.values(schedule.electives)]) {
        const date = schedule.addDays("2026-09-20", c.day);
        const start = Date.parse(`${date}T${c.start}:00+09:00`);
        const end = Date.parse(`${date}T${c.end}:00+09:00`);
        for (const [time, disabled, label] of [
            [start - 600001, true, "開始前"], [start - 600000, false, "受付中"],
            [start, false, "受付中"], [end, false, "受付中"],
            [end + 1200000, false, "受付中"], [end + 1200001, true, "受付終了"]
        ]) {
            const state = schedule.getClassState(c, date, new Date(time));
            assert.equal(state.disabled, disabled, `${c.subject} ${new Date(time).toISOString()}`);
            assert.equal(state.label, label);
        }
        assert.equal(schedule.getClassState(c, schedule.addDays(date, 1), new Date(start)).disabled, true);
    }
});

test("未設定・A・Bのいずれも金曜7〜8限は1枠のみ", () => {
    for (const value of [null, "invalid", "A", "B"]) {
        const friday = schedule.getClasses(5, value);
        assert.equal(friday.length, 3);
        const elective = friday[2];
        if (value === "A" || value === "B") assert.equal(elective, schedule.electives[value]);
        else {
            assert.equal(elective.pending, true);
            assert.equal(schedule.getClassState(elective, "2026-09-25", at("2026-09-25T16:00:00")).disabled, true);
        }
    }
});

test("現在・次の授業は連続授業の境界、選択変更、週末・月曜を正しく処理する", () => {
    let focus = schedule.getCurrentAndNext(at("2026-09-22T14:00:00"), null);
    assert.equal(focus.current.classData.subject, "NWプログラミング応用演習");
    assert.equal(focus.next.date, "2026-09-23");
    focus = schedule.getCurrentAndNext(at("2026-09-23T15:00:00"), null);
    assert.equal(focus.current.classData.subject, "社会数理モデリング");
    assert.equal(focus.next.classData.subject, "高度応用情報科学概論2");
    for (const value of ["A", "B"]) {
        assert.equal(schedule.getCurrentAndNext(at("2026-09-25T14:00:00"), value).next.classData, schedule.electives[value]);
        assert.equal(schedule.getCurrentAndNext(at("2026-09-25T15:00:00"), value).current.classData, schedule.electives[value]);
    }
    for (const date of ["2026-09-25T17:00:00", "2026-09-26T10:00:00", "2026-09-27T10:00:00", "2026-09-28T10:00:00"]) {
        focus = schedule.getCurrentAndNext(at(date), "B");
        assert.equal(focus.current, null);
        assert.equal(focus.next.date, "2026-09-29");
        assert.equal(focus.next.classData.roomCode, "1232");
    }
    for (const day of [0, 1, 6]) assert.deepEqual(schedule.getClasses(day, "A"), []);
});

test("日本時間の日付はUTCの日付・端末のタイムゾーンに依存しない", () => {
    const now = new Date("2026-09-27T15:00:00Z");
    assert.equal(schedule.dateKey(now), "2026-09-28");
    assert.equal(schedule.dayOfWeek(schedule.dateKey(now)), 1);
    assert.equal(schedule.getCurrentAndNext(now, null).next.date, "2026-09-29");
});

test("教室名、空白、全角数字、不正なURL断片はURL生成に使えない", () => {
    for (const roomCode of ["1232 講義室", " 1232", "５３０５", "720１", "../1232", "1232?a=b", undefined]) {
        assert.throws(() => schedule.getAttendanceUrl({ roomCode }));
    }
});
