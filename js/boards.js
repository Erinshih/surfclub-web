/* =========================================================
   檔案：js/boards.js
   本學期榜單：下水王、新生下水王、進步王、開燈王、關燈王、全天王、Surf Level
   ========================================================= */

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  formatLevel,
  getLevel
} from "./levels.js";

import {
  escapeHtml,
  getAcademicYearStart,
  getInitial,
  getJoinDate,
  getProfile,
  getSemesterStart,
  loadLevelHistory,
  toDateString
} from "./member-card.js";

const TOP_COUNT = 5;

/* =========================================================
   讀取資料
   ========================================================= */

/*
 * 每位社員讀取：本學期的打卡紀錄、全部升級紀錄
 */
async function loadMemberStats(db) {
  const semesterStart =
    getSemesterStart();

  const semesterStartText =
    toDateString(semesterStart);

  const academicYearStart =
    getAcademicYearStart();

  const snapshot =
    await getDocs(
      query(
        collection(db, "users"),
        where("status", "==", "approved")
      )
    );

  return Promise.all(
    snapshot.docs.map(async (documentSnapshot) => {
      const data =
        documentSnapshot.data();

      const [checkinSnapshot, history] =
        await Promise.all([
          getDocs(
            query(
              collection(db, "users", documentSnapshot.id, "checkins"),
              where("date", ">=", semesterStartText)
            )
          ),
          loadLevelHistory(db, documentSnapshot.id)
        ]);

      const checkins =
        checkinSnapshot.docs.map((checkin) => checkin.data());

      const level =
        getLevel(data.level);

      const joinDate =
        getJoinDate(data);

      return {
        uid: documentSnapshot.id,
        data,
        level,
        isFreshman: Boolean(joinDate && joinDate >= academicYearStart),

        sessions: checkins.length,

        dawnSessions: checkins.filter((checkin) => checkin.dawn === true).length,

        duskSessions: checkins.filter((checkin) => checkin.dusk === true).length,

        /*
         * 同一天開燈又關燈
         */
        allDaySessions: checkins.filter((checkin) =>
          checkin.dawn === true &&
          checkin.dusk === true
        ).length,

        levelUps: history.filter((item) =>
          Number(item.levelValue) > 0 &&
          item.unlockedAt?.toDate?.() >= semesterStart
        ).length,

        /*
         * 達到目前等級的時間，同等級時先到的排前面
         */
        reachedLevelAt:
          history
            .find((item) => Number(item.levelValue) === level?.value)
            ?.unlockedAt
            ?.toDate?.()
            ?.getTime() ?? Infinity
      };
    })
  );
}

/* =========================================================
   榜單定義
   ========================================================= */

/*
 * joinHint：自己還沒上榜時的提示（沒有就不顯示）
 */
const BOARDS = [
  {
    id: "sessions",
    emoji: "🌊",
    title: "本學期下水王",
    description: "本學期打卡次數最多",
    unit: "次",
    joinHint: "打一次卡就能上榜！",
    value: (member) => member.sessions
  },
  {
    id: "freshman",
    emoji: "🐣",
    title: "新生下水王",
    description: "今年入社的新生裡最常下水",
    unit: "次",
    joinHint: "打一次卡就能上榜！",
    filter: (member) => member.isFreshman,
    value: (member) => member.sessions
  },
  {
    id: "progress",
    emoji: "📈",
    title: "本學期進步王",
    description: "本學期升最多級",
    unit: "級",
    joinHint: "升一級就能上榜！",
    value: (member) => member.levelUps
  },
  {
    id: "dawn",
    emoji: "🌅",
    title: "開燈王",
    description: "本學期開燈次數最多",
    unit: "次",
    joinHint: "打卡時勾「開燈」就能上榜！",
    value: (member) => member.dawnSessions
  },
  {
    id: "dusk",
    emoji: "🌇",
    title: "關燈王",
    description: "本學期關燈次數最多",
    unit: "次",
    joinHint: "打卡時勾「關燈」就能上榜！",
    value: (member) => member.duskSessions
  },
  {
    id: "allDay",
    emoji: "☀️",
    title: "全天王",
    description: "同一天開燈又關燈，從早泡到晚",
    unit: "次",
    joinHint: "同一天開燈又關燈就能上榜！",
    value: (member) => member.allDaySessions
  },
  {
    id: "level",
    emoji: "🏄",
    title: "Surf Level",
    description: "目前等級最高的社員",
    value: (member) => member.level?.value || 0,
    tieBreak: (first, second) => first.reachedLevelAt - second.reachedLevelAt,
    formatValue: (member) => formatLevel(member.level),
    sharedRank: false
  }
];

