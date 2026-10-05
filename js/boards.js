/* =========================================================
   檔案：js/boards.js
   本期榜單：下水王、新生下水王、進步王、開燈王、關燈王、全天王、Surf Level
   歷屆榜單：管理員結算時，把這一期的榜單和積分排名封存在 boardArchives
   ========================================================= */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  formatLevel,
  getLevel,
  getLevelByValue
} from "./levels.js";

import {
  escapeHtml,
  getAcademicYearStart,
  getInitial,
  getJoinDate,
  getProfile,
  loadLevelHistory,
  parseDateString,
  toDateString
} from "./member-card.js";

import {
  buildFamilyTotals,
  getBonusPoints,
  getTotalPoints
} from "./points.js";

import {
  getBoardStats,
  getPeriod,
  hasCurrentBoardStats,
  loadPeriod,
  refreshBoardStats
} from "./board-stats.js";

const TOP_COUNT = 5;

/* =========================================================
   讀取資料
   ========================================================= */

/*
 * 只讀社員名單，統計直接用 users/{uid}.boardStats
 */
async function loadMembers(db) {
  const snapshot =
    await getDocs(
      query(
        collection(db, "users"),
        where("status", "==", "approved")
      )
    );

  return snapshot.docs.map((documentSnapshot) => ({
    uid: documentSnapshot.id,
    data: documentSnapshot.data()
  }));
}

function toRankingMember({ uid, data }) {
  const stats =
    getBoardStats(data);

  const joinDate =
    getJoinDate(data);

  return {
    uid,
    data,
    level: getLevel(data.level),
    isFreshman: Boolean(joinDate && joinDate >= getAcademicYearStart(parseDateString(getPeriod().start))),
    sessions: stats.sessions,
    dawnSessions: stats.dawn,
    duskSessions: stats.dusk,
    allDaySessions: stats.allDay,
    levelUps: stats.levelUps,

    /*
     * 達到目前等級的時間，同等級時先到的排前面
     */
    reachedLevelAt: stats.reachedLevelAt ?? Infinity
  };
}

/*
 * 管理員：幫統計缺少或過期的社員重新計算
 * （all = true 時全部重算）
 */