/*
 * 同分同名次；值是 0 的人不上榜
 */
function rankMembers(board, members) {
  const ranked =
    members
      .filter((member) => (board.filter ? board.filter(member) : true))
      .map((member) => ({ member, value: board.value(member) }))
      .filter((entry) => entry.value > 0)
      .sort((first, second) =>
        second.value - first.value ||
        (board.tieBreak ? board.tieBreak(first.member, second.member) : 0) ||
        String(first.member.data.name || "").localeCompare(
          String(second.member.data.name || ""),
          "zh-Hant"
        )
      );

  ranked.forEach((entry, index) => {
    const previous =
      ranked[index - 1];

    entry.rank =
      board.sharedRank !== false &&
      previous &&
      previous.value === entry.value
        ? previous.rank
        : index + 1;
  });

  return ranked;
}

/* =========================================================
   畫面
   ========================================================= */

export async function renderBoards(db, container, currentUid) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <p class="empty-state">
      正在統計本學期榜單……
    </p>
  `;

  try {
    const members =
      await loadMemberStats(db);

    const me =
      members.find((member) => member.uid === currentUid);

    container.innerHTML =
      BOARDS
        .map((board) =>
          renderBoard(board, rankMembers(board, members), me)
        )
        .join("");
  } catch (error) {
    console.error(
      "榜單載入失敗：",
      error
    );

    container.innerHTML = `
      <p class="status-message error">
        榜單載入失敗：${escapeHtml(error?.message || "未知錯誤")}
      </p>
    `;
  }
}

function renderBoard(board, ranked, me) {
  const top =
    ranked.slice(0, TOP_COUNT);

  const currentUid =
    me?.uid;

  return `
    <article class="board-card">
      <header class="board-card-header">
        <span class="board-card-emoji">${board.emoji}</span>

        <div>
          <h3>${escapeHtml(board.title)}</h3>
          <p>${escapeHtml(board.description)}</p>
        </div>
      </header>

      ${top.length > 0
        ? `<ol class="board-list">
            ${top.map((entry) => renderBoardRow(board, entry, currentUid)).join("")}
          </ol>`
        : `<p class="board-empty">還沒有人上榜，下一個就是你 👀</p>`}

      ${renderMyRank(board, ranked, me)}
    </article>
  `;
}

function renderBoardRow(board, entry, currentUid) {
  const { member, rank } = entry;

  const nickname =
    getProfile(member.data).nickname;

  const medal =
    ["🥇", "🥈", "🥉"][rank - 1] || rank;

  return `
    <li class="board-row ${member.uid === currentUid ? "is-me" : ""}">
      <span class="board-rank">${medal}</span>

      <span
        class="character-avatar"
        style="--level-color: ${member.level?.color || "#8a9ea1"}"
        aria-hidden="true"
      >
        ${escapeHtml(getInitial(member.data))}
      </span>

      <span class="board-name">
        <strong>${escapeHtml(member.data.name || "未命名社員")}</strong>
        ${nickname ? `<small>${escapeHtml(nickname)}</small>` : ""}
      </span>

      <span class="board-value">
        ${board.formatValue
          ? escapeHtml(board.formatValue(member))
          : `<strong>${entry.value}</strong> ${board.unit}`}
      </span>
    </li>
  `;
}

/*
 * 自己不在前 5 名時，告訴他差多少
 */
function renderMyRank(board, ranked, me) {
  if (!me) {
    return "";
  }

  const myIndex =
    ranked.findIndex((entry) => entry.member.uid === me.uid);

  if (myIndex >= 0 && myIndex < TOP_COUNT) {
    return "";
  }

  if (myIndex < 0) {
    const canJoin =
      board.joinHint &&
      (board.filter ? board.filter(me) : true);

    return canJoin
      ? `<p class="board-my-rank">你還沒上榜，${escapeHtml(board.joinHint)}</p>`
      : "";
  }

  const mine =
    ranked[myIndex];

  if (board.formatValue) {
    return `<p class="board-my-rank">你目前第 <strong>${mine.rank}</strong> 名</p>`;
  }

  /*
   * 追上前一個名次需要的差距（同分就同名次）
   */
  const target =
    ranked
      .slice(0, myIndex)
      .reverse()
      .find((entry) => entry.value > mine.value);

  return `
    <p class="board-my-rank">
      你目前第 <strong>${mine.rank}</strong> 名${target
        ? `，再 ${target.value - mine.value} ${board.unit}就能追上第 ${target.rank} 名`
        : ""}
    </p>
  `;
}