async function refreshMembers(db, members, all, onProgress) {
  const targets =
    all
      ? members
      : members.filter((member) => !hasCurrentBoardStats(member.data));

  let done = 0;

  await Promise.all(
    targets.map(async (member) => {
      await refreshBoardStats(db, member.uid, member.data);

      done += 1;
      onProgress?.(done, targets.length);
    })
  );

  return targets.length;
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
    title: "本期下水王",
    archiveTitle: "下水王",
    description: "這一期打卡次數最多",
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
    title: "本期進步王",
    archiveTitle: "進步王",
    description: "這一期升最多級",
    unit: "級",
    joinHint: "升一級就能上榜！",
    value: (member) => member.levelUps
  },
  {
    id: "dawn",
    emoji: "🌅",
    title: "開燈王",
    description: "這一期開燈次數最多",
    unit: "次",
    joinHint: "打卡時勾「開燈」就能上榜！",
    value: (member) => member.dawnSessions
  },
  {
    id: "dusk",
    emoji: "🌇",
    title: "關燈王",
    description: "這一期關燈次數最多",
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

export async function renderBoards(db, container, currentUid, options = {}) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <p class="empty-state">
      正在統計本期榜單……
    </p>
  `;

  try {
    const [members, period] =
      await Promise.all([
        loadMembers(db),
        loadPeriod(db)
      ]);

    if (options.periodNote) {
      options.periodNote.textContent =
        `${period.label ? `${period.label}｜` : ""}從 ${period.start.replaceAll("-", "/")} 開始計算`;
    }

    if (options.isAdmin) {
      await refreshMembers(
        db,
        members,
        Boolean(options.refreshAll),
        (done, total) => {
          container.innerHTML = `
            <p class="empty-state">
              正在更新社員統計……（${done} / ${total}）
            </p>
          `;
        }
      );
    }

    const rankingMembers =
      members.map(toRankingMember);

    const me =
      rankingMembers.find((member) => member.uid === currentUid);

    container.innerHTML =
      BOARDS
        .map((board) =>
          renderBoard(board, rankMembers(board, rankingMembers), me)
        )
        .join("") +
      (options.isAdmin
        ? `<p class="board-admin-note">
            管理員：統計會在社員打卡時自動更新。新增升級紀錄後，
            <button class="link-button" type="button" data-refresh-boards>重新計算所有人</button>
            就會反映到進步王和 Surf Level。要換下一期，請到
            <a href="./admin-settle.html">排行榜結算</a>。
          </p>`
        : "");

    container
      .querySelector("[data-refresh-boards]")
      ?.addEventListener(
        "click",
        () => renderBoards(db, container, currentUid, { ...options, refreshAll: true })
      );
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

/* =========================================================
   結算與歷屆榜單
   ========================================================= */

const ARCHIVE_COLLECTION = "boardArchives";

const POINTS_TOP_COUNT = 10;

/*
 * 從原始的打卡和升級紀錄，算出 [start, end) 這段期間的統計
 */
async function computePeriodMembers(db, members, start, end) {
  const startText =
    toDateString(start);

  const endText =
    toDateString(end);

  const academicYearStart =
    getAcademicYearStart(start);

  return Promise.all(
    members.map(async ({ uid, data }) => {
      const [checkinSnapshot, history] =
        await Promise.all([
          getDocs(
            query(
              collection(db, "users", uid, "checkins"),
              where("date", ">=", startText),
              where("date", "<", endText)
            )
          ),
          loadLevelHistory(db, uid)
        ]);

      const checkins =
        checkinSnapshot.docs.map((checkin) => checkin.data());

      const unlockedAt = (item) =>
        item.unlockedAt?.toDate?.() || null;

      /*
       * 期末的等級：結束前最後一筆升級紀錄
       */
      const beforeEnd =
        history.filter((item) => unlockedAt(item) && unlockedAt(item) < end);

      const lastEntry =
        beforeEnd[beforeEnd.length - 1];

      /*
       * 完全沒有升級紀錄的社員（等級是直接在後台設定的），
       * 就用目前的等級
       */
      const level =
        lastEntry
          ? getLevelByValue(Number(lastEntry.levelValue))
          : history.length === 0
            ? getLevel(data.level)
            : null;

      const reachedLevelAt =
        level
          ? beforeEnd
            .find((item) => Number(item.levelValue) === level.value)
            ?.unlockedAt
            ?.toDate?.()
            ?.getTime()
          : null;

      const joinDate =
        getJoinDate(data);

      return {
        uid,
        data,
        level,
        isFreshman: Boolean(
          joinDate &&
          joinDate >= academicYearStart &&
          joinDate < end
        ),
        sessions: checkins.length,
        dawnSessions: checkins.filter((checkin) => checkin.dawn === true).length,
        duskSessions: checkins.filter((checkin) => checkin.dusk === true).length,
        allDaySessions: checkins.filter((checkin) => checkin.dawn === true && checkin.dusk === true).length,
        levelUps: history.filter((item) =>
          Number(item.levelValue) > 0 &&
          unlockedAt(item) >= start &&
          unlockedAt(item) < end
        ).length,
        reachedLevelAt: reachedLevelAt ?? Infinity
      };
    })
  );
}

function toArchiveEntry(member, value, rank, text = "") {
  return {
    uid: member.uid,
    name: member.data.name || "未命名社員",
    nickname: getProfile(member.data).nickname,
    levelValue: getLevel(member.data.level)?.value || 0,
    value,
    rank,
    text
  };
}

/*
 * 同分同名次
 */
function withSharedRank(items) {
  items.forEach((item, index) => {
    const previous =
      items[index - 1];

    item.rank =
      previous && previous.value === item.value
        ? previous.rank
        : index + 1;
  });

  return items;
}

function buildPointsRanking(members) {
  return withSharedRank(
    members
      .map((member) => ({ member, value: getTotalPoints(member.data) }))
      .filter((item) => item.value > 0)
      .sort((first, second) =>
        second.value - first.value ||
        String(first.member.data.name || "").localeCompare(String(second.member.data.name || ""), "zh-Hant")
      )
  )
    .slice(0, POINTS_TOP_COUNT)
    .map((item) => toArchiveEntry(item.member, item.value, item.rank));
}

/*
 * 家系積分：每家積分最高的 N 人加總（規則在 points.js）
 */
function buildFamilyRanking(members) {
  return withSharedRank(
    buildFamilyTotals(members).map((family) => ({
      name: family.name,
      value: family.value,
      memberCount: family.memberCount
    }))
  );
}

/*
 * 結算：封存 [這一期的起始日, endDate] 的榜單和積分排名，
 * 下一期從 endDate 的隔天開始。不會改動任何人的積分。
 */
export async function settlePeriod(db, { label, endDate, nextLabel }) {
  const period =
    await loadPeriod(db, { force: true });

  const start =
    parseDateString(period.start);

  start.setHours(0, 0, 0, 0);

  /*
   * endDate 當天也算進這一期
   */
  const end =
    parseDateString(endDate);

  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);

  if (end <= start) {
    throw new Error(`結算日不能早於這一期的起始日（${period.start}）。`);
  }

  const members =
    await loadMembers(db);

  const rankingMembers =
    await computePeriodMembers(db, members, start, end);

  const nextStart =
    toDateString(end);

  const archive = {
    semester: period.start,
    end: endDate,
    label: label || period.label || `${period.start} ~ ${endDate}`,
    createdAt: serverTimestamp(),

    boards: BOARDS.map((board) => ({
      id: board.id,
      emoji: board.emoji,
      title: board.archiveTitle || board.title.replace("本期", ""),
      unit: board.unit || "",
      entries:
        rankMembers(board, rankingMembers)
          .slice(0, TOP_COUNT)
          .map((entry) =>
            toArchiveEntry(
              entry.member,
              entry.value,
              entry.rank,
              board.formatValue ? board.formatValue(entry.member) : ""
            )
          )
    })),

    points: buildPointsRanking(members),

    families: buildFamilyRanking(members),

    /*
     * 還原用：下一期的起始日、結算當時每個人的積分
     */
    nextStart,

    pointsSnapshot: Object.fromEntries(
      members.map((member) => [
        member.uid,
        {
          points: getBonusPoints(member.data),
          since: member.data.pointsSince || null
        }
      ])
    )
  };

  await setDoc(
    doc(db, ARCHIVE_COLLECTION, `${period.start}_${endDate}`),
    archive
  );

  await setDoc(
    doc(db, "settings", "leaderboard"),
    {
      periodStart: nextStart,
      periodLabel: nextLabel || "",
      updatedAt: serverTimestamp()
    }
  );

  await loadPeriod(db, { force: true });

  return { archive, members, nextStart };
}

/*
 * 批次更新社員資料：[[uid, { 欄位 }], ...]（一次最多寫 400 筆）
 */
async function writeMemberFields(db, entries) {
  for (let index = 0; index < entries.length; index += 400) {
    const batch =
      writeBatch(db);

    entries.slice(index, index + 400).forEach(([uid, fields]) => {
      batch.update(
        doc(db, "users", uid),
        {
          ...fields,
          updatedAt: serverTimestamp()
        }
      );
    });

    await batch.commit();
  }
}

/*
 * 歸零：幹部加分改成 0，自動積分從 since 這天重新累積
 */
export async function resetPoints(db, uids, since) {
  await writeMemberFields(
    db,
    uids.map((uid) => [uid, { points: 0, pointsSince: since }])
  );
}

/*
 * 結算當時的積分快照；舊版只存了一個數字
 */
function getSnapshotEntry(archive, uid) {
  const value =
    archive.pointsSnapshot?.[uid];

  if (value === undefined) {
    return null;
  }

  return typeof value === "number"
    ? { points: value, since: undefined }
    : value;
}

function isSnapshotDifferent(snapshot, data) {
  return (
    snapshot.points !== getBonusPoints(data) ||
    (snapshot.since !== undefined && (snapshot.since || null) !== (data.pointsSince || null))
  );
}

/*
 * 找出最近一次結算：結算後的下一期起始日 = 目前這一期的起始日
 */
export async function findLatestSettlement(db) {
  const period =
    await loadPeriod(db, { force: true });

  const snapshot =
    await getDocs(collection(db, ARCHIVE_COLLECTION));

  const archives =
    snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }));

  return archives.find((archive) => {
    if (archive.nextStart) {
      return archive.nextStart === period.start;
    }

    /*
     * 舊的封存沒有 nextStart，用結算日的隔天推算
     */
    const end =
      parseDateString(archive.end);

    if (!end) {
      return false;
    }

    end.setDate(end.getDate() + 1);

    return toDateString(end) === period.start;
  }) || null;
}

/*
 * 還原最近一次結算：
 * 1. 這一期改回結算前的名稱和起始日
 * 2. （選擇）積分改回結算當時的分數
 * 3. 刪除那一次的封存
 */
export async function undoSettlement(db, archive, { restorePoints = false, members = [] } = {}) {
  let restoredUids = [];

  if (restorePoints && archive.pointsSnapshot) {
    const changes =
      getChangedPoints(archive, members)
        .map((member) => {
          const snapshot =
            getSnapshotEntry(archive, member.uid);

          const fields =
            { points: snapshot.points };

          if (snapshot.since !== undefined) {
            fields.pointsSince = snapshot.since;
          }

          return [member.uid, fields];
        });

    await writeMemberFields(db, changes);

    restoredUids =
      changes.map(([uid]) => uid);
  }

  await setDoc(
    doc(db, "settings", "leaderboard"),
    {
      periodStart: archive.semester,
      periodLabel: archive.label || "",
      updatedAt: serverTimestamp()
    }
  );

  await deleteDoc(doc(db, ARCHIVE_COLLECTION, archive.id));

  await loadPeriod(db, { force: true });

  return { restoredCount: restoredUids.length, restoredUids };
}

/*
 * 跟結算當時相比，積分（幹部加分或起算日）不一樣的社員
 */
export function getChangedPoints(archive, members) {
  if (!archive?.pointsSnapshot) {
    return [];
  }

  return members.filter((member) => {
    const snapshot =
      getSnapshotEntry(archive, member.uid);

    return snapshot && isSnapshotDifferent(snapshot, member.data);
  });
}

export function getSnapshotPoints(archive, uid) {
  return getSnapshotEntry(archive, uid)?.points ?? 0;
}

export { loadMembers };

/* =========================================================
   歷屆榜單畫面
   ========================================================= */

export async function renderArchiveSection(db, section, currentUid, options = {}) {
  if (!section) {
    return;
  }

  const select =
    section.querySelector("[data-archive-select]");

  const grid =
    section.querySelector("[data-archive-grid]");

  try {
    const snapshot =
      await getDocs(collection(db, ARCHIVE_COLLECTION));

    const archives =
      snapshot.docs
        .map((documentSnapshot) => documentSnapshot.data())
        .filter((archive) =>
          (Array.isArray(archive.boards) && archive.boards.some((board) => board.entries?.length > 0)) ||
          archive.points?.length > 0 ||
          archive.families?.length > 0
        )
        .sort((first, second) =>
          String(second.end || second.semester).localeCompare(String(first.end || first.semester))
        );

    if (archives.length === 0) {
      section.hidden = !options.isAdmin;
      grid.innerHTML = `<p class="board-empty">還沒有歷屆榜單，管理員結算第一期之後就會出現。</p>`;
      select.hidden = true;
      return;
    }

    section.hidden = false;
    select.hidden = false;

    select.innerHTML =
      archives
        .map((archive, index) => `
          <option value="${index}">${escapeHtml(archive.label || archive.semester)}</option>
        `)
        .join("");

    const show = () => {
      const archive =
        archives[Number(select.value)];

      grid.innerHTML =
        (archive.boards || [])
          .map((board) => renderArchiveBoard(board, currentUid))
          .join("") +
        (archive.points
          ? renderArchiveBoard(
            { emoji: "⭐", title: "個人積分", unit: "分", entries: archive.points },
            currentUid
          )
          : "") +
        (archive.families
          ? renderFamilyArchive(archive.families)
          : "");
    };

    select.onchange = show;
    show();
  } catch (error) {
    console.error(
      "歷屆榜單載入失敗：",
      error
    );

    section.hidden = !options.isAdmin;

    grid.innerHTML = `
      <p class="status-message error">
        歷屆榜單載入失敗：${escapeHtml(error?.message || "未知錯誤")}
      </p>
    `;
  }
}

function renderArchiveBoard(board, currentUid) {
  const entries =
    board.entries || [];

  return `
    <article class="board-card">
      <header class="board-card-header">
        <span class="board-card-emoji">${escapeHtml(board.emoji)}</span>

        <div>
          <h3>${escapeHtml(board.title)}</h3>
        </div>
      </header>

      ${entries.length > 0
        ? `<ol class="board-list">
            ${entries.map((entry) => {
              const level =
                getLevelByValue(Number(entry.levelValue));

              const medal =
                ["🥇", "🥈", "🥉"][entry.rank - 1] || entry.rank;

              return `
                <li class="board-row ${entry.uid === currentUid ? "is-me" : ""}">
                  <span class="board-rank">${medal}</span>

                  <span
                    class="character-avatar"
                    style="--level-color: ${level?.color || "#8a9ea1"}"
                    aria-hidden="true"
                  >
                    ${escapeHtml(Array.from(entry.nickname || entry.name || "?")[0])}
                  </span>

                  <span class="board-name">
                    <strong>${escapeHtml(entry.name)}</strong>
                    ${entry.nickname ? `<small>${escapeHtml(entry.nickname)}</small>` : ""}
                  </span>

                  <span class="board-value">
                    ${entry.text
                      ? escapeHtml(entry.text)
                      : `<strong>${Number(entry.value)}</strong> ${escapeHtml(board.unit)}`}
                  </span>
                </li>
              `;
            }).join("")}
          </ol>`
        : `<p class="board-empty">這一期沒有人上榜。</p>`}
    </article>
  `;
}

function renderFamilyArchive(families) {
  return `
    <article class="board-card">
      <header class="board-card-header">
        <span class="board-card-emoji">🏠</span>

        <div>
          <h3>家系積分</h3>
        </div>
      </header>

      ${families.length > 0
        ? `<ol class="board-list">
            ${families.map((family) => `
              <li class="board-row">
                <span class="board-rank">${["🥇", "🥈", "🥉"][family.rank - 1] || family.rank}</span>

                <span class="board-name">
                  <strong>${escapeHtml(family.name)}</strong>
                  <small>${Number(family.memberCount)} 位社員</small>
                </span>

                <span class="board-value">
                  <strong>${Number(family.value)}</strong> 分
                </span>
              </li>
            `).join("")}
          </ol>`
        : `<p class="board-empty">這一期沒有家系資料。</p>`}
    </article>
  `;
}
